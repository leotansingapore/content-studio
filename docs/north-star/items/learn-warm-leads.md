# People who engaged, sorted into likely clients

`learn-warm-leads` | learn | phase 7 | status: partial | /north-star#learn-warm-leads

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows nothing like this in Leo's recording or its public captures.

- Snappy Kraken's Opportunities Feed is a live list of engaged prospects "ranked by behavior and intent", each with a score and a next step such as "Call this contact", and the text or email goes out from the recommendation itself ([campaigns](https://snappykraken.com/campaigns), [marketing hub](https://snappykraken.com/marketing-hub)).
- Taplio fills two contact lists by itself, "Liked My Posts" and "Commented My Posts", and both export for outreach. Past interactions come in over the first week; a new post is read about 24 hours after it goes out and then every few days, a pace Taplio keeps on purpose "to limit the risks for your account" ([help](https://intercom.help/taplio/en/articles/8808008-contacts-how-do-likers-and-commenters-lists-work)).
- MagicPost's "Detect Leads" finds people who react to your posts, scores their fit against your ideal customer and exports them to CSV, from the Growth plan up ([site](https://magicpost.in/)).
- Twenty Over Ten Lead Pilot gives each contact a LEAD score from 1 to 100 from content engagement, actions and time, tuned by the adviser's own star ratings ([help](https://help.twentyoverten.com/en/understanding-the-lead-score)).
- Tweet Hunter's X CRM builds lists from engagement and past tweet and DM interactions and tracks the conversations, from the Grow plan ([site](https://tweethunter.io/), [pricing](https://tweethunter.io/pricing)).

## What we have today

- "Engage this week" on `/following` (`src/components/EngageWeek.tsx`, `supabase/functions/engage-picks`, cap `engage-picks` 20) shows 2 "Likely clients" from people who commented on your own posts. The commenters come from the account audit, which keeps the latest 5 per post on Instagram only (`igCommenters` in `supabase/functions/_shared/socialAudit.ts`, last 30 posts). Jev asks one yes/no per comment ("Does the person who wrote it sound like a possible client?", `LIKELY_AT` 0.3), over at most 15 people from the last 45 days.
- Reply drafts on `/recruit/engage?tool=replies` (`supabase/functions/engage-assist`, cap `engage-replies` 30) sorts pasted comments into potential client, adds something, peer, support and noise with one Jev choice each, calibrated on 2026-10-08 (`CLIENT_MIN` 0.35, 40 of 40 right). Clients get a reply and a first DM.
- Auto-DM's "Who got it" (`/recruit/auto-dm?log=`, Zernio, `SOCIAL_CONNECT_USERS` only) lists who commented a keyword, what they said and whether the DM went. Each log row (`LogView` in `supabase/functions/social/automations.ts`) carries `who`, `said`, `status` and `at`, with no post link; the automation's bound post is on the automation itself.
- The account audit refreshes weekly: `refresh-social-audits` redoes audits a week old that were opened in the last 30 days, so a refresh can be up to 7 days away.
- Nothing keeps a list of people, nothing reads likers or DMs, and nothing exports people or hands them to ActivityTracker.

Status partial: two likely clients a week from Instagram commenters, and a sort of comments you paste in; no list, no next step per person, no export.

## Build

### Screens and states

A new tool on Engage, `/recruit/engage?tool=people`, label "People who engaged", shown on Leo's sign-ins only: add it to `TOOLS` in `src/pages/EngagePage.tsx` when `leoOnly(email)`, and leave it out of `allowed` for everyone else so `?tool=people` falls back to replies. EngagePage already calls `getSession()`; keep `data.session?.user.email` beside the id. The list goes in a new `src/components/engage/People.tsx`, with its logic in a new `src/lib/people.ts`.

```
People who engaged                                   [ Sort again ]  9 left today
From your last 30 Instagram posts, your auto-DMs and comments you saved. Sorted 2 hours ago.
[ Likely clients 6 ] [ Everyone 23 ] [ Done 4 ]

@jasmine.tan  Instagram, 3 days ago                                    Likely client
"How much should I set aside for my parents' hospital bills?"
On "5 things I wish I knew before my first CPF top-up"
Next: send a DM          [ Draft a DM ]   Mark done   Hide

                                   [ Download CSV for ActivityTracker ]
```

Where people come from, newest first, one row per person per network:
1. Commenters kept by the account audit (Instagram, latest 5 per post, last 30 posts), read server-side as `engage-picks` does today.
2. Auto-DM logs, for accounts on `SOCIAL_CONNECT_USERS` (`socialConnectShown()` in the app): the page lists the auto-DMs with the `social` action `automations`, reads "Who got it" for each with `automation-logs` (first page of 50; every call counts against `social-read`, 300 a day) and sends those comments with the sort request. `said` is the text and the automation's bound post (when it has one) is `postUrl`; the platform is that of the automation's account. `who` is "@username" when Zernio gives a username (strip the "@" for `user`) and otherwise a display name or "Someone"; a row with no username keeps the name for display, gets no "Open their profile" and is left out of the CSV's Profile link.
3. Comments you save from Reply drafts: on Leo's sign-ins, each "Potential client" reply card gets "Save to People", which stores that commenter with source `pasted`.

Sorting runs when the tab opens and the last sort is over 20 hours old, or on "Sort again". It runs outside React in `src/lib/people.ts` (a module-level job with listeners, like `following.ts`), so leaving the page does not stop it.

Each row's next step and button:

| Next step (Jev) | Line | Button |
|---|---|---|
| dm | "Next: send a DM" | "Draft a DM" |
| reply | "Next: reply to the comment" | "Draft a reply" |
| follow | "Next: follow and comment on their posts" | "Open their profile" |
| none | no line | none |

"Draft a DM" and "Draft a reply" paste "@{user}: {comment}" into Reply drafts with `saveRun("replies", ...)`, the same way `engageAct` in `src/lib/assistantActs.ts` does, and open `/recruit/engage?tool=replies`; a client card there carries the first DM. "Open their profile" opens `profileUrl(platform, user)` from `socialAudit.ts` in a new tab; that helper only knows Instagram and TikTok, so on other networks the follow line shows with no button. "Mark done" and "Hide" set the row's state; "Undo" shows in the toast for 5 seconds.

States:
- No audit and no auto-DMs: "Run your account audit to see who comments on your posts." with "Open the audit" (`/analytics#account-audit`).
- Audit made before commenters were kept (`kept` false): "Your account audit starts keeping who comments from its next weekly refresh." (the line Engage this week already uses)
- Nobody in 30 days: "Nobody has commented in the last 30 days."
- Sorting: rows show newest first with a "Sorting {n} people..." line; labels fill in when Jev answers.
- Done: the counts on the chips update, and "Sorted just now".
- Jev null or failed: rows stay newest first; "Couldn't sort them right now. They're newest first." with "Try again".
- Over the daily cap (429): the last list stays; "You've sorted 10 times today. It resets at 8am Singapore time."
- Refused: other sign-ins never see the tab or call `mode: "people"` (the function also answers 403 `{ code: "not_allowed" }` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)`, the helper in `supabase/functions/market/logic.ts`, with the secret holding Leo's two uids. The secret is new; set it if `find-competitors` has not).

### Copy

- Tab: "People who engaged"
- Sub line: "From your last 30 Instagram posts, your auto-DMs and comments you saved. Sorted {when}."
- Chips: "Likely clients {n}", "Everyone {n}", "Done {n}"
- Tag: "Likely client"
- Buttons: "Sort again", "Draft a DM", "Draft a reply", "Open their profile", "Mark done", "Hide", "Undo", "Download CSV for ActivityTracker", "Save to People" (on Reply drafts)
- Toasts: "Marked done", "Hidden", "Saved to People"
- InfoTip on "Likely client": "Jev's read of what they wrote. Check before you reach out."
- Empty, waiting and refusal lines exactly as in the states above

### Data

- `content-studio-people-<scoped uid>`, synced: `{ sortedAt: string | null; people: Person[] }`, newest 200 kept. `Person = { key: "<platform>:<user>"; platform; user; text (up to 400 chars); at; postUrl; postHook?; source: "comment" | "auto-dm" | "pasted"; p: number | null; step: "dm" | "reply" | "follow" | "none" | null; state: "new" | "done" | "hidden" }`. A re-sort merges by `key` and keeps `state`. An auto-DM row with no username takes the key `<platform>:log:<log id>` so two unnamed people never merge.
- Hiding keeps the row with `state: "hidden"` and empties `text`, so another device's copy cannot bring the comment back.
- CSV, built in the browser (`buildCsv` from `src/lib/teamReview.ts`): Name, Handle, Platform, Profile link, What they said, Post link, Date, Likely client (yes/no), Next step, Tags (`content-studio-YYYY-MM-DD`). Name is the handle, since comments carry no real name. ActivityTracker's pipeline "Import CSV" (`~/remix-of-activity-tracker`, `src/components/pipeline/CsvImportDialog.tsx`) takes up to 2,000 rows (`MAX_ROWS` in `src/lib/pipeline/csvImport.ts`) and lets the person map each column to Name, Stage, Tags, an existing field or a new one. Whether these columns map cleanly is unverified until someone imports one file.
- Nothing here needs a schema change, and the list keeps only public handles, the public comment and its post link, never phone numbers or emails.

### AI and cost

- `engage-picks` gains `mode: "people"` with body `{ extra?: { platform, user, text, at, postUrl }[] }` (up to 40 extra). It merges audit commenters (window 30 days) with `extra`, one per `platform:user`, newest first, at most 40, and asks Jev two questions per person in one call:
  - `c<i>`, the existing Noul from `jevAsk` in `engage-picks/logic.ts` ("Does the person who wrote it sound like a possible client?"), likely at `LIKELY_AT` 0.3 as today.
  - `s<i>`, a Choice. Instructions: "`c<i>` is a comment on a Singapore financial adviser's social media post. What should the adviser do next with the person who wrote it?" Criteria: dm: "Send a short private message: they shared their own money, insurance, CPF or retirement situation, or asked for help with it." reply: "Reply in the comments: they asked a general question or added something other readers would want answered." follow: "Follow them and comment on their posts first: they seem interested but gave nothing to reply to yet." none: "Nothing: a friend's greeting, an emoji, another adviser, a business, a bot or spam."
  - Keep the step when its probability is 0.4 or more (proposed), else `none`. Calibrate both questions on Leo's real commenters before anyone else sees the tab, as was done for `CLIENT_MIN`.
- Comments mostly in other scripts are not sent (`readable` in `engage-picks/logic.ts`) and show with no label.
- New cap in `usageCaps.ts`: `"warm-leads": 10`, consumed by `mode: "people"` instead of `engage-picks`. About 40 people at about 350 Jev input tokens each is 14,000 tokens, about US$0.0006 a sort.
- No LLM in this item; the DM and reply drafts come from Reply drafts' existing call, under its own cap.

### Deep links

- `/recruit/engage?tool=people` opens the tab; `&show=all` or `&show=done` picks the chip (replace; default likely). `&person=<platform:user>` scrolls to and highlights that row (push).
- Add the rows to `docs/deep-links.md` and `people` to `links.engage` tools in `src/lib/links.ts`.
- `/analytics#account-audit`: give the audit section `id="account-audit"` (`scroll-mt-20`) for the empty state's button. AnalyticsPage needs `useScrollToHash(userId !== undefined)`, which `learn-weekly-report` adds; add it here if that item has not shipped.

## Done when

- [ ] On Leo's sign-in with an audit that kept commenters, the tab lists them newest first, and after the sort each row has a label and a next step.
- [ ] "Draft a DM" lands on Reply drafts with the comment pasted and a client card with a DM ready after Draft.
- [ ] "Save to People" on a Reply drafts client card adds that person with source `pasted`.
- [ ] Hide removes the row on this device and on a second device after sync, and the comment text is gone from the synced key.
- [ ] The CSV opens in a spreadsheet with the columns above, and one import into ActivityTracker's pipeline is tried and its result noted here.
- [ ] The 11th sort in a day answers 429 and the old list stays.
- [ ] Other sign-ins do not see the tab, and `?tool=people` shows replies.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `supabase/functions/engage-picks/logic.test.ts`: `peopleFrom(audits, extra, now)` merges both sources, keeps one row per `platform:user` with the newest comment, drops the adviser's own handle and anything over 30 days, and stops at 40.
- Same file: `peopleAsk` writes both questions per readable person and none for an unreadable comment; `readPeople` applies 0.3 and 0.4 and returns null labels when Jev answers nothing.
- `src/lib/people.test.ts`: a re-sort keeps `done` and `hidden`; hiding empties `text`; the list stops at 200; the CSV escapes quotes and commas and has the 10 headers in order.
- `supabase/functions/_shared/usageCaps.test.ts`: `warm-leads` is 10.

## Open questions

- PDPA: keeping public handles and comments for outreach is personal data use in Singapore. Leo decides whether the tab needs a one-line notice or a retention limit (for example, 90 days).
- Likers and DMs stay out of this build: Instagram's API does not list likers, and reading DMs needs the inbox work in `publish-inbox`.
- TikTok, LinkedIn and Facebook commenters come only through auto-DM logs or pasting until the audit or Zernio reads their comments.
- A direct push into ActivityTracker, instead of a CSV, needs an endpoint on ActivityTracker's side; that is Leo's call.

## Related

publish-inbox, publish-auto-dm, publish-engage, learn-attribution, learn-post-grade, agent-home, brand-audiences
