# People want to open it

`ux-desirability` | ux | phase 9 | status: partial | /north-star#ux-desirability

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Desirability: Do people want to use it? (An appealing, appropriate tone and visual experience.)"

## The bar

Shown beside Fastlane's version of the same screen, the people Content Studio is for pick ours or call it even on at least 6 of 8 screens, every word follows Leo's tone rules and fits the brand on screen, and Leo comes back to it on most days.

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| D1 | Jev panel: 8 screen pairs (ours and Fastlane's frame of the same screen) read by 5 personas, each pair asked twice with the order swapped | Ours preferred or even (p 0.45 or more) on 6 of 8 pairs for every persona; on ours alone, "looks finished", "sounds like a person" and "clear what to press next" each at 0.7 or more | Not run (paid, about US$0.04 a wave) |
| D2 | Tone in our own strings: emoji, em dashes and banned words in UI strings under src (`.tsx` files and src/data), plus `aicheck` on each core screen's own text | 0, 0 and 0; every screen under 15 | 1 emoji (the waving hand after "Welcome, <name>" at src/pages/WelcomePage.tsx:98); 0 em dashes in UI strings (comments hold some); "curated" twice (src/components/CompetitorReference.tsx:279, 320); "not generic AI" in 5 strings (src/pages/PlaybookPage.tsx:199, src/pages/GeneratePage.tsx:3131, src/pages/WelcomePage.tsx:22, src/data/quickTips.ts:83, src/data/academy.ts:36). aicheck: Analytics 29, Welcome 17, Formats 13, Studio 12, Home 8, Calendar 3, campaign wizard 0 |
| D3 | Words that fit the brand on screen: adviser-only words on a business brand's screens | 0 | Top posts on ActivityTracker (a business) offers the fixed adviser topics, "Insurance 14", "Career / FA Life 13", "Investment 12" |
| D4 | One visual system in the dark theme: palette colours with no `dark:` pair, and the installed app's colours | 0 unpaired; manifest colours match the dark canvas | About 48 classNames in 23 files by a rough grep (a `text-`, `bg-` or `border-` palette class in a className with no `dark:` in it; the count moves with the pattern, which build item 5 fixes in a test); `background_color` and `theme_color` are #ffffff while the canvas is #111214, so the installed app opens on a white splash |
| D5 | Coming back by choice: days in the last 7 with at least one /activity row by You, from Leo's "This week" strip (ux-utility build item 1) | 5 or more, as a 4-week average | Not read (needs his session) |

The 8 screen pairs and their Fastlane frames:

| Pair | Fastlane | Ours |
| --- | --- | --- |
| Home | [0:04](../../../public/north-star/fastlane/t004.webp) | /home |
| Plan a campaign, angles step | [0:14](../../../public/north-star/fastlane/t014.webp) | /campaigns/new |
| Review queue | [0:41](../../../public/north-star/fastlane/t041.webp) | /campaigns/<id> |
| Formats gallery | [1:29](../../../public/north-star/fastlane/t089.webp) | /make |
| Schedule, step 1 | [1:56](../../../public/north-star/fastlane/t116.webp) | /drafts?schedule=<id>&step=where |
| Ad library | [3:59](../../../public/north-star/fastlane/t239.webp) | /swipe?tab=ads |
| Chat with an approval card | [4:26](../../../public/north-star/fastlane/t266.webp) | /agent/<thread> |
| First run, welcome | [4:40](../../../public/north-star/fastlane/t280.webp) | /welcome |

The personas: Leo, who runs several brands and posts daily; a Singapore financial adviser, 35, who posts twice a week between client meetings; a team leader who approves 12 advisers' posts; an agency owner with 5 client brands; and a self-employed salesperson, ActivityTracker's own audience.

## How the best do it

Fastlane's look and voice, from Leo's recordings:

- A dark canvas with the content on a second rounded panel, a monospace-style display face for the greeting ("Evening, Jun"), caps micro-labels led by a small orange or red square ("NEXT UP", "GOAL", "PACE"), dot-matrix numerals and a speedometer for Pace ([0:04](../../../public/north-star/fastlane/t004.webp), notes-1.md F2).
- One character: Senna has a name, a helmet avatar and a first-person voice. The tour opens with "Home is your inbox from me. Posts waiting for your yes, anything that failed, and our chats." (notes-4.md 2.9).
- Small moments of motion with a job: a red pixel mosaic wipes in as Home finishes loading ([0:03](../../../public/north-star/fastlane/t003.webp)), and every page shows a chip such as "Loading your home" over a skeleton of the page ([0:01](../../../public/north-star/fastlane/t001.webp), notes-4.md 2.18).
- Short, plain lines that say what happens: "Ready for what's next" / "Nothing is running right now.", "Schedule it, or leave it in the Library.", "Adding this to the strategy does not start anything." (notes-1.md F2, F5.5).
- A US App Store search for "Fastlane AI" on 27 Oct found no Fastlane app, so it has no public rating.

How much people like the apps around us shows in their ratings. These are US App Store numbers, read on 27 Oct through the iTunes Search API:

| App | Rating | Ratings |
| --- | --- | --- |
| Canva | 4.87 | 3,591,007 |
| OpusClip | 4.85 | 8,531 |
| Linear Mobile | 4.83 | 2,282 |
| Things 3 | 4.82 | 28,035 |
| Notion | 4.77 | 90,502 |
| Captions | 4.74 | 38,804 |
| Buffer | 4.73 | 34,735 |
| Hootsuite | 4.67 | 34,292 |
| CapCut | 4.61 | 1,125,117 |
| Superhuman Mail | 4.60 | 3,726 |
| Later | 4.55 | 2,539 |
| Metricool | 2.60 | 117 |

- Things has been "Honored twice with the prestigious Apple Design Award", and a review quoted on its page says "every individual bit and pixel has been redesigned" ([culturedcode.com/things](https://culturedcode.com/things/)).
- Linear sells the feel as speed ("Designed for speed") and asks for plain names: "Don't invent terms if possible" ([linear.app](https://linear.app/), [method](https://linear.app/method/introduction)).
- Superhuman "uses minimal animations, so no time is wasted on loading them", and "every action has a blazingly fast shortcut" ([Superhuman blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
- Canva and CapCut win on starting points: "From AI-generated designs to timeless classics, find the perfect one-click start for any video on CapCut" ([capcut.com](https://www.capcut.com/)).

No Mobbin screens are cited here yet (open question 5).

## What we have today

- Dark by default (src/lib/theme.ts, `cs-theme`), switched per device; public pages stay light. The shell and Home follow Fastlane's layout (docs/fastlane-nav-gap.md, card agent-home).
- The look differs from Fastlane's in the details: a serif display face for the greeting (`font-serif`, src/pages/HomePage.tsx:312), a blue-violet gradient on "Start a chat with the agent" (`--gradient-primary`, src/index.css:55 and 107), caps micro-labels in the primary blue ("NEXT UP | 1 OF 8 THAT NEED YOU", src/components/home/NextUp.tsx:119), no reveal on load, and an agent with no name or face.
- Copy rules (ASCII, sentence case, no em dashes, no emoji) are written in docs/north-star/README.md. The code mostly follows them: no em dash in a UI string and one emoji (WelcomePage.tsx:98). The card business-onboarding already owns the Welcome page's emoji heading ("Welcome, {name}" or "Welcome", no emoji).
- Words are written for advisers first. Top posts' topics are one fixed list for every brand (src/lib/postLabels.ts, `TOPICS`), so ActivityTracker sees Insurance, CPF and Estate Planning.
- The manifest (public/manifest.webmanifest) keeps white for `background_color` and `theme_color`; index.html darkens the browser's theme colour at runtime (index.html:26), but the installed app's splash comes from the manifest.

### Measured baseline, 27 Oct

The screen text came from the local harness described in ux-usability (mock Supabase, faked session, the 25 Oct replay's device state), read from each page's main element at 1440 px and scored with `aicheck`; rescoring the saved text files on 27 Oct gave the same numbers. Top posts scored 18, but its hits were other people's captions (emoji, "not just financially, but"), so it is left out of D2 until the score reads our strings only. The emoji and banned-word counts are greps over every `.tsx` file and src/data under src, outside tests and pins, at origin/main 8664c00d. The saved screens and text sit in a temporary session folder (`ux-research-a/ours/`) that will not survive; `scripts/ux/paths.mjs` (ux-usability build item 1) recaptures them.

## Build

Gate: every screen change below shows on Leo's sign-ins only (`useLeoOnly()`, `leoOnly(email)`) until Leo says "on for everyone". Two items reach every sign-in by their nature, the word fixes in item 2 and the manifest in item 5, so they wait for open question 6. No new dependency and no schema change.

1. The panel (no card; it scores this one): `scripts/ux/panel.mjs` takes the 8 screens from `scripts/ux/paths.mjs` as 1440 by 900 viewport shots resized to 1280 by 800, and the 8 Fastlane frames (1280 by 721 WebP) converted to PNG with `sips`, since Jev reads PNG and JPEG only, each side 280 to 1568 px. For each pair and persona it asks Jev (pinned jev-1.13.0, which takes images; header `TypeSafe-Danger-Zone-Images: true`) one choice, "Which of these two screens would <persona> rather open every morning?", twice with the order swapped, plus the three yes-or-no questions on ours alone, and writes one JSON per wave. Jev decides here; no model writes a word. It runs from the shell with `TYPESAFE_API_KEY` and signs in nowhere.
2. Tone fixes (cards business-onboarding, brand-voice-memory, find-competitors): the Welcome emoji goes as business-onboarding already specs; the five "not generic AI" lines end at what the reader gets ("Every draft then sounds like you."); "curated" in CompetitorReference.tsx becomes "Not on our list of known pages."
3. A copy test: `src/lib/copyRules.test.ts` reads every .tsx under src and every file in src/data, outside tests and pins, and fails on an emoji, an em dash or a word from a short banned list in a string or JSX text, so the full vitest catches a slip before a push. It lands in the same commit as item 2, or it fails on the strings above.
4. Brand-fit words (cards find-niche-feed, brand-from-website, brand-audiences): topic chips, examples and suggestions come from the brand's own topics and audience when the brand is a business, and the adviser list stays for advisers. ux-utility build item 5 does this for Top posts; this item covers the campaign wizard and Ideas.
5. One visual system (no card): the manifest's two colours become #111214, and `theme.test.ts` gains the unpaired-palette check from D4, with its pattern written down, so it cannot grow back.
6. A face for the agent, only if Leo wants one (card agent-chat; open question 2): one small mark used in the chat, Home's Agent now and the tour, so the agent reads as one helper across screens.

## Done when

- [ ] `scripts/ux/panel.mjs` runs in under 5 minutes for under US$0.10 and writes the wave's JSON.
- [ ] Ours is preferred or even on 6 or more of 8 pairs for each of the 5 personas, and each yes-or-no question on our screens reads 0.7 or more, beyond the noise floor below.
- [ ] `src/lib/copyRules.test.ts` passes, and `aicheck` on each core screen's own text is under 15.
- [ ] A business brand's Top posts, campaign wizard and Ideas show no adviser-only topic.
- [ ] The installed app opens on the dark canvas, and the unpaired-palette check reads 0.
- [ ] Four weeks of Leo's strip average 5 or more days used a week. Leo reads this off his strip.
- [ ] `ux-desirability` flipped in `src/data/northStar.ts` with its `ours` line, in the same commit.

## Scoring each build wave

| Check | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `scripts/ux/panel.mjs` | D1, per pair and persona, against the last wave | about 4 min | about US$0.04: 80 two-image choices at about 9,200 input tokens each (about 4,600 per image, as measured on jev-1.13.0 on 26 Oct), plus 24 single-image yes-or-no reads, at US$0.042 per million |
| `npx vitest run src/lib/copyRules.test.ts src/lib/theme.test.ts` | D2 strings and D4 | seconds | US$0 |
| `aicheck` on each core screen's text from `scripts/ux/paths.mjs` | D2 screens | seconds | US$0 |
| Leo's "This week" strip | D5 | weekly | US$0 |

Before the first scored wave, run the panel twice on the same build and keep the spread as the noise floor: a pair only counts as moved when it moves more than that. A wave passes when no pair falls below even for any persona and the copy test stays green. The card's `ours` line shows the score of targets met, "D 0 of 5" today.

## Open questions

1. Match Fastlane's look (monospace display face, orange and red squares, dot-matrix numbers) or keep ours (serif, blue)? Recommended: keep ours and let the panel decide. Change the look only on the pairs where the personas pick Fastlane, so the app stays itself.
2. Give the agent a name and a face, as Fastlane does with Senna? Recommended: no name. Linear's rule is "don't invent terms", and an adviser's firm expects plain words. Build item 6's small mark gives the agent a face without a new term to learn.
3. Are the 5 personas right? Recommended: yes for now, and swap in a real adviser's words once the first adviser outside Leo's accounts signs in.
4. Should D1 also run at 390 px? Recommended: not until Fastlane's phone screens are captured; Leo's recordings are desktop only.
5. Mobbin for the look: pull 2 or 3 dark dashboards and agent homes for the pairs the panel says we lose? Recommended: yes, after the first panel run, so the search aims at the losing screens.
6. Item 2's word fixes and item 5's manifest colours reach every sign-in. Ship them for everyone? Recommended: yes; the studio is already dark by default for everyone, and the words break the README's copy rules. It is still Leo's call.

## Related

agent-home, agent-chat, agent-tour, business-onboarding, brand-voice-memory, brand-from-website, brand-audiences, find-niche-feed, find-competitors, ux-usability, ux-utility, ux-workflow-fit, ux-accessibility, ux-performance

## References

Pages fetched 27 Oct 2026 with Scrapling; App Store numbers from the iTunes Search API. The captures sit in a temporary session folder (`ux-research-a/pages/`, `ux-research-a/appstore/`) that will not survive, so each quote above carries its URL.

- Fastlane: frames t001, t003, t004, t014, t041, t089, t116, t239, t266 and t280 in `public/north-star/fastlane/`; docs/north-star/videos/fastlane-2026-10-19/notes-1.md F2 and F5.5, notes-4.md 2.9 and 2.18
- [Things](https://culturedcode.com/things/), [Linear](https://linear.app/), [Linear method](https://linear.app/method/introduction), [Superhuman blog](https://blog.superhuman.com/superhuman-is-built-for-speed/), [CapCut](https://www.capcut.com/)
- App Store listings: [Canva](https://apps.apple.com/us/app/canva-ai-photo-video-editor/id897446215), [OpusClip](https://apps.apple.com/us/app/opusclip-ai-video-clipping/id6743615403), [Linear Mobile](https://apps.apple.com/us/app/linear-mobile/id1645587184), [Things 3](https://apps.apple.com/us/app/things-3/id904237743), [Notion](https://apps.apple.com/us/app/notion-notes-tasks-ai/id1232780281), [Captions](https://apps.apple.com/us/app/captions-ai-edits-your-video/id1541407007), [Buffer](https://apps.apple.com/us/app/buffer-plan-schedule-posts/id490474324), [Hootsuite](https://apps.apple.com/us/app/hootsuite-social-media-tools/id341249709), [CapCut](https://apps.apple.com/us/app/capcut-photo-video-editor/id1500855883), [Superhuman Mail](https://apps.apple.com/us/app/superhuman-mail/id1120837655), [Later](https://apps.apple.com/us/app/later-social-media-scheduler/id784907999), [Metricool](https://apps.apple.com/us/app/metricool/id1072510529)
- Jev images: docs.typesafe.ai/images.md (PNG and JPEG, 280 to 1568 px a side, the beta header)
