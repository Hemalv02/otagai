# Loans and notifications verification

Implementation branch: `feat/loans-notifications`. API, interaction, and design verification are recorded below.

## Entry points and scope

- Requests → **Active loans** → a loan’s details. The list pages through active exchanges and displays only loan-mode items. Details use the API exchange ID and signed-in profile, with listing titles when visible. Missing listing titles and dates have fallbacks. Borrowers submit extensions; lenders accept or decline them. Both participants can read saved history.
- Home → bell → **Notifications** → **Notification preferences**. All/Unread filters, timestamps, cursor pagination, mark one/all read, and the badge use the API. Extension notifications open the live loan route. Other events remain readable in the inbox until their live destinations are available.
- Quiet hours save both times in the profile’s displayed time zone. Overnight ranges are supported. Turning quiet hours off clears both fields. Pausing push does not hide the inbox. Device delivery and topic-specific push controls are outside this change.
- New screens reuse the community components, typography, and tokens, with English, Japanese, and Bengali copy. They do not use the demo actor, fixtures, chat, or handover routes. Existing demo screens elsewhere remain in place.
- Navigation waits for account and membership loading before evaluating protected routes, preserving a loan URL on relaunch.

## Automated checks

Use a disposable PostgreSQL database only: integration fixtures truncate tables. Follow [testing.md](testing.md) for migration and environment setup.

From `backend/`:

```sh
uv run pytest tests/integration/test_handover_and_extensions.py tests/integration/test_notifications.py tests/integration/test_profile.py -q
uv run ruff check .
uv run ruff format --check .
```

The full backend suite passed **169 tests**, including the 19 focused tests for these features and the exact `status=active` query used by mobile. Coverage includes borrower-only submission, timezone-aware/future/later dates, missing initial due dates, duplicate pending extensions, participant access, outsider denial, decline preserving the due date, acceptance updating it, notification ownership, unread filtering across cursor pages, persisted reads and counts, and saving/clearing overnight quiet hours with push preferences.

The full suite reported two existing SQLAlchemy deprecation warnings in listing queries.

From `mobile/`:

```sh
pnpm exec tsc --noEmit
pnpm lint
pnpm exec expo export --platform web
```

Typecheck, lint, and web export passed. The export used local test API/Supabase configuration. From the repository root, `uvx pre-commit run --all-files` also passed. Existing backend test lint/format errors were corrected separately so the required repository hooks could pass.

## Browser flow checks

Playwright checked the production Expo web build at 390 × 844 using a disposable PostgreSQL database. Data was seeded through the existing request → listing/offer → accept → handover APIs, using the integration fixtures. Authentication used a temporary loopback-only test verifier and test JWT sessions; real Supabase sign-in and native behavior were not exercised. No test authentication code was added to the application.

Passed interactions:

1. Borrower opens Active loans, edits the extension message, and submits. Lender declines. Borrower reloads and sees the saved decision.
2. Borrower submits again; lender accepts. Both reload and see the decision. The API confirms the due date changed.
3. Inbox loads a second cursor page, marks one item read, marks all read, and retains the empty Unread state after reload. Home reloads with an unread badge of zero.
4. The quiet-hours row opens its editor. Preferences save `22:30`–`07:15` and paused push. Reload retains both times and the pause state. Clearing quiet hours clears both API fields and resuming push persists.
5. A simulated save failure displays an error and succeeds after retry. A simulated loan-list outage displays the retry state and recovers after the outage ends.
6. A third approved account sees an empty loan list and cannot open the participants’ loan or submit an extension.
7. Japanese and Bengali preferences render with the existing locale fonts. Loan, inbox, and preferences screenshots were visually inspected at phone width. No browser page errors were reported.

## Figma alignment

Figma access was resolved. Both frames were read using `get_design_context`, including their screenshots, assets, typography, and layout measurements:

- [25 · Loan and extension](https://www.figma.com/design/2UQhMRRDZKIFJZocixVIyt/Otagai?node-id=16-1865)
- [43 · Notifications](https://www.figma.com/design/2UQhMRRDZKIFJZocixVIyt/Otagai?node-id=16-2482), which is the preferences view referenced by the assignment.

The Active loans list and activity inbox remain supporting screens required by the written brief; it supplies no separate Figma frame for either.

| Area | Earlier implementation | Correction from Figma |
| --- | --- | --- |
| Loan heading | Listing title followed by a separate role label | Due-focused heading with item and participant subtitle |
| Loan dates | Large paper-colored date box and separate pickup fields | Compact 56 px listing-photo row with date/place/status, followed by the two-step pickup/return timeline |
| Extension draft | Conventional outlined message/date form | Clay left-accented editable message; the one-day action opens the date and submission controls |
| Loan actions | Extension submission only | Extension flow retained; Record return uses the existing live exchange return API |
| Preferences | Two bordered settings cards | Flat activity rows, quiet-hours summary/editor, pause/resume push action, and Save notifications |
| Shared chrome | Existing generic spacing | Opt-in 58 px toolbar, 16 px content spacing, and 6 px heading gap for these two frames |

The existing arrow and sample drill asset exactly match the Figma downloads by SHA-256. The arrow is reused, while actual loan photos come from listing data and use a neutral fallback if missing. Figma progress-dot and on/off assets were downloaded locally for the timeline and the accessible quiet-hours toggle. No temporary Figma URLs are used at runtime.

Intentional adaptations to the written scope:

- Names, titles, photos, dates, roles, statuses, and extension history use API data instead of the prototype’s sample values. Missing or hidden listing/profile data has fallbacks.
- The five activity-topic descriptions are informational. Per-topic push controls are explicitly separate work in the assignment, so no fake on/off states are displayed or saved.
- The prototype’s message action is omitted from this live route while the existing chat screen still uses demo IDs.
- The later-date editor, saved extension history, lender decisions, loading/retry states, and quiet-hours editor supplement the static frames to fulfill the acceptance requirements.

The corrected screens were checked against the Figma screenshots at 390 px width in English, Japanese, and Bengali. Browser flow checks passed again, including the quiet-hours sheet, validation and save recovery, extension decisions/history, and the live Record return action removing the loan from Active loans. Asset checks confirmed 20 × 20 arrows, 56 × 56 listing photos, 12 × 12 progress dots, and 38 × 22 toggle artwork inside 48 px touch targets. The custom switch's web checked state and Space-key behavior were verified. Visual photo checks used the exact Figma-matching image as API-supplied test data; the application has no drill-image fallback.

Typecheck, lint, production web export, and repository hooks passed after the alignment changes. The updated Android Metro bundle also compiled and was served successfully for Expo Go. This does not replace physical-device or iOS simulator UI acceptance.

## Remaining manual acceptance

An iOS simulator is unavailable on this Linux machine. Run the following with real test Supabase accounts on a Mac:

1. Start the backend against a development database with `uv run uvicorn app.main:app --reload`. Set `EXPO_PUBLIC_API_URL` and matching test Supabase settings in `mobile/.env.local`, then run `pnpm ios` from `mobile/`.
2. Approve borrower, lender, and outsider accounts in the same circle. With their real access tokens, create a borrower request (`kind: borrow`), a lender tool listing, an offer referencing that listing, and accept the offer. Read the exchange ID from `/users/me/exchanges`, set a future `due_at` and pickup details with `PATCH /exchanges/{id}`, then call `/hand-over`. The setup sequence is in `tests/integration/conftest.py::matched_exchange`.
3. Sign in as the borrower; Requests → Active loans → details → request an extension. Sign in as the lender and decline. Repeat and accept. Relaunch both accounts and compare their history/due date with `GET /exchanges/{id}` and its extension history. Sign in as the outsider and verify denial for the real exchange ID.
4. Create a real request and respond with a real offer to generate notifications. As the recipient, open the Home bell, mark one/all read, switch All/Unread, load another page when available, and relaunch. Compare the badge with `/users/me/unread-counts`. With the other account, verify those notification IDs are absent and PATCHing them returns 404.
5. Save overnight quiet hours and pause push, relaunch, and compare with `GET /users/me`. Clear quiet hours and resume push. Confirm the inbox remains available throughout.
6. Check empty states, an unreachable API and retry, the keyboard with date/time/message fields, larger accessibility text, and all three languages on native iOS. Compare native rendering with the two Figma frames, allowing for actual loan/account data and the scope adaptations above.
