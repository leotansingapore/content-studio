# A countdown to your launch

`plan-launch-countdown` | plan | phase 5 | status: missing | /north-star#plan-launch-countdown

## Leo asked

No direct ask. From the weekly Starter Story research Leo set on 1 Nov 2026 ("reverse engineer how the apps do their marketing, improve the capabilities of our app.postmosis"). Jev (jev-1.13.0) scored it 0.59 on whether it would help a solo professional win clients from their posts within 60 days, with 0.35 overlap with what Postmosis already does.

## How the best do it

- Brainrot (Starter Story, youtu.be/hnxn16HtLIk) is an iPhone screen time app its founder says makes about $400K a month. Before the app existed he told his own story on Instagram and had 100K to 150K followers by launch (2:09, 4:16).
- He kept the build in suspense, "I'm building an app, sign up for the waitlist", and says the launch to that list made about $10K on its first day (4:16).
- On 2 Nov 2026 his Instagram, @yoniman.mp4, had 188K followers and its bio named the app.

A coach opening a workshop, an adviser opening a seminar or a consultant starting a new service has the same launch, smaller.

## What we have today

- Plan a campaign (plan-campaign, Leo's sign-ins only) is a five-step wizard that writes up to 28 posts over four weeks from angles at an even pace (src/lib/campaigns.ts, src/lib/campaignJob.ts). It has no launch date and no order between the posts.
- Link in bio has no sign-up form yet (publish-link-in-bio, step 2).
- Write's idea sources have no launch.

## Build

1. A Launch option on /campaigns/new, beside the angle-based plan.
2. It asks three things: the offer (a workshop, a new service, a book, an intake), the launch date, and the sign-up link.
3. The writer drafts five to seven posts over two or three weeks, in order: why you are making it, the problem it fixes, a first look, a reminder that the list hears first, and launch day.
4. Every post ends in the same tagged link, and each lands on the calendar on its own day, counting back from the launch date.
5. It uses the campaign writer's call and caps. Every post runs the compliance check, and an adviser's launch never names a product.

## Done when

- A user can enter an offer, a date and a link and get the series on the calendar in order, ending on the launch date.
- Every post carries the same tagged link.

## Tests

- The series' dates count back from the launch date and never fall after it.
- Every post in the series carries the link.

## Open questions

- Open it to every customer at once, or to Leo's sign-ins first like the rest of campaigns? Recommended: Leo's sign-ins first, since campaigns are Leo-only today.

## Related

- plan-campaign, publish-link-in-bio, publish-calendar.
