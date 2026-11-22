"""make public tables private to data api roles"""

import sqlalchemy as sa
from alembic import op

revision = "bec0607dffe8"
down_revision = "728fae39df0e"
branch_labels = None
depends_on = None

DATA_API_ROLES = ("anon", "authenticated")


def _for_each_role(statements: tuple[str, ...]) -> None:
    roles = ", ".join(f"'{role}'" for role in DATA_API_ROLES)
    body = "\n".join(
        f"      EXECUTE format('{statement}', role_name);" for statement in statements
    )
    op.execute(
        sa.text(
            f"""
DO $$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ({roles}) LOOP
{body}
  END LOOP;
END $$;
"""
        )
    )


def upgrade() -> None:
    _for_each_role(
        (
            "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I",
            "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I",
        )
    )


def downgrade() -> None:
    _for_each_role(
        (
            "GRANT ALL ON ALL TABLES IN SCHEMA public TO %I",
            "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I",
        )
    )
