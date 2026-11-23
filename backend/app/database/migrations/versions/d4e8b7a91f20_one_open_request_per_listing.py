"""one open request per requester and listing"""

import sqlalchemy as sa
from alembic import op

revision = "d4e8b7a91f20"
down_revision = "a7d90b1c3e42"
branch_labels = None
depends_on = None

INDEX = "uq_help_requests_open_listing_per_requester"


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE help_requests
            SET status = 'expired'
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           row_number() OVER (
                               PARTITION BY requester_user_id, listing_id
                               ORDER BY created_at DESC, id DESC
                           ) AS rank
                    FROM help_requests
                    WHERE listing_id IS NOT NULL AND status = 'open'
                ) AS ranked
                WHERE rank > 1
            )
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
