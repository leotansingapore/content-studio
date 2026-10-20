# Memes

`formats-memes` | formats | phase 3 | status: missing | /north-star#formats-memes

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

15 Oct 2026: "embed it within the tool so it depends on the person's market/website"

A meme only works in the brand's own topic, for its own audience, which is where the second line applies. No direct ask for memes by name; the rest is from the competitor research.

## How the best do it

### Fastlane

Memes are not in the 42 in-app formats Leo's recording shows, so there are no frames. They are on Fastlane's public site:

- The AI meme generator: give it your site's URL and it writes memes about the product on formats pulled from its library of 25,000+ trending ones, you approve them in "Blitz" (swipe to approve or reject), then schedule. Its analytics claim to show which memes drove profile visits, sign-ups and sales ([usefastlane.ai/tools/ai-meme-generator](https://usefastlane.ai/tools/ai-meme-generator)).
- One URL makes a batch across four formats: AI UGC videos, Slideshows, Hook + demo videos and Memes, free plan without a card, paid from US$29 a month on the tool pages ([usefastlane.ai/tools/ai-tiktok-video-generator](https://usefastlane.ai/tools/ai-tiktok-video-generator)).
- "Meme" is among the named formats on the home page ([usefastlane.ai](https://usefastlane.ai)).

How the meme library is licensed, and whether the formats reuse famous meme pictures, is not stated (unverified).

### Others

- Predis.ai has an "AI Meme Maker" that writes memes from a prompt ([predis.ai/pricing](https://predis.ai/pricing/)).
- Meta's Ad Library filters ads by media type, with "memes" and "images and memes" as options, so memes run as paid ads too ([Jon Loomer on the Ad Library](https://www.jonloomer.com/meta-ad-library/)).
- Blotato's Tweet Card template (Minimal, Photo-Video Background) sets a post as a picture, the usual base for a text meme ([help.blotato.com](https://help.blotato.com/llms.txt)).

## What we have today

Nothing makes a meme.

- Text on pictures is drawn only on carousel slides (`src/lib/carouselLayout.ts`), with no outlined text and no full-bleed picture.
- "Make the image" makes one Soul v2 photo with no text (`supabase/functions/ai-image`, cap `ai-image` 5).
- Free stock photos come from Pexels (`stock-media`, cap `stock-search` 100).
- The video editor puts text on video (hook on screen, stickers), which is where a text-over-video meme would come from (`formats-text-over-clip`, `formats-wall-of-text`).
- `formats-static-ad` adds the Image page (`/image`, `src/lib/imageLayout.ts`) that this item builds on.

## Build

Memes are five more layouts on the Image page from `formats-static-ad`, in a "Meme" group, with their own words writer and a joke check. If that page has not shipped yet, build its shell first (route, nav entry, size row, download and Post it for me); the four ad layouts can follow.

```
Image
Layout  Ads: [Headline ad] [Quote card] [Stat card]
        Memes: [Top and bottom] [Nobody / me] [Expectation vs reality] [POV] [Post and reaction]

+-----------------------+   What it's about [ saving for a BTO      ]  [Write 3 memes]
|  WHEN THE BANK SAYS   |
|                       |   ( ) When the bank says 'pre-approved'  /  Me checking the CPF statement
|      (picture)        |   (o) Nobody: / Me at 2am reading HDB loan rules       Best
|                       |   ( ) Expectation: first home / Reality: 4 years of kopi-o kosong
|  ME CHECKING CPF      |
+-----------------------+   Picture [Make one] [From Media] [Free stock]
[Download] [Post it for me]                  Image words: 27 left today
```

### Layouts

Added to `src/lib/imageLayout.ts`. Two small changes in `carouselLayout.ts` serve them: a text node may carry `stroke` and `strokeWidth` (drawn with `paint-order="stroke"`), and an image node's `shape` may be `"square"`, the third value `formats-static-ad` adds next to `"circle"` and `"rounded"`. Text nodes have no outline today (`renderSvg` writes only fill, size, weight and anchor), so `stroke` is new.

| id | label | words (limits) | drawing |
|---|---|---|---|
| `top-bottom` | Top and bottom | top (10 words), bottom (10 words) | picture full bleed; upper-case bold sans in white with a black outline at top and bottom |
| `nobody-me` | Nobody / me | setup line, punch line (12 words each) | white band on top with "Nobody:" and the lines in dark sans, picture below |
| `expectation` | Expectation vs reality | two labels (6 words each) | two pictures stacked, each with its label on a dark strip |
| `pov` | POV | the line after "POV:" (15 words) | picture full bleed, a dark fade at the bottom, "POV:" and the line in white |
| `post-reaction` | Post and reaction | a short post (30 words) | the adviser's own post card on top (headshot, name, handle from the brand kit, no network logo), a reaction picture below |

Sizes come from the Image page: Feed 4:5, Square, Story 9:16. Memes default to Square.

### Pictures

Memes never use famous meme pictures, film stills or anyone's real photo but the adviser's own. The picture is one of:

- "Make one": Soul v2 through `ai-image` (a 3:4 picture, cropped to the layout), from a short reaction prompt the page builds from a pick list ("staring at the phone in disbelief", "laughing at a laptop", "hand on forehead", "calm and smug", "tired at a desk late at night") plus the setting the words suggest. The studio's people rule keeps people Singaporean and each one different. The adviser can edit the prompt before making it. A made picture with a person in it shows the line "AI-made picture. Label the post as AI-made." under it (see `people-ai-labels`).
- "From Media": the device media library, including the adviser's own photos.
- "Free stock": Pexels search through `stock-media`, with the photographer's credit kept as today.

`expectation` needs two pictures; "Make one" makes both from the two labels, which takes two `ai-image` uses, and the button says so ("Make both, 2 of your 5 AI images today").

### Words

`carousel-copy` mode `meme` (today the function only tightens slides and has no `mode` field; `formats-static-ad` adds the field with mode `image`, and whichever ships first adds it): `{layout, topic? | draftText?, brand: {name, oneLiner, audience, topics}}` returns `{options: [{...words}]}` with 3 options for the layout. The browser fills `brand` from the brand kit's name (`loadBrand`) and the open brand's positioning (`loadPositioning` in `src/lib/positioning.ts`: `oneLiner`, `audienceDetail`, `topics`), so each brand's memes land in its own market; with no positioning saved, the topic alone goes. The prompt: jokes about the moment the audience lives through (paying the bills, saving for a flat, a parent asking about insurance), from that positioning, in Singapore English the audience uses, short. The rules: never mock clients, a race, a religion, a named company or a competitor; no promised returns or results; no insurer or product names; no real person's name or face.

Jev then reads the three options (below), drops any that fail the safety question, and marks the best one "Best". The LLM never picks.

### Screens and states

- Empty: the Meme group under the ad layouts; picking one shows sample grey words and a placeholder picture.
- Writing: "Writing 3 memes..." with the orb; the topic box and button are locked.
- Options: three radio rows, Jev's pick selected and tagged "Best". Picking another redraws at once.
- All three dropped by the safety check: "None of these were safe to post. Try another topic." The cap use is refunded.
- Making a picture: "Making your picture..." then it drops in; the words stay.
- Ready: live preview, every field editable, counters per field.
- Done: Download, Post it for me, and the design saved to "Your images" with its layout.
- Failed: "Couldn't write them right now. Try again in a minute." Anything typed stays.
- Compliance: the chosen words go through `scanCompliance` and Jev's MAS question; a flag shows the warn chip and does not block, unless a team leader set the rule to block.
- Over the cap: "You've used all 30 for today. It resets at 8am Singapore time." Typing your own words still works.

### Copy

- Group label "Memes"; layout labels "Top and bottom", "Nobody / me", "Expectation vs reality", "POV", "Post and reaction"
- "What it's about", placeholder "Saving for a BTO"
- "Write 3 memes", "Write 3 more", "Best"
- "None of these were safe to post. Try another topic."
- Picture: "Make one" with the chip "0.09 Higgsfield credits (about US$0.01)", "From Media", "Free stock"; reaction picks "Disbelief", "Laughing", "Facepalm", "Smug", "Tired"
- "Writing 3 memes...", "Making your picture..."
- Uses left, in the `Left` format: "Image words: N left today"
- Under a made picture with a person: "AI-made picture. Label the post as AI-made."

### Data

- No table and no schema change.
- Saved memes go in `content-studio-images-${scoped(userId)}` with the ad designs (from `formats-static-ad`), `layout` set to the meme layout id and `words` holding its fields.
- Pictures stay in the device media library, as for the Image page.

### AI and cost

- Words: `carousel-copy` mode `meme`, the OpenAI model from `openaiChat.ts`, under 1 US cent for three options. It counts against `image-copy` (30 a day, added by `formats-static-ad`), so no new cap.
- Jev, one call over the three options:
  - `funny` for each option, type `score`, instructions: "A Singapore financial adviser wants to post this meme for people aged 25 to 45. How likely is that audience to find it funny and relatable enough to share?" criteria: 1 "flat, no one would react", 2 "mildly amusing", 3 "relatable, some would like it", 4 "very relatable, many would share it". The highest score is "Best".
  - `unsafe` for each option, type `noul`, instructions: "Does this joke mock a group of people, a race or religion, a named company or competitor, or someone's money troubles in a way that could offend or embarrass the adviser?" Proposed threshold: drop the option at 0.4 or more.
  - `mas` on the chosen option: the `MAS_QUESTION` from `formats-skits`, warn at 0.5.
  - Set the thresholds after writing 60 memes over Leo's three brands and reading every score. Null keeps all three options, picks none as "Best", and falls back to `scanCompliance`.
- Picture: Soul v2 at 0.09 credits (about US$0.006), cap `ai-image` 5, or free stock.
- Fastlane's meme price is not public on the tool page (unverified).

### Deep links

| URL | Opens |
|---|---|
| `/image?layout=pov` | The Image page on that meme layout. Values: top-bottom, nobody-me, expectation, pov, post-reaction (added to the `layout` values from `formats-static-ad`). Replace. |
| `/image?layout=pov&draft=<postId>` | Pre-filled once from that post's text, then `draft` leaves the address |
| `/image?image=<savedId>` | A saved meme open |

Add the meme values to the `image` builder's `layout` union in `src/lib/links.ts` and to the `/image` rows in `docs/deep-links.md`.

### Gate

As the Image page: nav `owners: LEO_EMAILS`, `NotFoundPage` for anyone else, and `carousel-copy` mode `meme` refuses anyone else with 403 via `supabase/functions/_shared/leoOnly.ts`.

## Done when

- [ ] All five meme layouts draw at Square, Feed 4:5 and Story 9:16 with outlined text readable on a light and a dark picture, checked by eye at 390 px and 1440 px.
- [ ] "Write 3 memes" on three topics per brand (Leo, MoneyBees, FINternship) gives options in that brand's topic, with one marked "Best".
- [ ] A topic that invites a joke about a race or a named insurer comes back with those options dropped or with the "None of these were safe" state.
- [ ] No layout, prompt or sample uses a famous meme picture or a real person's name.
- [ ] Download and Post it for me work for a meme.
- [ ] Non-Leo accounts get the 404 page.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/imageLayout.test.ts`: each meme layout fits its frame at the three sizes; outlined text nodes carry `stroke`; long words end in "..." and set `overflow`.
- `src/lib/carouselLayout.test.ts`: `renderSvg` writes `stroke` and `paint-order` only when a node has them, so carousels draw exactly as before.
- `supabase/functions/carousel-copy/logic.test.ts`: `meme` mode parsing per layout; the reply validation needs 3 options with the layout's fields within limits.
- The Jev path: options scoring at or over the `unsafe` threshold are dropped; all dropped gives the refund and the empty state; a null answer keeps all three with no "Best".
- `src/lib/links.test.ts`: the meme layout values pass through the `image` builder.

## Open questions

- Fastlane's strength is its library of trending meme formats. A trending meme feed belongs to `find-trending-formats`; once it exists, "Remix as a meme" there should open this page with the source kept. Until then memes start from a topic or a post.
- Video memes (text over a short clip) are left to `formats-text-over-clip` and `formats-wall-of-text`.
- Humour in an adviser's feed is a brand call. Should memes show for adviser brands at all, or only for MoneyBees and FINternship at first? Leo decides.

## Related

`formats-static-ad`, `formats-text-over-clip`, `formats-wall-of-text`, `find-trending-formats`, `remix-any-format`, `remix-your-brand`, `brand-audiences`, `brand-kit`, `trust-compliance-check`, `edit-design-canvas`
