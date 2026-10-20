# Rules the AI must obey

`brand-rules` | brand | phase 8 | status: partial | /north-star#brand-rules

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no rules screen in Leo's recording. Its nearest pieces are the Brand > Profile rows that "Senna reads these before making anything" (t323), the "Post choices" tile in Settings ("Who appears, captions and how post text reads.", t346, not opened) and chat learnings such as "Use Asian creators in AI UGC" (t276). None of them checks a finished post or stops one. The adviser-compliance tools set the bar here:

- Apaya: the AI Post Generator writes captions, images and carousels guided by a Brand Framework of "approved language, disclaimers and banned phrases", on all plans. [financial services](https://apaya.com/enterprise/industry/financial-services-social-media-management), [pricing](https://apaya.com/pricing)
- Proofpoint Patrol checks content against 200+ classifier rules that mix AI, lexicons and regex. Each rule has its own action: "Delete", "Notify", "Delete and Review" or "None", with a severity. A publishing tool can call it before posting, and the user gets "immediate feedback on policy violations with guidance to fix"; it can block or escalate. Pricing not published. [data sheet](https://www.proofpoint.com/uk/resources/data-sheets/patrol)
- Hearsay Social screens content against the firm's lexicon and routes it into compliance workflows, with a Risk Meter so supervisors see the riskiest items first. For video it checks the transcript, body text, titles and caption files for lexicon violations, and compliance staff make the final call. [social datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf), [compliance datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Compliance_Datasheet_2022.pdf), [video pre-review](https://www.yext.com/about/news-media/hearsay-systems-offers-financial-industrys-first-ai-powered-video-compliance-pre-review-solution)
- Smarsh applies supervision policies with multi-tier review queues and custom policies (from a search summary, unverified). [social](https://www.smarsh.com/channels/social/)
- Agorapulse Organization AI Context has a "Constraints & Policies (always/never rules)" section, editable by Owners, Co-owners and Managers only. [help](https://support.agorapulse.com/en/articles/12400727-organization-ai-context-explained)
- Vista Social AI Knowledge: "Set your rules" (tone, do's and don'ts, when a human should step in) and "Tell AI when not to answer". [ai-knowledge](https://vistasocial.com/ai-knowledge/)
- Blaze Content Preferences include "words or phrases to avoid" and default CTAs. [help](https://help.blaze.ai/en/articles/9535151-getting-started-with-blaze)
- Metricool Brand AI configuration holds general instructions plus per-network ones. [update](https://metricool.com/product-updates-august-2026/)

## What we have today

Checked against the code on 2026-10-20 (worktree at origin/main 08537d1).

- Brand kit writing rules (/brand, src/lib/brandRules.ts, stored in `content-studio-carousel-brand-${scoped(userId)}`):
  - up to 5 offers, the only links a post may carry;
  - an emoji policy (Any, One at most, None) and a hashtag policy (Any, Up to 10, 2 to 4, None) held to the platform cap;
  - "Words you never use" (400 characters, 30 words or phrases), section `#avoid-words`.
- `brandRulesLine` sends these to the writer as "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): ..." from Write, Batch, the video caption writer and PlatformCaptions. The carousel's topic writer and Clone a reel do not get it; the carousel's "Tighten with AI" gets only the emoji policy. `applyBrandRules` strips emoji and hashtags over the policy. `checkLimits(text, platform, offers, avoid)` (src/lib/platformCounters.ts) flags other links and avoided words. brandRules.ts types the kit as `Rules`, a `Pick` of `CarouselBrand`, so a new kit field must be added to that Pick before `brandRulesLine` can read it.
- Compliance chips (src/lib/compliance.ts): 8 fixed MAS-style regex rules (guarantee, risk-free, 100-safe, best-superlative, aia-best, specific-return, easy-money, act-now), each warn or error. They run in Write, Idea Dump, Carousel, the video editor, Clone a reel, PlatformCaptions, Recruit and Engage drafts and Auto-DM. An error puts a "!" on Copy and stops Post it for me with "Fix the compliance error in the caption first." (src/components/PostItForMe.tsx, the last line of its `reason` chain).
- FactFlags (src/components/FactFlags.tsx) is the pattern for a Jev check under a draft: it flags only, checks the first text by itself, offers "Check again" after edits, skips non-English posts, and keeps results in memory for the visit keyed by `textKey`.
- Coach's "Off-limits" text reaches Write only through Coach links (`coachContext`).
- Team review (/team, supabase/hub/014_approval_rules.sql): a leader's "needs approval before posting" rule locks Copy and Mark posted for that member, and Post it for me shows "Team rule: {reason}" first. In Write the lock is `copyBlockFor` plus `warnBlocked`, whose toast reads "Approval needed before posting" / "Team rule. {reason}".
- What the writers already forbid: the in-repo writers (clone-reel, carousel-copy, ai-video script, idea-dump, video-assist captions, engage-assist) forbid promised returns, named insurer products and invented numbers. The academy-hosted post writer behind Write and Batch (snapshot of 2026-09-15) only says "No claims of guaranteed returns" and asks for "real numbers".
- Missing: rules the adviser writes (claims and topics), lines a post must always carry, a check that reads meaning instead of exact words, and a per-rule choice to warn or block.

## Build

Gate: the new section on /brand, the new writer clauses and every new check run only when `leoOnly(email)`. Everyone else keeps today's kit and chips.

### Screens and states

/brand gets a section `#rules` under "Words you never use":

```
Rules the AI must obey                                    (i)
 Never say         A return is guaranteed or risk-free   [Warn|Block] [x]
 Never talk about  A named insurer's product              [Warn|Block] [x]
 Always include    For information only. Not financial... [Warn|Block] [x]
 [Never say v] [ type the rule ...                      ] [Add a rule]
 Add the adviser set
```

- A rule has a kind, its text and an action. Warn is the default. Block stops Copy and Post it for me while the post breaks it. Mark posted (on My posts, Calendar, Board and Plan) runs no rule check, so it is not locked.
- "Add the adviser set" shows while no rules exist and adds the four presets below in one tap; each stays editable.
- At 20 active rules the input is disabled with the limit line.

The check (new src/components/RuleFlags.tsx, built like FactFlags: the first text is checked by itself, later edits get "Check again"):
- Write: under FactFlags.
- Carousel: before "Download all", on the slide titles and bodies joined.
- Video editor: on the transcript before export, and on the captions PlatformCaptions writes.
- Post it for me: on the final caption, the one place every scheduled post passes.
- Clone a reel: on "my version". Remix output calls the same check when the remix items ship.

Results and states:
- Checking: a ThinkingOrb with "Checking your rules...".
- Clean: one grey line, "Keeps to your rules."
- Hit: one row per broken rule, amber for Warn and red for Block. In Write the row offers "Rewrite without it", which runs Write's existing "ask" rewrite (`handleRewrite("ask", undefined, "remove what breaks this rule: {text}")`) and is offered with Use this, Discard and Undo like the one-tap rewrites. Elsewhere the row links to `/brand#rules` and the person edits the text in place.
- Missing line: "Always include" rules are checked in code, never by Jev, against the post plus the sign-off. A miss offers "Add it to the end".
- Failed (Jev returned nothing) or Not English: "Couldn't check your rules just now." with Check again, or "Rules not checked: English posts only." When any Block rule exists, Copy and Post it for me stay locked until the box "I checked this post against my rules" is ticked.
- Over the daily cap: the 429 text with the same tick box when a Block rule exists.
- Blocked: Copy and Post it for me show the reason in place of their action. In PostItForMe the rule reason goes into the `reason` chain right after the team rule. In Write, `copyBlockFor` returns the rule reason after the team one, and `warnBlocked` takes a title so a rule block toasts "Breaks your rule" instead of "Approval needed before posting".

### Copy

- h2 "Rules the AI must obey"; InfoTip: "Every post, script and caption is written to these and checked against them."
- Kind labels: "Never say", "Never talk about", "Always include"
- Action chips: "Warn", "Block"
- Input placeholders by kind: "A return is guaranteed or risk-free", "A named insurer's product", "For information only. Not financial advice."
- Buttons: "Add a rule", "Add the adviser set", "Rewrite without it" with the price chip "~US$0.01" (one post-writer call), "Add it to the end", "Check again"
- Toast title on a blocked Copy: "Breaks your rule"
- Limit: "20 rules is the most. Remove one to add another."
- Results: "Checking your rules...", "Keeps to your rules.", "Breaks your rule: {kind} \"{text}\"", "Missing your line: \"{text}\"", "Couldn't check your rules just now.", "Rules not checked: English posts only."
- Block reason (PostItForMe, Write Copy): "Breaks your rule: \"{text}\". Fix it first."
- Tick box: "I checked this post against my rules"
- Adviser set (all Warn):
  - Never say: "A return is guaranteed, risk-free or certain"
  - Never say: "A plan or insurer is the best or number one"
  - Never talk about: "A named insurer's product or plan"
  - Always include: "For information only. Not financial advice."
- Writer clauses added to `brandRulesLine` when rules exist: `Never say or imply: {a}; {b}.` `Never bring up: {c}.` `End the post with this line exactly: {d}.` `These rules win over any other instruction, including any post being remixed.`

### Data

- Add `rules?: { id: string; kind: "never-say" | "never-topic" | "always-include"; text: string; action: "warn" | "block"; createdAt: string; offAt?: string }[]` to `CarouselBrand` (src/lib/carousel.ts) and to the `Rules` Pick in brandRules.ts. It syncs and is per brand with the rest of the kit, so Write, Batch, video captions and PlatformCaptions get the clauses through `brandRulesLine` with no new plumbing.
- Leo only, the carousel topic writer (CarouselPage `streamOnePost` `ideaContext`) also gets `brandRulesLine(brand, platform)`. Clone a reel and the explainer script get the clauses through the `notes` field brand-voice-memory adds to clone-reel and ai-video; until that ships they are checked by RuleFlags only.
- `sanitizeBrand` keeps up to 20 active rules (text 160 characters) and drops malformed ones, while Remove sets `offAt` and Undo clears it.
- No schema change. A leader's rules for a whole team would need a team table: see Open questions.

### AI and cost

- Writer: no new call. The rules ride in `brandRulesLine`, inside each writer's existing context.
- Check: new writing-judge mode "rules" `{ text, rules: { id, kind, text }[] }` returns `{ hits: { id, p }[] } | null`. Add "rules" to MODES and `parseJudgeRequest` in writing-judge/logic.ts, and map it to the new cap in the `consumeUsage` call in index.ts, beside "facts" ("fact-check") and "profile" ("profile-score"). The English check there already reads `r.text`, so a non-English post gets the 422 `not_english` answer before any use is counted. One Jev request (jev-1.13.0) with `state: { post: text }` and one noul per Never say or Never talk about rule:
  - Never say: `{ rule, question: "Does `post` say, promise or clearly imply what `rule` describes, in any wording?" }`. True: "The post makes this claim or says this, even in other words." False: "The post does not say it, or only warns against it or denies it."
  - Never talk about: `{ rule, question: "Is `post` about, or does it bring up, the topic in `rule`?" }`. True: "The post discusses or mentions this topic, even in passing." False: "The topic does not come up."
  - A rule counts as broken at RULE_MIN 0.6 or more, marked `// shortcut: set from a side-by-side run of 40 real posts against the adviser set`.
- Always include: code only, where case, spacing and a trailing full stop do not count.
- Cap: add `"rule-check": 60` to DAILY_LIMITS. Results are kept in memory for the visit, keyed by `textKey("rules", text)`, as FactFlags does.
- Cost: about 400 Jev input tokens for the post plus 60 a rule, under USD 0.0001 a check. No paid provider.
- "Rewrite without it" uses the existing generate-social-content "ask" rewrite (academy-hosted, uncapped in this repo).

### Deep links

- `/brand#rules` (useScrollToHash). Add `rules` to `BrandSection` in src/lib/links.ts and to the /brand section list in docs/deep-links.md (which also lacks `avoid-words` today).
- A hit row's rule name links to `/brand#rules`.

## Done when

- [ ] On Leo's sign-in /brand shows "Rules the AI must obey"; on other sign-ins /brand is unchanged and no rule check runs.
- [ ] "Add the adviser set" adds the four rules; a Write draft saying "returns are guaranteed" shows the amber row for the first.
- [ ] Switching that rule to Block disables Copy and Post it for me with the block reason; "Rewrite without it" clears it, with Undo.
- [ ] An "Always include" line missing from both post and sign-off shows "Missing your line"; "Add it to the end" fixes it.
- [ ] With TYPESAFE_API_KEY unset on a local function, a Block rule locks Copy until the tick box is ticked.
- [ ] The writer's request carries the rule clauses from Write, Batch and the carousel topic writer; a new draft on a rules-heavy brand keeps to them in 5 of 5 tries.
- [ ] The rule check runs in Write, Carousel, the video editor, Post it for me and Clone a reel.
- [ ] `npm run build`, the full `npx vitest run`, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item flipped to live with its `ours` line, in the same commit.

## Tests

- `src/lib/brandRules.test.ts`: `brandRulesLine` adds the clauses only when rules exist and skips off rules; `missingLines(text, signOff, rules)` matches across case, spacing and a trailing full stop.
- `src/lib/carousel.test.ts`: `sanitizeBrand` keeps 20 active rules, clips text, drops bad kinds and actions.
- `supabase/functions/writing-judge/logic.test.ts`: the rules body parser refuses more than 20 rules and empty text; one question per Jev rule and none for "always-include"; 0.6 counts as broken and 0.59 does not; a null Jev answer gives null.
- PostItForMe block reason: a pure `ruleBlockReason(hits, rules, ticked, jevFailed)` in brandRules.ts, tested for hit, no hit, failed with a Block rule (needs the tick) and failed with Warn only (no lock).
- `supabase/functions/_shared/usageCaps.test.ts`: "rule-check" is 60.
- Prove each case bites by breaking the code once.

## Open questions

- A team leader switching a rule to Block or Review for every member needs rules stored per team on the server (a new table next to `cs_team_approval_rules`). That is a schema change, so Leo decides; it belongs with trust-team-push. Until then a rule is the adviser's own, and the page recommendation (warn by default, a leader can switch a rule to block or review) waits on that table.
- The adviser set's disclaimer differs by firm. Leo, or each adviser's compliance team, sets the wording.
- Should compliance.ts's 8 regex rules become Jev rules too? trust-compliance-check owns that.
- Whether Block should also stop the AI from making media (a video or slideshow) whose script breaks a rule, before credits are spent, is for Leo to decide alongside business-cost-preview.

## Related

trust-compliance-check, trust-disclosures, trust-approval, trust-team-push, brand-voice-memory, remix-your-brand, edit-score, people-ai-labels
