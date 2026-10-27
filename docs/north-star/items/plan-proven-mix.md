# A campaign built from what already works, with its mix shown

`plan-proven-mix` | plan | phase 5 | status: missing | /north-star#plan-proven-mix

## Leo asked

No direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, S8 and S15). It ties the north star's two halves together: phase 2 finds what works, phase 5 plans the month, and today the plan never uses what phase 2 found.

## How the best do it

Fastlane:

- Its llms.txt (read 27 Oct) states the mix of every campaign: "Output per campaign: 30 net-new concepts (12 competitor remixes, 18 trending formats), 6 variations of every winner the same day."
- In the "Claude for Ads" launch video (0:37 to 0:51), rival ads marked "Competitor ad" become "Remixing for AG1" and "Your remix"; "Plus some new ones based on winn[ers]" follow, each naming its format and its audience ("AI podcast" for Busy Professionals, "Claymation" for Fitness Lovers), and the batch ends on "All 30 are ready to go live." with one Publish (S8; `claude-for-ads-0m51-all-30-ready-publish.jpg`, kept out of the repo).
- In the app, Settings > Activity explains each plan's mix in plain words: "5 angles, 1 account, 1 a day each for 1 month, 28 posts. 24 templated, 4 generated. Mostly templated: a business with no product listed to show yet. No video hook posts: there is no demo video. Add one on Brand" ([5:42](../../../public/north-star/fastlane/t342.webp), notes-4.md 2.16; seen again on 27 Oct).
- The "Introducing Fastlane 2.0" video splits the work into net new ideas and "your expand and iterate", which "should make up 80% of your portfolio" "but only take 20% of the time" (S15). That split is Fastlane's for paid ads; this spec does not adopt it as a target.

![Fastlane 5:42](../../../public/north-star/fastlane/t342.webp)

Others:

- Atria mines competitor URLs and reviews for ad concepts (plan-angles).
- Ocoya writes up to 90 drafts from a goal, an audience and dates, from nothing proven (plan-campaign).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- `planCampaign` and `buildCampaignPosts` (`src/lib/campaigns.ts:137` and `:164`) lay out posts by angle, funnel stage and pillar, and `campaignFormats` (`:123`) spreads the picked formats over the weeks. A job outside React then writes them in batches of 7 through idea-dump mode `campaign` (`src/lib/campaignJob.ts`, cap campaign-draft 20).
- None of those posts starts from anything proven, although each kind of source already has its own page: competitors' running ads (find-competitor-ads, `content-studio-competitor-ads-`), the weekly format drop (find-trending-formats, `src/data/formatTrends.json`) and your own posts at 2x your usual (remix-own-winners, `src/lib/winners.ts`).
- The wizard's review step (`src/components/campaign/ReviewStep.tsx`) counts formats and prices them. It never says where posts come from, and a campaign with no slideshows says nothing about why.
- A remix already knows how to start from a source key and keep it on the draft (`src/lib/remixJob.ts`, remix-source-trail), so a campaign post with a source can be made the same way.

## Build

Gate: `leoOnly` on the wizard, the queue and the campaign page, as today; `NORTH_STAR_USERS` on the server.

### Screens and states

The review step gains a Sources row above the format count:

```
Sources   From rivals' ads 8   From trends 8   More of your winners 0   New ideas 12
          No winners yet: none of your posted posts has numbers.
          [Change]
```

- Default split, worked out in code from what the brand has: up to 30% from rivals' ads running 30 days or more, up to 30% from trends in the latest drop that fit the brand, up to 20% more of your winners from the last 90 days, the rest new ideas from the angles. A source with nothing in it gets 0 and one line that says why.
- Change opens four steppers that always add up to the campaign's post count.
- In the queue each post with a source shows it under the angle, "From Pipedrive's ad, 32 days running" or "More of your 'CPF myths' post, 2.4x your usual", and Swap keeps the source type.
- Make on a sourced slideshow or wall runs the remix job with that source, so the result keeps the hook and shape and passes the copy check (`supabase/functions/remix/overlap.ts`) like any remix.
- The campaign's Plan row in /activity says the mix in one line, after Fastlane's: "28 posts: 8 from rivals' ads, 8 from trends, 12 new. No winners yet: none of your posts has numbers."

### Copy

- Row label "Sources"; parts "From rivals' ads {n}", "From trends {n}", "More of your winners {n}", "New ideas {n}"; button "Change".
- Why lines: "No winners yet: none of your posted posts has numbers.", "No competitor ads yet. Add a competitor to remix their ads.", "No trend this week fits your audience."
- Queue lines: "From {brand}'s ad, {days} days running", "From a trend: {format name}", "More of your '{title}' post, {ratio}x your usual".

### Data

- `CampaignPost` gains an optional `source?: string` (the same keys remix-source-trail uses: `ad:<id>`, `format:<id>`, `own:<draftId>`), stored inside the campaign in `content-studio-campaigns-` as today. Old campaigns have none and read as new ideas.
- `Campaign` gains an optional `mix?: { ads: number; trends: number; winners: number; fresh: number }`.
- No schema change.

### AI and cost

- One Jev call per campaign fits candidate sources to the campaign's angles: a choice per sourced slot among up to 20 candidates plus "none fits", kept at 0.6 or more (writing-judge, new cap `campaign-sources` 10 a day, under US$0.001). Jev down: candidates by outlier score, ads by days running.
- Writing: a sourced text post gets the source's teardown (remix-teardown, already cached per source) in its campaign batch; sourced slideshows and walls are made by the remix job on Make, one remix-make each (about US$0.0005), as today, so no new provider is involved.

### Deep links

- `/campaigns/new?step=review&mix=1` opens the review with Change open (push).
- A queue post keeps today's `?post=<n>`; its source line links to the source (`/competitors?view=ads&ad=<id>`, `/trends?view=formats&format=<id>`, or the post in My posts).

## Done when

- [ ] On Leo's sign-in, a new ActivityTracker campaign's review shows a Sources row filled from his real competitors' ads and the latest format drop, with a reason for any zero.
- [ ] Sourced posts in the queue show their source, and Make on a sourced slideshow produces a remix that passes the copy check.
- [ ] Change keeps the four numbers adding up to the post count.
- [ ] The Plan row in /activity states the mix in one line.
- [ ] An old campaign with no `source` fields opens and works as before.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/campaigns.test.ts`: the default split per source availability (no ads gives 0 ads and the why line; no winners gives 0 winners), the steppers' sum rule, old campaigns read as new ideas.
- `src/lib/campaignJob.test.ts`: a sourced text post carries its teardown into the batch request; an unsourced one does not.
- The Plan row's sentence for three mixes.
- Break each case once to prove it bites.

## Open questions

- Fastlane leans 12 rival remixes to 18 trends. Should an adviser's campaign default to mostly remixes of what works, or mostly new ideas until their own winners exist? Leo decides; the shares above are a starting guess.
- Should a rival's ad that is a hard sell (a discount, a named product) be left out of an adviser's campaign by default? The remix prompt already strips named insurer products and promised returns.
- Fastlane makes "6 variations of every winner the same day". Should a new winner mid-campaign add versions into the open slots (remix-variations) or wait for the next campaign (learn-laps)?

## Related

plan-campaign, plan-review-queue, plan-blitz, find-competitor-ads, find-trending-formats, remix-own-winners, remix-source-trail, learn-laps
