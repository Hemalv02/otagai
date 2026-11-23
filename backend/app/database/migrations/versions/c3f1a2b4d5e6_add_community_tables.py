"""add community tables (notices, events, disaster alerts, check-in settings)"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c3f1a2b4d5e6"
down_revision = "bec0607dffe8"
branch_labels = None
depends_on = None

RLS_TABLES = (
    "notices",
    "community_events",
    "event_signups",
    "disaster_alerts",
    "disaster_check_ins",
    "check_in_settings",
)


def upgrade() -> None:
    op.create_table(
        "notices",
        sa.Column("circle_id", sa.Uuid(), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "lang IN ('ja', 'en', 'bn')", name=op.f("ck_notices_lang_valid")
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200", name=op.f("ck_notices_title_length")
        ),
        sa.CheckConstraint(
            "body IS NULL OR char_length(body) <= 5000",
            name=op.f("ck_notices_body_length"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_notices_circle_id_circles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["users.id"],
            name=op.f("fk_notices_author_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notices")),
    )
    op.create_index(
        "ix_notices_circle_id_created_at",
        "notices",
        ["circle_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "community_events",
        sa.Column("circle_id", sa.Uuid(), nullable=False),
        sa.Column("organizer_user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location_note", sa.Text(), nullable=True),
        sa.Column("capacity", sa.SmallInteger(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default=sa.text("'scheduled'"),
            nullable=False,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'cancelled')",
            name=op.f("ck_community_events_status_valid"),
        ),
        sa.CheckConstraint(
            "lang IN ('ja', 'en', 'bn')",
            name=op.f("ck_community_events_lang_valid"),
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200",
            name=op.f("ck_community_events_title_length"),
        ),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at >= starts_at",
            name=op.f("ck_community_events_event_window"),
        ),
        sa.CheckConstraint(
            "capacity IS NULL OR capacity > 0",
            name=op.f("ck_community_events_capacity_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_community_events_circle_id_circles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organizer_user_id"],
            ["users.id"],
            name=op.f("fk_community_events_organizer_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_community_events")),
    )
    op.create_index(
        "ix_community_events_circle_id_starts_at",
        "community_events",
        ["circle_id", "starts_at"],
        unique=False,
    )

    op.create_table(
        "event_signups",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "note IS NULL OR char_length(note) <= 500",
            name=op.f("ck_event_signups_note_length"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["community_events.id"],
            name=op.f("fk_event_signups_event_id_community_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_event_signups_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("event_id", "user_id", name=op.f("pk_event_signups")),
    )
    op.create_index(
        op.f("ix_event_signups_user_id"), "event_signups", ["user_id"], unique=False
    )

    op.create_table(
        "disaster_alerts",
        sa.Column("circle_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "severity IN ('info', 'warning', 'emergency')",
            name=op.f("ck_disaster_alerts_severity_valid"),
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200",
            name=op.f("ck_disaster_alerts_title_length"),
        ),
        sa.CheckConstraint(
            "message IS NULL OR char_length(message) <= 2000",
            name=op.f("ck_disaster_alerts_message_length"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_disaster_alerts_circle_id_circles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_disaster_alerts_created_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_disaster_alerts")),
    )
    op.create_index(
        "ix_disaster_alerts_circle_id_created_at",
        "disaster_alerts",
        ["circle_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "disaster_check_ins",
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('safe', 'need_help')",
            name=op.f("ck_disaster_check_ins_status_valid"),
        ),
        sa.CheckConstraint(
            "note IS NULL OR char_length(note) <= 1000",
            name=op.f("ck_disaster_check_ins_note_length"),
        ),
        sa.ForeignKeyConstraint(
            ["alert_id"],
            ["disaster_alerts.id"],
            name=op.f("fk_disaster_check_ins_alert_id_disaster_alerts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_disaster_check_ins_user_id_users"),
        ),
        sa.PrimaryKeyConstraint(
            "alert_id", "user_id", name=op.f("pk_disaster_check_ins")
        ),
    )

    op.create_table(
        "check_in_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "frequency_days",
            sa.SmallInteger(),
            server_default=sa.text("3"),
            nullable=False,
        ),
        sa.Column("buddy_user_id", sa.Uuid(), nullable=True),
        sa.Column("last_checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "frequency_days BETWEEN 1 AND 30",
            name=op.f("ck_check_in_settings_frequency_range"),
        ),
        sa.CheckConstraint(
            "buddy_user_id IS NULL OR buddy_user_id <> user_id",
            name=op.f("ck_check_in_settings_buddy_not_self"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_check_in_settings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["buddy_user_id"],
            ["users.id"],
            name=op.f("fk_check_in_settings_buddy_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_check_in_settings")),
    )

    for table in RLS_TABLES:
        op.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))


def downgrade() -> None:
    op.drop_table("check_in_settings")
    op.drop_table("disaster_check_ins")
    op.drop_index(
        "ix_disaster_alerts_circle_id_created_at", table_name="disaster_alerts"
    )
    op.drop_table("disaster_alerts")
    op.drop_index(op.f("ix_event_signups_user_id"), table_name="event_signups")
    op.drop_table("event_signups")
    op.drop_index(
        "ix_community_events_circle_id_starts_at", table_name="community_events"
    )
    op.drop_table("community_events")
    op.drop_index("ix_notices_circle_id_created_at", table_name="notices")
    op.drop_table("notices")
