# Otagai — Neighbourhood Tool & Help Sharing

Nov 22, 2026 · @Mominul Islam Hemal

## Summary

Otagai (お互い, "mutual") is a neighbourhood app for lending tools and giving small everyday help, built first for Nagasaki and designed around active seniors as the main helpers.

Japan already has both the need (Nagasaki City is 34.9% aged 65+) and the helpers (Silver Human Resource Centres alone have about 22,500 members in Chiba Prefecture). What's missing is the connection: matching still runs on phone calls, paper and human coordinators. Existing apps either sell professional services or post open classifieds.

Otagai links the two through:

- Neighbourhood circles
- A relationship layer that tracks give-and-take
- Culture-aware asking that makes it easy to request help
- A proxy mode so family or welfare volunteers can post for elderly people

The same engine runs in Bangladesh with a different *culture pack* (Bangla, bKash, para and apartment circles). One story then connects both countries: a Bangladeshi worker in Nagasaki helps his Japanese neighbours and also arranges help for his parents back home.

**Theme fit (Tsunagu):** people ↔ people, people ↔ things, people ↔ community, Japan ↔ Bangladesh.

**Deadline:** proposal, GitHub and video due Tue 24 Nov, 23:59 BST. Final presentation Thu 26 Nov at BJIT.

## The problem in Japan (Nagasaki)

In Nagasaki, small everyday tasks are getting hard for a fast-growing group of elderly residents: carrying shopping up a slope, putting out the garbage, changing a light bulb. Meanwhile, the neighbourhood ties that used to absorb these tasks are weakening.

| Indicator | Number | Source |
| --- | --- | --- |
| Nagasaki Prefecture residents aged 65+ (Oct 2024) | 430,952, or 34.8% of the population | [Nagasaki Pref.](https://www.pref.nagasaki.jp/shared/uploads/2024/12/1735192207.pdf) |
| Highest share aged 65+ (Ojika town, remote island) | 53.2% | [Nagasaki Pref.](https://www.pref.nagasaki.jp/shared/uploads/2024/12/1735192207.pdf) |
| Nagasaki City aging rate (Mar 2025) | 34.9%, about 1 in 3 residents | [Nagasaki City](https://www.city.nagasaki.lg.jp/syokai/792000/792109/p028202.html) |
| Nagasaki City residents aged 75+ | 67,347 (2020) → 83,145 projected (2035) | [Nagasaki City](https://www.city.nagasaki.lg.jp/syokai/792000/792109/p028202.html) |
| Working-age people per senior, Nagasaki Pref. | 3.0 (2000) → 1.5 (2025) → 1.2 (2040) | [Nagasaki Pref.](https://www.pref.nagasaki.jp/shared/uploads/2024/05/1716862251.pdf) |
| Nagasaki City neighbourhood association membership (Apr 2020) | 67.6% | [Fukuoka Pref. survey](https://www.pref.fukuoka.lg.jp/uploaded/life/617350_61117026_misc.pdf) |
| Foreign workers in Nagasaki Pref. (Oct 2025) | 12,807, up 15.4% (record high, 4th straight year of growth) | [Nagasaki Labour Bureau](https://jsite.mhlw.go.jp/nagasaki-roudoukyoku/content/contents/gaikokujin-koyo-26013009.pdf) |

**The terrain turns small tasks into big ones.** Nagasaki City already runs a door-to-door garbage pickup, with a safety check, for elderly residents who can't take garbage out themselves. It targets people living on slopes, at the end of narrow alleys, or in buildings without elevators. In the Mizunoura district, slopes and narrow roads mean residents who give up their cars can't shop alone. A welfare organisation now drives them to a supermarket using its shuttle van's idle time, with the riders coordinated by hand by the neighbourhood association.

**The city's own list of needs is "small troubles".** Nagasaki City's plan lists help with shopping, garbage and changing light bulbs as unmet needs. It gives the causes as more seniors living alone, weaker local ties, a shortage of care workers, and needs that long-term care insurance doesn't cover.

**Neighbourhood associations are thinning.** The city reports falling membership, fewer people taking part in activities, and a shortage of people willing to take on leadership roles.

**Culture makes asking hard.** *Enryo* (restraint) and *meiwaku* (not wanting to burden others) stop people from asking for help directly. In Japan, help usually flows through set structures such as rotations, associations and welfare volunteers, not through open requests. An app that just says "post a request" fights the culture instead of working with it.

**Owning a phone isn't the barrier; using it is.** Among people aged 60–79, 96.5% of mobile owners use a smartphone, and 91.1% of people in their 60s use LINE. But Nagasaki City's own life-support coordinators heard from many residents who had bought a smartphone and didn't know how to use it. The coordinators had to arrange smartphone classes in response.

## What exists today

Japan already has seniors doing paid helper work, but almost all of it is matched by hand. The apps that do exist serve other groups (parents, gig workers, sellers) or only share information.

### Analog systems: seniors already help, offline

| System | What it is | Numbers | Source |
| --- | --- | --- | --- |
| Silver Human Resource Centres (nationwide) | Paid short jobs for people aged 60+ (gardening, cleaning, odd jobs), ordered by households and businesses | Latest national figures: about ¥318.5 billion in contracts, 3.43 million orders, 69.8 million person-days of work | [MHLW](https://www.mhlw.go.jp/content/12600000/001446630.pdf) |
| Silver centres, Chiba Pref. | Light work, about 10 days a month and under 20 hours a week; long jobs rotated among members | About 22,500 members across 48 municipalities | [Chiba Pref.](https://www.pref.chiba.lg.jp/koyou/rouseichiba/2025/documents/598-10-11.pdf) |
| Silver centre, Kagoshima City (FY2017 example) | Same model | 3,241 members out of 198,411 residents aged 60+, so only **1.6%** of seniors joined | [MHLW](https://www.mhlw.go.jp/content/12600000/001446630.pdf) |
| Resident-led home help (Hiroshima City) | Neighbourhood groups help people needing light support with "small troubles"; the city subsidises the groups | 41 groups active (Dec 2023) | [Hiroshima City](https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/011/599/229029.pdf) |
| Resident-led home help (Niigata City) | Volunteers do cleaning, garbage, laundry, cooking, shopping, bulb changes, pet care, snow clearing and gardening | Model used nationwide under the long-term care prevention programme | [Niigata City](https://www.city.niigata.lg.jp/iryo/korei/chiikihokatsucare/seikatsusien.files/tirasi.pdf) |
| Paid-volunteer group (Mito City) | Shopping and cleaning help "in the spirit of *otagaisama*" | About 70 members | [Sawayaka Foundation](https://www.sawayakazaidan.or.jp/poster/sys_data/poster_files/3/t-098.pdf) |
| Time banking (NALC) | Hours of help are "deposited" and can be exchanged even with distant branches | National NPO network | [Sawayaka Foundation](https://www.sawayakazaidan.or.jp/summit/sys_data/panel_files/1/t-o-049.pdf) |
| Life-support coordinators (Nagasaki City) | Staff who match residents' needs to local resources by hand: the Mizunoura shopping rides, shopping tours, smartphone classes | Manual, case by case | [Nagasaki City](https://www.city.nagasaki.lg.jp/uploaded/attachment/26474.pdf) |

Takeaway: the supply of willing senior helpers is real and already paid in small amounts. Only a tiny share of eligible seniors take part (1.6% in Kagoshima), and matching depends on paper, phone calls and coordinators.

### Digital platforms

| Platform | What it does | Scale | Limitation |
| --- | --- | --- | --- |
| [Jimoty](https://jmty.jp/all) | Local classifieds with a "Mutual Aid" section (borrow, lend, help me, I can help) | About 10M monthly users; about 578k Mutual Aid posts | Open to anyone, so trust is low. The "I can help" listings are mostly business ads (kimono dressing at ¥6,600, car coating, design work) |
| [ANYTIMES](https://apps.apple.com/jp/app/id1071718230) | Neighbourhood skill marketplace; the provider pays a system fee | About 43,000 members (older press figure) | Framed as side income or gig work. No tool lending, no community structure |
| [Locapi (AsMama)](https://apps.apple.com/jp/app/id1637037219) | Lending items between neighbours, with ID checks and insurance | Launched Nov 2022 | Items only. The App Store listing says iPhone only |
| [AsMama MyComu / Kosodate Share](https://www.cas.go.jp/jp/seisaku/digital_gyozaikaikaku/taiwa2/231016taiwa2.pdf) | Childcare pickup, lending, help with daily life, insurance | 53,000 registered for childcare sharing | **Closest competitor.** Built around parents and childcare, and rolled out area by area over 3–5 years. Seniors aren't positioned as the main helpers |
| [PIAZZA](https://www.city.sakai.lg.jp/naka/joho_naka/piazza_nakaku.html) | Local SNS run in partnership with cities (Nagoya, Sakai, Osaka, Yokohama) | Many city partnerships | Shares information and giveaways, not actual help |
| [Machimachi](https://www.soumu.go.jp/main_content/000768905.pdf) | Local SNS; adopted by Sasebo (Nagasaki Pref.) | Sasebo reported 396 cumulative registrants, against 612 associations | Adoption was weak, and it's an information board, not a help system |
| [Yui-net and other e-kairanban apps](https://www.city.sapporo.jp/shimin/shinko/chounaikai/hint/digital_kanminrenkei.html) | Digital circulars, attendance, disaster safety checks for neighbourhood associations | Sapporo signed partnerships in Jul 2026; Imizu City funds the first year | Association admin only. No lending, help or matching |

## The gap

No existing option combines lending, help and community around one neighbourhood, with seniors as the main helpers. None of them addresses the cultural difficulty of asking.

This table shows what each option advertises, based on its public listings and press coverage:

| Option | Tool lending | Help requests | Seniors as main helpers | Tied to neighbourhood association / welfare | Proxy posting for family or volunteers | Low-pressure asking |
| --- | --- | --- | --- | --- | --- | --- |
| Jimoty | Yes | Yes | No | No | No | No |
| ANYTIMES | No | Yes | No | No | No | No |
| Locapi | Yes | No | No | No | No | No |
| AsMama MyComu | Yes | Yes | No (parents first) | Partly (city projects) | No | No |
| PIAZZA / Machimachi | Giveaways only | Info only | No | Partly (city partnerships) | No | No |
| Yui-net (e-kairanban) | No | No | No | Yes | No | No |
| Silver centres / volunteer groups | No | Yes (by phone or paper) | Yes | Yes | Through coordinators | Yes (through structures) |
| **Otagai** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

1. **Everything is scattered.** Tools, help, notices and event volunteering each live in a different app, and none of them is organised around the neighbourhood association or *han* that people already belong to.
2. **Seniors are always the ones receiving help.** Apps treat elderly people as users who need help. The analog systems prove that seniors want to be helpers, but they reach only a small share of them (1.6% in Kagoshima).
3. **Open classifieds have trust and noise problems.** Jimoty's help section is crowded with business ads, which is the opposite of a neighbour lending a hand.
4. **Nothing solves *enryo*.** Every app assumes people will post a public request and handle a direct "no". In Japan that's exactly what stops people from asking.
5. **No bridge between analog and digital.** Coordinators and welfare volunteers match people by hand and have no tool built for them. Elderly residents who struggle with their phone have nobody who can post for them.
6. **Foreign residents are left out.** Nagasaki has a record 12,807 foreign workers. No local help tool works across languages or treats them as potential helpers rather than outsiders.

## What we can build: Otagai

Otagai is a web app (PWA) that turns a neighbourhood into a circle. Members list what they can lend or do, ask for what they need, and see the give-and-take between themselves and each neighbour.

It has three layers:

1. **Core engine (the same in every country):** tool and skill listings, help requests, neighbourhood circles, matching, chat, thank-yous and payment, and community events (cleaning days, festival volunteer slots).
2. **Relationship layer:** every exchange happens between people who have a relationship, and the app keeps track of it.
   - Relationship types: family (including family far away), neighbour (same *han* or building), circle member, verified nearby person.
   - Ripple visibility: a request reaches family first, then the *han*, then the association, then verified neighbours nearby.
   - Per-pair balance: "You and Tanaka-san have helped each other 3 times each." This nudges reciprocity without putting a price on it.
   - Proxy mode is a consented relationship: a family member or welfare volunteer can post and manage requests for someone.
3. **Culture pack (one per region):** sets community units, asking style, thank-you norm, payment provider, trusted intermediaries, events and languages. Japan (Nagasaki) is the first pack; Bangladesh is the second (see below).

&#91;embedded content: Otagai architecture · culture packs on a shared core\]

Adding a country means adding a culture pack, not rewriting the app. The relationship layer is what makes Otagai a community rather than a marketplace.

**How one request flows:**

1. Tanaka-san, 78, taps "Need help carrying rice up the stairs", or her daughter in Fukuoka posts it for her through proxy mode.
2. The AI helper rewrites it into polite Japanese and translates it for foreign neighbours.
3. The request ripples outward: family, then *han*, then association, then verified nearby. People who match get a quiet notification. If they don't respond, that's a silent no.
4. A helper accepts, they chat, the job gets done, and both sides confirm.
5. Tanaka-san sends a thank-you: a message, points, or a small *orei* payment (Stripe in JPY). Their pair balance updates.

## New features

Each feature targets one of the six gaps above. The ones marked MVP are what we build and demo by 24 Nov.

| Feature | What it does | Gap it closes | Build |
| --- | --- | --- | --- |
| Neighbourhood circles | Join your *han* or association circle, invited or verified by its leader | 1 Scattered, 3 Trust | MVP |
| Tool and skill listings | List a ladder, grass cutter or sewing machine, or a skill (gardening, carpentry, tutoring, carrying) | 1 Scattered | MVP |
| Senior helper profile | Seniors are shown as "helpers" with their skills and a record of thank-yous, not as care recipients | 2 Seniors as receivers | MVP |
| Ripple requests + silent decline | Requests widen step by step from family to circle to nearby. Matching people get a quiet notification, and saying no takes no action | 4 *Enryo* | MVP |
| AI polite-request writer | Turns "need ladder sat" into polite Japanese (keigo), with English and other translations | 4 *Enryo*, 6 Language | MVP |
| *Orei*, not prices | The thank-you is a message, points or a small payment (Stripe test mode in JPY). The helper can decline money | 3 Trust and noise | MVP |
| *Otagaisama* balance | Per-neighbour record of help given and received | 2, 4 | MVP |
| Proxy mode | A family member or welfare volunteer posts and manages requests for an elderly person, with consent | 5 Analog bridge | MVP |
| Simple mode | Large buttons, three main actions, voice input, a LINE-like look | 5 Analog bridge | Later |
| Coordinator view | Life-support coordinators and welfare volunteers see open requests and active helpers in their area | 5 Analog bridge | Later |
| Community board | E-kairanban notices plus sign-ups for cleaning days and festival volunteer slots | 1 Scattered | Later |
| Disaster mode | Safety check-ins and a list of who needs help evacuating, reusing the same circles | 1 Scattered | Later |

## AI across the borrowing journey

AI's job in Otagai is to remove the awkward or hard moments around a borrow or a favour: knowing what to ask for, asking politely, handing over, giving it back, and saying thank you. People always make the decisions; AI only suggests.

| Stage | AI feature | Example | Problem it removes | Build |
| --- | --- | --- | --- | --- |
| Before | **Describe it, even without the name** | Three ways to ask. A task: "put up a shelf on a concrete wall" → hammer drill, masonry bits, wall plugs, level. A description: "the long metal thing for pulling out old nails" → nail puller or pry bar. A photo of the problem: a blocked drain → plunger or drain snake. If AI isn't sure, it asks one follow-up ("Indoor or outdoor? How high?"). Then it searches the circle for the tool, or for a neighbour who can do the job. If nothing matches, it drafts the request for you to review and send | People don't know the tool's name or what to ask for, and often need both a tool and a skill | MVP |
| Before | **Photo → listing** | A senior photographs a grass cutter. AI fills in name, category, included parts and safety notes, ready to post with one tap | Typing on a phone is the barrier for many seniors (gap 5) | MVP |
| Before | **Polite-request writer** | "need ladder sat" → polite Japanese suited to the relationship (keigo for an elder, casual for family), plus a translation | *Enryo*, and language barriers (gaps 4, 6) | MVP |
| Before | **Smart ripple matching** | Ranks who to ask by closeness, availability and pair balance (people who owe you a favour first). Finds equivalent items (any pressure washer, not one brand) | Asking the wrong person, or asking the same person too often | MVP (rule-based) |
| Before | **Lend or help?** | A chainsaw or tall ladder requested by an 80-year-old → suggests a helper who brings the tool, instead of lending it | Safety risk for elderly borrowers | Later |
| Before | **Unmet-demand signal** | Three requests for a ladder and none listed → the coordinator sees it and the circle can buy a shared one | Needs nobody can see today (gap 5) | Later |
| During | **Handover checklist** | Photos at pickup create a parts checklist ("battery, charger, 2 bits") both sides confirm | Trust between strangers | MVP |
| During | **How-to in your language** | A 3-line usage and safety summary of the tool, in Japanese, English, Bengali or Vietnamese | Foreign residents and first-time users | Later |
| During | **Extension and reminder drafts** | "Could I keep it one more day?" written politely, plus a gentle return reminder | Saying the awkward thing is hard (gap 4) | MVP |
| After | **Return check** | Compares before and after photos and flags a missing part or visible damage. Both people confirm. **AI never decides who is liable** | Disputes that damage relationships | Later |
| After | **Thank-you helper** | Drafts a thank-you note and suggests a fitting *orei* from the culture pack (e.g. sweets worth about ¥500) | Not knowing how much is appropriate | MVP |
| After | **Return the favour** | "Tanaka-san lent you a ladder. She's looking for help with her garden on Saturday" | One-way relationships | MVP |

For the demo, the MVP AI features can run on one LLM API call each with structured JSON output, plus a vision call for the photo features. Matching starts as simple rules (distance, availability, balance), which is easier to explain to judges.

## From favours to relationships: connecting people

A borrowed drill is the excuse; the relationship is the product. Otagai is designed so each exchange moves two people one step closer, from stranger to someone you greet (*kao-mishiri*) to a neighbour you can rely on.

| Step | Feature | How it connects people |
| --- | --- | --- |
| 1. First contact | **Welcome a newcomer** | When someone moves in, the app helps them do the traditional moving-in greeting: introduces them to their *han*, suggests a small gift, and translates if needed |
| 1. First contact | **Hand it over in person** | The first exchange is always in person, at the door or a community spot. Five minutes of face time is the point |
| 1. First contact | **Intro cards** | Short opt-in profiles: skills, hobbies, languages, "happy to help with". AI drafts them from what a user lists |
| 2. Repeat | **Pair history** | "You and Tanaka-san: ladder, garden help, rice bags." Shared history makes the next ask easy |
| 2. Repeat | **Return the favour** | After you receive help, the app shows what that person currently needs |
| 2. Repeat | **Thank-you wall** | Thank-you notes appear on the circle board (opt-in). This recognises seniors publicly as helpers |
| 3. Group | **Skill circles** | Seniors teach cooking, gardening, calligraphy or Japanese. Foreign residents teach English or Bengali cooking. Small sessions at the community hall |
| 3. Group | **Event slots** | Cleaning days and festival setup list the jobs and the tools needed. The app shows who is lending what |
| 3. Group | **Shared rides and errands** | Batch shopping trips, like the Mizunoura shopping rides, into one request several neighbours join |
| 3. Group | **Circle toolbox** | Items the circle owns together, bought when the unmet-demand signal shows a need |
| 4. Watch over | **Gentle check-in (opt-in)** | If a senior who is usually active goes quiet for a set period, one trusted neighbour or family member gets a nudge to say hello. It's not surveillance: the senior chooses who, and can turn it off |
| 4. Watch over | **People you could meet (opt-in)** | Suggests neighbours with complementary needs and skills ("you both grow vegetables"; "she needs help with forms, you speak Japanese") |

**Design rules for connection:**

- Nothing public unless opted in.
- No ratings out of five stars, only thank-you notes. Stars feel like a marketplace and make neighbours judge each other.
- Every feature should end with two people meeting or one person feeling recognised, not with a transaction.

## How it fits the Tsunagu theme

The brief asks us to find a connection that is missing or not working well and update it with technology. Otagai covers all five kinds of connection the guide lists.

| Connection named in the brief | What is broken today | How Otagai updates it |
| --- | --- | --- |
| People ↔ people | Neighbours don't know each other. Seniors, young families and foreign workers live side by side but never meet | Circles, ripple requests and a per-pair balance turn one favour into an ongoing relationship |
| People ↔ things | Ladders, grass cutters and tools sit unused in sheds while a neighbour buys one for a single job | Tool listings within the circle, with a thank-you instead of a price |
| People ↔ communities | Association membership is falling (67.6% in Nagasaki City), and foreign residents are outside the circle | Joining a circle is the entry point, and helping is how newcomers become "one of us" |
| Past ↔ future | Traditional mutual aid (*yui*, *otagaisama*, *kairanban*, *han* rotations) no longer fits an aging, busy society | The same traditions, rebuilt digitally for 2040, when Nagasaki Prefecture will have 1.2 working-age people per senior |
| Data ↔ data | Coordinators match needs and helpers by hand; the Silver centre model reaches only 1.6% of seniors in Kagoshima | One shared record of needs, helpers and help given, visible to coordinators. Culture packs let the same data model run in another country |

A sixth connection we add for the pitch: **Japan ↔ Bangladesh.** A Bangladeshi worker in Nagasaki helps local seniors, and through proxy mode also arranges help for his own parents back home.

**Against the judging criteria:**

- **Problem definition and theme fit:** grounded in Nagasaki's own data and plans (the guests are Nagasaki Prefecture).
- **Technical skill:** ripple matching, the relationship graph, the AI polite-request writer, culture packs behind one config, and a pluggable payment layer.
- **Completeness:** every MVP feature in the table above works end to end in the demo.
- **Originality:** senior-first, designed around *enryo*, with proxy mode and a cross-border story. No competitor in the gap table combines these.
- **Proposal clarity:** 3 pages, structured as problem → gap → solution → status, with real numbers.

## Impact

The strongest impact claim is about health. In Japan's largest aging study, seniors who take part in their community are less likely to end up needing long-term care. Otagai turns helping a neighbour into that kind of participation.

**The evidence:** a JAGES study followed 90,889 community-dwelling seniors for about 3 years. Those who took part in work, local events, neighbourhood associations, volunteering, hobbies and similar activities had a significantly lower risk of being certified as needing long-term care. The more types of activity they joined, the lower the risk ([JAGES via Igaku-Shoin](https://webview.isho.jp/journal/detail/abs/10.11477/mf.1552202315)). Japan's national health plan (Health Japan 21, third term, from FY2024) now sets targets for more social participation and stronger local ties ([Health and Longevity Net](https://www.tyojyu.or.jp/net/topics/tokushu/koritsushitakoreisha-seikatsuosasaeru/koreishanoshakaisanka-shakaikankei.html)).

| Who | Impact |
| --- | --- |
| Active seniors | A role and recognition as helpers, plus small income or points. Participation is linked to lower care risk |
| Seniors who need help | Small troubles (garbage, shopping, bulbs, carrying) solved by neighbours, plus a light check-in network |
| Families far away | Proxy mode lets a daughter in Fukuoka, or a son abroad, arrange help and see that it happened |
| Foreign residents (12,807 workers in Nagasaki Pref.) | A way into the community as helpers, with language support |
| Neighbourhood associations | A reason for younger and newer residents to join, and a digital circular without a separate app |
| City and welfare coordinators | Needs and helpers visible in one place, instead of matching by phone. Unmet demand shows up as data |
| Everyone | Fewer one-time tool purchases, and more use of what neighbours already own |

**What a pilot would measure:**

- Senior helpers active per circle, and the share of helpers aged 65+.
- Requests matched, and median time to match.
- Repeat pairs (two people who exchanged help more than once). This is our measure of real connection.
- New association members who joined through the app.
- Coordinator hours saved on manual matching.

We haven't run a pilot yet, so the proposal should present these as metrics to track, not results.

## Bangladesh: the second culture pack

Bangladesh has the same missing connection as Japan, a decade or two earlier on the aging curve, with one extra twist: the children are often abroad. Otagai runs there with a Bangladesh culture pack, so the pitch shows the engine works anywhere.

| Indicator | Number | Source |
| --- | --- | --- |
| People aged 60+ | About 16 million, close to 10% of the population | [UNB](https://unb.com.bd/category/Bangladesh/avg-life-expectancy-in-bangladesh-saw-steepest-gains-worldwide-in-last-25-years-social-welfare-minister/197288) |
| Projected 60+ by 2050 | About 50 million, over 20% | [UNB](https://unb.com.bd/category/Bangladesh/avg-life-expectancy-in-bangladesh-saw-steepest-gains-worldwide-in-last-25-years-social-welfare-minister/197288) |
| Workers who went abroad, 2025 | 1,132,519. A "Japan Cell" was set up to send 100,000 workers to Japan over 5 years | [Financial Express](https://today.thefinancialexpress.com.bd/print/over-113m-bangladeshis-employed-abroad-in-2025-1775414130) |
| Left-behind elderly | An RMMRU survey (6,000 interviews, 20 districts) found anxiety, insecurity, loneliness and neglect among parents of migrants | [Financial Express](https://thefinancialexpress.com.bd/national/elderly-family-members-endure-woes-for-migration-of-offspring) |
| Bangladeshis working or studying in Japan | Rose from 18,000 to 41,000 in 2025 | [Daily Star](https://online-d11.thedailystar.net/news/bangladesh/news/japan-considering-more-skills-testing-centres-recruit-bangladeshi-workers) |
| bKash verified customers | 82 million (end of 2025) | [Bonik Barta](https://en.bonikbarta.com/business/dt2VlJjSIXS99Mic) |
| Smartphone access / internet use / own a phone | 75.1% of households / 59.2% of people / 65.6% of people (Apr–Jun 2026) | [Daily Star](https://thedailystar.net/news/technology/news/mobile-phone-use-reaches-896-bangladesh-bbs-4278021), [UNB](https://unb.com.bd/category/Bangladesh/mobile-phone-ownership-rises-bbs/195830) |

**Urban neighbours have become strangers.** In Dhaka apartments, people often live side by side for years without learning each other's names ([Daily Star](https://www.thedailystar.net/special-events/my-dhaka/news/know-your-neighbour-3384106)). Asking a neighbour for a favour, once ordinary, now feels hard to imagine ([Daily Star](https://www.thedailystar.net/howdy-neighbour-32542)). Old Dhaka still keeps the old neighbour culture.

**Existing apps sell services, not neighbourliness.** [Sheba.xyz](https://simplify.jobs/c/Sheba-Xyz) offers 300+ home services from verified professionals, the Bangladeshi equivalent of a paid-services marketplace. Nothing serves para- or building-level mutual help.

**Shared phones make proxy mode essential.** Only 65.6% of individuals own a phone, so many elderly parents rely on a family member's phone. Proxy mode becomes a core feature, not an extra.

| Culture pack setting | Japan (Nagasaki) | Bangladesh (Dhaka / village) |
| --- | --- | --- |
| Community units | City → neighbourhood association → *han* | City → *para* / *moholla* → building or flat owners' association |
| How people ask | Indirect, silent decline; AI writes keigo | More direct in villages and Old Dhaka; AI adds respectful terms (*Apa, Bhai, Chacha, Khala*) |
| Thank-you norm | *Orei*: small money or sweets | Often free between neighbours; optional *mishti* or a small payment |
| Payment | Stripe in JPY (PayPay later) | bKash / Nagad (mocked in the demo), cash, or none |
| Trusted intermediary | Association leader, welfare volunteer, life-support coordinator | Building secretary, mosque or *samaj* committee, ward member |
| Community moments | Matsuri, cleaning days, disaster drills | Eid, Pohela Boishakh, food sharing on Shab-e-Barat |
| Languages | Japanese, English, plus Vietnamese, Bengali, etc. | Bengali, English |

**The cross-border story (Japan ↔ Bangladesh):** Rahim, a technical intern in Nagasaki, carries Tanaka-san's rice up the hillside stairs. He reads her request in Bengali; she wrote it in Japanese. She lends him her bicycle for the weekend. Then, through proxy mode, Rahim posts a request for his mother in Cumilla. A neighbour in her building circle picks up her medicine, and Rahim sends a thank-you through bKash. One app, two culture packs, and a connection that runs both ways.

## Hackathon plan

Build the engine generically, but demo one story: Nagasaki first, then the Bangladesh link. A narrow, fully working demo beats a broad, half-working one.

**Suggested stack:** Next.js (installable web app) · FastAPI · PostgreSQL · an LLM API for text and vision features · Stripe test mode (JPY) · mocked bKash · Leaflet + OpenStreetMap · Japanese, English and Bengali text.

**Team split (4–5 people):**

| Role | Owns |
| --- | --- |
| Backend | Data model (circles, relationships, proxies, listings, requests, matches, thank-yous), ripple matching, API |
| Frontend | Simple, large-button UI; listing and request flows; pair history; Japanese/English/Bengali |
| AI | Polite-request writer, task → tools, photo → listing, handover checklist, thank-you helper |
| Payments + proxy + data | Stripe test mode, mocked bKash, proxy mode, demo seed data (one Nagasaki circle, one Cumilla building circle) |
| Pitch (shared) | 3-page proposal PDF, 3-minute video, 6-minute slides |

**Checkpoints:**

- [ ] Sun 22 Nov night: public repo, `.env` in `.gitignore`, schema, seed data, login
- [ ] Mon 23 Nov midday: listings, requests, ripple matching, chat
- [ ] Mon 23 Nov night: AI request writer, task → tools, photo → listing, proxy mode
- [ ] Tue 24 Nov midday: thank-yous and Stripe, pair balance, Bangladesh pack, polish
- [ ] Tue 24 Nov 18:00: record the 3-minute video (English narration or subtitles), upload to YouTube as Unlisted
- [ ] Tue 24 Nov 21:00: export the proposal PDF (`TeamName_Proposal.pdf`), max 3 pages, listing where AI tools were used
- [ ] Tue 24 Nov 23:00: submit to Dropbox (one-hour buffer before the 23:59 deadline)

**3-minute demo video:**

1. 0:00–0:20: the problem in numbers (Nagasaki 34.9% aged 65+, Silver centres reach 1.6% of seniors, Sasebo's app reached 396 registrants).
2. 0:20–1:30: Tanaka-san lists her grass cutter from a photo. Rahim asks for help putting up a shelf (task → tools). A polite request goes out, the handover checklist runs, and she gets a thank-you.
3. 1:30–2:15: Tanaka-san needs rice carried up the stairs, posted by her daughter through proxy mode. Rahim helps, and their pair balance updates.
4. 2:15–2:45: Rahim posts for his mother in Cumilla on the Bangladesh pack, with a bKash thank-you.
5. 2:45–3:00: impact and close: "Nagasaki already has the helpers. Otagai is the connection."

**Judge Q&A prep:**

| Likely question | Our answer |
| --- | --- |
| How is this different from Jimoty or AsMama? | Jimoty is open classifieds full of business ads. AsMama is built around childcare. Otagai is senior-first, organised around the neighbourhood association, designed around *enryo*, and has proxy mode |
| Will seniors really use an app? | 96.5% of mobile owners aged 60–79 use a smartphone, and 91.1% of people in their 60s use LINE. For the rest, simple mode, voice input and proxy mode |
| What if something breaks or goes missing? | In-person handover, photo checklists, AI flags but people decide. Insurance later (Locapi shows it's possible) |
| Is handling money legal? | Payments go through a licensed provider (Stripe), and the platform doesn't hold funds. We'd get a legal review before launch |
| How do you get the first users? | Pilot with one Nagasaki neighbourhood association and its life-support coordinator, and recruit helpers through the local Silver centre |
| Why Bangladesh too? | Same engine, different culture pack. 41,000 Bangladeshis work or study in Japan, and their parents at home face the same problem |

## Sources

Figures come from search results gathered on 22 Nov 2026. Before the proposal is submitted, open the key pages once to confirm the numbers.

**Japan / Nagasaki**

- [Nagasaki Pref. age-group population estimate, Oct 2024](https://www.pref.nagasaki.jp/shared/uploads/2024/12/1735192207.pdf)
- [Nagasaki Pref. elderly welfare plan (working-age per senior)](https://www.pref.nagasaki.jp/shared/uploads/2024/05/1716862251.pdf)
- [Nagasaki City community care system page (aging rate, 75+ projection)](https://www.city.nagasaki.lg.jp/syokai/792000/792109/p028202.html)
- [Nagasaki Pref. municipal services list (door-to-door garbage pickup on slopes)](https://www.pref.nagasaki.jp/shared/uploads/2024/01/1704963405.pdf)
- [Nagasaki Pref. life-support case studies (Mizunoura shopping rides)](https://www.pref.nagasaki.jp/fs/8/3/9/5/_/5.______.pdf)
- [Nagasaki City life-support coordinator reports (needs matching, smartphone classes)](https://www.city.nagasaki.lg.jp/uploaded/attachment/26474.pdf)
- [Nagasaki City life-support committee FY2024 (small-trouble needs)](https://www.city.nagasaki.lg.jp/uploaded/attachment/43850.pdf)
- [Nagasaki City neighbourhood planning (falling association membership)](https://www.city.nagasaki.lg.jp/uploaded/attachment/18593.pdf)
- [Fukuoka Pref. survey of Nagasaki City (67.6% membership)](https://www.pref.fukuoka.lg.jp/uploaded/life/617350_61117026_misc.pdf)
- [Nagasaki Labour Bureau, foreign employment Oct 2025](https://jsite.mhlw.go.jp/nagasaki-roudoukyoku/content/contents/gaikokujin-koyo-26013009.pdf)
- [MIC, Sasebo City Machimachi case study](https://www.soumu.go.jp/main_content/000768905.pdf)

**Seniors as helpers and health evidence**

- [MHLW, Silver Human Resource Centre overview](https://www.mhlw.go.jp/content/12600000/001446630.pdf)
- [Chiba Pref., Silver centre new-member survey](https://www.pref.chiba.lg.jp/koyou/rouseichiba/2025/documents/598-10-11.pdf)
- [Hiroshima City resident-led support groups](https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/011/599/229029.pdf)
- [Niigata City resident-led home help](https://www.city.niigata.lg.jp/iryo/korei/chiikihokatsucare/seikatsusien.files/tirasi.pdf)
- [Sawayaka Foundation, Mito paid volunteers](https://www.sawayakazaidan.or.jp/poster/sys_data/poster_files/3/t-098.pdf) · [NALC time banking](https://www.sawayakazaidan.or.jp/summit/sys_data/panel_files/1/t-o-049.pdf)
- [JAGES: social participation and long-term care risk](https://webview.isho.jp/journal/detail/abs/10.11477/mf.1552202315)
- [Health and Longevity Net, JAGES 2010–2022](https://www.tyojyu.or.jp/net/topics/tokushu/koritsushitakoreisha-seikatsuosasaeru/koreishanoshakaisanka-shakaikankei.html)
- [MMD Labo senior smartphone survey 2025 (via DIME)](https://dime.jp/genre/2051321/) · [MIC White Paper 2025 (LINE use)](https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/r07/pdf/n1110000.pdf)

**Platforms**

- [Jimoty Mutual Aid](https://jmty.jp/all) · [Jimoty at ad:tech Tokyo (10M monthly users)](https://2024.adtech-tokyo.com/en/sponsor/detail.html?num=jimoty)
- [ANYTIMES App Store](https://apps.apple.com/jp/app/id1071718230) · [ANYTIMES fee model](https://newscast.jp/smart/news/0975244)
- [Locapi App Store](https://apps.apple.com/jp/app/id1637037219) · [Locapi launch release](https://newscast.jp/smart/news/8043712)
- [AsMama MyComu (Cabinet Secretariat)](https://www.cas.go.jp/jp/seisaku/digital_gyozaikaikaku/taiwa2/231016taiwa2.pdf) · [AsMama case study (MIC)](https://www.soumu.go.jp/main_sosiki/joho_tsusin/top/local_support/ict/jirei/pdf/2017_086_1.pdf)
- [PIAZZA (Sakai City)](https://www.city.sakai.lg.jp/naka/joho_naka/piazza_nakaku.html) · [Sapporo neighbourhood association app partnerships](https://www.city.sapporo.jp/shimin/shinko/chounaikai/hint/digital_kanminrenkei.html) · [Imizu City Yui-net programme](https://www.city.imizu.toyama.jp/appupload/EDIT/143/143690.pdf)

**Bangladesh**

- [UNB, senior citizens 16M → 50M](https://unb.com.bd/category/Bangladesh/avg-life-expectancy-in-bangladesh-saw-steepest-gains-worldwide-in-last-25-years-social-welfare-minister/197288)
- [Financial Express, 1.13M employed abroad in 2025 + Japan Cell](https://today.thefinancialexpress.com.bd/print/over-113m-bangladeshis-employed-abroad-in-2025-1775414130)
- [Financial Express, RMMRU left-behind elderly survey](https://thefinancialexpress.com.bd/national/elderly-family-members-endure-woes-for-migration-of-offspring)
- [Daily Star, Bangladeshis in Japan 18k → 41k](https://online-d11.thedailystar.net/news/bangladesh/news/japan-considering-more-skills-testing-centres-recruit-bangladeshi-workers)
- [Bonik Barta, bKash 82M customers](https://en.bonikbarta.com/business/dt2VlJjSIXS99Mic)
- [Daily Star, BBS ICT survey Apr–Jun 2026](https://thedailystar.net/news/technology/news/mobile-phone-use-reaches-896-bangladesh-bbs-4278021) · [UNB, phone ownership 65.6%](https://unb.com.bd/category/Bangladesh/mobile-phone-ownership-rises-bbs/195830)
- [Daily Star, Know your neighbour](https://www.thedailystar.net/special-events/my-dhaka/news/know-your-neighbour-3384106) · [Daily Star, Howdy neighbour](https://www.thedailystar.net/howdy-neighbour-32542)
- [Sheba.xyz overview](https://simplify.jobs/c/Sheba-Xyz)
