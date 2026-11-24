"""Allow tool_guide AI runs and index ai_runs by age for retention."""

from alembic import op

revision = "b7e2c91f4a30"
down_revision = "ef120c4d7811"
branch_labels = None
depends_on = None

OLD = (
    "'polite_writer', 'task_to_tools', 'photo_listing', 'handover_checklist', "
    "'thank_you', 'extension_draft', 'translate', 'transcribe', 'intro_card'"
)
NEW = OLD + ", 'tool_guide'"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_ai_runs_feature_valid"), "ai_runs", type_="check")
    op.create_check_constraint(
        op.f("ck_ai_runs_feature_valid"), "ai_runs", f"feature IN ({NEW})"
    )
    op.create_index("ix_ai_runs_created_at", "ai_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_runs_created_at", table_name="ai_runs")
    op.execute("DELETE FROM ai_runs WHERE feature = 'tool_guide'")
    op.drop_constraint(op.f("ck_ai_runs_feature_valid"), "ai_runs", type_="check")
    op.create_check_constraint(
        op.f("ck_ai_runs_feature_valid"), "ai_runs", f"feature IN ({OLD})"
    )
