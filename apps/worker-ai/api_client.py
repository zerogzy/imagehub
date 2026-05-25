from __future__ import annotations

from typing import Optional

import httpx

from config import API_URL, API_TOKEN, logger


def create_api_client() -> httpx.AsyncClient:
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
