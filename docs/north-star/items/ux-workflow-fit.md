# Finish it on your phone, right after it happens

`ux-workflow-fit` | ux | phase 9 | status: partial | /north-star#ux-workflow-fit

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Workflow fit: Does it fit how people actually work? (Log an interaction on mobile immediately after a call.)"

## The bar

The jobs Leo does on his phone right after something happens finish at 390 px with one thumb, within the tap budget below, starting where he already is: the other app's share sheet, a phone alert or Home.

The phone jobs, each tied to the moment that starts it:

| Job | The moment | Tap budget | Today (27 Oct) |
| --- | --- | --- | --- |
| P1 Save a post you just saw | scrolling Instagram or TikTok | 3 from the share sheet | Not possible: Content Studio is not in the share sheet. Inside the app, 5 taps and a paste after copying the link in Instagram |
| P2 Note an idea | a client meeting just ended | 2 from Home, dictation allowed | 4 taps and a scroll: More, Analytics, Coach, scroll, Dictate |
| P3 Answer what waits for your yes | an alert says something waits | 2 from the alert | 2 from Home, but no alert is sent for a waiting card or a campaign post |
| P4 Retry a post that failed | a post did not go out | 2 from the alert | No alert. Home's Next up shows "A post didn't go out" with Open once a device has read Zernio's status (My posts, Calendar or Library), and the calendar's Needs you has Retry |
| P5 Mark a post posted | just finished it in TikTok's inbox | 1 | 1, Mark posted on Next up |
| P6 Move an overdue post | the day got away | 2 | 2, Reschedule then Tomorrow |
| P7 Check how a post did | an hour after it went out | 2 | 2, More then Analytics (numbers need a connected account) |
| P8 Ask the agent by voice | between meetings | 2 | 2, the composer then Send, with the keyboard's mic |

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| W1 | Phone jobs finished within budget, from where the moment starts | 8 of 8 | 4 of 8 (P5 to P8) |
| W2 | Presses on the phone paths that sit in the top 40% of an 844 px screen (y under 338), out of one-thumb reach | 10% or fewer | 7 of 35 (20%): section tabs at y 81 three times (Saved, Coach, Library), /saved's link box and Save at y 201 and 253, Plan a campaign at y 149, and Reschedule's "Tomorrow" at y 319 |
| W3 | Height left for content on Home at 390 by 844 | 75% or more | 68%: the pinned composer and bottom bar fill y 630 to 844 and the header 56 px; the composer covers Next up's second row at first paint |
| W4 | Alerts with a deep link for the four moments that need a phone: due, failed, waiting for your yes, a hit from someone you follow | 4 of 4 | 2 of 4 (due today and the hit are sent) |
| W5 | The TikTok hand-off: an alert when the inbox draft has landed, opening the post with Copy caption first; the done screen and any refusal in plain words | an alert within an hour after the draft lands, and 0 raw API errors on screen | No alert yet. Since 26 Oct the done screen waits for Zernio's read before it says "Sent to your TikTok inbox" (3b8d6179) and code 40002 reads as one plain line (153c5383), both in the baseline commit. Neither has been seen live: TikTok refuses inbox sends until the TikTok app on the phone signed in to @activity_tracker_io is updated (live-p7a-post D2) |

Touch target sizes belong to ux-accessibility (its A4). On these paths every control pressed was 44 px or more.

## How the best do it

Fastlane has no phone app (a US App Store search for "Fastlane AI" on 27 Oct returned other apps only, and Leo's recordings are all desktop), so it sets the bar only where its desktop flow hands work to the phone, and there its schedule modal tells you the phone step and carries the caption over: "After it's scheduled, open the TikTok app -> Inbox -> System notifications and tap your post to finish publishing. Any caption you add here carries into the draft." ([Fastlane 1:56](../../../public/north-star/fastlane/t116.webp), notes-2.md F14).

Competitors with phone apps:

- Buffer puts itself in the phone's share sheet. In Safari, tap Share, then Buffer: "The Buffer app will open, with the title and link already included in the composer"; pick channels and schedule. A second path saves the link as an idea "with just a few taps" ([Buffer help 636](https://support.buffer.com/article/636-buffer-browser-extension-on-the-mobile-app)), and the Ideas page holds up to 2,000 of them per organization on paid plans ([buffer.com/ideas](https://buffer.com/ideas)). App Store: 4.73 from 34,735 ratings.
- Later publishes by phone alert. When publishing through Later's mobile notifications, "we automatically copy your caption", and you paste it in Instagram ([Later help](https://help.later.com/hc/en-us/articles/360042773694)). You "decide which mobile device will receive notifications for each Instagram account" ([Later notifications](https://help.later.com/hc/en-us/articles/360043138953-Set-Up-User-Notifications)). App Store: 4.55 from 2,539. Later is a native app; a web page cannot write to the clipboard without a tap, which is why build item 5 puts Copy caption first instead.
- Hootsuite 4.67 from 34,292; Metricool 2.60 from 117. Metricool's site says "over 4 million professionals" use it ([metricool.com](https://metricool.com/)), so its phone app's rating is the outlier, not the product's reach.
- Phone-first editors set the bar for one-handed use: CapCut 4.61 from 1,125,117, Captions 4.74 from 38,804, OpusClip 4.85 from 8,531.

Home screens on Mobbin that put capture first:

- Tana ([Mobbin screen](https://mobbin.com/screens/f4d92479-90b1-4266-828b-fad0b9cf3aea)): one "Ask or Capture..." box with a mic button and Meet, Create and Search chips, then Past, Pinned and Chats under it; on a day with a meeting the same Home shows Next Up first ([Mobbin screen](https://mobbin.com/screens/f4b2dd91-e1ff-449f-8000-eba445ea9332)).
- Dropbox Dash ([Mobbin screen](https://mobbin.com/screens/1dc5d2da-0f3f-4c72-acee-393987164e39)): the composer takes a file and a voice note, with Analyze, Write, Organize, Prepare and Status chips under it and a "Get to know Dash, 1 of 5" checklist below.
- Gumloop ([Mobbin screen](https://mobbin.com/screens/fc1bbf68-772d-4564-a78b-d7307d60a923)): Recent Activity beside Upcoming Triggers, so what ran and what runs next share one screen.

What they show for this bar: the quickest capture, typed or spoken, sits first on Home with one-tap chips under it. Build item 2 takes that: a mic and an "Idea" chip in Home's composer.

Reference apps:

- Linear Mobile is "Built for 'away from keyboard' activities": an inbox where you "Tap to take action, swipe to delete, snooze to deal with it later", a composer "designed with an obsessive focus on speed" so you "Create issues in seconds", and "From screenshot to triage in a few simple taps" ([linear.app/mobile](https://linear.app/mobile)). 4.83 from 2,282.
- Things takes a to-do from Siri ("In Things, remind me to call John at 5 AM."), widgets, Control Center and Lock Screen buttons and Mail to Things, and schedules "with just a swipe" ([Things features](https://culturedcode.com/things/features/), [App Store](https://apps.apple.com/us/app/things-3/id904237743)). 4.82 from 28,035.
- Notion: 4.77 from 90,502.

Ratings are the public App Store numbers for the US store, read through the iTunes Search API on 27 Oct.

## What we have today

- Phones get a bottom bar of Home, Strategy, Chats and More (src/lib/nav.ts, `mobileTabs` and `moreSheet`); More holds Studio, Radar, Grow, Analytics, Brand, Learn, Feedback and Settings.
- The app installs as a web app (public/manifest.webmanifest, start_url /home), with no `share_target`, so it never appears in a share sheet. /saved already reads `url`, `text` and `title` on landing, saves once into the last board and drops the params (src/pages/SavedPage.tsx:120, card find-save-anywhere, live), so the receiving end exists. find-save-anywhere already specs the `share_target` entry and holds it for Leo: the manifest is the same for every installed user.
- Phone alerts (supabase/functions/notify/logic.ts, run hourly by pg_cron) cover a post due within the hour, "N posts are due", "This week's goal is behind", "This week's market check is open" and "@handle posted a hit". Nothing alerts on a failed post or on something waiting for your yes. notify reads synced rows from `cs_user_data` (drafts, goals, profiles and more); a draft's failed status reaches those rows only after a device has read Zernio.
- Idea Dump, with its Dictate button (browser speech recognition through src/hooks/useDictation.ts, no paid call), lives on /coach (src/pages/CoachPage.tsx:358 and 762), under Analytics.
- Leo answers team posts on Telegram today ("ok tp<N>", run through `team-posts reply`), not in the app.
- Home at 390 px keeps the agent's composer pinned above the bottom bar, and the calendar already has an Upcoming view (`view=upcoming`, src/lib/links.ts:34) that phones could open on.

### Measured baseline, 27 Oct

The same local harness as ux-usability: dev server of origin/main 78e49edb, Supabase answered by a mock, a faked session, the demo device state from the 25 Oct replay, Playwright at 390 by 844 with touch on. Nothing reached production and nothing was spent. The harness and its output (jobs.json, job-390-*.png) are in a temporary session folder that will not survive; `scripts/ux/paths.mjs` (ux-usability build item 1) is what makes these rerunnable.

| Path | Taps | Scrolls | Presses in the top 40% |
| --- | --- | --- | --- |
| P1 inside the app: More, Radar, Saved tab, link box, Save | 5, plus a paste | 0 | Saved (y 81), link box (y 201), Save (y 253) |
| P2: More, Analytics, Coach, Dictate | 4 | 1 | Coach (y 81) |
| P3 from Home: Open | 1, then 1 on the card | 0 | none |
| P5: Mark posted | 1 | 0 | none |
| P6: Reschedule, Tomorrow | 2 | 0 | Tomorrow (y 319) |
| P7: More, Analytics | 2 | 0 | none |
| P8: composer, Send | 2 | 0 | none |
| J4 from ux-usability: Strategy, Plan a campaign | 2 | 0 | Plan a campaign (y 149) |
| J6 from ux-usability: More, Studio, Library, Schedule | 4 | 1 | Library (y 81) |

The other 5 ux-usability phone paths (J1, J2, J3, J5, J7) had no press in the top 40%; with these 9 rows they make the 35 presses W2 counts.

## Build

Gate: every screen change below shows on Leo's sign-ins only (`useLeoOnly()`, `leoOnly(email)`) until Leo says "on for everyone". The manifest has no per-user switch, so item 1's share entry waits for his answer in find-save-anywhere. No new table: notify reads the synced rows it reads today. No new dependency.

1. Share into the app (cards find-save-anywhere, remix-any-link): ship find-save-anywhere's `share_target` (a GET to /saved with `url`, `text` and `title`) once Leo answers its open question, so an installed app on Android sits in the share sheet and lands on today's link reader. Safari on iPhone has no web share target, so the iPhone path is find-save-anywhere's Shortcut that opens /saved?url=<the shared link>, also Leo's call there. This card adds one thing: on /saved at 390 px, the link box and Save move to the lower half.
2. Note an idea from Home (cards plan-ideas-inbox, agent-home): a mic button in Home's composer, reusing `useDictation` from Idea Dump (where the browser has no speech recognition, the keyboard's mic still works), and an "Idea" chip that files the words in the Ideas inbox without an agent turn or a charge. This is Tana's and Dash's capture-first Home.
3. The two missing alerts (cards agent-approvals, plan-review-queue, publish-calendar): "<n> wait for your yes" for agent cards and campaign posts, read from the synced agent threads and campaigns rows, and "A post didn't go out" with a link that opens the post with Retry. The failed alert needs notify to learn the failure itself: today a draft's failed status reaches the synced rows only after a device reads Zernio. So notify asks Zernio for the posts that were due in the last hour, through the social function's own read and only for `SOCIAL_CONNECT_USERS`. A Zernio webhook would be faster, but it means a new function deployed without JWT verification, an auth change that goes to Leo first. Both alerts use notify's existing push, tags and `cs_notify_sent` record, so each goes out once; notify runs hourly, so an alert arrives within the hour.
4. Reach on phones (cards agent-home, publish-calendar): each page's main action sits in the lower half at 390 px; Home's composer folds to one 48 px line above the bar until tapped; the calendar opens on its existing Upcoming view on phones instead of the month grid.
5. TikTok hand-off (card publish-tiktok): when notify's Zernio read (item 3) sees an inbox draft land, it sends "Finish it in TikTok" with a link to the post, which opens with "Copy caption" as its first button, then "Mark posted". A web page cannot put text on the clipboard without a tap, so Copy caption is that tap. The plain lines and the done screen's wait are already in code; this item re-checks them live once Leo has updated the TikTok app on that phone.
6. The phone half of the path counter is `scripts/ux/paths.mjs` at 390 by 844 with touch on. It is shared with ux-usability and prints taps, scrolls and top-40% presses for P1 to P8.

## Done when

- [ ] Once Leo has said yes in find-save-anywhere: on an Android phone with the app installed, Instagram's share sheet lists Content Studio, and a post lands in /saved in 3 taps; on an iPhone the Shortcut does the same. Leo checks this on his phone.
- [ ] An idea dictated on Home reaches the Ideas inbox in 2 taps and spends nothing.
- [ ] notify's tests show a waiting card and a failed post each building an alert whose link opens the right screen, and the job finishes in 2 taps from there.
- [ ] The path counter shows every P job within budget and 10% or fewer presses in the top 40%.
- [ ] Home at 390 by 844 leaves 75% or more of the height for content, and Next up's second row is visible on first paint.
- [ ] In a posting dogfood Leo runs, a TikTok inbox draft that lands sends one alert, its link opens Copy caption first, and no raw API text shows anywhere.
- [ ] `ux-workflow-fit` flipped in `src/data/northStar.ts` with its `ours` line, in the same commit.

## Scoring each build wave

| Check | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `scripts/ux/paths.mjs` at 390 | W1 for P2, P3, P5 to P8, plus W2 and W3 | about 2 min | US$0 |
| `npx vitest run supabase/functions/notify` with fixtures for each alert kind | W4 message shapes and deep links | seconds | US$0 |
| Share from Instagram on Leo's phone, by hand, only in waves that touch item 1 | W1 for P1 | 2 min of Leo's time | US$0 |
| The TikTok inbox step in a posting dogfood that Leo runs or approves, as live-p7a-post was | W5 | inside that run | US$0 |

Builder sessions never sign in to production and never call the live notify function to test an alert; its fixtures and tests prove the shape. A wave passes when no phone job's tap count goes up and every job it touched meets its budget. The card's `ours` line shows the score of targets met, "W 0 of 5" today.

## Open questions

1. Does Leo use an iPhone or an Android phone? Recommended: build both cheap paths (find-save-anywhere's manifest entry and Shortcut) and hold off on a native wrapper until the Shortcut is used every week for a month.
2. Team posts: keep answering on Telegram, or move approvals into the app? Recommended: keep Telegram for team posts, since that is where Leo already answers and the script confirms there, and alert in the app only for agent cards and campaign posts.
3. Section tabs sit at the top, out of thumb reach. Move them to the bottom on phones? Recommended: no. Tabs at the top match every app Leo uses (Jakob's law); move each page's main action to the lower half instead.
4. A failed post: have notify read Zernio hourly, or add a Zernio webhook? Recommended: the hourly read, since it needs no new public function; Leo decides if he wants the webhook's speed.

## Related

find-save-anywhere, remix-any-link, plan-ideas-inbox, agent-home, agent-approvals, plan-review-queue, publish-calendar, publish-tiktok, trust-team-push, ux-usability, ux-utility, ux-accessibility, ux-reliability

## References

Pages fetched 27 Oct 2026 with Scrapling; App Store numbers from the iTunes Search API. The captures sit in a temporary session folder (`ux-research-a/pages/`, `ux-research-a/appstore/`) that will not survive, so each quote above carries its URL. Mobbin screens checked through the Mobbin connector on 27 Oct.

- Fastlane: frame t116 in `public/north-star/fastlane/`, docs/north-star/videos/fastlane-2026-10-19/notes-2.md F14
- Mobbin: [Tana](https://mobbin.com/screens/f4d92479-90b1-4266-828b-fad0b9cf3aea), [Tana, Next Up](https://mobbin.com/screens/f4b2dd91-e1ff-449f-8000-eba445ea9332), [Dropbox Dash](https://mobbin.com/screens/1dc5d2da-0f3f-4c72-acee-393987164e39), [Gumloop](https://mobbin.com/screens/fc1bbf68-772d-4564-a78b-d7307d60a923)
- [Buffer help 636](https://support.buffer.com/article/636-buffer-browser-extension-on-the-mobile-app), [buffer.com/ideas](https://buffer.com/ideas)
- [Later help 360042773694](https://help.later.com/hc/en-us/articles/360042773694), [Later help 360043138953](https://help.later.com/hc/en-us/articles/360043138953-Set-Up-User-Notifications)
- [Linear Mobile](https://linear.app/mobile), [Things features](https://culturedcode.com/things/features/), [Metricool](https://metricool.com/)
- App Store listings: [Buffer](https://apps.apple.com/us/app/buffer-plan-schedule-posts/id490474324), [Later](https://apps.apple.com/us/app/later-social-media-scheduler/id784907999), [Hootsuite](https://apps.apple.com/us/app/hootsuite-social-media-tools/id341249709), [Metricool](https://apps.apple.com/us/app/metricool/id1072510529), [CapCut](https://apps.apple.com/us/app/capcut-photo-video-editor/id1500855883), [Captions](https://apps.apple.com/us/app/captions-ai-edits-your-video/id1541407007), [OpusClip](https://apps.apple.com/us/app/opusclip-ai-video-clipping/id6743615403), [Linear Mobile](https://apps.apple.com/us/app/linear-mobile/id1645587184), [Things 3](https://apps.apple.com/us/app/things-3/id904237743), [Notion](https://apps.apple.com/us/app/notion-notes-tasks-ai/id1232780281)
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p7a-post/results.md` (D2, D3, D4); fixes 3b8d6179 and 153c5383 (26 Oct)
