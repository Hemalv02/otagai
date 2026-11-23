"""add push delivery outbox"""

import sqlalchemy as sa
from alembic import op

revision = "6db0a03d72a1"
down_revision = "c4913dc5a2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_deliveries",
        sa.Column(
            "notification_id",
            sa.Uuid(),
            sa.ForeignKey("notifications.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("push_token_id", sa.Uuid(), primary_key=True),
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "attempts", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("ticket_id", sa.Text()),
        sa.Column("ticket_created_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
    )
    op.create_index(
        "ix_push_deliveries_pending",
        "push_deliveries",
        ["available_at"],
        postgresql_where=sa.text("finished_at IS NULL"),
    )
    op.execute("ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        DECLARE role_name text;
        BEGIN
          FOR role_name IN SELECT rolname FROM pg_roles
              WHERE rolname IN ('anon', 'authenticated') LOOP
            EXECUTE format('REVOKE ALL ON TABLE push_deliveries FROM %I', role_name);
          END LOOP;
        END $$;
    """)


def downgrade() -> None:
    op.drop_table("push_deliveries")
