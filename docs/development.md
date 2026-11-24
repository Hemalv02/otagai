# Local development

[Project overview](../README.md) · [Architecture](architecture.md)

Use Docker Compose v2 or later, Python 3.12+ with `uv`, Node.js 24 with `pnpm`, and a Supabase project for authentication. The repo has two applications, [mobile/](../mobile/) and [backend/](../backend/).

## Configure the environment

Create a `.env` in the repository root. Replace the example values with local credentials.

```dotenv
POSTGRES_PASSWORD=replace-with-local-postgres-password
REDIS_PASSWORD=replace-with-local-redis-password
S3_SECRET_KEY=replace-with-local-storage-secret
SUPABASE_URL=https://your-project.supabase.co
CORS_ALLOWED_ORIGINS='["http://localhost:8081","http://127.0.0.1:8081"]'
```

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the root `.env` to enable AI features. Configure email confirmation and recovery templates in Supabase to exercise the code entry screens. [Auth setup](../backend/docs/auth.md)

Create the Expo environment from its template.

```bash
cp mobile/.env.example mobile/.env.local
```

| Variable in `mobile/.env.local` | Local value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | The same project URL as `SUPABASE_URL` on the API. |
| `EXPO_PUBLIC_SUPABASE_KEY` | The project's publishable or anon client key. |
| `EXPO_PUBLIC_API_URL` | `http://127.0.0.1:8000` for a browser on the development machine. |

The Expo template points at the deployed API by default. Set the local URL before starting Expo. Keep database, storage, and AI credentials in server-side environment files. Use the [startup commands](../README.md#run-locally) after configuring both environments.

Native camera and device push testing use a development build. Set an API URL reachable by the simulator or device, and use the push setup guide for platform credentials. [Mobile workspace](../mobile/README.md) · [Push setup](request-push-setup.md)

## Code layout

| Path | Where to make changes |
| --- | --- |
| [`mobile/src/app`](../mobile/src/app/) | Screen routes and navigation layouts. |
| [`mobile/src/components`](../mobile/src/components/) and [`mobile/src/theme`](../mobile/src/theme/) | Shared UI, design tokens, and accessibility styling. |
| [`mobile/src/lib`](../mobile/src/lib/) | API clients, app state, and localized screen copy. |
| [`backend/app/routes`](../backend/app/routes/) and [`backend/app/services`](../backend/app/services/) | HTTP endpoints and workflow rules. |
| [`backend/app/repositories`](../backend/app/repositories/) and [`backend/app/database/migrations`](../backend/app/database/migrations/) | Queries, persistence, and schema changes. |

## View uploaded media locally

The default Compose API signs URLs for the internal RustFS hostname. To preview those uploads from a browser on the same machine, keep the Compose data services running, stop the Compose API, and run the API on the host with the loopback storage URL.

```bash
# From the repository root after migrating.
docker compose stop backend
(
  set -a
  . ./.env
  set +a
  export DATABASE_HOST=127.0.0.1 DATABASE_PORT=6432
  export REDIS_HOST=127.0.0.1 REDIS_PORT="${OTAGAI_REDIS_PORT:-6379}"
  export S3_ENDPOINT_URL=http://127.0.0.1:9000
  export S3_BUCKET="${S3_BUCKET:-otagai-media}" S3_ACCESS_KEY="${S3_ACCESS_KEY:-otagai}"
  export S3_CREATE_BUCKET=true
  cd backend
  uv run --frozen uvicorn app.main:app --reload
)
```

Physical devices need reachable API and media addresses. Production uses a public HTTPS signing endpoint for media. [Deployment guide](../backend/docs/deployment.md)

## Run checks

```bash
# From backend/
uv run --frozen pytest -m 'not integration'

# From mobile/
pnpm exec tsc --noEmit
pnpm lint
node --test --experimental-test-isolation=none tests/*.test.mjs
```

The backend integration suite truncates its database tables between tests. Follow the integration setup with a disposable PostgreSQL database. For repeatable manual checks, seed fixture accounts against a separate database and Supabase project. [Integration test setup](../backend/docs/testing.md) · [Fixture setup](../backend/docs/hackathon-demo.md)
