# Otagai: Director's Brief (v2, "One Line")

> **Note:** this is the original 2:00 brief. The revised cut runs 2:45 and adds Join, Explore, Rahim asks, the circle board and disaster mode. `scenes/index.js` and the timeline in `README.md` are the source of truth for timings.

> Runtime **2:00** (hard cap) · 16:9 1920×1080 master · **Kokoro `af_heart` voice-over** + synthesized score at **96 BPM** (1 bar = 2.5 s, 48 bars) · all light, in the app's own palette

## 0. The film in one line

**The whole film is a single line, drawn without lifting the pen.** The camera rides its tip through one morning in a Nagasaki hillside neighbourhood. For two minutes the line is a street, a staircase, a ripple, a chat, a thank-you cord. In the last shot the camera pulls all the way out, and the path we've been following turns out to be the **Otagai mark**: two houses joined by one line.

This design comes from the app, not from a template:
- **The logo is one stroke.** `otagai-mark.png` is a single unbroken line that becomes two houses. The film is that stroke at a scale of 1:200.
- **Hitofude-gaki (一筆書き, one-stroke drawing) and the emakimono (絵巻物, picture scroll)** are Japanese forms for telling a story along one continuous surface. The film is a scroll that never cuts.
- **"One morning in Nagasaki"** is the app's own onboarding line (`storyPlace`). The film runs from 6 am to evening.
- **The roof slope of the left house is the Mizunoura steps.** The problem act literally climbs the logo.

## 1. Rules of the world

1. **No cuts, ever.** One camera on one giant paper world (about 24,000 × 9,000 world px). Every transition is a camera move: travel along the line, a dive into a window, or a pull-out.
2. **The line is the only thing that moves the story.** It draws ahead of the camera, so the next idea is always arriving from the right.
3. **Everything is light.** No dark act. The problem is shown as **gaps in the line**, not as darkness: doors that aren't connected, and a line that reaches toward a neighbour and pulls back.
4. **App UI grows out of the world.** A window opens and becomes a white card, a door becomes a phone. The UI is rebuilt from `tokens.json` at film scale.
5. **Three scripts, one sentence.** Tanaka's request is one object that morphs between Japanese, Bengali and English. Translation is shown as a transformation, not as a second line of subtitles.

## 2. Look: "Paper, ink, and one warm seal"

Straight from `mobile/src/theme/tokens.json`. Nothing invented except a paper shadow tone.

| Token | Hex | Use in the film |
|---|---|---|
| `paper` | `#F8F5ED` | The world: the scroll itself, with faint fibre grain |
| `canvas` | `#FFFFFF` | App cards and phone screens (they sit on paper as they do in the app) |
| `action` | `#537257` | **The line.** Buttons, the wordmark |
| `wash` | `#E8EEE2` | Ripple fills, chips, selected states, soft "lit" windows |
| `ink` | `#303630` | Headline type, house outlines (thin, 40% opacity: the line is the only bold stroke) |
| `secondary` | `#586057` | Supporting type, captions |
| `rule` | `#D9DDD2` | Background houses, map contours, dividers |
| `control` | `#81877C` | Mono labels, source line |
| `clay` | `#AA6A52` | **The one warm thing:** the sun disc, Tanaka's door, the thank-you seal, the mizuhiki knots |
| (derived) | `#E9E3D5` | Paper shadow under cards |

- **Type:** Inter 600 for headlines and UI, Lora 400 for the wordmark and the closing line, Noto Sans JP and Noto Sans Bengali for in-world copy, Geist Mono for small labels and the clock.
- **Light across one day:** the paper tint drifts from dawn `#F6EFE2` to midday `#F8F5ED` to late afternoon `#F5ECDD`. The clay sun disc rises along the top of the scroll as a quiet clock: 6:40 → 17:30.
- **Camera:** spring-driven 2.5D. House layers sit at 3 depths (parallax 0.6 / 1.0 / 1.25). Slow drift via `noise1`. No whip blur. The motion is calm and continuous, like a hand unrolling a scroll.
- **Grain:** 4% paper grain, vignette 0.25 so the corners stay warm, not grey.

### UI pieces, rebuilt at film scale (true to the app)

1. **Phone slab:** white, 56 px radius, soft paper shadow, tab bar *Home · Browse · Requests · Ask*.
2. **Ask composer:** "What do you need?", mic pill, waveform drawn by the line itself.
3. **Request card:** the trilingual sentence morph, plus the chip "Nothing is sent until you tap Send."
4. **Ripple:** ink rings on paper with stage labels *Family → Your circle → Association → Nearby within 3 km* and a counter "12 delivered to inbox".
5. **Offer card:** Rahim's view in Bengali, the button "Offer to help".
6. **Chat:** bubbles with "Preview translation".
7. **Listing card:** photo → *Hammer drill · Tools · Included: battery, charger, 2 bits*.
8. **Handover checklist:** two avatars ticking the same list → "Both neighbours confirmed the same checklist."
9. **Thank-you sheet:** *Send a note · Bring a small gift · Send a small orei*, with "Suggested note · Editable".
10. **Shared history:** "You helped Tanaka-san 3 · Tanaka-san helped you 3".
11. **Family switcher:** "Choose who you're helping" → Ammu, and the UI flips to Bangla.

## 3. The signature moments (the ambitious bits)

1. **The hesitant line (enryo, 遠慮).** The line leaves Tanaka's door toward her neighbour's, slows, wavers, and **retracts** back into her door. Meanwhile a typed message deletes itself letter by letter. The only "problem" visual in the film is a line that doesn't dare to go.
2. **The sentence that changes script.** 階段の上までお米を運ぶのを手伝っていただけませんか？ dissolves glyph by glyph into সিঁড়ি দিয়ে চালের বস্তা তুলতে কেউ কি সাহায্য করবেন? and then into English. Each glyph scales down to a dot and back up as the new script, staggered along the line.
3. **Ripple on paper.** The Send button drops onto the scroll like a stone in water. Four rings widen, one per bar. Doors inside each ring get a soft `wash` glow when the request reaches their inbox. Some doors stay unlit. **Nothing happens to them, which is the point:** "No reply is a quiet no."
4. **The mizuhiki knot (水引).** Mizuhiki is the cord tied on Japanese gift envelopes. At the thank-you, the line ties itself into an awaji knot (あわじ結び, a knot that holds both ends) in clay. Then **each favour adds a small knot** on the line between the two houses: 3 on Tanaka's side and 3 on Rahim's. This shows the "shared history" balance without numbers or stars.
5. **The line crosses the sea.** From Nagasaki harbour the line runs out over drawn waves to Cumilla. There's a horizon fold, the paper tint warms, and the Bengali lettering takes over. Rahim arranges help for his mother through the same app.
6. **The pull-out.** The camera rises from 1:1 to about 1:12 over 8 seconds. Every street, staircase, ripple and knot we followed resolves into the two-house mark. The wordmark lands under it in Lora. Then the mark unwinds back into the single dot on paper we saw at 0:00, so the film loops.

## 4. Cast (the app's own demo personas, fictional)

- **Tanaka-san**, 78, at the top of the Mizunoura steps. Writes Japanese. Owns a hammer drill.
- **Rahim**, a technical intern down the slope. Reads Bengali.
- **Ammu**, Rahim's mother in Cumilla.
- Faces appear twice only, through the repo's real photos: `onboarding-nagasaki.jpg` (the bag handover) and the round portraits `onboarding-tanaka.png` / `onboarding-rahim.png`. Everything else is line drawing.

## 5. Beat sheet @ 96 BPM (bar = 2.5 s) with narration

The VO is quoted in *italics*. On-screen text is short, because the narration carries the explanations.

### Morning · the gaps · 0:00–0:27.5 (11 bars)

**0:00–0:07.5 · A dot on paper**
- 0:00 A single sage dot on blank paper. The clay sun is just above the edge. Mono clock: `06:40 · Mizunoura, Nagasaki`.
- 0:01 The dot starts drawing. The camera follows its tip as it draws a street, then the first houses in thin ink.
- 0:02.5 The line draws a slope: **34.9%** grows as a counter along the gradient of the hill. `aged 65+ · Nagasaki City, Mar 2025`.
- *"In Nagasaki, one in three people is over sixty-five."*

**0:07.5–0:15 · The steps**
- The line climbs. It *is* the staircase: each step is a corner in the line. The real Mizunoura steps photo fades in under the drawing at 25% and fades back out (the "this is a real place" moment).
- Small labels hang off the steps as the camera climbs: *Rice up the steps* · *Garbage out by 8* · *A bulb, just out of reach*.
- *"Here, the hardest part of the day is often a small one."*

**0:15–0:20 · Enryo**
- At the top, Tanaka's door (clay). A message field types: *Could someone help me…*. The line reaches toward the next door, wavers and retracts. The text deletes. A faint 遠慮 sits on the paper.
- *"And asking a neighbour can feel like a burden."*

**0:20–0:27.5 · The helpers**
- The camera eases back: houses across the slope, windows glowing `wash` one by one. Each door has a short stub of line that never reaches the next.
- *"The helpers already live here. Nothing connects them."*

### The turn · 0:27.5–0:35 (3 bars)

- The stub from Tanaka's door **finally goes all the way**. It runs down the slope to Rahim's door in one confident stroke, and for a moment the camera sees that shape at medium scale: two houses, one line (the mark, half-revealed, saved for the end).
- Wordmark **Otagai** in Lora, sage. Below it お互い · *mutual*. Tag: **Help is close by.**
- *"Otagai. It means mutual. Help is close by."*

### The day · how it works · 0:35–1:35 (24 bars)

Mono step labels hang on the line like street signs: `01 ASK`, `02 RIPPLE`, `03 MEET`, `04 LEND`, `05 THANK`.

**01 Ask · 0:35–0:47.5 (5 bars)**
- Tanaka's window opens into a white phone card. "What do you need?" The line becomes the waveform as she speaks: *rice, up the steps, Saturday*.
- The plain words rewrite themselves into the polite Japanese request. Translation morph to English for us.
- The chip "Nothing is sent until you tap Send." The line pulls into the **Send** pill. Tap.
- *"Tanaka-san just says what she needs. Otagai writes it as a polite request. Nothing is sent until she taps send."*

**02 Ripple · 0:47.5–1:00 (5 bars)**
- The camera rises to a three-quarter top view of the slope. The Send pill drops, and the rings widen on bars 1–4: Family · Your circle · Association · Nearby within 3 km. Doors light up `wash`; some stay plain. Counter: "12 delivered to inbox".
- *"It starts with family, then widens, gently. If someone can't help, they simply don't reply. No one is told."*

**03 Meet · 1:00–1:12.5 (5 bars)**
- The camera follows one ring down to Rahim's door. His phone card: the request **morphs from Japanese into Bengali** (signature moment 2). He taps "Offer to help".
- A chat bubble: his Bengali reply morphs into Japanese for her, labelled "Preview translation".
- The line runs back up the steps (he's climbing), and the card dissolves into the real photo of the two of them with the shopping bag, framed like a painting on the scroll.
- *"Rahim reads it in Bengali. His reply reaches her in Japanese. Then they meet, in person."*

**04 Lend · 1:12.5–1:22.5 (4 bars)**
- Rahim needs a drill. Tanaka points her phone at hers: the line forms corner brackets around `home-drill.png`, then a shutter flash.
- Fields type themselves into a listing card. The handover checklist: two round portraits tick the same three items, and the line becomes a check.
- *"Next week, she lends him her drill. One photo becomes a listing, and they check the parts together."*

**05 Thank · 1:22.5–1:35 (5 bars)**
- The thank-you sheet slides up. "Send a note" is chosen, and the suggested note types in.
- Five faint star outlines appear and dissolve into a single handwritten note. The line ties a clay **mizuhiki knot** around it.
- Pull back to the two houses: knots add along the line between them, 3 + 3. Caption: "You helped Tanaka-san 3 · Tanaka-san helped you 3".
- *"There are no star ratings here. Only thank-yous, and a quiet record that help goes both ways."*

### Both ways · 1:35–1:52.5 (7 bars)

**1:35–1:45 · Across the sea**
- The line runs out to the harbour and over the waves (signature moment 5) to a Cumilla apartment block. The family switcher shows "Choose who you're helping" → Ammu, and the UI flips to Bangla. A neighbour in her building picks up her medicine (a small door glow).
- *"And Rahim can use the same app to arrange help for his mother, back home in Cumilla."*

**1:45–1:52.5 · Trust, as signs along the line**
- Three plain cards hang off the line as it returns: **AI suggests. People decide.** · **Contact details stay private.** · **Nothing public unless you opt in.**
- *"AI suggests. People decide. And your contact details stay private."*

### Close · 1:52.5–2:00 (3 bars)

- The pull-out (signature moment 6): the whole journey resolves into the Otagai mark. Wordmark plus お互い.
- *"Nagasaki already has the helpers. Otagai is the connection."*
- The mark unwinds into the single dot from 0:00. The clay sun sets at the edge. Loop.

## 6. Sound

- **Score:** 96 BPM, D major pentatonic throughout (there's no dark act, so there's no minor key). It starts from silence + paper texture (a soft filtered-noise "pen on paper" tied to the line's speed).
  - 0:00–0:27: sparse felt piano, single notes on the dot and steps, a low pad. It thins out at the retracting line (a held note that doesn't resolve).
  - 0:27.5: the motif (5 notes) arrives when the line finally reaches Rahim's door. It resolves on the wordmark.
  - 0:35–1:35: `groove`, then `groove_full` from 03 Meet. Gentle kick, plucked koto-like Karplus-Strong arp over the piano.
  - 1:32: the motif in octaves as the knots land (`swell`).
  - 1:35–1:52: lighter groove under the sea crossing.
  - 1:52.5: `outro`, final motif on the mark, then fade.
- **SFX:** pen scratch under fast drawing, soft tick on the 34.9% counter, key clicks for typing and deleting, a chime on Send, a water "plip" + low swell for each ripple ring, pops on door glows, a shutter on the drill, a bell on each knot, and one soft boom on the pull-out reveal.
- **VO mix:** `build.sh` levels the narration and uses it to duck the score. The delivery mix targets −14.5 LUFS integrated.
- I can't hear audio. I check it by meter and spectrogram, and you listen.

## 7. Build notes

- **World + camera instead of scene cuts.** One `world` layer holds every drawing at fixed world coordinates. `camera(t)` returns `{x, y, zoom}` from `track()` keyframes. Scenes become "stations" that only build and animate the overlays (UI cards, text) near their part of the line.
- **The line is one SVG path.** It's authored as a list of segments (street, steps, door stubs, ripple centre, sea crossing, knots) inside the macro two-house shape. Draw-on uses `stroke-dashoffset` with total length L; `penAt(t)` gives the tip position and the camera follows it with a soft spring. The retracting enryo stub and door stubs are separate short paths.
- **Hero engine:** used in screen space only for the pills (mic → Send → Offer to help → check), so those morph. The world line is separate.
- **Japanese font:** fetch Noto Sans JP with `&text=` for exactly the characters used.
- **Script morph:** each glyph is a `span`. Out-glyphs scale to a 6 px dot along a shared baseline, and in-glyphs grow from the same dots, staggered 18 ms.
- **Render:** about 2.4 GB RAM free, so 3 workers. Draft at 30 fps takes about 20 min, the final at 60 fps about 40 min.

## 8. Claims and guardrails

- **34.9%** aged 65+: Nagasaki City, Mar 2025, shown on screen in mono.
- No competitor or real organisation names. Tanaka, Rahim and Ammu are the app's demo personas.
- Payments: "Send a small orei" appears only as an option on the sheet. No payment flow is shown.
- Disaster mode, events and the coordinator view are left out (backend or roadmap only).
- AI wording: "writes", "suggests", "helps". Never "decides" or "matches".

## 9. Decisions (locked)

- The film lives in `motion/`, gitignored.
- It focuses on the main features: Ask, Ripple, Meet + translation, Lend + checklist, Thank + shared history, Family.
- Voice-over: Kokoro `af_heart`, en-us.
- All light, in the app palette. No dark act.
- One continuous camera, no cuts. The line reveals the logo at the end.
