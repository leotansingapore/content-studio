# A one-page creator brief anyone can fill in

Status: todo
App all apps, owner Claude, phase 2 (the loop can see).

## Why

Kenyon of Sideshift (15:08) calls a good creator brief "actually like a skill", because your ideas have to fit "a bite-sized page where creators can easily scan through it". Instead of entire scripts, a brief "should be reference videos. It should be hook ideas", and at 15:54 he adds "this is kind of where the CTA plugs in and different CTAs that you can use and overall different like messaging themes", because word-for-word scripts restrict the freedom new formats come from.

Oren John (1:37:15) uses a modular brief, a checklist he cuts down per creator. At 1:38:01 he starts with "the two most important messages ... Don't put five or 10 points", then the target, the content type, and hook inspiration split into on-screen text, visuals and the spoken line. References, a mechanism, a simple outline, assets and the variants needed (1:38:46 to 1:40:17) follow. He also notes "the best 10% of creators ... don't use the brief", while the other 90% need it.

The pilot sends five creators about two briefs a week each, and a VA takes this over in phase 7. So the brief has to be something a person can fill in without Leo in the room.

## What we have today

Checked 26 Oct 2026.

- No creator brief template exists anywhere: not in this repo, the App Growth Playbook folder, or the skills. Oren's own template sits behind an email signup at marketing.creativedirector.net and was not fetched.
- Hooks to draw from already exist. src/data/hookBank.json holds opening lines filed under Write's hook formulas by Jev, and src/data/topPosts.json holds peer advisers' top posts with a hook, format and "adapt" line each (both refreshed by launchd com.leo.top-posts-refresh, Sundays 21:00). The outlier-finder skill finds posts that did 3x their account's usual.
- ~/.local/bin/hook-check scores hooks out of 10 in the reader's shoes with Jev (care, outcome, clarity, credibility, distinctness, concreteness), and `--h2h` breaks a close call.
- The compliance line does not exist yet; it comes from leaks-aia-answer.
- Where each filled brief lives, and who it is for, comes from loop-roster (the Submissions table links to it).

## What to do

1. Claude: write the template as docs/marketing-north-star/creator-brief-template.md in this repo. It holds no private facts, so it can be public. One page, in this order:
   - Header: creator, app, brief id (the roster's), due date, where it posts (the creator's own account as a collab with the brand account), and the creator's tracked link from loop-creator-links.
   - The two messages, in two sentences at most.
   - Who it is for: one short paragraph taken from the app's product-marketing brief and its positioning sentence (position-statements).
   - Content type: talking head, vlog, green screen, carousel or another named format, and whether the creator may change it.
   - Three hooks, each as on-screen text, what is on screen, and the spoken first line.
   - Two reference videos, with one line each on what to borrow.
   - The mechanism if there is one (storytime, a numbered list, a myth and the fact), else blank.
   - A rough outline in four or five beats.
   - Assets: b-roll, screenshots, logos, green-screen backgrounds, with links.
   - Two endings, written out: the organic one (comment a word, follow) and the ad one (book a career chat through the link).
   - Compliance: the line from leaks-aia-answer, word for word, and what may not be said.
   - What Leo checks before it posts: hook, pace, dead space cut, a story that holds, a call to action that does not feel bolted on, and the compliance line (Kenyon 15:54 plus ours).
2. Claude: add a short "How to fill it in" box under the template. Experienced creators get only the header, the two messages, the hooks, the references and the compliance line, as Kenyon advises. New creators also get the draft script from pilot-own-pattern-scripts.
3. Picking the three hooks is a decision, so Jev makes it. For each brief, pool hooks from hookBank.json, the week's promoted posts in the Monday read-back, and outlier-finder's latest swipe note for the brand. A language model adapts the strongest moves to the app's nouns and writes a few versions each. Then hook-check scores them with the reader paragraph from the app's brief, and the brief takes the top three whose credibility is 0.6 or more. If Jev is down, the brief waits; there is no fallback that picks hooks by hand-made rules.
4. Claude: fill in one sample brief for the FINternship careers pilot from the template. It uses real hooks from step 3, and its compliance line reads `<waiting on leaks-aia-answer>` until that card is done. Save it beside the template as creator-brief-sample-finternship.md. Run aicheck on both files, and brief-check on the sample with the app's brief as its second argument (this repo has no .agents brief of its own to find).
5. Leo: read the sample and say yes or mark changes.
6. Claude: copy the approved template into a Lark Doc in the roster's Lark folder, named "Creator brief template", and link it from loop-roster. A person makes each new brief by copying that doc and linking the copy on the Submissions row.

## Done when

- creator-brief-template.md exists in docs/marketing-north-star/, and the filled sample fits on one printed page.
- aicheck scores both files under 15, and brief-check passes on the sample.
- Leo has said yes to the sample.
- The Lark Doc template exists and the roster links to it.
- The Compliance block holds the reply from leaks-aia-answer before the first adviser brief goes out.

## Open questions

1. How do creators receive a brief: a Lark Doc link, a PDF, or WhatsApp text? Recommended: a Lark Doc link, so a change reaches the creator without sending a new file, and it can be opened on a phone.
2. May the first briefs go out before AIA answers, with the compliance line marked as waiting? Recommended: yes for the outside creators' first drafts, but no adviser films until the line is filled.
