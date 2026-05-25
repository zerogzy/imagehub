"""
ImageHub similarity worker.

This worker computes image fingerprints and similarity candidates without
touching the public gallery API. It pulls assets from dedicated internal API
endpoints, persists fingerprints in batches, and emits candidate pairs in
bucketed batches to avoid O(N^2) behavior.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
import imagehash
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

load_dotenv()

API_URL = os.getenv("API_URL", "http://localhost:3001/api/v1").rstrip("/")
API_TOKEN = (
    os.getenv("WORKER_TOKEN")
    or os.getenv("ADMIN_TOKEN")
    or os.getenv("INTERNAL_API_TOKEN")
    or ""
)
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "./storage"))
WORKER_PORT = int(os.getenv("WORKER_PORT", "8000"))
WORKER_HOST = os.getenv("WORKER_HOST", "0.0.0.0")
WORKER_PAGE_SIZE = int(os.getenv("SIMILARITY_PAGE_SIZE", "200"))
BATCH_SIZE = int(os.getenv("SIMILARITY_BATCH_SIZE", "200"))
CONCURRENT_FINGERPRINTS = max(1, int(os.getenv("SIMILARITY_CONCURRENCY", "4")))
HASH_BAND_SIZE = int(os.getenv("SIMILARITY_HASH_BAND_SIZE", "4"))

EXACT_DUPLICATE_THRESHOLD = 0
HIGHLY_SIMILAR_THRESHOLD = 4
POSSIBLE_VARIANT_THRESHOLD = 10
SAME_TOPIC_THRESHOLD = 18

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("similarity-worker")


@dataclass
class AssetFingerprint:
    asset_id: str
    sha256: Optional[str] = None
    phash: Optional[str] = None
    dhash: Optional[str] = None
    width: int = 0
    height: int = 0
    file_size: int = 0
    sharpness: float = 0.0
    quality_score: int = 0


class ScanRequest(BaseModel):
    job_id: Optional[str] = None
    scan_all: bool = True
    asset_ids: list[str] = Field(default_factory=list)


class SingleScanRequest(BaseModel):
    asset_id: str


class SimilarityEngine:
    def __init__(self, storage_root: Path):
        self.storage_root = storage_root
        self.fingerprints: dict[str, AssetFingerprint] = {}

    def resolve_path(self, storage_key: str) -> Path:
        return self.storage_root / storage_key.lstrip("/")

    def compute_fingerprint(self, asset_id: str, storage_key: str) -> Optional[AssetFingerprint]:
        file_path = self.resolve_path(storage_key)
        if not file_path.exists():
            logger.warning("File not found: %s", file_path)
            return None

        try:
            stat = file_path.stat()
            fingerprint = AssetFingerprint(asset_id=asset_id, file_size=stat.st_size)

            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as file_handle:
                for chunk in iter(lambda: file_handle.read(8192), b""):
                    sha256_hash.update(chunk)
            fingerprint.sha256 = sha256_hash.hexdigest()

            with Image.open(file_path) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                fingerprint.width, fingerprint.height = image.size
                fingerprint.phash = str(imagehash.phash(image))
                fingerprint.dhash = str(imagehash.dhash(image))
                fingerprint.sharpness = self.estimate_sharpness(image)
                fingerprint.quality_score = self.compute_quality_score(fingerprint)

            return fingerprint
        except Exception as error:
            logger.exception("Error computing fingerprint for %s: %s", asset_id, error)
            return None

    def estimate_sharpness(self, image: Image.Image) -> float:
        gray = np.asarray(image.convert("L"), dtype=np.float32)
        if gray.shape[0] < 3 or gray.shape[1] < 3:
            return 0.0

        laplacian = (
            -4.0 * gray[1:-1, 1:-1]
            + gray[:-2, 1:-1]
            + gray[2:, 1:-1]
            + gray[1:-1, :-2]
            + gray[1:-1, 2:]
        )
        return float(laplacian.var())

    def compute_quality_score(self, fingerprint: AssetFingerprint) -> int:
        megapixels = (fingerprint.width * fingerprint.height) / 1_000_000 if fingerprint.width and fingerprint.height else 0.0
        size_mb = fingerprint.file_size / 1_000_000
        sharpness = min(fingerprint.sharpness / 50.0, 30.0)
        score = megapixels * 15.0 + size_mb * 5.0 + sharpness
        return max(0, min(100, int(round(score))))

    def compare(self, fp_a: AssetFingerprint, fp_b: AssetFingerprint) -> dict:
        result = {
            "similarity_type": "unrelated",
            "phash_distance": None,
            "dhash_distance": None,
            "max_similarity": 0.0,
        }

        if fp_a.sha256 and fp_b.sha256 and fp_a.sha256 == fp_b.sha256:
            result["similarity_type"] = "exact_duplicate"
            result["max_similarity"] = 1.0
            return result

        distances: list[int] = []

        if fp_a.phash and fp_b.phash:
            phash_distance = imagehash.hex_to_hash(fp_a.phash) - imagehash.hex_to_hash(fp_b.phash)
            result["phash_distance"] = phash_distance
            distances.append(phash_distance)

        if fp_a.dhash and fp_b.dhash:
            dhash_distance = imagehash.hex_to_hash(fp_a.dhash) - imagehash.hex_to_hash(fp_b.dhash)
            result["dhash_distance"] = dhash_distance
            distances.append(dhash_distance)

        if not distances:
            return result

        min_distance = min(distances)
        result["max_similarity"] = max(0.0, 1.0 - min_distance / 64.0)

        if min_distance <= EXACT_DUPLICATE_THRESHOLD:
            result["similarity_type"] = "exact_duplicate"
        elif min_distance <= HIGHLY_SIMILAR_THRESHOLD:
            result["similarity_type"] = "highly_similar"
        elif min_distance <= POSSIBLE_VARIANT_THRESHOLD:
            result["similarity_type"] = "possible_variant"
        elif min_distance <= SAME_TOPIC_THRESHOLD:
            result["similarity_type"] = "same_topic"

        return result

    def pick_quality_winner(self, fp_a: AssetFingerprint, fp_b: AssetFingerprint) -> str:
        score_a = self.quality_score(fp_a)
        score_b = self.quality_score(fp_b)
        return fp_a.asset_id if score_a >= score_b else fp_b.asset_id

    def quality_score(self, fingerprint: AssetFingerprint) -> float:
        pixels = fingerprint.width * fingerprint.height
        return (
            fingerprint.quality_score
            + pixels / 1_000_000.0
            + fingerprint.file_size / 1_000_000.0
            + fingerprint.sharpness / 1000.0
        )


def canonical_pair(asset_a_id: str, asset_b_id: str) -> tuple[str, str, str]:
    if asset_a_id < asset_b_id:
        a_id = asset_a_id
        b_id = asset_b_id
    else:
        a_id = asset_b_id
        b_id = asset_a_id
    return a_id, b_id, f"{a_id}::{b_id}"


def chunk(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


app = FastAPI(
    title="ImageHub Similarity Worker",
    version="2.0.0",
    description="Bucketed similarity analysis for images",
)

engine = SimilarityEngine(STORAGE_ROOT)


def api_client() -> httpx.AsyncClient:
    headers = {}
    if API_TOKEN:
        headers["X-ImageHub-Token"] = API_TOKEN
    return httpx.AsyncClient(timeout=600, headers=headers)


async def fetch_assets_page(client: httpx.AsyncClient, page: int, page_size: int) -> dict:
    response = await client.get(
        f"{API_URL}/worker/similarity/assets",
        params={"page": page, "pageSize": page_size, "status": "ready", "mediaType": "image"},
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("message") or "Failed to fetch assets")
    return payload


async def post_fingerprints(client: httpx.AsyncClient, fingerprints: list[dict]) -> dict:
    if not fingerprints:
        return {"updated": 0}
    response = await client.post(
        f"{API_URL}/worker/similarity/fingerprints/bulk",
        json={"fingerprints": fingerprints},
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("message") or "Failed to persist fingerprints")
    return payload.get("data") or {}


async def post_candidates(client: httpx.AsyncClient, candidates: list[dict]) -> dict:
    if not candidates:
        return {"created": 0, "updated": 0, "total": 0}
    response = await client.post(
        f"{API_URL}/worker/similarity/candidates/bulk",
        json={"candidates": candidates},
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(payload.get("message") or "Failed to persist candidates")
    return payload.get("data") or {}


async def patch_job(client: httpx.AsyncClient, job_id: str, progress: float, status: Optional[str] = None):
    if not job_id:
        return
    body: dict[str, object] = {"progress": progress}
    if status:
        body["status"] = status
    try:
        await client.patch(f"{API_URL}/admin/jobs/{job_id}", json=body)
    except Exception as error:
        logger.warning("Failed to update job %s: %s", job_id, error)


async def materialize_fingerprint(asset: dict) -> Optional[AssetFingerprint]:
    asset_id = asset["id"]
    has_fingerprint = bool(asset.get("sha256") and asset.get("phash") and asset.get("dhash"))
    if has_fingerprint and asset.get("width") and asset.get("height") and asset.get("qualityScore") is not None:
        return AssetFingerprint(
            asset_id=asset_id,
            sha256=asset.get("sha256"),
            phash=asset.get("phash"),
            dhash=asset.get("dhash"),
            width=int(asset.get("width") or 0),
            height=int(asset.get("height") or 0),
            file_size=int(asset.get("sizeBytes") or 0),
            sharpness=0.0,
            quality_score=int(asset.get("qualityScore") or 0),
        )

    storage_key = asset.get("storageKey") or asset.get("storage_key")
    if not storage_key:
        return None

    return await asyncio.to_thread(engine.compute_fingerprint, asset_id, storage_key)


def build_bucket_keys(prefix: str, hash_value: Optional[str]) -> list[str]:
    if not hash_value:
        return []
    keys = []
    for offset in range(0, len(hash_value), HASH_BAND_SIZE):
        band = hash_value[offset : offset + HASH_BAND_SIZE]
        keys.append(f"{prefix}:{offset // HASH_BAND_SIZE}:{band}")
    return keys


def build_candidate_key(asset_a_id: str, asset_b_id: str) -> str:
    _, _, key = canonical_pair(asset_a_id, asset_b_id)
    return key


def classify_similarity(sha256_equal: bool, phash_distance: Optional[int], dhash_distance: Optional[int]) -> str:
    if sha256_equal:
        return "exact_duplicate"

    distances = [distance for distance in (phash_distance, dhash_distance) if distance is not None]
    if not distances:
        return "unrelated"

    min_distance = min(distances)
    if min_distance <= HIGHLY_SIMILAR_THRESHOLD:
        return "highly_similar"
    if min_distance <= POSSIBLE_VARIANT_THRESHOLD:
        return "possible_variant"
    if min_distance <= SAME_TOPIC_THRESHOLD:
        return "same_topic"
    return "unrelated"


def to_candidate_payload(fp_a: AssetFingerprint, fp_b: AssetFingerprint) -> Optional[dict]:
    sha256_equal = bool(fp_a.sha256 and fp_b.sha256 and fp_a.sha256 == fp_b.sha256)
    comparison = engine.compare(fp_a, fp_b)
    similarity_type = comparison["similarity_type"]
    if similarity_type == "unrelated":
        return None

    return {
        "assetAId": fp_a.asset_id,
        "assetBId": fp_b.asset_id,
        "sha256Equal": sha256_equal,
        "phashDistance": comparison["phash_distance"],
        "dhashDistance": comparison["dhash_distance"],
        "similarityType": similarity_type,
        "qualityWinnerAssetId": engine.pick_quality_winner(fp_a, fp_b),
    }


async def scan_assets(request: ScanRequest) -> dict:
    logger.info("Starting similarity scan: job_id=%s scan_all=%s", request.job_id, request.scan_all)

    fingerprints: dict[str, AssetFingerprint] = {}
    candidate_pairs: set[str] = set()
    sha_groups: defaultdict[str, list[str]] = defaultdict(list)
    bucket_groups: defaultdict[str, list[str]] = defaultdict(list)

    async with api_client() as client:
        target_ids = set(request.asset_ids)
        page = 1
        total_pages = 1
        fingerprints_written = 0
        candidates_created = 0
        candidates_updated = 0

        while page <= total_pages:
            payload = await fetch_assets_page(client, page, WORKER_PAGE_SIZE)
            assets = payload.get("assets", [])
            meta = payload.get("meta", {})
            total_pages = int(meta.get("totalPages") or total_pages)

            page_fingerprints: list[dict] = []
            concurrency_semaphore = asyncio.Semaphore(CONCURRENT_FINGERPRINTS)

            async def compute_one(asset: dict):
                async with concurrency_semaphore:
                    fingerprint = await materialize_fingerprint(asset)
                    if fingerprint is None:
                        return None
                    return asset, fingerprint

            results = await asyncio.gather(*(compute_one(asset) for asset in assets))
            for result in results:
                if result is None:
                    continue
                asset, fingerprint = result
                fingerprints[fingerprint.asset_id] = fingerprint
                engine.fingerprints[fingerprint.asset_id] = fingerprint

                page_fingerprints.append(
                    {
                        "assetId": fingerprint.asset_id,
                        "sha256": fingerprint.sha256,
                        "phash": fingerprint.phash,
                        "dhash": fingerprint.dhash,
                        "width": fingerprint.width,
                        "height": fingerprint.height,
                        "qualityScore": fingerprint.quality_score,
                    }
                )

                if fingerprint.sha256:
                    sha_groups[fingerprint.sha256].append(fingerprint.asset_id)
                for bucket_key in build_bucket_keys("phash", fingerprint.phash):
                    bucket_groups[bucket_key].append(fingerprint.asset_id)
                for bucket_key in build_bucket_keys("dhash", fingerprint.dhash):
                    bucket_groups[bucket_key].append(fingerprint.asset_id)

            fingerprint_result = await post_fingerprints(client, page_fingerprints)
            fingerprints_written += int(fingerprint_result.get("updated", len(page_fingerprints)))
            await patch_job(client, request.job_id, min(95.0, page / max(total_pages, 1) * 60.0))
            page += 1

        for ids in sha_groups.values():
            if len(ids) < 2:
                continue
            for index in range(len(ids)):
                for other_index in range(index + 1, len(ids)):
                    pair_key = build_candidate_key(ids[index], ids[other_index])
                    if target_ids and not (ids[index] in target_ids or ids[other_index] in target_ids):
                        continue
                    candidate_pairs.add(pair_key)

        for ids in bucket_groups.values():
            if len(ids) < 2:
                continue
            for index in range(len(ids)):
                for other_index in range(index + 1, len(ids)):
                    pair_key = build_candidate_key(ids[index], ids[other_index])
                    if target_ids and not (ids[index] in target_ids or ids[other_index] in target_ids):
                        continue
                    candidate_pairs.add(pair_key)

        candidates: list[dict] = []
        seen_candidate_keys: set[str] = set()

        for pair_key in candidate_pairs:
            asset_a_id, asset_b_id = pair_key.split("::", 1)
            fp_a = fingerprints.get(asset_a_id)
            fp_b = fingerprints.get(asset_b_id)
            if fp_a is None or fp_b is None:
                continue

            candidate = to_candidate_payload(fp_a, fp_b)
            if candidate is None:
                continue

            if pair_key in seen_candidate_keys:
                continue
            seen_candidate_keys.add(pair_key)
            candidates.append(candidate)

        candidate_batches = list(chunk(candidates, BATCH_SIZE))
        written = 0
        for batch in candidate_batches:
            candidate_result = await post_candidates(client, batch)
            candidates_created += int(candidate_result.get("created", len(batch)))
            candidates_updated += int(candidate_result.get("updated", 0))
            written += len(batch)
            await patch_job(client, request.job_id, 60.0 + min(35.0, written / max(len(candidates), 1) * 35.0))

        if request.job_id:
            await patch_job(
                client,
                request.job_id,
                100.0,
                status="completed",
            )

    return {
        "assetsScanned": len(fingerprints),
        "candidatesFound": len(candidates),
        "candidatesCreated": candidates_created,
        "candidatesUpdated": candidates_updated,
        "fingerprintsWritten": fingerprints_written,
    }


async def scan_single_asset(request: SingleScanRequest) -> dict:
    logger.info("Scanning single asset: %s", request.asset_id)

    async with api_client() as client:
        target_payload = await client.get(
            f"{API_URL}/worker/similarity/assets",
            params={"page": 1, "pageSize": 1, "status": "ready", "mediaType": "image", "assetIds": request.asset_id},
        )
        target_payload.raise_for_status()
        target_json = target_payload.json()
        assets = target_json.get("assets", [])
        if not assets:
            raise HTTPException(status_code=404, detail="Asset not found")

        target_asset = assets[0]
        target_fingerprint = await materialize_fingerprint(target_asset)
        if target_fingerprint is None:
            raise HTTPException(status_code=500, detail="Failed to compute fingerprint")

        fingerprints: dict[str, AssetFingerprint] = {target_fingerprint.asset_id: target_fingerprint}
        fingerprint_updates: list[dict] = [
            {
                "assetId": target_fingerprint.asset_id,
                "sha256": target_fingerprint.sha256,
                "phash": target_fingerprint.phash,
                "dhash": target_fingerprint.dhash,
                "width": target_fingerprint.width,
                "height": target_fingerprint.height,
                "qualityScore": target_fingerprint.quality_score,
            }
        ]
        candidates: list[dict] = []

        page = 1
        total_pages = 1
        while page <= total_pages:
            payload = await fetch_assets_page(client, page, WORKER_PAGE_SIZE)
            assets = payload.get("assets", [])
            meta = payload.get("meta", {})
            total_pages = int(meta.get("totalPages") or total_pages)

            for asset in assets:
                if asset["id"] == request.asset_id:
                    continue
                fingerprint = await materialize_fingerprint(asset)
                if fingerprint is None:
                    continue
                fingerprints[fingerprint.asset_id] = fingerprint
                fingerprint_updates.append(
                    {
                        "assetId": fingerprint.asset_id,
                        "sha256": fingerprint.sha256,
                        "phash": fingerprint.phash,
                        "dhash": fingerprint.dhash,
                        "width": fingerprint.width,
                        "height": fingerprint.height,
                        "qualityScore": fingerprint.quality_score,
                    }
                )

                candidate = to_candidate_payload(target_fingerprint, fingerprint)
                if candidate is not None:
                    candidates.append(candidate)
            page += 1

        fingerprint_result = await post_fingerprints(client, fingerprint_updates)
        candidate_result = await post_candidates(client, candidates)

        return {
            "assetsScanned": len(fingerprints),
            "candidatesFound": len(candidates),
            "candidatesCreated": int(candidate_result.get("created", len(candidates))),
            "candidatesUpdated": int(candidate_result.get("updated", 0)),
            "fingerprintsWritten": int(fingerprint_result.get("updated", len(fingerprint_updates))),
            "candidates": candidates,
        }


@app.get("/health")
async def health_check():
    return {"status": "ok", "fingerprints_cached": len(engine.fingerprints)}


@app.post("/scan")
async def trigger_scan(request: ScanRequest):
    try:
        return {
            "success": True,
            "data": await scan_assets(request),
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Scan failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/scan/asset")
async def scan_asset(request: SingleScanRequest):
    try:
        return {
            "success": True,
            "data": await scan_single_asset(request),
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Single asset scan failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=WORKER_HOST, port=WORKER_PORT)
