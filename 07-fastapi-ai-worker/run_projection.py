import asyncio
import sys
import uuid
import traceback

from app.core.database import get_db_manager
from app.schemas.tasks import CandidateProjectionTaskPayload
from app.api.v1.task_handlers import handle_candidate_projection_task
from sqlalchemy import text

class DummyRequest:
    def __init__(self):
        self.app = type("App", (), {"state": type("State", (), {"pool": None, "outbox_publisher": None})()})()

async def project_candidate(event_id: str, candidate_id: str):
    db_manager = get_db_manager()
    await db_manager.initialize()
    req = DummyRequest()

    try:
        print(f"--- Running Candidate Projection for candidate {candidate_id} with event {event_id} ---")
        proj_payload = CandidateProjectionTaskPayload(
            event_id=event_id,
            aggregate_id=candidate_id,
            trace_id=str(uuid.uuid4())
        )
        proj_res = await handle_candidate_projection_task(proj_payload, req, authorization=None)
        print("Candidate Projection Result:", proj_res)
    except Exception as e:
        print("Exception occurred:")
        traceback.print_exc()

if __name__ == "__main__":
    event_id = "55297bbe-8b8d-43d1-a44f-9aed0b6d228d"
    cand_id = "b15d064e-080b-4e79-97bb-5517cae382f5"
    asyncio.run(project_candidate(event_id, cand_id))
