# Direct listing request verification

Verified on Linux on 2026-11-24 after merging main `583982e` into this branch.

## Automated checks

- `pnpm exec tsc --noEmit`: passed after Expo regenerated ignored route types.
- `pnpm lint`: passed.
- `node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs`: 122 passed.
- Fresh disposable PostgreSQL migration resolves both feature and main histories through merge revision `ef120c4d7811`.
- `uv run pytest tests -q` on disposable PostgreSQL after the final concurrency fix: 292 passed, including all 30 listing-request integration cases.
- The listing-request regressions cover automatic withdrawal/cancellation collisions, manual self-reopen, and concurrent acceptance while retrying Send. The last two concurrency tests failed before their fixes and passed afterward. Listing validation uses `FOR NO KEY UPDATE` so an exchange's foreign-key check can proceed while availability updates remain serialized; duplicate recovery retries once if its conflicting open request disappears.

## Real HTTP acceptance

Used local Supabase Auth sign-in tokens for approved same-circle accounts A and B, this branch's FastAPI and disposable PostgreSQL.

- A found B's drill through Browse and loaded its title and owner UUID.
- A sent a borrow request with real listing and recipient UUIDs. B received it directly, and the request detail included the listing title.
- Borrowing a help-only skill returned 400; sending a help request succeeded.
- Pausing a listing between review and Send returned 409. Resuming it allowed the same request payload to succeed.
- Six concurrent sends returned the same request UUID; B received one request.
- Requesting an owned listing returned 400.

## Pending two-account iPhone acceptance

1. A opens B's tool from Browse/Home. Verify Ask to borrow, the compact review's title and recipient, and editable message. Send and verify the returned request opens; check B's inbox references the tool.
2. Repeat for a help-only skill and verify help is the available action.
3. Pause a listing as B after A reaches review. Send as A, verify the error retains the message, then resume and retry.
4. Rapidly tap Send while delaying its response. Verify the app submits once and navigates once.
5. Check owners, paused and lent-out listings show the appropriate read-only action states.
6. Check English, Japanese and Bengali copy and layout on a narrow phone.

No iPhone or iOS simulator is available on this Linux host. API concurrency checks do not establish native rapid-tap behavior; record native outcomes in the PR after execution.
