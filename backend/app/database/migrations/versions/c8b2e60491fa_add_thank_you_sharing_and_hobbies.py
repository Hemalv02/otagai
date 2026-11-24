"""Add an optional hobby field and explicit permission to share thank-you notes."""

import sqlalchemy as sa
from alembic import op

revision = "c8b2e60491fa"
down_revision = "f891bed42a17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("hobbies", sa.Text(), nullable=True))
    op.add_column(
        "thank_yous",
        sa.Column(
            "allow_wall_sharing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("thank_yous", "allow_wall_sharing")
    op.drop_column("users", "hobbies")
