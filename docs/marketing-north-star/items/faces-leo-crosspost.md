# Every founder reel also goes to LinkedIn and YouTube Shorts

Status: todo

All apps, owned by Leo + Claude, phase 3 (Leo on camera).

## Why

Oren John (1:00:41 to 1:01:26): "putting it on YouTube Shorts, putting on LinkedIn, putting it on X is worth the time. It's only a couple minutes to post across all of these because it compounds over time. Even if it does really mediocre to start, it begins to really add up." At 0:47:03 he calls LinkedIn "a team sport" that works for B2B and lead businesses.

District leaders and the advisers who buy ActivityTracker and Advisor OS read LinkedIn at work, and both apps sell to businesses. The same reel reaches them there for the cost of a seat.

## What we have today

Checked 26 Oct 2026.

- Zernio (memory `zernio-live-1017`) has two accounts connected through Content Studio: ActivityTracker's TikTok and Radiant VEP's Instagram. Its pricing, as recorded 10 to 20 Oct: two accounts free, accounts 3 to 10 at US$6 a month each, and a card on file before the third.
- Content Studio's `/accounts` page already offers Connect LinkedIn and Connect YouTube (`src/lib/socialConnect.ts`; platform names in `supabase/functions/social/automations.ts`). Connecting needs no app work.
- An account connected in Zernio's own dashboard lands in Zernio's Default profile and Content Studio hides it, so connections must start in Content Studio.
- The board publisher (`~/Documents/moneybees-reels/tools/publish_ig.py`) cross-posts only to TikTok: a `TIKTOK` map of brand to Zernio account, `post_tiktok()`, and `cross_post()`, which runs once after Instagram is live and never undoes the Instagram post. Zernio's `dryRun` works for TikTok only; Instagram dry runs use `/tools/validate/post` and `/tools/validate/media`.
- Brand `leo` has no Instagram route yet (faces-leo-weekly), so today every founder reel is posted by hand.

The card's ours line ("Zernio posts to Instagram and TikTok") is wrong for Leo's reels. Zernio posts nothing for @leotan_js today, and its two connected accounts belong to other brands.

## What to do

1. Leo: decide the seats (`MK_DECISIONS` crosspost-seats; recommended after four Tuesdays of filming). It is two accounts at about US$6 a month each, plus a card on file in Zernio if none is there.
2. Leo: in Content Studio, switch to the Leo profile, open `/accounts`, and connect LinkedIn (his personal profile, not a company page) and YouTube (his channel; make one first if there is none). Shorts need no separate setup.
3. Claude: in `publish_ig.py`, add `LINKEDIN` and `YOUTUBE` maps beside `TIKTOK`, plus `post_linkedin()` and `post_youtube()`. Each sends the same 1080p copy through Zernio's `/posts` and runs through `cross_post()` after Instagram, as TikTok does. Read Zernio's docs for each platform's fields first. YouTube needs a title (the caption's first line, cut at 100 characters). LinkedIn takes up to 3,000 characters of text.
4. Claude: captions. For LinkedIn, drop the hashtag block and any "comment WORD" call to action, which nothing runs there. For YouTube, the title is the hook line. A language model does the rewrite.
5. Whether a reel goes to LinkedIn at all is a decision, so Jev answers "would a district leader find this useful for their team?" over the caption, with the keyword rule "format C skips LinkedIn" as the fallback when Jev times out. Below 0.5 the reel skips LinkedIn and the card says so. YouTube takes every reel.
6. Claude: dry-run each new platform on one approved card (`publish_ig.py --card <id> --dry`, using Zernio's validate endpoints since `dryRun` is TikTok only), then let the next real slot post.
7. Claude: record each permalink on the board card (`linkedin` and `youtube` fields, shaped like `tiktok`), and add a views column per platform to the monthly format table once Zernio returns analytics for them.

## Done when

- LinkedIn and YouTube show under the Leo profile in Content Studio's `/accounts`.
- Two founder reels in a row go to Instagram, then LinkedIn (unless Jev skipped it) and YouTube Shorts with nobody posting by hand, and each permalink is on its card.
- A LinkedIn or YouTube failure leaves the Instagram post untouched and shows on the card.
- The card's status and ours line in `marketingNorthStar.ts` name the connected platforms.

## Open questions

- Two more Zernio seats at about US$6 a month each? Recommended: yes, after four Tuesdays of filming, so the seats pay for reels that exist.
