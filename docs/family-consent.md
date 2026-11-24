# Family consent and proxy requests (screens 33–36): implementation and test record

Branch: `feature/family-consent-proxy`, from the latest `main`. Figma: "Family home" (16-1097), "Add or link family" (16-1160), "Family permissions" (16-2067) and "Acting for Mum" (16-2124).

## What changed

### 1. Add or link a family member (screens 33–34)

- **Entry:** Home › Family › **Add a family member**.
- **Create a managed account:**
  - Collects the person's name, language, region, and how permission was given (In person, With a coordinator, On a call).
  - **Review permissions** shows the exact initial scopes before anything is saved.
  - Every scope is sent explicitly to `POST /managed-users`, so no server default can add access. `can_manage_listings` is always sent as `false`.
  - The result screen offers circle enrollment. The creator can also open it from the managed member’s Family card.
  - The creator enters an invite code and submits the application. It stays pending until the circle leader approves it, including when the invite auto-approves registered accounts.
  - Circle enrollment shows the application status. Once approved, the circle appears as a request destination for caretakers who have permission to post.
- **Link an existing account** (`/family/link`):
  - Shows your own member ID as selectable text, with **Share my ID**, which uses the system share sheet.
  - Takes the other person's member ID. The ID is trimmed and lower-cased, and must be a UUID.
  - Takes the relationship ("They are your…").
  - Sends `POST /family-links` with `relative_user_id` and `relation`. `invite_code` is not used.
- **Accepting a link:**
  - Pending links appear in Family on both sides.
  - The receiving member taps **Review** on the row and accepts explicitly (`POST /family-links/{id}/accept`), declines, or chooses "Not now".
  - The sheet says that accepting grants no access.

### 2. Review and revoke permissions (screen 35)

- **Entry:** Home › Family › **Review permissions**.
- **The overview** lists:
  - Who can act for you (`?as=member`).
  - People you help (`?as=caretaker`).
  - Family links, with **End link** behind a confirmation.
- **Per-grant screen:**
  - Shows the member's identity and four independent scope switches: Post requests, Send messages, Send thank-you payments and View activity.
  - **Confirm permissions** lists the plain-language effect of each change before saving (`PATCH /proxy-grants/{id}`).
  - **End access** confirms first (`POST /proxy-grants/{id}/revoke`).
- **Give someone access** creates a consented grant for an accepted family link (`POST /proxy-grants`), with every scope explicit.
- **Refresh:** data reloads on focus and when the app returns to the foreground. A grant that has ended shows "This access has already ended", and Family discards stale rows through its existing refresh.

### 3. Post on behalf of a family member (screen 36)

- **Entry:** Family › select a person whose grant has `can_post_requests` › **Ask for help for [name]**.
- **The composer** (`/family/ask/[memberId]`):
  - Shows a persistent **Acting for [name]** banner, with the member's name and circle.
  - Offers **Switch to my account**, which returns to Family with your own account selected.
  - Keeps all acting state inside the route, so it clears when you leave.
- **Destinations:**
  - Come from the new scoped read `GET /users/me/request-destinations`, which gets the `X-Acting-For` header, so the circles are the member's own approved ones.
  - When there is none, the screen explains this and **Review request** stays disabled.
- **Sending:**
  - Happens only after an explicit review step.
  - The single `POST /requests` carries `X-Acting-For`. No other call in the app sets that header for this flow.
  - On success the screen shows "Posted for [name]" and the server-issued request ID.
- **Failures:**
  - A revoked grant keeps the wording and offers **Copy or share wording**, which uses the system share sheet, where Copy is available.
  - If the connection drops after Send, the screen says the request *may* not have been sent and to check Family, rather than claiming nothing was sent. Creating a managed account handles a dropped connection the same way.
  - A rejected destination reloads the circles.
  - Family refreshes when you return.

### Backend

- **New scoped read:** `GET /users/me/request-destinations` lists approved, active circles. It uses the same rule as request creation, and requires `can_post_requests` when acting for someone.
- **Security fix in the grant role rules:**
  - Before, a caretaker could `PATCH` their own grant to switch on more scopes, such as posting or payments. They could also give a third person access over a registered member without that member's consent.
  - Now only the member, or the caretaker who **created** a managed member, can change scopes or pass access on. Any other caretaker, including one the creator delegated to, gets `403` "Only the person who gave access can change it."
  - Either side can still end access.
  - Grant lists return `can_change_scopes`, so the app shows switches as editable only when the server would allow the change. Saving sends only the scopes that changed, so a concurrent change to another scope isn't overwritten.
- **`kind` field:** family-link and proxy-grant responses now include `kind` (`self` or `managed`) in `other`. Only those two responses changed.

## Test results (2026-11-24, Linux)

| Check | Command | Result |
|---|---|---|
| Relationship and proxy integration tests (disposable PostgreSQL 17) | `uv run pytest tests/integration/test_relationships.py -q` | 27 passed |
| Full backend suite | `uv run pytest -q` | 360 passed |
| Ruff | `uv run ruff check .` / `uv run ruff format --check .` | clean |
| TypeScript | `pnpm exec tsc --noEmit` | clean |
| Mobile lint | `pnpm lint` | clean |
| Mobile suite | `node --test tests/*.test.mjs` | 154 passed |
| Browser end-to-end run | see below | 44 of 44 checks passed |

**Mutation check:** with the role-rule fix reverted, `test_only_the_member_changes_a_registered_members_scopes` fails. With the fix, it passes.

**Independent code review:** I acted on these findings:
- Only the creator manages a managed account.
- Saving sends only the changed scopes.
- Network failures are reported honestly.
- The acting banner never uses a name from the URL.
- Unsent wording is kept on every failure path.
- Permission data is keyed by the signed-in user.

One finding, that the radio markers were inverted, was checked and is not a bug: the repo's `ask-choice-empty.svg` and `ask-choice-selected.svg` hold the selected and unselected markers respectively, verified by checksum against Figma.

### Browser end-to-end run

This ran the real Expo web build in Chrome against the real FastAPI app and a disposable PostgreSQL. Data was seeded only through the API. The only stand-in was the Supabase JWT signature check, which a local launcher outside the repo replaced. Two or three signed-in accounts were open at once.

- **Task 1, managed account:**
  - Hana is created with "On a call" and Send messages switched off.
  - The API grant has exactly the reviewed scopes and `consent_method: phone_call`.
  - The result screen explains circle approval.
- **Task 1, linking:**
  - Yuki sends a link to Cousin's ID; an invalid ID is rejected first.
  - Pending shows on both sides.
  - Cousin reviews and accepts explicitly.
  - After a reload the link is saved as accepted on both sides.
  - The API still returns `403` when Yuki acts for Cousin.
- **Task 2, permissions:**
  - Amina changes View activity, then Post requests, as separate edits.
  - After each change, both API views (`as=member` and `as=caretaker`) match.
  - Family follows: "Requests hidden", and the Ask action disappears without the post scope.
  - The caretaker's view is read-only: "Only Amina can change these."
- **Task 3, acting for someone:**
  - Yuki (Japan) posts for Amina (Bangladesh circle). The request belongs to Amina, `acted_by_user_id` is Yuki (checked in the database), and Karim in Amina's circle receives it.
  - The request ID shown matches the API.
  - `X-Acting-For` was seen only on `GET /users/me/request-destinations` and `POST /requests`.
- **Task 3, revocation between review and Send:**
  - Amina ends access from her Permissions screen while Yuki is on the review step.
  - Send then shows "You can no longer post for Amina", keeps the wording with Copy, and publishes nothing.
  - **Switch to my account** returns to Yuki's own requests, and Amina has gone from Family.
  - Yuki's next personal request is owned by Yuki.
- **Task 3, no destination:** a managed member with no circle shows "isn't in an approved circle yet", and **Review request** is disabled.
- **Languages:** the Japanese and Bengali screens render.

## macOS review with real Supabase test accounts

The review used local Supabase Auth, the FastAPI application, and disposable PostgreSQL. The integrated branch passed 388 backend tests and 168 mobile tests, as well as Ruff, TypeScript, and lint.

- The browser walkthrough covered managed account creation with explicit consent, family link acceptance without granting access, independent permission changes, posting for a member in a different region, and revocation between review and Send.
- On the iPhone simulator, the caretaker created a managed account, saved a Chat permission change, reviewed and edited a request, and sent it to the member’s Bangladesh circle. A second attempt after revocation published nothing and kept the unsent wording.
- The authorized recipient saw the request. Backend checks confirmed the request belonged to the member and recorded the caretaker.
- Ending a managed creator’s own grant leaves separate delegated grants active.

## iPhone walkthrough checklist

To repeat the full walkthrough on macOS, run `pnpm ios` from `mobile/`. Use three Supabase test accounts in approved circles: a caretaker in Japan, a member in a Bangladesh circle, and a neighbour in the same Bangladesh circle.

- [ ] As the caretaker, go to Family › Add a family member. Create a managed account with one scope off. Check the scopes with `GET /users/me/proxy-grants?as=caretaker`.
- [ ] As the caretaker, go to Link an existing account and send a link to the member's ID. Confirm Pending on both phones. As the member, tap Review › Accept link. Relaunch and check that both sides show the link as accepted.
- [ ] Confirm that accepting gave no access: `GET /users/me/requests` with `X-Acting-For` returns `403`.
- [ ] As the member, go to Permissions › caretaker. Turn off View activity and save. Then turn off Post requests and save. Compare each change with `GET /users/me/proxy-grants?as=member` and `?as=caretaker`.
- [ ] Turn both scopes back on. As the caretaker, go to Family › member › Ask for help, then Review request, then Send. Check that the request is owned by the member and that the neighbour receives it.
- [ ] Repeat up to the review step. As the member, End access, then Send as the caretaker. Nothing should be published. Switch to my account, post a personal request, and confirm it is the caretaker's.
- [ ] Check a few screens in Japanese and Bengali.

## Notes

- **Omitted from the Figma frames:**
  - "Relationship" and "Neighbourhood circle" on the managed-account form. A managed account has no relationship or circle field in the API, and circle approval is a separate step.
  - "Save for later" on the composer. No draft API exists, and the brief removes locally simulated success states.
  - "Manage requests" on Family home, which is not part of this brief.
- **Photo slots** show initials, because these APIs return no images.
- **Scope switches** use the shared Otagai toggle so the controls look and behave consistently on mobile and web.
