import asyncio
import sys
import uuid
import traceback

from app.core.database import get_db_manager
from app.schemas.tasks import SecurityScanTaskPayload, ResumeParseTaskPayload, CandidateProjectionTaskPayload
from app.api.v1.task_handlers import handle_security_scan_task, handle_resume_parse_task, handle_candidate_projection_task
from sqlalchemy import text

class DummyRequest:
    def __init__(self):
        self.app = type("App", (), {"state": type("State", (), {"pool": None, "outbox_publisher": None})()})()

async def process_document(document_id: str):
    db_manager = get_db_manager()
    await db_manager.initialize()
    req = DummyRequest()

    try:
        print(f"--- 1. Starting Security Scan for document {document_id} ---")
        scan_payload = SecurityScanTaskPayload(
            event_id=str(uuid.uuid4()),
            aggregate_id=document_id,
            trace_id=str(uuid.uuid4())
        )
        scan_res = await handle_security_scan_task(scan_payload, req, authorization=None)
        print("Security Scan Result:", scan_res)

        # Get the created parsing job ID
        async with db_manager.transaction() as session:
            result = await session.execute(
                text("SELECT id FROM resume_parsing_jobs WHERE document_id = :doc_id ORDER BY created_at DESC LIMIT 1"),
                {"doc_id": document_id}
            )
            row = result.mappings().first()
            if not row:
                print("ERROR: No parsing job created!")
                return
            parsing_job_id = str(row["id"])
            print(f"--- 2. Found Parsing Job ID: {parsing_job_id} ---")

        print(f"--- 3. Starting Resume Parse for job {parsing_job_id} ---")
        parse_payload = ResumeParseTaskPayload(
            event_id=str(uuid.uuid4()),
            aggregate_id=parsing_job_id,
            trace_id=str(uuid.uuid4())
        )
        parse_res = await handle_resume_parse_task(parse_payload, req, authorization=None)
        print("Resume Parse Result:", parse_res)

        # Check candidate ID for projection
        async with db_manager.transaction() as session:
            result = await session.execute(
                text("SELECT candidate_id FROM candidate_profile_documents WHERE document_id = :doc_id LIMIT 1"),
                {"doc_id": document_id}
            )
            cand_row = result.mappings().first()

        if cand_row and cand_row["candidate_id"]:
            cand_id = str(cand_row["candidate_id"])
            print(f"--- 4. Running Candidate Projection for candidate {cand_id} ---")
            proj_payload = CandidateProjectionTaskPayload(
                event_id=str(uuid.uuid4()),
                aggregate_id=cand_id,
                trace_id=str(uuid.uuid4())
            )
            proj_res = await handle_candidate_projection_task(proj_payload, req, authorization=None)
            print("Candidate Projection Result:", proj_res)

        print("\nSUCCESS: Document processing complete!")
    except Exception as e:
        print("Exception occurred:")
        traceback.print_exc()

if __name__ == "__main__":
    doc_id = "5b22a544-3c84-44e2-bc86-f590bd56e2e1"
    if len(sys.argv) > 1:
        doc_id = sys.argv[1]
    asyncio.run(process_document(doc_id))
