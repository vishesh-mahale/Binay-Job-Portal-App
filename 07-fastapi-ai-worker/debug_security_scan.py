import asyncio
import traceback

from app.api.v1.task_handlers import handle_security_scan_task
from app.schemas.tasks import SecurityScanTaskPayload

async def main():
    payload = SecurityScanTaskPayload(
        event_id="test-event-1",
        aggregate_id="5b22a544-3c84-44e2-bc86-f590bd56e2e1",
        trace_id="test-trace-1"
    )
    try:
        res = await handle_security_scan_task(payload, authorization=None)
        print("Success:", res)
    except Exception as e:
        print("Exception caught:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
