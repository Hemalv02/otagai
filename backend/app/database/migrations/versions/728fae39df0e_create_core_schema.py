"""create core schema"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "728fae39df0e"
down_revision = None
branch_labels = None
depends_on = None


RLS_TABLES = (
    "ai_runs",
    "ask_sessions",
    "blocks",
    "categories",
    "circle_invites",
    "circle_memberships",
    "circles",
    "conversation_participants",
    "conversations",
    "exchanges",
    "family_links",
    "handover_checks",
    "handover_items",
    "handover_media",
    "help_requests",
    "listing_media",
    "listing_parts",
    "listings",
    "loan_extensions",
    "media_files",
    "media_variants",
    "message_attachments",
    "messages",
    "notifications",
    "pair_stats",
    "payment_events",
    "payments",
    "points_ledger",
    "proxy_grants",
    "push_tokens",
    "reports",
    "request_media",
    "request_recipients",
    "request_responses",
    "thank_yous",
    "users",
    "alembic_version",
)


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("names", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("icon", sa.Text(), nullable=True),
        sa.Column(
            "is_risky", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
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
            "kind IN ('tool', 'skill')", name=op.f("ck_categories_kind_valid")
        ),
        sa.CheckConstraint(
            "slug ~ '^[a-z0-9_]{2,64}$'", name=op.f("ck_categories_slug_format")
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["categories.id"],
            name=op.f("fk_categories_parent_id_categories"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("slug", name=op.f("uq_categories_slug")),
    )
    op.create_index(
        op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False
    )
    op.create_table(
        "payment_events",
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_event_id", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.CheckConstraint(
            "provider IN ('stripe', 'bkash_mock', 'nagad_mock', 'cash')",
            name=op.f("ck_payment_events_provider_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_events")),
    )
    op.create_index(
        "uq_payment_events_provider_event",
        "payment_events",
        ["provider", "provider_event_id"],
        unique=True,
    )
    op.create_table(
        "users",
        sa.Column("auth_user_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("avatar_media_id", sa.Uuid(), nullable=True),
        sa.Column("preferred_language", sa.Text(), nullable=False),
        sa.Column(
            "languages",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("timezone", sa.Text(), server_default="Asia/Tokyo", nullable=False),
        sa.Column("age_band", sa.Text(), nullable=True),
        sa.Column("intro", sa.Text(), nullable=True),
        sa.Column("intro_lang", sa.Text(), nullable=True),
        sa.Column("happy_to_help_with", sa.Text(), nullable=True),
        sa.Column(
            "accepts_money_orei",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "simple_mode", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "text_scale_percent",
            sa.SmallInteger(),
            server_default=sa.text("100"),
            nullable=False,
        ),
        sa.Column(
            "push_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("quiet_hours_start", sa.Time(), nullable=True),
        sa.Column("quiet_hours_end", sa.Time(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(kind = 'self') = (auth_user_id IS NOT NULL)",
            name=op.f("ck_users_self_has_auth"),
        ),
        sa.CheckConstraint(
            "age_band IS NULL OR age_band IN ('under_30', '30s', '40s', '50s', '60s', '70s', '80_plus')",
            name=op.f("ck_users_age_band_valid"),
        ),
        sa.CheckConstraint(
            "intro_lang IS NULL OR intro_lang IN ('ja', 'en', 'bn')",
            name=op.f("ck_users_intro_lang_valid"),
        ),
        sa.CheckConstraint(
            "kind IN ('self', 'managed')", name=op.f("ck_users_kind_valid")
        ),
        sa.CheckConstraint(
            "preferred_language IN ('ja', 'en', 'bn')",
            name=op.f("ck_users_preferred_language_valid"),
        ),
        sa.CheckConstraint(
            "region IN ('jp', 'bd')", name=op.f("ck_users_region_valid")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended', 'deleted')",
            name=op.f("ck_users_status_valid"),
        ),
        sa.CheckConstraint(
            "char_length(display_name) BETWEEN 1 AND 80",
            name=op.f("ck_users_display_name_length"),
        ),
        sa.CheckConstraint(
            "text_scale_percent BETWEEN 80 AND 200",
            name=op.f("ck_users_text_scale_range"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_users_created_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("auth_user_id", name=op.f("uq_users_auth_user_id")),
    )
    op.create_table(
        "ai_runs",
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("feature", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("input", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
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
            "feature IN ('polite_writer', 'task_to_tools', 'photo_listing', 'handover_checklist', 'thank_you', 'extension_draft', 'translate', 'transcribe', 'intro_card')",
            name=op.f("ck_ai_runs_feature_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('succeeded', 'failed')", name=op.f("ck_ai_runs_status_valid")
        ),
        sa.CheckConstraint(
            "latency_ms IS NULL OR latency_ms >= 0",
            name=op.f("ck_ai_runs_latency_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_runs_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_runs")),
    )
    op.create_index(
        "ix_ai_runs_feature_created_at",
        "ai_runs",
        ["feature", "created_at"],
        unique=False,
    )
    op.create_index("ix_ai_runs_user_id", "ai_runs", ["user_id"], unique=False)
    op.create_table(
        "blocks",
        sa.Column("blocker_user_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "blocker_user_id <> blocked_user_id", name=op.f("ck_blocks_not_self")
        ),
        sa.ForeignKeyConstraint(
            ["blocked_user_id"],
            ["users.id"],
            name=op.f("fk_blocks_blocked_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["blocker_user_id"],
            ["users.id"],
            name=op.f("fk_blocks_blocker_user_id_users"),
        ),
        sa.PrimaryKeyConstraint(
            "blocker_user_id", "blocked_user_id", name=op.f("pk_blocks")
        ),
    )
    op.create_index(
        "ix_blocks_blocked_user_id", "blocks", ["blocked_user_id"], unique=False
    )
    op.create_table(
        "circles",
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("unit_type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "name_translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("approx_lat", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("approx_lng", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column(
            "open_to_nearby",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "region IN ('jp', 'bd')", name=op.f("ck_circles_region_valid")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')", name=op.f("ck_circles_status_valid")
        ),
        sa.CheckConstraint(
            "unit_type IN ('city', 'association', 'han', 'para', 'moholla', 'building')",
            name=op.f("ck_circles_unit_type_valid"),
        ),
        sa.CheckConstraint(
            "approx_lat IS NULL OR approx_lat BETWEEN -90 AND 90",
            name=op.f("ck_circles_lat_range"),
        ),
        sa.CheckConstraint(
            "approx_lng IS NULL OR approx_lng BETWEEN -180 AND 180",
            name=op.f("ck_circles_lng_range"),
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 120", name=op.f("ck_circles_name_length")
        ),
        sa.CheckConstraint(
            "parent_id IS NULL OR parent_id <> id",
            name=op.f("ck_circles_not_own_parent"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_circles_created_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["circles.id"], name=op.f("fk_circles_parent_id_circles")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_circles")),
    )
    op.create_index(
        op.f("ix_circles_parent_id"), "circles", ["parent_id"], unique=False
    )
    op.create_index(
        "ix_circles_region_status", "circles", ["region", "status"], unique=False
    )
    op.create_table(
        "family_links",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("relative_user_id", sa.Uuid(), nullable=False),
        sa.Column("relation", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "relation IN ('parent', 'child', 'sibling', 'spouse', 'grandparent', 'grandchild', 'other')",
            name=op.f("ck_family_links_relation_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked')",
            name=op.f("ck_family_links_status_valid"),
        ),
        sa.CheckConstraint(
            "user_id <> relative_user_id", name=op.f("ck_family_links_not_self")
        ),
        sa.ForeignKeyConstraint(
            ["relative_user_id"],
            ["users.id"],
            name=op.f("fk_family_links_relative_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_family_links_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_family_links")),
    )
    op.create_index(
        "ix_family_links_relative_user_id",
        "family_links",
        ["relative_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_family_links_user_id"), "family_links", ["user_id"], unique=False
    )
    op.create_index(
        "uq_family_links_pair",
        "family_links",
        [
            sa.literal_column("least(user_id, relative_user_id)"),
            sa.literal_column("greatest(user_id, relative_user_id)"),
        ],
        unique=True,
    )
    op.create_table(
        "media_files",
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="processing", nullable=False),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("byte_size", sa.BigInteger(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.Text(), nullable=True),
        sa.Column("blurhash", sa.Text(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delete_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(kind = 'audio') = (purpose = 'voice')",
            name=op.f("ck_media_files_audio_only_for_voice"),
        ),
        sa.CheckConstraint(
            "kind IN ('image', 'audio')", name=op.f("ck_media_files_kind_valid")
        ),
        sa.CheckConstraint(
            "purpose IN ('avatar', 'listing', 'ask', 'request', 'handover', 'chat', 'voice')",
            name=op.f("ck_media_files_purpose_valid"),
        ),
        sa.CheckConstraint(
            "sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'",
            name=op.f("ck_media_files_sha256_format"),
        ),
        sa.CheckConstraint(
            "status IN ('processing', 'ready', 'rejected', 'deleted')",
            name=op.f("ck_media_files_status_valid"),
        ),
        sa.CheckConstraint(
            "byte_size IS NULL OR byte_size > 0",
            name=op.f("ck_media_files_byte_size_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_media_files_owner_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name=op.f("fk_media_files_uploaded_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_media_files")),
    )
    op.create_index(
        "ix_media_files_delete_after",
        "media_files",
        ["delete_after"],
        unique=False,
        postgresql_where=sa.text("delete_after IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        op.f("ix_media_files_owner_user_id"),
        "media_files",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index("ix_media_files_sha256", "media_files", ["sha256"], unique=False)
    op.create_table(
        "notifications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True),
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
            "type IN ('request_nearby', 'request_direct', 'response_received', 'response_accepted', 'response_superseded', 'message', 'reminder', 'extension', 'thank_you', 'membership_decided', 'proxy_granted')",
            name=op.f("ck_notifications_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_notifications_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(
        "ix_notifications_unread",
        "notifications",
        ["user_id"],
        unique=False,
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.create_index(
        "ix_notifications_user_id_created_at",
        "notifications",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "pair_stats",
        sa.Column("user_low_id", sa.Uuid(), nullable=False),
        sa.Column("user_high_id", sa.Uuid(), nullable=False),
        sa.Column(
            "low_helped_high", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "high_helped_low", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("first_met_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_exchange_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "low_helped_high >= 0 AND high_helped_low >= 0",
            name=op.f("ck_pair_stats_counts_positive"),
        ),
        sa.CheckConstraint(
            "user_low_id < user_high_id", name=op.f("ck_pair_stats_ordered_pair")
        ),
        sa.ForeignKeyConstraint(
            ["user_high_id"],
            ["users.id"],
            name=op.f("fk_pair_stats_user_high_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["user_low_id"], ["users.id"], name=op.f("fk_pair_stats_user_low_id_users")
        ),
        sa.PrimaryKeyConstraint(
            "user_low_id", "user_high_id", name=op.f("pk_pair_stats")
        ),
    )
    op.create_index(
        "ix_pair_stats_user_high_id", "pair_stats", ["user_high_id"], unique=False
    )
    op.create_table(
        "payments",
        sa.Column("payer_user_id", sa.Uuid(), nullable=False),
        sa.Column("payee_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_payment_id", sa.Text(), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "status", sa.Text(), server_default="requires_payment", nullable=False
        ),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "currency IN ('JPY', 'BDT')", name=op.f("ck_payments_currency_valid")
        ),
        sa.CheckConstraint(
            "provider IN ('stripe', 'bkash_mock', 'nagad_mock', 'cash')",
            name=op.f("ck_payments_provider_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('requires_payment', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')",
            name=op.f("ck_payments_status_valid"),
        ),
        sa.CheckConstraint(
            "amount_minor > 0", name=op.f("ck_payments_amount_positive")
        ),
        sa.CheckConstraint(
            "payer_user_id <> payee_user_id", name=op.f("ck_payments_distinct_people")
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_payments_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["payee_user_id"],
            ["users.id"],
            name=op.f("fk_payments_payee_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["payer_user_id"],
            ["users.id"],
            name=op.f("fk_payments_payer_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint(
            "idempotency_key", name=op.f("uq_payments_idempotency_key")
        ),
        sa.UniqueConstraint(
            "provider_payment_id", name=op.f("uq_payments_provider_payment_id")
        ),
    )
    op.create_index(
        "ix_payments_payee_user_id", "payments", ["payee_user_id"], unique=False
    )
    op.create_index(
        "ix_payments_payer_user_id", "payments", ["payer_user_id"], unique=False
    )
    op.create_table(
        "proxy_grants",
        sa.Column("member_user_id", sa.Uuid(), nullable=False),
        sa.Column("caretaker_user_id", sa.Uuid(), nullable=False),
        sa.Column("caretaker_role", sa.Text(), nullable=False),
        sa.Column(
            "can_post_requests",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "can_chat", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "can_thank_and_pay",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "can_view_activity",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "can_manage_listings",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("consent_method", sa.Text(), nullable=False),
        sa.Column("consent_witness_user_id", sa.Uuid(), nullable=True),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "caretaker_role IN ('family', 'welfare_volunteer', 'coordinator')",
            name=op.f("ck_proxy_grants_caretaker_role_valid"),
        ),
        sa.CheckConstraint(
            "consent_method IN ('in_person', 'via_coordinator', 'phone_call')",
            name=op.f("ck_proxy_grants_consent_method_valid"),
        ),
        sa.CheckConstraint(
            "member_user_id <> caretaker_user_id", name=op.f("ck_proxy_grants_not_self")
        ),
        sa.ForeignKeyConstraint(
            ["caretaker_user_id"],
            ["users.id"],
            name=op.f("fk_proxy_grants_caretaker_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["consent_witness_user_id"],
            ["users.id"],
            name=op.f("fk_proxy_grants_consent_witness_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["member_user_id"],
            ["users.id"],
            name=op.f("fk_proxy_grants_member_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by_user_id"],
            ["users.id"],
            name=op.f("fk_proxy_grants_revoked_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proxy_grants")),
    )
    op.create_index(
        "ix_proxy_grants_active_caretaker",
        "proxy_grants",
        ["caretaker_user_id"],
        unique=False,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "uq_proxy_grants_active_pair",
        "proxy_grants",
        ["member_user_id", "caretaker_user_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_table(
        "push_tokens",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expo_token", sa.Text(), nullable=False),
        sa.Column("platform", sa.Text(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
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
            "platform IN ('ios', 'android', 'web')",
            name=op.f("ck_push_tokens_platform_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_push_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_tokens")),
        sa.UniqueConstraint("expo_token", name=op.f("uq_push_tokens_expo_token")),
    )
    op.create_index(
        op.f("ix_push_tokens_user_id"), "push_tokens", ["user_id"], unique=False
    )
    op.create_table(
        "circle_invites",
        sa.Column("circle_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column(
            "use_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "auto_approve",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
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
            "char_length(code) BETWEEN 8 AND 32",
            name=op.f("ck_circle_invites_code_length"),
        ),
        sa.CheckConstraint(
            "max_uses IS NULL OR max_uses > 0",
            name=op.f("ck_circle_invites_max_uses_positive"),
        ),
        sa.CheckConstraint(
            "use_count >= 0 AND (max_uses IS NULL OR use_count <= max_uses)",
            name=op.f("ck_circle_invites_use_count_range"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_circle_invites_circle_id_circles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_circle_invites_created_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_circle_invites")),
        sa.UniqueConstraint("code", name=op.f("uq_circle_invites_code")),
    )
    op.create_index(
        op.f("ix_circle_invites_circle_id"),
        "circle_invites",
        ["circle_id"],
        unique=False,
    )
    op.create_table(
        "listings",
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("safety_notes", sa.Text(), nullable=True),
        sa.Column("lend_mode", sa.Text(), nullable=False),
        sa.Column("max_loan_days", sa.SmallInteger(), nullable=True),
        sa.Column("availability_note", sa.Text(), nullable=True),
        sa.Column(
            "visibility", sa.Text(), server_default="association", nullable=False
        ),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("available_again_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_run_id", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind = 'tool' OR lend_mode = 'help_only'",
            name=op.f("ck_listings_skill_is_help_only"),
        ),
        sa.CheckConstraint(
            "kind IN ('tool', 'skill')", name=op.f("ck_listings_kind_valid")
        ),
        sa.CheckConstraint(
            "lang IN ('ja', 'en', 'bn')", name=op.f("ck_listings_lang_valid")
        ),
        sa.CheckConstraint(
            "lend_mode IN ('lend', 'help_only', 'lend_or_help')",
            name=op.f("ck_listings_lend_mode_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'paused', 'lent_out', 'deleted')",
            name=op.f("ck_listings_status_valid"),
        ),
        sa.CheckConstraint(
            "visibility IN ('han', 'association', 'nearby')",
            name=op.f("ck_listings_visibility_valid"),
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 120",
            name=op.f("ck_listings_title_length"),
        ),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) <= 2000",
            name=op.f("ck_listings_description_length"),
        ),
        sa.CheckConstraint(
            "max_loan_days IS NULL OR max_loan_days BETWEEN 1 AND 60",
            name=op.f("ck_listings_max_loan_days_range"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_listings_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["ai_run_id"],
            ["ai_runs.id"],
            name=op.f("fk_listings_ai_run_id_ai_runs"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_listings_category_id_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_listings_owner_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_listings")),
    )
    op.create_index(
        "ix_listings_category_id_status",
        "listings",
        ["category_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_listings_owner_user_id_status",
        "listings",
        ["owner_user_id", "status"],
        unique=False,
    )
    op.create_table(
        "media_variants",
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column("variant", sa.Text(), nullable=False),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "mime_type IN ('image/webp', 'image/jpeg', 'image/png', 'audio/mp4')",
            name=op.f("ck_media_variants_mime_type_valid"),
        ),
        sa.CheckConstraint(
            "s3_key ~ '^media/[0-9a-f-]{36}/[a-z]+\\.[a-z0-9]+$'",
            name=op.f("ck_media_variants_s3_key_format"),
        ),
        sa.CheckConstraint(
            "variant IN ('thumb', 'display', 'audio')",
            name=op.f("ck_media_variants_variant_valid"),
        ),
        sa.CheckConstraint(
            "byte_size > 0", name=op.f("ck_media_variants_byte_size_positive")
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_files.id"],
            name=op.f("fk_media_variants_media_id_media_files"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("media_id", "variant", name=op.f("pk_media_variants")),
        sa.UniqueConstraint("s3_key", name=op.f("uq_media_variants_s3_key")),
    )
    op.create_table(
        "reports",
        sa.Column("reporter_user_id", sa.Uuid(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("circle_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "reason IN ('spam', 'harassment', 'unsafe', 'scam', 'other')",
            name=op.f("ck_reports_reason_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'reviewing', 'resolved', 'dismissed')",
            name=op.f("ck_reports_status_valid"),
        ),
        sa.CheckConstraint(
            "target_type IN ('user', 'listing', 'message', 'request')",
            name=op.f("ck_reports_target_type_valid"),
        ),
        sa.CheckConstraint(
            "details IS NULL OR char_length(details) <= 2000",
            name=op.f("ck_reports_details_length"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_reports_circle_id_circles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reporter_user_id"],
            ["users.id"],
            name=op.f("fk_reports_reporter_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["users.id"],
            name=op.f("fk_reports_resolved_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reports")),
    )
    op.create_index(
        "ix_reports_circle_id_status", "reports", ["circle_id", "status"], unique=False
    )
    op.create_index(
        "ix_reports_target", "reports", ["target_type", "target_id"], unique=False
    )
    op.create_table(
        "circle_memberships",
        sa.Column("circle_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.Text(), server_default="member", nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("joined_via", sa.Text(), nullable=False),
        sa.Column("invite_id", sa.Uuid(), nullable=True),
        sa.Column("decided_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "joined_via IN ('invite', 'qr', 'search', 'seeded', 'coordinator')",
            name=op.f("ck_circle_memberships_joined_via_valid"),
        ),
        sa.CheckConstraint(
            "role IN ('member', 'leader', 'coordinator')",
            name=op.f("ck_circle_memberships_role_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'removed', 'left')",
            name=op.f("ck_circle_memberships_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["circle_id"],
            ["circles.id"],
            name=op.f("fk_circle_memberships_circle_id_circles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_user_id"],
            ["users.id"],
            name=op.f("fk_circle_memberships_decided_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["invite_id"],
            ["circle_invites.id"],
            name=op.f("fk_circle_memberships_invite_id_circle_invites"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_circle_memberships_user_id_users")
        ),
        sa.PrimaryKeyConstraint(
            "circle_id", "user_id", name=op.f("pk_circle_memberships")
        ),
    )
    op.create_index(
        "ix_circle_memberships_approved",
        "circle_memberships",
        ["circle_id"],
        unique=False,
        postgresql_where=sa.text("status = 'approved'"),
    )
    op.create_index(
        "ix_circle_memberships_user_id_status",
        "circle_memberships",
        ["user_id", "status"],
        unique=False,
    )
    op.create_table(
        "help_requests",
        sa.Column("requester_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column("direct_to_user_id", sa.Uuid(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("polite_text", sa.Text(), nullable=False),
        sa.Column("tone", sa.Text(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("needed_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("needed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("home_circle_id", sa.Uuid(), nullable=False),
        sa.Column("ripple_stage", sa.Text(), nullable=False),
        sa.Column("ripple_max_stage", sa.Text(), nullable=False),
        sa.Column("next_widen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(direct_to_user_id IS NOT NULL) = (ripple_max_stage = 'direct')",
            name=op.f("ck_help_requests_direct_stage"),
        ),
        sa.CheckConstraint(
            "kind IN ('borrow', 'help', 'borrow_with_help')",
            name=op.f("ck_help_requests_kind_valid"),
        ),
        sa.CheckConstraint(
            "lang IN ('ja', 'en', 'bn')", name=op.f("ck_help_requests_lang_valid")
        ),
        sa.CheckConstraint(
            "region IN ('jp', 'bd')", name=op.f("ck_help_requests_region_valid")
        ),
        sa.CheckConstraint(
            "ripple_max_stage IN ('direct', 'family', 'han', 'association', 'nearby')",
            name=op.f("ck_help_requests_ripple_max_stage_valid"),
        ),
        sa.CheckConstraint(
            "ripple_stage IN ('direct', 'family', 'han', 'association', 'nearby')",
            name=op.f("ck_help_requests_ripple_stage_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'matched', 'in_progress', 'done', 'cancelled', 'expired')",
            name=op.f("ck_help_requests_status_valid"),
        ),
        sa.CheckConstraint(
            "tone IN ('keigo', 'polite', 'casual')",
            name=op.f("ck_help_requests_tone_valid"),
        ),
        sa.CheckConstraint(
            "char_length(polite_text) BETWEEN 1 AND 2000",
            name=op.f("ck_help_requests_polite_text_length"),
        ),
        sa.CheckConstraint(
            "char_length(raw_text) BETWEEN 1 AND 2000",
            name=op.f("ck_help_requests_raw_text_length"),
        ),
        sa.CheckConstraint(
            "direct_to_user_id IS NULL OR direct_to_user_id <> requester_user_id",
            name=op.f("ck_help_requests_not_direct_to_self"),
        ),
        sa.CheckConstraint(
            "needed_until IS NULL OR needed_from IS NULL OR needed_until >= needed_from",
            name=op.f("ck_help_requests_needed_window"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_help_requests_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_help_requests_category_id_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["direct_to_user_id"],
            ["users.id"],
            name=op.f("fk_help_requests_direct_to_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["home_circle_id"],
            ["circles.id"],
            name=op.f("fk_help_requests_home_circle_id_circles"),
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_help_requests_listing_id_listings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["requester_user_id"],
            ["users.id"],
            name=op.f("fk_help_requests_requester_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_help_requests")),
    )
    op.create_index(
        "ix_help_requests_direct_to_user_id",
        "help_requests",
        ["direct_to_user_id"],
        unique=False,
        postgresql_where=sa.text("direct_to_user_id IS NOT NULL"),
    )
    op.create_index(
        "ix_help_requests_home_circle_id_status",
        "help_requests",
        ["home_circle_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_help_requests_open_widen",
        "help_requests",
        ["next_widen_at"],
        unique=False,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.create_index(
        "ix_help_requests_requester_user_id_status",
        "help_requests",
        ["requester_user_id", "status"],
        unique=False,
    )
    op.create_table(
        "listing_media",
        sa.Column("listing_id", sa.Uuid(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_listing_media_listing_id_listings"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_files.id"],
            name=op.f("fk_listing_media_media_id_media_files"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "listing_id", "media_id", name=op.f("pk_listing_media")
        ),
        sa.UniqueConstraint("media_id", name=op.f("uq_listing_media_media_id")),
    )
    op.create_table(
        "listing_parts",
        sa.Column("listing_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column(
            "quantity", sa.SmallInteger(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.CheckConstraint(
            "char_length(label) BETWEEN 1 AND 120",
            name=op.f("ck_listing_parts_label_length"),
        ),
        sa.CheckConstraint(
            "quantity >= 1", name=op.f("ck_listing_parts_quantity_positive")
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_listing_parts_listing_id_listings"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_listing_parts")),
    )
    op.create_index(
        op.f("ix_listing_parts_listing_id"),
        "listing_parts",
        ["listing_id"],
        unique=False,
    )
    op.create_table(
        "ask_sessions",
        sa.Column("subject_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("input_mode", sa.Text(), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("input_media_id", sa.Uuid(), nullable=True),
        sa.Column("clarifying_question", sa.Text(), nullable=True),
        sa.Column("clarifying_answer", sa.Text(), nullable=True),
        sa.Column(
            "identified",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("status", sa.Text(), server_default="clarifying", nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "input_mode IN ('text', 'voice', 'photo')",
            name=op.f("ck_ask_sessions_input_mode_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('clarifying', 'results', 'drafted', 'sent', 'abandoned')",
            name=op.f("ck_ask_sessions_status_valid"),
        ),
        sa.CheckConstraint(
            "input_text IS NULL OR char_length(input_text) <= 2000",
            name=op.f("ck_ask_sessions_input_text_length"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_ask_sessions_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["input_media_id"],
            ["media_files.id"],
            name=op.f("fk_ask_sessions_input_media_id_media_files"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_ask_sessions_request_id_help_requests"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["subject_user_id"],
            ["users.id"],
            name=op.f("fk_ask_sessions_subject_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ask_sessions")),
    )
    op.create_index(
        "ix_ask_sessions_subject_user_id",
        "ask_sessions",
        ["subject_user_id"],
        unique=False,
    )
    op.create_table(
        "request_media",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_files.id"],
            name=op.f("fk_request_media_media_id_media_files"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_request_media_request_id_help_requests"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "request_id", "media_id", name=op.f("pk_request_media")
        ),
    )
    op.create_table(
        "request_recipients",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("stage", sa.Text(), nullable=False),
        sa.Column(
            "notified_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("match_score", sa.Double(), nullable=True),
        sa.Column(
            "match_reasons",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "stage IN ('direct', 'family', 'han', 'association', 'nearby')",
            name=op.f("ck_request_recipients_stage_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_request_recipients_request_id_help_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_request_recipients_user_id_users")
        ),
        sa.PrimaryKeyConstraint(
            "request_id", "user_id", name=op.f("pk_request_recipients")
        ),
    )
    op.create_index(
        "ix_request_recipients_user_id_notified_at",
        "request_recipients",
        ["user_id", "notified_at"],
        unique=False,
    )
    op.create_table(
        "request_responses",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("responder_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column(
            "brings_tool", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("proposed_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("proposed_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=True),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind <> 'counter_time' OR proposed_start IS NOT NULL",
            name=op.f("ck_request_responses_counter_has_time"),
        ),
        sa.CheckConstraint(
            "kind IN ('offer', 'question', 'counter_time')",
            name=op.f("ck_request_responses_kind_valid"),
        ),
        sa.CheckConstraint(
            "lang IS NULL OR lang IN ('ja', 'en', 'bn')",
            name=op.f("ck_request_responses_lang_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'superseded', 'withdrawn', 'expired')",
            name=op.f("ck_request_responses_status_valid"),
        ),
        sa.CheckConstraint(
            "message IS NULL OR char_length(message) <= 2000",
            name=op.f("ck_request_responses_message_length"),
        ),
        sa.CheckConstraint(
            "proposed_end IS NULL OR proposed_start IS NULL OR proposed_end >= proposed_start",
            name=op.f("ck_request_responses_proposed_window"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_request_responses_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_request_responses_listing_id_listings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_request_responses_request_id_help_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["responder_user_id"],
            ["users.id"],
            name=op.f("fk_request_responses_responder_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_request_responses")),
    )
    op.create_index(
        "ix_request_responses_responder_user_id",
        "request_responses",
        ["responder_user_id"],
        unique=False,
    )
    op.create_index(
        "uq_request_responses_live_responder",
        "request_responses",
        ["request_id", "responder_user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'accepted')"),
    )
    op.create_index(
        "uq_request_responses_one_accepted",
        "request_responses",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("status = 'accepted'"),
    )
    op.create_table(
        "conversations",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=True),
        sa.Column("response_id", sa.Uuid(), nullable=True),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column("direct_key", sa.Text(), nullable=True),
        sa.Column("started_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(kind = 'request' AND request_id IS NOT NULL AND response_id IS NOT NULL AND listing_id IS NULL AND direct_key IS NULL) OR (kind = 'listing' AND listing_id IS NOT NULL AND request_id IS NULL AND response_id IS NULL AND direct_key IS NULL) OR (kind = 'direct' AND direct_key IS NOT NULL AND request_id IS NULL AND response_id IS NULL AND listing_id IS NULL)",
            name=op.f("ck_conversations_kind_columns"),
        ),
        sa.CheckConstraint(
            "kind IN ('request', 'listing', 'direct')",
            name=op.f("ck_conversations_kind_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'closed', 'locked')",
            name=op.f("ck_conversations_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_conversations_listing_id_listings"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_conversations_request_id_help_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["response_id"],
            ["request_responses.id"],
            name=op.f("fk_conversations_response_id_request_responses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["started_by_user_id"],
            ["users.id"],
            name=op.f("fk_conversations_started_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_conversations")),
        sa.UniqueConstraint("direct_key", name=op.f("uq_conversations_direct_key")),
        sa.UniqueConstraint("response_id", name=op.f("uq_conversations_response_id")),
    )
    op.create_index(
        "ix_conversations_request_id", "conversations", ["request_id"], unique=False
    )
    op.create_index(
        "uq_conversations_listing_starter",
        "conversations",
        ["listing_id", "started_by_user_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'listing'"),
    )
    op.create_table(
        "exchanges",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("response_id", sa.Uuid(), nullable=False),
        sa.Column("requester_user_id", sa.Uuid(), nullable=False),
        sa.Column("helper_user_id", sa.Uuid(), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=True),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="scheduled", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meet_place_note", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handed_over_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requester_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("helper_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "mode = 'loan' OR due_at IS NULL",
            name=op.f("ck_exchanges_due_only_for_loan"),
        ),
        sa.CheckConstraint(
            "mode IN ('loan', 'help')", name=op.f("ck_exchanges_mode_valid")
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'active', 'returned', 'completed', 'cancelled', 'disputed')",
            name=op.f("ck_exchanges_status_valid"),
        ),
        sa.CheckConstraint(
            "meet_place_note IS NULL OR char_length(meet_place_note) <= 200",
            name=op.f("ck_exchanges_meet_place_length"),
        ),
        sa.CheckConstraint(
            "requester_user_id <> helper_user_id",
            name=op.f("ck_exchanges_distinct_people"),
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by_user_id"],
            ["users.id"],
            name=op.f("fk_exchanges_cancelled_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["helper_user_id"],
            ["users.id"],
            name=op.f("fk_exchanges_helper_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_exchanges_listing_id_listings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_exchanges_request_id_help_requests"),
        ),
        sa.ForeignKeyConstraint(
            ["requester_user_id"],
            ["users.id"],
            name=op.f("fk_exchanges_requester_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["response_id"],
            ["request_responses.id"],
            name=op.f("fk_exchanges_response_id_request_responses"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exchanges")),
        sa.UniqueConstraint("response_id", name=op.f("uq_exchanges_response_id")),
    )
    op.create_index(
        "ix_exchanges_active_due_at",
        "exchanges",
        ["due_at"],
        unique=False,
        postgresql_where=sa.text("status = 'active' AND due_at IS NOT NULL"),
    )
    op.create_index(
        "ix_exchanges_helper_user_id_status",
        "exchanges",
        ["helper_user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_exchanges_requester_user_id_status",
        "exchanges",
        ["requester_user_id", "status"],
        unique=False,
    )
    op.create_index(
        "uq_exchanges_live_request",
        "exchanges",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'cancelled'"),
    )
    op.create_table(
        "conversation_participants",
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("muted_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('requester', 'responder', 'owner', 'asker', 'member')",
            name=op.f("ck_conversation_participants_role_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("fk_conversation_participants_conversation_id_conversations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_conversation_participants_user_id_users"),
        ),
        sa.PrimaryKeyConstraint(
            "conversation_id", "user_id", name=op.f("pk_conversation_participants")
        ),
    )
    op.create_index(
        "ix_conversation_participants_user_id",
        "conversation_participants",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "handover_checks",
        sa.Column("exchange_id", sa.Uuid(), nullable=False),
        sa.Column("phase", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("lender_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("borrower_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_run_id", sa.Uuid(), nullable=True),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "phase IN ('pickup', 'return')", name=op.f("ck_handover_checks_phase_valid")
        ),
        sa.ForeignKeyConstraint(
            ["ai_run_id"],
            ["ai_runs.id"],
            name=op.f("fk_handover_checks_ai_run_id_ai_runs"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_handover_checks_created_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["exchange_id"],
            ["exchanges.id"],
            name=op.f("fk_handover_checks_exchange_id_exchanges"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_handover_checks")),
    )
    op.create_index(
        "uq_handover_checks_exchange_id_phase",
        "handover_checks",
        ["exchange_id", "phase"],
        unique=True,
    )
    op.create_table(
        "loan_extensions",
        sa.Column("exchange_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("new_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('pending', 'accepted', 'declined')",
            name=op.f("ck_loan_extensions_status_valid"),
        ),
        sa.CheckConstraint(
            "message IS NULL OR char_length(message) <= 1000",
            name=op.f("ck_loan_extensions_message_length"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_loan_extensions_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["exchange_id"],
            ["exchanges.id"],
            name=op.f("fk_loan_extensions_exchange_id_exchanges"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            name=op.f("fk_loan_extensions_requested_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_loan_extensions")),
    )
    op.create_index(
        op.f("ix_loan_extensions_exchange_id"),
        "loan_extensions",
        ["exchange_id"],
        unique=False,
    )
    op.create_index(
        "uq_loan_extensions_one_pending",
        "loan_extensions",
        ["exchange_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "messages",
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_user_id", sa.Uuid(), nullable=True),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("client_message_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=True),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "translation_status", sa.Text(), server_default="none", nullable=False
        ),
        sa.Column(
            "ai_assisted", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("card_type", sa.Text(), nullable=True),
        sa.Column("card_ref_id", sa.Uuid(), nullable=True),
        sa.Column("reply_to_message_id", sa.Uuid(), nullable=True),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "(kind = 'card') = (card_type IS NOT NULL AND card_ref_id IS NOT NULL)",
            name=op.f("ck_messages_card_has_ref"),
        ),
        sa.CheckConstraint(
            "(kind = 'system') = (sender_user_id IS NULL)",
            name=op.f("ck_messages_system_has_no_sender"),
        ),
        sa.CheckConstraint(
            "card_type IS NULL OR card_type IN ('time_proposal', 'extension_request', 'handover_check', 'thank_you')",
            name=op.f("ck_messages_card_type_valid"),
        ),
        sa.CheckConstraint(
            "kind IN ('text', 'image', 'voice', 'system', 'card')",
            name=op.f("ck_messages_kind_valid"),
        ),
        sa.CheckConstraint(
            "kind NOT IN ('text', 'system') OR body IS NOT NULL",
            name=op.f("ck_messages_text_has_body"),
        ),
        sa.CheckConstraint(
            "lang IS NULL OR lang IN ('ja', 'en', 'bn')",
            name=op.f("ck_messages_lang_valid"),
        ),
        sa.CheckConstraint(
            "translation_status IN ('none', 'pending', 'done', 'failed')",
            name=op.f("ck_messages_translation_status_valid"),
        ),
        sa.CheckConstraint(
            "body IS NULL OR char_length(body) <= 4000",
            name=op.f("ck_messages_body_length"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_messages_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("fk_messages_conversation_id_conversations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reply_to_message_id"],
            ["messages.id"],
            name=op.f("fk_messages_reply_to_message_id_messages"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["sender_user_id"],
            ["users.id"],
            name=op.f("fk_messages_sender_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_messages")),
    )
    op.create_index(
        "ix_messages_conversation_created",
        "messages",
        ["conversation_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "uq_messages_client_message",
        "messages",
        ["conversation_id", "sender_user_id", "client_message_id"],
        unique=True,
    )
    op.create_table(
        "thank_yous",
        sa.Column("exchange_id", sa.Uuid(), nullable=False),
        sa.Column("from_user_id", sa.Uuid(), nullable=False),
        sa.Column("to_user_id", sa.Uuid(), nullable=False),
        sa.Column("acted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("lang", sa.Text(), nullable=True),
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "ai_drafted", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("gift_type", sa.Text(), nullable=False),
        sa.Column("points_amount", sa.Integer(), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.CHAR(length=3), nullable=True),
        sa.Column("money_status", sa.Text(), server_default="none", nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=True),
        sa.Column(
            "show_on_wall",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(gift_type = 'money') = (amount_minor IS NOT NULL AND currency IS NOT NULL)",
            name=op.f("ck_thank_yous_money_has_amount"),
        ),
        sa.CheckConstraint(
            "(gift_type = 'points') = (points_amount IS NOT NULL)",
            name=op.f("ck_thank_yous_points_has_amount"),
        ),
        sa.CheckConstraint(
            "currency IS NULL OR currency IN ('JPY', 'BDT')",
            name=op.f("ck_thank_yous_currency_valid"),
        ),
        sa.CheckConstraint(
            "gift_type IN ('note', 'sweets', 'points', 'money')",
            name=op.f("ck_thank_yous_gift_type_valid"),
        ),
        sa.CheckConstraint(
            "lang IS NULL OR lang IN ('ja', 'en', 'bn')",
            name=op.f("ck_thank_yous_lang_valid"),
        ),
        sa.CheckConstraint(
            "money_status IN ('none', 'offered', 'declined', 'paid', 'failed')",
            name=op.f("ck_thank_yous_money_status_valid"),
        ),
        sa.CheckConstraint(
            "amount_minor IS NULL OR amount_minor > 0",
            name=op.f("ck_thank_yous_amount_positive"),
        ),
        sa.CheckConstraint(
            "from_user_id <> to_user_id", name=op.f("ck_thank_yous_distinct_people")
        ),
        sa.CheckConstraint(
            "note IS NULL OR char_length(note) <= 1000",
            name=op.f("ck_thank_yous_note_length"),
        ),
        sa.CheckConstraint(
            "points_amount IS NULL OR points_amount > 0",
            name=op.f("ck_thank_yous_points_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_user_id"],
            ["users.id"],
            name=op.f("fk_thank_yous_acted_by_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["exchange_id"],
            ["exchanges.id"],
            name=op.f("fk_thank_yous_exchange_id_exchanges"),
        ),
        sa.ForeignKeyConstraint(
            ["from_user_id"],
            ["users.id"],
            name=op.f("fk_thank_yous_from_user_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name=op.f("fk_thank_yous_payment_id_payments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["to_user_id"], ["users.id"], name=op.f("fk_thank_yous_to_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_thank_yous")),
        sa.UniqueConstraint("payment_id", name=op.f("uq_thank_yous_payment_id")),
    )
    op.create_index(
        "ix_thank_yous_to_user_id", "thank_yous", ["to_user_id"], unique=False
    )
    op.create_index(
        "uq_thank_yous_exchange_id_from_user_id",
        "thank_yous",
        ["exchange_id", "from_user_id"],
        unique=True,
    )
    op.create_table(
        "handover_items",
        sa.Column("check_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column(
            "quantity", sa.SmallInteger(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("present", sa.Boolean(), nullable=True),
        sa.Column("disputed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("dispute_note", sa.Text(), nullable=True),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.CheckConstraint(
            "source IN ('listing_part', 'ai', 'manual')",
            name=op.f("ck_handover_items_source_valid"),
        ),
        sa.CheckConstraint(
            "char_length(label) BETWEEN 1 AND 120",
            name=op.f("ck_handover_items_label_length"),
        ),
        sa.CheckConstraint(
            "quantity >= 1", name=op.f("ck_handover_items_quantity_positive")
        ),
        sa.ForeignKeyConstraint(
            ["check_id"],
            ["handover_checks.id"],
            name=op.f("fk_handover_items_check_id_handover_checks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["disputed_by_user_id"],
            ["users.id"],
            name=op.f("fk_handover_items_disputed_by_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_handover_items")),
    )
    op.create_index(
        op.f("ix_handover_items_check_id"), "handover_items", ["check_id"], unique=False
    )
    op.create_table(
        "message_attachments",
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column(
            "sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_files.id"],
            name=op.f("fk_message_attachments_media_id_media_files"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            name=op.f("fk_message_attachments_message_id_messages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "message_id", "media_id", name=op.f("pk_message_attachments")
        ),
    )
    op.create_table(
        "points_ledger",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("thank_you_id", sa.Uuid(), nullable=True),
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
            "reason IN ('thank_you', 'welcome', 'adjustment')",
            name=op.f("ck_points_ledger_reason_valid"),
        ),
        sa.CheckConstraint("delta <> 0", name=op.f("ck_points_ledger_delta_nonzero")),
        sa.ForeignKeyConstraint(
            ["thank_you_id"],
            ["thank_yous.id"],
            name=op.f("fk_points_ledger_thank_you_id_thank_yous"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_points_ledger_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_points_ledger")),
    )
    op.create_index(
        op.f("ix_points_ledger_user_id"), "points_ledger", ["user_id"], unique=False
    )
    op.create_index(
        "uq_points_ledger_thank_you_id_user_id",
        "points_ledger",
        ["thank_you_id", "user_id"],
        unique=True,
    )
    op.create_table(
        "handover_media",
        sa.Column("check_id", sa.Uuid(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["check_id"],
            ["handover_checks.id"],
            name=op.f("fk_handover_media_check_id_handover_checks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["handover_items.id"],
            name=op.f("fk_handover_media_item_id_handover_items"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_files.id"],
            name=op.f("fk_handover_media_media_id_media_files"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("check_id", "media_id", name=op.f("pk_handover_media")),
    )

    op.create_foreign_key(
        op.f("fk_users_avatar_media_id_media_files"),
        "users",
        "media_files",
        ["avatar_media_id"],
        ["id"],
        ondelete="SET NULL",
    )
    for table in RLS_TABLES:
        op.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_users_avatar_media_id_media_files"), "users", type_="foreignkey"
    )
    op.drop_table("handover_media")
    op.drop_index("uq_points_ledger_thank_you_id_user_id", table_name="points_ledger")
    op.drop_index(op.f("ix_points_ledger_user_id"), table_name="points_ledger")
    op.drop_table("points_ledger")
    op.drop_table("message_attachments")
    op.drop_index(op.f("ix_handover_items_check_id"), table_name="handover_items")
    op.drop_table("handover_items")
    op.drop_index("uq_thank_yous_exchange_id_from_user_id", table_name="thank_yous")
    op.drop_index("ix_thank_yous_to_user_id", table_name="thank_yous")
    op.drop_table("thank_yous")
    op.drop_index("uq_messages_client_message", table_name="messages")
    op.drop_index("ix_messages_conversation_created", table_name="messages")
    op.drop_table("messages")
    op.drop_index(
        "uq_loan_extensions_one_pending",
        table_name="loan_extensions",
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.drop_index(op.f("ix_loan_extensions_exchange_id"), table_name="loan_extensions")
    op.drop_table("loan_extensions")
    op.drop_index("uq_handover_checks_exchange_id_phase", table_name="handover_checks")
    op.drop_table("handover_checks")
    op.drop_index(
        "ix_conversation_participants_user_id", table_name="conversation_participants"
    )
    op.drop_table("conversation_participants")
    op.drop_index(
        "uq_exchanges_live_request",
        table_name="exchanges",
        postgresql_where=sa.text("status <> 'cancelled'"),
    )
    op.drop_index("ix_exchanges_requester_user_id_status", table_name="exchanges")
    op.drop_index("ix_exchanges_helper_user_id_status", table_name="exchanges")
    op.drop_index(
        "ix_exchanges_active_due_at",
        table_name="exchanges",
        postgresql_where=sa.text("status = 'active' AND due_at IS NOT NULL"),
    )
    op.drop_table("exchanges")
    op.drop_index(
        "uq_conversations_listing_starter",
        table_name="conversations",
        postgresql_where=sa.text("kind = 'listing'"),
    )
    op.drop_index("ix_conversations_request_id", table_name="conversations")
    op.drop_table("conversations")
    op.drop_index(
        "uq_request_responses_one_accepted",
        table_name="request_responses",
        postgresql_where=sa.text("status = 'accepted'"),
    )
    op.drop_index(
        "uq_request_responses_live_responder",
        table_name="request_responses",
        postgresql_where=sa.text("status IN ('pending', 'accepted')"),
    )
    op.drop_index(
        "ix_request_responses_responder_user_id", table_name="request_responses"
    )
    op.drop_table("request_responses")
    op.drop_index(
        "ix_request_recipients_user_id_notified_at", table_name="request_recipients"
    )
    op.drop_table("request_recipients")
    op.drop_table("request_media")
    op.drop_index("ix_ask_sessions_subject_user_id", table_name="ask_sessions")
    op.drop_table("ask_sessions")
    op.drop_index(op.f("ix_listing_parts_listing_id"), table_name="listing_parts")
    op.drop_table("listing_parts")
    op.drop_table("listing_media")
    op.drop_index(
        "ix_help_requests_requester_user_id_status", table_name="help_requests"
    )
    op.drop_index(
        "ix_help_requests_open_widen",
        table_name="help_requests",
        postgresql_where=sa.text("status = 'open'"),
    )
    op.drop_index("ix_help_requests_home_circle_id_status", table_name="help_requests")
    op.drop_index(
        "ix_help_requests_direct_to_user_id",
        table_name="help_requests",
        postgresql_where=sa.text("direct_to_user_id IS NOT NULL"),
    )
    op.drop_table("help_requests")
    op.drop_index(
        "ix_circle_memberships_user_id_status", table_name="circle_memberships"
    )
    op.drop_index(
        "ix_circle_memberships_approved",
        table_name="circle_memberships",
        postgresql_where=sa.text("status = 'approved'"),
    )
    op.drop_table("circle_memberships")
    op.drop_index("ix_reports_target", table_name="reports")
    op.drop_index("ix_reports_circle_id_status", table_name="reports")
    op.drop_table("reports")
    op.drop_table("media_variants")
    op.drop_index("ix_listings_owner_user_id_status", table_name="listings")
    op.drop_index("ix_listings_category_id_status", table_name="listings")
    op.drop_table("listings")
    op.drop_index(op.f("ix_circle_invites_circle_id"), table_name="circle_invites")
    op.drop_table("circle_invites")
    op.drop_index(op.f("ix_push_tokens_user_id"), table_name="push_tokens")
    op.drop_table("push_tokens")
    op.drop_index(
        "uq_proxy_grants_active_pair",
        table_name="proxy_grants",
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.drop_index(
        "ix_proxy_grants_active_caretaker",
        table_name="proxy_grants",
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.drop_table("proxy_grants")
    op.drop_index("ix_payments_payer_user_id", table_name="payments")
    op.drop_index("ix_payments_payee_user_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_pair_stats_user_high_id", table_name="pair_stats")
    op.drop_table("pair_stats")
    op.drop_index("ix_notifications_user_id_created_at", table_name="notifications")
    op.drop_index(
        "ix_notifications_unread",
        table_name="notifications",
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.drop_table("notifications")
    op.drop_index("ix_media_files_sha256", table_name="media_files")
    op.drop_index(op.f("ix_media_files_owner_user_id"), table_name="media_files")
    op.drop_index(
        "ix_media_files_delete_after",
        table_name="media_files",
        postgresql_where=sa.text("delete_after IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_table("media_files")
    op.drop_index("uq_family_links_pair", table_name="family_links")
    op.drop_index(op.f("ix_family_links_user_id"), table_name="family_links")
    op.drop_index("ix_family_links_relative_user_id", table_name="family_links")
    op.drop_table("family_links")
    op.drop_index("ix_circles_region_status", table_name="circles")
    op.drop_index(op.f("ix_circles_parent_id"), table_name="circles")
    op.drop_table("circles")
    op.drop_index("ix_blocks_blocked_user_id", table_name="blocks")
    op.drop_table("blocks")
    op.drop_index("ix_ai_runs_user_id", table_name="ai_runs")
    op.drop_index("ix_ai_runs_feature_created_at", table_name="ai_runs")
    op.drop_table("ai_runs")
    op.drop_table("users")
    op.drop_index("uq_payment_events_provider_event", table_name="payment_events")
    op.drop_table("payment_events")
    op.drop_index(op.f("ix_categories_parent_id"), table_name="categories")
    op.drop_table("categories")
