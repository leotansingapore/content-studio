# A 30-day posting camp sends a prompt a day for each profession

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 3 (Reach that compounds).

## Why

Buffer runs Creator Camp in its Discord: a 30-day programme with daily prompts, and sprint challenges of 1 to 2 weeks between camps (buffer.com/our-community). Its template library is written for those sprints (buffer.com/templates). Both are in research/teardown.md, move 9.

The camp keeps people posting long enough to want help with the making. Here, day 30's prompt is the walkthrough invite.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the live sitemap.

- Each of the six /for pages carries an example week, Monday to Friday; the real estate page heads it "Your week of posts, day by day" (src/content/audiences.ts).
- The vault holds idea pages among the 33 playbooks in the live sitemap: content-ideas, linkedin-post-ideas, tiktok-video-ideas and tiktok-slideshow-ideas.
- No camp, group or prompt list exists.

## What to do

1. Stop and ask Leo the card's question (dec-pm-camp): which free group app hosts it, WhatsApp or Telegram. Recommended: Telegram. A group is a third party and public to its members.
2. Claude writes 30 prompts for each profession in the first camp, in ~/Documents/Postmosis/copy/posting-camp/prompts-<profession>.md, from that /for page's example week and the vault idea pages. One post a day that takes under 20 minutes, Fridays as share days, and day 30 the walkthrough invite with ref=camp (pm-mk-booking-source). Gates: the brief first, aicheck under 15, brief-check. Leo reads week one and day 30.
3. Leo opens the group and writes the welcome and the rules: one post a day, share on Fridays, no selling to each other. He invites people from his own audience himself. Posting in public and messaging people need his go, so ask before the first invite.
4. Leo posts each day's prompt at 09:00 SGT, or a scheduled job does if he asks. A job posts only the prompt in the group and never messages a member.
5. Run one camp of up to 20 people. Count who joined, who posted on at least 10 days, and walkthroughs booked with ref=camp.
6. Claude writes a one-page review: what got posted, where people dropped off, and whether a second camp runs.

## Done when

- 30 prompts exist for each profession in the first camp.
- One camp has run its 30 days, with joined, active and booked counted.
- The review says whether a second camp runs, with Leo's call on it.

## Open questions

Run the camp in a free WhatsApp or Telegram group? This is dec-pm-camp; the recommendation is Telegram, because a bot can post the prompt without a personal number and members can keep their numbers hidden.
