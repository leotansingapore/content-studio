# Which posts brought clients

`learn-attribution` | learn | phase 7 | status: partial | /north-star#learn-attribution

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's public pages say its analytics tie sign-ups and sales to each scheduled post, hook or meme, next to engagement and the user's own website analytics, without saying how (unverified; [TikTok scheduler](https://usefastlane.ai/tools/tiktok-scheduler), [hook generator](https://usefastlane.ai/tools/hook-generator), [vs Arcads](https://usefastlane.ai/compare/fastlane-vs-arcads)). Leo's recording does not show it: Analytics carries a "Growth" tag in the nav (most likely a plan, unverified) and was never opened.

Others:

- SageContent pulls analytics from connected platforms and writes coaching on which videos drove conversions ([site](https://www.sagecontent.ai/)).
- ContentIn's Pro plan adds "Leads analytics: ICP fit, audience conversions & CSV export" on top of its profile dashboard ([site](https://contentin.io/)).
- MagicPost's "Detect Leads" finds the people who reacted to your posts and scores them against your ideal client, with CSV export, from the Growth plan ([site](https://magicpost.in/)).
- Agorapulse has Social Media ROI dashboards that count traffic from its Pulse.ly short links against GA4 (details unverified) ([help](https://support.agorapulse.com/en/collections/7505387-analytics)).
- SocialBee lists UTM parameters among its analytics features, which lets a website's own analytics name the post a visit came from ([features](https://socialbee.com/features/)).

None of these fits an adviser exactly. Most enquiries reach an adviser by DM, by a comment keyword or by a client saying "I saw your post about CPF". A sale happens offline, weeks later, and is never visible to the app. This spec counts the three signals the app can see, and asks the adviser to log the fourth.

## What we have today

- Copy and Post it for me can add UTM tags to every link in a post when the brand kit has "link tracking" on (`tagLinks` in `src/lib/plainText.ts`; `utm_source` = platform, `utm_medium` = social, `utm_campaign` = first five words of the hook). The results show only in the adviser's own website analytics.
- Tracked links (`/links`, `src/pages/TrackedLinksPage.tsx`, `src/lib/trackedLinks.ts`, migrations `supabase/hub/019_tracked_links.sql` and `024_tracked_links_brand.sql`) count taps and people per `/t/<slug>` link per Singapore day in `cs_tracked_link_days`, which the owner can read through RLS. Links and campaigns belong to one brand (`profile_id`, added in 024). Making a link needs hub membership (`canTrack`), and the database allows 100 links per account across brands (`MAX_TRACKED`). `fetchMine` reads the open brand's links and only the last 30 days of counts. `src/components/TrackClicks.tsx` makes a tracked link for an address and offers "Swap in", today on Brand kit offers and Link in bio only.
- When the brand kit's link tracking is on, `tagLinks` adds UTM tags to every link in the copy, our own `/t/` links included, so a posted `/t/` link can end in `?utm_source=...`. On LinkedIn a link can sit in the draft's `firstComment` instead of its body (`moveLinksToComment` in `src/lib/platformCounters.ts`).
- Link in bio counts clicks per button (`/bio`, edge fn `link-in-bio`), not per post.
- Auto-DM (`/recruit/auto-dm`, `src/lib/autoDm.ts`, `supabase/functions/social/automations.ts`, gated by `SOCIAL_CONNECT_USERS`) reports per automation `triggered`, `sent`, `failed`, `read` and `clicked` (people who tapped a link button), with a log of who got it (`automation-logs`, 50 a page, each with `at`, `status` and `clicked`). An automation can be tied to one post (`platformPostId`, with `postTitle`, the first 100 characters of that post's caption) or listen account-wide. `accountPosts` lists only an account's 25 latest posts. Each of these calls uses one `social-read`.
- In Write, a keyword post shows a "Set up the auto-DM" link that carries `ctaKeyword(draft)` to the auto-DM form (`GeneratePage.tsx`, around line 3468).
- Nothing joins any of this to a draft. No post shows how many enquiries, DMs or taps it brought.
- `upsertDraft` in `src/lib/draftHistory.ts` rebuilds an entry from Write's fields and keeps only the extras it names (`metrics`, `labels`, `zernio` and a few more), and `duplicateDraft` deletes a fixed list of keys from the copy. A new field on `DraftEntry` has to be added to both.
- `AnalyticsPage` does not call `useScrollToHash`, so no new `/analytics#...` anchor scrolls today.

Status partial: the signals exist one by one (UTM tags, tracked link taps, auto-DM counts), but none is traced to the post that caused it.

## Build

### Screens and states

A Leo-only card on `/analytics`, "What brought clients", anchored `#clients`, placed right after the This week card. Component `src/components/Attribution.tsx`, logic in `src/lib/attribution.ts`. It follows the page's existing `?period=` (7d, 30d, 90d, all; default 30d).

```
What brought clients (i)                              [ Log an enquiry ]
Last 30 days
"3 CPF moves before 31 Dec"   LinkedIn, 2 Oct
   2 enquiries   14 asked for the guide   9 DMs sent   6 taps   [+ Enquiry] [Make another]
"Why I stopped selling ILPs"  Instagram, 9 Oct
   1 enquiry     0 asked                                   [+ Enquiry] [Make another]
By hook: Myth bust posts brought 3 enquiries and 11 DMs from 4 posts.
Updated 9:40 AM                                                     [Update]
```

The four signals, per posted draft in the period:

1. Enquiries you log. A "+ Enquiry" button on each row here and on each posted row in My posts (`src/pages/DraftsPage.tsx`, Leo only) adds the current time to the draft's `enquiries`. A toast "Enquiry logged on "{hook}"" offers "Undo".
2. "Log an enquiry" opens a dialog for when you know what the person said but not which post it was:

   ```
   Where did they find you?
   [ What did they say? For example: saw your CPF video   ]
   Leave out names.
                                   [Cancel] [Find the post]
   ```

   "Find the post" carries a price chip, "Under US$0.01 | {n} left today" (`useUsesLeft("enquiry-match")` from `src/lib/aiUsage.ts`), or "None left today" with the button off and the list shown at once. It sends the text and your posted drafts from the last 60 days (up to 15, newest first) to `writing-judge` mode `which-post`; the typed words are used for that one call and never stored. The dialog then lists those posts as radio rows under "Was it this post?", with Jev's pick preselected and tagged "Best match", plus "Not from a post". "Save" logs the enquiry on the chosen draft, or in `other` for "Not from a post".
3. Keyword DMs, when social accounts are on. On "Update" (and on opening the card when the cache is over 6 hours old), the job reads `listAutoDms(profileId)`, then `autoDmLogs` for each automation, up to 4 pages (200 entries) inside the period. Each log entry goes to one draft:
   - An automation tied to a post: call `accountPosts(profileId, accountId)` once per account to turn `platformPostId` into the post's URL, then give the entry to the draft whose `zernio.links` URL (or `live.url`, from `learn-real-numbers`) is the same address. Compare with the `bare` helper in `src/lib/platformCounters.ts` (export it), which drops the scheme, `www.`, the query, the fragment and a closing slash. `accountPosts` only returns the 25 latest posts, so for an older post fall back to the automation's `postTitle`: the posted draft on that platform whose first 100 characters of `toPlainText(d.draft)` overlap it at 0.6 or more (`wordOverlap` in `src/lib/nearDuplicate.ts`), the highest if several.
   - An account-wide automation: the entry goes to the latest posted draft on that platform, posted before the entry's `at`, whose `ctaKeyword(draft.draft)` is one of the automation's keywords. When no draft fits either rule, the entry counts toward "keyword DMs not tied to a post".

   Per draft this gives "asked" (entries), "DMs sent" (status sent) and "tapped" (entries with `clicked`).
4. Link taps. For each posted draft whose `draft` or `firstComment` holds one of your `/t/<slug>` addresses, sum `clicks` and `people` from `cs_tracked_link_days` for that link from the post's Singapore day through 6 days after. Find the slug with `isTrackedUrl` plus a `/t/([a-z0-9-]+)` match on each link from `findLinks`, so a UTM query on the end does not hide it. The window stops early on the day another post with the same link went out, so two posts never count the same tap. Read `cs_tracked_links` (`id, slug`, `.eq("profile_id", activeProfileId(userId))`) and `cs_tracked_link_days` (`.in("link_id", ids).gte("day", start of the period minus 6 days)`) with plain Supabase selects; RLS limits both to your rows. Do not reuse `fetchMine`, which stops at 30 days.

To get links into posts, Write gets "Track clicks" for links in the post. Beside "Set up the auto-DM" in `GeneratePage.tsx`, each http(s) link that `findLinks` (`src/lib/platformCounters.ts`) finds in the draft text gets a `TrackClicks` button (label = the hook's first 40 characters). "Swap in" replaces that URL in the draft text. TrackClicks already hides itself for non-members and for addresses that are already ours.

Rows and roll-ups:

- Rows sort by enquiries, then DMs sent, then taps, all descending, and posts with all four at zero are left out. The card shows 10 rows, then "Show all {n}", which sets `?clients=all` (`useUrlFlag("clients", "all")`, replace).
- "Make another" opens Write through `ownRemixUrl(draft, standing)` from `src/lib/winners.ts` (`remix-own-winners`) with the standing "{n} enquiries". If that item has not shipped, add `ownRemixUrl` here as its spec describes.
- The roll-up line names the best hook formula and the best format with 2 or more posts in the period, by enquiries then DMs sent: "By hook: {name} posts brought {e} enquiries and {d} DMs from {n} posts." and "By format: ...". It is plain arithmetic; nothing is shown when no group has 2 posts.

States:

- Nothing yet (no enquiries, no auto-DM entries, no tracked links in posts): "Nothing traced to a post yet. Log an enquiry when someone says they saw a post." with "Log an enquiry" as the main button.
- Reading: rows draw at once from the cache and the logged enquiries. DM and tap chips show a grey bar, and "Reading auto-DMs and link taps..." shows within 400 ms.
- Done: rows, roll-up, "Updated {time}".
- Social accounts off (`socialConnectShown()` false): no DM chips, and a muted link "Count keyword DMs too" to `/accounts`.
- No tracked links in any post: no tap chips.
- DM read failed: "Couldn't read your auto-DMs. Try again." Taps failed: "Couldn't read your link taps. Try again." Enquiries still show.
- Over the daily cap (429 on `social-read`): the cached counts stay, with the server's message under "Updated".
- Finding the post: within 400 ms the button changes to "Finding the post..." and stays disabled until the list appears. When Jev is unsure (a pick under 0.6), returns null, is over its cap or gets text that is not English, the same list appears with nothing preselected under the heading "Which post was it?".
- Refused: other sign-ins see no card and no "+ Enquiry" button, and `which-post` answers 404 `{ code: "not_enabled" }`.

### Copy

- Heading: "What brought clients"
- InfoTip (label "About what brought clients"): "Enquiries you log, keyword DMs and link taps, matched to the post."
- Sub-line: "Last {7|30|90} days", or "All time"
- Chips: "{n} enquiry" or "{n} enquiries", "{n} asked for the {keyword}" (keyword lower-case, "asked" when there is none), "{n} DMs sent", "{n} taps"
- Buttons: "+ Enquiry", "Make another", "Log an enquiry", "Update", "Show all {n}"
- Roll-up: "By hook: {name} posts brought {e} enquiries and {d} DMs from {n} posts." and "By format: {format} brought {e} enquiries and {d} DMs from {n} posts."
- Dialog: title "Where did they find you?", placeholder "What did they say? For example: saw your CPF video", hint "Leave out names.", buttons "Cancel", "Find the post", price chip "Under US$0.01 | {n} left today" or "None left today", busy "Finding the post...", list heading "Was it this post?" or "Which post was it?", tag "Best match", option "Not from a post", button "Save"
- Toasts: "Enquiry logged on "{hook}"", "Enquiry logged", "Undo"
- Lines: "Nothing traced to a post yet. Log an enquiry when someone says they saw a post.", "Reading auto-DMs and link taps...", "Count keyword DMs too", "Couldn't read your auto-DMs. Try again.", "Couldn't read your link taps. Try again.", "{n} keyword DMs not tied to a post"
- Write: TrackClicks keeps its own labels ("Track clicks", "Swap in /t/{slug}")

### Data

- `DraftEntry` in `src/lib/draftHistory.ts` gains `enquiries?: string[]`, ISO times, 200 kept. It syncs with the drafts. Add `"enquiries"` to the keys `duplicateDraft` deletes, and keep it in `upsertDraft` the way `zernio` is kept (`if (prev?.enquiries && !entry.enquiries)`), or the next edit in Write wipes it. Add `addEnquiry(userId, id, at)` and `removeEnquiry(userId, id, at)` for Undo.
- New synced key `content-studio-attribution-<scoped(userId)>`, one per brand, written whole:

```ts
// src/lib/attribution.ts
export interface AttributionCache {
  at: string | null;                       // last Update
  period: string;                          // the period it was read for
  byDraft: Record<string, { asked: number; sent: number; tapped: number; taps: number; people: number }>;
  unmatchedDms: number;
  other: string[];                         // enquiries not from a post, ISO times, 200 kept
}
```

- No names, handles or typed words are stored. The auto-DM log already lists who got a DM; this card keeps counts only.
- No table, no migration, no schema change. Tracked-link tables are read, never written.

### AI and cost

- Jev, through a new `writing-judge` mode `which-post`, body `{ mode: "which-post", said, posts: [{ id, hook, platform, day }] }` (1 to 15 posts, `said` 4 to 300 characters). The server answers 404 `{ code: "not_enabled" }` unless `leoOnly(user.email)` passes (`supabase/functions/_shared/leoOnly.ts`, from `plan-goal`).
- The question, id `post`, type choice, state `{ said, country: "Singapore", posts }`. Instructions: "Which of these posts is the person describing when they say `said`?" Criteria: one per post, `"{hook} ({platform}, {day})"`, plus `none`: "None of these, or it is not clear which".
- Preselect when the pick is a post at 0.6 or more (proposed, `MATCH_MIN` in `logic.ts`). Below that, or `none`, or null, nothing is preselected. Text that is not mostly English skips Jev and uses no cap; the mode is left out of the function's whole-request 422 check so the dialog never errors.
- The gate runs after the sign-in check and before `consumeUsage`. A null from Jev gives the use back with `refundUsage`, per the README rule.
- New cap in `usageCaps.ts`: `"enquiry-match": 20` a day per user. One call is about 1,500 input tokens, under US$0.0001.
- Zernio reads: 1 automations call, up to 4 log pages per automation and 1 account-posts call per account, each one `social-read` (cap 300 a day). Three automations on two accounts come to 15. The job stops at 20 reads per Update, reading active automations first, and counts what it could not reach as not read yet rather than zero. The automatic refresh runs at most every 6 hours.
- Supabase selects on the tracked-link tables are free. No LLM.

### Deep links

- `/analytics#clients` scrolls to the card once `AnalyticsPage` calls `useScrollToHash(userId !== null)`; whichever of `learn-format-winners`, `learn-attribution` and `learn-real-numbers` ships first adds that line, and this card adds `id="clients"` with `scroll-mt-20`.
- `/analytics?enquiry=new#clients` opens the Log an enquiry dialog (push; closing removes it). `/analytics?clients=all#clients` shows every row. Add `enquiry` and `clients` to `links.analytics`.
- The card follows `?period=`, which already exists.
- Rows open the post with `links.generate({ draft })`.
- Add the anchor and the `enquiry` and `clients` params to the `/analytics` rows in `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in, Analytics shows "What brought clients" and My posts shows "+ Enquiry" on posted rows; other sign-ins see neither, and no new calls run for them.
- [ ] "+ Enquiry" adds to the draft and Undo removes exactly that one.
- [ ] "Log an enquiry" with "saw your CPF video" and a seeded CPF post preselects that post (Jev mocked at 0.8); at 0.4 nothing is preselected and the heading reads "Which post was it?".
- [ ] A seeded account-wide automation with keyword GUIDE attributes each log entry to the latest GUIDE post before it, and a post-tied automation to its own post.
- [ ] Taps on a `/t/` link inside a post (in the body or the first comment, with or without UTM tags) count from its day through 6 days after, and stop at the next post with the same link.
- [ ] A post-tied automation on a post older than the account's 25 latest still lands on its draft through `postTitle`.
- [ ] Editing a posted draft in Write keeps its enquiries; duplicating it does not copy them.
- [ ] Write shows "Track clicks" beside links in the post for a member, and "Swap in" edits the draft text.
- [ ] Failed reads keep the enquiries and cached counts on screen with their error line.
- [ ] The 21st `which-post` call in a day gets 429 and the dialog still saves by hand; a call where Jev returns null leaves the count where it was.
- [ ] `/analytics#clients` and `/analytics?enquiry=new#clients` work after a reload.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/attribution.test.ts`: `assignLogs` sends post-tied entries by URL (`bare` on both sides), falls back to `postTitle` overlap at 0.6 when the post is not among the 25 latest, and sends account-wide ones to the latest earlier draft with the keyword, else to unmatched. `slugsIn` finds a `/t/` slug in the body and in `firstComment`, with a UTM query on the end. `tapWindow` covers 7 days and stops at the next post with the same link. `rankRows` sorts by enquiries, DMs, taps and drops all-zero posts. `rollup` needs 2 posts per group. Period filters use Singapore days.
- `src/lib/draftHistory.test.ts`: `addEnquiry` keeps 200, `removeEnquiry` removes one time only, `upsertDraft` keeps enquiries through an edit, and a duplicated draft has no enquiries.
- `supabase/functions/writing-judge/logic.test.ts`: the `which-post` question lists every post plus `none`, uses the 0.6 cut, and skips Jev for non-English.
- `supabase/functions/writing-judge/index.test.ts`: 404 for a non-Leo email before any counter moves; `enquiry-match` is consumed, and given back when Jev returns null.
- `supabase/functions/_shared/usageCaps.test.ts`: `enquiry-match` is 20.

## Open questions

- The typed words in "Log an enquiry" go to TypeSafe for one call and are not kept. Leo should confirm that is acceptable for client words; the hint asks for no names.
- Server gate: this spec uses `_shared/leoOnly.ts` (`plan-goal`); `find-competitors` picks a `NORTH_STAR_USERS` uid secret. Use whichever ships first.
- Each `/t/` link counts toward the 100-link limit. If Leo tracks every post, old links need deleting, and that deletes their counts. A per-post link without that limit needs a schema change, which is Leo's call.
- Sales and signed policies happen offline. A "became a client" step on an enquiry would need a lead record; ActivityTracker is where leads live, and a hand-off belongs to `learn-warm-leads`.
- UTM-tagged visits stay in the adviser's own website analytics. Reading them would mean connecting GA4, which is a new integration for Leo to decide.

## Related

learn-warm-leads, publish-auto-dm, publish-link-in-bio, remix-own-winners, learn-real-numbers, learn-format-winners
