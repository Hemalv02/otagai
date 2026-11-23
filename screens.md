Here are all the screens, grouped by flow. **MVP** means needed for the demo on 24 Nov; **Later** goes in the proposal's "planned" section.

## 1. Onboarding and account

| # | Screen | Purpose | States / cases to cover | Build |
|---|---|---|---|---|
| 1 | Welcome | Explain Otagai in one sentence and choose a language (日本語 / EN / বাংলা) | First launch; region detected or chosen manually | MVP |
| 2 | Phone sign-in | Enter phone number, get a one-time SMS code | Wrong code, code expired, resend timer, test numbers for the demo | MVP |
| 3 | Profile setup | Name, photo (optional), languages, skills, "happy to help with" | Skip for now; AI drafts the intro card from the skills | MVP |
| 4 | Join a circle | Join your *han* or building circle with an invite code, a QR scan or by searching nearby | Code invalid; waiting for the leader to approve; no circle nearby → "Start a circle" | MVP |
| 5 | Waiting for approval | Shows the account is pending circle verification | Approved → Home; rejected → contact the leader | MVP |
| 6 | Simple mode setup | Big buttons, voice-first, fewer tabs | On/off; can be turned on by family through proxy | Later |

## 2. Home and discovery

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 7 | Home | Two main actions (Ask, Lend), nearby requests, today's summary | Empty (nothing nearby); new circle; offline | MVP |
| 8 | Browse listings | Tools and skills available in your circle, with search and category filter | No results → "Ask for it instead" | MVP |
| 9 | Listing detail | One tool or skill: photos, owner, included parts, availability | Available, lent out (back on a date), owner paused it | MVP |
| 10 | Map view | Listings and requests by approximate location (*han* or building, never an exact address) | Location permission denied → list only | Later |

## 3. Asking for help (requester)

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 11 | Ask: input | Speak, type or take a photo of the problem | Mic permission denied; recording; transcribing | MVP |
| 12 | Ask: AI clarifies | AI asks one follow-up ("Indoor or outdoor? How high?") | AI unsure; user corrects AI | MVP |
| 13 | Ask: results | Identified tool or skill, plus matching neighbours (has the tool / can do the job) | Matches found; **no match → go to the draft** | MVP |
| 14 | Ask: draft request | AI-written polite message plus translation, with date and time, who to send to (one person, the *han*, or a widening ripple) | Edit wording; change tone; "Nothing is sent until you tap" | MVP |
| 15 | Request sent | Confirmation and what happens next (who sees it, when it widens) | Ripple stage shown: family → *han* → association → nearby | MVP |
| 16 | My requests | All your requests: open, matched, in progress, done, cancelled | Empty state; expired with no helper → suggest widening or asking the coordinator | MVP |
| 17 | Request detail (requester) | Status, the helper's profile, chat, cancel, edit time | Helper cancelled → back to open; you cancel → helper notified | MVP |

## 4. Helping and lending (helper side)

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 18 | Request detail (helper) | Read a request and tap "I can help" | Already taken by someone else; **silent decline (no button, no penalty)** | MVP |
| 19 | Lend: add listing | Photo → AI fills in name, category, parts, safety notes → owner checks | AI wrong → edit; item marked risky (chainsaw, ladder) → "offer as help, not loan" | MVP |
| 20 | Offer a skill | List a skill (gardening, carpentry, carrying, Japanese help) with availability | Pause and resume | MVP |
| 21 | My listings | Manage your tools and skills | Lent out, paused, deleted | MVP |
| 22 | Incoming requests | Direct asks to you specifically | Accept, suggest another time, or let it expire quietly | MVP |

## 5. The exchange

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 23 | Chat | Arrange time and place; AI translation on each message | Contact details hidden until both accept; block or report | MVP |
| 24 | Handover checklist | Photos at pickup → AI parts list → both confirm | One side disputes an item; skip for help jobs (no item handed over) | MVP |
| 25 | In use / reminders | Shows the due date, plus a polite "Can I keep it one more day?" draft | Extension accepted or declined; overdue (gentle nudge, never shaming) | MVP |
| 26 | Return check | Photos at return, AI flags missing parts or damage, both confirm | All good; issue flagged → go to 34 | Later (MVP: manual confirm) |
| 27 | Mark done (help jobs) | Both confirm the favour happened | Only one side confirmed → reminder | MVP |

## 6. Thanks and relationships

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 28 | Say thank-you | Note, sweets or *orei* payment; AI drafts the note and suggests an amount from the culture pack | Helper turns down money → note only | MVP |
| 29 | Payment | Stripe (JPY) or bKash (mocked) checkout | Success, failed, cancelled | MVP |
| 30 | Neighbour profile | Their skills, listings, thank-you notes, **your pair history and balance**, "return the favour" prompt | First contact (no history yet); blocked user (hidden) | MVP |
| 31 | My neighbours | Everyone you've exchanged with, sorted by recent activity | Empty → "Say hello to your *han*" | MVP |
| 32 | Thank-you wall | Public thank-you notes in the circle (opt-in) | Opted out → private only | Later |

## 7. Family and proxy

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 33 | Family home | Switch between yourself and the people you act for; their open requests | No one linked yet → invite | MVP |
| 34 | Add a family member | Create a managed account (no phone needed) or link an existing one | Consent method: in person, through a coordinator, or a call | MVP |
| 35 | Proxy permissions | Choose scopes: post requests, send thank-yous and pay, see activity | Revoke; the member can remove the caretaker | MVP |
| 36 | Acting-as banner | A bar shown on every screen while acting for someone ("Acting for Mum") | Prevents posting as the wrong person | MVP |
| 37 | Check-in settings | "If Mum is quiet for X days, ask [neighbour] to say hello" | Off by default; the senior chooses the buddy | Later |

## 8. Community and circle

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 38 | Circle page | Members, notices (digital *kairanban*), events | Not yet approved → limited view | Later |
| 39 | Event detail | Cleaning day or festival: volunteer slots and tools needed | Full; signed up; cancelled | Later |
| 40 | Circle admin (leader) | Approve or remove members, post notices, invite codes | Pending queue empty | Later (MVP: seeded) |
| 41 | Coordinator dashboard | Open requests across circles, unmet needs, active senior helpers | Act as proxy for a resident | Later |
| 42 | Disaster mode | "I'm safe / I need help" check-in, plus a list of people who need help evacuating | Triggered by the circle leader | Later |

## 9. Safety, notifications and settings

| # | Screen | Purpose | States / cases | Build |
|---|---|---|---|---|
| 43 | Notifications | New requests nearby, matches, messages, reminders, thank-yous | Quiet hours; notifications turned off | MVP |
| 44 | Report / block | Report a user, listing or message; block someone | Confirmation; the blocked person isn't told | MVP |
| 45 | Issue resolution | Missing or damaged item: both sides' photos and notes, then a suggested next step | Resolved; escalate to the circle leader. **AI never decides who is liable** | Later |
| 46 | Settings | Language, simple mode, text size, privacy, notifications, sign out, delete account | — | MVP (basic) |
| 47 | Payment history | Thank-yous and *orei* sent and received | Empty | Later |

## 10. States every screen must handle

- **Loading:** skeleton screens, not spinners, for lists.
- **Empty:** always suggest one next action.
- **Offline:** show cached data, and queue posts until back online.
- **Error:** plain-language message plus a retry button.
- **Permission denied:** for mic, camera and location, explain why it's needed and offer an alternative (type instead).
- **Wrong language:** a language switch is always one tap away.
- **Acting as someone else:** the acting-as banner is always visible.

## Demo path (the screens to build first)

**1 → 2 → 4 → 7 → 11 → 12 → 13 → 14 → 15 → 18 → 23 → 24 → 27 → 28 → 29 → 30 → 33 → 34**, plus the Bangladesh language version of 7 and 18. That covers the whole story in the video: Tanaka-san, Rahim, proxy mode, and his mother's request in Cumilla.
