from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

import imagehash
import numpy as np
from PIL import Image, ImageOps

from config import (
    EXACT_DUPLICATE_THRESHOLD,
    HIGHLY_SIMILAR_THRESHOLD,
    POSSIBLE_VARIANT_THRESHOLD,
    SAME_TOPIC_THRESHOLD,
    logger,
)
from models import AssetFingerprint


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
