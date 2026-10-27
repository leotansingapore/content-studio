# When a post takes off, push it further for free

`publish-breakout-push` | publish | phase 7 | status: missing | /north-star#publish-breakout-push

## Leo asked

No direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, S13). SearchBlueprint built the organic twin for articles as atlas-breakout-push (`~/Documents/seo-audit-tool/docs/north-star/items/atlas-breakout-push.md`).

## How the best do it

Fastlane's "Claude for Ads" launch video at 1:27 (`claude-for-ads-1m27-breakout-organic-spark-ad.jpg`, kept out of the repo): "Sophia had a breakout organic video." beside "122K views", then "For lap 2, let's run it as a Spark ad.", and the post is shown again marked "Spark ad" and "in the paid library". Senna notices the breakout by itself and proposes the next move in one line.

Content Studio does not buy media; paid ads belong to AdLauncher (what we leave out, "Running and buying paid ads"). The part worth copying is the reflex: a post that beats your usual should travel further at once, through the free channels the studio already has.

Others:

- Hypefury's Auto Reposts re-share a post for more impressions (publish-recycle).
- Postiz plugs a comment or a repost when a post up to a week old reaches a like count, and FeedHive fires a comment when a post does above average (publish-comments-followups).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- Winner found: a posted draft from the last 30 days with at least 2x the median engagement of your last 20 on that network becomes a card on Analytics (`src/lib/winners.ts`, `WINNER_RATIO`; `src/components/analytics/WinnerCard.tsx`). Jev checks the post can be told again (writing-judge mode evergreen, cap winner-check 5), and a tap makes 3 versions in one set.
- Write rewrites a draft for another network from its "Adapt for" row (`runAdapt`, `src/pages/GeneratePage.tsx:2286`, the row at `:4804`), through generate-social-content as today.
- The link in bio page (/bio, /l/<slug>) keeps links per brand on the server (`src/lib/bioPage.ts`, `supabase/hub/015_link_in_bio.sql`, RPC writes).
- Repeats exist as a post's weekly, fortnightly or monthly `repeat` (`src/lib/draftHistory.ts`); an evergreen pool is publish-recycle's spec and not built.
- Missing: the winner card offers versions and nothing else. It never says "post this on LinkedIn too", never adds it to the link in bio, never queues it again.

## Build

Gate: `leoOnly` on the card's new row, as the card is today.

### Screens and states

The Winner found card keeps "Make 3 versions" as its main button and gains a quieter row under it:

```
Winner found: "3 CPF myths" is at 2.6x your usual on Instagram.
[Make 3 versions]
Push it further:  [Post it on LinkedIn too]  [Add to link in bio]  [Repost in 3 weeks]
```

- Post it on LinkedIn too: shown only when another network is connected or chosen in Write, and named for that network ("Post it on TikTok too"); it opens Write on the draft with Adapt for that network already running, then the schedule steps.
- Add to link in bio: adds one link row, the post's title to its live URL, at the top of the brand's page, and confirms with "Added to your link in bio." and Undo. When the brand has no bio page the button reads "Make a link in bio" and opens /bio.
- Repost in 3 weeks: only when Jev's evergreen check passed. It schedules the same words 21 days out in the next open slot as a new draft whose source is the winner, and Undo removes it. Once publish-recycle ships, this adds the post to the evergreen pool instead.
- Each press writes one /activity row ("Added '3 CPF myths' to your link in bio") and the button turns into its outcome ("In your link in bio").
- A post with no live URL (marked posted by hand, never linked) hides Add to link in bio and says nothing.

### Copy

- Row label "Push it further:"
- "Post it on {network} too", "Add to link in bio", "Make a link in bio", "Repost in 3 weeks"
- Toasts "Added to your link in bio.", "Repost set for {day}.", each with Undo
- Done states "In your link in bio", "Repost on {day}"

### Data

- The link in bio row goes through the bio page's existing RPC write, as a link added on /bio would.
- The repost is an ordinary scheduled draft in My posts whose `source` (`DraftEntry.source`, `src/lib/draftHistory.ts`) points at the winner, so remix-source-trail shows where it came from.
- What was pressed on a winner sits in the winners store (`content-studio-winners-<scoped>`), so a second device does not offer it again, and none of it needs a schema change.

### AI and cost

- No new AI call. Adapt for is today's writing call on Write; the evergreen check already ran when the winner was found.

### Deep links

- `/analytics#winners` opens the card as today (`links.analytics({ section: "winners" })`); the new row needs no address of its own.
- Post it on {network} too opens `/generate?draft=<id>&adapt=<network>` (push); add `adapt` to the /generate row in `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in a Winner found card shows the three moves that apply to that post and hides the rest.
- [ ] Add to link in bio puts the post at the top of /l/<slug>, and Undo removes it.
- [ ] Repost in 3 weeks schedules a labelled copy 21 days out, only for a post the evergreen check passed.
- [ ] Post it on LinkedIn too lands in Write with the LinkedIn version being written.
- [ ] Each press shows in /activity, and nothing appears for other sign-ins.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/winners.test.ts`: which moves show for a post (another network connected or not, a live URL or not, evergreen or dated), and that a pressed move does not show again after a sync.
- `src/lib/bioPage.test.ts`: the added row validates as a link added on /bio would.
- Break each case once to prove it bites.

## Open questions

- Leo decides whether a breakout should also offer "Boost in AdLauncher" for advisers who run ads, or stay organic only, since the north star leaves paid ads to AdLauncher.
- Three weeks before a repost is a guess; publish-recycle proposes a 60-day rest for evergreen posts. Which should a breakout use?
- Fastlane notices the breakout in chat, unasked. Should the agent's daily line (find-alerts-digest) say "Your CPF post took off. Push it further?" as well as the card?

## Related

remix-own-winners, remix-variations, publish-recycle, publish-per-network, publish-link-in-bio, learn-laps, find-alerts-digest
