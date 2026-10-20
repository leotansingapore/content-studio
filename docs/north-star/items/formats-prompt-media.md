# Images and clips from a prompt

`formats-prompt-media` | formats | phase 3 | status: partial | /north-star#formats-prompt-media

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate". Pictures and short clips made from a prompt or a reference are the raw material most other formats draw on.

## How the best do it

Fastlane. The last row of Studio > Content formats has two icon tiles. Hovering Images shows its link, `/v2/studio/create/ai?tab=images`, in the status bar (t139, t198); the Videos tile's link never shows, so it is probably the same page on another tab (unverified):
- "Images", "Generate a still from a prompt or a reference", price chip "From 2 credits", orange note "Cannot post as a still".
- "Videos", "Animate a still into a short clip", price chip "From 48 credits".

The tiles have no preview, only an icon. The recording never opens the page, so its fields, model list and result screen are unverified. Senna's composer also carries "Image" and "Video" chips, and Home's "Ask Senna for" tiles include "Ads and images" ("Make a 4:5 ad for my business"), so a prompt can start from chat as well (notes-1.md, notes-2.md). "From" pricing means the price moves with the options picked. Fastlane's public /models page lists 12 models: video (Vidu Q4, Gemini Omni, Sora 2 marked discontinued, Veo 3.1, Kling 3.0, Kling 4.0, Wan 2.6, Grok Imagine, Seedance 2.5, MiniMax H3) and image (GPT Image 2.5, Seedream 5.0), with no per-model prices ([models](https://usefastlane.ai/models)).

![Fastlane 2:19](../../../public/north-star/fastlane/t139.webp)
![Fastlane 3:18](../../../public/north-star/fastlane/t198.webp)

Others:
- VEED AI Playground: text-to-video and image-to-video with Veo, Seedance, Minimax, Pixverse, Kling, Luma Ray, LTX and Wan. The credit cost shows next to each model and again before generating, and credits are taken only on success, so a failed run is free ([help](https://support.veed.io/en/articles/11712887-ai-playground)). Third-party burn estimates run from about 2 credits a second (in-house) to about 50 (Veo 2) ([usagepricing](https://usagepricing.com/blueprint/veed-ai), unverified).
- ContentStudio AI Studio: "Text to Image", "Image to Image", "Product Shot", "Headshot" and more, any aspect ratio, models GPT Image, Imagen, Flux and Qwen, with outputs compared side by side across models. Image credits are 25, 50 or 125 a month; video credits 100, 200 or 500, takes up to 30 seconds at up to 4K, straight into the publishing queue ([AI studio](https://contentstudio.io/ai-studio), [pricing](https://contentstudio.io/pricing)).
- Agorapulse Archie Image Studio: "Generate an image" after a text post, with "References" in three modes ("Layout", "Blend", "Style only"), "Type" ("Visual hook", "Infographic", "Illustration"), "Text in image", "Branding", "Style", up to 4 outputs, and an Edit tab to crop, add text or describe and "Redraw" ([help](https://support.agorapulse.com/en/articles/15452272-how-to-generate-posts-with-archie)).
- Atria's image API takes a brief, a brand, an aspect ratio (1:1 default, 4:5, 9:16), 1 to 20 variants and an optional reference image. Credits are reserved on submit and refunded for failed images ([API](https://docs.tryatria.com/reference/create_image_generation.md)).
- Descript fills an empty scene with "Generate": prompt, reference image or start and end frame, then style, ratio, count or duration, and resolution, priced by model ([help](https://help.descript.com/generative-media/generate-media.md)).
- InVideo bills video per second by model: Seedance 2.5 at 1080p about 96 credits per 5 seconds, 720p about 56, draft about 24.5; Nano Banana Pro about 2.5 credits an image ([pricing](https://invideo.io/pricing), [help](https://help.invideo.io/en/articles/11528140-invideo-plans-and-credits-everything-you-need-to-know)).
- Blaze animates a brand-kit image with Veo 3 at 15 credits a video and per regeneration, no style choice ([help](https://help.blaze.ai/en/articles/13190718-ai-videos)). Edits (Instagram, by Meta) has a free "AI Animate" that reviewers call blurry ([review](https://www.planoly.com/blog/instagrams-edits-app-review.md)).

## What we have today

Checked against 08537d1 on 2026-10-20, and again at origin/main f2cb275 the same day (no change to these files). Every piece is a side door inside another page; nothing lets an adviser type a prompt and get pictures or a clip.

- Write's "Make the image" (src/lib/aiImage.ts, supabase/functions/ai-image mode `start`): only the post's own image prompt, which Write generates and shows read-only, one picture, Higgsfield Soul v2 (`higgsfield-ai/soul/v2/standard`) at 3:4 and 1080p, about US$0.006, saved to Media folder "AI images" and capped by `ai-image` at 5 a day, with no refund when the job fails.
- "Fix it" (`fix` mode): Qwen Image 3 edit (`alibaba/qwen-image-3/edit`) at 2k and 3:4 (`buildFixBody`) of a picture this adviser made: the token proves ownership and the server reads the picture's link from Higgsfield. Caps `ai-image-fix` 5 and `ai-image-fix-global` 40.
- An AI presenter from a description (ai-video mode `presenter`, on "You speaking"): one Soul v2 picture at 9:16 from a look of 10 to 300 characters, on the `ai-image` cap.
- AI B-roll in the editor (`broll` mode, supabase/functions/ai-image/broll.ts): a Soul v2 picture at 720p moved 5 seconds by DoP lite (`higgsfield-ai/dop/lite`), 0.05 plus 2 credits, about US$0.13, only when stock has nothing and `AI_BROLL_ENABLED` is "1". Caps `ai-broll` 3, `ai-broll-global` 20. Its `MOTION_PROMPT` is a private constant in broll.ts.
- Template clips (supabase/functions/ai-video, `template` mode): Seedance 2.5 text, reference or image to video, 4 or 8 seconds at 480p or 720p with generated sound, US$0.82 to US$3.70, prompt written by gpt-4.1 from a template's blanks. Caps `ai-clip` 2, `ai-clip-global` 8. A person's photo goes in as the first frame (`SEEDANCE_FRAME`).
- ai-video already has the pieces a prompt page needs: an internal `upload` helper in index.ts (a base64 file onto Higgsfield storage), a `status` mode that reads up to 6 tokens at once (`MAX_SCENES`), and refund tickets (`REFUNDS`, `refundTicket`, `refundFailed`) for `ai-video` and `ai-clip`. ai-video signs its tokens with ai-image's `tokenSecret`, so ai-image's `fix` accepts them.
- Costs show as "N Higgsfield credits (about US$X)" (`cost()` in src/components/AiVideo.tsx, using `CREDIT_USD` 0.0625 from supabase/functions/ai-video/logic.ts).
- Write can attach a free Pexels photo or your own pictures to a draft (`attachFiles`, `attachStock` in src/pages/GeneratePage.tsx), only after the draft is saved ("Write the post first, then attach.").

## Build

A page with two tabs, Images and Videos, like Fastlane's. Images makes 1 to 4 pictures from a prompt, optionally from a reference picture. Videos animates one picture into a short clip. Results land in Media or open in the editor.

### Screens and states

The route is `/make/ai`, since formats-gallery puts new format pages at `/make/<slug>` and Fastlane's own page is `/create/ai?tab=images`. The file is src/pages/AiMediaPage.tsx, lazy in src/App.tsx inside the studio block, and it renders NotFoundPage unless `leoOnly(email)`. If formats-gallery has not added a `/make/:slug` route by then, add `"/make/ai"` to `EXCEPTIONS` in src/lib/navRoutes.test.ts with the reason "a format page opened from /make and Media; Leo only".

The registry `src/data/formats.ts` gets two entries. `images` is kind "slides" with `priceKind` "from", `price()` of one Soul picture, `cap` `prompt-image` and `to` `/make/ai`; `videos` is kind "video" with `priceKind` "from", `price()` of one Quick animate, `cap` `animate-quick` and `to` `/make/ai?tab=videos`.

Images tab:

```
Images | Videos
Describe it
[ A young couple at an HDB kitchen table going through bills, warm morning light ]
Start from a picture (optional)   [ Add a picture ]
   (o) Use its layout only    ( ) Change my own photo  [ ] This is my own photo
Shape:  Tall 9:16 | Post 3:4 | Square | Wide 16:9
How many:  1 | 2 | 4
[ Make 2 images ]  about US$0.01            Images: 8 left today
```

- Empty: the prompt box is focused, Make is disabled until 10 characters, helper "Say what the picture shows."
- Reference added: thumbnail with "Remove". "Use its layout only" is the default and works for any picture, including a competitor's ad, because only a written description travels to the model. "Change my own photo" needs the "This is my own photo" box ticked before Make enables.
- Making: within 400 ms the grid shows N placeholders with "Making 2 images..." and the ThinkingOrb; each fills as its job finishes ("1 of 2 ready").
- Done: each picture has "Animate", "Download", "Fix it" (the existing ai-image `fix` flow, which accepts these tokens because ai-video signs them with the same `tokenSecret`; `buildFixBody` gains a shape argument so a 9:16 picture is not returned at 3:4) and "Use in a post", which opens `/generate?media=<media key>`. That is a new Write param, read once. Write's `attachWith` needs a saved draft, so Write holds the key and attaches it through `attachWith` as soon as the first draft is saved, with the line "Your picture is attached once the post is written." Pictures are already saved to Media "AI images", and the line "Saved to Media" says so.
- Failed (one or all): the failed slot shows the provider's message from `readMedia`, for example "The safety filter blocked it. Try another photo or wording.", with "Try again", and the use is refunded.
- Reference refused: the layout description named a brand or carried readable text twice running (Jev below): "That picture is mostly text or branding. Try one with a clear scene."
- Over the cap: Make is disabled, "Images: none left today", and the count pills above what is left are disabled.
- Not allowed on the server: "This isn't switched on for your account yet."

Videos tab:

```
Picture  [ pick from your images ] [ from Media ] [ upload ]
What moves (optional)  [ she looks up from the bills and smiles ]
Quality:  (o) Quick, 5 seconds          about US$0.13
          ( ) Best, 4 or 8 seconds, 480p or 720p   about US$0.82 to US$3.70
[ Animate it ]                                      Clips: 2 left today
```

- No picture: Animate disabled, helper "Pick a picture first."
- A picture from Media or an upload (one this page did not make) shows the box "This is my own photo", and Animate stays disabled until it is ticked: faces are your own first, and only pictures made here are known to show AI people.
- Making: "Animating... usually 1 to 3 minutes." The job runs outside React (module store), so the adviser can leave; the page shows it again on return.
- Done: a 9:16 player with "Open in the editor" (the clip becomes a project the way template clips do) and "Download".
- Failed, refused and over-cap states as on Images, with "Clips: none left today".

Prices sit on every paid button (business-cost-preview). Use that item's chip when it has shipped, otherwise the `cost()` text from AiVideo.tsx.

### Copy

- Tabs "Images", "Videos"
- Labels "Describe it", "Start from a picture (optional)", "Use its layout only", "Change my own photo", "This is my own photo", "Shape", "How many", "Picture", "What moves (optional)", "Quality"
- Shape pills "Tall 9:16", "Post 3:4", "Square", "Wide 16:9"
- Quality pills "Quick, 5 seconds", "Best, 4 or 8 seconds"; under Best, "Length: 4 seconds | 8 seconds" and "Sharpness: 480p | 720p"
- Buttons "Make 1 image" or "Make N images", "Animate it", "Animate", "Download", "Fix it", "Use in a post", "Open in the editor", "Try again", "Add a picture", "Remove"
- Placeholders "A young couple at an HDB kitchen table going through bills, warm morning light", "she looks up from the bills and smiles"
- Helpers "Say what the picture shows.", "Pick a picture first.", "Saved to Media", and in Write "Your picture is attached once the post is written."
- Progress "Making N images...", "1 of N ready", "Animating... usually 1 to 3 minutes."
- Uses "Images: N left today", "Clips: N left today", and "none left today"
- Refusals "That picture is mostly text or branding. Try one with a clear scene.", "This isn't switched on for your account yet."
- Small model line under each tab: "Made with Higgsfield Soul" (Images), "Made with Higgsfield DoP or Seedance 2.5" (Videos)

### Data

- Pictures: Media (IndexedDB, device only), folder "AI images", alt text from the prompt, through `storePicture` and `addMedia` as src/lib/aiImage.ts does.
- History, synced: `content-studio-aimedia-${scoped(userId)}`, the last 30 makes as `{id, tab, prompt, shape, quality, seconds, tokens, mediaKeys, madeAt, state}`. Another device lists them and can fetch a picture again through `status` while Higgsfield keeps the file (its retention is unverified).
- Clips: device only, as an editor project after "Open in the editor"; "Download" saves the file.
- Pictures and clips made here can show AI-made people, so when people-ai-labels ships, its AI label goes on them before they post.
- Job store: a new src/lib/aiMedia.ts with the module-level job and listeners pattern of aiImage.ts, polling ai-video `status` every 2.5 seconds for up to 4 minutes (8 for Best).
- Nothing here needs a table or a schema change.

### AI and cost

New modes in supabase/functions/ai-video (it already has `upload`, `status` for many tokens and refund tickets), pure parts in logic.ts:

- `still`: `{prompt, shape, count, layout?: jpeg}` returns `{tokens, refund}`. One Soul v2 request per picture (`batch_size: 1`, since `readMedia` reads only the first image) with the people rule (`PEOPLE_RULE`), `aspect_ratio` from shape ("9:16", "3:4", "1:1", "16:9"), 1080p. With `layout`, OpenAI first describes the picture through `openaiFetch` (the vision call reel-visuals already makes: the OPENAI_MODEL secret, gpt-4.1 as the fallback) under the rule "Describe the layout, setting, light, colours and kinds of people or objects. Never name a brand, a logo, a real person or any words shown." and that description joins the prompt.
- `still-edit`: `{jpeg, prompt, own: true}` uploads the adviser's photo and runs Qwen Image 3 edit (`FIX_MODEL`) with the keep-the-rest rule, and refuses any call without `own: true`.
- `animate`: `{photo: {url}|{jpeg}, own?: true, quality: "quick"|"best", seconds?: 4|8, resolution?: "480p"|"720p", motion?}`. A `jpeg` (a Media or uploaded picture) is refused without `own: true`; a `url` must be one this adviser's `still` made, read back through its token like `fix` does, never a link the browser sends. Quick is DoP lite for 5 seconds with `motion` or broll.ts's `MOTION_PROMPT` (export it); Best is `seedanceRequest(prompt, seconds, resolution, {role:"person", url})` with the prompt "Animate this picture: <motion or a gentle natural movement>. Keep every face exactly as it is."
- `REFUNDS` in ai-video/logic.ts gains `prompt-image`, `animate-quick` and `ai-image-fix` with their global caps, so `refundFailed` gives a failed picture, clip or edit back (ai-image's own `fix` mode never refunds today; `still-edit` does). `image-describe` is refunded with `refundUsage` when the vision reply is unusable. `status` keeps its 6-token limit, enough for 4 pictures.

Jev, one question, on the layout description: a Noul (Jev's yes or no type in supabase/functions/_shared/jev.ts) with state `{description}` and the question "Does `description` mention a brand name, a logo, a real named person, or words that would show as readable text in the picture?" Pass under 0.3. At 0.3 or more, rewrite the description once with that rule repeated and ask again; a second fail refuses as above. Jev null passes, since the people rule already says no text and no logos. Read these answers in shadow on Leo's first 30 references before trusting the 0.3.

Costs and caps (add the new ones to supabase/functions/_shared/usageCaps.ts with comments; refund each on failure through `REFUNDS`):

| Action | Provider and model | Cost per run | Caps |
| --- | --- | --- | --- |
| Picture from a prompt | Higgsfield Soul v2 standard, 1080p | 0.09 credits, about US$0.006 a picture | new `prompt-image` 10, `prompt-image-global` 100 |
| Layout from a reference | OpenAI vision (OPENAI_MODEL, gpt-4.1 fallback), then Jev, then Soul v2 | about US$0.01 plus the pictures (unverified on the new model) | new `image-describe` 10, plus `prompt-image` |
| Change my own photo | Qwen Image 3 edit at 2k | not in the code; read Higgsfield's free POST /estimate before shipping | existing `ai-image-fix` 5, `ai-image-fix-global` 40 |
| Animate, Quick | DoP lite, 5 seconds | 2 credits, about US$0.13 | new `animate-quick` 3, `animate-quick-global` 20 |
| Animate, Best | Seedance 2.5 image to video | US$0.2056 a second at 480p, US$0.4622 at 720p: US$0.82 to US$3.70 | existing `ai-clip` 2, `ai-clip-global` 8 |

Each new mode also answers 403 unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (supabase/functions/market/logic.ts); `NORTH_STAR_USERS` is a new secret holding Leo's two uids. Global caps protect the prepaid Higgsfield pool: 100 pictures is about US$0.60 a day and 20 quick clips about US$2.50.

### Deep links

- `/make/ai` is the Images tab; `?tab=videos` the Videos tab (replace).
- `?prompt=<words>` pre-fills Describe it once, for Remix and the in-app assistant (AssistantDock, assistant-act) (replace).
- `?shape=9:16|3:4|1:1|16:9` and `?count=1|2|4` set the pills (replace; defaults 3:4 and 1 left out).
- `?tab=videos&from=<media key>` pre-picks a Media picture to animate (push).
- `?item=<history id>` opens one past make (push, Back closes it).
- `/generate?media=<media key>` attaches one Media picture to a new Write post (push).
- Add an `aiMedia` builder and a `media` field on `links.generate` in src/lib/links.ts, and both to docs/deep-links.md.

## Done when

- [ ] Leo's sign-in opens `/make/ai`; another sign-in gets the 404 page, and a direct call to `still` from another uid gets 403.
- [ ] Animate on a Media picture stays disabled until "This is my own photo" is ticked, and the server refuses a `jpeg` without `own`.
- [ ] "Use in a post" on a new Write page attaches the picture once the first draft is saved.
- [ ] A prompt with "How many: 2" and "Tall 9:16" gives two 9:16 pictures in Media "AI images" in under a minute, with the price shown before Make.
- [ ] A competitor ad screenshot with "Use its layout only" gives a new picture with no logo or words from the ad.
- [ ] "Change my own photo" stays disabled until "This is my own photo" is ticked.
- [ ] Quick animate of one of those pictures gives a 5-second clip that opens in the editor.
- [ ] A safety-blocked or failed job shows the plain message and the use comes back (uses left goes up by one).
- [ ] Leaving mid-make and returning shows the job still running.
- [ ] Every view and open item is in the URL as listed; 390 px and 1440 px checked by eye; build and full vitest green.

## Tests

- supabase/functions/ai-video/logic.test.ts: parsers for `still`, `still-edit` and `animate` refuse a short prompt, clamp `count` to 1, 2 or 4, refuse an unknown shape, refuse `still-edit` and a `jpeg` animate without `own`, and build the DoP and Seedance bodies; the cost helpers give 0.09 credits a picture, 2 credits for Quick and US$0.82 to US$3.70 for Best; `REFUNDS` maps `prompt-image`, `animate-quick` and `ai-image-fix` to their global caps.
- The Jev verdict helper passes under 0.3, asks for one rewrite at 0.3 or more, and passes on null.
- usageCaps.test.ts: the five new caps (`prompt-image`, `prompt-image-global`, `image-describe`, `animate-quick`, `animate-quick-global`) exist with the values above, and `REFUNDS` pairs each per-user cap with its global one.
- src/lib/aiMedia.test.ts: a failed token marks only its slot failed; history keeps the newest 30.
- src/lib/links.test.ts: `links.aiMedia({ tab: "videos", from: "m1" })` is `/make/ai?tab=videos&from=m1`; defaults are left out.
- src/lib/navRoutes.test.ts stays green (a `/make/:slug` route or the new exception); src/data/formats.test.ts (formats-gallery) passes with the two new entries.

## Open questions

- Leo: more models. Higgsfield (already prepaid) serves other image and video models, each at its own price; competitors list 10 or more. This spec keeps the ones wired today. Adding one is a cost decision for Leo, though not a new vendor.
- Leo: whether "Use its layout only" may take competitors' ad images. Only a description travels, never pixels, which is the remix rule; Leo confirms.
- The code uses Soul v2 at 9:16, 3:4, 1:1 and 16:9 today, and nothing shows it accepts 4:5. The page offers 3:4 like Write until Higgsfield's schema confirms 4:5; the builder checks that schema before adding a 4:5 pill.
- Fastlane says "Cannot post as a still". Ours can, since Post it for me takes pictures for Instagram, Facebook and LinkedIn; TikTok photo posts are formats-slideshow.

## Related

formats-gallery, formats-static-ad, formats-slideshow, formats-text-over-clip, formats-animated, edit-video, brand-media-library, people-presenters, people-my-face, people-ai-labels, business-cost-preview, remix-any-format
