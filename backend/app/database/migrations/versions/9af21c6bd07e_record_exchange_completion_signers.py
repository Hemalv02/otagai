"""Record the signed-in accounts that confirm exchanges."""

import sqlalchemy as sa
from alembic import op

revision = "9af21c6bd07e"
down_revision = "e6a94cf218c0"
branch_labels = None
depends_on = None

SIGNERS = ("requester_confirmed_by_user_id", "helper_confirmed_by_user_id")
CHECK = "ck_exchanges_distinct_completion_signers"


def upgrade() -> None:
    for column in SIGNERS:
        op.add_column("exchanges", sa.Column(column, sa.Uuid(), nullable=True))
        op.create_foreign_key(
            op.f(f"fk_exchanges_{column}_users"), "exchanges", "users", [column], ["id"]
        )
    op.create_check_constraint(
        op.f(CHECK), "exchanges", f"{SIGNERS[0]} <> {SIGNERS[1]}"
    )


def downgrade() -> None:
    op.drop_constraint(op.f(CHECK), "exchanges", type_="check")
    for column in SIGNERS:
        op.drop_constraint(
            op.f(f"fk_exchanges_{column}_users"), "exchanges", type_="foreignkey"
        )
        op.drop_column("exchanges", column)
