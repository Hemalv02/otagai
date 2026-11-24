# Local development

[Project overview](../README.md) · [Architecture](architecture.md) · [Demo walkthrough](demo.md)

Use Docker Compose v2 or later, Python 3.12+ with `uv`, Node.js 24 with `pnpm`, and a Supabase project for authentication. The repo has two applications, [mobile/](../mobile/) and [backend/](../backend/).

## Run the API

Create a `.env` in the repository root. Replace the example values with local credentials.

```dotenv
POSTGRES_PASSWORD=replace-with-local-postgres-password
REDIS_PASSWORD=replace-with-local-redis-password
S3_SECRET_KEY=replace-with-local-storage-secret
SUPABASE_URL=https://your-project.supabase.co
CORS_ALLOWED_ORIGINS='["http://localhost:8081","http://127.0.0.1:8081"]'
```

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the root `.env` to enable AI features. Configure email confirmation and recovery templates in Supabase to exercise the code entry screens. [Auth setup](../backend/docs/auth.md)

From the repository root, run the migrations and start Compose.

```bash
docker compose run --rm --build backend alembic upgrade head
docker compose up -d --wait
curl -fsS http://127.0.0.1:8000/ready
```

The API is at `http://127.0.0.1:8000`, with Swagger UI at `/docs`. [API reference](../backend/docs/api-endpoints.md)

## Run the app

```bash
cd mobile
cp .env.example .env.local
pnpm install --frozen-lockfile
```

In `mobile/.env.local`, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` to your project URL and publishable or anon key. Set `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` to use the local API. Start Expo with `pnpm start` and press `w` for a browser preview. Native camera and device push testing use a development build with an API address the device can reach. [Mobile workspace](../mobile/README.md) · [Push setup](request-push-setup.md)

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

The backend integration suite truncates its database tables between tests. Follow the integration setup with a disposable PostgreSQL database. To run the judge walkthrough, seed a demo database and demo Supabase project. [Integration test setup](../backend/docs/testing.md) · [Demo seed setup](../backend/docs/hackathon-demo.md)
