import argparse
import asyncio
import logging
import time
import uuid
from datetime import datetime

from sqlalchemy.exc import SQLAlchemyError

from app.database.connection import Database
from app.services.ai.runner import purge_old_runs
from app.services.requests.ripple import process_due_requests
from app.settings import get_settings

logger = logging.getLogger(__name__)
POLL_SECONDS = 15
PURGE_SECONDS = 3600


async def run(*, once: bool, request_id: uuid.UUID | None, now: datetime | None):
    settings = get_settings()
    database = Database(settings)
    next_purge = 0.0
    try:
        if once:
            count = await process_due_requests(database, now=now, request_id=request_id)
            print(f"Processed {count} due request(s).")
            return
        while True:
            try:
                count = await process_due_requests(database)
                if count:
                    logger.info("Processed %d due request(s).", count)
            except SQLAlchemyError as error:
                logger.error("Request scheduler tick failed: %s", type(error).__name__)
            if time.monotonic() >= next_purge:
                try:
                    purged = await purge_old_runs(database, settings)
                    if purged:
                        logger.info("Purged %d old AI run(s).", purged)
                    next_purge = time.monotonic() + PURGE_SECONDS
                except SQLAlchemyError as error:
                    logger.error("AI run purge failed: %s", type(error).__name__)
            await asyncio.sleep(POLL_SECONDS)
    finally:
        await database.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Advance due request ripples.")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--request-id", type=uuid.UUID)
    parser.add_argument("--at", type=datetime.fromisoformat)
    args = parser.parse_args()
    if args.request_id and not args.once:
        parser.error("--request-id requires --once")
    if args.at is not None and (
        not args.once or args.request_id is None or args.at.utcoffset() is None
    ):
        parser.error(
            "--at requires --once, --request-id, and a timezone-aware ISO timestamp"
        )
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run(once=args.once, request_id=args.request_id, now=args.at))


if __name__ == "__main__":
    main()
