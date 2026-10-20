# AI presenters for your brand

`people-presenters` | people | phase 4 | status: partial | /north-star#people-presenters

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane treats a recurring AI face as part of the brand: Studio has its own "Influencers" tab beside Overview, Create and Library, and Home sends people there with the chip "AI influencers are made in Studio ->" under the Ask Senna tiles.

![Fastlane 0:04, Home with the link to AI influencers](../../../public/north-star/fastlane/t004.webp)

![Fastlane Studio tabs with Influencers](../research/fastlane-pdf/lib-tile-00.webp)

Each video format asks who appears: on the Yapper page the "AVATAR" card reads "A woman" with a "Change" button, above the setting chips ("In bed", "Parked car", "Bathroom sink", "On the couch", "Kitchen counter") and the length chips, though the picker itself was never opened in the recording.

![Fastlane 1:31, Yapper with the AVATAR card](../../../public/north-star/fastlane/t091.webp)

A campaign's AI video post carries the same choice: Post 5 of 28 ("DAY 5 | FRI 23 OCT", AI video, format "Felt") shows "See the full script >" and "Choose who appears >" under "WHAT WE'LL MAKE" ("A Felt video about 15 seconds long, made fresh for you at Make."). The link was not opened either.

![Fastlane 0:58, a campaign AI video post with Choose who appears](../../../public/north-star/fastlane/t058.webp)

Settings lists it too: under SENNA, "Post choices" reads "Who appears, captions and how post text reads." The page was not opened, so whether it sets one default per workspace is unverified.

![Fastlane 5:46, Settings with Post choices](../../../public/north-star/fastlane/t346.webp)

The public AI influencer page lays out 4 steps: "Paste your website URL", "Cast your AI influencer" (browse characters by look, age and vibe; "the same face fronts every video"), "Generate a batch of videos", "Schedule and publish natively". Starter has 25 characters and Growth 500+, with a library of 1,000+ (the pages conflict). ([tool](https://usefastlane.ai/tools/ai-influencer-generator), [pricing](https://usefastlane.ai/pricing))

Others:
- MakeUGC: 1,000+ AI actors (Starter 300+, Growth 500+, Pro 1,000+), 50+ languages with lip sync. ([pricing](https://www.makeugc.ai/pricing))
- Creatify: 300 actors on Free and Standard, 1,500 on Pro with 3 custom avatars, 75+ languages. ([pricing](https://creatify.ai/pricing))
- Arcads: 1,000+ actors whose delivery you write as text ("You have full emotion control. Just write how you want it"), at 800 credits a minute for talking actors. ([site](https://www.arcads.ai/), [credits](https://help.arcads.ai/en/articles/13725589-how-are-credits-counted))
- Captions (incl. Mirage): avatars made from a prompt ("A young person with..."), 200+ ready-made, steps "Pick your talent", "Customize the details", "Generate and share". ([page](https://www.captions.ai/features/generate-ai-avatars))
- Descript: "Text prompt" makes three avatar options; uploaded photos are safety-checked, and celebrities, minors and explicit images are refused. ([help](https://help.descript.com/generative-media/create-your-avatar.md))
- Zebracat: set ethnicity, age, style, voice, language and expressions; Super Cat makes 5 custom avatars a month. ([page](https://www.zebracat.ai/features/ai-avatar-generator), [pricing](https://www.zebracat.ai/pricing))
- Predis.ai suggests avatars that fit your category. ([features](https://predis.ai/features/))
- TopView.ai: 2,000+ avatars, 200 saved video avatars on Plus. ([pricing](https://www.topview.ai/pricing))
- Quso.ai (formerly Vidyo.ai) is discontinuing its AI Influencer, 80+ stock avatars reading a script; its help pages give no reason. ([help](https://helpdesk.quso.ai/help/what-is-ai-influencer.md))

## What we have today

- `/edit?panel=ai&kind=avatar`, "Who speaks" > "AI presenter" (`src/components/AiVideo.tsx`): a textarea prefilled with one of six looks (`LOOKS` in `src/lib/aiVideo.ts`, each a different Singaporean: Chinese, Malay, Indian and Eurasian, 20s to 50s), "Another look", "Make the presenter".
- `ai-video` mode `presenter` makes one Soul v2 picture (`presenterBody`: 9:16, 1080p, "Set in Singapore; the person is Singaporean unless described otherwise", no text) for about US$0.006 (`PICTURE_CREDITS` 0.09 at US$0.0625 a credit), and counts one use of `ai-image` (5 a day, shared with Write's "Make the image"). A failed picture does not give the use back: `makePresenter` polls without a refund ticket. There is no studio-wide cap on it.
- The picture's link sits in the module-level job in `src/lib/aiVideo.ts` (`aiJob()`), which the panel reads when it opens. It survives moving between pages, but the next AI job ("Make the video" included) or a reload drops it, so the next video gets a different person. `research/current-app.md` says so: "presenter picture not stored as a character".
- The look box is free text up to 300 characters (`MAX_LOOK`) and goes to Higgsfield unread.
- Nothing marks the presenter as AI on the post, and there is no per-brand choice of who appears.
- So the status is partial: a presenter can be made and used once.

## Build

Saved presenters per brand, a default "who appears" per brand, and preferences that shape new presenters. Every presenter is labelled AI everywhere it shows. The person always comes first: "My face" (people-my-face) is listed before any presenter.

### Screens and states

`/people?tab=presenters` (page shell from people-my-face, `leoOnly` gate):

```
Who appears in {brand} videos
( ) Me          (*) Mei, AI presenter        ( ) Ask each time

Your presenters                               [ Make a presenter ]
[pic] Mei   AI presenter   Default   Use in a video   ...
[pic] Raj   AI presenter             Use in a video   ...
```

1. Empty: "No presenters yet. Make one, and the same face can front every {brand} video." with the button "Make a presenter".
2. Make a presenter, a sheet with chips that start from the brand's saved preferences: Woman, Man or Either; 20s, 30s, 40s or 50s+; Chinese, Malay, Indian, Eurasian or Any Singaporean (default); Office, Smart casual or Casual. An optional "Anything else" field takes up to 120 characters. The button reads "Make 3 options" with the price chip "About US$0.02" and the line "{n} left today" from `useUsesLeft`.
3. Making, within 400 ms: three grey 9:16 tiles with "Making 3 presenters, about 20 seconds". The sheet can be closed and the job goes on (module-level job, like `src/lib/aiVideo.ts`).
4. Pick: three pictures, each a different person (same rule as `LOOKS`). "Pick one to keep." A name field ("Name, only you see it", prefilled from a short list of Singaporean first names) and "Keep {name}".
5. Done: the card joins the list. When it is the brand's first presenter it becomes the default, and a toast reads "{name} is saved. New {brand} videos can use {name}."
6. Refused:
   - Jev reads the look as a real person ("Presenters can't look like a real person. Describe a look instead.")
   - Jev reads the look as someone under 18 ("Presenters are adults.")
   - over the cap
   - 4 presenters already on ("You have 4 presenters. Remove one to make another.")
7. Failed: "Couldn't make the presenters. Try again in a minute." Uses come back when Higgsfield fails.
8. The card's menu holds "Rename", "Make default" and "Remove"; Remove asks "Remove {name}? Videos already made keep {name}." and then writes `status: "off"`.

In "You speaking" (`AiVideo.tsx`, Leo only), "Who speaks" lists "My face" (when saved), then one pill per saved presenter ("Mei, AI"), then "New presenter" (today's look box). The brand's "Who appears" choice is preselected; "Ask each time" preselects nothing. The template form gets "Use Mei" beside "Photo of the person" for templates with a person role.

### Copy

- Tab: "Presenters"; heading "Who appears in {brand} videos"; choices "Me", "{name}, AI presenter", "Ask each time"
- Empty: "No presenters yet. Make one, and the same face can front every {brand} video." / "Make a presenter"
- Sheet: "Make a presenter" / chips as above / "Anything else (optional)" placeholder "Glasses, short hair, warm smile" / "Make 3 options" / chip "About US$0.02" / "Presenters: {n} left today"
- Making: "Making 3 presenters, about 20 seconds"
- Pick: "Pick one to keep." / "Name, only you see it" / "Keep {name}"
- Card: chip "AI presenter", chip "Default", "Use in a video", menu "Rename", "Make default", "Remove"
- Remove dialog: "Remove {name}? Videos already made keep {name}." / "Remove" / "Keep"
- Toast: "{name} is saved. New {brand} videos can use {name}."
- Refusals: "Presenters can't look like a real person. Describe a look instead." / "Presenters are adults." / "You have 4 presenters. Remove one to make another." / the cap's own message
- Failed: "Couldn't make the presenters. Try again in a minute."
- AiVideo: "{name}, AI" / "New presenter" / "Use {name}"

### Data

- `content-studio-presenters-${scoped(userId)}`, per brand, in a new `src/lib/presenters.ts`:
  ```ts
  interface Presenters {
    who: "me" | "ask" | string;           // a presenter id, "me" or "ask"; default "ask"
    prefs: { gender?: "woman" | "man"; age?: "20s" | "30s" | "40s" | "50s"; background?: "chinese" | "malay" | "indian" | "eurasian"; dress?: "office" | "smart-casual" | "casual"; extra?: string };
    items: {
      id: string;                          // "pr-<base36 time>"
      name: string;                        // up to 24 characters
      look: string;                        // the prompt text it was made from
      url: string;                         // the Higgsfield https link
      photo: string;                       // 540x960 JPEG data URL, at most 200_000 characters, for when the link stops working
      createdAt: string;
      status: "on" | "off";
    }[];                                   // at most 4 with status "on"
  }
  ```
- A video sends `photo: {url}` when the browser can still fetch the link (a GET, as `download` in `src/lib/aiVideo.ts` does), and `{jpeg}` from the saved copy when it cannot. How long Higgsfield keeps its links is unverified.
- Removing writes `status: "off"`; the item stays so the AI label ledger (people-ai-labels) can still name it.
- No schema change.

### AI and cost

- New `ai-video` mode `{mode:"presenters", prefs, extra?}`, Leo only (403 "Not switched on for this account yet." otherwise). `prefs` holds the chip values as enums, checked by `parseVideoRequest`; `extra` is at most 120 characters. The server writes the three looks itself (`presenterLooks(prefs, extra)` in `ai-video/logic.ts`, the same shape as `LOOKS`, three different backgrounds or ages when the chips leave room), submits three `presenterBody` pictures and returns three tokens. Writing the looks on the server means only `extra` is free text.
- The existing `{mode:"presenter", look}` stays as it is for everyone, on the `ai-image` cap.
- Before any picture is paid for, Jev (`askJev` from `_shared/jev.ts`, pinned `jev-1.13.0`) reads `extra` when it is not empty. The state is `{ look: <extra> }`; the questions live in `ai-video/logic.ts` as `lookQuestions()`, in the house shape `video-assist/broll.ts` uses:
  - `realPerson`: `{ type: "noul", instructions: { question: "Does \`look\` name a real person (a celebrity, a politician, an influencer or someone the writer knows), or ask the presenter to look like one?" }, criteria: { true: "A named or clearly identifiable real person, or 'looks like' / 'in the style of' a real person.", false: "Only general traits: age, gender, background, hair, clothes, glasses, expression." } }`. Refuse at p >= 0.5.
  - `minor`: `{ type: "noul", instructions: { question: "Is the person \`look\` describes under 18?" }, criteria: { true: "A child, teen, student in school uniform, or an age under 18.", false: "An adult, or no age given." } }`. Refuse at p >= 0.5.
  - `readLookCheck(answers)` reads both with `noulOf`.
  - Both thresholds are a starting point. Run 40 typed looks through both (Leo's real phrasings plus celebrity and child cases) and set them from the disagreements before turning this on for anyone else. When Jev returns null the make goes ahead, because `presenterBody` already asks for an invented adult Singaporean, and the server logs "jev: presenter look unread".
- Add the cap `"ai-presenter": 12` to `usageCaps.ts` with the comment "Saved AI presenters (ai-video mode presenters): a Soul v2 picture at about US$0.006 each, 3 per make." The new mode takes 3 uses at once (three `consumeUsage` calls; when the third is refused, the first two are given back with `refundUsage`), and gives them back when Higgsfield fails the submit.
- Cost: about US$0.018 for three options. Videos with a presenter cost what "You speaking" costs today (11 Higgsfield credits a 5 s slice, up to 88 for 30 s, about US$5.50) under `ai-video` and `ai-video-global`.

### Deep links

- `/people?tab=presenters`, and `&presenter=<id>` opens that presenter's card (push).
- `/people?tab=presenters&make=1` opens the sheet (push).
- `/edit?panel=ai&kind=avatar&face=<presenter id>` preselects that presenter (the `face` param from people-my-face).
- Add the builders to `src/lib/links.ts` and the rows to `docs/deep-links.md`.

## Done when

- [ ] Leo makes 3 options, keeps one, and it is still there after a reload and on his second device.
- [ ] Each brand has its own presenters and its own "Who appears" choice; switching brand switches both.
- [ ] "You speaking" preselects the brand's default presenter, and the video made from it shows the same face as the card.
- [ ] A look naming a celebrity is refused before Higgsfield is called (Jev on), and the make still works with Jev off.
- [ ] Removing a presenter keeps it in the data with `status: "off"`.
- [ ] `ai-presenter` is in `DAILY_LIMITS`; making 3 options on `/people` takes 3 `ai-presenter` uses and no `ai-image` use.
- [ ] Other accounts see "AI presenter" in "You speaking" as before (one picture, not saved, on `ai-image`), and mode `presenters` answers them 403.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-presenters` flipped with its `ours` line, in the same commit.

## Tests

- `ai-video/logic.test.ts`: `parseVideoRequest` for `presenters` refuses an unknown chip value and `extra` over 120 characters; `presenterLooks` makes 3 looks naming three different backgrounds when "Any Singaporean" is picked, and keeps the picked gender and age in all three; `readLookCheck` refuses at 0.5 and passes at 0.49 and at null.
- `ai-video/index.test.ts`: a non-Leo caller gets 403 for `presenters`; a refused look takes no `ai-presenter` use; a Higgsfield failure gives all 3 uses back; `presenter` still counts on `ai-image`.
- `src/lib/presenters.test.ts`: at most 4 on; remove keeps the item off; the first kept presenter becomes the default; per-brand keys do not mix.
- `AiVideo` test: with a saved default presenter and a Leo email, its pill is pressed; "Ask each time" presses none.

## Open questions

- Leo: a presenter keeps the same face only in "You speaking" and template clips that start from its picture. Putting the same presenter in new settings and outfits needs a trained Soul character (paid Higgsfield plan, platform route unverified).
- Leo: move today's one-off "AI presenter" in "You speaking" from `ai-image` onto `ai-presenter` for every account too, so presenters stop using Write's 5 images? It changes a cap outside the gate, so this spec leaves it until he says.
- Leo: run the same Jev check on today's free "How your presenter looks" box for everyone? Today nothing reads it before Higgsfield is paid.
- Should the brand's "Who appears" choice also steer remixes and the agent (remix-your-brand, agent-chat)? This spec stores it where they can read it.
- `ai-presenter` has no studio-wide twin, which is fine while two sign-ins can use it (24 pictures a day at most, about US$0.15). Add `ai-presenter-global` before it turns on for anyone else, as the README asks for prepaid pools.

## Related

people-my-face, people-ai-labels, people-face-swap, formats-talking-head, formats-presenter, remix-your-brand, brand-kit, agent-chat
