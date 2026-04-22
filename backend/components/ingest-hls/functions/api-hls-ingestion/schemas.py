"""Pydantic models for HLS ingestion API responses.

TypeScript types: frontend/src/types/ingestHls.ts
Keep these in sync manually.
"""

from typing import Optional

from pydantic import BaseModel, Field


class JobIngestion(BaseModel):
    """MediaConvert job ingestion details."""

    id: str = Field(description="MediaConvert job ID")
    fileName: str = Field(description="Input file name")
    manifestUri: str = Field(description="HLS manifest URI")
    manifestExists: bool = Field(description="Whether manifest exists in S3")
    status: str = Field(description="Job status")
    jobPercentComplete: Optional[int] = Field(
        default=None, description="Job completion percentage"
    )


class ChannelIngestion(BaseModel):
    """MediaLive channel ingestion details."""

    id: str = Field(description="MediaLive channel ID")
    name: str = Field(description="Channel name")
    manifestUri: Optional[str] = Field(default=None, description="HLS manifest URI")
    manifestExists: bool = Field(description="Whether manifest exists in S3")
    state: str = Field(description="Channel state")


class Workflow(BaseModel):
    """Step Functions workflow execution details."""

    executionArn: str = Field(description="Step Functions execution ARN")
    elementalService: str = Field(
        description="Elemental service type (mediaconvert/medialive)"
    )
    elementalId: str = Field(description="Elemental resource ID")
    status: str = Field(description="Execution status")
    startDate: str = Field(description="Workflow start timestamp")
    stopDate: Optional[str] = Field(
        default=None, description="Workflow stop timestamp"
    )
    flowId: Optional[str] = Field(default=None, description="The Id of the Multi Flow created") 
    sourceId: Optional[str] = Field(default=None, description="The Id of the Multi Source created") 
    error: Optional[str] = Field(default=None, description="Error type if failed")
    warnings: Optional[list] = Field(
        default=None, description="Warnings from manifest parsing"
    )
