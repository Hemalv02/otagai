"""Default new profile details to private."""

import sqlalchemy as sa
from alembic import op

revision = "e6a94cf218c0"
down_revision = "86b6ac2a1f3d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "profile_details_visible", server_default=sa.false())


def downgrade() -> None:
    op.alter_column("users", "profile_details_visible", server_default=sa.true())
