from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field


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
