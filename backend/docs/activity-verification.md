# Loans and notifications verification

Implementation branch: `feat/loans-notifications`. API, interaction, and design verification are recorded below.

## Entry points and scope

- Requests → **Loans** → a loan’s details. The list includes scheduled loans, loans in progress, and returned loans awaiting confirmation. A matched loan request’s **View exchange** action also opens the loan. Either participant can record pickup and return. Each participant confirms the return from their account, after which the request is marked done and the listing is active again.
- Borrowers submit extensions while a loan is active. Lenders can decline or accept a proposal that is still in the future and later than the current deadline. Both participants can read saved history.
- Home → **Notifications** → **Notification preferences**. Settings also links directly to both screens, including from loan details. All/Unread filters, timestamps, cursor pagination, mark one/all read, and the badge use the API. Extension notifications open the live loan route. Other events remain readable in the inbox until their live destinations are available.
- Quiet hours use an Expo UI wheel on iOS, a Material 3 time picker dialog on Android, and typed time fields on web. Both times are saved in the profile’s displayed time zone and can span midnight. Turning quiet hours off clears both fields. The inbox stays available while push is paused. Device delivery and topic-specific push controls are outside this change.
- New screens reuse the community components, typography, and tokens, with English, Japanese, and Bengali copy. They do not use the demo actor, fixtures, chat, or handover routes. Existing demo screens elsewhere remain in place. The loan's Message action opens a separate live text conversation, resolved from both the exchange's request ID and accepted response ID across conversation pages. Sender identity and participant access are enforced by the existing backend. Text history, sending, read status, and pagination use its chat API; manual Refresh retrieves replies. Media sending, translation, and streaming are outside this focused action.
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
- The prototype's Message action uses the actual partner name and opens the loan's existing backend conversation. The previous demo chat route remains outside live loan navigation. If no matching conversation is available, the screen shows an explicit unavailable state instead of opening another conversation.
- The later-date editor, saved extension history, lender decisions, loading/retry states, and quiet-hours editor supplement the static frames to fulfill the acceptance requirements.

The corrected screens were checked against the Figma screenshots at 390 px width in English, Japanese, and Bengali. Browser flow checks passed again, including the quiet-hours sheet, validation and save recovery, extension decisions/history, and the live Record return action removing the loan from Active loans. Asset checks confirmed 20 × 20 arrows, 56 × 56 listing photos, 12 × 12 progress dots, and 38 × 22 toggle artwork inside 48 px touch targets. The custom switch's web checked state and Space-key behavior were verified. Visual photo checks used the exact Figma-matching image as API-supplied test data; the application has no drill-image fallback.

Typecheck, lint, production web export, and repository hooks passed after the alignment changes. The updated Android Metro bundle also compiled and was served successfully for Expo Go. This does not replace physical-device or iOS simulator UI acceptance.

The message/navigation follow-up passed an isolated browser flow at 390 px width: the two Screen 25 links have no extra gap; a conversation with the same request but a different response is skipped; the matching conversation is found on a later page; older messages load; both participants send and reload persisted replies; opening the conversation updates unread counts. A simulated lost response after a successful POST retains the draft, and retry reuses the client UUID and produces only one saved message. Missing conversations, closed conversations, outsider denial, and all three languages were checked. Settings links to both notification screens and the visibly labeled Home action reaches Screen 43 through the inbox. A fresh implementation screenshot was captured for comparison with the Figma frame.

## Live iPhone review against main

The iPhone simulator used two accounts signed in through local Supabase Auth and a FastAPI backend connected to disposable PostgreSQL.

- The borrower reached a scheduled loan from **View exchange**, recorded pickup and return, and confirmed. The lender could still open the returned loan from **Loans** and submitted the second confirmation. The API reported a completed loan, a done request, and an active listing.
- Extension decline and approval persisted on both accounts. The API refused an extension submitted for acceptance after return and preserved the due date. A same-circle outsider could not read either the loan or its chat.
- Both accounts exchanged live chat messages. After one blocked the other, the existing chat denied reading and sending. Removing the block restored access.
- The notification inbox loaded another page and supported marking one or all items read. Changing both wheel selections and saving an overnight quiet-hours schedule persisted through reopening the editor.

Android runtime acceptance is deferred.
