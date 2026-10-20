# Comment on the right people's posts

`publish-engage` | publish | phase 7 | status: partial | /north-star#publish-engage

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has nothing for commenting on other people's posts in the recording or the captures, but the LinkedIn and X growth tools do, and they share one shape: a list of people, their new posts in one quiet feed, and a drafted comment the user posts by hand.

- Supergrow's "Engage" gives a hand-picked engagement feed, and "Focus Mode" lets the user comment without the LinkedIn feed around it, with AI comment drafts in their voice, on Pro and up ([source](https://www.supergrow.ai/), [compare](https://www.supergrow.ai/compare/supergrow-vs-authoredup)). A third-party review says it can also schedule comments by engagement (unverified, [source](https://tooliverse.ai/tools/supergrow)).
- Reepl's Chrome extension drafts replies in the user's voice inside the LinkedIn feed, and every reply is reviewed and sent by the user, which keeps it clear of LinkedIn's automation rules ([source](https://reepl.io/)).
- Hypefury's engagement builder watches chosen users and keywords so the user can reply to the right accounts fast, with unlimited watched users and keywords on its Full plan ([source](https://hypefury.com/), [pricing](https://hypefury.com/pricing/)).
- MagicPost builds lists of creators to comment on, with AI suggestions, on Growth and up ([source](https://magicpost.in/), [compare](https://magicpost.in/comparison/kleo-versus-magicpost)).
- SuperX has a "Strategic Engagement Feed" with reply drafts and tracks which engagement turned into followers, with 750 engage replies a month on Advanced and 3,000 on Ultra ([source](https://superx.so/), [pricing](https://superx.so/pricing)).

## What we have today

The two halves exist on different pages, and the user carries the post from one to the other by hand.

- Engage this week on `/following` (`src/components/EngageWeek.tsx`, `src/lib/engage.ts`) lists 10 people:
  - 5 bigger accounts and 3 peers from the Creators list (`src/data/advisors.json`, Instagram only), sized by their usual reel views against the user's own from the account audit, rotated every ISO week;
  - 2 likely clients from the people who commented on the user's posts in the last 45 days, picked by Jev in `supabase/functions/engage-picks` (cap `engage-picks` 20);
  - a tick box per person and `<done> of <total> done`, saved in `content-studio-engage-<scoped(uid)>`. Each row links to the person's profile, never to a post.
- The comment writer is Reply drafts > Comments, `/recruit/engage?tool=comments` (`src/components/engage/Comments.tsx`, `supabase/functions/engage-assist` mode `comments`, cap `engage-comments` 30):
  - the user pastes "Whose post" and "Paste their post", up to 10 posts;
  - Jev picks which kinds of comment fit (`Add a number`, `Ask the real question`, `Respectfully disagree`, `Share your result`), asked twice with the options reversed, and OpenAI writes them under the MAS lines (`COMPLIANCE_LINES`);
  - copying a comment logs whose post it was in `content-studio-commentlog-<scoped(uid)>`. The slot then reads `You commented on <name> once this week.` or `... <n> times this week.`, in the warning colour from the third time (`OFTEN = 3`).
  - The prompt does not use the user's voice profile.
- Following tracks up to 5 public Instagram or TikTok accounts (`MAX_FOLLOWED`), keeping the 12 newest unpinned posts from each check (`POSTS_PER_CHECK` in `supabase/functions/track-accounts/logic.ts`; `src/lib/following.ts`, Apify, cap `track-accounts` 10).
- The weekly creators drop keeps 1 to 3 top posts per creator with caption, link and `timestamp` (`src/data/topPosts.json`, read by `getTopPostsForAdvisor` in `src/lib/topPosts.ts`, sorted by engagement, not date). On 20 Oct 2026, 23 of its 47 creators had one from the last 14 days, so about half the bigger and peer cards will carry the `From <D Mon>` line.

## Build

Gate: the new view and its button show only when `leoOnly(email)`. The one server change (an optional `voice` field) is ignored for anyone else, through `supabase/functions/_shared/leoOnly.ts`.

### Screens and states

On `/following`, Engage this week gains a primary button `Comment on their posts` that opens a focus view (`?view=focus`) in place of the page body. New files: `src/components/engage/FocusFeed.tsx` and `src/lib/engageFeed.ts`.

```
< Following                                   3 of 13 posts done this week
+------------------------------------------------------------------+
| Bigger account   @thewokesalaryman   Instagram, 2 days ago        |
| "Most people don't need a bigger budget. They need a ..."         |
| Open the post                                                     |
|------------------------------------------------------------------|
| ASK THE REAL QUESTION                                             |
| "How do you handle the months when ..."           [Copy]          |
| SHARE YOUR RESULT                                                 |
| "With my clients, [your result] ..."               [Copy]          |
+------------------------------------------------------------------+
            [Skip]                                   [Next post]
```

The queue (`buildFeed` in `src/lib/engageFeed.ts`, pure):

1. This week's bigger accounts, then peers, from `engageList`: each person's newest post in `topPosts.json` from the last 14 days, or their newest post with the line `From <D Mon>` when nothing is that recent.
2. Each Following account's newest tracked post from the last 7 days.
3. People already done this week, and posts marked commented or skipped, go to the end.

Likely clients stay as they are today (a link to their profile), because the right move with them is a reply to their own comment, which publish-inbox covers.

The card:

- A tag (`Bigger account`, `Peer`, `You follow them`), the handle, platform and age, the caption cut to 6 lines with `Show more`, and `Open the post` (new tab).
- Drafts are written when the card first shows: one `engage-assist` call in mode `comments` with that single post, which returns two comments of different kinds. While it runs the card shows `Writing 2 comments...` over two skeleton lines.
- Each comment has its kind heading in caps (the existing labels), editable text, compliance chips from `scanCompliance` as warnings, and `Copy`.
- `Copy` copies the text and shows `Copied. Open the post and paste it.` It also logs the comment (`logComment`), marks the post commented and ticks the person in Engage this week, so the counts move together.
- `Skip` marks the post skipped for the week and moves on. `Next post` moves on and leaves the post as it was.
- Above the card, the same `You commented on <name> ...` line from Comments shows here too, in the warning colour from the third time.
- Finished: `That's everyone for this week.` with `Back to Following`, and the line `New posts come in when their accounts are checked.`

Other states:

- No posts at all (no audit and no Following accounts): `Follow an account or run your account audit to fill this list.` with `Follow an account` (scrolls to the form) and `Run the audit` (`/analytics`).
- Drafting failed: `Couldn't write comments right now.` with `Try again`; the post stays on screen.
- Over the cap: `You've used all 30 comment runs for today. It resets at 8am Singapore time.` Copying earlier drafts still works.
- At 390 px the card fills the width, the two buttons sit in one row under it, each at least 44 px tall, and the caption scrolls inside the card.

### Copy

Exact strings: `Comment on their posts`, `<n> of <m> posts done this week`, `Bigger account`, `Peer`, `You follow them`, `From <D Mon>`, `Show more`, `Open the post`, `Writing 2 comments...`, `Copy`, `Copied. Open the post and paste it.`, `Skip`, `Next post`, `That's everyone for this week.`, `Back to Following`, `New posts come in when their accounts are checked.`, `Follow an account or run your account audit to fill this list.`, `Follow an account`, `Run the audit`, `Couldn't write comments right now.`, `Try again`.

### Data

- `EngageState` in `content-studio-engage-<scoped(uid)>` gains `posts?: Record<string, "commented" | "skipped">`, reset with the week like `done`. Post keys: `c:<advisorId>:<shortCode>` for creators and `f:<platform>:<handle>:<postId>` for Following.
- Drafts live in `sessionStorage` under `cs-engage-feed-<scoped>-<postKey>` so going back costs no second run.
- The comment log is the existing `content-studio-commentlog-<scoped(uid)>`. No table and no migration.

### AI and cost

- One `engage-assist` `comments` run per post shown, on the existing cap `engage-comments` (30 a day). A run is one Jev request (the same Choice asked in both option orders, a few hundred input tokens each, well under US$0.001) plus one OpenAI call through `openaiChat`, roughly 1 US cent at most (estimate, to be measured), so a full week of 13 posts is about 13 US cents.
- The run takes an optional `voice` (the user's voice summary from `loadVoiceProfile`, cut to 600 characters), and for Leo's emails the system prompt gains the line `Write the way this person writes: <voice>` while everyone else's request ignores the field.
- No new Jev question and no new cap. Jev's existing kind pick (both orders averaged) stays the decision; the LLM only writes.
- No Apify spend beyond today: the feed reads posts already fetched by the weekly drop and by Following's checks.

### Deep links

- `/following?view=focus` opens the focus view, push, so Back returns to Following.
- `/following?view=focus&post=<postKey>` shows that post first, replace while stepping. An unknown key falls back to the first post not done.
- Add `links.following({ view, post })` and the rows to `docs/deep-links.md` (today `/following` sits in the "(none)" row).

## Done when

- [ ] With an account audit on file and two Following accounts, the focus view lists the week's bigger accounts and peers, then the followed accounts, each with its newest post.
- [ ] Each card writes two comments of different kinds once, and coming back to it does not run again.
- [ ] Copy ticks the person in Engage this week and adds to the comment log; the third comment on one person that week shows the warning.
- [ ] Skip and Next post work, and the finished state shows after the last post.
- [ ] The 31st run of the day shows the cap line and leaves the copied drafts usable.
- [ ] Leo's drafts read in his voice when a voice profile is saved; another account's request with `voice` gets the old prompt (function test).
- [ ] Others see no `Comment on their posts` button, and `?view=focus` does nothing for them.
- [ ] 390 px and 1440 px checked by eye; build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/engageFeed.test.ts`: `buildFeed` orders bigger, peers, then Following; picks the newest post inside 14 days and labels an older one; moves done people and marked posts to the end; builds stable post keys.
- `src/lib/engage.test.ts`: the week reset clears `posts` with `done`.
- `supabase/functions/engage-assist/logic.test.ts`: `buildCommentsPrompt` adds the voice line only when the caller is allowed and the voice is not empty, and cuts it at 600 characters.

## Open questions

- Should the user be able to add anyone to the list (Hypefury's watched users) without paying Apify to track them? Today the list is the Creators file plus Following's 5 accounts. Leo decides.
- LinkedIn has most of the advisers' peers, and neither data source covers LinkedIn posts. A LinkedIn source would mean a new scraper, which is a paid vendor and Leo's call.

## Related

publish-inbox, find-creators, find-competitor-posts, brand-voice-memory, learn-warm-leads, trust-compliance-check
