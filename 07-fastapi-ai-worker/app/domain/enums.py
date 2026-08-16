"""
Domain enums mirroring baseline SQL definitions.
Single source of truth for enum values used in FastAPI worker.
"""

from enum import Enum


# ============================================================================
# Resume Parsing
# ============================================================================

class ParsingJobStatus(str, Enum):
    """Resume parsing job status (mirrors baseline 02_enums.sql)."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ParsingPriority(str, Enum):
    """Resume parsing priority."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ParsingArtifactType(str, Enum):
    """Resume parsing artifact type."""
    EXTRACTED_TEXT = "extracted_text"
    RAW_AI_OUTPUT = "raw_ai_output"
    VALIDATION_RESULT = "validation_result"
    OCR_CONFIDENCE = "ocr_confidence"
    PAGE_METADATA = "page_metadata"


class ParsingEventType(str, Enum):
    """Resume parsing job event type."""
    QUEUED = "queued"
    STARTED = "started"
    EXTRACTION_COMPLETED = "extraction_completed"
    OCR_COMPLETED = "ocr_completed"
    AI_COMPLETED = "ai_completed"
    VALIDATION_COMPLETED = "validation_completed"
    COMPLETED = "completed"
    RETRY_SCHEDULED = "retry_scheduled"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ============================================================================
# Document & File Management
# ============================================================================

class DocumentRole(str, Enum):
    """Document role in application/profile."""
    RESUME = "resume"
    COVER_LETTER = "cover_letter"
    CERTIFICATE = "certificate"
    PORTFOLIO = "portfolio"
    SUPPORTING = "supporting"
    OTHER = "other"


class DocumentSecurityStatus(str, Enum):
    """Document security scan status."""
    PENDING = "pending"
    SCANNING = "scanning"
    CLEAN = "clean"
    INFECTED = "infected"
    QUARANTINED = "quarantined"
    FAILED = "failed"


class UploadedDocumentStatus(str, Enum):
    """Uploaded document status."""
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    EXPIRED = "expired"
    DELETED = "deleted"


# ============================================================================
# Candidate Profile & Search
# ============================================================================

class ProfileFactSource(str, Enum):
    """Source of candidate profile fact."""
    MANUAL_ENTRY = "manual_entry"
    CONFIRMED_PROFILE = "confirmed_profile"
    LATEST_ACTIVE_RESUME = "latest_active_resume"
    INTERVIEW_FEEDBACK = "interview_feedback"
    SYSTEM_INFERRED = "system_inferred"


# ============================================================================
# Job Management
# ============================================================================

class JobStatus(str, Enum):
    """Job posting status."""
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    PUBLISHED = "published"
    PAUSED = "paused"
    CLOSED = "closed"
    EXPIRED = "expired"
    ARCHIVED = "archived"


class EmploymentType(str, Enum):
    """Employment type."""
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    TEMPORARY = "temporary"
    INTERN = "intern"
    FREELANCE = "freelance"


class WorkMode(str, Enum):
    """Work mode/arrangement."""
    ON_SITE = "on_site"
    HYBRID = "hybrid"
    REMOTE = "remote"


class EmbeddingStatus(str, Enum):
    """Embedding generation status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Applications
# ============================================================================

class ApplicationStatus(str, Enum):
    """Job application status."""
    APPLIED = "applied"
    UNDER_REVIEW = "under_review"
    SHORTLISTED = "shortlisted"
    SCREENING = "screening"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    SELECTED = "selected"
    OFFER_EXTENDED = "offer_extended"
    OFFER_ACCEPTED = "offer_accepted"
    OFFER_DECLINED = "offer_declined"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ON_HOLD = "on_hold"


class ApplicationSnapshotType(str, Enum):
    """Snapshot type (state captured at application time)."""
    CANDIDATE_PROFILE = "candidate_profile"
    RESUME_PARSED_DATA = "resume_parsed_data"
    JOB_REQUIREMENTS = "job_requirements"


class SnapshotGenerator(str, Enum):
    """Service that generated snapshot."""
    NESTJS = "nestjs"
    FASTAPI_WORKER = "fastapi_worker"
    SYSTEM = "system"


# ============================================================================
# Analytics
# ============================================================================

class AnalyticsEventCategory(str, Enum):
    """Analytics event category."""
    ENGAGEMENT = "engagement"
    CONVERSION = "conversion"
    RECRUITMENT = "recruitment"
    USER = "user"
    SEARCH = "search"
    FEATURE = "feature"
    SYSTEM = "system"


class AnalyticsEventSource(str, Enum):
    """Analytics event source."""
    NESTJS = "nestjs"
    FASTAPI = "fastapi"
    FRONTEND = "frontend"
    SYSTEM = "system"


# ============================================================================
# Interviews
# ============================================================================

class InterviewStatus(str, Enum):
    """Interview status."""
    SCHEDULED = "scheduled"
    RESCHEDULED = "rescheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    POSTPONED = "postponed"


class InterviewRoundType(str, Enum):
    """Interview round type."""
    PHONE_SCREENING = "phone_screening"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    CASE_STUDY = "case_study"
    FINAL = "final"
    OTHER = "other"


class FeedbackRating(str, Enum):
    """Interview feedback rating."""
    POOR = "poor"
    BELOW_AVERAGE = "below_average"
    AVERAGE = "average"
    GOOD = "good"
    EXCELLENT = "excellent"


# ============================================================================
# Outbox & Event Processing
# ============================================================================

class OutboxEventStatus(str, Enum):
    """Outbox event status."""
    PENDING = "pending"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


# ============================================================================
# Messaging & Notifications
# ============================================================================

class NotificationType(str, Enum):
    """Notification type."""
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    IN_APP = "in_app"


class NotificationStatus(str, Enum):
    """Notification status."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"
    OPENED = "opened"
    CLICKED = "clicked"
