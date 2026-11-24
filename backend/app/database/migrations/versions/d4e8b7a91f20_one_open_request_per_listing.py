"""one open request per requester and listing"""

import sqlalchemy as sa
from alembic import op

revision = "d4e8b7a91f20"
down_revision = "a7d90b1c3e42"
branch_labels = None
depends_on = None

INDEX = "uq_help_requests_open_listing_per_requester"


def upgrade() -> None:
    op.execute("LOCK TABLE help_requests IN EXCLUSIVE MODE")
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id, expires_at,
                       row_number() OVER (
                           PARTITION BY requester_user_id, listing_id
                           ORDER BY (expires_at > now()) DESC, created_at DESC, id DESC
                       ) AS position
                FROM help_requests
                WHERE listing_id IS NOT NULL AND status = 'open'
            )
            UPDATE help_requests AS request
            SET status = 'expired', next_widen_at = NULL
            FROM ranked
            WHERE request.id = ranked.id
              AND (ranked.position > 1 OR ranked.expires_at <= now())
            """
        )
    )
    op.create_index(
        INDEX,
        "help_requests",
        ["requester_user_id", "listing_id"],
        unique=True,
        postgresql_where=sa.text("listing_id IS NOT NULL AND status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="help_requests")
