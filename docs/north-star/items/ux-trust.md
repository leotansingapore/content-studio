# Safe to rely on: prices, presses, data and labels

`ux-trust` | ux | phase 9 | status: partial | /north-star#ux-trust

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Trust: Do people feel safe relying on it? (Clear permissions and understandable handling of customer data.)"

Two of the north star's principles already set the floor (`src/data/northStar.ts`, NS_PRINCIPLES): "Show the cost before anything runs" and "Nothing posts without the adviser's yes".

## The bar

An adviser always knows what a press will cost, what will go public, which company gets which of their data, what the AI made, and how to take any of it back.

This card measures that bar across the app. Most of the work already belongs to other cards, named in each row; this card counts the result and adds only what no card owns (the data page, the permission lines and the data download).

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| T1 | Price before every paid press (`business-cost-preview`): share of paid calls that follow a press on a control showing the price; share where the charge equals the shown price | 100% on Leo's sign-ins, and on everyone's once Leo turns prices on; 100% within US$0.01 | 100% for Leo in the dogfood (33 of 33 on 25 Oct); other sign-ins see uses left, not prices; the charge matched the chip after the 26 Oct fix |
| T2 | Nothing goes public without a press (`trust-approval`): posting, sending or replying calls made on page load or by a timer, outside a switch the person turned on and can see | 0 | 0 posting calls in 39 page loads (only status reads); a leader's approval rule is checked in the browser only |
| T3 | Data named in plain words: core pages whose data use (what is read, what is sent, to which company) is one tap away; a privacy notice before sign-up | 13 of 13; yes, once Leo approves its words | 0 of 13; no privacy notice or terms anywhere; OpenAI, TypeSafe and Google never named on screen, ElevenLabs only on the agent's video plan card |
| T4 | AI labels (`people-ai-labels`): posts with an AI-made person or voice that carry the label, in the post's language | 100% | the chips and the caption line exist; the Malay line shipped in code on 27 Oct, Chinese and Tamil still get the English line, and no My posts draft carries the line |
| T5 | Permissions and take-back (`publish-accounts`): connect and disconnect screens that say what the app may do and what stops; a data download from Settings | every screen; 2 presses or fewer | Disconnect works with a confirm that says neither; no download; no account delete |
| T6 | Who did it (`agent-activity`): runs in /activity with the right actor (you, the agent, a switch) | 100% | the agent's makes logged as "You" on 25 Oct (p6 replay D6); fixed in code that day, not re-checked live |

## How the best do it

- Fastlane prices every press ("Each make shows its price before anything runs.", a chip on every tile and inside buttons such as "Remix, 130 credits") and says when the charge lands ("Charged when you save or schedule"); `business-cost-preview.md` has the frames. Its home page keeps one meter ("Credits are the only meter: a static is 5, a 5-second video is 80, any mix") and says "You approve, Senna makes." ([usefastlane.ai](https://usefastlane.ai/)). Its Settings > Activity log gives each action a reason ("Planned in the campaign planner.", `videos/fastlane-2026-10-20-settings/notes.md`, R7), and its Settings lists a "Post labels" page for platform AI labels (`videos/fastlane-2026-10-19/notes-4.md`).
- Buffer names its AI provider and the exact data: "If you use AI Assistant to generate ideas or refine a post, the text you enter into the assistant will be shared with OpenAI. No other information (your account details, media files, or any other part of your post or work in Buffer) is shared." It also says posts "are not automatically generated, changed, or tweaked by the AI" unless you open the assistant ([Buffer AI Assistant](https://buffer.com/ai-assistant)).
- Notion: "By default, neither Notion nor our AI providers use your Customer Data to train any models." Most models it uses keep nothing after the answer; the few that do keep data "30 days or fewer", are off by default, and a subprocessor page lists who they are ([Notion AI security](https://www.notion.com/help/notion-ai-security-practices)).
- Canva offers "a range of granular controls, in simple and clear language", never uses Teams, Business, Enterprise or Education content to improve its AI ([Canva Shield](https://www.canva.com/newsroom/news/safe-ai-canva-shield/)), and lets people "delete or download their data in their Account Settings" ([Canva privacy](https://www.canva.com/trust/privacy/)).
- Meta adds "AI info" labels when it detects industry signals or when people disclose AI content ([Meta, labelling AI content](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/)). Metricool lets a post be marked as AI-generated for Instagram, TikTok Business and YouTube ([Metricool, August 2026](https://metricool.com/product-updates-august-2026/)).
- Mobbin, connected accounts that say what they allow: Dropbox Dash's connected app page shows "Connected on", the developer and a plain list of every permission, with Disconnect under the list and the line "If you don't recognize an app, disconnect it." ([Mobbin, Dropbox Dash](https://mobbin.com/screens/669b28e8-79b8-4417-ba73-59c35b7da51c)). Descript says beside each service what connecting lets it do ("Publish videos directly to your YouTube channel") ([Mobbin, Descript](https://mobbin.com/screens/967d0ff5-0b2b-43f6-8d94-98b684ccb301)). Devin's "Unlink user" asks first and says what stops ("you will no longer be able to use Devin with your Slack account") ([Mobbin, Devin](https://mobbin.com/screens/dbbdf8d7-4f43-466f-9aa2-b0b3eb19658b)). Klaviyo's Settings > Social accounts is a table of account, status and what it is connected to, under a one-line purpose ([Mobbin, Klaviyo](https://mobbin.com/screens/32aa0033-4f4f-4394-9f35-abea3c3442db)). Item 6 below takes these shapes.
- The counter-example: CapCut's terms (last updated 15 Apr 2026) say "We don't own your User Content" and then take "a non-exclusive, royalty-free, transferable, sub-licensable, perpetual and worldwide license to use your User Content" ([CapCut terms](https://www.capcut.com/clause/terms-of-service)). An adviser who reads that once will not upload a client story.
- The law: Singapore's PDPA, section 20, says an organisation "must inform the individual of ... the purposes for the collection, use or disclosure of the personal data ... on or before collecting the personal data" ([PDPA s20](https://sso.agc.gov.sg/Act/PDPA2012?ProvIds=pr20-)).

## What we have today

Checked 27 Oct against origin/main 8664c00d and the dogfood runs of 25 to 27 Oct.

- Prices (T1). One price table (`supabase/functions/_shared/prices.ts`) and `PriceChip` (`src/components/PriceChip.tsx`, imported by 75 files) put "About US$x | n left after this" on every capped button for Leo's sign-ins, and a guard test fails when a capped call has no price (`src/lib/prices.test.ts`); everyone else sees uses left only. In the 25 Oct replay every one of 33 paid calls came after a press on a card that showed its price. On 26 Oct a 15 s video's chip said US$2.77 and the charge was US$3.44 (p7a D1); after the fix the charge equalled the chip (p7a-fix). The winner card's "Under US$0.01" against the sheet's "About US$0.01" for the same 3 makes (p7a D24) was fixed in code on 26 Oct (5d5dc14c) and not re-checked live.
- Public actions (T2). In 39 page loads across the 13 core pages the app called `social` only for `status`; it never scheduled, posted, moved or replied on its own. Things that act without a press, each after a switch: autopilot writes drafts when /plan opens (it never posts; Approve does, `src/lib/autopilotJob.ts`), the agent may move a post when its one switch is on (`src/lib/autonomy.ts`), Auto-DM answers comments (`src/pages/AutoDmPage.tsx`), and approved board posts go to Instagram for board brands (`AccountsPage.tsx`). /automations lists what runs without you, for Leo only. The leader's "Needs approval before posting" rule is enforced in the browser only; the `social` function never checks it. `trust-approval` owns that change (its Phase A).
- Data (T3). No privacy notice, terms or consent line on /auth or anywhere else (`src/pages/Auth.tsx`, `public/`). On-screen text names Zernio (the /accounts tip), Pexels and Higgsfield (price lines and the agent's plan card), and ElevenLabs once, on the agent's video plan card ("Made with: Higgsfield Speak and ElevenLabs", `src/lib/agentPlans.ts:140`). It never names OpenAI, though Write, remixes, carousels and most edge functions send the words to it; TypeSafe, which reads post text for every Jev decision; or Google, whose Gemini watches an exported video in "Watch it like a viewer" (`supabase/functions/video-assist/watch.ts`). Voiceovers go to ElevenLabs. Faces and scripts go to Higgsfield, and competitors' names and links to Apify and DataForSEO. No page says what it sends where.
- AI labels (T4). A video with an AI person or voice gets "AI person" and "AI voice" chips and ends its caption with "This video uses an AI-made person or voice." (`src/lib/videoProjects.ts:64`); both talking videos in the 25 Oct replay had them. The Malay version ended with the English line (p7a-fix D27); 3665d304 (27 Oct) gives Malay its own line, and Chinese and Tamil keep the English one until each has a line. Its My posts draft carries no AI line, and neither does the English base draft (D27). Write's "AI-assisted" chip is off by default (`GeneratePage.tsx:798`). Zernio posts carry no platform AI flag. The `people-ai-labels` card's `ours` line still says no video is labelled. That is out of date.
- Permissions (T5). /accounts connects through Zernio with one tip, "Each brand profile connects its own accounts, through Zernio.", and Disconnect asks "Disconnect @name on TikTok? You can connect it again later." in a browser confirm (`AccountsPage.tsx:164`). Neither says what the app may do with the account (post, read numbers, answer comments, send DMs) or what disconnecting stops. Revoking a Connect Claude link works: it writes a row that is never deleted (CLAUDE.md). Nothing downloads your data. Nothing deletes the account.
- Records (T6). /activity lists every run, and its AI use tab matched `cs_ai_usage` on 25 Oct. The agent's videos, pictures and slideshows read "You" in that replay (p6 replay D6); d65fa184 and 5f114afa (25 Oct) log them as the agent's, and no live run has re-checked. The `agent-activity` card's `ours` line still lists this as needed.

So the status is partial: prices and labels are mostly there for Leo, nothing posts by itself, but no page tells an adviser where their words, face and voice go, and there is no way to take the data back.

## Build

Who it reaches: items 3, 6 and 7 are new pieces and go to Leo's sign-ins first behind `useLeoOnly()` (the page and its entry point both). Prices for everyone and the privacy notice on /auth change everyone's app, so they are open questions for Leo, not build lines. Items 1, 2, 5 and 8 belong to other cards; this card only counts them.

1. Prices (`business-cost-preview`): nothing to build for Leo's sign-ins beyond keeping the guard test green. The dogfood check compares each paid call's charge in the function log with the chip read off the page.
2. Approval (`trust-approval`, Phase A): the `social` function refuses a schedule or publish for a brand with "Needs approval before posting" until that post is approved. T2 is met when that ships; this card adds no work.
3. A data page and a line on each page (`agent-activity`, `brand-from-website`): `/settings/data` lists, per company, what it gets and why. "OpenAI gets the words you write and the posts you remix, to write drafts." "TypeSafe gets the text of a post, to decide things like fit and format." "ElevenLabs gets your script, to read it aloud." "Higgsfield gets your photo and script, to make a talking video." "Google gets an exported video when you press Watch it like a viewer." "Zernio gets the post and your account link, to post it." "Apify and DataForSEO get your competitors' names and links, to read their posts and ads." Each core page gets one InfoTip, "What this page sends", that links to its row. The list lives in a typed table, `src/lib/dataUse.ts`. A test fails when an edge function the client calls has no row.
4. A privacy notice, drafted (`business-onboarding`): write the notice from item 3's table for Leo to read. Showing it on /auth is open question 2.
5. Labels in every language (`people-ai-labels`, `edit-translate`): that card's build covers the rest (Chinese and Tamil lines, the line on the My posts draft, Zernio's platform AI flags where Zernio documents them); its `ours` line needs updating to what the code does now.
6. Say what connecting allows, and what disconnecting stops (`publish-accounts`, `publish-inbox`): before the Zernio window opens, "Content Studio will be able to post, read your posts' numbers, and answer the comments and DMs you set up. Nothing posts until you press Post or Schedule, or turn on a switch that does it for you." Each account row shows when it was connected and that list, as Dropbox Dash and Descript do. The disconnect confirm becomes an in-app dialog that names what stops ("Auto-DM stops answering on @name. Your drafts stay.") with Disconnect and Cancel. Before the line promises anything about posts already scheduled, check what Zernio does with them on a disconnect.
7. Download and delete (no card): Settings gets "Download my data", a JSON of every `content-studio-` key for the sign-in, built in the browser from what the device already holds. "Delete my account" needs a new edge function and is Leo's call (open question 3).
8. Right actor in /activity (`agent-activity`): fixed in code. The next dogfood run checks it, then that card's `ours` line changes.

## Done when

- [ ] A dogfood run's ledger shows 100% of paid calls after a press that showed a price, and every charge within US$0.01 of its chip, on Leo's sign-ins (and on a demo sign-in once Leo turns prices on for everyone).
- [ ] The page-load audit in `scripts/ux/a11y.mjs` shows 0 posting, sending or replying calls across the 13 core pages, and `trust-approval` Phase A has shipped with its own test.
- [ ] `/settings/data` lists every company the app sends data to, `dataUse.test.ts` passes, and each core page has its "What this page sends" tip.
- [ ] The privacy notice draft is with Leo, and /auth shows it once he approves the words.
- [ ] A Malay, a Chinese and an English version of a video with an AI person each end with the AI line in their own language, in the editor and in My posts.
- [ ] Connect shows what the app may do before Zernio opens; Disconnect says what stops; Download my data saves a file.
- [ ] /activity shows the agent on every make the agent ran in a dogfood run.
- [ ] `src/data/northStar.ts` item `ux-trust` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/dataUse.test.ts`: every edge function name the client calls (from `callFn` and `functions.invoke` in `src`) has a row in `dataUse.ts`; it fails when a new function is called without one.
- The AI line test in `people-ai-labels` (a draft with `ai` set and no line fails).
- `src/lib/prices.test.ts` stays the T1 guard.

## Scoring each build wave

| Script | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `npx vitest run src/lib/prices.test.ts src/lib/dataUse.test.ts` and the AI line test | T1 guard, T3 coverage, T4 | seconds | US$0 |
| The page-load call audit inside `scripts/ux/a11y.mjs` (13 pages, fixtures) | T2 | part of its 4 min | US$0 |
| `scripts/ux/trust.mjs` (to write): opens each core page with fixtures and checks for the data tip, /auth for the notice link once approved, /accounts for the two permission lines | T3, T5 | 1 min | US$0 |
| The dogfood live run's ledger against its function logs, only in waves that touch paid or posting paths | T1, T2, T6 | in the run | about US$6 |

A wave passes when the free checks hold and no paid check got worse. The card's `ours` line carries the count, for example "T 2 of 6".

## Open questions

- Leo: turn prices on for everyone? It changes every sign-in's buttons. Recommended: yes; it costs nothing, `business-cost-preview` is built, and an adviser who sees "About US$2.75" before a video trusts the button.
- Leo: a privacy notice on /auth, which everyone sees, with a link before the sign-up button? Who writes it, and under which company? Recommended: yes, drafted from item 3's table and checked once; the company name is yours to give.
- Leo: Delete my account removes the Supabase user and every `cs_user_data` row; is that what you want, or a 30-day hold first? Recommended: a 30-day hold with a cancel link, as Notion's Trash does for pages.
- Whether to tell people their data never trains a model. Recommended: only after checking each provider's terms for the plan we pay for (OpenAI, TypeSafe, ElevenLabs, Higgsfield, Google); until then, say only what is sent and why.

## Related

business-cost-preview, business-credits, trust-approval, trust-disclosures, people-ai-labels, edit-translate, agent-activity, brand-from-website, business-onboarding, publish-accounts, publish-inbox, publish-schedule, ux-accessibility, ux-performance, ux-reliability

## References

Fetched 27 Oct 2026 with Scrapling; Mobbin screens found by the integrator through the Mobbin connector the same day. The captures were kept in a session scratchpad and are not in the repo, so each link above is the source.

- [Fastlane](https://usefastlane.ai/), [Fastlane pricing](https://usefastlane.ai/pricing); Leo's recordings in `docs/north-star/videos/`
- [Buffer AI Assistant](https://buffer.com/ai-assistant)
- [Notion AI security practices](https://www.notion.com/help/notion-ai-security-practices)
- [Canva privacy](https://www.canva.com/trust/privacy/), [Canva Shield](https://www.canva.com/newsroom/news/safe-ai-canva-shield/)
- [Meta, labelling AI content](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/); [Metricool, August 2026 updates](https://metricool.com/product-updates-august-2026/)
- Mobbin: [Dropbox Dash, a connected app](https://mobbin.com/screens/669b28e8-79b8-4417-ba73-59c35b7da51c), [Klaviyo, social accounts](https://mobbin.com/screens/32aa0033-4f4f-4394-9f35-abea3c3442db), [Devin, connections](https://mobbin.com/screens/dbbdf8d7-4f43-466f-9aa2-b0b3eb19658b), [Descript, connected apps](https://mobbin.com/screens/967d0ff5-0b2b-43f6-8d94-98b684ccb301)
- [CapCut terms of service](https://www.capcut.com/clause/terms-of-service)
- [PDPA section 20](https://sso.agc.gov.sg/Act/PDPA2012?ProvIds=pr20-)
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p6replay/results.md`, `live-p7a/results.md`, `live-p7a-fix/results.md`
- Memory: `cs-synced-delete-not-durable.md`, `builders-never-read-prod-settings.md`
