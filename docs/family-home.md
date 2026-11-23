# Family home (screen 33): implementation and test record

Branch: `feature/family-home`. Spec: `screens.md` section 7, task notes for `mithunvoe`.

## What changed

### Backend

- `list_my_requests` now calls `actor.require(ProxyScope.VIEW_ACTIVITY)`. `GET /users/me/requests?status=open` with `X-Acting-For: <member_id>` returns:
  - `200` with the member's requests when the active grant has `can_view_activity`.
  - `403` "You can't see this person's activity." when the scope is off.
  - `403` "You can't act for this person." when the grant is missing or revoked, the caller is unrelated, or the member account is no longer active. The actor resolver returns these.
- Fixed a pre-existing bug: `GET /users/me/requests?status=...` always returned `422`, because `PageQuery` forbids extra query keys and `status` was declared outside the model. `status` now lives in `MyRequestsQuery(PageQuery)`.
  - The list still rejects unknown query keys.
  - It accepts a comma-separated list of statuses.
  - An unknown status returns `422` instead of an unhandled `ValueError`.
- Updated `backend/docs/api-endpoints.md` and `backend/docs/testing.md`.

### Mobile

- New Family tab: `src/app/(community)/(tabs)/family.tsx`, plus a trigger in the tabs layout (SF `person.2`, Material `group`).
- `src/lib/use-family.ts`:
  - Reads `GET /users/me`, `GET /users/me/family-links` and `GET /users/me/proxy-grants?as=caretaker` with no proxy header.
  - Loads the selected account's open requests. Only that call sends `X-Acting-For`, and only for a member account.
  - Keeps the selection in screen state, so it is local to Family.
  - On a switch it clears the previous rows. It aborts the previous fetch and ignores its response.
  - On a `403` it discards the rows, shows a notice and reloads the accounts. If the account is gone, the view falls back to **You**.
  - Refreshes on tab focus, on app foreground, and on pull-to-refresh.
- `src/lib/family-state.ts` holds the pure state logic:
  - Account list: **You** first, then one entry per active caretaker grant.
  - Link standing: pending (yours or theirs), can view, activity hidden, or no permission.
  - Request-entry transitions and date formatting.
  - It also filters out rows whose requester is not the selected account.
- `src/components/family-ui.tsx` follows the Figma frame "33 · Family home" (Family tab, account switcher, open request cards):
  - "Choose who you're helping" list: a 56px round avatar, the name, a detail line ("Your account · <circle>", "Can see requests" or "Requests hidden"), and "Active" or "Switch" on the right. It is a radio group.
  - Pending links and links without a grant are status rows in the same list, marked "Pending" or "No access".
  - Open request rows: a 56px rounded-square thumbnail, the request text, the kind and time, and "Open" on the right. Each row expands inline because there is no live request detail route yet.
  - The avatar and request photos in the frame are sample data. The APIs used here return no images, so the slots show initials.
  - The frame's "Manage requests", "Review permissions" and "Add a family member" belong to screens 34 and 35 and are not part of this task.
  - Skeleton loaders and notices.
- `src/lib/family-copy.ts` holds the copy in English, Japanese and Bengali.
- `CommunityScreen` gained two opt-in props:
  - `live` hides the demo "Previewing as" banner, because Family always shows the signed-in account.
  - `refreshControl` adds pull-to-refresh.
- Family fixture data lives only in the tests (`mobile/tests/family.test.mjs`).

## Test results (2026-11-24, Linux)

| Check | Command | Result |
|---|---|---|
| Relationship and Family integration tests (disposable PostgreSQL 17) | `uv run pytest tests/integration/test_relationships.py -q` | 19 passed |
| Full backend suite (unit and integration) | `uv run pytest -q` | 179 passed |
| Ruff on changed backend files | `uv run ruff check` / `ruff format --check` | clean |
| TypeScript | `pnpm exec tsc --noEmit` | clean |
| ESLint (with the React Compiler rules) | `pnpm lint` | clean |
| Prettier | `pnpm exec prettier --check src` | clean |
| Mobile unit tests | `node --test tests/*.test.mjs` | 28 passed (14 of them new) |
| Browser end-to-end run | see below | 45 of 45 checks passed |

Mutation check: with the new `actor.require` line removed, exactly three tests fail. They are the caretaker without the scope, the scope removed after the grant, and the managed account with the scope off.

### Backend cases covered (`test_relationships.py`)

- Self: lists only your own open requests, and a cancelled request is excluded.
- Caretaker with the activity scope: `200` with the member's open request.
- Caretaker without the scope: `403`.
- Scope removed with `PATCH /proxy-grants/{id}`: `403`, and the account switcher feed shows `can_view_activity: false`.
- Revoked grant: `403`, and the grant leaves the switcher feed.
- Unrelated user in the same circle: `403`.
- Accepted family link with no grant: `403`.
- Deleted member: `403`.
- Managed accounts: scope on returns `200`, scope off returns `403`.
- The link and grant feeds return `other` display names.
- Status filter: a comma-separated list returns `200`. An unknown status or an unknown query key returns `422`.

### Browser end-to-end run

This ran the real Expo web bundle in Chrome against the real FastAPI app on a disposable PostgreSQL database. Data was seeded through `/users`, `/circles`, `/family-links`, `/proxy-grants`, `/managed-users` and `/requests`. The only stand-in was the Supabase JWT signature check, which a local launcher outside the repo replaced. The script checked:

- The self fetch carries no `X-Acting-For`. The member fetch carries `X-Acting-For: <member_id>`. The link and grant reads carry no header.
- Switching to the member shows the member's request and clears your rows. Re-tapping the selected account keeps its rows.
- An account without the scope shows the missing-permission state, and no request call is made.
- A delayed response for the previous account is ignored after a fast switch.
- After a relaunch (full reload), both accounts load again from the API.
- Revoking the grant: the API returns `403`. In the app the rows are discarded, the account leaves the switcher, one notice appears and the view falls back to **You**. Re-granting and refreshing the tab brings the account back without switching to it.
- Removing the scope: the API returns `403`. In the app the rows disappear and the account is marked "Requests hidden".
- A user with no family sees the empty states for family and for requests.
- Failed family and request loads show errors, and **Try again** recovers them.
- The Figma copy renders: "Your family", "Choose who you're helping", "Your account · <circle>", and "Active" on the selected row only.
- Japanese and Bengali headings render.

## Local setup with real accounts

1. In `backend/`, start the API with `uv run uvicorn app.main:app --reload` (see `backend/docs/services.md`).
2. Point `mobile/.env.local` at that API with `EXPO_PUBLIC_API_URL`. Use the matching test Supabase URL and publishable key.
3. Seed two registered accounts in one approved circle: a caretaker (`$CARETAKER_TOKEN`) and a member (`$MEMBER_TOKEN`). Run these against `$API`:

```bash
MEMBER_ID=$(curl -s "$API/users/me" -H "Authorization: Bearer $MEMBER_TOKEN" | jq -r .id)
CARETAKER_ID=$(curl -s "$API/users/me" -H "Authorization: Bearer $CARETAKER_TOKEN" | jq -r .id)
LINK_ID=$(curl -s -X POST "$API/family-links" -H "Authorization: Bearer $CARETAKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"relative_user_id\":\"$MEMBER_ID\",\"relation\":\"parent\"}" | jq -r .id)
curl -s -X POST "$API/family-links/$LINK_ID/accept" -H "Authorization: Bearer $MEMBER_TOKEN"
GRANT_ID=$(curl -s -X POST "$API/proxy-grants" -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"member_user_id\":\"$MEMBER_ID\",\"caretaker_user_id\":\"$CARETAKER_ID\",\"caretaker_role\":\"family\",\"consent_method\":\"in_person\",\"scopes\":{\"can_view_activity\":true}}" | jq -r .id)
curl -s -X POST "$API/requests" -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"help","raw_text":"Could someone carry rice up the stairs?","lang":"en"}'
```

## iOS simulator acceptance (not yet run)

This was built on Linux, so no iOS simulator was available. Run these steps on macOS with `pnpm ios` from `mobile/` and tick them off:

- [ ] Sign in as the caretaker and open **Family**. **You** is selected and shows only your own open requests.
- [ ] Switch to the member. Their open request appears, and tapping it expands the details.
- [ ] Switch back to **You**. Relaunch the app, open Family, and check that both accounts still load the right requests.
- [ ] As the member, turn off the activity scope with `PATCH /proxy-grants/$GRANT_ID` and body `{"can_view_activity": false}`. Pull to refresh on Family. The requests disappear and the member shows "Requests hidden".
- [ ] Confirm the API denies the same call:
  ```bash
  curl -i "$API/users/me/requests?status=open" \
    -H "Authorization: Bearer $CARETAKER_TOKEN" -H "X-Acting-For: $MEMBER_ID"
  ```
  It returns `403`.
- [ ] Revoke the grant with `POST /proxy-grants/$GRANT_ID/revoke` and refresh. The member leaves the switcher.
- [ ] With an account that has no family links, check the "No family linked yet" and "You have no open requests" states.
- [ ] Turn off the network, check the error state, turn it on again, and tap **Try again**.
- [ ] Repeat a few screens in Japanese and Bengali.

## Follow-ups found during this work

- Other filtered lists have the same `PageQuery` bug. These return `422` (checked against a running server):
  - `GET /users/me/exchanges?status=`
  - `GET /users/{user_id}/requests?status=`
  - `GET /users/{user_id}/exchanges?status=`
  - `GET /users/me/received-requests?direct=true`

  The fix is to move each filter into a `PageQuery` subclass, as `MyRequestsQuery` does.
- `GET /requests/{request_id}` and `GET /requests/{request_id}/responses` do not check `VIEW_ACTIVITY` for proxies. Adding the check needs care: the edit, cancel and widen routes call `get_request` after a `POST_REQUESTS` action, so a caretaker with that scope but no activity scope would start getting `403`.
- When you are the member on an accepted link, the caretaker shows as "no permission to help yet". That is accurate, but it could instead read "can act for you" by also loading `GET /users/me/proxy-grants?as=member`.
- Opening `/family` as a cold-start deep link lands on Home first, because of the protected community route guard. Tapping the tab works.
