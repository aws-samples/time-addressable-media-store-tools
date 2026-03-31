"""Pydantic models for FFmpeg ingestion API responses.

TypeScript types: frontend/src/types/ingestFFmpeg.ts
Keep these in sync manually.
"""

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class FfmpegConfig(BaseModel):
    """FFmpeg command configuration."""

    command: dict[str, Optional[str]] = Field(
        description="FFmpeg command parameters"
    )
    tams: Optional[dict[str, Any]] = Field(
        default=None, description="TAMS-specific configuration"
    )


class RuleTarget(BaseModel):
    """Target configuration for an FFmpeg rule."""

    outputFlow: UUID = Field(description="Output flow UUID")
    ffmpeg: FfmpegConfig = Field(description="FFmpeg configuration")
    executionArn: Optional[str] = Field(
        default=None, description="Step Functions execution ARN"
    )


class JobTarget(BaseModel):
    """Target configuration for an FFmpeg job."""

    outputFlow: UUID = Field(description="Output flow UUID")
    ffmpeg: FfmpegConfig = Field(description="FFmpeg configuration")
    executionArn: str = Field(description="Step Functions execution ARN")
    status: str = Field(description="Execution status")
    startDate: str = Field(description="Job start timestamp")
    stopDate: str = Field(description="Job stop timestamp")
    sourceTimerange: str = Field(description="Source time range")


class FfmpegRule(BaseModel):
    """FFmpeg rule definition."""

    id: UUID = Field(description="Flow ID")
    targets: list[RuleTarget] = Field(description="List of rule targets")


class FfmpegJob(BaseModel):
    """FFmpeg job definition."""

    id: UUID = Field(description="Flow ID")
    targets: list[JobTarget] = Field(description="List of job targets")


class S3ObjectOutput(BaseModel):
    """S3 object output location."""

    model_config = ConfigDict(extra="allow")

    bucket: Optional[str] = Field(default=None, description="S3 bucket name")
    key: Optional[str] = Field(default=None, description="S3 object key")


class FfmpegExport(BaseModel):
    """FFmpeg export job details."""

    executionArn: str = Field(description="Step Functions execution ARN")
    status: str = Field(description="Execution status")
    startDate: str = Field(description="Export start timestamp")
    stopDate: str = Field(description="Export stop timestamp")
    timerange: str = Field(description="Time range for export")
    flowIds: list[UUID] = Field(description="List of flow IDs")
    ffmpeg: FfmpegConfig = Field(description="FFmpeg configuration")
    output: S3ObjectOutput = Field(description="Output S3 location")
