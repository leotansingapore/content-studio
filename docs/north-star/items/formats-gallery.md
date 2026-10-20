# The format gallery

`formats-gallery` | formats | phase 3 | status: partial | /north-star#formats-gallery

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

A page of every format is how a user picks "any content format". He did not ask for the gallery by name; its shape comes from his Fastlane recording and the competitor research.

## How the best do it

### Fastlane

Studio > Overview has a section "Content formats" with a count chip "42", the line "Every format you can make. Pick one to start it." and, on the right, "Generated video estimates assume a 15-second post; the cost follows the video's length." A jump pill "Formats 42" scrolls to it.

![Fastlane 1:25](../../../public/north-star/fastlane/t085.webp)

Each card, five to a row, has a tall 9:16 preview of a real finished post. Video previews play muted on hover under a badge "Playing, muted" with a speaker-off icon. Under the preview come the bold name, a one or two line description, a red-outlined price chip, and on some cards a requirement line marked with an orange diamond. While a card loads it is a dark tile with a line icon for its type (clapperboard, mic, video camera, layers, paw, sparkle). Each card links to `/v2/studio/create/<slug>`, for example `wall-of-text`, `speaking-hook`, `talking-head-ugc`, `unboxing`, `paper-cutout` and `yapper`.

The price chips seen: a flat price ("5 credits a post" for Slideshow, Wall of Text, Video Hook & Demo and Custom; "52 credits a post" for Speaking Hook & Demo; "81 credits a post" for Green Screen Mobile with App), a 15-second estimate for generated video ("About 195 credits a post" for the text-over-clip cards, "About 210 credits a post" for most others), a rate ("15 credits a second", Character Swap) and a floor ("From 2 credits", Images; "From 48 credits", Videos). The requirement lines seen are "Needs a demo video", "Needs a product image", "Needs an app", "Needs a source video" and "Cannot post as a still" (notes-1 F10, notes-2).

![Fastlane 3:09](../../../public/north-star/fastlane/t189.webp)

Clicking a card opens its create page, which every format shares: "< Studio", the format's name and one line, option cards on the left with a sticky footer for the price, and a "YOUR RESULT" panel on the right that plays a finished example ("Play with sound") until you make your own. The footer reads "Pick your options to see the price" until the options load, then the price, the balance after ("142 credits now, 68 credits short") and the main button, which stays disabled while the balance is short.

![Fastlane 1:31](../../../public/north-star/fastlane/t091.webp)

The names are viral genres more than technical types (Yapper, Talking Animals, Baby Podcast, Street Interview), and several use trademarks (Netflix Documentary, Lego, Barbie, Pixar, Studio Ghibli, Zack D Films), and we use plain names only. At the homepage price, US$20 a month for 500 credits ([usefastlane.ai](https://usefastlane.ai)), 210 credits is about US$8.40; the /pricing page lists other plans, so that figure is approximate.

### Others

- Icon publishes 18 formats, each with a one-line definition: Listicle, Street Interview, TikTok Comment Response, GRWM, Skit, Product Demo, Testimonial, Storytelling, Myth Bust, Unboxing, B-Roll + Voiceover, Green Screen, Whiteboard Explainer, Yapping, App Walkthrough, Ultra Cinematic, Motion Graphic and AI Cartoon style ([formats](https://icon.com/formats)).
- Vamos shows each format with its "avg outlier" (for example 23.4X), how many videos and creators use it, a "This week" count and 30 days of posting against the usual pace. Its "Film cost" filter (no face on camera, needs other people, needs product or location, easy edit) suits advisers who will not show their face ([reading a format](https://intercom.help/getvamos/en/articles/16934916-reading-a-format), [docs](https://docs.getvamos.ai/en/articles/13204779-what-vamos-does)).
- VEED's AI Asset Templates filter by Video or Image, by category ("Viral Hooks" among them) and by style; "Recreate this" loads the template's prompt, and the cost shows on the Generate button before it runs ([newsroom](https://www.veed.io/newsroom/veed-ai-asset-templates)).
- Revid.ai lists 100+ tools behind "Show More Tools" and puts an "Estimated cost" beside "Generate video", with failed renders refunded ([create flow](https://www.revid.ai/llm/how-to-create-a-video-with-revid-ai.md), [pricing](https://www.revid.ai/llm/revid-ai-pricing-plans.md)).
- Kapwing's custom Kais pair a sample input with its example output, in a gallery of trending format recipes ([custom kai](https://www.kapwing.com/help/custom-kai/amp/)).
- Genviral words its formats as requests the user would type, such as "make me two weeks of slideshows" ([genviral](https://genviral.io)).
- MakeUGC's style picker includes brand-named styles (Pixar Style, Lego Style, Simpson Style) next to Day In The Life and How-to Tutorial, with Seedance 2.0 at 15 s for 150 credits ([templates](https://www.makeugc.ai/video-templates-feature)).

## What we have today

Checked against origin/main 08537d1, rechecked 2026-10-20.

- There is no page of formats. Making happens in several places, each with its own start: Write's format step at `/generate` (text post, carousel, short-video script, story), the carousel maker at `/carousel`, and the editor's "Make a video without filming" at `/edit?panel=ai` (`src/components/AiVideo.tsx`) with the pills "From a template", "Montage", "You speaking" and "Explainer".
- "From a template" is a small gallery already: 8 cards from `TEMPLATES` in `supabase/functions/ai-video/templates.ts` (Creator review, Product ad, Phone vlog, Shot by shot, Same face throughout, City walk, Food close-up, Through your eyes). A card in the list shows only its title and blurb, under the credit line "Templates adapted from awesome-seedance / goodcase.ai, CC BY 4.0". The warnings, the 4 s or 8 s and 480p or 720p pills (default 8 s at 720p, US$3.70), the cost line in Higgsfield credits and US$, and an "Examples" link to the template's page on GitHub appear only after a card is opened (`?template=<id>`). Nothing plays in the app, and there are no requirement lines, no price on the list cards and no filters. Beside each make button a span reads "AI clips: <n> left today" (`Left` in `AiVideo.tsx`, fed by `useUsesLeft`).
- Every maker has a deep link: `/edit?panel=ai&kind=template&template=<id>`, `kind=avatar`, `kind=explainer`, `kind=montage`, `/carousel`, `/generate?format=<format>` (`src/lib/links.ts`).
- Costs come from constants: `CREDIT_USD` 0.0625, `clipCredits`, `avatarCredits` and `explainerCredits` in `supabase/functions/ai-video/logic.ts`, re-exported to the browser by `src/lib/aiVideo.ts`. `avatarCredits` needs the voiceover's real slices, so there is no price for a talking head before the voiceover exists; `estimateAvatarCredits(seconds)` is added by `formats-talking-head`. Uses left today come from `useUsesLeft` in `src/lib/aiUsage.ts`.
- Write's generation runs in `generate-social-content`, which is not among this repo's `supabase/functions`, so its cost per post is not measured here.
- The gate is `leoOnly` in `src/lib/leoOnly.ts`, and nav entries take `owners` (`src/lib/nav.ts`). The Write tabs (`WRITE_TABS` in `src/components/SectionTabs.tsx`) are read from the same "write" section and already hide pages by `owners`.

So it is partial: one corner of the app has a small template gallery, and nothing lists every format in one place with previews, prices and requirements.

## Build

Page `/make`, file `src/pages/MakePage.tsx`. It reads the registry `src/data/formats.ts`, which `formats-slideshow` creates and every format item adds to. The cards link to each format's own page, whether that is a new `/make/<slug>` page or an existing deep link.

### Screens and states

```
Formats  [16]                                   Video prices are for the default length.
Every format you can make. Pick one to start it.            A longer video costs more.
[ All | Video | Slides | Text ]   [ Needs nothing extra ]
+---------+ +---------+ +---------+ +---------+ +---------+
| preview | | preview | | preview | | preview | | preview |
+---------+ +---------+ +---------+ +---------+ +---------+
Slideshow   Wall of text  Words over a  Talking head  Hook plus demo
Photo slides  Bold words    made scene    You or an AI   A hook, then
with words    over a video  ...           presenter...   your demo
[About US$0.02 a post] ...                              [From US$0.02 a post]
28 left today                                           <> Needs a demo video
```

Five columns at 1440 px and two at 390 px, with the filters scrolling sideways on a phone.

The price chip is `PriceChip` from `business-cost-preview` once that ships; until then a plain span with the same words.

Cards: a 9:16 poster from `public/formats/<slug>.webp`. On a device with a mouse (`(hover: hover)`) and without reduced motion, hovering or focusing plays `public/formats/<slug>.mp4` muted and looping, under the badge "Muted preview", while touch devices show the poster only. A card whose files are missing shows its kind icon (lucide `Clapperboard`, `Layers` or `Type`) on a dark tile. The name and one line come next, then the price chip, then "<n> left today" from the format's main cap, then the requirement line if any. The whole card is one link, with at least a 44 px tap area.

Empty filter result: "No formats match these filters." with "Clear filters".

Over the daily cap for a format: its line reads "None left today" in the muted colour. The card still opens, and the format's own page explains and disables its button.

Loading: the registry is bundled, so cards draw at once. Posters load lazily (`loading="lazy"`), and the uses-left line stays blank until `readUsage` answers.

Not Leo: `NotFoundPage`. The nav entry is hidden as well.

Order on the page: formats that cost cents or nothing first (Slideshow, Wall of text, Carousel, Text post, Montage), then videos made without filming (Words over a made scene, Explainer, the template clips), then people (Talking head, Green screen, Hook plus demo), then your own footage (Edit your own video).

### Copy

| Where | Words |
| --- | --- |
| Page | Title "Formats", count chip "<n>", line "Every format you can make. Pick one to start it." |
| Note | "Video prices are for the default length. A longer video costs more." |
| Filters | "All", "Video", "Slides", "Text", toggle "Needs nothing extra" |
| Chips | "About US$<x> a post", "From US$<x> a post", "No AI cost" |
| Uses | "<n> left today", "None left today" |
| Requirements | "Needs a demo video", "Needs a photo of the person", "Needs a video of you" |
| Badge | "Muted preview" |
| Empty | "No formats match these filters.", "Clear filters" |

### Data

- `src/data/formats.ts`: `FORMATS: FormatDef[]` with `slug`, `name`, `blurb`, `kind` ("video" | "slides" | "text"), `needs?` (one of the requirement ids above), `price()` (a function using the cost constants, never a typed number), `priceKind` ("about" | "from" | "none"), `cap?` (the `UsageFeature` to show uses left for) and `to` (the route).
- First entries, from what exists today: Text post (`/generate?format=text-post`), Carousel (`/carousel`), Montage, Explainer, the 8 template clips (each `/edit?panel=ai&kind=template&template=<id>`; Same face throughout needs a photo of the person, from `needsPhoto`; templates marked `hidden` by `formats-text-over-clip` are skipped), and Talking head pointing at `/edit?panel=ai&kind=avatar` until `/make/talking-head` ships. Each format item adds or repoints its own entry when it ships.
- Previews: `public/formats/<slug>.webp` (360x640, under 60 KB) and `.mp4` (3 to 6 s, H.264, muted, under 600 KB), made once from real makes on Leo's account.
- No user data, nothing synced, no schema change. A filter change replaces the URL and is not remembered.

### AI and cost

- The page itself calls no AI and costs nothing.
- Price chips: `about` uses the default options (Slideshow and Wall of text about US$0.02, from remix-everywhere's estimate of 1 to 2 US cents for the writer; Words over a made scene `clipCredits(8, "480p") * CREDIT_USD`, US$1.64; Talking head `estimateAvatarCredits(15) * CREDIT_USD`, US$2.75, once `formats-talking-head` adds that function; Explainer `explainerCredits(5) * CREDIT_USD`, about US$0.03, plus the `ai-video-script` OpenAI call and the ElevenLabs voice from the prepaid pool). `from` is for formats whose options change the price (template clips from `clipCredits(4, "480p")`, US$0.82; Hook plus demo and Green screen from US$0.02). `none` is for work done on the device with no AI call (Carousel, Edit your own video).
- Estimates with no measured figure, shown as "About US$0.02 a post" until their first 20 runs are logged: Text post (Write's function is not in this repo), Montage (the `montage` beat writer is an LLM call plus Jev, cost not logged) and the remix writer itself.
- There is no Jev question on this page; ordering the cards for a brand is an open question below.

### Deep links

- `/make?kind=video` (also `slides`, `text`; default all) and `/make?needs=none` (default off), both replacing history.
- A card opens its format's own URL (a push). `links.make({kind, needs})` goes in `src/lib/links.ts` beside `links.makeFormat` (which `formats-slideshow` adds; add it here if this ships first), with a "/make" row in `docs/deep-links.md`. The `/make` route goes in `src/App.tsx` behind the same `getSession` plus `leoOnly` check as `src/pages/NorthStarPage.tsx`.
- Nav: `{ to: "/make", label: "Formats", owners: LEO_EMAILS }` goes in the "write" section of `src/lib/nav.ts`, second after "Post", with `/make` added to the routes list in `src/lib/nav.test.ts` and the words "formats", "make", "slideshow", "wall of text", "talking head", "green screen" and "hook" to `src/lib/jumpTo.ts`.
- For Leo, add a "See every format" link at the top of `/edit`'s "Make a video without filming" panel.

## Done when

- [ ] `/make` shows every format in the registry for Leo's two sign-ins, and NotFound plus no nav entry for anyone else.
- [ ] Each card opens a page that works, and each price chip matches what that page shows before making.
- [ ] Hover plays the muted preview with a mouse; a phone shows posters only; reduced motion plays nothing.
- [ ] The kind filters and "Needs nothing extra" work and live in the URL; an empty result offers "Clear filters".
- [ ] Uses left show per card, and a used-up format says "None left today".
- [ ] No name or line on the page names a brand-owned style.
- [ ] Checked at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the `src/data/northStar.ts` item is flipped.

## Tests

- `src/data/formats.test.ts`: slugs are unique and kebab-case; every `to` is a route in `src/App.tsx` (read with the regex `navRoutes.test.ts` uses) or a `/make/<slug>` that the format page knows; every `price()` equals the logic constant it names, rounded to cents; every `needs` is in the fixed list; no template with `hidden: true` gets an entry; no `name` or `blurb` matches `/pixar|lego|barbie|ghibli|zack d|netflix|simpsons/i`.
- A pure `filterFormats(list, {kind, needs})` in `src/data/formats.ts`, tested for each kind and for needs on and off.
- `src/lib/nav.test.ts` stays green, with `/make` hidden from the More sheet for "someone@example.com"; `src/lib/navRoutes.test.ts` passes with `/make` in the nav.
- `src/lib/jumpTo.test.ts`: "slideshow" finds Formats for Leo and nothing for another email.

## Open questions

- Each preview is one real make on Leo's account, unless his own past posts are used instead, and that spend is Leo's decision. At today's constants it comes to 285.7 Higgsfield credits, about US$17.86: the 8 template clips and one spoken hook at 4 s and 480p (9 x 13.2 credits), the 3 made scenes at 8 s and 480p (3 x 26.3), and a 15 s talking head and a 15 s green screen presenter (2 x 44). The daily caps slow this down: 12 `ai-clip` uses at 2 a day per sign-in take 3 days across Leo's two sign-ins, and the 2 talking heads use a day of `ai-video`. Raising a cap for the job is a `usageCaps.ts` change Leo approves.
- Fastlane shows credits; we show the provider's US$ cost and uses left until credits exist (`business-credits`).
- Cards for formats not built yet are hidden. Showing them as "Soon" is Leo's call.
- Ordering cards by what suits the brand (a Jev pick from the brand kit) can come later; the order above is fixed for now.

## Related

formats-slideshow, formats-wall-of-text, formats-text-over-clip, formats-talking-head, formats-green-screen, formats-hook-demo, formats-custom, formats-prompt-media, remix-any-format, business-cost-preview, business-credits, brand-demo-videos
