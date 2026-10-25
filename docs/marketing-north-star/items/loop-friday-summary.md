# Every Friday, one message: wins, next week, blockers, numbers

Status: todo

All apps, owned by Claude, phase 2 (The loop can see).

## Why

Oren John (2:42:16 to 2:43:47) tells every marketer to "communicate up on a weekly basis": the wins first, then "what I have going in the next week", then the blockers ("things that I can't do because I'm waiting on somebody... or a budget I need a decision on"), and "below that, I'd put whatever reporting you can". His own scheduled agent (0:36:21) reads the ad account "every Friday" and sends the team a diagnosis.

Here the reader is Leo. The loop runs on Monday picks, daily reviews and a Thursday call, and the Friday message is where he sees whether the week moved the pilot's number (cost per booked career call) and which decisions are waiting on him.

## What we have today

Checked 26 Oct 2026.

- `~/.local/bin/moneybees-ads-report.py` (launchd `com.leo.moneybees-ads-report`, Mon, Thu and Sun at 10:00) posts spend, leads and cost per lead per campaign, this week against last, to a Telegram group. It works at campaign level, not ad set. The 25 Oct run died on a DNS error after "Fetching this week's data", so that Sunday's report never went out.
- Other weekly jobs report one area each: `posthog-weekly.py` (Mon 09:00, Lark), `ceo-weekly-digest.py` (Sun 18:00), `co-apps-weekly-digest.sh` (Fri 17:00, email). None reads the marketing loop.
- The two sources this message needs do not exist yet. loop-monday-readback is marked started, but there is no read-back script in `~/.local/bin` and no plist in `~/Library/LaunchAgents`. loop-roster (the Lark Base) is todo.
- Card statuses and open decisions live in `src/data/marketingNorthStar.ts` (`MK_ITEMS`, `MK_DECISIONS`). The repo is public, so a job can read the file from GitHub's raw URL without a checkout.
- `~/.local/bin/team-posts` has the Telegram pattern to copy: `dm()` reads `TELEGRAM_BOT_TOKEN` from `~/.claude/channels/telegram/.env`, sends to Leo's chat with curl, and retries once on a DNS or connect failure.
- `~/.local/bin/automation-health.py` watches jobs through a `JOBS` map of last-ok stamps. `weekly-catchup.sh` only catches up Monday slots, so it will not rescue a missed Friday.

The card's ours line is right, but it should also say that the read-back and the roster it reads from are not built.

## What to do

1. Claude: do not schedule this job until loop-monday-readback writes its weekly file and the loop-roster base exists. Build and test against fixtures before then.
2. Claude: agree one file the read-back leaves behind each Monday. If the read-back spec names a path, use it; if not, use `~/.local/share/marketing-loop/readback-<ISO week>.json` and add the same path to its spec. It holds the promoted, killed and test-next posts, booked calls per creator link, and spend and leads per ad set.
3. Claude: write `~/.local/bin/marketing-friday` in python3 with the standard library only, like team-posts. It reads four sources, all read only:
   - the read-back file for the week;
   - the roster base through `lark-cli` (approved submissions this week per creator against the 8-a-month quota, payouts due this month, submissions waiting more than 24 hours);
   - `marketingNorthStar.ts` from GitHub raw (counts of done, started and todo, the first three cards not done, and every `MK_DECISIONS` entry without a `decided` field);
   - Meta insights at ad set level for the pilot campaign, with the token and request code moneybees-ads-report already uses.
4. Claude: the message is plain text, one Telegram message, under 1,500 characters, in this shape (the numbers below are invented for the layout):

   ```
   Marketing, week 45 (2 to 8 Nov)

   Wins
   - @creator: "First month nobody told me about", 6.2x her usual views, 4 career comments
   - 3 briefings booked through creator links (last week 1)

   Next week
   - <first card not done>
   - <second card not done>
   - <third card not done>

   Waiting on you
   - Bonus per booked career call? Recommended: half of today's cost per booked call
   - @creator2 is 3 videos behind quota
   - 2 submissions waiting over 24 hours

   Numbers
   Ad spend SGD 640 of the SGD 3,000 cap. Cost per lead SGD 21 (last week 25).
   Booked briefings 5: ads 2, creator links 3. Cost per booked briefing SGD 128.
   Cards 4 done, 6 started, 39 todo. Approved videos this month 11 of 40.
   ```

5. Claude: every line is a number, a sort by a number or an item copied from the data, so no language model and no Jev call is needed here. When a source is missing, print one line saying which ("Read-back did not run this week") and send the rest.
6. Claude: `--dry` prints the message and sends nothing. Add a self-check that builds the message from a fixture folder and asserts the four headings, the character limit and the missing-source line.
7. Claude: add `~/Library/LaunchAgents/com.leo.marketing-friday.plist` with two slots, Friday 16:00 and Saturday 10:00. The Saturday run exits at once when `~/.local/state/marketing-friday/last-ok` is from this week, which covers a Mac that slept through Friday. Write last-ok only after Telegram answers ok. Add `marketing-friday` to the `JOBS` map in `automation-health.py` with `timedelta(days=8)`.
8. Leo: read the first two Fridays and say what to cut. Change the message, not the sources.

## Done when

- Two Fridays in a row Leo gets one Telegram message with the four headings, sent by the job and not by a session.
- The message's ad spend matches Ads Manager for the same dates to the dollar.
- With the read-back file moved away, `marketing-friday --dry` prints the missing-source line and the other three sections.
- automation-health lists the job and turns red when last-ok is older than 8 days.
- The card's `status` and `ours` line are updated in `marketingNorthStar.ts`.

## Open questions

- Telegram or Lark? Recommended: a Telegram DM to Leo, as the card says, because the Monday read-back goes there too and the Lark groups are the team's.
- Friday 16:00? Recommended: yes, an hour before the CO apps digest so the two do not land together.
