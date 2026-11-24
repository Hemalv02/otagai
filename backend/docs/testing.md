# Testing

Run everything from `backend/`:

```bash
uv run pytest
```

With no database configured, the unit tests run and the integration tests are
skipped automatically.

## Unit tests — no external services (`tests/`)

Run anywhere:

- **Auth guards** (`test_auth_guard.py`) — protected routes return `401` with
  `WWW-Authenticate: Bearer` when the token is missing, malformed, or the wrong
  scheme; `/health` needs no auth; `/webhooks/stripe` bypasses the bearer check.
- **Cursor pagination** (`test_pagination.py`) — encode/decode round-trip and
  the defensive `400` paths (wrong sort key, bad base64, wrong arity, bad types).
- **Stripe webhook signatures** (`test_payments_signature.py`) — valid, tampered,
  expired, malformed, unconfigured-secret.
- **Media processing** (`test_media_processing.py`) — EXIF-stripped WebP thumb +
  display variants, sha256, dimension bounds, non-image rejection.
- **Error mapping** (`test_error_mapping.py`) — each typed error → HTTP status,
  `Retry-After` for rate limits, configuration errors do not leak messages.
- **Body validation** (`test_validation_models.py`) — `extra="forbid"`, enum and
  range checks, and the cross-field validators behind `422` responses.
- **Pure helpers** (`test_pure_helpers.py`) — `direct_key`, `ordered_pair`,
  `invite_is_usable`, bbox parsing.

## Integration tests — require PostgreSQL (`tests/integration/`)

These drive the ASGI app end to end against a real database with an injected
token verifier (the bearer token is the caller's Supabase `auth_user_id`), so
they cover the API guide's per-endpoint matrix: success, `401`, another user's
or hidden item (`404`/`403`), a forbidden state (`409`), and a bad body (`422`).

Coverage spans every major route group (`tests/integration/`):

- **profile** — create, duplicate `409`, bad body `422`, hidden-profile `404`,
  delete → inactive `403`.
- **listings** — visibility `404`, foreign edit `404`, pause/resume, bad body.
- **requests → accept** — exchange + chat created, second accept idempotent,
  duplicate live response `409`, non-recipient `404`, cancel idempotent.
- **exchanges** — hand-over → double confirm → completion with pair-stats
  update, cancel after hand-over `409`, non-participant `404`, premature
  thank-you `409`.
- **relationships / proxy** — managed-user + grant creation, family-link
  accept/revoke, grant lifecycle, and `X-Acting-For` proxy posting a request
  for a member (with scope `201`, without scope `403`, no grant `403`).
  Family home (screen 33) reads `GET /users/me/requests?status=open` as self,
  as a caretaker with `can_view_activity` (`200`), without it, after the scope
  is removed, after the grant is revoked, with only a family link, as an
  unrelated user and for a deleted member (`403`), and for managed accounts;
  an unknown `status` or query parameter returns `422`.
  Family consent and proxy (screens 34–36): a link stays pending on both sides
  until the receiver accepts, and accepting grants no access (`403`); a managed
  member gets exactly the reviewed scopes; only the member (or the caretaker
  who created a managed member) changes scopes or passes access on (`403`
  otherwise, including a delegated caretaker), and grant lists report
  `can_change_scopes`;
  posting and activity scopes are independent; a caretaker in Japan posts for a
  member in a Bangladesh circle through `GET /users/me/request-destinations` and
  `POST /requests` with `X-Acting-For` (owned by the member, `acted_by` is the
  caretaker, it reaches the member's circle, a foreign destination is `400`, a
  revoked grant is `403`, and the next personal request uses the caretaker).
- **payments** — idempotency (same key/body returns the first result, different
  body `409`/`404`), missing `Idempotency-Key` `422`, bKash-mock
  simulate-success → thank-you `paid`, cancel, payee-cannot-pay `404`.
- **media** — avatar upload → WebP variants, non-image `415`, owner read +
  delete `204` → gone `404`, stranger read `404`, foreign-avatar `400`.
- **AI** — unconfigured OpenAI `503`, bad body `422`, missing auth `401`.
- **safety** — block (idempotent re-block `200`), self-block `400`, unblock
  `204`, report bad body `422`.
- **§16 community** — notices leader-gated + member-read, outsider `403`, event
  capacity `409`, disaster alert + member check-in + leader roster, non-leader
  alert `403`, check-in settings round-trip.
- **chat** — request-conversation messaging, `client_message_id` resend `200`,
  history, mark-read, direct-chat dedupe `200`, no-shared-circle `400`,
  non-participant `404`, exclusive-target `422`.
- **ask-sessions** — photo session opens with a clarifying question, owner
  read/abandon, text session needs AI `503`, bad body `422`, foreign `404`.
- **coordinator / map-pins** — leader dashboard (requests, unmet-needs,
  helpers), member `403`, unknown circle `404`, bad bbox `422`.
- **notifications / home** — a received offer notifies the requester; list,
  read, read-all `204`, unread-counts drop to 0, foreign `404`; home aggregates.
- **misc** — categories tree, in-use media delete `409`, event edit/cancel +
  edit-cancelled `409`, notice edit/delete + non-author `403`, pending
  membership → leader approve.

The matrix is as complete as each endpoint's semantics allow: the AI helpers are
stateless suggestion calls (no `409` state — they return `200`/`422`/`503`/`429`),
and disaster check-ins are idempotent upserts, so their "conflict" coverage lives
on the stateful neighbours (event capacity `409`, in-use media `409`, etc.).

They are collected only when `DATABASE_HOST` is set. A disposable Postgres is
enough (no superuser-only features are required beyond `CREATE DATABASE`):

```bash
# 1. a throwaway cluster (socket dir kept short for macOS)
initdb -U otagai -A trust -D /tmp/otagai-pg
mkdir -p /tmp/otpg
pg_ctl -D /tmp/otagai-pg -o "-p 55432 -k /tmp/otpg -c listen_addresses=127.0.0.1" -w start
psql -h 127.0.0.1 -p 55432 -U otagai -d postgres \
  -c "ALTER ROLE otagai WITH PASSWORD 'otagai_test';" \
  -c "CREATE DATABASE otagai OWNER otagai;"

# 2. apply migrations, then run the suite
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=55432 \
       MIGRATION_DATABASE_HOST=127.0.0.1 MIGRATION_DATABASE_PORT=55432 \
       POSTGRES_USER=otagai POSTGRES_DB=otagai POSTGRES_PASSWORD=otagai_test \
       DATABASE_SSL_MODE=disable
uv run alembic upgrade head
uv run pytest

# 3. tear down
pg_ctl -D /tmp/otagai-pg stop
```

Each test truncates all tables and seeds a few reference categories, so order
does not matter. The app connects as the table owner, so row-level security is
bypassed exactly as a privileged service role would — the per-user visibility
is enforced by the service layer and asserted directly in these tests.
