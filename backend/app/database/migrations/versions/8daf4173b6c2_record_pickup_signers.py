"""Record who signed a pickup checklist."""

import sqlalchemy as sa
from alembic import op

revision = "8daf4173b6c2"
down_revision = "a7d90b1c3e42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("handover_checks") as batch:
        for side in ("lender", "borrower"):
            column = f"{side}_confirmed_by_user_id"
            batch.add_column(sa.Column(column, sa.Uuid(), nullable=True))
            batch.create_foreign_key(
                f"fk_handover_checks_{column}_users", "users", [column], ["id"]
            )
        batch.create_check_constraint(
            op.f("ck_handover_checks_distinct_pickup_signers"),
            "lender_confirmed_by_user_id <> borrower_confirmed_by_user_id",
        )

    op.execute(
        "UPDATE handover_checks AS checks "
        "SET lender_confirmed_at = NULL, borrower_confirmed_at = NULL "
        "FROM exchanges WHERE checks.exchange_id = exchanges.id "
        "AND checks.phase = 'pickup' AND exchanges.mode = 'loan' "
        "AND exchanges.status = 'scheduled' "
        "AND (checks.lender_confirmed_at IS NOT NULL OR checks.borrower_confirmed_at IS NOT NULL)"
    )


def downgrade() -> None:
    with op.batch_alter_table("handover_checks") as batch:
        batch.drop_constraint(
            op.f("ck_handover_checks_distinct_pickup_signers"), type_="check"
        )
        for side in ("lender", "borrower"):
            column = f"{side}_confirmed_by_user_id"
            batch.drop_constraint(
                f"fk_handover_checks_{column}_users", type_="foreignkey"
            )
            batch.drop_column(column)
