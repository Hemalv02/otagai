# Deployment

The production stack runs with `compose.prod.yaml` from the repository root on a
single Docker host. It serves the API at `https://otagai.hemal.me` and signed
media at `https://s3.hemal.me`, both behind Caddy with automatic Let's Encrypt
certificates.

## Topology

- **caddy** — terminates TLS on ports 80/443 and reverse-proxies `APP_DOMAIN` to
  the backend and `S3_DOMAIN` to the object store. Host headers are preserved so
  SigV4-signed media URLs validate.
- **migrate** — one-shot `alembic upgrade head`. The backend and worker wait for
  it to finish (`service_completed_successfully`), so schema changes apply on
  every deploy automatically.
- **backend** — FastAPI (Uvicorn with `--proxy-headers`). Restarts on failure.
- **ripple-scheduler**, **push-dispatch**, **worker** — background processes.
- **redis**, **s3** (rustfs) — local stateful containers with named volumes.

PostgreSQL is **Supabase**, reached over the pooler with `verify-full` SSL; there
is no Postgres container in production.

Every long-running service uses `restart: unless-stopped`, so it comes back after
a crash or a host reboot.

## Media URLs

The backend uploads and reads objects over the internal endpoint `http://s3:9000`
(`S3_ENDPOINT_URL`), but signs client-facing GET URLs against
`S3_PUBLIC_ENDPOINT_URL` (`https://s3.hemal.me`). Signing makes no network call,
so the public host never has to be reachable from inside the network.

## First deploy

1. Point `otagai.hemal.me` and `s3.hemal.me` at the host (A records, proxy
   disabled so Caddy can solve the HTTP-01 challenge).
2. Copy `.env.production.example` to `.env.production` and fill in the secrets
   (`.env.production` is gitignored).
3. Build and start:

   ```bash
   docker compose -f compose.prod.yaml --env-file .env.production up -d --build
   ```

4. Check health:

   ```bash
   curl -fsS https://otagai.hemal.me/health
   curl -fsS https://otagai.hemal.me/ready
   ```

## Updating

```bash
git pull
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

The `migrate` service runs first and applies any new migrations before the new
backend starts.
