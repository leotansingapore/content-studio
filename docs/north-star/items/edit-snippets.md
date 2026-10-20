# Saved snippets, hashtag sets and hook libraries

`edit-snippets` | edit | phase 4 | status: partial | /north-star#edit-snippets

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has no snippets, hashtag sets or hook library in the editor. Its slideshow remix keeps a trending post's hook shape and rewrites the words (notes-2 F10), which is the job `remix-patterns` covers here. The schedulers and LinkedIn tools below are the reference.

- AuthoredUp: "Snippets" save and reuse signatures, hashtags or any text block, unlimited. Its library holds a "Hooks library (200+ opening lines)" (pricing cards say 300+) and "CTA & post-ending templates (150+)", inserted at the cursor. [pricing](https://authoredup.com/pricing), [authoredup.com](https://authoredup.com/)
- Buffer: a "Hashtag manager" of saved hashtag groups you insert into posts, on Essentials and Team. [pricing](https://buffer.com/pricing)
- Publer: reusable "Signatures" added to posts, Professional and Business. [help](https://publer.com/help/en/article/what-is-included-in-publer-business-1c57hsq.md)
- Postiz: "Signatures" are reusable blocks, and one can be added to every new post by itself; "Posting sets" save a channel selection. All plans. [docs](https://docs.postiz.com/general/concepts)
- FeedHive: "Post templates", "Brand Templates" and "Dynamic Variables" that insert reusable values into posts; templates 15, 50 or unlimited by plan. [feedhive.com](https://feedhive.com/), [pricing](https://feedhive.com/pricing)
- Taplio and Supergrow both list reusable snippets in the composer. [Taplio pricing](https://taplio.com/pricing), [supergrow.ai](https://www.supergrow.ai/)
- ReelFarm keeps 100+ slideshow hook templates by category, finance among them. [guides](https://reel.farm/guides)

What to take: one saved list with kinds, inserted at the cursor, and values that fill in from the brand (FeedHive's variables). Hooks are inserted as templates with blanks, never as someone else's line.

## What we have today

Partial. Saved text exists for Engage replies only, and nothing inserts saved text into a post.

- Saved replies, `/recruit/engage?tool=snippets` (`src/components/engage/Snippets.tsx`, logic `src/lib/replySnippets.ts`): up to 30 per brand (`MAX_SNIPPETS`), name up to 40 characters, text up to 1,000, synced as `content-studio-snippets-${scoped(userId)}`, compliance flags on each (`scanCompliance`), never blocking. The add form is kept on the device (`cs-snippet-form-`). `loadSnippets` rebuilds each row as `{ id, name, text }` and keeps the first 30, so today any extra field is dropped on read and a 31st row is cut. `saveSnippet` refuses the same text twice across the whole list. The Engage page shows "{n} of 30" from the full list.
- Engage drafts have "Insert" and "Save" (`Draft` in `src/components/engage/shared.tsx`); `insertSnippet(draft, snippet, start, end)` puts text at the cursor with the right spaces.
- Brand kit (`/brand`, `CarouselBrand` in `src/lib/carousel.ts`): the sign-off is added to every post on Copy (`withSignOff` in `src/lib/plainText.ts`), which does what Postiz's auto signature does. The kit also holds name, handle, role, up to 5 offers, DM links (Instagram, Facebook, WhatsApp) and the hashtag policy (`HASHTAG_MAX` in `src/lib/brandRules.ts`: ten 10, few 4, none 0). The policy and each platform's cap (`HASHTAG_CAP`, Instagram and TikTok 5) meet in `hashtagMax(brand, platform)`, a private function in `brandRules.ts` that returns undefined when neither sets a number (LinkedIn or Facebook with no policy).
- Write marks blanks in amber with `blankRanges` (`src/lib/platformCounters.ts`), which skips a bracket that sits alone on its line (it reads as a stage direction).
- Hooks: Write's hook step uses 21 named formulas (`HOOK_FORMULAS` in `src/lib/hookFormulas.ts`), and `?formula=<id>` opens Write on one. You cannot insert a formula into a post you are editing.
- Brief templates (`src/lib/templates.ts`, `content-studio-templates-`) save a brief's choices, not post text.
- Missing: inserting saved text into a post, hashtag sets, endings, post templates, and values that fill in from the brand kit.

## Build

One saved list with kinds, and an Insert panel in Write's editor. Free: no AI and no server.

### 1. Kinds on the existing list

- `Snippet` in `src/lib/replySnippets.ts` gains `kind?: SnippetKind`, with `SnippetKind = "reply" | "line" | "hashtags" | "ending" | "hook" | "post"`. A snippet with no kind is a reply, so every saved reply keeps working.
- Limits per kind: 30 each (`MAX_PER_KIND`), in place of the flat `MAX_SNIPPETS` of 30. Text limits: reply and line 1,000 characters, hashtags 300, ending 300, hook 200, post 2,200. `saveSnippet` checks duplicates within a kind and refuses the 31st of a kind with `problem: "full"`.
- `loadSnippets` must change with it: keep `kind` when it is one of the six values (drop it otherwise, so the row loads as a reply), and keep 30 of each kind instead of the first 30 rows. Without this the first read after saving a hashtag set throws its kind away.
- Engage's list, its "{n} of 30" count and its Insert menu use replies only (`kind` missing or `"reply"`), so nothing changes there.

### 2. Brand values that fill themselves

- New pure `fillVariables(text, brand)` in `src/lib/replySnippets.ts`. Tokens: `{name}`, `{handle}`, `{role}`, `{offer}` (first offer's name), `{offer_link}` (its link), `{whatsapp}` (wa.me link from the number), `{instagram}`.
- A token whose brand value is empty becomes a blank such as "[your WhatsApp number]". Write already marks blanks in amber (`blankRanges`), so the adviser sees what is missing, except when the blank is alone on its line, which `blankRanges` skips. `fillVariables` therefore also returns the names of the missing values, and the panel line below shows for every one of them wherever the blank landed. An unknown token is left as typed.
- Filling happens at insert time, so the saved text keeps its tokens and follows later changes to the brand kit.

### 3. The Insert panel in Write

- "Insert" sits in Write's Rewrite row, beside "Clean AI tells". It opens a panel under the Edit textarea, the same pattern as Engage's Insert menu, with five tabs: "Lines", "Hashtags", "Endings", "Hooks", "Post templates".
- Each tab lists its snippets as chips (name, with the text as the title). Tapping one inserts it with `insertSnippet` and closes the panel. Where it goes:
  - Lines and post templates: at the cursor, or at the end when the cursor was never placed. A post template on an empty draft fills the draft.
  - Hooks: as the first line, unless the cursor was placed.
  - Endings and hashtags: on a new line at the end, unless the cursor was placed.
- Hashtags: before inserting, the count after insert is checked against the brand's hashtag limit (`hashtagMax(brand, platform)`, exported from `src/lib/brandRules.ts`, where it is private today). Undefined means no limit and the set goes in without a question. Over a limit, the panel asks: "Your Brand kit allows {max} hashtags. This set has {n}." with "Insert the first {max}" (primary) and "Insert all". With the policy at none: "Your Brand kit says no hashtags." with "Insert anyway".
- Hooks tab, three groups:
  - "Your hooks": hooks you saved.
  - "Formulas": the 21 `HOOK_FORMULAS`, each inserting its `template` with `{x}` turned into `[x]` blanks, its `example` as the title and its `trap` under it.
  - "Proven hooks": when `remix-patterns` has shipped its hook bank (`src/data/hookBank.json`), each formula's best real line shows as evidence beside the formula. The formula is what gets inserted; the real line never is. Remix copies structure, never words.
- Endings tab: "Your endings", then five "Starters", one per call-to-action type in Write. The starter matching the draft's `ctaType` comes first with the tag "Matches your ask".
- Each tab ends with "+ New {kind}" (name and text, kind preset) and "Manage", which opens the same list as Engage's Saved replies (the `Snippets` component given a `kinds` prop) for edit and delete.
- `edit-text-post` adds "Save as snippet" to its selection bar: the selected text goes into the add form with the kind preset from where it sits (first line: hook; last lines: ending; hashtags only: hashtags; anything else: line). This is a default read from position, which the adviser changes before saving, so it needs no Jev.

```
[Shorter] [Longer] [Simpler] [More casual] [More formal] [Clean AI tells] [Insert]
Lines | Hashtags | Endings | Hooks | Post templates
  Your endings   (Book a review)  (Free checklist)
  Starters       (DM me a word  Matches your ask)  (Comment a word)  (Save and share) ...
  [+ New ending]  [Manage]
```

### Screens and states

- Empty tab: "No saved {kind} yet." with "+ New {kind}" (Hooks and Endings are never empty, since formulas and starters are always there).
- Inserted: the text appears in the post within 100 ms and the cursor lands after it; Undo uses Write's existing `undoText`.
- Missing brand value: the blank is marked amber in the post and preview, and the panel line reads "Add your WhatsApp number in Brand kit" with a link to `/brand#dm-links`.
- Over the hashtag limit: the question above, before anything is inserted.
- Full: "You have 30 saved {kind}. Delete one to save this."
- Duplicate: "Already saved as "{name}"."
- Compliance: a saved snippet with a flagged word shows the warn chip on its row in Manage, and the toast after saving names it, as Engage does today. The chips in Write run on the post after insert, as for any text.
- No failure state: everything is local.

### Copy

| Where | String |
| --- | --- |
| Button | "Insert" |
| Tabs | "Lines", "Hashtags", "Endings", "Hooks", "Post templates" |
| Groups | "Your hooks", "Formulas", "Proven hooks", "Your endings", "Starters" |
| Tag | "Matches your ask" |
| Actions | "+ New line", "+ New hashtag set", "+ New ending", "+ New hook", "+ New post template", "Manage", "Save as snippet" |
| Hashtag limit | "Your Brand kit allows {max} hashtags. This set has {n}.", "Insert the first {max}", "Insert all", "Your Brand kit says no hashtags.", "Insert anyway" |
| Empty | "No saved {kind} yet." |
| Full | "You have 30 saved {kind}. Delete one to save this." |
| Duplicate | "Already saved as "{name}"." |
| Missing value | "Add your {thing} in Brand kit" |
| Add form hint | "Type {name}, {handle}, {offer}, {offer_link} or {whatsapp} and your Brand kit fills it in." |

Starter endings, in `src/data/endings.ts`, each keyed to Write's `ctaType`:

| ctaType | Name | Text |
| --- | --- | --- |
| `dm-keyword` | "DM me a word" | "Send me a DM with the word [word] and I'll send you the checklist." |
| `comment-keyword` | "Comment a word" | "Comment [word] below and I'll send it to you." |
| `save-share` | "Save and share" | "Save this for later, and send it to someone who needs it this month." |
| `book-call` | "Book 15 minutes" | "If you want to go through yours together, book 15 minutes with me. The link is in my bio." |
| `open-question` | "Ask a question" | "What would you add? Tell me in the comments." |

None promises a result, names a product or gives advice, so they are safe for advisers to post in Singapore.

### Data

- Same synced key as today, `content-studio-snippets-${scoped(userId)}`, per brand. Old rows load as replies. At most 6 kinds times 30, so the row stays under about 200 KB even at every limit.
- `src/data/endings.ts`: the five starters, static.
- Formulas and the hook bank are read from their own files; nothing is copied into the user's list until they save it.
- No table, no schema change.

### AI and cost

None. No model, no Jev question, no cap. The "Matches your ask" tag comes from the draft's `ctaType`, which Write already knows, so there is nothing to decide.

### Gate

The Insert button, the new kinds and "Save as snippet" show only when `leoOnly(email)`. Everyone else keeps Engage's Saved replies exactly as today. There is no server part to guard.

### Deep links

| URL | Opens |
|---|---|
| `/generate?draft=<id>&panel=insert` | That draft with the Insert panel open on Lines. Push (Back closes it). |
| `/generate?draft=<id>&panel=insert&kind=hashtags` | The same on a tab: `line`, `hashtags`, `ending`, `hook`, `post`; `line` is the default and is left out. Replace. |

Add `"insert"` to the `panel` union and `kind` to `links.generate` in `src/lib/links.ts`, and rows to `docs/deep-links.md`.

## Done when

- [ ] Leo's existing saved replies still show and insert in Engage after the change, on both his logins.
- [ ] A hashtag set saved in Write inserts at the end of a post; over the brand kit's limit it asks first.
- [ ] A line with `{whatsapp}` inserts the wa.me link, and with no WhatsApp number in the brand kit it inserts a marked blank instead.
- [ ] A formula from the Hooks tab goes in as the first line with blanks, and no real line from the hook bank is ever inserted.
- [ ] The ending that matches the draft's call to action is first and tagged.
- [ ] A snippet saved on one device is in the Insert panel on another, per brand.
- [ ] Non-Leo accounts see no Insert button in Write.
- [ ] `npm run build` and the full `npx vitest run` pass; checked by eye at 390 px and 1440 px; `src/data/northStar.ts` flipped in the same commit.

## Tests

- `src/lib/replySnippets.test.ts`: a stored snippet without `kind` loads as a reply; a stored `kind` survives `loadSnippets`, and an unknown one loads as a reply; 31 hashtag sets plus 30 replies load as 30 and 30; the 31st of one kind is refused while another kind still saves; duplicates are checked within a kind only; text limits per kind cut long text.
- `fillVariables`: known tokens fill, an empty value becomes a blank inside a line that `blankRanges` finds and is listed as missing, a blank alone on its line is still listed as missing, an unknown token is left, and `{whatsapp}` builds the same wa.me link as `dmLinks` in `src/lib/bioPage.ts` (digits from `waDigits`).
- `src/lib/brandRules.test.ts`: the exported `hashtagMax` gives 4 for `few` on LinkedIn, 5 for `ten` on Instagram, and undefined for LinkedIn with no policy.
- A pure `insertPlace(kind, draft, caret?)`: hook goes first, ending and hashtags go last on a new line, a placed caret wins.
- `formulaTemplate(formula)` turns `{x}` into `[x]`.
- A hashtag count helper: 8 tags against a `few` policy gives a cut of 4.
- `src/lib/links.test.ts`: `links.generate({ draft: "d1", panel: "insert", kind: "hashtags" })`.

## Open questions

- Should one signature be added to every new post by itself, as Postiz does? The brand kit's sign-off already goes on at Copy, so this spec adds nothing. Leo decides if he wants a choice of signatures per platform.
- Agency leaders may want to push approved snippets to their advisers. That belongs with `trust-team-push` and needs a shared table, which is a schema change for Leo.

## Related

edit-text-post, remix-patterns, formats-hooks-scripts, brand-kit, brand-rules, trust-team-push, trust-disclosures, publish-engage
