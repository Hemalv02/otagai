"""add assistant turns"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a7d90b1c3e42"
down_revision = "c3f1a2b4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_threads",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_threads_user_id_updated_at",
        "assistant_threads",
        ["user_id", "updated_at"],
    )
    op.create_table(
        "assistant_turns",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "thread_id",
            sa.Uuid(),
            sa.ForeignKey("assistant_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text()),
        sa.Column("reply", sa.Text(), nullable=False),
        sa.Column(
            "image_media_id",
            sa.Uuid(),
            sa.ForeignKey("media_files.id", ondelete="SET NULL"),
        ),
        sa.Column("context", JSONB(), nullable=False),
        sa.Column("draft", JSONB(), nullable=True),
        sa.Column(
            "request_id",
            sa.Uuid(),
            sa.ForeignKey("help_requests.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_turns_thread_id_created_at",
        "assistant_turns",
        ["thread_id", "created_at"],
    )
    op.execute("ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE assistant_turns ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        DECLARE role_name text;
        BEGIN
          FOR role_name IN SELECT rolname FROM pg_roles
              WHERE rolname IN ('anon', 'authenticated') LOOP
            EXECUTE format('REVOKE ALL ON TABLE assistant_threads, assistant_turns FROM %I', role_name);
          END LOOP;
        END $$;
    """)


def downgrade() -> None:
    op.drop_table("assistant_turns")
    op.drop_table("assistant_threads")
