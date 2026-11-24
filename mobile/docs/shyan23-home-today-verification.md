# Home Today verification

Verified on Linux on 2026-11-24 after merging main `583982e` into this branch.

## Automated checks

- `pnpm exec tsc --noEmit`: passed after Expo regenerated ignored route types.
- `pnpm lint`: passed.
- `node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs`: 115 passed.
- `pnpm exec expo export --platform web --output-dir /tmp/otagai-shyan23-home-current-web`: passed; compilation evidence only.
- `uv run pytest -q tests --ignore=tests/integration`: 51 passed.
- Disposable PostgreSQL: fresh Alembic upgrade, then notification and listing integration tests: 20 passed.

## Real HTTP acceptance

Local Supabase Auth supplied real sign-in tokens for approved accounts A and B in one circle; C had no activity. FastAPI ran this branch against disposable PostgreSQL and real S3 storage.

- B posted a request; A's refreshed Home included its real UUID and requester.
- A fetched that exact request and requester profile successfully.
- Cancelling the request removed it from A's Home.
- C received empty `received_requests` and `due_soon` arrays.
- An invalid token returned 401. This checks authentication failure; it does **not** prove the transient-error Retry UI.

## Pending two-account iPhone acceptance

1. Sign in as A and B in the same approved circle. B sends a request. Refresh A's Home and tap its Today row; verify the correct request and member open.
2. Use an account with no activity and check the meaningful empty state.
3. Interrupt a refresh or return a temporary 503 in the test environment. Verify Retry appears and successfully reloads after recovery.
4. With a due exchange, tap its Today row and verify the correct live loan/exchange opens.
5. Check English, Japanese and Bengali on a narrow phone; verify Browse, the bell and Family still open correctly.

No iPhone or iOS simulator is available on this Linux host. Native outcomes remain unverified and must be recorded in the PR after execution.
