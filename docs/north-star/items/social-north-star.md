# Social north star

`social-north-star` | plan | phase 5 | status: partial (built 1 Nov 2026, Leo's sign-ins; live check pending) | /north-star#social-north-star

## Leo asked

1 Nov 2026:

- "do try to dogfood the competitor search. e.g assume I didn't give any references, how would the function search for competitors on its own"
- "somehow, we managed to do so on the /seo-north-star." / "think we also have an activity-tracker.io/seo-north-star"
- "then every app there is somehow our competitor. But we wanna focus on the social media distribution part."
- "so in a way, build a social media north-star of posts that we wanna model after"
- "based off competitors, then just reverse engineer" / "how our postmosis app can be easy to usee"

The model is activity-tracker.io/seo-north-star (remix-of-activity-tracker: src/data/seoNorthStar.ts, src/pages/SeoNorthStarPage.tsx, docs/seo-north-star/README.md): the ideal plan, how far we are, what to make next. There the plan comes from a census of eight competitors' sitemaps and the progress from live counts. Here the plan comes from the formats that win among the brand's Apps like yours references, and the progress from the brand's own posts.

## How the best do it

- Vamos follows creators, scores outliers and "maps recurring formats into beats", then drafts your version in your voice. Free follows 20 creators, Pro 70, Business 150 a workspace. [Source](https://docs.getvamos.ai/en/articles/13204779-what-vamos-does), [plans](https://intercom.help/getvamos/en/articles/13004516-plans-credits-and-prices).
- ViralBrain has you pick "hero" creators in your niche and applies their winning patterns in your voice, with a 30-day auto calendar on Premium at EUR 69 a month (Free takes 3 heroes and Pro 10), for LinkedIn alone. [Source](https://www.viralbrain.ai/pricing).
- Sandcastles builds a channel watchlist, surfaces outliers, analyses why each worked, then writes scripts in your persona. [Source](https://help.sandcastles.ai/plans).
- Icon sells UGC ads made from its library of 18 formats. [Source](https://icon.com/formats). ReelFarm sells slideshow formats by plan: 10 on Growth (US$49 a month), 20 on Scale, 200 on Enterprise. [Source](https://reel.farm/).
- Atria's AI teammate turns winning patterns in an ad library into briefs and new ads. [Source](https://www.tryatria.com).
- None of them counts your own posts against the plan. That is the north-star part this item adds.

## What we have today

- Apps like yours (`find-similar-accounts`, /swipe?tab=similar): about 40 Instagram and TikTok accounts like the brand, 30 posts each, outlier-scored, browsed one post at a time.
- The first two real finds for ActivityTracker (1 Nov): 92 accounts judged, 10 kept at 0.45. With no added accounts and no competitor handles there are no seeds, so only TikTok searches run; Build A (`ns/similar-rivals`) adds the rivals step that fixes this cold start.
- Remix (`remix-everywhere`) turns one post into ours. Nothing says which post to remix next, or how many of each kind a month.

## Build

A Leo-only page, /social-north-star, in Strategy (`src/lib/nav.ts`), one plan per brand, built by itself from that brand's Apps like yours references.

### Screens and states

```
Social north star (i)
Reading their posts: 12 of 40 accounts so far. The plan builds when they're in.
+------------------------------------------------------------------+
| This month                                         3 of 11 posts |
| [=======-------------------]                                     |
| Next up: Tips carousel                                           |
+------------------------------------------------------------------+
+--------------------------------+ +--------------------------------+
| Faceless slideshow  Next up [link]| | Screen demo               [link] |
| 6 accounts use it, 4.2x usual  | | 3 accounts use it, 3.1x usual  |
| 1 of 4 this month [==----]     | | 0 of 2 this month [------]     |
| [cover][cover][cover]          | | [cover][cover][cover]          |
| @a 6.1x  @b 5x  @c 4.4x        | |                                |
| Hook      5 [things] I stopped | | Hook      ...                  |
| Slides    Cover, five tips, ...| | Scenes    ...                  |
| Length    About 7 slides       | | Length    About 24 seconds     |
| Caption   ...                  | | Caption   ...                  |
| Call to action  Save this      | | Call to action ...             |
| How often About 4 a month ...  | | How often About 2 a month ...  |
| [ Make one like this ]         | | [ Make one like this ]         |
+--------------------------------+ +--------------------------------+
Built 1 Nov from 38 accounts on Apps like yours. It rebuilds weekly, and as more are read.
```

States:

- First paint, before the synced lists are pulled: "Checking your references..." with a spinner, never an empty plan.
- No references yet: the page starts the brand's first Apps like yours find itself, by the same rule as /swipe (`autoFindDue`, and only with finds left today), and says "Finding apps like yours first, about two minutes. The plan builds once their posts are in."
- Reading: "Reading their posts: n of m accounts so far. The plan builds when they're in." The reads are Apps like yours' own weekly round.
- Building: "Sorting their best posts into plays, about a minute..."
- Built with no play (no format used by 2 or more accounts): "None of the formats is used by 2 or more of your references yet." and a link to add accounts on Apps like yours.
- No Instagram or TikTok handle on the brand: the progress box says "Add your Instagram or TikTok under Your account audit in Analytics to count your posts against each play." The plays still show.
- Jev down: the last plays stay, with "Couldn't sort the posts right now. Try again in a few minutes.", a Try again button and its price chip.
- OpenAI down: the plays build without new recipes and say "Couldn't write the recipes right now. They come with the next build."; a play keeps last week's recipe when it had one.

Each play card has one action, Make one like this, which opens Remix over the page with the best example and the recipe as the note (RemixButton, `?remix=`; everyone else's fallback is the /clone?url= or Write link Apps like yours uses). The first play still short of its target is Next up: its button is the page's one filled button.

### Copy

- Heading "Social north star", tip "The formats that win for accounts like yours, rebuilt weekly from Apps like yours."
- "This month", "{done} of {target} posts", "Next up: {play}"
- Card: "{n} accounts use it, {x}x their usual", "{done} of {target} this month", rows Hook, Slides or Scenes, Length, Caption, Call to action, How often ("About {target} a month at the accounts that use it"), "The rest of the recipe comes with the next build.", button "Make one like this"
- Example tile: plays in place as Apps like yours' cards do (VideoEmbed, the cover behind its play button, the tile taking the whole row while it plays), "@handle", "{x}x usual" and a small link that opens the post
- Footer "Built {date} from {n} accounts on Apps like yours. It rebuilds weekly, and as more are read."

### Data

The references stay in the Apps like yours store (`content-studio-similar-<scoped>`), and the plan's own synced key, `content-studio-social-ns-<scoped>` (`src/lib/socialNorthStar.ts`), holds only the labels, the plays and the brand's own recent posts:

```ts
interface SocialNs {
  builtAt: string | null;
  triedAt: string | null; // a build tried in the last hour waits
  basis: number; // accounts with posts the last build read
  labels: Record<string, { family: Family; hook: Hook | null }>; // "platform:post id", only for posts the last build sent
  plays: Play[]; // id, accounts, posts, median, perWeek, target, hook, seconds, slides, 3 examples, recipe
  own: OwnAccount[]; // the brand's own posts of the last 30 days, caption cut to 150
}
```

12 plays of 3 examples, 210 labels and 60 own posts measure 84 KB (`socialNorthStar.test.ts`).

Covers: Apps like yours' reads (competitors posts with scope "similar") now carry each post's cover, a video's seconds and a slideshow's slides (`postMedia`, `shapeResult`). They never reach the synced store: cover links expire within days and would triple the 448 KB key. This device keeps them in `cs-similar-media-<scoped>` (outside the synced prefix) for each account's 8 best posts, the ones a build sends. Another device labels from the words until its next weekly read.

### AI and cost

The build is a new function, `supabase/functions/social-plays/` (JWT on, Leo only through NORTH_STAR_USERS), body `{ posts, own }`:

1. The app sends each reference account's best posts (scored at or above its usual, 8 at most), the best 150 of those across accounts by outlier score, and the brand's own posts of the last 30 days, each with its cover when this device has it and its label when an earlier build gave one.
2. Caps `social-plays` (10 a day) and `social-plays-global` (30) on `GLOBAL_COUNTER_USER`.
3. Jev (`jev-1.13.0`), one call a post not labelled before, two Choice questions: the format family (faceless slideshow, talking head, day in the life, screen demo, tips carousel, meme or reaction, before and after, founder story, product showcase, other; under 0.4 is other) and the hook shape (label.py's seven, word for word). The cover goes with it when it opens as a JPEG or PNG Jev takes (280 to 1568 px a side, header `TypeSafe-Danger-Zone-Images: true`); WebP, HEIC, a 1080x1920 reel cover or a dead link go as words alone, and a picture Jev refuses is asked again on the words. Every label is logged (post, cover or words, family, hook) so the first build sets the cut.
4. A play is a family with 3 or more examples from 2 or more accounts, ranked by median "x their usual" (`groupPlays`, run by the app on the same posts).
5. One OpenAI call (`OPENAI_MODEL`) writes each play's recipe from its 5 best examples: the hook as a fill-in template, the scenes or slides, the caption pattern and the call to action. It decides nothing; length and how often are counted from the posts themselves.
6. Jev answered none: both uses go back, 502. OpenAI failed: the labels are kept with a note. A build that asked Jev nothing and wrote nothing goes back.

The brand's own posts are read through competitors posts with scope "similar" (30 the first time, the newest 10 weekly), inside Apps like yours' US$40 a month.

Targets: for each account that uses a play, its labelled posts of that family per week its stored posts span; the play's pace is their median, and the month's target is 4 weeks of it, at least 1. Progress counts the brand's own posts of the last 30 days in that family, each play up to its target.

Prices (`_shared/prices.ts`):

- `social-plays` up to US$0.05: 210 posts at about 4,600 input tokens a cover (real requests, measured 26 Oct, memory jev-images-api) plus about 600 for the words and questions, at US$0.042 per million (docs.typesafe.ai), 1.09M tokens, US$0.046; one gpt-6-luna recipe call of about 4,000 in and 1,500 out at US$0.10 and US$0.50 per million (OpenAI pricing page, read 21 Oct), US$0.0012. A weekly rebuild labels only the new posts, and how many covers Jev can take stays unverified until the first build.
- The brand's own reads: `similar-posts`, up to US$0.123 each (find-similar-accounts.md).

### Deep links

- `/social-north-star#<play id>` scrolls to a play (ids are the family ids, never renamed), with Copy link on each card.
- `?example=<platform>:<post id>` marks one example and scrolls to it; one no longer in the plan is dropped with "That example is no longer here".
- `links.socialNorthStar({ play, example })`; rows in `docs/deep-links.md`.

## Done when

- [ ] On ActivityTracker, the plan builds by itself after the references are read, with plays a person would call right for its references (read the logged labels and set FAMILY_MIN).
- [ ] Each play's examples open the posts, and Make one like this opens Remix with the best example and the recipe.
- [ ] With ActivityTracker's handle on the brand, its own posts of the last 30 days count toward the right plays.
- [ ] A brand with no references starts its find from this page and builds when the reads end.
- [ ] Checked at 390 px and 1440 px; build and the related tests pass; the north-star item flipped.

## Tests

- `social-plays/logic.test.ts`: the request from 20 real Apps like yours posts (`fixtures/apps-like-yours.json`), Jev's questions with and without a cover, label.py's hook list, the answers' cuts, JPEG and PNG sizes and Jev's limits, play grouping and ranking, and recipe parsing.
- `social-plays/index.test.ts`: the gate, one label a new post, the cover sent only when Jev can take it, a refused picture asked again on the words, refunds when Jev or both providers answer nothing, and the across-everyone cap.
- `src/lib/socialNorthStar.test.ts`: what a build sends from the fixture, plays with pace and target, progress maths, when a build is due, the first find, the build and its failure, the brand's own reads and the key size.
- `src/lib/similarAccounts.test.ts`: covers stay off the synced store and on this device for the best posts. `src/pages/SocialNorthStarPage.test.tsx`: the gate, anchors, progress, the marked example, the tile playing in place and the no-handle line. `src/lib/nav.test.ts`: the page in Strategy for Leo only.

## Open questions

- FAMILY_MIN starts at 0.4 for a ten-way choice. Read the first build's logged labels and move it.
- Targets count only each account's best posts, so they are a floor on how often the top accounts post a format. Labelling every post of the top accounts would raise them, at about 1,200 Jev calls a brand.
- Instagram reel covers are often 1080x1920, past Jev's 1568 px, so reels are labelled from their words. Resizing needs an image library in the function, and Supabase's CPU budget runs out fast (slideRender.ts).
- Should the plan go to Leo weekly (Telegram or the Monday email) once it is trusted?

## Related

find-similar-accounts, find-competitor-posts, find-outlier-score, remix-everywhere, remix-patterns, plan-ideas-inbox
