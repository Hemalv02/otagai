# Private thank-yous, neighbours, and safety

- **Thank-you (28)** starts from a completed loan. The member can write or request a suggestion, review the note and recipient, and send it privately. The inbox opens a receipt when the event includes a thank-you UUID. The API enforces completed status, participant access, and one thank-you per sender per exchange.
- **My neighbours (31) and Neighbour profile (30)** start in Requests. The list and directional counts use the relationship API. Shared history filters the signed-in member’s completed exchanges to the selected neighbour. Listings and profile fields come from the APIs that authorize them.
- **Report or block (44)** opens from a live loan or neighbour profile. The user reviews the selected actions before submission. Each action has its own result, so retrying a failed block leaves a successful report intact. **Settings → Blocked people** opens the unblock flow.

## Verification

TypeScript, Expo lint, formatting of changed source, production web export, 125 mobile tests with Node 24, and 33 integration tests with disposable PostgreSQL passed. The integration run covered `test_reads_and_thanks.py`, `test_relationships.py`, `test_blocks.py`, `test_chat_blocking.py`, and `test_ai_more.py`. The repository-wide Prettier hook flagged 16 unchanged files from the base branch.

The browser check used a completed loan created through request, offer, pickup, return, and both confirmation APIs. It verified the review and recipient notification, private receipt reload, outsider denial, incomplete-loan rejection, rapid double tap and recovery after a lost send response, directional counts, no-history states, sign-out and sign-in as another account, separate and combined report/block actions, cancellation, recovery from a partial failure, and chat history restoration after unblocking. English, Japanese, and Bengali navigation copy was checked. The draft used a simulated successful provider response, and the backend's unconfigured-provider response exercised the manual fallback.

## Visual comparison

Figma frames 28, 30, 31 and 44 were compared to 390 px screenshots of the running app. The arrow, selection markers, and enabled switch are exact asset matches. The app uses live listing and profile data, with initials where the profile API has no photo. Screen 31 uses Back for its Requests entry point. Screen 28 adds the requested review step and offers private notes only. Screen 30 shows completed exchanges without private thank-you content. Screen 44 uses the verified target and keeps a separate option for block-only.

The follow-up comparison distinguished listing links from completed loans on Screen 30 and shortened the dates on Screens 30 and 31. Screen 28 labels the loan and private recipient, preserves the gift and orei rows with explicit unavailable states, and confirms before discarding or replacing a draft. Screen 44 uses Figma’s reason cards and **Also block** switch, with a **Block only** shortcut beside the reason heading. **Review actions** opens the final confirmation. Browser checks covered the draft protection and all three safety choices.

## Live iPhone acceptance

With two approved Supabase test accounts, complete a loan using the pickup and return flow. Send an edited note as one participant, then open its receipt on the other account after relaunch. Check that the two profiles reverse the directional counts. Report and block from the loan, check the existing chat becomes unavailable, and unblock from Settings to restore history. Test with an unrelated account to verify denial. This Linux run used browser sessions backed by disposable test auth. A physical iPhone with real Supabase accounts and a configured AI provider remains unverified.
