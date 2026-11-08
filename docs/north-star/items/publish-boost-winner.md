# Boost the winner: an ad drafted from your best post

`publish-boost-winner` | publish | phase 7 | status: missing | /north-star#publish-boost-winner

## Leo asked

No direct ask. From the weekly Starter Story research Leo set on 1 Nov 2026 ("reverse engineer how the apps do their marketing, improve the capabilities of our app.postmosis"). Jev (jev-1.13.0) scored it 0.59 on whether it would help a solo professional win clients from their posts within 60 days, with 0.13 overlap with what Postmosis already does.

## How the best do it

- Canary (Starter Story, youtu.be/KgS3hbpxTzE) is a language app taught through songs. Its founder says it made about $25K last month, about nine months after launch (0:00).
- He picked Instagram and TikTok, doubled down on Reels, and grows on one loop: post a lot, find the post that wins organically, make variations, boost the winner on Meta while testing the creative, the audience and the caption, kill the losing ads, read the numbers and repeat (7:12).

A solo professional with a post that already beat their usual has the cheapest ad they will ever get. What they lack is the variations and someone to say which to stop.

## What we have today

- A post at twice your usual gets a Winner found card on Analytics, whose tap makes three versions (src/components/analytics/WinnerCard.tsx, src/lib/winners.ts).
- publish-breakout-push plans free moves for a winner: another network, the link in bio, a repost.
- Nothing drafts an ad from a winner, and nothing asks what a boost cost or which version to stop.

## Build

1. Winner found gets a Boost it option, on a tap only.
2. It drafts the ad from the winning post: three captions and two audiences described in plain words, with a daily budget the user types and a stop date.
3. The drafts are copied out for Meta's Boost button or Ads Manager. Postmosis never spends money or connects an ad account.
4. Seven days later a card asks for each version's spend and messages or clicks, then names the versions to stop and the one to keep, by cost per message.
5. The drafts use the remix writing call and its caps. Every caption runs the compliance check.

## Done when

- A winner can produce three captions and two audiences with the user's budget and stop date.
- The seven-day card takes typed numbers and names the versions to stop.

## Tests

- Boost it never appears on a post that is not a winner.
- The stop and keep advice uses cost per message, and asks again when a version has no spend typed.

## Open questions

- Copy out only, or connect Meta's API later to read the spend? Recommended: copy out only, since connecting an ad account is a permission change and the typed numbers are enough to say which version to stop.

## Related

- remix-own-winners, publish-breakout-push, learn-real-numbers.
