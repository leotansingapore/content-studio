# Every app's brief opens with one positioning sentence

Status: todo
App all apps, owner Leo + Claude, phase 2 (the loop can see).

## Why

Oren John (25:00) argues that mission statements, taglines and vision statements matter little now: "I think you need one statement". At 25:45 he gives the form, from Geoffrey Moore: "For [target] who [need], [brand] is the [category] that [benefit]. Unlike [competitor], we [differentiator]." He fills it in for an electrolyte brand and explains why it matters now: the sentence "gives any ChatGPT reference the ability to understand all the different pieces of your positioning, your target demographic, and your offering."

Every brief, script and ad in this plan is written by people and models working from our product-marketing briefs. A creator brief (loop-brief-template) takes its "who it is for" paragraph from this sentence. ActivityTracker and Advisor OS also speak to the same advisers, so the two sentences have to say plainly why each one exists.

## What we have today

Checked 26 Oct 2026. Each brief was opened, and none contains a sentence of this form (no line with "Unlike" in any of them).

| App | Brief | Version |
|---|---|---|
| ActivityTracker | remix-of-activity-tracker `.agents/product-marketing.md` (origin/main) | v6.11, 28 Sep |
| SearchBlueprint | ~/Documents/seo-audit-tool/.agents/product-marketing.md | v3, 23 Sep |
| Advisor OS | ~/Documents/advisor-os/.agents/product-marketing.md | v2, 11 Oct |
| CMFAS Prep | ~/Documents/CMFAS Prep/Competitive Research/product-marketing.md | v1, 11 Oct |
| MoneyBees | tiny-word-hive `.agents/product-marketing.md` (origin/main) | opens with rules for blog posts, no product section on top |
| Catalyst | ~/Documents/catalyst-refresh-glow/.agents/product-marketing.md | v1, 19 Sep |
| Crewhall, DayShift | ~/Documents/crewhall-home-copy-v1 and dayshift-home-copy-v3, each `.agents/product-marketing.md` | not in the card's list |

Two apps in this plan have no brief at all, which the card's ours line does not say. FINternship, the pilot's funnel, has none (its career pages live on themoneybees.co, and finternship-web has no `.agents` folder). Content Studio has only a competitor vault in ~/Documents/Content Studio.

The tools the copy rules require are installed: ~/.local/bin/hook-check (Jev scores lines in the reader's shoes), aicheck and brief-check.

## What to do

Order: FINternship first, because the pilot's briefs need it, then ActivityTracker and Advisor OS together, then SearchBlueprint, CMFAS Prep, MoneyBees, Catalyst, Crewhall and DayShift.

1. Claude, for FINternship only: add a short "FINternship careers" section to the tiny-word-hive brief, built competitors first as the copy rules require. Read five or six pages that recruit people into financial advice careers in Singapore and note the words they share, the enemy they name and the gap none of them claims. Then add who the reader is, the pains in their words and the call to action from the career pages. Leo reads it before step 2.
2. Claude, for each app: from that app's brief and its competitor section, write four or five candidate sentences in Oren's form. Every part (target, need, category, benefit, alternative, differentiator) must point to a line already in the brief, cited beside the candidate. A language model can draft the words; it never picks between them.
3. Jev picks. Put the candidates, plus each nearest competitor's own one-line description from its homepage, into a hook-check spec whose reader and pains come from the brief. Take the top score with credibility 0.6 or more. If the top two are within half a point, run `hook-check --h2h` on them.
4. Claude: write every app's winner and runner-up into one file for Leo, ~/Documents/App Growth Playbook/positioning.md, and run aicheck on it, plus brief-check against each app's brief. For ActivityTracker and Advisor OS, put the two sentences side by side, so Leo can see they name different categories.
5. Leo: read positioning.md and say yes, or change words, app by app.
6. Claude: add each approved sentence at the top of its brief under a heading "Positioning", raise the brief's version number, and add a changelog line with the date of Leo's yes. One commit per repo, pushed the way that repo's CLAUDE.md says.
7. Claude: from then on the creator brief template's "who it is for" line starts from this sentence.

## Done when

- Each brief in the table above, plus the new FINternship section, has a "Positioning" heading at the top with one sentence in Oren's form.
- positioning.md scores under 15 on aicheck, and brief-check reports no avoid-words for any app.
- Each brief's changelog line records the date Leo said yes.
- The ActivityTracker and Advisor OS sentences name different categories.

## Open questions

1. Where does FINternship's sentence live? Recommended: a section in the tiny-word-hive (MoneyBees) brief, because FINternship is presented as a MoneyBees programme and its forms are on themoneybees.co.
2. ActivityTracker and Advisor OS speak to the same advisers. Should one of them lead for that audience? Recommended: ActivityTracker as the tool the team uses daily, and Advisor OS as the coaching and done-with-you sales system around it. Leo decides, since it also shapes position-one-face.
