"""record request ripple stages"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "c4913dc5a2b7"
down_revision = "a7d90b1c3e42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "help_requests",
        sa.Column(
            "ripple_history",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_index(
        "ix_help_requests_open_expires",
        "help_requests",
        ["expires_at"],
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("ix_help_requests_open_expires", table_name="help_requests")
    op.drop_column("help_requests", "ripple_history")
