from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException

from api_client import (
    create_api_client,
    fetch_assets_page,
    patch_job,
    post_candidates,
    post_fingerprints,
)
from config import (
    API_URL,
    BATCH_SIZE,
    CONCURRENT_FINGERPRINTS,
    HASH_BAND_SIZE,
    SAME_TOPIC_THRESHOLD,
    WORKER_PAGE_SIZE,
    logger,
)
from engine import SimilarityEngine
from models import AssetFingerprint


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

    from config import (
        HIGHLY_SIMILAR_THRESHOLD,
        POSSIBLE_VARIANT_THRESHOLD,
    )

    min_distance = min(distances)
    if min_distance <= HIGHLY_SIMILAR_THRESHOLD:
        return "highly_similar"
    if min_distance <= POSSIBLE_VARIANT_THRESHOLD:
        return "possible_variant"
    if min_distance <= SAME_TOPIC_THRESHOLD:
        return "same_topic"
    return "unrelated"


def to_candidate_payload(engine: SimilarityEngine, fp_a: AssetFingerprint, fp_b: AssetFingerprint) -> Optional[dict]:
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


async def materialize_fingerprint(engine: SimilarityEngine, asset: dict) -> Optional[AssetFingerprint]:
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


async def scan_assets(engine: SimilarityEngine, request) -> dict:
    logger.info("Starting similarity scan: job_id=%s scan_all=%s", request.job_id, request.scan_all)

    fingerprints: dict[str, AssetFingerprint] = {}
    candidate_pairs: set[str] = set()
    sha_groups: defaultdict[str, list[str]] = defaultdict(list)
    bucket_groups: defaultdict[str, list[str]] = defaultdict(list)

    async with create_api_client() as client:
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
                    fingerprint = await materialize_fingerprint(engine, asset)
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

            candidate = to_candidate_payload(engine, fp_a, fp_b)
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


async def scan_single_asset(engine: SimilarityEngine, request) -> dict:
    logger.info("Scanning single asset: %s", request.asset_id)

    async with create_api_client() as client:
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
        target_fingerprint = await materialize_fingerprint(engine, target_asset)
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
                fingerprint = await materialize_fingerprint(engine, asset)
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

                candidate = to_candidate_payload(engine, target_fingerprint, fingerprint)
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
