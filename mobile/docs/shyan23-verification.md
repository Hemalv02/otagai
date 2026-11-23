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
