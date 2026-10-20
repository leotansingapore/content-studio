# A weekly brief of what moved

`find-alerts-digest` | find | phase 2 | status: partial | /north-star#find-alerts-digest

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts"

The scrape is only worth it if the adviser hears when something moves. This item is that: a short weekly brief and an alert when a competitor posts a hit, each with a button to make it.

## How the best do it

Fastlane has a Settings page with a "Notifications" entry, "Which emails and alerts you get." (notes-4.md 2.17). Leo did not open it, so what Fastlane sends is unverified. Its Home leads with one card, "NEXT UP - THE 1 THING THAT NEEDS YOU" (see `agent-home`), and no digest list shows in the recording.

![Fastlane 5:46, Settings with "Notifications"](../../../public/north-star/fastlane/t346.webp)

The clearest model is Vamos's weekly brief ([help](https://intercom.help/getvamos/en/articles/16934398-your-weekly-brief)):

- Monday morning by default; day, time and time zone change in Settings > Weekly brief.
- Up to five findings, each labelled "Outlier", "In your niche", "Format" or "Your post", each with a "Make this in Vamos" button that opens a chat already filled in.
- It needs your own handle and 5 or more followed creators (10 recommended).
- Thin weeks are skipped. It needs 3+ new posts of yours and 10+ newly scored posts in the last 14 days, or no email goes out at all.
- "Next brief" pauses it. Free on every plan.

Alerts elsewhere:

- Virlo raises `outlier_video` once per video when it passes 3x the creator's median views, plus `follower_spike` at 3% and 250 followers ([tracking docs](https://dev.virlo.ai/docs/tracking)). Alerts go out by email, Slack, Discord or webhook, and the Slack, Discord and webhook ones need Pro at USD 199 a month ([agent](https://virlo.ai/features/content-research-agent), [pricing](https://virlo.ai/pricing)).
- 1of10 sends viral-video alerts on tracked channels by email and in the app, 3 channels free ([review](https://1of10.com/blog/1of10-review/)).
- ViewStats alerts on a keyword and a threshold such as 100,000 views, on Pro ([Pro](https://www.viewstats.com/pro-upgrade)).
- Panoramata sends daily and weekly AI summaries of competitors' ads and emails, with links to each asset, and alerts on new campaigns ([summaries](https://www.panoramata.co/feature/summaries)).
- Atria's docs describe a daily new-ad digest and warn that an ad's launch date is not the day you discover it, so windows should overlap, and that sent ids must be stored to avoid repeat alerts ([docs](https://docs.tryatria.com/docs/daily-new-ad-digest.md)).
- Foreplay's Spyder sends new competitor creative to Slack and email; frequency unverified ([Spyder](https://www.foreplay.co/spyder)). PiPiAds caps ad trackers at 2 on Basic and 10 on Advanced ([review](https://www.copyfy.io/en/blog/pipiads-review)).

The pattern: few items, each with proof and a make-it button, sent only when there is something to say, and alerts that fire once per post.

## What we have today

- The Monday results email (`supabase/functions/notify`, hourly pg_cron; `weeklyEmail` in `logic.ts`) goes out from 8am Singapore when `content-studio-notify-<uid>` has `email: true`. Per brand it has last week's posts against the goal, best and weakest posts, what the best share, "Accounts you follow: @x gained N followers (M now), K new posts", "One thing this week" picked by Jev from five moves (one is "Remix a post from @handle, who gained N followers"), and this week's schedule, and it links only to `/home` and `/market`.
- Phone alerts from the same function: posts due soon, the weekly goal, and the Monday market reminder. Each alert is claimed once in `cs_notify_sent` (free-text `item`, up to 200 characters).
- `/following` marks posts new since the last check (`fresh` in `content-studio-following-<scope>`). It holds up to 5 accounts (`MAX_FOLLOWED`), and each check stores the newest 12 posts (`POSTS_PER_CHECK` in `track-accounts/logic.ts`) with views (null for picture posts), likes and comments, but only when the adviser taps a check; no server job re-checks anyone.
- `notify`'s `followedFrom` reads at most 10 accounts and keeps only each post's `postedAt`. So the email counts new posts and never sees a view.
- `/market` (Leo only) has a weekly digest with Jev's act or watch on news, ChatGPT answers and Following's best posts.
- Analytics' This week card shows the same report and move as the email (`week-pick`, cap 10).
- Missing: outlier detection on followed accounts, alerts when a competitor posts a hit or launches an ad, a capped list of findings, and a button per finding.

Status partial.

## Build

Scope: one shared list of findings (at most 5) that feeds a "What moved" block at the top of the Monday email and a card on `/home`; one phone alert when a followed account posts an outlier. Every piece shows on Leo's sign-ins only until he turns it on for everyone.

### Screens and states

Files:

- `supabase/functions/notify/logic.ts`: read more of each followed post in `followedFrom` (id, url, format, caption cut to 120, views, likes, comments, and the account's `fresh` ids); add `briefFindings`, `briefAsk`, `pickedFindings`, `briefLines`, `findingUrl` and `outlierAlert`.
- `supabase/functions/notify/run.ts` and `index.ts`: the brief block in the email, the alert in the push pass, and the `NORTH_STAR_USERS` check.
- `supabase/functions/week-pick/index.ts`: a `mode: "brief"` body that runs `briefAsk` and returns the picked ids.
- `src/components/WhatMovedCard.tsx` (new), placed in `src/pages/HomePage.tsx` above "Coming up", only when `leoOnly(email)`. It builds the active brand's `Profile` with `profilesFrom(uid, data)` from the same `content-studio-*` keys in localStorage and calls `briefFindings`, importing both from `supabase/functions/notify/logic.ts` the way `AnalyticsPage.tsx` imports `weekReport`.
- `src/lib/notify.ts` and `src/components/NotifySettings.tsx`: two switches.
- `supabase/functions/_shared/usageCaps.ts`: one cap.

Findings (`briefFindings(profile, now)`), all from synced keys notify can read in `cs_user_data`:

- Outlier (followed account, `content-studio-following-<scope>`): a post from the last 7 days that `scoreAccount` from `supabase/functions/_shared/outlier.ts` (`find-outlier-score`) puts in the `viral` or `mega` tier, 3x its own account's median or more, with `confidence: "high"`. That helper already leaves out posts under 48 hours old. Until `find-outlier-score` ships, use the same rule inline: views against the median of the account's other posts, 3x or more, 5 or more posts with views.
- Outlier (competitor, `content-studio-competitor-posts-<scope>` from `find-competitor-posts`): the same rule on competitors' organic posts, once that store exists.
- Your post: the adviser's own post from last week whose engagement is 2x or more the median of their posts with numbers over the 8 weeks before.
- New ad (`content-studio-competitor-ads-<scope>` from `find-competitor-ads`): one finding per competitor with ids in `fresh` from a check in the last 7 days. Use `fresh` (found this week) rather than the ad's start date, since a start date is not the day we found it (Atria's warning).
- Growing (followed account): the account with the biggest follower gain this week, when the gain is at least 3% and 250 followers (Virlo's spike rule). The email already builds this as `Mover`.

Then Jev picks (AI and cost). If fewer than 2 findings survive, there is no brief that week, so the email has no block and the card does not render (the skip-if-thin rule).

Email block, per brand, before "Last week":

```
WHAT MOVED
1. Outlier: @sgmoneybro's reel did 4.1x their usual views. "3 CPF mistakes at 25..."
   Make this: https://consultant-content-studio.vercel.app/clone?url=...
2. Your post: "Why I stopped selling..." got 2.3x your usual engagement.
   Make another: https://consultant-content-studio.vercel.app/generate?...
3. Growing: @financewithjo gained 1,240 followers this week.
   See them: https://consultant-content-studio.vercel.app/following
```

`/home` card:

```
What moved this week                                 (i)
[Outlier]  @sgmoneybro's reel did 4.1x their usual views.   [ Make this ]
[Your post] "Why I stopped selling..." got 2.3x your usual. [ Make another ]
[Growing]  @financewithjo gained 1,240 followers.           [ See them ]
```

Card states:

- Fewer than 2 findings: the card is not drawn.
- First view of the week: the findings show at once in the fallback order listed below while Jev picks in the background. When it answers, the pick is saved to `cs-brief-<scope>-<monday>` and used from the next view, so the list never jumps under the reader's finger.
- Jev unavailable, over the cap or failed: the fallback order (Outlier, Your post, New ad, Growing) stays, with no error text, because the card is information and nothing is lost.
- A finding whose account was removed from Following since: dropped.

Alert (`outlierAlert(profile, now, sentToday)`): in the hourly push pass, an Outlier post that is in its account's `fresh` list and was posted in the last 5 days (scored posts are at least 48 hours old), sent at most once per post and at most one alert per adviser per Singapore day, only between 09:00 and 21:00 Singapore time, while any other outliers wait for Monday's brief.

### Copy

- Email block heading: "WHAT MOVED". Label words: "Outlier", "Your post", "New ad", "Growing".
- Lines:
  - Outlier: "@{handle}'s {reel|post|video} did {r}x their usual views. "{caption, 60 chars}""
  - Your post: ""{hook, 60 chars}" got {r}x your usual engagement."
  - Growing: "@{handle} gained {n} followers this week."
  - New ad: "{advertiser} started {n} new ads this week."
- Link lines: "Make this: ", "Make another: ", "See them: ", "See the ads: ", each followed by the full URL.
- The card is headed "What moved this week", with an InfoTip labelled "About what moved": "Up to five things from your accounts and the ones you follow, picked each Monday."
- Card buttons: "Make this", "Make another", "See them", "See the ads".
- The push alert's title is "@{handle} posted a hit" and its body "{r}x their usual views. Tap to make your own.", with the tag `outlier`.
- Settings switches in `NotifySettings` (Leo-only rows):
  - "What moved, in the Monday email". Note when on: "Up to 5 findings, only in weeks with something to say."
  - "Alert me when an account I follow posts a hit". Note when on: "At most one a day, 9am to 9pm."

### Data

- `content-studio-notify-<uid>` gains `brief` and `alerts`. `parsePrefs` keeps its rule that anything but an explicit `true` is off, and switching off writes `false`, never removes the key.
- Sent-log items in `cs_notify_sent` (no schema change; `item` is free text up to 200): `outlier:<platform>:<postId>` per post alerted, and `alert-day:<YYYY-MM-DD>` claimed before sending so a second alert that day is refused.
- `cs-brief-<scope>-<monday>`: device-only cache of the Jev pick for the card (ids in order). Losing it costs one capped Jev call.
- Server gate: the `NORTH_STAR_USERS` secret that `find-competitors` sets to Leo's two uids, checked with `isAllowed` from `market/logic.ts` by notify and by `week-pick`'s brief mode.
- Freshness: findings use whatever the last check stored and count only posts dated in the last 7 days. Following checks run only when the adviser taps a check. `find-competitor-posts` and `find-competitor-ads` check each competitor once a week, but only when the adviser opens `/competitors`; a weekly run with nobody opening the page needs pg_cron and server-side storage, a migration both of those specs leave to Leo. Until then, a week in which the adviser opens neither page has no Outlier or New ad finding, and the skip-if-thin rule usually drops the brief.

### AI and cost

Jev only, no LLM. Every line is a template filled from numbers.

- `briefAsk(findings, context)`: state "A financial adviser in Singapore posts on social media to win clients. This week's findings:" then numbered lines. One `noul` per finding, ids `f0` to `f9`: "Is finding {n} worth this adviser's time this week: something concrete they could post about or learn from for the people they serve?"
- Keep findings at 0.5 or more (proposed), highest first, at most 5. Before switching the threshold on, run notify with `dryRun: true` for Leo's account on 4 past Mondays (the `now` option), print every finding with its score, and read the ones between 0.35 and 0.65.
- No Jev answer: the fallback order, top 5.
- Cap: new `DAILY_LIMITS` entry `"brief-pick": 10`, with the comment "What moved: one Jev call over the week's findings (notify on Monday, week-pick for the Home card)." Notify counts it the way it counts `week-pick` today.
- Cost: one Jev call of about 800 input tokens per adviser per week, a tiny fraction of a cent. Push and Resend are already paid for.

`findingUrl(f)` builds every button and email link:

- Outlier video post: `/clone?url=<post url>`. Other posts: Write with `ctx` "A post by @{handle} did {r}x their usual views. What it says: "{caption}". Write my own take in my voice. Do not copy its wording. No promised returns, no named insurer products, no invented numbers." (the shape of `remixUrl` in `src/lib/following.ts`).
- Your post: Write with `ctx` "My post "{hook}" did {r}x my usual engagement. Write a new post on the same idea in a different format. No promised returns, no named insurer products, no invented numbers." and `format` set to one the adviser has not used for it (carousel when the post was text, else text-post).
- The Growing button and link open `/following`, where the account's numbers are.
- New ad: `/competitors?view=ads&ad=<id>` for the competitor's newest fresh ad, the drawer link from `find-ad-detail`. Until that drawer ships, `/competitors?view=ads`.

### Deep links

- `/home#what-moved` scrolls to the card, for the push and email footer. `HomePage.tsx` has no `useScrollToHash` call yet. Add one.
- Every finding's button and email line is a full deep link built by `findingUrl`, so a tap lands on the clone or the filled-in Write.
- `docs/deep-links.md` gets `#what-moved` in its `/home` row.

## Done when

- [ ] `notify` with `{ dryRun: true, only: <Leo's uid>, now: <a past Monday 09:00> }` returns an email whose first block opens with "WHAT MOVED" (under the brand name when there are several brands) and holds 2 to 5 numbered findings, each with a working link.
- [ ] The same call for a week with fewer than 2 findings has no block, and the rest of the email is unchanged.
- [ ] For a uid not in `NORTH_STAR_USERS`, the email is byte-for-byte what it was before this change.
- [ ] On Leo's sign-in, `/home` shows "What moved this week" when there are 2 or more findings, and "Make this" on an Outlier opens `/clone?url=` for that post.
- [ ] After a Following check finds a post at 3x or more that is between 2 and 5 days old, Leo's phone gets one alert within the hour (between 9am and 9pm), and no second alert that day.
- [ ] Both switches show on Leo's sign-in only, save as explicit true or false, and survive a reload on another device.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build`, the full `npx vitest run` and the notify Deno tests pass; `find-alerts-digest` flipped in `src/data/northStar.ts`.

## Tests

- `supabase/functions/notify/logic.test.ts`:
  - `followedFrom` keeps views, ids and `fresh`, and still parses old stored lists without them.
  - `briefFindings` returns an Outlier at exactly 3x the median and none at 2.9x, needs 5 posts with views, skips posts under 48 hours and over 7 days old, makes one New ad finding per competitor with `fresh` ids, returns Your post at 2x the 8-week median, and Growing only at 3% and 250 followers.
  - `briefAsk` makes one question per finding; `pickedFindings` keeps 0.5 and up, sorts by score, caps at 5, and falls back to the fixed order on null.
  - The skip-if-thin rule: 1 finding gives no block.
  - `findingUrl` gives `/clone?url=` for a video and a Write link whose `ctx` holds the MAS line.
  - `outlierAlert` refuses outside 09:00 to 21:00 Singapore time and when `alert-day` is already claimed.
- `supabase/functions/notify/run.test.ts`: with fakes, a Leo uid gets the block and the alert claim; a non-listed uid gets neither; a Jev failure still sends the email in fallback order; the `brief-pick` cap is consumed once per email.
- `src/lib/notify.test.ts`: `brief` and `alerts` read as false unless set to true.
- `supabase/functions/_shared/usageCaps.test.ts`: `brief-pick` is 10.

## Open questions

- Its own email or a block in Monday's? This spec puts it in the existing email to send fewer emails. Vamos sends it alone. Leo decides if it should split.
- Slack, Telegram or WhatsApp delivery, as Virlo and Foreplay offer. Leo reads Telegram all day; a Telegram copy for his own brands is easy, but other advisers have no Telegram link set up, so the call is Leo's.
- Vamos lets the user move the brief's day and time; this spec keeps Monday 8am for everyone to avoid a scheduling setting.
- The brief is only as fresh as the last check, and every check today runs when the adviser opens a page. A server-side weekly check of Following and Competitors (pg_cron plus storage the job can write) is a migration, so it is Leo's call, shared with `find-competitor-posts` and `find-competitor-ads`.

## Related

find-competitors, find-competitor-ads, find-competitor-posts, find-outlier-score, find-ad-detail, learn-weekly-report, learn-benchmark, agent-home, remix-everywhere, remix-own-winners
