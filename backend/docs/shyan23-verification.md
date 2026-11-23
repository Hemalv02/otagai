# My listings backend verification

Branch: `feat/shyan23-my-listings`.

All database checks use a dedicated disposable Docker PostgreSQL 17 container,
`otagai-shyan23-postgres`, exposed only on `127.0.0.1:55432`. No production
database, account, storage service, credentials, or project environment file is
used. Integration fixtures inject test authentication and in-memory media storage.
The integration fixture truncates its test database between tests; never run it
against a shared or production database.

## Setup

From the repository root:

```bash
docker run --detach --name otagai-shyan23-postgres \
  --publish 127.0.0.1:55432:5432 \
  --env POSTGRES_USER=otagai --env POSTGRES_PASSWORD=otagai_test \
  --env POSTGRES_DB=otagai postgres:17-alpine
```

The verification container was stopped after the backend checks. To repeat the
checks using that same disposable database, run
`docker start otagai-shyan23-postgres` instead of creating the container again.

From `backend/`, with the disposable container ready:

```bash
uv sync --frozen
DATABASE_HOST=127.0.0.1 DATABASE_PORT=55432 \
  MIGRATION_DATABASE_HOST=127.0.0.1 MIGRATION_DATABASE_PORT=55432 \
  POSTGRES_USER=otagai POSTGRES_DB=otagai POSTGRES_PASSWORD=otagai_test \
  DATABASE_SSL_MODE=disable uv run alembic upgrade head
```

## Results

- Before implementation, the new combined-filter integration test failed:
  `kind=tool&status=paused&limit=1` returned `422` with `Extra inputs are not
  permitted` for `kind`, where the test expected `200`.
- After implementation, `uv run pytest tests/integration/test_listings.py
  tests/integration/test_listings_more.py -q` passed **13 tests**. This checks
  owner-scoped kind/status filters, cursor pagination, omitted filters, invalid
  kind, tool publishing with a ready uploaded photo, skill publishing in
  `help_only` mode, and real loan handover with lent-out mutation restrictions.
- Ruff check and format check passed for the changed Python files.
- The full backend suite, `uv run pytest -q` with the same explicit disposable
  connection, passed **168 tests** in 68.36 seconds, with the same 10 warnings.
- Sol independently reviewed the backend change: spec compliance and code
  quality passed, with no blocking findings.
- The listing run emitted 10 existing SQLAlchemy `distinct` deprecation warnings
  from `app/repositories/listings.py`.

Test commands use the explicit disposable connection:

```bash
DATABASE_HOST=127.0.0.1 DATABASE_PORT=55432 \
  POSTGRES_USER=otagai POSTGRES_DB=otagai POSTGRES_PASSWORD=otagai_test \
  DATABASE_SSL_MODE=disable \
  uv run pytest tests/integration/test_listings.py tests/integration/test_listings_more.py -q
```

Mobile implementation and simulator acceptance are separate from these backend
checks. This Linux environment cannot run the iOS simulator.
