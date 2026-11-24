"""Support Vietnamese content and end orphaned managed grants."""

from alembic import op

revision = "86b6ac2a1f3d"
down_revision = "c8b2e60491fa"
branch_labels = None
depends_on = None

COLUMNS = (
    ("users", "preferred_language", False),
    ("users", "intro_lang", True),
    ("listings", "lang", False),
    ("help_requests", "lang", False),
    ("request_responses", "lang", True),
    ("messages", "lang", True),
    ("thank_yous", "lang", True),
    ("notices", "lang", False),
    ("community_events", "lang", False),
)


def change_checks(languages: str) -> None:
    for table, column, nullable in COLUMNS:
        name = op.f(f"ck_{table}_{column}_valid")
        op.drop_constraint(name, table, type_="check")
        condition = f"{column} IN ({languages})"
        if nullable:
            condition = f"{column} IS NULL OR {condition}"
        op.create_check_constraint(name, table, condition)


def upgrade() -> None:
    change_checks("'ja', 'en', 'bn', 'vi'")
    op.execute("""
        UPDATE proxy_grants AS delegate
           SET revoked_at = now(), revoked_by_user_id = managed.created_by_user_id
          FROM users AS managed
         WHERE delegate.member_user_id = managed.id
           AND managed.kind = 'managed'
           AND managed.created_by_user_id IS NOT NULL
           AND delegate.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM proxy_grants AS creator
                WHERE creator.member_user_id = managed.id
                  AND creator.caretaker_user_id = managed.created_by_user_id
                  AND creator.revoked_at IS NULL
           )
    """)


def downgrade() -> None:
    for table, column, nullable in COLUMNS:
        fallback = "NULL" if nullable else "'en'"
        op.execute(f"UPDATE {table} SET {column} = {fallback} WHERE {column} = 'vi'")
    change_checks("'ja', 'en', 'bn'")
