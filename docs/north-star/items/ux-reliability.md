# It works the same way every time

`ux-reliability` | ux | phase 9 | status: partial | /north-star#ux-reliability

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Reliability: Does it work consistently? (Notes save correctly; reminders arrive as expected.)"

His law 15 in `~/.claude/UX.md`: "Preserve the user's work after an error." The README's standing rule: "Long jobs run outside React so leaving the page does not lose them."

## The bar

Nothing a person typed, made or deleted is lost or brought back by the app, a dropped connection or a Supabase outage, and every message about a result says what really happened.

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| R1 | Typed work: a script types into each text box on the core job paths, reloads, and looks for the words | every box keeps its words | 4 of 6 boxes kept; Competitors' add box and Brand's website box lost theirs; 5 pages untested |
| R2 | Synced deletes stay deleted: two devices, one cloud, the app's own `createCloudSync`; a key removed on one device after the other has pulled it | 0 keys come back | 1 of 1 came back |
| R3 | Gateway blip: a 20 s run of 520 answers on every Supabase call from the first request | the shell draws in 1 s from device data, says it is offline, and catches up within 5 s of the gateway's return, with no reload | 7.7 s of spinner, no message, caught up 6 s after the return |
| R4 | Jobs survive navigation and reload: share of long jobs that keep going when you leave the page, and that resume at no cost after a reload | 100% and 100% | 100% on leaving; after a reload, paid video and picture work resumes, while text makes in 6 job modules are lost |
| R5 | Honest outcomes: result lines that do not match what the server did, found by the dogfood run | 0 | 1 open ("Sent" before TikTok confirms, p7a-post D4); 3 fixed in code on 25 and 26 Oct and not re-checked live |
| R6 | Checks: full suite pass rate on every wave, the same suite with the clock 30 days ahead, and the live dogfood's good lines | 100%, 100%, 100% | 6,190 of 6,191 (the one red is a card another session had not finished adding); not run; 9 of 13 (25 Oct replay) |

## How the best do it

- Linear: "If for some reason changes cannot be sent to the backend, the app will store changes locally and re-try whenever connectivity is restored." When many changes wait or sending is slow, "Syncing" shows beside the workspace name with the number waiting, and queued changes survive a restart. Linear also says what its offline mode does not do: it is "designed as a failsafe" and can overwrite a teammate's newer edit. An issue draft is kept when you leave the page, and a saved draft "persists across clients" for 6 months ([Linear docs](https://linear.app/docs/get-the-app), [issues and drafts](https://linear.app/docs/creating-issues)).
- Notion: "Any changes you make offline will save locally and sync automatically the next time your device connects", with Settings > Offline listing what is kept on the device. Deleted pages stay in Trash for 30 days, then 30 more before nobody can reach them ([Notion offline](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know), [delete and restore](https://www.notion.com/help/duplicate-delete-and-restore-content)).
- Buffer keeps an error library per network in plain words. For a YouTube post with no confirmation it says the post "may have published successfully" and asks you to "check your YouTube channel before retrying" ([YouTube error library](https://support.buffer.com/article/973-youtube-error-library), [Facebook error library](https://buffer.helpscoutdocs.com/article/580-facebook-error-library)). Its public status page splits publishing by network (19 components) and listed 25 incidents from 14 Jul to 22 Oct 2026 ([status.buffer.com](https://status.buffer.com/)).
- Later's status page has 16 components, including TikTok, Instagram and Scheduling, and its feed's latest 50 incidents reach back to September 2024 ([status.later.com](https://status.later.com/)). A post whose phone notification was missed can still be published from Later's app ([Later help](https://help.later.com/hc/articles/360043247193)). Canva's status page tracks 40 components ([canvastatus.com](https://www.canvastatus.com/)).
- Mobbin, failures that keep the work: Dropbox Dash's failed connection reads "Couldn't connect Google Workspace", gives the likely cause in plain words ("Make sure to check all permission boxes"), then Try again as the main button and Close window beside it ([Mobbin, Dropbox Dash](https://mobbin.com/screens/f10e8de9-fc45-47d7-8ada-238f1ea8d062)). Quicken's failed save names what failed and offers Retry while a toast says the change was not made ([Mobbin, Quicken](https://mobbin.com/screens/41e93cf9-79bc-4d3b-b57d-d4a7a5f30826)). Workable asks "Save changes?" before you leave unsaved work ([Mobbin, Workable](https://mobbin.com/screens/336184aa-efcf-42ea-9fa6-3810811161ae)). Emergent's success line, "Saved to your GitHub", names where the work went and links to it ([Mobbin, Emergent](https://mobbin.com/screens/1342dec9-af26-48ff-9816-0a8958d3038e)). Items 3, 4 and 6 below take these shapes.
- Fastlane, in Leo's recording, left a generated but unsaved result with no confirm dialog when he pressed back to Studio (`videos/fastlane-2026-10-19/notes-3.md`, 3:33). That is a bar to beat, not to copy.

## What we have today

Measured 27 Oct on origin/main 78e49edb with fixtures on the machine (nothing reached production); code lines checked again at 8664c00d. The scripts and raw files lived in a session scratchpad and are not in the repo.

What holds:

- Sync keeps unsent saves on the device (`cs-sync-pending-<uid>`), retries at 2, 10, 30 and 60 s, retries when the browser comes back online, and pushes nothing until a pull has worked, so a failed pull cannot overwrite newer data (`src/lib/cloudSync.ts`, 21 tests in `cloudSync.test.ts`).
- Write saves 800 ms after you stop typing and again when the tab hides (`GeneratePage.tsx:2732`), and the agent's composer keeps its text in `cs-agent-draft-<scope>-<slot>` (`components/agent/Composer.tsx:70`). The R1 script kept the words in Write's topic box, the agent page's box, Home's ask box and the picture page's box.
- Every job module (`src/lib/*Job.ts`, 15 files) runs outside React, so leaving the page never stops a make. After a reload, paid work picks up at no cost: talking heads and other AI videos through `cs-ai-video-pending` (`talkingHeadJob.ts`, `hookDemoJob.ts`, `wallJob.ts`'s scene, `sameEditJob.ts`), presenter pictures (`presentersJob.ts`), and campaign batches (`campaignJob.ts:116`).
- A finished video waiting for the editor no longer holds another job's join (d3e501af, 25 Oct), which ends the 5-minute stall in the p6 replay (D1); no live run has re-checked it.
- The full suite on 27 Oct: 6,190 of 6,191 tests in 423 files passed in 44 s at a load near 55. The one failure was `northStar.test.ts` finding a card with no spec while another session was adding both in the same checkout.

What fails:

- Deletes come back (R2). A pull pushes up any local synced key the cloud has never seen (`cloudSync.ts:253`). So when a laptop deletes a key and a phone still holds it, the phone's next pull puts it back, and the laptop gets it again on reload. The repro used the app's own `createCloudSync` with two in-memory devices: 1 of 1 deleted keys returned with its old value. It bit Connect Claude links on 8 Oct; revocation now writes a `content-studio-mcprevoked-` row instead (CLAUDE.md). Keys the app still removes this way include a video's captions (`platformCaptions.ts:22`) and old activity months (`activity.ts:230`).
- Outage wait (R3). `ProtectedRoute` waits for the first pull (`ProtectedRoute.tsx:28`), and postgrest-js 2.105.1 retries a GET that gets a 520 three times, after 1, 2 and 4 s. Under a 20 s outage the app showed a spinner for 7.7 s, then drew from device data with no sign that it was not syncing; the pull caught up at 26 s. Edge function calls are not retried: `callFn` (`src/lib/edgeFn.ts`) turns the gateway's HTML page into "That didn't go through. Try again in a minute." ActivityTracker's Supabase project, a different one, dropped for 1 to 3 minutes about daily from 15 to 22 Oct (Cloudflare 520 to 525 on every path). Nobody has measured whether the academy project that Content Studio uses does the same, so R3 plans for it without a count.
- Typed work (R1). Competitors' "Add a competitor" box and Brand's website box lost their text on reload. The script found no text box at load on /carousel, /campaigns/new, /feedback, /clone and /calendar, so those are untested.
- Text makes and reloads (R4). `remixJob.ts`, `slideshowJob.ts`, `wallJob.ts` (the words), `notifyJob.ts`, `filmJob.ts` and `formatJob.ts` say in their headers that a reload mid-run loses the run. The server gives the use back only when the model never answered; a reload after the answer arrived spends the use and keeps nothing. `notifyJob.ts` has no paid step.
- Messages that did not match (R5), from the dogfood runs. "Your use was given back." showed after a 422 that kept the use and after a dropped connection where the server wrote the slideshow and counted it (p6 replay D8; fixed in code by 87c226d6 on 25 Oct). "Sent to your TikTok inbox" showed when Zernio had only accepted the post, which failed 74 s later while the panel still said sent (p7a-post D4; open). TikTok's raw error with its request id reached the person (D3; fixed by 153c5383 on 26 Oct). A scheduled post showed as Draft with no day (D1, high; fixed by ffec181c on 26 Oct). No live run has re-checked the three fixes; p7a-fix lists the two posting ones as not run, because posting needs Leo's own session.
- Stalls. One Analytics cold load hung 2 minutes with 5 auth lock errors, then said "Couldn't update your numbers." (p7a-post D8, marked as possibly a dev server effect).
- Checks (R6). Tests pinned to a date expire: `31fe27dc` fixed a competitor ads test whose 7-day line would have failed on 27 Oct. The 25 Oct replay passed 9 of its 13 good lines.

So the status is partial: sync never loses an unsent save and jobs survive leaving the page, but deletes are not durable, an outage looks like a hang, and one result line still says more than the server knows.

## Build

Who it reaches: items 1, 2 and 3 change `cloudSync.ts`, `ProtectedRoute` and `callFn`, code every sign-in runs, so they go to everyone only on Leo's yes (first open question). Items 4 and 5 can sit behind `useLeoOnly()` until then. Item 7 is a test setting.

1. Deletes that stay deleted (`trust-archive`, `publish-library`, `edit-video`): a delete of a synced key writes a tombstone row in `cs_user_data` (`content-studio-gone-<key hash>-<uid>` with the time), and the pull never pushes up a local key that has a newer tombstone; it removes it instead. No schema change: it is the `mcprevoked` pattern made general. The two-device repro becomes a test in `cloudSync.test.ts`.
2. Draw first, sync behind (`agent-home`): `ProtectedRoute` draws from the device as soon as a session exists (the same change as `ux-performance` item 2). A small sync chip in the account menu and the phone's More sheet shows nothing when all is sent, "Saving..." with a count while changes wait, and "Offline. Your changes are saved here." when a pull or push has failed for 10 s.
3. Retry reads, never writes (`publish-accounts`, `learn-real-numbers`): `callFn` retries once after 1 s on 502 to 504 and 520 to 526 for calls marked as reads (status checks, numbers pulls, list reads) and turns an HTML body into "Can't reach the server right now. Your work is saved here." with a Try again button, as Dropbox Dash does. Paid and posting calls are never repeated (the rule in ActivityTracker's `gatewayFetch.ts`).
4. Every box keeps its words (`find-competitors`, `brand-from-website`, `plan-campaign`, `edit-carousel`, `edit-slideshow`): one hook, `useKeptText(key)`, saves a text box to a `cs-` device key as you type and clears it on submit; use it on Competitors' add box, Brand's website box, the campaign wizard, the carousel and slideshow text, and the feedback box. Where a page holds a made result that is not saved, leaving asks first, as Workable does and Fastlane does not.
5. Text makes after a reload (`remix-everywhere`, `formats-slideshow`, `formats-wall-of-text`, `formats-launch-film`): each job stores its request id and inputs in a `cs-` device key while it runs; after a reload the row reads "Cut off by a reload. Run it again" and runs again under the same id, as campaign batches already do, so nothing is charged twice.
6. Say what happened (`publish-tiktok`, `publish-schedule`, `publish-per-network`, `agent-approvals`): three of the four lines are fixed in code; what is left is "Sent" only when the provider confirms, and one helper that keeps it so. It writes "given back" only when the server says it refunded, a plain line for each known provider code, and "It may have posted. Check before you try again." where the provider is silent, as Buffer does. A success names where the post went, as Emergent's does.
7. Clock-proof suite (no card): a vitest setup file that moves `Date` 30 days ahead for a second run, and a README rule that tests compute dates from today.

## Done when

- [ ] The R1 script types into every text box on the 5 core job paths, reloads, and finds every word.
- [ ] The two-device test in `cloudSync.test.ts` deletes a key on one device and it is still gone on both after each has pulled twice.
- [ ] Under a 20 s run of 520 answers, the shell draws from device data in 1 s, the sync chip says offline, and sync catches up within 5 s of the return with no reload.
- [ ] A reload during a remix, a slideshow and a wall of text shows the cut-off row, and Run it again finishes with one use counted.
- [ ] The dogfood run's result lines match the server log on every paid call and every post, with 0 mismatches, D4 and the three 25 to 26 Oct fixes included.
- [ ] `npx vitest run` passes, and passes again with the clock 30 days ahead.
- [ ] `src/data/northStar.ts` item `ux-reliability` flipped with its `ours` line in the same commit.

## Tests

- `cloudSync.test.ts`: the two-device delete (item 1) fails today and passes with the tombstone; a second case proves a tombstone older than a fresh write does not remove the new value.
- `edgeFn.test.ts`: a read retried once on a 520, a paid call never retried, and an HTML body mapped to the plain line (item 3).
- The 30-days-ahead run (item 7) proves no test depends on today's date.

## Scoring each build wave

| Script | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `npx vitest run`, then the 30-days-ahead run | R6 pass rates, R2 through the two-device test | 2 min | US$0 |
| `scripts/ux/reliability.mjs typed` (to write) on a local dev server with fixtures | R1 per box | 3 min | US$0 |
| `scripts/ux/reliability.mjs blip` (20 s of 520s) on the build, served under the real hostname as `ux-performance` describes | R3 times and the sync chip's words | 2 min | US$0 |
| A reload in the middle of 3 text makes, on fixtures | R4 | 2 min | US$0 |
| The dogfood live run, only in waves that touch making or posting, with its ledger checked against the function logs | R5 and the good lines | about 1 hour | about US$6 |

A wave passes when every free check is at its bar and no paid check got worse. The card's `ours` line carries the count, for example "R 3 of 6".

## Open questions

- Leo: items 1 to 3 change sync, the first draw and every function call for everyone. Ship them to everyone once their tests pass, or hold them? Recommended: everyone, item 1 first, since a delete that comes back is a bug on every account; your call.
- Leo: a public status page (Buffer, Later and Canva each have one) once paying advisers use it? Recommended: not yet; the in-app sync chip and plain failure lines cover the same need for one team, and a status page is one more thing to keep true.
- Leo: how long should a deleted draft stay recoverable? Recommended: 30 days in a Trash view, as Notion does, which the tombstone in item 1 makes cheap; `trust-archive` decides what a firm must keep longer.
- Leo: should a tombstone ever expire? Recommended: keep them 90 days, then drop both the tombstone and any stray copy on the next pull.

## Related

trust-archive, publish-library, edit-video, agent-home, publish-accounts, learn-real-numbers, find-competitors, brand-from-website, plan-campaign, edit-carousel, edit-slideshow, remix-everywhere, formats-slideshow, formats-wall-of-text, formats-launch-film, publish-tiktok, publish-schedule, publish-calendar, publish-per-network, agent-approvals, formats-talking-head, ux-performance (item 2 is shared), ux-trust

## References

Fetched 27 Oct 2026 with Scrapling and the status pages' public JSON; Mobbin screens found by the integrator through the Mobbin connector the same day. The captures were kept in a session scratchpad and are not in the repo, so each link above is the source.

- [Linear, get the app (sync and offline)](https://linear.app/docs/get-the-app); [Linear, issues and drafts](https://linear.app/docs/creating-issues)
- [Notion, working offline](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know); [Notion, delete and restore](https://www.notion.com/help/duplicate-delete-and-restore-content)
- [Buffer YouTube error library](https://support.buffer.com/article/973-youtube-error-library); [Buffer Facebook error library](https://buffer.helpscoutdocs.com/article/580-facebook-error-library); [Buffer status](https://status.buffer.com/)
- [Later status](https://status.later.com/); [Later, troubleshooting notifications](https://help.later.com/hc/articles/360043247193); [Canva status](https://www.canvastatus.com/)
- Mobbin: [Dropbox Dash, a failed connection](https://mobbin.com/screens/f10e8de9-fc45-47d7-8ada-238f1ea8d062), [Workable, leaving unsaved work](https://mobbin.com/screens/336184aa-efcf-42ea-9fa6-3810811161ae), [Quicken, a failed save](https://mobbin.com/screens/41e93cf9-79bc-4d3b-b57d-d4a7a5f30826), [Emergent, a confirmed save](https://mobbin.com/screens/1342dec9-af26-48ff-9816-0a8958d3038e)
- Fastlane: `docs/north-star/videos/fastlane-2026-10-19/notes-3.md`
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p6replay/results.md`, `live-p7a-post/results.md`, `live-p7a-fix/results.md`
- Memory: `cs-synced-delete-not-durable.md`, `at-supabase-gateway-blips-1022.md`, `never-test-live-side-effects.md`
