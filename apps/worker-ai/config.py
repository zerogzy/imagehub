"""
ImageHub similarity worker configuration.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

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
