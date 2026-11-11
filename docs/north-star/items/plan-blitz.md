# Swipe through ready drafts and keep the ones you like

`plan-blitz` | plan | phase 5 | status: partial | /north-star#plan-blitz

## Leo asked

11 Nov 2026 meeting, walking Fastlane's Blitz (inventory part1.md S22 to S24, 07:54 to 09:18): "Blitz is just... like
swiping right and left", "it's remixed from this and I think the AI would just generate this", then Configure Blitz:
"Text positioning, remix ratio, content mix, slide rules." Before that, no direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, "Hands-on walk in Leo's Chrome, 27 Oct 2026").

## How the best do it

Fastlane, seen on Leo's signed-in Activity Tracker workspace (Starter plan) on 27 Oct, with the screenshots in `~/Documents/sb-north-star-research/screens/2026-10-27-hands-on/` (kept out of the repo; shot-19 is `screenshot-1793067706944-19.jpg`):

- Studio has five tabs: Overview, Create, Library, Blitz, Influencers. Blitz is a stack of finished drafts with one card on top.
- The rule is printed above the deck: "Making posts is free. Keeping one costs 5 credits. Every keep or skip uses one of your daily reviews, which reset at midnight UTC."
- Each card is the post itself (a 9:16 wall of text over a muted clip, with a sound toggle) under three tags: the format ("Wall of Text"), the angle ("Friendly Team Competition") and "Why This Content?", which opens the reason.
- Three round buttons sit under the card: Skip (a cross), Edit, Keep (a tick), each with a key hint.
- The top bar has "Change mix" on the left and "Smart positioning" and "Configure" on the right. None of the three was opened.
- Kept drafts land in the Library, and the 19 Oct recording's Activity log lists older keeps as "Saved a slideshow", who "Blitz", "No credits used" (`videos/fastlane-2026-10-19/notes-4.md`, 2.16); those notes guessed Blitz was the old product's generator, which the 27 Oct walk shows is wrong, since it is a live Studio tab.
- Fastlane's AI meme page says memes are approved "in Blitz" before they are scheduled (formats-memes).

Seen again on Leo's screen on 11 Nov (`meeting-20261111-vibe/pick/t07-54.jpg` to `t09-18.jpg`):

- The deck: a 9:16 wall of text over a clip with a sound toggle, or a 4:5 slideshow with arrows and dots inside the
  card, a second card peeking behind. Chips over it: the format, the angle with a dot, and "Why This Content?".
- A card made by remix shows the post it came from on the left under "REMIXED FROM", with its likes and views.
- Skip (a cross), Edit (a pencil) and Keep (a filled tick), key hints under the cross and the tick. A keep shows
  "Content saved!" with "View in Library"; once it opened "Schedule post" with "Save to Library" or "Schedule Post".
  Each keep took 5 credits (568, 563, 558...).
- Configure (/studio/blitz/settings, a "1 unsaved change" banner): Content mix (Slideshow, Wall of text, Green
  screen, Hook demo videos, 25% each, Equalize), Remix ratio 50% ("How much Blitz remixes trending content vs.
  creates original ideas from scratch"), visual sources (Demo videos, Own uploads), Own-media mix 50%, Slide rules
  (where a slide's picture comes from), Smart text positioning (on), and a Caption style mix of seven looks.

Others:

- Sandcastles triages an Ideas Inbox of written ideas rather than finished posts, with Shortlist, Discard, Go to Analysis and Turn into script on the keys S, D, A, C and E (plan-ideas-inbox).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- A campaign's posts are reviewed on /campaigns/:id by CampaignQueue (`src/components/campaign/CampaignQueue.tsx`): one at a time or a grid, keys 1 Make, 2 Swap, 3 Edit, 4 Skip, with the actions outside React in `src/lib/campaignActions.ts`. It only ever shows one campaign's posts.
- /ideas (`src/lib/ideasInbox.ts`) pools written ideas and writes a daily set (cap ideas-daily 15, about US$0.012 a set), but it makes no post from any of them.
- A slideshow or a wall of text is one remix make: about US$0.0005 (`supabase/functions/_shared/prices.ts`), capped at 30 a day (`usageCaps.ts`, remix-make). Text posts, carousels and scripts count as free inside a campaign (FREE_FORMATS, `src/lib/campaigns.ts:17`).
- What a deck could draw on already exists on Leo's sign-ins: competitors' running ads (`content-studio-competitor-ads-`), the weekly format drop (`src/data/formatTrends.json`), Winner found posts (`src/lib/winners.ts`) and top posts (`src/lib/topPosts.ts`).
- Missing: ready posts outside a campaign, a keep or skip that takes one press, and a reason on each draft.

## Built (11 Nov 2026, branch ff1111-blitz)

- /blitz under Studio's own Blitz tab (Leo only): `src/pages/BlitzPage.tsx`, `src/components/blitz/*`, the deck's rules
  and store in `src/lib/blitz.ts`, the job outside React in `src/lib/blitzJob.ts`. The day's first visit makes the
  deck; it shows on /library's Making now and says "Your blitz deck is ready" on another page (formatJob.ts).
- Cards are slideshows (slideshowJob, saved to Slideshows) and walls of text (the wall maker's own make call, as
  "wall"). A kept wall is its words and caption in My posts; its clip and video come from the wall maker, so a deck
  never queues ten videos in the editor. Text posts are left out: Fastlane's mix has none.
- Edit keeps the card first, then opens the slideshow editor or Write with `from=blitz`, so an edit always lands in
  My posts. Back returns to `/blitz?card=<id>`, which shows the next card once that one is kept.
- A new day's deck removes the last deck's slideshows nobody kept or skipped.
- Configure (`?configure=1`) holds Change mix and the settings our makers have an option for:

| Fastlane | Ours | Maker option |
|---|---|---|
| Change mix | Remix from: Rivals' ads, Trends, Your winners | the source |
| Content mix | Slideshow vs wall of text, one slider | slideshowJob or the wall's make |
| Remix ratio | Remixed vs written from your ideas (/ideas, shortlist first) | `source` vs `topic` (startFrom) |
| Own uploads, Own-media mix | Slideshow pictures from your Media vs stock | slideshow `pictures: "mine" \| "stock"` |
| Slide rules | A picture per slide, or one photo mood | slideshow `mood` |
| Green screen, Hook demo videos, Demo videos | none: each makes a paid AI video, not one remix make | |
| Smart text positioning | none: the makers place words by their own layout | |
| Caption style mix | none: a slideshow takes the last text look used in its editor, no look per make | |

- Each card names the business as Settings > Post choices says (`mentionFor`: Never, Sometimes with a flip per card,
  Always), and a slideshow card wears the brand's ticked text styles through the slideshow maker.
- The deck reads the whole latest format drop however old it is (/trends hides a drop past 21 days), so a brand with
  no running ads, winners or ideas still gets a deck. A source used in the last 14 days comes back only when the deck
  would be short. The empty state shows only when nothing can be dealt and names what is missing (`emptyReason`).
- Open: the Jev pick. writing-judge has no mode that judges a source's fit for the brand's audiences, and adding one
  needs a new mode and a new cap (blitz-deck). Until then candidates go by outlier score within each source (days an
  ad has run, a trend's views, a winner's ratio), the seam is `pickDeck` in `src/lib/blitz.ts`.
- Not built: Fastlane's credit per keep and daily review count (no credits yet), and the Schedule post step after a
  keep (the toast's "Schedule it" opens My posts' schedule steps instead).

## Build (as specced 27 Oct)

Gate: `useLeoOnly()` in the page, nav `owners: LEO_EMAILS`, `NORTH_STAR_USERS` on any server call. A typed URL from another sign-in gets the 404 page.

### Screens and states

/blitz, a Leo-only page under Studio (`src/lib/nav.ts`; keep `nav.test.ts` and `navRoutes.test.ts` green). Fastlane puts it beside Create and Library, so it goes in Studio, not Strategy.

```
Blitz                                         8 left today   [Change mix]
     [Wall of text] [From Pipedrive's ad, 32 days running] [Why this?]
                     +------------------+
                     |  9:16 preview    |
                     +------------------+
                  (Skip  S)  (Edit  E)  (Keep  K)
```

- Making today's deck: the card area shows a skeleton and "Making today's 10, 3 ready". The job runs outside React, so leaving the page keeps it going, and cards appear as each one lands.
- A card: the preview (a slideshow's first slide with arrows, a wall over its clip, a text post as text) and three chips: format, source, Why this. Why this opens one line built from the source's numbers, for example "Pipedrive has run this ad for 32 days. Same hook, your topic."
- Keep: the draft goes to My posts unscheduled, the next card slides in, and a toast reads "Kept. It's in My posts." with Undo and "Schedule it".
- Skip: the card leaves and nothing is saved. Undo brings it back for 5 seconds.
- Edit: opens the draft in its editor (Slideshow, Wall of text or Write) with `?from=blitz`; the editor's Back returns to the same card.
- When the deck is done the page says "That's today's 10. You kept 3." and offers "Open My posts" and "Schedule the 3".
- No sources yet (no competitors, no format drop, no winners): "Add a competitor so Blitz has ads to remix." with one button, "Add a competitor".
- The day's remixes run out mid-deck: the deck keeps what it made and says "Today's remixes are used up. More at 8am Singapore time."
- A make fails: that card shows "Couldn't make this one." with Try again; the use is given back by the server as today.
- Change mix: a sheet with the three sources as chips (Rivals' ads, Trends, Your winners) and the formats, saved per brand.

### Copy

- The page title is "Blitz", with "{n} left today" beside it and "Making today's {n}, {k} ready" while the job runs.
- The buttons read "Skip", "Edit" and "Keep", and the reason chip reads "Why this?".
- The toasts read "Kept. It's in My posts." and "Skipped.", each with Undo.
- The end of the deck reads "That's today's {n}. You kept {k}." over "Open My posts" and "Schedule the {k}".
- With no sources: "Add a competitor so Blitz has ads to remix." and the button "Add a competitor".
- Out of remixes: "Today's remixes are used up. More at 8am Singapore time."; a failed card: "Couldn't make this one." with "Try again".

### Data

- `content-studio-blitz-${scoped(userId)}`: `{ day: string; mix: { ads: number; trends: number; winners: number; formats: string[] }; cards: { id: string; source: string; format: string; draftId?: string; state: "new" | "kept" | "skipped"; why: string }[] }`. Today's deck and the mix only, synced per brand. A kept card points at its draft in My posts; yesterday's deck is replaced, never kept.
- Sources used in the last 14 days are remembered on the device (`cs-blitz-used-<scoped>`) so the deck does not repeat itself, and none of this needs a schema change.

### AI and cost

- Picking: one Jev call per deck chooses up to 10 sources from up to 30 candidates for fit with the brand's audiences (a choice per slot through writing-judge, kept at 0.6 or more). New cap `blitz-deck`, 1 a day, under US$0.001. Jev down: take the candidates by outlier score and say nothing.
- Making: each card is one run of the remix job (`src/lib/remixJob.ts`) in its format, counted on remix-make. Ten cards cost about US$0.005 and use 10 of the day's 30 remixes.
- Why this: written in code from the source's numbers (days running, outlier ratio, your post's ratio). No model writes it.

### Deep links

- `/blitz` opens the deck at its first open card.
- `/blitz?card=<id>` opens one card (replace).
- `/blitz?configure=1` opens Configure, which holds Change mix (push).
- Add the three to `docs/deep-links.md`.

## Done when

- [x] On Leo's sign-in /blitz makes up to 10 drafts from his competitors' ads, the format drop and his winners, and leaving the page mid-way does not stop it.
- [x] Keep puts the draft in My posts unscheduled, with Undo; Skip saves nothing.
- [x] Every card shows its format, its source and a Why this line drawn from real numbers.
- [x] The deck stops cleanly when remix-make runs out, keeping what it made.
- [x] S, E and K work from the keyboard and never fire while typing or with a dialog open.
- [x] Other sign-ins get the 404 page and no nav entry.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/blitz.test.ts`: the deck holds at most 10, follows the mix, skips sources used in the last 14 days, and stops at the cap with the cards it has.
- The key guard: S, E and K act only with no focused field and no open dialog (the same rule as `keyAction` in `src/lib/campaigns.ts`).
- The why line uses the source's own days or ratio and never a number it was not given.
- Break each case once to prove it bites.

## Open questions

- Fastlane makes for free and charges to keep. Until credits exist (business-credits), does a deck spend the day's remix allowance (10 of 30) or get its own cap? Leo decides.
- Should a kept draft go straight into the next open slot (publish-queue) instead of waiting unscheduled?
- Fastlane resets its daily reviews at midnight UTC, which is 8am in Singapore, the same moment our caps reset. No change needed unless Leo wants a count of reviews as well as makes.

## Related

plan-review-queue, plan-ideas-inbox, plan-proven-mix, remix-everywhere, remix-own-winners, find-competitor-ads, find-trending-formats, formats-memes
