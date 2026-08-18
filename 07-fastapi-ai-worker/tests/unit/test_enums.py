"""Unit tests for domain enums."""

from __future__ import annotations

import pytest

from app.domain.enums import (
    ParsingJobStatus,
    ParsingPriority,
    ParsingArtifactType,
    ParsingEventType,
    DocumentRole,
    DocumentSecurityStatus,
    UploadedDocumentStatus,
    ProfileFactSource,
    JobStatus,
    EmploymentType,
    WorkMode,
    EmbeddingStatus,
    ApplicationStatus,
    ApplicationSnapshotType,
    SnapshotGenerator,
    InterviewStatus,
    InterviewRoundType,
    FeedbackRating,
    OutboxEventStatus,
    NotificationType,
    NotificationStatus,
    AnalyticsEventCategory,
    AnalyticsEventSource,
)


class TestParsingEnums:
    def test_parsing_job_status_values(self):
        assert ParsingJobStatus.QUEUED == "queued"
        assert ParsingJobStatus.PROCESSING == "processing"
        assert ParsingJobStatus.COMPLETED == "completed"
        assert ParsingJobStatus.PARTIAL == "partial"
        assert ParsingJobStatus.FAILED == "failed"
        assert ParsingJobStatus.CANCELLED == "cancelled"

    def test_parsing_priority_values(self):
        assert ParsingPriority.LOW == "low"
        assert ParsingPriority.NORMAL == "normal"
        assert ParsingPriority.HIGH == "high"
        assert ParsingPriority.URGENT == "urgent"

    def test_parsing_artifact_type_values(self):
        assert ParsingArtifactType.EXTRACTED_TEXT == "extracted_text"
        assert ParsingArtifactType.RAW_AI_OUTPUT == "raw_ai_output"
        assert ParsingArtifactType.VALIDATION_RESULT == "validation_result"
        assert ParsingArtifactType.OCR_CONFIDENCE == "ocr_confidence"
        assert ParsingArtifactType.PAGE_METADATA == "page_metadata"

    def test_parsing_event_type_values(self):
        assert ParsingEventType.QUEUED == "queued"
        assert ParsingEventType.STARTED == "started"
        assert ParsingEventType.EXTRACTION_COMPLETED == "extraction_completed"
        assert ParsingEventType.OCR_COMPLETED == "ocr_completed"
        assert ParsingEventType.AI_COMPLETED == "ai_completed"
        assert ParsingEventType.VALIDATION_COMPLETED == "validation_completed"
        assert ParsingEventType.COMPLETED == "completed"
        assert ParsingEventType.RETRY_SCHEDULED == "retry_scheduled"
        assert ParsingEventType.FAILED == "failed"
        assert ParsingEventType.CANCELLED == "cancelled"


class TestDocumentEnums:
    def test_document_role_values(self):
        assert DocumentRole.RESUME == "resume"
        assert DocumentRole.COVER_LETTER == "cover_letter"
        assert DocumentRole.CERTIFICATE == "certificate"
        assert DocumentRole.PORTFOLIO == "portfolio"
        assert DocumentRole.SUPPORTING == "supporting"
        assert DocumentRole.OTHER == "other"

    def test_document_security_status_values(self):
        assert DocumentSecurityStatus.PENDING == "pending"
        assert DocumentSecurityStatus.SCANNING == "scanning"
        assert DocumentSecurityStatus.CLEAN == "clean"
        assert DocumentSecurityStatus.INFECTED == "infected"
        assert DocumentSecurityStatus.QUARANTINED == "quarantined"
        assert DocumentSecurityStatus.FAILED == "failed"

    def test_uploaded_document_status_values(self):
        assert UploadedDocumentStatus.UPLOADED == "uploaded"
        assert UploadedDocumentStatus.PROCESSING == "processing"
        assert UploadedDocumentStatus.READY == "ready"
        assert UploadedDocumentStatus.FAILED == "failed"
        assert UploadedDocumentStatus.EXPIRED == "expired"
        assert UploadedDocumentStatus.DELETED == "deleted"


class TestProfileEnums:
    def test_profile_fact_source_values(self):
        assert ProfileFactSource.MANUAL_ENTRY == "manual_entry"
        assert ProfileFactSource.CONFIRMED_PROFILE == "confirmed_profile"
        assert ProfileFactSource.LATEST_ACTIVE_RESUME == "latest_active_resume"
        assert ProfileFactSource.INTERVIEW_FEEDBACK == "interview_feedback"
        assert ProfileFactSource.SYSTEM_INFERRED == "system_inferred"


class TestJobEnums:
    def test_job_status_values(self):
        assert JobStatus.DRAFT == "draft"
        assert JobStatus.PENDING_APPROVAL == "pending_approval"
        assert JobStatus.PUBLISHED == "published"
        assert JobStatus.PAUSED == "paused"
        assert JobStatus.CLOSED == "closed"
        assert JobStatus.EXPIRED == "expired"
        assert JobStatus.ARCHIVED == "archived"

    def test_employment_type_values(self):
        assert EmploymentType.FULL_TIME == "full_time"
        assert EmploymentType.PART_TIME == "part_time"
        assert EmploymentType.CONTRACT == "contract"
        assert EmploymentType.TEMPORARY == "temporary"
        assert EmploymentType.INTERN == "intern"
        assert EmploymentType.FREELANCE == "freelance"

    def test_work_mode_values(self):
        assert WorkMode.ON_SITE == "on_site"
        assert WorkMode.HYBRID == "hybrid"
        assert WorkMode.REMOTE == "remote"

    def test_embedding_status_values(self):
        assert EmbeddingStatus.PENDING == "pending"
        assert EmbeddingStatus.PROCESSING == "processing"
        assert EmbeddingStatus.COMPLETED == "completed"
        assert EmbeddingStatus.FAILED == "failed"


class TestApplicationEnums:
    def test_application_status_values(self):
        assert ApplicationStatus.APPLIED == "applied"
        assert ApplicationStatus.UNDER_REVIEW == "under_review"
        assert ApplicationStatus.SHORTLISTED == "shortlisted"
        assert ApplicationStatus.SCREENING == "screening"
        assert ApplicationStatus.INTERVIEW_SCHEDULED == "interview_scheduled"
        assert ApplicationStatus.INTERVIEW_COMPLETED == "interview_completed"
        assert ApplicationStatus.SELECTED == "selected"
        assert ApplicationStatus.OFFER_EXTENDED == "offer_extended"
        assert ApplicationStatus.OFFER_ACCEPTED == "offer_accepted"
        assert ApplicationStatus.OFFER_DECLINED == "offer_declined"
        assert ApplicationStatus.REJECTED == "rejected"
        assert ApplicationStatus.WITHDRAWN == "withdrawn"
        assert ApplicationStatus.ON_HOLD == "on_hold"

    def test_application_snapshot_type_values(self):
        assert ApplicationSnapshotType.CANDIDATE_PROFILE == "candidate_profile"
        assert ApplicationSnapshotType.RESUME_PARSED_DATA == "resume_parsed_data"
        assert ApplicationSnapshotType.JOB_REQUIREMENTS == "job_requirements"

    def test_snapshot_generator_values(self):
        assert SnapshotGenerator.NESTJS == "nestjs"
        assert SnapshotGenerator.FASTAPI_WORKER == "fastapi_worker"
        assert SnapshotGenerator.SYSTEM == "system"


class TestInterviewEnums:
    def test_interview_status_values(self):
        assert InterviewStatus.SCHEDULED == "scheduled"
        assert InterviewStatus.RESCHEDULED == "rescheduled"
        assert InterviewStatus.IN_PROGRESS == "in_progress"
        assert InterviewStatus.COMPLETED == "completed"
        assert InterviewStatus.CANCELLED == "cancelled"
        assert InterviewStatus.NO_SHOW == "no_show"
        assert InterviewStatus.POSTPONED == "postponed"

    def test_interview_round_type_values(self):
        assert InterviewRoundType.PHONE_SCREENING == "phone_screening"
        assert InterviewRoundType.TECHNICAL == "technical"
        assert InterviewRoundType.BEHAVIORAL == "behavioral"
        assert InterviewRoundType.CASE_STUDY == "case_study"
        assert InterviewRoundType.FINAL == "final"
        assert InterviewRoundType.OTHER == "other"

    def test_feedback_rating_values(self):
        assert FeedbackRating.POOR == "poor"
        assert FeedbackRating.BELOW_AVERAGE == "below_average"
        assert FeedbackRating.AVERAGE == "average"
        assert FeedbackRating.GOOD == "good"
        assert FeedbackRating.EXCELLENT == "excellent"


class TestOutboxEnums:
    def test_outbox_event_status_values(self):
        assert OutboxEventStatus.PENDING == "pending"
        assert OutboxEventStatus.PUBLISHING == "publishing"
        assert OutboxEventStatus.PUBLISHED == "published"
        assert OutboxEventStatus.FAILED == "failed"
        assert OutboxEventStatus.DEAD_LETTER == "dead_letter"


class TestNotificationEnums:
    def test_notification_type_values(self):
        assert NotificationType.EMAIL == "email"
        assert NotificationType.SMS == "sms"
        assert NotificationType.PUSH == "push"
        assert NotificationType.IN_APP == "in_app"

    def test_notification_status_values(self):
        assert NotificationStatus.PENDING == "pending"
        assert NotificationStatus.SENT == "sent"
        assert NotificationStatus.DELIVERED == "delivered"
        assert NotificationStatus.FAILED == "failed"
        assert NotificationStatus.BOUNCED == "bounced"
        assert NotificationStatus.OPENED == "opened"
        assert NotificationStatus.CLICKED == "clicked"


class TestAnalyticsEnums:
    def test_analytics_event_category_values(self):
        assert AnalyticsEventCategory.ENGAGEMENT == "engagement"
        assert AnalyticsEventCategory.CONVERSION == "conversion"
        assert AnalyticsEventCategory.RECRUITMENT == "recruitment"
        assert AnalyticsEventCategory.USER == "user"
        assert AnalyticsEventCategory.SEARCH == "search"
        assert AnalyticsEventCategory.FEATURE == "feature"
        assert AnalyticsEventCategory.SYSTEM == "system"

    def test_analytics_event_source_values(self):
        assert AnalyticsEventSource.NESTJS == "nestjs"
        assert AnalyticsEventSource.FASTAPI == "fastapi"
        assert AnalyticsEventSource.FRONTEND == "frontend"
        assert AnalyticsEventSource.SYSTEM == "system"
