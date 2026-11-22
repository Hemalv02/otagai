# Database

The API connects to PostgreSQL through PgBouncer. Alembic connects directly to PostgreSQL.

Use `Database.session()` inside a repository. The context manager commits on success and rolls back on error.

Put models in `app/database/models/`. Import each model in `app/database/models/__init__.py` so Alembic sees it.

## Run a migration

Start Compose from the repository root. Set the credentials required by Compose in your shell.

```sh
docker compose up --build -d --wait
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
docker compose exec backend alembic check
```

Generate new revisions in a writable checkout. Set `MIGRATION_DATABASE_HOST`, `MIGRATION_DATABASE_PORT`, and `POSTGRES_PASSWORD` for a direct PostgreSQL connection. Run the commands from `backend/`.

```sh
uv run alembic revision --autogenerate -m "describe the schema change"
uv run alembic upgrade head
uv run alembic check
```

Review the revision before you apply it. Test a downgrade only against a disposable database.
