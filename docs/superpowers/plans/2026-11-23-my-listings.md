# My Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in member publish a tool or skill from Browse and manage the persisted listing from My listings.

**Architecture:** The owner list uses the existing paginated owner query with an additional optional kind filter. Expo Router keeps Browse and Add listing as entry points. My listings reads summaries from the owner query and fetches individual listing details when a row is opened.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, PostgreSQL, Supabase Auth, Expo SDK 58, React Native, Expo Router, TypeScript.

**Spec:** [shyan23.md](../../../shyan23.md) and [Figma Screen 21](https://www.figma.com/design/2UQhMRRDZKIFJZocixVIyt/Otagai-%C2%B7-Colour-Explorations?node-id=16-1751).

## Global Constraints

- Keep the existing Browse tab and **Add listing** entry. Replace the mock **Mine** segment with a **My listings** entry.
- Reuse backend categories, media, listing CRUD and pause/resume. Preserve server-side ownership, visibility, deletion rules, and cursor behavior.
- Keep the request and exchange screens outside the owner navigation flow. Retain demo data required by those screens.
- Use English, Japanese, and Bengali for new labels and states. Check English and Japanese filters on a narrow phone at the platform default font size.
- Follow [mobile/AGENTS.md](../../../mobile/AGENTS.md). Consult the [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) before touching Expo or React Native APIs.

## Review Focus

- A same-circle peer can have their own matching listing. Filtering or paging the signed-in user's list must still exclude the peer's rows.
- An upload may be accepted before it is ready and a publish retry may follow. Wait for readiness and reuse the accepted media ID.
- A delayed response for a previous filter or account must never replace the current list.
- A previously active listing may be lent out by the time a member edits or deletes it. Surface the API conflict and use the latest status.
- A successful mutation may be followed by a failed reload. Retry the read without repeating the mutation or changing the chosen filters.

---

## Files and ownership

| Task | Paths | Responsibility |
| --- | --- | --- |
| Backend | `backend/app/routes/listings/route.py`, `backend/docs/api-endpoints.md`, `backend/tests/integration/test_listings*.py` | Owner query and integration coverage |
| Mobile | `mobile/src/lib/api.ts`, `mobile/src/app/(community)/tools/add.tsx`, `mobile/src/app/(community)/my-listings.tsx`, `mobile/src/app/(community)/(tabs)/tools.tsx`, picker/photo components, listing copy, `mobile/src/lib/demo-listings.tsx` and focused tests | Authenticated transport, publish, management, and cleanup of local publishing |

## Task 1 · Owner query and listing integration tests

**Interfaces**

- `MyListingQuery.kind: ListingKind | None = None` accepts only `tool` and `skill`. `filters() -> ListingFilters` passes `kind.value` and parsed comma-separated statuses into the existing owner search.
- `GET /users/me/listings?kind=tool&status=active,paused&limit=1&cursor=…` returns `{items: ListingSummary[], next_cursor: string | null}`. Omitted parameters follow current behavior and the cursor stays opaque.

- [ ] Add `test_my_listings_filters_kind_status_and_pages_within_owner`. Create two paused tools, one active tool, one paused skill, and one paused tool for an approved same-circle peer. With `kind=tool&status=paused&limit=1`, both pages together must contain exactly the owner's paused tools, newest first. The first cursor is present and the last is null. With no filter, include the owner's active tool and paused skill and exclude the peer. Verify `kind=skill&status=paused,active` returns the skill and `kind=bogus` returns `422`.
- [ ] Run the new query test against disposable PostgreSQL. Expect a failure on the valid filtered request before implementation.
- [ ] Extend `MyListingQuery` and document both filters in the endpoint table. Reuse its existing status validator and repository behavior.
- [ ] Add `test_lent_out_listing_is_visible_but_read_only`. Use `matched_exchange(client, loan=True)` from `backend/tests/integration/conftest.py`. Hand over the actual accepted loan as the helper. Assert the helper's `kind=tool&status=lent_out` page and detail contain its listing. A helper PATCH, pause, resume, and DELETE return `409`, while the requester's equivalent mutations return `404`. Assert the listing remains visible to the helper after the conflicts.
- [ ] Extend the publication fixture or tests to create a skill using a category from `GET /categories?kind=skill` and assert `help_only`. For a tool, upload a small valid image with purpose `listing`, create the listing using its ready ID, and assert the returned photo plus a nonempty summary `photo_url`.
- [ ] Run `uv run pytest tests/integration/test_listings.py tests/integration/test_listings_more.py -q` from `backend/`. Require executed, passing tests. The fixture skips collection without `DATABASE_HOST`.

## Task 2 · API-backed mobile publishing and management

### Mobile API, real categories and publish

**Interfaces**

- Add types and methods to `mobile/src/lib/api.ts`. Reuse authenticated `request<T>` and its existing `ApiError`. Keep JSON serialization and allow a `FormData` body to set its own multipart boundary.
- `api.listCategories(kind: ListingKind)` consumes `GET /categories?kind=tool|skill`. The response is `{items: CategoryNode[]}` with `id`, `names`, `slug`, `is_risky`, and recursive `children`. Use returned UUIDs and the requested locale with a fallback for missing names.
- `api.uploadListingPhoto(formData: FormData)` posts fields `purpose=listing` and `file`. `api.getMedia(id: string)` returns the same media shape, including `id`, `status: "processing" | "ready" | "rejected" | "deleted"` and `urls`.
- `api.createListing(body: CreateListingBody)` returns `ListingDetail`, including its real `id`. Its request has `kind`, `category_id`, `title`, `lang`, `lend_mode`, `media_ids`, and optional `description`, `safety_notes`, and `availability_note`.
- The management screen consumes `api.listMyListings({kind?, status?, cursor?, limit?}, signal?)`, `api.getListing(id, signal?)`, `api.updateListing(id, {title?, availability_note?})`, `api.pauseListing(id)`, `api.resumeListing(id)`, and `api.deleteListing(id)`. List items have `id`, `owner_user_id`, `title`, `kind`, `status`, `photo_url`, and `available_again_at` among the server fields. Details include `owner`, `photos` and `availability_note`. `DELETE` resolves on `204` with no body.
- On successful publication, replace Add listing with `{pathname: "/my-listings", params: {listingId: listing.id}}`.

- [ ] Pin the regressions in focused mobile tests or the acceptance checks. A kind change invalidates the previous UUID. A no-photo skill submits `media_ids: []` and `lend_mode: "help_only"`. For a processing upload, `GET /media/{id}` must return `ready` before creation. A retry after interruption retains that ID and never issues a second upload for the same selection. Removing or replacing a photo clears that ID.
- [ ] Use real categories in the existing Add listing form. Display loading, empty and retry states. Ignore a category response from a previous kind selection. Keep the existing title, description, safety and availability fields and their validated bounds.
- [ ] Replace the sample-photo action with the existing camera/library workflow. Keep a preview, preserve the selected file's native URI and multipart metadata, and retain the server's media ID in the form as soon as it is available. For `processing`, poll with a bounded wait and allow a retry from the last known ID. Treat rejected photos as attachment errors and offer remove or replace. Use the existing empty-image treatment when no photo is attached.
- [ ] Submit the form once per deliberate action, maintain entered fields on failure, and use the real ID in the navigation handoff. Remove any calls to the demo store from the form.
- [ ] From `mobile/`, run focused mobile tests, `pnpm exec tsc --noEmit`, and `pnpm lint`.

### Browse entry, owner rows and actions

**Interfaces**

- `mobile/src/app/(community)/my-listings.tsx` accepts the optional `listingId` from the publish form. It uses that UUID when loading its owner rows so the newly published entry is identifiable.
- Filter kinds are All, Tools and Skills. Show active, paused and lent-out statuses. When status filters are offered, preserve both kind and status through paging, actions and retry. Use separate compact rows or fit the controls so each label stays on one line.
- Active rows offer **Manage**, paused rows offer **Resume**, and lent-out rows offer **View**. Paused rows remain openable for editing. Fetch details when a row is opened. A management detail presents title and availability edits, state-appropriate actions, and delete confirmation.

- [ ] Check that an older fetch result cannot supersede a newer filter or account, list paging follows the current query and deduplicates rows, and initial load, empty and failure states are distinguishable. Use the existing session and capture the account and filters per request. Cancel work or discard results when those change.
- [ ] Replace the Browse Mine segment with the localized My listings entry. Preserve access to the existing Add listing entry. Use the Screen 21 row actions from the spec with project spacing, typography and components. The Figma connector denied access to this frame, so record the visual verification limit.
- [ ] Render summaries and returned photos or placeholders. Open a real detail on demand, and restrict data and management to owner rows. Support PATCH with edits to title and availability. Clear availability with `null` and avoid overwriting details the form never edited.
- [ ] Wire pause, resume and delete to the API. Use a confirmation before delete. Do not offer edits or mutations for a lent-out listing. If a stale state triggers `409`, display the conflict and refresh the row/detail.
- [ ] When a write succeeds, reload the current filters and reset the cursor. Keep these filters on retry. If the reload fails, report a reload error whose retry only repeats the read. Ensure deletion removes the row after refresh and closes its detail.
- [ ] Verify active Manage, paused Resume, lent-out View, confirmation cancellation, failed API recovery, and list refresh. Run `pnpm exec tsc --noEmit` and `pnpm lint` from `mobile/`.

### Cleanup and acceptance

- [ ] Remove local-only publish writes and unused sample-photo copy. Trace mobile live entry points to ensure owner data never comes from the demo catalog. Preserve the existing sample data consumers needed by out-of-scope request, exchange and Home demo paths.
- [ ] Use a disposable PostgreSQL database with migrations applied for the listing integration tests. Use the fixture's in-memory media storage for API tests and the approved test environment with its media configuration for manual mobile testing.
- [ ] On a Mac with an iOS simulator, start the test API with `uv run uvicorn app.main:app --reload` from `backend/`. Set `EXPO_PUBLIC_API_URL` and matching Supabase settings in `mobile/.env.local`. Run `pnpm ios` from `mobile/` and sign in with an approved test account. Environment files and login details stay local.
- [ ] Publish a tool with a real photo and a skill without a photo. Verify both under My listings, switch kind filters, edit title and availability, pause, resume and delete. Relaunch the app and confirm the saved state and that the deleted row is gone.
- [ ] In the test environment, create a borrow request from a second approved account that shares the circle. As the owner, respond with an offer referencing the actual tool UUID. Accept as the requester and post `/exchanges/{id}/hand-over` as the owner. Check the owner sees a read-only lent-out row and owner deletion returns `409`. Sign in as the second account and verify it cannot see the owner's rows in My listings or mutate the listing by ID.
- [ ] Check an empty approved account or the second account before creating any of its own listings. Interrupt the connection and verify retry keeps the selected filter. Compare the English and Japanese filter layout to the narrow-screen requirement and verify Bengali copy.
- [ ] Record test commands, results, simulator steps performed, and any environment blockers alongside the implementation. This Linux workbench has no `xcrun` and no project-local test environment files. Its Docker socket denied access during initial inspection.
