# Hackathon backend

This part is a FastAPI service. It uses uv, Python 3.12, Uvicorn, and Ruff.

Read the [root `CLAUDE.md`](../CLAUDE.md) first for the shared rules.

## Layout and architecture

- Use `app/` as the Python package.
- Put the FastAPI app, middleware, and health routes in `app/main.py`.
- Put each new route group in `app/routes/<name>/route.py`.
- Include each router in the app when the task requires a new route.
- Validate input and build the HTTP response in the route layer.
- Call the service from the route.
- Put the business logic in the service layer.
- Call the repository from the service.
- Use the repository for database access.
- Return data from the repository to the service.
- Put each backend document in `backend/docs/`.

## Async code

- Write route handlers and service operations with `async def`.
- Use an async client for database, HTTP, and SMTP operations.
- Do not call a blocking function in an async operation.
- Use `await asyncio.sleep()` for a delay.
- Use `await asyncio.to_thread()` when a library requires a blocking call.

## REST API design

- Name each collection with a plural noun.
- Use GET to read.
- Use POST to create.
- Use PUT or PATCH to update.
- Use DELETE to delete.
- Return 200 for a read.
- Return 201 for a create.
- Return 204 for a response with no body.
- Use a 4xx or 5xx status code for an error.
- Use JSON for a response body.
- Use the same field name style in each response body.
- Include a clear message in each error body.

## Settings and errors

- Read configuration through the typed `Settings` class in `app/settings.py`.
- Add each new configuration value as a typed field.
- Load `.env` before `.env.local`.
- Reject an unknown key in an environment file.
- Follow the secret handling rules in the root `CLAUDE.md`.
- Raise a typed error from a service.
- Follow the retry rules in the root `CLAUDE.md`.

## CORS

- Set `CORS_ALLOWED_ORIGINS` to a JSON array of frontend origins.
- Include the scheme and port when the frontend uses a nondefault port.
- Set `CORS_ALLOW_CREDENTIALS` to `true` only when a client needs credentials.
- Export the CORS settings in the shell before you start Compose to override the defaults.

The default origins are `http://localhost:3000` and `http://127.0.0.1:3000`.

## Services

- Use async SQLAlchemy, asyncpg, Alembic, and PgBouncer for PostgreSQL.
- Read [the database guide](docs/database.md) for connections, models, and migrations.
- Read [the auth guide](docs/auth.md) for Supabase sign-in and token checks.
- Use the async Redis client in `app/services/redis/`.
- Read [the Redis guide](docs/redis.md) for configuration and usage.
- Use the async SMTP service in `app/services/email/` to send email.
- Read [the email guide](docs/email.md) for configuration and error handling.

## Setup and checks

- Run these commands in `backend/`.
- Run `uv sync` to install dependencies.
- Run `uv run uvicorn app.main:app --reload` to start the development server.
- Open `http://localhost:8000/health` to check the service.
- Run `uv add <package>` to add a runtime dependency.
- Run `uv add --dev <package>` to add a development dependency.
- Commit the updated `uv.lock` with a dependency change.
- Run `uv run ruff check .` to check the code.
- Run `uv run ruff format .` to format the code.
- Fix each Ruff error before a commit.

## Docker

- Run `docker compose up --build` from the repository root.
- Set `POSTGRES_PASSWORD` in the shell before you start the stack.
- Set `REDIS_PASSWORD` in the shell before you start the stack.

The backend image uses a multi-stage build. The container runs as a non-root user on port 8000.
