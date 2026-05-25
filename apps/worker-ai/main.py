"""
ImageHub similarity worker entry point.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
import uvicorn

from config import STORAGE_ROOT, WORKER_HOST, WORKER_PORT, logger
from engine import SimilarityEngine
from models import ScanRequest, SingleScanRequest
from scanner import scan_assets, scan_single_asset

app = FastAPI(
    title="ImageHub Similarity Worker",
    version="2.0.0",
    description="Bucketed similarity analysis for images",
)

engine = SimilarityEngine(STORAGE_ROOT)


@app.get("/health")
async def health_check():
    return {"status": "ok", "fingerprints_cached": len(engine.fingerprints)}


@app.post("/scan")
async def trigger_scan(request: ScanRequest):
    try:
        return {
            "success": True,
            "data": await scan_assets(engine, request),
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
            "data": await scan_single_asset(engine, request),
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Single asset scan failed: %s", error)
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    uvicorn.run(app, host=WORKER_HOST, port=WORKER_PORT)
