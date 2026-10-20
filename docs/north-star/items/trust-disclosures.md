# Disclaimers on every post

`trust-disclosures` | trust | phase 8 | status: partial | /north-star#trust-disclosures

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane lists "Post labels" in Settings under SENNA, with the line "The AI and ad labels platforms show on posts." The page was not opened in Leo's recording, so its contents are unknown. Its public AI influencer page says platform and regional AI-labelling rules vary and that Fastlane helps with labelling at publish time; the mechanism is not described (unverified). ([tool page](https://usefastlane.ai/tools/ai-influencer-generator))

![Fastlane 5:46, Settings with Post labels](../../../public/north-star/fastlane/t346.webp)

All Fastlane shows is that labels page. The adviser tools go further and put the regulator's lines into the template, so nobody can forget them:

- Twenty Over Ten Lead Pilot: Template Design > Content > FINRA BrokerCheck has a toggle "Display BrokerCheck?", a CRD# field and a Type (Firm or Individual). It adds a button to the adviser's BrokerCheck profile on every landing page, per FINRA Rule 2210, and falls back to the BrokerCheck search page when there is no profile. The Singapore version of that line is the representative's entry on the MAS Register of Representatives. ([help](https://help.twentyoverten.com/en/finra-brokercheck))
- Apaya: the AI Post Generator writes captions, images and carousels under a Brand Framework holding "approved language, disclaimers and banned phrases", on all plans. ([financial services](https://apaya.com/enterprise/industry/financial-services-social-media-management), [pricing](https://apaya.com/pricing))
- Metricool: a post-level selector sets the AI-generated label on Instagram images, reels and carousels, on TikTok Business and on YouTube. ([update](https://metricool.com/product-updates-august-2026/))
- Planable: an optional per-post AI content label for Instagram posts, reels and stories, Instagram only. ([release notes](https://releasebot.io/updates/planable))
- Typefully adds "Paid Partnership" and "Made with AI" labels to X posts. ([changelog](https://typefully.com/changelog))

Which lines a Singapore adviser must carry is set by the firm and by the MAS digital advertising guidelines (in force 25 Mar 2026, per the header of `supabase/hub/011_team_review.sql`). The exact wording they require is not in this repo and is unverified here.

## What we have today

- Write's "Disclose" row (`src/pages/GeneratePage.tsx`, `DISCLOSURES` in `src/lib/plainText.ts`) has three chips: "AI-assisted" adds "Written with AI assistance.", "Paid partnership" adds "Paid partnership.", "Sponsored" adds "Sponsored.". All are off by default and saved on the draft as `disclosure`.
- `withDisclosure` adds the chosen lines after the sign-off. Three places call it: Write's `forPosting` (Copy), `PostPreview`, and `postText` in `src/lib/autoPost.ts` (Post it for me).
- The brand kit sign-off (`CarouselBrand.signOff`, `MAX_SIGNOFF_CHARS` 600, /brand#sign-off) is where an adviser can type a disclaimer today. `withSignOff` adds it on copy in Write, Batch (`src/pages/BatchPage.tsx` line 281), Post it for me and the video caption copy (`src/pages/VideoEditPage.tsx` line 1272).
- Compliance chips already run on every caption (`scanCompliance` in `src/lib/compliance.ts`, warn or error), and Post it for me already has one slot for a reason it will not send: `reason` in `src/components/PostItForMe.tsx` lines 372-379 ("Team rule: ...", then "Fix the compliance error in the caption first.").
- Gaps, read from the code:
  - Batch and the video caption copy add the sign-off but no disclosure labels.
  - The per-network captions on /edit (`src/components/PlatformCaptions.tsx`, `copy` at line 81, for TikTok, Facebook, LinkedIn and YouTube) copy the raw caption with neither the sign-off nor the labels.
  - A carousel slide carries the name and handle in its footer (`src/lib/carouselLayout.ts`) and no disclaimer.
  - The video end card (`drawEndCard` in `src/lib/videoMedia.ts`, `END_CARD_SECONDS` 2.5 in `src/lib/videoEdit.ts`) shows only the sign-off's first line that is not hashtags (`endCardLine`, cut at 60 characters), and it is off by default (`endCard: false`).
  - There is no field for the representative line (firm and rep number) and no check that a post still carries a required line.
- people-ai-labels (spec written) adds `DISCLOSURES.aiMedia` for AI people and voices; brand-rules (spec written) adds "Always include" rules. This item is where required lines are kept and placed on every format.

## Build

Gate: the new /brand section and every new behaviour below run only when `leoOnly(email)`. Other sign-ins keep today's chips and sign-off.

One store holds the lines. Almost every caption copy already goes through `withSignOff`, so the lines are added beside it; the /edit per-network captions do not, so they gain the call too. The carousel's last slide and the video end card draw the lines. A missing line warns by default, and an adviser can switch their own brand to Block; a leader doing that for a whole team waits for Leo (Open questions).

### Screens and states

/brand gets a section `#disclosures` after "Sign-off":

```
Lines every post carries                                   (i)
 Who you are   [ Jane Lim, financial adviser representative of ...   ]
 Disclaimer    [ For general information only. This is not ...       ]  Use the general disclaimer
 Product line  [ This advertisement has not been reviewed by ...     ]  (only on posts about a product)
 Add them to   [x] Captions  [x] Carousels  [x] Videos  [x] Your bio
 If a post leaves one out   (o) Warn  ( ) Block
```

1. Empty: all three fields blank, placeholders shown, nothing is added anywhere. One line under the heading: "Nothing is added to your posts until you fill these in."
2. Filled: a live preview under the fields shows the closing lines exactly as a caption will end.
3. Saving uses the kit's existing save-on-change and its "Saved" indicator (`saved` state in `src/pages/BrandPage.tsx`), which shows inside 400 ms.
4. "Your bio" ticked: trust-profile-governance checks each profile bio for the who-you-are line (or its shorter bio line), and skips that check when it is unticked; this tick changes nothing on posts.

Write, in the existing "Disclose" row, before the three label chips:
- One pressed chip per filled line: "Who you are", "Disclaimer", "Product line". The product chip is pressed only when the post is about a product (below).
- Unpressing a chip on a Warn brand removes the line from this post and shows an amber line under the row: "This post leaves out your {line name}." Copy and Post it for me still work.
- On a Block brand the chips are locked on, with the InfoTip "Your brand kit sets these to Block."
- Product check states:
  - checking: the product chip shows a spinner and "Checking..." It fires once when a generation finishes, or when a saved draft of 40 characters or more opens with no `product` result, and again only on "Check again";
  - about a product: chip pressed, InfoTip "This post talks about a product or plan, so the product line is added.";
  - not about a product: chip unpressed, nothing else shown;
  - failed, not English, or over the daily cap: chip unpressed with the line "Couldn't tell if this post is about a product. Add the product line?" and a button "Add it".

Carousel (/carousel): the last slide gets the lines in small print above the footer, wrapped to the slide width. The font starts at 22 px and shrinks to 18 px to fit 5 lines. Lines that still do not fit go on one extra closing slide in the same colours. The PNG download, "Download all" and the PDF draw through `layoutSlide` in `CarouselPage.tsx` (line 527). Post it for me renders its own PNGs (`carouselPngs` in `src/components/PostItForMe.tsx`, `layoutSlide` at line 79), so it must get the same small print and the same extra slide, or a posted carousel goes out without the lines.

Video (/edit): with "Videos" ticked, the end card draws the lines in small text under the sign-off line, and the end card runs 4 s instead of 2.5 s so the text can be read. Export check:
- end card off and lines set: an amber row "Your required lines are not on this video." with the button "Turn on the end card";
- on a Block brand the same row is red, and Post it for me stays locked on that draft until the end card is on. Download still works, since a downloaded file is the adviser's own copy.

Post it for me: the caption it sends already passes through `postText`, so it gains the lines with no screen change. On a Block brand, chips are locked on in Write, so a line can be missing only from a draft saved while the brand was on Warn (`requiredOff` not empty) or from a video draft saved with `linesOnVideo: false`. For those drafts the button shows "Your brand needs the {line name} on every post. Turn it back on." as its `reason`, after the team rule and before the compliance error.

### Copy

- h2 "Lines every post carries"; InfoTip "Added to the end of every caption, carousel and video you make for this brand."
- Labels: "Who you are", "Disclaimer", "Product line"
- Placeholders:
  - Who you are: "Jane Lim, financial adviser representative of ABC Financial Advisers"
  - Disclaimer: "For general information only. This is not financial advice."
  - Product line: "This advertisement has not been reviewed by the Monetary Authority of Singapore."
- Preset button: "Use the general disclaimer", which fills "For general information only. This is not financial advice and does not consider your objectives, financial situation or needs."
- Product line hint, grey, under its field: "Added only to posts about a product or plan."
- "Add them to": "Captions", "Carousels", "Videos", "Your bio"
- "If a post leaves one out": "Warn", "Block"
- Empty: "Nothing is added to your posts until you fill these in."
- Write: chip labels as above; "This post leaves out your {line name}."; "Your brand kit sets these to Block."; "Checking..."; "This post talks about a product or plan, so the product line is added."; "Couldn't tell if this post is about a product. Add the product line?"; "Add it"; "Check again"
- Video export check: "Your required lines are not on this video."; "Turn on the end card"
- Block reason: "Your brand needs the {line name} on every post. Turn it back on."
- Line names in sentences: "who-you-are line", "disclaimer", "product line"

### Data

- `CarouselBrand` (`src/lib/carousel.ts`) gains
  ```ts
  required?: {
    who?: string;          // 160 characters
    disclaimer?: string;   // 300 characters
    product?: string;      // 300 characters
    on?: { captions: boolean; carousels: boolean; videos: boolean; bio: boolean };  // missing reads as all true
    action?: "warn" | "block";                                                       // missing reads as "warn"
  };
  ```
  It lives in `content-studio-carousel-brand-${scoped(userId)}` with the rest of the kit, so it syncs and stays per brand. `sanitizeBrand` clips the lengths and drops anything malformed.
- `DraftEntry` (`src/lib/draftHistory.ts`) gains `requiredOff?: ("who" | "disclaimer" | "product")[]` (chips the adviser unpressed), `product?: { p: number | null; at: string; manual?: boolean }` (the Jev answer, or "Add it") and `linesOnVideo?: boolean`, which `saveToPosts` in `VideoEditPage.tsx` sets from the export's end card so Post it for me can apply the Block rule to a video draft.
- `src/lib/plainText.ts` gains `withRequiredLines(text, brand, { off, product })`. It appends each filled line on its own line after the sign-off and before the disclosure labels: who first, then the disclaimer, then the product line. A line already in the text is skipped. That match ignores case, extra spaces and a final full stop. Call it at every caption copy:
  - the three `withDisclosure` call sites: `forPosting` in `GeneratePage.tsx` (line 1166), `PostPreview.tsx` (line 180) and `postText` in `src/lib/autoPost.ts` (line 28);
  - `handleCopy` in `BatchPage.tsx` (line 281);
  - `postText` in `VideoEditPage.tsx` (line 1272), whose saved draft then carries `requiredOff: []`;
  - `copy` in `src/components/PlatformCaptions.tsx` (line 81), which also gains `withSignOff` so the per-network captions end the same way as the Instagram one.
- `src/lib/carouselLayout.ts`: `layoutSlide` takes `smallPrint?: string` for the last slide. A new helper `closingSlides(slides, brand)` in `src/lib/carousel.ts` returns the slide list with the small print set and the extra closing slide added when it overflows. Both `CarouselPage.tsx` (line 527) and `carouselPngs` in `PostItForMe.tsx` (line 79) call it when `on.carousels`, so the download and the posted carousel match.
- `src/lib/videoMedia.ts`: `BrandArt` gains `small: string`; `drawEndCard` draws it; a new `endCardSeconds(art)` in `videoEdit.ts` (2.5, or 4 with small print) replaces every `END_CARD_SECONDS` use: `videoMedia.ts` lines 1191, 1230 and 1263, `src/lib/fastExport.ts` line 502, `fullLength` in `videoEdit.ts`, and the toggle label `End card (${END_CARD_SECONDS}s)` in `VideoEditPage.tsx` line 2177.
- If brand-rules ships its "Always include" kind first, its rules move into `required.disclaimer` (or a fourth line) on first load, so the app keeps a single store for required text.
- No schema change.

### AI and cost

- Words: none written. The lines are the adviser's own text, added in code.
- One decision: whether the product line applies. New writing-judge mode `"disclosure"` `{ text }` returns `{ product: number | null }`, one Jev request (jev-1.13.0) with `state: { post: text }` and one noul:
  - question: "Does `post` describe, recommend or promote a specific insurance or investment product, plan, policy type or fund, rather than give general money education?"
  - true: "The post talks about a particular product, plan, policy type or fund a reader could buy."
  - false: "The post is general education, a story or a tip, and does not point to anything to buy."
  - The product line is added at PRODUCT_MIN 0.6 or more, marked `// shortcut: set from a side-by-side run of 40 of Leo's real posts; read every disagreement before raising or lowering it`.
- Fallbacks: Jev null, timeout, no key, or `{code: "not_english"}` all leave the chip unpressed and show "Add the product line?". The check never blocks on its own.
- Cap: add `"disclosure-check": 60` to `DAILY_LIMITS` in `supabase/functions/_shared/usageCaps.ts`. `supabase/functions/writing-judge/index.ts` consumes it for mode `"disclosure"` in place of `"writing-judge"`, the way mode `"facts"` uses `"fact-check"` and mode `"profile"` uses `"profile-score"`, and refunds on a Jev failure. The result is cached on the draft (`product`) and re-asked only on "Check again".
- Parser: `parseJudgeRequest` in `logic.ts` gains the mode in `MODES`; text is trimmed to `MAX_TEXT` (5,000) and refused under 20 characters with "Nothing to check yet.", as mode `"facts"` does.
- Cost: about 300 Jev input tokens a check, about USD 0.000013. No paid provider, no new vendor.

### Deep links

- `/brand#disclosures` (useScrollToHash). Add `disclosures` to the /brand section list in docs/deep-links.md.
- The amber Write line and the Block reason link the line name to `/brand#disclosures`.
- The video export row's "Turn on the end card" changes the setting in place and has no URL of its own.

## Done when

- [ ] On Leo's sign-in /brand shows "Lines every post carries"; on other sign-ins /brand and Write look as before.
- [ ] With all three lines filled, a Write draft about CPF top-ups copies with who-you-are and disclaimer after the sign-off; a draft about an ILP also gets the product line.
- [ ] The same lines end the caption Post it for me sends (checked in the Zernio request body), a Batch copy, the video caption copy and each /edit per-network caption copy.
- [ ] A carousel's last slide shows the lines in small print in the PNG, the PDF and the slides Post it for me uploads; a 300-character disclaimer still fits or moves to one closing slide.
- [ ] A video exported with the end card on shows the lines for 4 s in both export paths (`videoMedia.ts` and `fastExport.ts`), and the toggle reads "End card (4s)"; with the end card off, the export check shows the amber row and "Turn on the end card" fixes it.
- [ ] Unpressing "Disclaimer" on a Warn brand shows the amber line and Copy still works; on a Block brand the chip is locked and the video Post it for me is locked until the end card is on.
- [ ] With `TYPESAFE_API_KEY` unset on a local function, Write shows "Couldn't tell if this post is about a product." and "Add it" adds the line.
- [ ] `npm run build`, the full `npx vitest run`, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item `trust-disclosures` flipped to live with its `ours` line, in the same commit.

## Tests

- `src/lib/plainText.test.ts`: `withRequiredLines` adds lines in order after the sign-off and before "Written with AI assistance."; it skips a line already present when only case, spaces or a final full stop differ; unpressed lines stay out; the product line comes only when `product.p >= 0.6` or `manual`.
- `src/lib/autoPost.test.ts`: `postText` ends with the required lines and then the disclosure labels.
- `src/lib/carousel.test.ts`: `sanitizeBrand` clips the three lines and reads missing `on` and `action` as all true and "warn".
- `src/lib/carouselLayout.test.ts`: the last slide gets the small print, at 18 px or more, and overflow moves it to one extra slide; `closingSlides` gives the same list to both callers.
- `src/lib/videoEdit.test.ts`: `endCardSeconds` is 2.5 without small print and 4 with it; `fullLength` follows it.
- `supabase/functions/writing-judge/logic.test.ts`: the disclosure parser refuses text under 20 characters and cuts text at 5,000; 0.6 counts as a product and 0.59 does not; a null Jev answer gives `product: null`.
- `supabase/functions/_shared/usageCaps.test.ts`: "disclosure-check" is 60.
- Prove each case bites by breaking the code once.

## Open questions

- Leo, or each firm's compliance team: the exact wording of the three lines, and whether "MAS Rep No." with the register number must appear on every post. The placeholders above are only examples.
- Leo: a team leader setting Block or review on these lines for every member needs team rules stored on the server, which is a schema change next to `cs_team_approval_rules` and sits with trust-compliance-check and trust-team-push.
- Whether the product line should also be added when the post names no product but a remix source did. This spec only reads the adviser's own post.
- people-ai-labels adds its AI line through `DISCLOSURES`; this spec keeps that and puts the required lines before it. If Leo wants one combined label row, merge the two chip groups in Write.

## Related

brand-rules, people-ai-labels, trust-compliance-check, trust-profile-governance, trust-approval, trust-team-push, brand-kit, publish-per-network, edit-carousel, edit-video
