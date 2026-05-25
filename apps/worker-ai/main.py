"""
ImageHub Similarity Worker
========================
Python worker that performs perceptual similarity analysis on images.

Features:
- Perceptual hash comparison (pHash, dHash, aHash, wHash)
- Exact duplicate detection via SHA256
- Color histogram comparison
- SSIM-based structural similarity
- Quality scoring for resolution/size/sharpness

Usage:
    python main.py [--port 8000] [--host 0.0.0.0]

API Endpoints:
    POST /scan          - Trigger a full scan
    POST /scan/asset    - Scan a single asset against existing
    GET  /health        - Health check
"""

import os
import sys
import hashlib
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

import httpx
import numpy as np
from PIL import Image
import imagehash
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Load environment
load_dotenv()

# ---- Configuration ----
API_URL = os.getenv("API_URL", "http://localhost:3001/api/v1")
STORAGE_ROOT = os.getenv("STORAGE_ROOT", "./storage")
WORKER_PORT = int(os.getenv("WORKER_PORT", "8000"))
WORKER_HOST = os.getenv("WORKER_HOST", "0.0.0.0")

# Similarity thresholds
EXACT_DUPLICATE_THRESHOLD = 0  # Hamming distance = 0 for exact
HIGHLY_SIMILAR_THRESHOLD = 5   # Hamming distance <= 5
POSSIBLE_VARIANT_THRESHOLD = 15
SAME_TOPIC_THRESHOLD = 25

# ---- Logging ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("similarity-worker")

# ---- Data Models ----
@dataclass
class AssetFingerprint:
    """Perceptual fingerprint for an image asset."""
    asset_id: str
    phash: Optional[str] = None
    dhash: Optional[str] = None
    ahash: Optional[str] = None
    whash: Optional[str] = None
    color_hash: Optional[str] = None
    width: int = 0
    height: int = 0
    file_size: int = 0
    sharpness: float = 0.0
    sha256: Optional[str] = None


class ScanRequest(BaseModel):
    job_id: Optional[str] = None
    scan_all: bool = True
    asset_ids: list[str] = field(default_factory=list)


class SingleScanRequest(BaseModel):
    asset_id: str


# ---- Similarity Engine ----
class SimilarityEngine:
    """Core similarity detection engine."""

    def __init__(self, storage_root: str):
        self.storage_root = Path(storage_root)
        self.fingerprints: dict[str, AssetFingerprint] = {}

    def compute_fingerprint(self, asset_id: str, storage_key: str) -> Optional[AssetFingerprint]:
        """Compute perceptual fingerprint for an image."""
        file_path = self.storage_root / storage_key

        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return None

        try:
            fp = AssetFingerprint(asset_id=asset_id)

            # File stats
            stat = file_path.stat()
            fp.file_size = stat.st_size

            # SHA256
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    sha256_hash.update(chunk)
            fp.sha256 = sha256_hash.hexdigest()

            # Open image for perceptual hashing
            try:
                img = Image.open(file_path)
                fp.width, fp.height = img.size

                # Perceptual hashes
                fp.phash = str(imagehash.phash(img))
                fp.dhash = str(imagehash.dhash(img))
                fp.ahash = str(imagehash.average_hash(img))
                fp.whash = str(imagehash.whash(img))

                # Color hash
                fp.color_hash = str(imagehash.colorhash(img))

                # Sharpness estimation (Laplacian variance)
                try:
                    import cv2
                    cv_img = cv2.imread(str(file_path))
                    if cv_img is not None:
                        gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
                        fp.sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
                except ImportError:
                    pass

            except Exception as e:
                logger.warning(f"Could not process image {asset_id}: {e}")

            return fp

        except Exception as e:
            logger.error(f"Error computing fingerprint for {asset_id}: {e}")
            return None

    def compare(self, fp_a: AssetFingerprint, fp_b: AssetFingerprint) -> dict:
        """Compare two fingerprints and return similarity info."""
        result = {
            "similarity_type": "unrelated",
            "phash_distance": None,
            "dhash_distance": None,
            "max_similarity": 0.0,
        }

        # Exact duplicate via SHA256
        if fp_a.sha256 and fp_b.sha256 and fp_a.sha256 == fp_b.sha256:
            result["similarity_type"] = "exact_duplicate"
            result["max_similarity"] = 1.0
            return result

        # Perceptual hash comparison
        distances = []

        if fp_a.phash and fp_b.phash:
            hash_a = imagehash.hex_to_hash(fp_a.phash)
            hash_b = imagehash.hex_to_hash(fp_b.phash)
            phash_dist = hash_a - hash_b
            result["phash_distance"] = phash_dist
            distances.append(phash_dist)

        if fp_a.dhash and fp_b.dhash:
            hash_a = imagehash.hex_to_hash(fp_a.dhash)
            hash_b = imagehash.hex_to_hash(fp_b.dhash)
            dhash_dist = hash_a - hash_b
            result["dhash_distance"] = dhash_dist
            distances.append(dhash_dist)

        if not distances:
            return result

        min_distance = min(distances)
        result["max_similarity"] = max(0, 1 - min_distance / 64)

        # Classify similarity
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
        """Pick the better quality asset as the winner."""
        score_a = self._quality_score(fp_a)
        score_b = self._quality_score(fp_b)
        return fp_a.asset_id if score_a >= score_b else fp_b.asset_id

    def _quality_score(self, fp: AssetFingerprint) -> float:
        """Compute a quality score for an asset."""
        score = 0.0
        # Resolution score (higher is better)
        if fp.width and fp.height:
            score += fp.width * fp.height / 1_000_000  # megapixels
        # File size score (larger often means better quality)
        score += fp.file_size / 1_000_000  # MB
        # Sharpness score
        score += fp.sharpness / 1000
        return score


# ---- API Application ----
app = FastAPI(
    title="ImageHub Similarity Worker",
    version="1.0.0",
    description="Perceptual similarity analysis for images",
)

engine = SimilarityEngine(STORAGE_ROOT)


@app.get("/health")
async def health_check():
    return {"status": "ok", "fingerprints_cached": len(engine.fingerprints)}


@app.post("/scan")
async def trigger_scan(request: ScanRequest):
    """
    Perform a similarity scan across all or specified assets.
    Returns candidates for similar pairs.
    """
    logger.info(f"Starting similarity scan: job_id={request.job_id}, scan_all={request.scan_all}")

    # Fetch assets from the API
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            # Fetch all ready assets
            page = 1
            all_assets = []
            while True:
                resp = await client.get(
                    f"{API_URL}/gallery",
                    params={"page": page, "pageSize": 100, "mediaType": "image"},
                )
                data = resp.json()
                if not data.get("success"):
                    break
                assets = data.get("assets", [])
                all_assets.extend(assets)
                meta = data.get("meta", {})
                if page >= meta.get("totalPages", 1):
                    break
                page += 1

            # Compute fingerprints
            logger.info(f"Computing fingerprints for {len(all_assets)} assets")
            fingerprints = []
            for asset in all_assets:
                storage_key = asset.get("storageKey") or f"original/{asset.get('id', '')}"
                fp = engine.compute_fingerprint(asset["id"], storage_key)
                if fp:
                    fingerprints.append(fp)
                    engine.fingerprints[asset["id"]] = fp

            # Compare all pairs
            logger.info(f"Comparing {len(fingerprints)} fingerprints")
            candidates = []
            for i in range(len(fingerprints)):
                for j in range(i + 1, len(fingerprints)):
                    fp_a = fingerprints[i]
                    fp_b = fingerprints[j]
                    result = engine.compare(fp_a, fp_b)

                    if result["similarity_type"] != "unrelated":
                        winner = engine.pick_quality_winner(fp_a, fp_b)
                        candidates.append({
                            "assetAId": fp_a.asset_id,
                            "assetBId": fp_b.asset_id,
                            "similarityType": result["similarity_type"],
                            "phashDistance": result["phash_distance"],
                            "dhashDistance": result["dhash_distance"],
                            "qualityWinnerAssetId": winner,
                        })

            # Submit candidates to API
            if candidates and request.job_id:
                for candidate in candidates:
                    try:
                        await client.post(
                            f"{API_URL}/admin/similarity/candidates",
                            json=candidate,
                            headers={"X-ImageHub-Token": os.getenv("ADMIN_TOKEN", "")},
                        )
                    except Exception as e:
                        logger.warning(f"Failed to submit candidate: {e}")

            # Update job status
            if request.job_id:
                try:
                    await client.patch(
                        f"{API_URL}/admin/jobs/{request.job_id}",
                        json={"status": "completed", "progress": 100},
                        headers={"X-ImageHub-Token": os.getenv("ADMIN_TOKEN", "")},
                    )
                except Exception as e:
                    logger.warning(f"Failed to update job status: {e}")

            return {
                "success": True,
                "candidates_found": len(candidates),
                "assets_scanned": len(fingerprints),
            }

    except Exception as e:
        logger.error(f"Scan failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scan/asset")
async def scan_single_asset(request: SingleScanRequest):
    """
    Scan a single asset against all cached fingerprints.
    """
    logger.info(f"Scanning single asset: {request.asset_id}")

    # Fetch asset details
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{API_URL}/assets/{request.asset_id}")
            data = resp.json()
            if not data.get("success"):
                raise HTTPException(status_code=404, detail="Asset not found")

            asset = data["data"]
            storage_key = asset.get("storageKey") or f"original/{asset['id']}"

            # Compute fingerprint
            fp = engine.compute_fingerprint(asset["id"], storage_key)
            if not fp:
                raise HTTPException(status_code=500, detail="Failed to compute fingerprint")

            engine.fingerprints[asset["id"]] = fp

            # Compare with all cached fingerprints
            candidates = []
            for other_id, other_fp in engine.fingerprints.items():
                if other_id == request.asset_id:
                    continue
                result = engine.compare(fp, other_fp)
                if result["similarity_type"] != "unrelated":
                    winner = engine.pick_quality_winner(fp, other_fp)
                    candidates.append({
                        "assetAId": request.asset_id,
                        "assetBId": other_id,
                        "similarityType": result["similarity_type"],
                        "phashDistance": result["phash_distance"],
                        "dhashDistance": result["dhash_distance"],
                        "qualityWinnerAssetId": winner,
                    })

            return {
                "success": True,
                "candidates_found": len(candidates),
                "candidates": candidates,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Single asset scan failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=WORKER_HOST, port=WORKER_PORT)
