# It knows your budget

`agent-budget` | agent | phase 6 | status: partial | /north-star#agent-budget

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's agent checks the balance before it drafts anything paid (notes-4.md 2.6, notes-3.md F12). Right after a video was made, Leo asked "i see, can you create another one" (22:32). Senna answered after "1 step | 25.3s":

"A second 15-second UGC video did not get drafted because it needs 210 credits and you have 142." / "A 10-second version is 140 credits, or you can buy credits in [Plan and spend]."

So it refused before drafting a card, named the price and the balance, offered a cheaper version that fits (shorter; 210 for 15 s and 140 for 10 s works out to 14 credits a second, inferred) and linked to where you buy more. "Plan and spend" is a bordered link chip inside the sentence.

![Fastlane 4:23](../../../public/north-star/fastlane/t263.webp)

The same rule shows across the app. Home's CREDITS panel reads "142 of 500" with a fuel bar, "About 4 days left at last week's spend" and "Refills 28 Oct" (notes-4.md 2.10). A campaign card says "28 posts, 945 credits. Your 142 credits cover 24 of them. The other 4 wait for credits." with "Buy credits" (t291). The sidebar carries a second meter for the agent itself, "Senna's fuel used 2%", "Resets 28 Oct", separate from credits (what it measures is unverified, notes-4.md 2.19).

![Fastlane 4:51](../../../public/north-star/fastlane/t291.webp)

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

Others:

- Kapwing's Kai shows a credit estimate with its storyboard, and you can ask it for a cheaper plan; credits are spent even if you dislike the result, and failed jobs are refunded. [help](https://www.kapwing.com/help/ai-video-generator), [faq](https://www.kapwing.com/help/kapwing-faq/)
- InVideo shows the credits each chat exchange used, a "Project Usage" total, and a credit limit you can set per project. [help](https://help.invideo.io/en/articles/14718313-how-credits-are-charged-when-using-ai-agents)
- OpusClip quotes each agent edit before approval and releases reserved credits when a generation fails. [faq](https://help.opus.pro/agent-opus/article/ao-faq.md)
- Kalodata's Kalopilot prices by depth: a simple question about 10 points or fewer, a standard analysis 10 to 50, a complex report 50 or more. [press](https://netshop.impress.co.jp/r/prtimes/items/000000016.000167462)
- Descript's Underlord charges per prompt plus each tool it runs, and the cost "varies between runs"; it shows under "Underlord" in the Usage tab. [help](https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript)
- Revid.ai shows an estimated cost before every render. [pricing](https://revid.ai/pricing)

## What we have today

- No credits, plans or balance (current-app.md section 7). The budget is a set of daily caps per person in `supabase/functions/_shared/usageCaps.ts` (`DAILY_LIMITS`, counted in `cs_ai_usage`, reset at 8am Singapore time), plus caps across everyone on `GLOBAL_COUNTER_USER` that protect the prepaid Higgsfield and ElevenLabs pools.
- The pages check before paid buttons: `useUsesLeft` and `usesLeft` in `src/lib/aiUsage.ts` read today's counts, and AiVideo shows "<what>: <n> left today" or "none left today" (`src/components/AiVideo.tsx`) with the price in Higgsfield credits and US$ (`CREDIT_USD` 0.0625).
- The server is the last word and fails closed: a used-up cap answers 429 "You've used all <n> for today. It resets at 8am Singapore time." (`usageRefusal`), and a used-up studio cap answers "Today's AI videos for the whole studio are used up. Try again after 8am Singapore time." (`supabase/functions/ai-video/index.ts`). When Higgsfield itself refuses for lack of credits (a 403 there), ai-video answers 502 "AI video credits have run out. Tell your studio admin." Failed paid jobs refund the use through `refundUsage`.
- `GLOBAL_COUNTER_USER` is Leo's own uid 13b28b1d. On that sign-in `readUsage` also returns the studio rows (`ai-video-global` and the rest); on 40f07a18 and every other account they are not readable.
- The assistant checks nothing. When `assistant-act` is over its cap, `proposeAct` swallows the error and the chat answers in words, so the person never learns why the action did not happen.
- Two caps this item reads are specced, not built: `remix-make` 30 (remix-everywhere) and `competitor-read` 20 (find-competitors). Neither is in `DAILY_LIMITS` yet.

## Build

Gate with `leoOnly(email)`. Build with agent-chat and agent-approvals; this item supplies the checks they call.

Money stays as Leo set it: daily caps while the agent is Leo-only, a price on every paid button, and no credits, plans or Stripe until he says so. Here "budget" means today's uses left per cap, with the price beside each paid thing.

Files:

- `src/lib/agentBudget.ts` (new, pure apart from `readUsage`): `NEEDS`, `shortOf`, `cheaperFor`, `refusal`, `budgetAnswer`, `meterLine`.
- `src/lib/agentRun.ts` (agent-chat): check before writing anything for a paid plan.
- `src/lib/agentCards.ts` (agent-approvals): `approve` asks `shortOf` and disables Approve with its reason.
- `src/pages/AgentPage.tsx` (agent-chat): the meter under the composer.
- `src/lib/assistantActs.ts`: stop swallowing a 429 for the agent; return it so agent-chat can show the cap line.

### What each plan needs

`NEEDS` in `src/lib/agentBudget.ts`, one row per plan the agent can run. Prices come from the existing constants, never typed twice: `avatarCredits` and `creditsUsd` for talking videos, `explainerCredits` for explainers, `clipCredits` for clips.

| Plan | Uses it needs today | Price shown |
| --- | --- | --- |
| post, carousel, script | `remix-make` 1 | "About 1 to 2 US cents" (unverified, from remix-any-format) |
| speaking (talking video) | `remix-make` 1, `ai-voice` 1, `ai-video` 1, plus `ai-image` 1 when it makes an AI presenter because no face is saved | "Up to US$5.50" (88 credits) before the script, then agent-approvals' estimate from the script |
| explainer | `remix-make` 1, `ai-voice` 1, `ai-video` 1 | "About US$0.05" |
| image | `ai-image` 1 | "About US$0.01" |
| competitor | `competitor-read` 1 (find-competitors) | none |
| agent turn | `agent-act` 1 (agent-chat) | none |

### Screens and states

Before a paid plan, in this order:

1. `aiBusy()` is true for a video plan: "Another video is being made. Ask again when it's done." `imageBusy()` is true for a picture plan: "Another picture is being made. Ask again when it's done." Each comes with "Open" to the thread that is making it. Nothing is written.
2. `shortOf(needs, usage)` lists any cap with fewer uses left than the plan needs. On Leo's 13b28b1d sign-in it also checks `ai-video-global` against its limit, since that row is readable there. When the list is empty, or today's counts can't be read (`readUsage` returned null), the plan goes ahead and the server decides.
3. When something is short, nothing is written and no `remix-make` is spent on a script that can't be voiced. The agent replies with `refusal(plan, short, cheaper)`:

```
Agent   22:32 | 1 step | 1.4s
A talking video needs 1 AI video, and you have none left today. They come back at 8am Singapore time.
A picture post is about US$0.01 (4 of 5 pictures left), or a script you film yourself is about 1 to 2 US cents.
[Make the picture post]  [Write the script]
```

The cheaper ladder, `cheaperFor(plan, usage)`, takes the first options that fit, two at most:

| Asked for | Offered, in order |
| --- | --- |
| speaking or explainer | image (if `ai-image` left), script (if `remix-make` left), then "Write it in Write" |
| image | carousel (drawn on the device, no picture), then post |
| post, carousel, script (`remix-make` used up) | "Write it in Write" (`/generate` with the topic as `detail` and Write's format: post as `text-post`, carousel as `carousel`, script as `short-video`). Write's writer is hosted outside this repo and has no cap in `usageCaps.ts` |
| competitor (`competitor-read` used up) | "Paste their profile link instead" (links need no server call in find-competitors) |

Each offer is a chip that sends the cheaper request as a new message in the thread, so it runs through the same checks. "Write it in Write" is a link chip built with `links.generate({ detail, format })`.

4. On Approve (agent-approvals), the same check runs again, since a card can wait for hours. When short, Approve is disabled with "No AI videos left today. Back at 8am Singapore time." (or "No voiceovers left today...", "No AI pictures left today..."), and the cheaper chips show under the card.
5. The server still decides. A 429 from any function becomes the agent's line, word for word, followed by the cheaper chips. The studio message ("Today's AI videos for the whole studio are used up...") and the 502 "AI video credits have run out. Tell your studio admin." get the same chips.

"How many videos do I have left?" (the `budget` act) gets a fixed answer, no LLM:

```
Left today: 2 of 2 AI videos, 10 of 10 voiceovers, 5 of 5 AI pictures, 28 of 30 remixes, 97 of 100 agent messages. They come back at 8am Singapore time.
A talking video is up to US$5.50, an explainer about US$0.05 and a picture about US$0.01. Posts, carousels and scripts are about 1 to 2 US cents each.
```

If today's counts can't be read: "I can't read today's limits right now. Paid makes still check them before they run."

The agent meter (Fastlane's fuel) sits under the composer on `/agent` and in the dock's footer: "<n> of 100 agent messages left today". At 10 or fewer it uses the warning colour. At 0 it reads "Agent actions are used up until 8am Singapore time. Questions still get answers." and the composer stays usable for questions (agent-chat's cap state).

### Copy

- Refusal: "<A thing> needs <needs>, and you have <left> today. They come back at 8am Singapore time." with "<a thing>" from "A talking video", "An explainer video", "A picture", "A remix", "A competitor look-up"; "<needs>" and "<left>" from the unit words "AI video(s)", "voiceover(s)", "AI picture(s)", "remix(es)", "competitor look-up(s)" and "none".
- Offer line: "<Option> is <price> (<n> of <m> <unit> left), or <option> <price>." Option names: "A picture post", "A script you film yourself", "A carousel", "A text post".
- Chips: "Make the picture post", "Write the script", "Make a carousel instead", "Make a text post instead", "Write it in Write", "Paste their profile link instead"
- Busy: "Another video is being made. Ask again when it's done.", "Another picture is being made. Ask again when it's done.", "Open"
- Approve blocked: "No AI videos left today. Back at 8am Singapore time.", "No voiceovers left today. Back at 8am Singapore time.", "No AI pictures left today. Back at 8am Singapore time."
- Budget answer and unreadable line: as in the blocks above, exact.
- Meter: "<n> of 100 agent messages left today", "Agent actions are used up until 8am Singapore time. Questions still get answers."

### Data

Nothing stored. `shortOf` reads today's counts through `readUsage()` (the person's own `cs_ai_usage` rows under RLS) and `DAILY_LIMITS`. The across-everyone counters sit on `GLOBAL_COUNTER_USER`, which is Leo's 13b28b1d account, so they are readable on that sign-in only. Everywhere else the studio cap and the prepaid Higgsfield balance are only known from the server's 429 or 502.

### AI and cost

- One Jev criterion in agent mode, on the turn's existing `agent-act` call: `budget`: "Ask how many AI videos, pictures, voiceovers or other AI uses they have left today, or what something costs to make." Threshold ACT_MIN 0.6 as the other acts.
- Everything else is arithmetic on counts and the existing price constants. No LLM, no new cap and no new paid provider.
- Cost: nothing beyond the Jev call the turn already makes. A refusal saves money, because it stops before the `remix-make` call.

### Deep links

- "Write it in Write": `/generate?detail=<topic>&format=<format>` (existing params).
- "Open" on the busy line: `/agent/<threadId>?m=<msgId>` (agent-chat).
- No new view, so no new rows in `docs/deep-links.md`.

## Done when

- [ ] With `ai-video` used up for the day (2 of 2), "make a video of me explaining CPF LIFE" refuses with the exact line and two chips, and the network panel shows no remix or ai-video call.
- [ ] "Make the picture post" from that refusal runs as a new message and lands at a picture card with "About US$0.01".
- [ ] A card proposed while a video was left, then approved after the cap was used elsewhere, shows Approve disabled with its reason.
- [ ] A stubbed 429 studio reply and a stubbed 502 "AI video credits have run out..." from ai-video each show the server's line word for word plus the cheaper chips.
- [ ] "Write it in Write" from a refused script opens `/generate?detail=<topic>&format=short-video` with the format chip set.
- [ ] "how many videos can I make today" answers with today's real counts, and "I can't read today's limits right now..." when the read fails.
- [ ] The meter counts down per message, turns to the warning colour at 10 and shows the used-up line at 0.
- [ ] Everyone else's dock behaves as before, including answering in words when `assistant-act` is over its cap.
- [ ] Build and the full vitest pass; checked at 390 px and 1440 px; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/agentBudget.test.ts`:
  - `shortOf`: speaking with `ai-video` used 2 of 2 is short of `ai-video`; with `ai-voice` used 10 of 10 it is short of `ai-voice`; with no saved face and `ai-image` used 5 of 5 it is short of `ai-image`, and with a saved face it is not; `ai-video-global` at 20 is short only when that row is present; null usage gives an empty list; yesterday's counts read as zero.
  - `cheaperFor`: the ladder order for each row, skipping options whose own cap is used up, and never more than two.
  - `refusal`: the exact sentence for one short cap, unit words singular and plural, and the offer line with uses left.
  - `budgetAnswer`: the exact two lines from a sample usage.
  - `meterLine`: 97, 10 (warning) and 0 (used-up line).
  - Prices come from `avatarCredits`, `explainerCredits` and `creditsUsd`: 88 credits gives "Up to US$5.50".
- `src/lib/assistantActs.test.ts`: in agent mode a 429 is returned to the caller; outside it, the old fallback to words is unchanged.
- `supabase/functions/assistant-act/logic.test.ts`: `budget` appears only in agent mode.
- Break each case once to see it fail.

## Open questions

- Fastlane offers a shorter, cheaper video when the balance is short. With caps that count uses, a shorter video costs the same one use, so this spec offers other formats instead. A money limit per run or per day (agent-autonomy) would bring the shorter offer back. Leo decides whether he wants one.
- Reading the prepaid Higgsfield pool's real balance would let the agent warn before the pool runs dry. Whether the API exposes a balance to the edge function is unverified.
- When credits and plans arrive (business-credits), `shortOf` reads the balance instead of the caps; the refusal wording already names a price and what is left.

## Related

agent-chat, agent-approvals, agent-autonomy, agent-activity, business-cost-preview, business-credits, business-plans, remix-any-format, find-competitors, plan-campaign-page
