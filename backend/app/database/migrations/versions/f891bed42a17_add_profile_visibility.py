"""add a profile details visibility preference"""

import sqlalchemy as sa
from alembic import op

revision = "f891bed42a17"
down_revision = "b7e2c91f4a30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "profile_details_visible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "profile_details_visible")
