# Database

The API runs on Supabase Postgres 17. It connects through the Supabase pooler (Supavisor), which works like PgBouncer.

| Use | Host | Port | Pool mode |
| --- | --- | --- | --- |
| API (`DATABASE_*`) | `aws-1-ap-northeast-1.pooler.supabase.com` | 6543 | Transaction |
| Alembic (`MIGRATION_DATABASE_*`) | `aws-1-ap-northeast-1.pooler.supabase.com` | 5432 | Session |

- Set `POSTGRES_USER` to `postgres.<project-ref>`. The pooler needs the project ref in the user name.
- Do not use `db.<project-ref>.supabase.co`. That host is IPv6 only, and most networks and Docker cannot reach it.
- Set `DATABASE_SSL_MODE=verify-full` and `DATABASE_SSL_ROOT_CERT=app/database/certs/supabase-prod-ca-2021.crt`. The file is the public Supabase root CA. It verifies the pooler certificate and host name.
- The API engine disables statement caches and gives each prepared statement a unique name. Transaction pooling needs both settings.

Copy `backend/.env.example` to `backend/.env.local` and fill in the password. Compose still runs a local Postgres and PgBouncer by default. Export the same `DATABASE_*` values in your shell to point Compose at Supabase.

## Models

Put models in `app/database/models/`. Import each model in `app/database/models/__init__.py` so Alembic sees it.

- Use `UUIDPrimaryKey`, `Timestamps`, or `CreatedAt` from `base.py`.
- Store a status or kind as text. Add `check_in(column, Enum)` with a `StrEnum` from `enums.py`.
- Add an `acted_by_user_id` column to each table that a proxy can write. Keep the subject column for the person the action is for.
- Store money as `amount_minor` with a `currency` column.
- Do not store an exact address or user location. Location lives only on circles.

Alembic ignores tables that have no model. It never drops a Supabase table that it does not manage.

## Keep tables private

The mobile app uses Supabase only for sign-in. All data goes through the API, which connects as `postgres` and bypasses row-level security.

- Every table in `public` has row-level security enabled and no policies.
- The `anon` and `authenticated` roles have no table grants. Default privileges keep new tables private too.
- In each migration that creates a table, add `op.execute(sa.text('ALTER TABLE "<name>" ENABLE ROW LEVEL SECURITY'))`.
- Add a policy only when the app must read a table directly from Supabase, such as Realtime chat. Grant only `SELECT` on that table.

## Run a migration

Run the commands from `backend/`. `.env.local` supplies the connection.

```sh
uv run alembic upgrade head
uv run alembic current
uv run alembic check
```

To generate a revision, run it against a disposable database first, then review it.

```sh
uv run alembic revision --autogenerate -m "describe the schema change"
```

Alembic skips a foreign key marked `use_alter=True` inside `create_table`. Add it with `op.create_foreign_key` after both tables exist.

Test a downgrade only against a disposable database.
