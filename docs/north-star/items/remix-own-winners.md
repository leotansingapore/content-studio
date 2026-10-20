# Remix your own winners

`remix-own-winners` | remix | phase 7 | status: partial | /north-star#remix-own-winners

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's homepage says its learning loop reads thumbstop rate, ROAS, hold rate and CPA against the account's averages, saves winners to memory and makes variations by itself: "Winner found. 6 variations made." ([usefastlane.ai](https://usefastlane.ai), [launch article](https://www.martech360.com/news/stack-platforms/fastlane-launches-ai-marketing-platform-that-researches-creates-and-runs-campaigns-end-to-end)). Leo's recording shows the goal side of it. The campaign review sets "Success looks like 28 posts, 2 winners", though how a winner is counted is never shown (unverified).

![Fastlane 0:23](../../../public/north-star/fastlane/t023.webp)

The chat's starter chips include "Which post did best?" and "How did last week go?". Analytics carries a "Growth" plan tag and was not opened.

![Fastlane 4:17](../../../public/north-star/fastlane/t257.webp)

The clearest documented flow is Agorapulse's Archie: "New conversation" > "Use top performing posts" > pick the profile and Playbook > "Show my 20 top posts" > filter "Period" (default Last 3 months) and "Sort" (Engagement, Views, Reach, Clicks, Engagement rate) > "Repurpose" on a post > pick target profiles and versions per profile > "Generate drafts". At most 5 drafts per profile, and video posts are left out ([help](https://support.agorapulse.com/en/articles/15972276-how-to-repurpose-content-with-archie)).

Others:
- Taplio has a starter "Remix my posts that worked" and a `/repurpose` command that rewrite your own past winners in your voice, on Growth and Pro ([help](https://intercom.help/taplio/en/articles/17233357-using-taplio-s-ai-for-content-inspiration)).
- AuthoredUp suggests three past posts by engagement rate or impressions, and "One-click reuse" opens one as a new draft ([site](https://authoredup.com/)).
- FeedHive's "Recycle Suggestions" lists "Top Performers" and "Underdogs" (recent posts that resemble winners but did worse) and advises waiting 2 to 3 weeks and changing a few sentences ([docs](https://docs.feedhive.com/planning-and-scheduling/recycling-content)).
- Hootsuite's OwlyWriter finds your best organic posts and rewrites them "without duplicating it", on the Professional plan ([analytics](https://www.hootsuite.com/platform/analytics)).
- Publer's AI chat drafts a new post from your top reel using the connected 30-day analytics ([blog](https://publer.com/blog/publer-ai-with-brand-voices-and-analytics/)).
- Revid.ai reports views, likes and comments per post and makes top posts remixable in one click, on Growth and up ([pricing](https://revid.ai/pricing)).

## What we have today

- Account audit on `/analytics` (`src/components/AccountAudit.tsx`, `audit-social-account` with Apify and OpenAI) reads the last 30 Instagram or TikTok posts of your handle (`POSTS_TO_READ`). `computeAudit` in `supabase/functions/_shared/socialAudit.ts` rates each post against the account's own median (views, else likes plus comments plus shares plus saves), leaves posts under 48 hours unjudged and calls 1.5 times a breakout (`BREAKOUT_RATIO`); `median` is exported from the same file and the app already imports it through `src/lib/accountAudit.ts`. Its "Your best posts to remix" list shows a "{ratio}x your usual" chip, an LLM "Remix idea:" angle and "Remix this", which opens Write through `remixUrl` in `src/lib/accountAudit.ts` ("This is one of MY OWN best ... posts ... Don't reuse the original wording."). It refreshes at most once per 20 hours (`REFRESH_COOLDOWN_HOURS`), plus a weekly background run (`refresh-social-audits`).
- Analytics "Top posts" (`AnalyticsPage.tsx`, line 1037) shows your 5 best posted drafts with numbers, ranked by one of 8 measures over a period (`?rank=`, `?period=`, `rankPosts(..., 5, ...)`). Each row is one `<Link>` to that post in Write (`/generate?draft=<id>`). There is no remix button.
- Real numbers from connected accounts land on drafts (gated to `SOCIAL_CONNECT_USERS`); typed numbers work for everyone.
- Clone a reel leans on your 3 best hooks once 3 posts have numbers (`winnersFor` in `src/lib/reelClone.ts`).
- The Repurpose menu in My posts (`src/lib/repurpose.ts`) turns any draft into another format or network, with no ranking by results.
- Nothing notices a new winner, and nothing makes versions of it by itself.

Status partial: a remix path exists for scraped posts in the audit; the posts you made in the app have no remix button and no automatic versions.

## Build

### Screens and states

1. Each row in Analytics "Top posts" gets a small secondary button left of the number. A button cannot sit inside the row's `<Link>`, so the row becomes a `div`: the Link keeps the text and the number and still opens the post, and the button sits beside it as a sibling. Once `remix-everywhere` ships, the button is its `RemixButton` with the source `own:<draftId>`, built by `resolveSource("own:<draftId>", userId)` from `remix-source-trail` (it reads the draft with `getDraftById`), so the Remix sheet opens over Analytics with every option, including "Part 2" from `remix-intent`, which only own posts get. Until then, and as the `fallbackTo` link, it is "Remix this" opening Write through `ownRemixUrl(draft, standing)` in a new `src/lib/winners.ts`. Its `ctx`: "This is one of MY OWN posts that did well ({standing}). Write a fresh version in my voice: keep the topic and what made it work, use a new hook and a new example, and don't reuse the original wording. Original post: "{first 300 characters}". Keep it compliant for a licensed Singapore financial adviser." It keeps the draft's pillar, detail, format, platform and CTA, and adds `source=own:<draftId>`.

2. Winner found. A card at the top of the Top posts section (anchor `#winners`):

   ```
   Winner found. 3 versions made. (i)
   "5 things I wish I knew before my first CPF top-up" got 2.4x your usual engagement on LinkedIn.
   [ See the versions ]   Undo
   Stop making versions automatically
   ```

   The rule is a measurement, worked out in `findWinners(posts, now)`: per network, take your last 20 posted drafts with numbers (`getTrackedPosts`, which already swaps in real numbers from connected accounts); with at least 5, a post posted in the last 30 days wins when its total engagements are at least 2 times the median of the others and at least 10. Use `median` from `supabase/functions/_shared/socialAudit.ts`. Posts with no `postedAt` and posts already handled are skipped.

3. A winner first goes to Jev (below). If Jev keeps it, `src/lib/winners.ts` starts the remix job from `remix-everywhere` (`startRemix`, which runs outside React, so leaving the page does not stop it) with the source `own:<id>`, `versions: 3` from `remix-variations`, and the note "A fresh version of my own post that did well. Keep the topic and what made it work; use a new hook and a new example." The three drafts land in one set (`{ kind: "versions", from: "own:<id>" }`). The check runs when Analytics or Home opens on Leo's sign-in, at most twice a day per brand, and only when at least 3 remixes are left for the day.
   - "See the versions" opens `/drafts?set=<id>`.
   - "Undo" shows until the page is left. It deletes each version that is still unscheduled and whose text still matches what the job saved (the job state holds those texts), keeps any that was edited or scheduled, then toasts "Versions removed".
   - "Make 3 versions", where it shows, carries the uses-left chip for `remix-make` from `useUsesLeft` ("Uses 3 of {left} left today").
   - "Stop making versions automatically" turns the flag off; from then on the card says "Winner found" with a "Make 3 versions" button, and the link reads "Make versions automatically".

States:
- Not enough numbers (under 5 posted with numbers on any network): no card.
- Making: "Winner found. Making 3 versions..." with a spinner.
- Done: the card above.
- Failed: "Winner found. Couldn't make the versions." with "Try again".
- Jev says the post is dated: no card; the post is marked handled with `skipped: "dated"`.
- Over the daily cap: `winner-check` answers 429, or fewer than 3 remixes are left, so no versions are made; the card shows "Winner found" with "Make 3 versions", which opens the Remix sheet with 3 versions picked.
- Refused: other sign-ins never run the job and see no card or button.

### Copy

- Row button: "Remix this"
- Card headings: "Winner found. 3 versions made.", "Winner found. Making 3 versions...", "Winner found. Couldn't make the versions.", "Winner found"
- InfoTip on the heading: "Twice your usual engagement, posted in the last 30 days."
- Winner line: "\"{first line}\" got {n}x your usual engagement on {network}."
- Buttons: "See the versions", "Undo", "Make 3 versions", "Try again"
- Links: "Stop making versions automatically", "Make versions automatically"
- Toast: "Versions removed"
- Chip on "Make 3 versions": "Uses 3 of {left} left today"

### Data

- `content-studio-winners-<scoped uid>`, synced: `{ auto: boolean (default true), handled: Record<draftId, { at: string; setId?: string; skipped?: "dated" }>, runs: Record<"YYYY-MM-DD", number> }`. Handled ids sync, so a second device does not make the same set again.
- Versions are ordinary drafts with `set` (`remix-variations`) and `source` (`remix-source-trail`).
- No schema change.

### AI and cost

- Finding winners: measured from numbers already on the device. No AI.
- Jev, through a new `writing-judge` mode `evergreen` `{ text }` returning `{ evergreen: boolean | null }` (question and threshold in `writing-judge/logic.ts`, route in `index.ts`). One Noul: instructions "Would a fresh version of this post still make sense to post next month?", true: "Yes: the idea is evergreen, such as a money habit, a common mistake, a client story or a how-to, and can be told again with a new hook and example", false: "No: it hangs on a dated event, a one-off announcement, a promotion with an end date, a personal milestone or breaking news". Keep the post at 0.5 or more. When Jev returns null, keep it, since the user still reviews every draft.
- New cap in `usageCaps.ts`: `"winner-check": 5`, consumed by mode `evergreen` (not `writing-judge`). The browser only makes versions after this call is allowed, so the server caps automatic runs at 5 a day per account.
- The versions: three `make` calls to the `remix` function, each counted on `remix-make` (30 a day) and about 1 to 2 US cents (per `remix-everywhere`, unverified).
- Cost per winner: about 3 to 6 US cents, and at most 2 winners a day per brand.
- Price chips: "Make 3 versions" carries the uses-left chip until `business-cost-preview` ships, then `<PriceChip feature="remix-make" uses={3} left={...} />`. `winner-check` is a Jev-only call, so it goes on that spec's `NO_PRICE` list.

### Deep links

- `/analytics#winners` scrolls to the card. `AnalyticsPage.tsx` does not call `useScrollToHash` (`src/lib/urlState.ts`) yet, so add the call once the drafts have loaded, as `BrandPage.tsx` does.
- `/drafts?set=<id>` lists the versions (added by `remix-variations`).
- The row button adds `remix=own:<draftId>` to the Analytics URL (`withRemix`); its fallback Write link uses the "Still read" params plus `source=own:<draftId>`.
- Add the `#winners` anchor to the `/analytics` row of `docs/deep-links.md`.

## Done when

- [ ] Every Top posts row has the remix button; it opens the Remix sheet on that post (or, before `remix-everywhere`, Write with format, platform, CTA and the own-post source chip).
- [ ] With seeded numbers (5 LinkedIn posts, one at 2.4 times the median), Analytics shows the winner card, and 3 drafts appear in one set within a minute, using 3 of the day's remixes.
- [ ] A post Jev marks as dated gets no card and is never checked again.
- [ ] Undo removes unedited versions; after one is edited or scheduled, Undo leaves that one.
- [ ] The row button and the row link are separate tab stops, and pressing the button does not open Write.
- [ ] Turning automatic off shows "Make 3 versions", and on again resumes.
- [ ] The sixth check in a day gets 429 and no versions; the card offers "Make 3 versions".
- [ ] Other sign-ins see no button, no card, and make no calls.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/winners.test.ts`: `findWinners` needs 5 posts with numbers per network, applies 2 times the median and the 10-engagement floor, ignores posts older than 30 days, posts with no `postedAt` and handled ones, and works per network.
- Same file: `ownRemixUrl` carries `source=own:<id>`, the draft's format and platform, the no-copy line, and stays under 1,800 characters.
- Same file: `shouldAutoRun(state, today, remixesLeft)` honours the `auto` flag, the 2-a-day limit and needs 3 remixes left.
- `supabase/functions/writing-judge/logic.test.ts`: the evergreen question's shape, the 0.5 threshold, and null meaning keep.
- `supabase/functions/_shared/usageCaps.test.ts`: `winner-check` is 5.

## Open questions

- The 2 times median and 10-engagement floor are starting numbers. Read a month of Leo's own results and adjust before turning this on for anyone else.
- Automatic versions spend up to 6 of the day's 30 remixes without a tap. This build turns them on by default for Leo, the way Fastlane does; Leo decides whether the default stays on.
- FeedHive-style "Underdogs" (posts that look like winners but did worse) would be a second source. Not in this build.
- Account audit posts are scraped, not drafts, so they keep their own "Remix this" and never trigger a winner card. Merging the two lists is a later step.
- Video winners only get text and script versions until `remix-any-format` can rebuild a video.
- Two devices open at the same moment could each make a set before the handled list syncs; the worst case is one extra set of 3 drafts.

## Related

remix-everywhere, remix-variations, remix-source-trail, remix-intent, learn-format-winners, learn-post-grade, learn-real-numbers, publish-recycle
