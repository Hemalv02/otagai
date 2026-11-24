# Private thank-yous, neighbours, and safety

- **Thank-you (28)** starts from a completed loan. The member can write or request a suggestion, review the note and recipient, and send it privately. The inbox opens a receipt when the event includes a thank-you UUID. The API enforces completed status, participant access, and one thank-you per sender per exchange.
- **My neighbours (31) and Neighbour profile (30)** start in Requests. The list and directional counts use the relationship API. Shared history filters the signed-in member’s completed exchanges to the selected neighbour. Listings and profile fields come from the APIs that authorize them.
- **Report or block (44)** opens from a live loan or neighbour profile. The user reviews the selected actions and report details before submission. Each action has its own result, so retrying a failed block leaves a successful report intact. A report retry reuses the same submission ID. **Settings → Blocked people** opens the unblock flow.

User reports without an explicit circle go to a shared approved circle, preferring one with an eligible leader other than the reported person. If there is no eligible moderator, the report is saved in the reporter’s history and may await a moderator. The app has no platform-wide moderation queue. Blocking prevents new private thank-yous and preserves access to existing receipts.

## Verification

TypeScript, Expo lint, formatting of changed source, production web export, 125 mobile tests with Node 24, and 33 integration tests with disposable PostgreSQL passed. The integration run covered `test_reads_and_thanks.py`, `test_relationships.py`, `test_blocks.py`, `test_chat_blocking.py`, and `test_ai_more.py`. The repository-wide Prettier hook flagged 16 unchanged files from the base branch.

The browser check used a completed loan created through request, offer, pickup, return, and both confirmation APIs. It verified the review and recipient notification, private receipt reload, outsider denial, incomplete-loan rejection, rapid double tap and recovery after a lost send response, directional counts, no-history states, sign-out and sign-in as another account, separate and combined report/block actions, cancellation, recovery from a partial failure, and chat history restoration after unblocking. English, Japanese, and Bengali navigation copy was checked. The draft used a simulated successful provider response, and the backend's unconfigured-provider response exercised the manual fallback.

## Visual comparison

Figma frames 28, 30, 31 and 44 were compared to 390 px screenshots of the running app. The arrow, selection markers, and enabled switch are exact asset matches. The app uses live listing and profile data, with initials where the profile API has no photo. Screen 31 uses Back for its Requests entry point. Screen 28 adds the requested review step and offers private notes only. Screen 30 shows completed exchanges without private thank-you content. Screen 44 uses the verified target and keeps a separate option for block-only.

The follow-up comparison distinguished listing links from completed loans on Screen 30 and shortened the dates on Screens 30 and 31. Screen 28 labels the loan and private recipient, preserves the gift and orei rows with explicit unavailable states, and confirms before discarding or replacing a draft. Screen 44 uses Figma’s reason cards and **Also block** switch, with a **Block only** shortcut beside the reason heading. **Review actions** opens the final confirmation. Browser checks covered the draft protection and all three safety choices.

## iPhone acceptance

The follow-up simulator run used two approved accounts with local Supabase Auth, PostgreSQL, and the live AI provider. It sent an edited suggestion from a completed loan and opened the private receipt from the second account’s notification inbox. An unrelated account could not read the note. The history screen opened a completed help exchange on its own detail screen. A report appeared in the moderation queue. Blocking hid chat and prevented new notes. Unblocking from the compact Settings sheet restored access for both accounts. The Settings language picker was checked in English and Japanese. Physical iPhone acceptance remains pending.
