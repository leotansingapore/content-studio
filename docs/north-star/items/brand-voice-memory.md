# Your voice and what the AI has learned

`brand-voice-memory` | brand | phase 4 | status: partial | /north-star#brand-voice-memory

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane keeps what the AI reads before it makes anything per workspace, in these places:

1. Brand > Profile has a "Brand voice" row under IDENTITY. On Leo's account it reads "Not set". The banner above the rows says "Senna reads these before making anything. Change one here, or ask Senna in a thread." (notes-4.md 2.15.1)

   ![Fastlane 5:23](../../../public/north-star/fastlane/t323.webp)

2. Learnings come from chat. Leo typed "generally speaking if we use UGC ai it should be asian". Senna answered "This card keeps Asian creators as the preference for future AI UGC. Approving it saves the note." with a card titled "Use Asian creators in AI UGC" / "Keep a preference for Asian creators in your future AI UGC content." He approved it.

   ![Fastlane 4:36](../../../public/north-star/fastlane/t276.webp)

   The thread then shows a receipt: "Learning recorded" / "For future AI UGC content, generally use Asian creators." / "To undo: Say undo in chat to remove it." The same event shows as a "Learning recorded" row by "You" in Settings > Activity and in the Your work panel. No page in the recording lists all learnings (notes-4.md open question 17). Activity also has a "Corrections" filter tab; what it holds was not shown (t341).

   ![Fastlane 4:23](../../../public/north-star/fastlane/t263.webp)

3. Settings has "Post choices" / "Who appears, captions and how post text reads." It was not opened in the recording (t346).

Other competitors that do this well, with their limits:

- Supergrow "Content DNA" builds a voice profile from your LinkedIn posts, writing samples and profile: vocabulary, tone, opinions, known topics, hooks and pillars. Teams keeps one per member, 5 accounts. [pricing](https://www.supergrow.ai/pricing), [site](https://www.supergrow.ai/)
- Kleo "Train writing style" learns from past posts, and "Automatic memories" learn from each post you create and persist across sessions. "Store knowledge" holds case studies and client wins the AI draws on. [wf.kleo.so](https://wf.kleo.so/), [review](https://authoredup.com/blog/kleo-review)
- Creatify keeps a "readable memory of approvals, rejections, brand facts, product specs and team decisions". [features/agent](https://creatify.ai/features/agent)
- Copy.ai Infobase: upload TXT or PDF or paste style rules, ICP and product facts, then type "#" in a prompt to use one. [docs](https://support.fullcast.com/copy-ai/docs/chat-enterprise-safe-ai-that-speaks-in-your-brand-voice)
- Sandcastles Persona: "Writing style" takes a pasted sample only (3,000 chars, no instructions), "Context" takes 5,000 chars of business and expertise; fields autosave with a green "Saved". [help](https://help.sandcastles.ai/persona)
- Publer Brand Voices: one per client, workspace or account, set a default, switch while generating. [blog](https://publer.com/blog/publer-ai-with-brand-voices-and-analytics/)
- Vista Social AI Knowledge: "Set your rules" (tone, do's and don'ts, when a human should step in) and "Stays current". [ai-knowledge](https://vistasocial.com/ai-knowledge/)
- Sample sizes: ContentIn needs at least 20 posts ([contentin.io](https://contentin.io/)), Reepl takes 5 to 10 ([reepl.io](https://reepl.io/)), ViralBrain Pro reads 50 ([pricing](https://www.viralbrain.ai/pricing)).
- OpusClip Brand Vocabulary: fix a misheard word once, tick "Add to brand vocabulary", and new clips spell it right. [help](https://help.opus.pro/docs/article/brand-vocabulary.md)

## What we have today

Checked against the code on 2026-10-20 (origin/main 08537d1; the 13 commits after it, up to f2cb275, touch none of these files except AddBrandPage, which now keeps a half-done read in sessionStorage `cs-addbrand-form-`).

- /voice (src/pages/VoicePage.tsx, src/lib/voiceProfile.ts): 5 slots (VOICE_MAX_SLOTS), at least 3 posts (VOICE_MIN_FILLED) of 100+ characters (VOICE_MIN_CHARS). "Save voice profile" distils a summary through generate-social-content mode "voice-summary". That function is academy-hosted (not deployed from this repo; snapshot in supabase/snapshots/functions) and has no cap in usageCaps.ts. Stored at `content-studio-voice-${scoped(userId)}` as `{ posts, voiceSummary, updatedAt }`. The summary is shown read-only under "Your voice summary"; "Re-distill" replaces it and is disabled under 3 posts. Unsaved posts sit in sessionStorage `cs-voice-work-`.
- Trap: "Save voice profile" with fewer than 3 usable posts calls `persistOnly("")`, which writes an empty `voiceSummary`. A brand made from its website (summary, no posts) loses its voice the first time someone presses Save on /voice.
- Readers of the summary: Write (GeneratePage, plus 3 samples), Batch, the carousel's topic-to-slides writer (CarouselPage `streamOnePost`; "Tighten with AI" gets only the emoji policy), Clone a reel (`voiceForClone` in src/lib/reelClone.ts), the video editor's caption writer, Idea Dump (src/lib/ideaDump.ts) and the Recruit AI agent (src/components/recruit/Agent.tsx). Playbook and Home only check whether a usable profile exists.
- Gap found: Add a brand from its website (src/pages/AddBrandPage.tsx, brand-dna) saves its 2-sentence "voice" as `voiceSummary` with `posts: []`. Write, Batch and Clone a reel only use the summary when `isVoiceProfileUsable` (3 posts), so a website voice is ignored there. Carousel, video captions, Idea Dump and the Recruit agent use it.
- Coach profile (src/lib/coachProfile.ts, `content-studio-coachprofile-`): "Your tone" and "Off-limits" text, and the "Lean into" / "Steer clear of" lists typed on /coach (`recordPreference`: 12 each, 140 chars, deduped; `removePreference`). Only CoachPage reads it, and it reaches Write only through Coach's own links (`coachContext` in `?ctx=`), not on every draft.
- Caption fixes per brand (`content-studio-captionfixes-`, src/lib/videoProjects.ts): words captions always get wrong, fixed in every video. That is our brand vocabulary.
- writing-judge mode "human" already asks Jev "Does `draft` sound like it was written by the same person who wrote `voice_samples`?" (VOICE_MIN 0.35).
- The assistant: the dock (src/components/feedback/AssistantDock.tsx) shows one confirm card `{ ask, yes, run }` with a fixed "Cancel" button, and after a tap a `DockDone { done, go, undo }` line with an Undo chip. Busy dots show while the host's `act(text)` promise runs. Content Studio's acts live in src/lib/assistantActs.ts (`proposeAct` is async and calls the function; `actFor` is synchronous and only builds the card) and supabase/functions/assistant-act (acts move, write, week and four engage acts; ACT_MIN 0.6, PICK_MIN 0.5; cap `assistant-act` 30). assistant-act has no email or uid check today. src/components/feedback/AssistantMount.tsx wires `proposeAct` into the dock.
- Length limits downstream: video-assist mode "captions" (PlatformCaptions) clips its `rules` string to 1,200 characters; clone-reel clips the voice summary to 1,200; generate-social-content has no limit on `ideaContext`.
- Missing: facts the AI may use, learning from corrections, one list of learnings with undo, an editable summary, and a "remember" act in the assistant.

## Build

Gate the new parts with `leoOnly(email)` (src/lib/leoOnly.ts): the Facts and Learned sections on /voice, the editable summary, the website-voice fix, the rewrite nudge in Write, and every `memoryLine` call. The assistant's remember act is gated on the server too: assistant-act adds the `remember` option and the `scope` question only when `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` passes (`isAllowed` from supabase/functions/market/logic.ts, the MARKET_USERS pattern). That is the north-star server gate brand-from-website, find-competitors and brand-audiences use; whichever item ships first sets the secret to Leo's two uids. Adding an option to the act question changes Jev's routing for every message, so it must not reach other accounts. The current /voice stays as it is for everyone else.

### Screens and states

/voice gets three sections, each an h2 with an anchor:

```
Your voice                                    [Saved]
-- How you sound (#how-you-sound) -------------------
  Past post 1..5 (as today)   [Use my own posts]
  Summary (editable textarea, 1,200 chars)
  [Re-distill ~US$0.01]   [Save voice profile ~US$0.01]
-- Facts the AI may use (#facts) --------------------
  12 years as an adviser                          [x]
  [ type a fact ...                   ] [Add a fact]
-- What the AI has learned (#learned) ---------------
  Never open with a question   Posts  You told the assistant, 19 Oct  [Remove]
  Write posts a third shorter  Posts  You kept Shorter on 3 posts      [Remove]
  Lean into: client stories    Posts  From Coach                       [Remove]
  [ tell the AI something to keep or stop ] [Add]
```

How you sound:
- "Use my own posts" shows only when a `cs_social_audits` row exists for one of the brand's audited handles (`auditedHandles(loadSocialAccounts(userId))` in src/lib/accountAudit.ts covers Instagram and TikTok). Add `loadAuditFor(platform, handle)` there: a direct select on `cs_social_audits` by user, platform and handle (owner-read RLS, unique on those three), never `openAudit`, which can start a paid refresh. It fills empty slots with the longest `posts[].caption` values of 100+ characters and leaves out posts marked `collab: true`, since those are another account's words. When no caption reaches 100 characters the button reads "No posts long enough" and is disabled. No new paid call.
- The summary becomes an editable textarea. A hand edit saves `summaryEditedAt`. Re-distill after a hand edit asks first.
- A summary with no posts (from the website) is used by Write, Batch and Clone a reel. Add `voiceSummaryOf(profile)` to voiceProfile.ts and call it in GeneratePage, BatchPage and `voiceForClone`; samples still need 3 posts.
- Save with fewer than 3 posts keeps the saved summary instead of blanking it (`persistOnly()` with no argument). This is part of the website-voice fix, so it is Leo-only too.
- Price chips (Leo only): "~US$0.01" beside "Re-distill", and beside "Save voice profile" while 3 or more posts are ready (only then does Save call the paid distil).

Facts the AI may use:
- Up to 20 facts, 160 characters each. Enter adds. Each row has a remove button with a toast Undo.
- Facts go to the writers only (below). Nothing checks a draft against them: FactFlags flags CPF, SRS, HDB, insurance and scheme facts, not claims about the adviser.

What the AI has learned:
- One list: learnings saved here plus Coach's "Lean into" and "Steer clear of" items (labelled "From Coach"; Remove calls `removePreference`).
- Each row holds the text, a scope chip (Posts, Videos, Pictures, Everything), where it came from and when, and Remove; removed rows are hidden and the toast offers Undo for 6 seconds.
- `/voice?learning=<id>` scrolls to the row and rings it for 2 seconds.

How learnings arrive:
1. The assistant. assistant-act returns `{ pick: { act: "remember", scope } }`. `actFor` is synchronous, so the conflict check runs in `proposeAct` (async, still inside the dock's busy dots): for a remember pick it calls writing-judge mode "conflict" against the active learnings in that scope or "all", then passes the result to `actFor(userId, pick, message, drafts, today, go, conflict)`, which builds a `rememberAct`. A failed or refused conflict call never turns the card into null. The card is the dock's existing one: `ask` holds the user's own sentence (trimmed to 140 characters, no rewording), the scope words and, when a conflict is found, the replace line; `yes` is "Remember"; the dock's own "Cancel" dismisses it. `run` saves the learning (and turns the replaced one off) and returns `DockDone { done: "Learned: {text}", go: [{ path: "/voice#learned", label: "See what the AI has learned" }], undo }`.
2. Rewrites kept in Write: each one-tap rewrite the user keeps (`acceptRewrite`, the "Use this" button) is logged with `currentDraftId`. The same rewrite kept on 3 different drafts within 14 days shows a one-line nudge under the draft with "Remember" and "No thanks". The saved text comes from a fixed map (below). No thanks hides that nudge for 30 days.

Where learnings and facts are used:
- New src/lib/voiceMemory.ts: `memoryLine(userId, scope, max = 1500)` returns one block for the writer, or "" when there is nothing. It holds the facts, the active learnings in that scope or "all" (newest first), and Coach's two lists, in that order, and stops at `max` characters by leaving out whole items from the end, so the oldest learnings and Coach items go first.
- Posts scope: next to the `brandRulesLine` call in GeneratePage `buildBasePayload`, BatchPage (its per-target `ideaContext`, which today holds only the brand rules) and VideoEditPage `writeCaption`; plus the carousel topic writer's `ideaContext` in CarouselPage. PlatformCaptions sends `[brandRulesLine(brand), memoryLine(userId, "posts", 1200 - rules.length - 1)]` joined by a space, rules first, because video-assist clips `rules` at 1,200 characters.
- Clone a reel: clone-reel's `VoiceInput` (supabase/functions/clone-reel/logic.ts) gains `notes?: string`, clipped to 1,200 in `sanitizeVoice`, printed under "The consultant's voice:" as `Their standing notes (follow them): {notes}`. `sanitizeVoice` today returns null when summary, samples and winners are all empty; it must also keep a voice that has only `notes`, which the app fills with `memoryLine(userId, "posts", 1200)`.
- Videos scope: ai-video mode "script" gains `notes?: string` (clipped to 600) placed after the topic as `The adviser's standing notes (follow them): {notes}`. The topic itself is capped at 200 characters and the prompt treats it as material, never instructions, so notes cannot ride inside it.
- Pictures scope: appended to the image prompt in src/lib/aiImage.ts `makeImage` only while the whole prompt stays under ai-image's MAX_PROMPT (1,200); otherwise the oldest learnings are left out first.
- Precedence in the text: brand rules first, then learnings, then the voice summary. The block says so.

States:
- Empty: no facts and no learnings show only the inputs. No explainer lines.
- Loading: the page waits for the account, as /brand does, so nothing typed is lost.
- Making (assistant): the dock's busy dots while assistant-act and the conflict check run, then the card.
- Done: "Learned: {text}" in the dock with Undo; the row on /voice.
- Failed: the conflict check returning null saves the learning without a replace line. A storage failure shows "Couldn't save that. Try again."
- Refused: assistant-act over its cap answers in words as today; nothing is saved.
- Over the daily cap (writing-judge 429 on the conflict check): the card shows "Not checked against your earlier notes today." in place of the replace line, and Remember still works.
- Full: at 30 learnings the Add button is disabled with "30 is the most. Remove one to add another." At 20 facts the same with 20.

### Copy

- h2: "How you sound", "Facts the AI may use", "What the AI has learned"
- InfoTip on Facts: "Posts may state these about you, and no other claims."
- Under the Facts input (requirement, stays visible): "Only add facts you can prove."
- Facts placeholder: "12 years as an adviser"
- Learned placeholder: "Never open a post with a question"
- Buttons: "Use my own posts" (disabled state "No posts long enough"), "Add a fact", "Add", "Remove", "Remember", "No thanks", "Undo"
- Price chip: "~US$0.01"
- Re-distill confirm: "Replace the summary you edited?" with "Replace" and "Keep mine"
- Source labels: "You told the assistant", "You kept {Rewrite} on 3 posts", "Typed here", "From Coach", each followed by ", {d MMM}"
- Scope chips: "Posts", "Videos", "Pictures", "Everything"
- Assistant card `ask`: `Remember this for your {posts | videos | pictures | posts, videos and pictures}?` then a new line with `"{text}"`, then `This replaces: "{old text}"` when a conflict is found. `yes`: "Remember".
- Receipt (`done`): "Learned: {text}"; chip "See what the AI has learned"
- Cap line on the card: "Not checked against your earlier notes today."
- Toasts: "Removed." with Undo; "Couldn't save that. Try again."
- Rewrite nudges and the learning each saves (ids and labels from REWRITES in GeneratePage):

| Rewrite kept 3 times | Nudge | Learning saved |
| --- | --- | --- |
| shorter ("Shorter") | "You often make posts shorter. Start them shorter?" | "Write posts about a third shorter than usual." |
| longer ("Longer") | "You often make posts longer. Start them longer?" | "Write posts about a third longer, with one more concrete detail." |
| simpler ("Simpler") | "You often ask for simpler words. Keep it simple from the start?" | "Use plain words and short sentences." |
| casual ("More casual") | "You often make posts more casual. Start that way?" | "Keep the tone casual and conversational." |
| formal ("More formal") | "You often make posts more formal. Start that way?" | "Keep the tone formal and polished." |

- Writer block (memoryLine), exact:
  `ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):` then `- Facts you may state about me (state no other facts, numbers, awards or results about me): {facts joined by "; "}` and `- Keep doing or avoid: {learnings joined by "; "}`

### Data

All synced, per brand, no schema change:

- `content-studio-voice-${scoped(userId)}` gains `summaryEditedAt?: string`.
- `content-studio-facts-${scoped(userId)}`: `{ id, text, createdAt, offAt? }[]`, 20 active, text 160 chars.
- `content-studio-learnings-${scoped(userId)}`: `{ id, text, scope: "posts" | "videos" | "pictures" | "all", source: "assistant" | "rewrite" | "typed", createdAt, offAt?, replacedBy? }[]`, 30 active, at most 60 rows kept (oldest off rows pruned first).
- Remove sets `offAt`; it never deletes the row, so Undo and the "replaced" history work.

Device only (`cs-` keys): `cs-rewrites-${scoped(userId)}` (last 20 `{ id, draftId, at }`), `cs-rewrite-nudge-off-${scoped(userId)}` (`{ [rewriteId]: ISO }`).

### AI and cost

- Distil: unchanged, generate-social-content mode "voice-summary" (academy-hosted; the 2026-09-15 snapshot uses OpenAI gpt-4.1). About 1 US cent a run, unverified. No cap in this repo.
- "Use my own posts": no AI; reads the user's own `cs_social_audits` row (RLS).
- Assistant remember act (supabase/functions/assistant-act/logic.ts), Jev only, on the `assistant-act` cap (30 a day). `actAsk(body, leo)` takes a new `leo` flag, which index.ts sets from the north-star gate after `getUser`. When true it adds to the `act` criteria, and asks a second question in the same request:
  `remember: "Tell the app a lasting preference for what it makes from now on: always or never do something in their posts, videos or pictures, for example 'never use emoji', 'always end with a question', 'use Asian presenters'."`
  `scope: { type: "choice", instructions: "Which kind of content does the preference in `message` apply to?", criteria: { posts: "Written posts, captions, carousels and scripts.", videos: "Videos: presenters, on-screen captions, editing, music.", pictures: "Pictures and images.", all: "Everything, or the message does not say." } }`
  Thresholds: the existing ACT_MIN 0.6 for the act; scope at PICK_MIN 0.5, else "all". ACTS gains "remember"; `actPick` returns `scope` for it.
- Conflict check: new writing-judge mode "conflict" `{ note, notes: string[] }` (up to 30, each 140 characters) returns `{ replaces: number | null }`. Add "conflict" to MODES and to `parseJudgeRequest` in writing-judge/logic.ts, and give it its own branch in the English check at the top of writing-judge/index.ts (`r.note`), which today falls through to `r.text` and would read undefined. One Jev request with one noul per note:
  `"Does `new_note` ask for the opposite of `old_note`, so that both cannot be followed?"` with criteria true "They ask for opposite things, for example 'use emoji' and 'never use emoji'." and false "They can both be followed, or they are about different things."
  Pick the highest at or above CONFLICT_MIN 0.7 and give the constant the comment `// shortcut: threshold not read off real notes; set it from a side-by-side run of 30 real pairs`. Counts on `writing-judge` (60 a day). About 100 Jev input tokens a note, well under USD 0.001 a run.
- Rewrite nudge: counting in the browser, no AI.
- No new paid provider and no new cap name.

### Deep links

- `/voice#how-you-sound`, `/voice#facts`, `/voice#learned` (useScrollToHash once the profile has loaded).
- `/voice?learning=<id>`: opens that learning (push; Back clears the param). Extend the existing builder to `links.voice({ section?, learning? })` in src/lib/links.ts.
- Replace the /voice "(none)" row in docs/deep-links.md with these.

## Done when

- [ ] On Leo's sign-in, /voice shows the three sections and an editable summary; on any other sign-in it looks exactly as today.
- [ ] A fact added on /voice appears in the next Write request's `ideaContext`, and in clone-reel's `voice.notes`.
- [ ] Typing "from now on never use emoji in my posts" in the assistant shows the card with "your posts"; Remember adds the row to /voice#learned and the next Write request carries it.
- [ ] A second note "use lots of emoji" shows `This replaces: "never use emoji in my posts"`, and Remember turns the first off.
- [ ] Remove then Undo restores a learning; a removed learning is absent from the next request.
- [ ] Keeping "Shorter" on 3 different drafts shows the nudge once; No thanks hides it for 30 days.
- [ ] A brand made from its website with no pasted posts sends its voice summary from Write, Batch and Clone a reel, and pressing Save on /voice with no posts keeps that summary (Leo only).
- [ ] An assistant-act request from a non-Leo account carries no `remember` criterion and no `scope` question.
- [ ] Nothing new is paid: no new provider, no new cap; assistant-act and writing-judge counts move by one per use.
- [ ] `npm run build` and the full `npx vitest run` pass; checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped to live with its `ours` line, in the same commit.

## Tests

- `src/lib/voiceMemory.test.ts` (new): memoryLine includes facts and only active learnings for the scope (plus "all"); off rows are left out; Coach lists are included; nothing saved gives ""; caps of 20 and 30 hold.
- `src/lib/voiceProfile.test.ts` (new): `voiceSummaryOf` returns a website summary with no posts; `isVoiceProfileUsable` is unchanged.
- `src/lib/voiceMemory.test.ts` also: `memoryLine` never passes `max` and drops whole items from the end (oldest learnings, then Coach items), never a fact before a learning.
- `src/lib/reelClone.test.ts`: `voiceForClone` keeps a website summary with no samples when the fix is on.
- `supabase/functions/assistant-act/logic.test.ts`: with `leo` false the questions are exactly today's; with `leo` true "remember" is in the act criteria and the scope question is sent; a scope below 0.5 reads as "all"; an act below 0.6 gives no pick.
- `src/lib/assistantActs.test.ts`: a remember pick gives a card whose `ask` holds the message clipped to 140 characters and whose `run` saves one learning; a conflict index adds the replace line and turns that note off.
- `supabase/functions/writing-judge/logic.test.ts`: the conflict body parser refuses an empty note and more than 30 notes; conflict questions are one per note; the highest at or above 0.7 wins; 0.69 gives null; a null Jev answer gives null.
- `supabase/functions/clone-reel/logic.test.ts` and `supabase/functions/ai-video/logic.test.ts`: `notes` is clipped and printed; an empty `notes` changes nothing; `sanitizeVoice` keeps a voice that has only `notes`.
- `src/lib/accountAudit.test.ts`: the caption picker skips collab posts and captions under 100 characters and returns at most the empty slot count.
- `src/lib/rewriteLog.test.ts` (new, with the counter in src/lib/rewriteLog.ts): 3 keeps on 3 drafts within 14 days nudge; the same draft 3 times does not; a 15-day spread does not; a dismissal inside 30 days does not.
- Prove each case bites: break the code under test once and watch the case fail.

## Open questions

- Should Connect Claude's `get_brand` tool (supabase/functions/content-studio-mcp) return facts and learnings too? Leo decides.
- Turning the website-voice fix on for everyone changes Write, Batch and Clone a reel for every user, and stops Save from blanking a website voice, so Leo decides when, in his words ("on for everyone").
- The distil (generate-social-content "voice-summary") has no daily cap, against the page's rule that paid calls are capped. It is academy-hosted, so a cap means changing a function outside this repo that aia-product-compass-hub also uses. Leo decides.
- Fastlane undoes a learning by saying "undo" in chat. This spec uses an Undo chip and Remove on /voice; an assistant "forget" act can follow under agent-memory.
- The AI presenter's look (ai-video mode "presenter", 300 characters) gets no learnings here, though Fastlane's own example ("Use Asian creators in AI UGC") is that case. people-presenters decides how a learning reaches it.
- Learning from hand edits (diffing what the AI wrote against what was posted) is left out: it needs an LLM to describe the change and is easy to get wrong. Revisit after a month of rewrite logs.

## Related

agent-memory, brand-rules, brand-from-website, remix-your-brand, edit-by-chat, edit-score, trust-compliance-check, people-my-voice, people-presenters
