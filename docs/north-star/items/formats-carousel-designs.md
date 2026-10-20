# Carousel designs

`formats-carousel-designs` | formats | phase 3 | status: partial | /north-star#formats-carousel-designs

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

A carousel is the format most remixes of a text post or a reel turn into, so its designs decide how most remixed posts look. No direct ask for carousel templates; the rest is from the competitor research.

## How the best do it

Fastlane has no carousel designer of its own; its photo carousel is the TikTok-style Slideshow, covered in `formats-slideshow`. The carousel tools below are the reference.

- Contentdrips: 100+ templates for carousels, quotes and reels in Instagram, LinkedIn and Twitter groups (basic ones free, Pro ones paid). Its AI carousel generator fills a template from a topic, a blog URL, a YouTube video, a TikTok or Reel, or raw text, with a "Use my branding" toggle and a "1:1 Square" option. Credits: 50 free, 500 Starter, 1,200 Pro. Also "CSV to Carousel" ([contentdrips.com](https://contentdrips.com/), [pricing](https://contentdrips.com/pricing/)).
- Taplio: start "From scratch", from AI input, or from a website or YouTube URL. It suggests a hook slide, body slides and a CTA, 7 to 10 slides. Tabs "Content", "Settings", "Color Palette" (or "Use custom colors"), "Preview", drag to reorder; finish with "Save for later", "Create Post" or "Download" as a PDF ([Taplio help](https://intercom.help/taplio/en/articles/17173404-how-to-use-the-carousel-generator)).
- koomastudio: your colours and headshot, 24 built-in themes, PDF export for LinkedIn ([koomastudio.com](https://koomastudio.com/)).
- aiCarousels: LinkedIn 4:5, Instagram feed, Stories 9:16 and TikTok 9:16; a high-resolution PDF for LinkedIn or a JPG set for Instagram and TikTok; inputs Topic, Text, Website, YouTube and PDF ([aicarousels.com](https://www.aicarousels.com/), [gtm directory](https://thegtmdirectory.com/tools/aicarousels)).
- PostNitro: topic, raw text, article URL, an X thread, or CSV; 1 credit a pasted slide and 2 an AI slide; AI slides per carousel 5 Free, 8 Starter, 15 Creator+, 20 Team+ ([postnitro.ai](https://postnitro.ai/), [pricing](https://postnitro.ai/pricing)).
- Reepl: Topic, YouTube, Article or PDF in; 5 to 20 slides or "Auto" ([reepl.io](https://reepl.io/)).
- Blotato's catalogue has Tutorial Carousel (Minimalist Flat, Monocolor), Tweet Card and Quote Card designs ([help.blotato.com](https://help.blotato.com/llms.txt)).
- Limits elsewhere: ViralBrain 5 carousels a month on Pro ([viralbrain.ai/pricing](https://www.viralbrain.ai/pricing)), ContentIn 4 a month on Growth ([contentin.io](https://contentin.io/)). Predis.ai has Blog to Carousel ([predis.ai/pricing](https://predis.ai/pricing/)); MagicPost puts the "Brand kit on every visual" ([magicpost.in](https://magicpost.in/)). Publer gets its carousels through PostNitro and Contentdrips partnerships ([Publer 2025 review](https://publer.com/blog/de/2025-jahresrueckblick/)).

## What we have today

The carousel maker at `/carousel` (`src/pages/CarouselPage.tsx`, `src/lib/carousel.ts`, `src/lib/carouselLayout.ts`, `src/lib/carouselRender.ts`, `src/lib/pdf.ts`):

- Sources (`?tab=`): "From My posts", "Paste text", "From a topic" ("Topic, or paste an article"; one AI call writes the post, and Jev offers a text post when the topic is one point, not steps), and "Saved".
- 2 to 10 slides: a cover hook of up to 6 words, one point a slide at up to 40 words, a CTA, an optional recap slide.
- Look: brand colour presets plus a custom hex, the headshot or logo, slide pictures from Media, three font pairs (`SLIDE_FONTS`: Classic, Modern, Editorial, system fonts only, since an SVG drawn into a canvas cannot load web fonts), three papers (light, dark, tint), left or centred, text size 0.8 to 1.25.
- Output: 1080x1350 PNGs ("Download all") or one PDF for a LinkedIn document post. Saved carousels per brand in `content-studio-carousels-${scoped(userId)}` (latest 20) reopen with their edits.
- "Tighten with AI" (`carousel-copy`, cap `carousel` 30) rewrites the copy MAS-safe.
- Post it for me already posts a saved carousel as pictures: on a draft with a carousel it offers "Carousel slides (n)", draws each slide to PNG on the device (`carouselPngs` in `src/components/PostItForMe.tsx`) and sends up to 10. On LinkedIn those arrive as a picture post, not a swipeable document.

What is missing: there is one layout family, so every carousel looks the same with a different colour. There is no 1:1 or 9:16 size, no way in from a video link, and Post it for me cannot send the PDF to LinkedIn as a document (`MEDIA_TYPES` in `supabase/functions/social/posts.ts` has no PDF).

## Build

Four changes on the existing page, in this order.

### 1. A design picker

A "Design" row above the slides, showing each design as a small preview drawn from the adviser's own cover and first point slide (SVG, free, drawn on open). Picking one redraws all slides at once.

```
Design   [Clean] [Bold cover] [Numbered] [Checklist] [Post card] [Photo cover] [Quote] [Notebook]
          Recommended: Numbered
Size     [4:5] [1:1] [9:16]
```

New file `src/lib/carouselDesigns.ts` with the eight designs as data. `layoutSlide` in `carouselLayout.ts` takes an optional `design` and branches on a few switches, so each design is a combination, not a new drawing routine:

| id | label | cover | point slides | default font and paper |
|---|---|---|---|---|
| `clean` | Clean | today's | today's | as the brand saved them |
| `bold` | Bold cover | full brand-colour cover, hook in white, very large | today's | Modern, light |
| `numbered` | Numbered | today's | a large "01", "02" in the brand colour above the title | Modern, light |
| `checklist` | Checklist | today's | each body line starts with a ticked box | Classic, tint |
| `post-card` | Post card | today's | each slide is a white card with the headshot circle, name and handle at the top, like a social post | Modern, light |
| `photo-cover` | Photo cover | the cover picture full bleed with a dark fade and the hook over it | today's | Classic, dark |
| `quote` | Quote | today's | large quote marks, body in serif | Editorial, light |
| `notebook` | Notebook | today's | faint ruled lines behind the body, a margin line in the brand colour | Editorial, light |

Fonts and papers stay changeable after a design is picked; the design only sets their starting values. Text contrast still goes through `readableOn` and `contrastRatio`.

### 2. Sizes

`4x5` 1080x1350 (default, today), `1x1` 1080x1080, `9x16` 1080x1920. `SlideInput` gets `size`; `layoutSlide` reads its height from it instead of `SLIDE_HEIGHT` (`SLIDE_WIDTH` and `SLIDE_HEIGHT` appear on 17 lines in `src/lib` and `src/pages` outside tests; keep them as the 4:5 default). 9:16 keeps 250 px clear at top and bottom for the app's buttons. The PDF is offered for 4:5 and 1:1 only; 9:16 downloads as PNGs for TikTok photo mode and Stories.

### 3. From a video link

A fifth source tab, "From a link". Paste a YouTube, Instagram reel or TikTok link:

- YouTube: the transcript from `youtube-captions` (DataForSEO, about US$0.006, cap `yt-captions` 10).
- Instagram reel or TikTok: the transcript from `clone-reel` called with `{url, style: true}`, the read-only path "Copy a reel's style" uses: Apify reads the post, no OpenAI call, cap `reel-style` 20, and a post already in `cs_reel_sources` costs nothing. The full clone (`reel-clone`) would also pay for a breakdown this tab does not need.

The transcript then goes through the existing "From a topic" writer as if pasted as an article, so the carousel keeps the video's points in the adviser's words. Web articles are left to `remix-any-link`, which will read any page; until then the tab says "Paste the article's text in From a topic."

### 4. LinkedIn document posts

Post it for me sends the PDF as a LinkedIn document. Zernio's `MediaItem` has `type: "document"` and a `title`, and `LinkedInPlatformData` has `documentTitle`, "Required by LinkedIn for document posts" (zernio.com/openapi.json, read 2026-10-20). In `supabase/functions/social/posts.ts`: allow `application/pdf` (`pdf`) in `MEDIA_TYPES` (our presign check reads the same table, and Zernio's presign lists `application/pdf` in `MediaContentType`), for LinkedIn only and one file, with `fileType` and `fileProblem` in `src/lib/autoPost.ts` taught the same type, and refuse it in `platformProblem` for other platforms with "Only LinkedIn takes a PDF. Post the pictures for Instagram." `postBody` today sends every media item as `{url}`; for a PDF it sends `{url, type: "document", title}` and the LinkedIn entry's `platformSpecificData.documentTitle`, both the carousel title. The PDF size limit LinkedIn accepts is unverified; keep our own at 20 MB, far above what `pdf.ts` makes. Zernio has no dry run for posts, so `posts.test.ts` proves the body without any network call, and the first real check is one document post scheduled a week ahead on Leo's own LinkedIn with his OK, read back as scheduled, then cancelled.

### Screens and states

- Empty: as today; the Design row appears once slides exist, on the design last used for this brand.
- Recommended: after slides are made, Jev's pick gets a "Recommended" tag. No tag when Jev is unsure or down.
- Picking a design or size: all slides redraw at once (SVG, well under 400 ms for 10 slides).
- Too long for 1:1: the shorter frame fits less; slides that overflow show the existing "..." and the existing overflow note, and "Tighten with AI" is offered.
- From a link, fetching: "Reading the video..." with the orb, followed by the existing state of the From a topic writer.
- No captions: "This video has no captions to read. Paste what it says in From a topic."
- Link not supported: "Paste a YouTube, Instagram reel or TikTok link."
- Over a cap: the server's words, "You've used all 10 for today. It resets at 8am Singapore time."
- LinkedIn document: Post it for me shows "PDF document" as the media line; failed and retry states as today.
- Done: as today, plus the design and size kept on the saved carousel.

### Copy

- "Design", "Size", "Recommended"
- Design labels: "Clean", "Bold cover", "Numbered", "Checklist", "Post card", "Photo cover", "Quote", "Notebook"
- Size labels: "4:5", "1:1", "9:16"
- Tab: "From a link", field label "Video link", placeholder "A YouTube, Instagram reel or TikTok link", button "Make the carousel" with the chip "About US$0.01" for a YouTube link (the DataForSEO read; the writer is the existing From a topic call). The Apify cost of one reel read is not written down anywhere in the repo (unverified), so log the run cost of the first 10 reads and set the reel chip from that; a cached reel shows "Free".
- "Reading the video..."
- "This video has no captions to read. Paste what it says in From a topic."
- "Paste a YouTube, Instagram reel or TikTok link."
- "Only LinkedIn takes a PDF. Post the pictures for Instagram."
- PDF button on 9:16 hidden; InfoTip on the size row: "PDF is for LinkedIn, at 4:5 or 1:1."

### Data

- No table and no schema change.
- `SavedCarousel` (`src/lib/carousel.ts`) gets `design?: string` and `size?: "4x5" | "1x1" | "9x16"`; `sanitizeSaved` (private, called by `loadCarousels`) keeps only known values, so older saved carousels open as Clean at 4:5.
- New carousels start on the last design and size picked on this device: add `design` and `size` to the existing device hint `cs-carousel-look` (today `{font, paper}`), the same way font and paper work now, so nothing new is synced.

### AI and cost

- Drawing: free, in the browser.
- Jev picks a design, in a new `writing-judge` mode `design` `{slides: [{title, body}]}` (one `writing-judge` use, cap 60):
  - type `choice`, instructions: "These are the slides of an Instagram or LinkedIn carousel by a Singapore financial adviser. Which slide design suits this content best?"
  - criteria: `clean` "general advice in short paragraphs", `numbered` "a list of separate tips or reasons", `checklist` "steps or things to check off", `post-card` "a personal opinion or story told in first person", `quote` "one strong statement or a quotation", `bold` "a short punchy list with a provocative hook", `photo-cover` "a story about a place, a person or a moment", `notebook` "a lesson or explanation with some detail".
  - Proposed threshold: tag the pick at 0.4 or more. Set it after running Leo's last 30 carousels and reading every pick. Null gives no tag.
- From a link: YouTube captions about US$0.006, or an Apify read at a cost to be measured (free when cached in `cs_reel_sources`), then the existing writer.
- The existing `yt-captions`, `reel-style` and `writing-judge` caps cover every paid call here, so `usageCaps.ts` does not change.
- Contentdrips Pro is 1,200 credits a month; PostNitro charges 2 credits an AI slide. Ours costs nothing per design.

### Deep links

| URL | Opens |
|---|---|
| `/carousel?design=numbered&size=1x1` | The open carousel in that design and size. Design values as in the table, size 4x5, 1x1 or 9x16. Unknown values fall back silently. Replace. |
| `/carousel?tab=link` | The From a link tab |
| `/carousel?tab=link&url=<encoded link>` | Pre-filled once, then `url` leaves the address |

Add `design`, `size` and `url` to the `carousel` builder in `src/lib/links.ts`, `link` to the `tab` union and `SOURCE_TABS`, and rows to `docs/deep-links.md`.

### Gate

The Design row, the 1:1 and 9:16 sizes, the From a link tab and the LinkedIn PDF option show only when `leoOnly(email)`. Anyone else sees today's page; unknown params are ignored for them. `writing-judge` mode `design` refuses anyone else with 403 via `supabase/functions/_shared/leoOnly.ts`.

## Done when

- [ ] All eight designs draw a 6-slide carousel at 4:5, 1:1 and 9:16 with no overlap or cut-off text beyond the existing "..." rule, checked by eye at 390 px and 1440 px.
- [ ] Saved carousels made before this change open unchanged.
- [ ] A YouTube link and an Instagram reel link each become a carousel on Leo's account.
- [ ] `posts.test.ts` shows a PDF going to LinkedIn as a document with its title and refused for Instagram with the message above; one scheduled-then-cancelled document post on Leo's own LinkedIn, with his OK, comes back from Zernio as scheduled.
- [ ] The Recommended tag shows on Leo's account and disappears when Jev is down (mocked).
- [ ] Non-Leo accounts see today's page.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/carouselLayout.test.ts`: each design and size lays out cover, point and CTA slides inside the frame; 9:16 keeps text out of the top and bottom 250 px; `clean` at 4:5 gives the same nodes as before the change (a snapshot of today's output, so nothing moves for existing carousels).
- `src/lib/carousel.test.ts`: through `loadCarousels`, a saved carousel keeps known `design` and `size` and drops unknown ones.
- `supabase/functions/social/posts.test.ts`: a PDF passes `platformProblem` for LinkedIn alone and is refused for Instagram and for two files; `postBody` sends it as `type: "document"` with the title and sets `documentTitle` on the LinkedIn entry only.
- `supabase/functions/writing-judge/logic.test.ts`: `design` mode parsing; the pick is null below the threshold.
- `src/lib/links.test.ts`: the `carousel` builder with `design`, `size`, `tab: "link"`.

## Open questions

- CSV bulk carousels (Contentdrips, PostNitro) make sense for an agency pushing content to many advisers. That fits `trust-team-push`; left out here. Leo decides if it is wanted.
- Web fonts: designs would look more distinct with two or three brand fonts, but an SVG drawn to a canvas cannot load them. Embedding fonts as data inside the SVG works in principle and adds size and code; worth it only if Leo finds the system fonts too plain after seeing the eight designs.

## Related

`formats-slideshow`, `formats-static-ad`, `edit-carousel`, `remix-any-format`, `remix-any-link`, `brand-kit`, `publish-schedule`, `publish-per-network`, `trust-team-push`
