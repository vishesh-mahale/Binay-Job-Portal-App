"""Unit tests for resume service."""

from __future__ import annotations

import pytest

from app.services.resume_service import ResumeParsingService


class TestResumeParsingService:
    @pytest.mark.asyncio
    async def test_parse_resume_not_implemented(self):
        service = ResumeParsingService(llm=None, embedding_provider=None, db_manager=None)
        with pytest.raises(NotImplementedError, match="Resume parsing orchestration is handled inline in task_handlers.py"):
            await service.parse_resume("job-1", "doc-1")
