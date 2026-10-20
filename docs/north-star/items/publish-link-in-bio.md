# Link in bio that captures leads

`publish-link-in-bio` | publish | phase 7 | status: partial | /north-star#publish-link-in-bio

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has no link-in-bio page in the recording or the captures. Its Brand page keeps "Other links" among the brand's facts (notes-4 2.15), which feeds its posts, not a public page.

The social suites give every brand a small page, and the adviser tools add a form that trades a guide for contact details:

- Buffer's Start Page embeds videos, features the latest posts, shows products, collects emails and adds forms, with 14 layout templates and built-in counts of page views and link clicks. It is free, with limits ([source](https://buffer.com/start-page)).
- Later's Link in Bio mirrors the Instagram feed as clickable posts (only posts given a link appear), with buttons, a featured banner, a Mailchimp signup, link analytics, an SEO title and Linktree import. Up to 5 links per Instagram post need Growth or above, and TikTok links need a business account with 1,000+ followers ([source](https://later.com/link-in-bio/)).
- Metricool's SmartLinks count visits, clicks and click rate and let the user reorder links by how they perform, with several pages per brand ([source](https://metricool.com/smartlinks/)).
- Ocoya's bio pages are built from blocks ("Button link", "Text", "Sub heading", "Image", "YouTube video", "Social links"), stay in draft until "Publish changes", count views, clicks and click rate over 7, 30 or 90 days, and add UTM tags to outgoing links ([source](https://www.ocoya.com/features/bio)).
- Vista Social's Vista Page takes forms, payments and lead-gen tools, with a custom domain and Google Tag Manager on Advanced ([source](https://vistasocial.com/vista-page/), [pricing](https://vistasocial.com/pricing/)).
- Twenty Over Ten's Lead Pilot gates a guide behind a subscribe form. The adviser edits "Subscribe Details" and "Subscribe Success Message", switches on "Subscribe Success Button" and sets its label and link (a hosted PDF, Calendly or a webinar), then tests it as a visitor; PDFs must be hosted elsewhere ([source](https://help.twentyoverten.com/en/how-to-gate-content-using-the-subscribe-form)).
- Snappy Kraken sells lead capture with gated content from its Grow plan at USD 299 a month ([source](https://snappykraken.com/pricing)), and Broadridge Advisor sells "Lead Optimized Pages" ([source](https://www.advisorstream.com/pareto)). Hootsuite, Sprout Social (SproutLink) and Publer (Linkie) also have a link-in-bio page ([Hootsuite](https://www.hootsuite.com/platform/publishing), [Sprout](https://sproutsocial.com/features/social-media-publishing/), [Publer](https://publer.com/help/en/article/what-is-included-in-publer-business-1c57hsq.md)).

## What we have today

The page itself is live for every signed-in user; the lead side is missing.

- Editor `/bio` (`src/pages/LinkInBioPage.tsx`, `src/lib/bioPage.ts`):
  - one page per brand with an address (`/l/<slug>`, reserved words refused), name, `Line under your name`, an optional photo and up to 20 links;
  - chips that add the brand kit's DM links (`Instagram DM`, `Messenger`, `WhatsApp`), up and down buttons to reorder, a live preview (`src/components/bio/BioView.tsx`) and `Page is live`;
  - unsaved edits kept on the device (`cs-bio-draft-`), and a deleted address held for 30 days (SQL 020);
  - a `Clicks` table with 7-day and 30-day counts per link.
- Public page `/l/:slug` (`src/pages/BioPublicPage.tsx`), drawn from the `link-in-bio` edge function (`supabase/functions/link-in-bio`). The public RPC `cs_bio_page_public` returns labels and never the URLs. Each button goes through `/link-in-bio/<slug>/<linkId>`, which counts the click (bots and link previewers are sent on uncounted) and redirects, capped at 5,000 counted clicks per link a day (SQL 015).
- Tables `cs_bio_pages` (links as `[{id, label, url}]`, labels 1 to 60 characters, 20 at most), `cs_bio_clicks`, `cs_bio_slug_holds`, with writes only through RPCs (`cs_save_bio_page`, `cs_delete_bio_page`, `cs_bio_click`).
- Nearby: tracked short links `/t/<slug>` with clicks and people (`/links`), the brand kit's offers (`MAX_OFFERS` 5, name and link, in `src/lib/carousel.ts`; the kit has no separate booking field, so a booking page is an offer) and its `tagLinks` setting for UTM tags (`tagLinks` in `src/lib/plainText.ts`).
- Missing: latest posts, one-tap buttons from the brand kit's offers (a booking page among them), UTM tags on bio links, sorting by clicks, compliance checks on the page's words, any form, any gated guide, and sign-ups.

## Build

Two steps. Step 1 changes no schema and can ship now. Step 2 collects personal data from the public, so it needs a migration, a public write endpoint and PDPA wording, and waits for Leo.

Gate: the new editor controls show only when `leoOnly(email)`. Step 1 changes only what the editor writes into the existing `links` list, so the public page needs no gate. Step 2's endpoint ships behind the edge secret `BIO_LEADS_ENABLED` (off unless set to `1`) and answers only for pages owned by Leo's uids until he says otherwise.

### Step 1, screens and states

In the `/bio` editor, under the links:

- `From your brand kit`: one chip per brand kit offer (`+ <offer name>`), each adding a link with that name and URL. With no offers: `Add offers in your brand kit to put them here.` with a link to `/brand`.
- `Add my 3 latest posts`: adds up to 3 links labelled `Latest: <first 40 characters of the hook>` pointing at the live post (`zernio.links`, newest posted first). With no posted links the chip is disabled with `No live post links yet. Posts sent with Post it for me add theirs.`
- `Sort by clicks`: reorders the links by 30-day clicks, highest first, and shows `Sorted by clicks. Undo`.
- When the brand kit has `tagLinks` on, links to the adviser's own websites (the brand kit's offer domains) are saved through `tagLinks(url, { source: "linkinbio", campaign: slug })` from `src/lib/plainText.ts`, which adds `utm_source=linkinbio`, `utm_medium=social` and `utm_campaign=<the slug's first 5 words, hyphenated>` and keeps any utm_ value already there. The field shows `UTM tags added`.
- Compliance chips from `scanCompliance` under `Line under your name` and each link label, as warnings, worded as Write words them.

### Step 2, needs Leo

Migration (next free number in `supabase/hub/`, reviewed independently before it is applied):

- Table `cs_bio_leads`: `id uuid`, `page_id uuid` referencing `cs_bio_pages` on delete cascade, `link_id uuid null`, `created_at`, `name text` (1 to 80), `contact text` (an email or a Singapore phone number, 5 to 120), `message text` (up to 500), `consent text` (the exact sentence shown), `spam boolean default false`. RLS: the page owner can select and delete; nobody inserts except the function.
- `cs_bio_lead_add(p_slug, p_link_id, p_name, p_contact, p_message, p_consent)` (security definer, service role only): atomic caps of 30 sign-ups per page a day and 300 across all pages a day, refusing an unpublished page.
- `cs_bio_click` refuses a link marked `gate: true`, so its URL is released only after a sign-up; `cs_save_bio_page` accepts `gate` and `kind: "form"` on a link item.

Edge function `link-in-bio` gains `POST /link-in-bio/<slug>/lead`. A filled hidden field, a submit under 3 seconds after the page loaded, or a bot user agent (`isBot`) gets 200 with nothing stored. It answers 503 when `BIO_LEADS_ENABLED` is off, and 429 over a cap. Otherwise the row is stored, and a gated link's URL comes back in the response.

Public page (`BioView` and `BioPublicPage`):

```
        [photo]
       Leo Tan
  Financial adviser, Singapore
  [ Book a 15-minute call ]
  [ Get the CPF top-up guide ]   (gated)
        Name    [            ]
        Email or phone [     ]
        [ ] I agree that Leo Tan may contact me about this. My details are used for this only.
        [ Send me the guide ]
```

- A gated link opens the form under it. After sending: `Thanks, <first name>. Here's your guide.` with the button `Open the guide`.
- A form link (no guide) ends with `Thanks, <first name>. <display name> will be in touch.`
- Errors: `Check your email or phone number.`, `Tick the box so <display name> can contact you.`, `Too many sign-ups on this page today. Try again tomorrow.`, `Couldn't send it. Try again.` Typed fields survive an error.

Owner side, on `/bio`:

- A `Sign-ups` section (`#signups`) lists date, name, contact, from (the link label) and message, with `Copy` per contact and `Delete` with a confirm. Rows Jev flags show `Looks like spam` and sort last; nothing is deleted on its own.
- The `Clicks` table gains a `Sign-ups` column for 7 and 30 days.
- A web push through `notify`: `New sign-up on your link in bio` with the person's first name, url `/bio#signups`.
- The auto-DM `Free guide` starter can point its button at the gated link (`/l/<slug>`), so a comment keyword leads to the form (publish-auto-dm).

### Copy

Exact strings: `From your brand kit`, `+ <offer name>`, `Add offers in your brand kit to put them here.`, `Add my 3 latest posts`, `Latest: <hook>`, `No live post links yet. Posts sent with Post it for me add theirs.`, `Sort by clicks`, `Sorted by clicks. Undo`, `UTM tags added`; step 2: `Name`, `Email or phone`, `I agree that <display name> may contact me about this. My details are used for this only.`, `Send me the guide`, `Send`, `Thanks, <first name>. Here's your guide.`, `Open the guide`, `Thanks, <first name>. <display name> will be in touch.`, the four error lines above, `Sign-ups`, `Looks like spam`, `Copy`, `Delete`, `New sign-up on your link in bio`. The consent sentence is a draft for Leo's compliance check before step 2 ships.

### Data

- Step 1: the existing `links` list on `cs_bio_pages` (labels and URLs only). No schema change.
- Step 2: `cs_bio_leads` above. Personal data from the public; delete on request through `Delete`, and the rows go with the page (cascade).

### AI and cost

- Step 1: none.
- Step 2: when a sign-up has a message, one Jev Noul goes through `supabase/functions/_shared/jev.ts` (pinned `jev-1.13.0`), with the message as `message`:

  ```
  question: Someone filled in the contact form on a Singapore financial adviser's link-in-bio page.
            Is `message` spam, a sales pitch, a test or abuse, rather than a person asking about
            their own money, insurance or the guide?
  true:     Spam, a pitch for the adviser, a test entry, gibberish or abuse.
  false:    A person writing about their own situation, a question, or a request for the guide or a call.
  ```

  Proposed threshold: flag at p(true) 0.85 or more, to be set from a shadow run on the first 50 real sign-ups before the flag shows. With no message, or when Jev answers null, nothing is flagged. About 200 input tokens, well under US$0.001 a sign-up. Add `"bio-lead-judge-global": 300` to `DAILY_LIMITS`, counted on `GLOBAL_COUNTER_USER` like `ai-video-global`, commented "Jev spam flag on link-in-bio sign-ups (link-in-bio lead); a fraction of a cent each." Over the cap the sign-up is stored unflagged.

### Deep links

- `/bio#signups` scrolls to the sign-ups (step 2), with `useScrollToHash`.
- `/l/<slug>?guide=<linkId>` opens the page with that gated link's form already open, so an auto-DM button can point straight at it.
- Update the `/bio` row in `docs/deep-links.md` (today in the "(none)" row) and the `/l/:slug` public row.

## Done when

- [ ] Step 1: brand kit offers, the 3 latest posts and Sort by clicks each change the links as described, Undo restores the order, and the public page shows them after Save.
- [ ] Step 1: with `tagLinks` on, a link to the adviser's own site goes out with the three UTM parameters, and other sites' links are untouched.
- [ ] Step 1: a headline with "guaranteed returns" shows the compliance warning.
- [ ] Step 2: a sign-up through a gated link stores one row, returns the guide link, and pushes to Leo's phone; the guide's click URL refuses to redirect without a sign-up.
- [ ] Step 2: the hidden field, a 1-second submit and a bot user agent store nothing; the 31st sign-up on one page in a day gets the cap message.
- [ ] Step 2: with `BIO_LEADS_ENABLED` unset, the form never shows and the endpoint answers 503.
- [ ] 390 px and 1440 px checked by eye on the editor and the public page; build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/bioPage.test.ts`: `latestPostLinks(drafts)` picks posted drafts with live links, newest first, at most 3, with the label cut at 40 characters; `sortByClicks(links, rows)` orders by 30-day clicks and keeps ties in place; `tagOwnLinks(links, offers, slug)` tags only offer domains.
- Step 2: `supabase/functions/link-in-bio/logic.test.ts` for the hidden field, the 3-second rule, contact validation (email, `+65` or 8-digit SG numbers) and the response shape; `supabase/hub/0NN_bio_leads.test.sql` for the owner-only reads, the caps under concurrency and the gated-click refusal; a Jev reader test where null leaves `spam` false.

## Open questions

- Where should sign-ups go after Content Studio: ActivityTracker's CRM, a Lark group, or email? Leo decides; step 2 keeps them on `/bio` and pushes a phone alert.
- The consent sentence and any MAS or PDPA wording for advisers' pages need Leo's compliance check.
- Showing post thumbnails (Later's feed grid) needs an image per link, which is a schema change on `cs_bio_pages`; step 1 uses text buttons.

## Related

publish-auto-dm, publish-inbox, learn-attribution, learn-warm-leads, brand-kit, trust-compliance-check, trust-profile-governance, find-adviser-library
