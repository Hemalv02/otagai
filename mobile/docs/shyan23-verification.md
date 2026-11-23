# My listings verification

The final independent Sol review passed specification compliance and code
quality after the debug fixes. All reported findings were addressed. Native
and real-account acceptance remain pending as listed below.

Automated checks on Linux on 2026-11-23, from `mobile/`.

- `node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs` passed all 35 cases across five files. Node 22 emitted its experimental TypeScript and implicit ESM warnings. This sandbox prevented the isolated runner from opening its worker streams.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `git diff main --check` passed.
- `EXPO_PUBLIC_SUPABASE_URL=https://supabase.example.invalid EXPO_PUBLIC_SUPABASE_KEY=build-only-placeholder EXPO_PUBLIC_API_URL=http://127.0.0.1:55433 pnpm exec expo export --platform web --output-dir /tmp/otagai-shyan23-web-reviewed` passed with 34 bundles using compile-only settings. The initial export without those settings exited because Supabase configuration is required.

The tests cover media readiness, accepted-ID reuse, interrupted polling, rejected media, request invalidation, paging deduplication, row updates before list refresh, preservation of edited fields during status changes, dirty-field PATCH payloads, and authenticated transport. Ten regression cases failed when exercising the earlier behavior and passed after the fixes. The Linux workbench cannot run the device acceptance steps below. The Figma connector denied access to frame 16:1751, leaving visual comparison pending.

## Manual acceptance pending

This workbench lacks an iOS simulator, approved test accounts and project-local test environment configuration. On a Mac, configure local `mobile/.env.local` with the approved test API and matching Supabase settings, start the test backend with `uv run uvicorn app.main:app --reload`, run `pnpm ios` from `mobile/`, and sign in to an approved test account. Use disposable test data and keep environment files and credentials local.

1. Publish a tool with a camera or library photo and a skill without a photo. Verify both in My listings, switch All, Tools and Skills, and confirm the published item is identified. Delay the category read, switch kinds, and verify the previously selected category clears and only the current kind's categories can be submitted.
2. Open active Manage from the first row of a full page and verify the detail appears directly below that row. Open a different row while the detail read is offline, reconnect, and retry the new row without changing filters. Edit title and availability, clear availability, pause, open a paused row for editing, resume, cancel a deletion, then confirm deletion. For an existing note with surrounding whitespace, check that editing only the title preserves the stored note. In a second session for the owner, rename the listing while its detail is open in the first session. Pause it from the first session and verify that saving an availability edit preserves the new title. Relaunch and verify saved state and deletion.
3. Create a borrow request from a second approved same-circle account, offer the real tool UUID as owner, accept as requester, and perform owner hand-over. Verify the lent-out row is read-only and an owner delete returns 409. Confirm the second account cannot see the owner's rows or mutate the listing by ID.
4. Check the empty state with an account with no listings. Interrupt connectivity during a filtered list and during photo processing, then retry. Verify the filter and accepted media ID are retained and no duplicate upload occurs. Compare a failed list refresh after a successful resume with a failed refresh after a 409 whose detail reports lent out. Verify the stale Resume action disappears when the new status is known. Retry the pertinent read and verify that retry leaves the selected filters in place and sends no second mutation.
5. Delay a photo upload or publish response in the test environment. Leave Add or sign out while waiting and then let the response finish. Verify that abandoned work cannot take over navigation or write under the next signed-in account. The server can finish a request that it already received before the client canceled it.
6. Compare English and Japanese filter labels on a narrow phone at default font size and check Bengali copy. Disconnect during an action in Japanese and Bengali and verify the connection message in the current language. Verify row actions, placeholders and the screen against the design when access to the Figma frame is restored.

## Listing mock cleanup (Task 3): details from the backend

The listing detail screen at `src/app/(community)/tools/[id].tsx` now reads `api.getListing(id, signal, authUserId)` for the signed-in account and route UUID. It no longer uses demo listings or fixture owners. `demo-listings.tsx` is still imported by the root layout, Ask, Ask review, Ask suggestions, the request screen, the exchange chat, complete and pickup screens, `lending-photo.tsx` and `community-demo-state.ts` (type only). Home no longer imports it.

Automated checks on Linux on 2026-11-24, from `mobile/`.

- `node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs` passed 69 of 69 cases across seven files. The new `tests/listing-detail.test.mjs` has 19 cases covering UUID versus legacy IDs, loading, loaded, unavailable (API 404), retryable (503, 429, dropped connection), auth and unexpected-error views, late responses after an account or route change, owner and ownerless checks, availability copy for lend, help-only, lend-or-help and lent-out listings, and photo URL selection with no photos and thumbnail fallback. Only `fetch` and the Supabase session are stubbed. The screen itself is not covered by a test.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `git diff --check` passed.
- `EXPO_PUBLIC_SUPABASE_URL=https://supabase.example.invalid EXPO_PUBLIC_SUPABASE_KEY=build-only-placeholder EXPO_PUBLIC_API_URL=http://127.0.0.1:55433 pnpm exec expo export --platform web --output-dir <scratch>/web-export` passed. It only proves compilation.
- `uvx pre-commit run --all-files` from the repository root passed (Ruff check, Ruff format, Prettier).

### Not run

No backend or PostgreSQL was started, and no native or web app session was driven.

- Native device or simulator runs. The Android emulator was attempted, but the API 37 image needs more host RAM than this machine has, and the lighter image is not installed yet.
- Real test accounts, and multi-account and circle visibility checks, including a same-circle account and an outside account opening the same listing.
- A detail read interrupted by logout or an account switch on a device.
- Paused listings disappearing from Browse while staying in My listings, against a live backend.
- Discovery of a published tool with a photo and a skill without one, the real owner on the detail, and the My listings link from an owned listing on a device.
- Deleted and inaccessible listing IDs against a live backend, and the Home Browse link.
- Signed photo rendering and thumbnail fallback with real signed URLs.
- The English, Japanese and Bengali visual check, including the new `availableAgain` string.
- Browse paging on a device: a searched listing on page two, a delayed response while switching account or filter, disconnecting while the second page loads and then reconnecting and retrying, and a duplicate ID returned on that page. The pure logic for these is covered by unit tests in `tests/browse-state.test.mjs`, but none of them was run on a device.
