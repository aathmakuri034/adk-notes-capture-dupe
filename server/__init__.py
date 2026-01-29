"""
ADK Notes Capture Agent - Python server for note capture and processing.

Installation from private GitHub repo:
    pip install git+ssh://git@github.com/YOUR_ORG/adk-notes-capture-agent.git

Usage:
    from adk_notes_capture_agent import StreamingService
    from adk_notes_capture_agent.schema import Job
"""

__version__ = "0.1.0"

# Lazy imports to avoid loading everything at import time
def __getattr__(name):
    if name == "StreamingService":
        from .streaming_service import StreamingService
        return StreamingService
    if name == "NotesStreamingService":
        from .notes_streaming_service import NotesStreamingService
        return NotesStreamingService
    if name == "JobSummaryTracker":
        from .conversation_pipeline import JobSummaryTracker
        return JobSummaryTracker
    if name == "AzureBlobStorage":
        from .blob_storage import AzureBlobStorage
        return AzureBlobStorage
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = [
    "__version__",
    "StreamingService",
    "NotesStreamingService",
    "JobSummaryTracker",
    "AzureBlobStorage",
]
