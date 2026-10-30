# Postmosis is named in AI answers to our reader's questions

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 4 (Named and cited).

## Why

Predis (147 lines), FeedHive (54), AuthoredUp (60) and Typefully (26) publish an llms.txt for AI tools to read (census.md, 30 Oct 2026). Taplio is listed as an official Claude connector and is buying ads about it, and several AuthoredUp testimonials are about using it with Claude or ChatGPT (teardown.md). None of them publishes whether AI answers name it, so this card measures it for us.

## What we have today

Checked 30 Oct 2026 against the live site, ~/.local/share/seo-visibility and content-studio.

- postmosis.com serves llms.txt (134 lines on 30 Oct) and llms-full.txt, with every vault page and guide in full. pm-seo-llms adds a Markdown copy for every content page.
- Nothing checks whether ChatGPT, Perplexity or Gemini names Postmosis or cites its pages.
- A free way to ask ChatGPT with web search already exists: ~/.local/share/seo-visibility/bin/ask-chatgpt-search.sh runs one read-only Codex CLI query on Leo's ChatGPT Plus login, with no per-call cost, and prints the answer and its cited URLs. Its header warns it is not the chatgpt.com product, so answers can differ from what a user sees.
- credit-prices.ts holds no price for Perplexity or Gemini calls, or for DataForSEO's AI answer endpoints. The card's USD 1 to 3 a month is an estimate nobody has measured.

## What to do

1. Write 30 fixed questions in the reader's words, 5 for each /for profession, such as the best tool to edit a talking head on a phone or a content calendar for a coach. Keep them in docs/seo-north-star/research/ai-questions.json and never change them, so months compare.
2. Run the ChatGPT pass with ask-chatgpt-search.sh, which is free but runs on Leo's ChatGPT login, so ask Leo before the first run. Record per question whether "Postmosis" appears in the answer, which postmosis.com URLs are cited, and which rivals are named.
3. Price the Perplexity and Gemini passes for 30 questions a month from each provider's own price page, or from DataForSEO's AI answer endpoint. Stop and ask Leo with that measured cost before any paid run. dec-seo-ai-check recommends a cap of USD 3 a month.
4. Save each month as dated JSON under ~/Documents/Postmosis/research/ai-citations/. Show the named share per engine on /seo-north-star; it reveals nothing private.
5. Once Leo says yes, schedule the monthly run with launchd and hold it under the cap he sets.
6. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- ai-questions.json holds the 30 questions, and the first ChatGPT pass is saved.
- Leo has answered the question below with the measured cost in front of him; if yes, all three engines run monthly under the cap.
- /seo-north-star shows the named share per engine.

## Open questions

The Perplexity and Gemini passes call paid APIs, guessed at USD 1 to 3 a month and not yet priced. Run them once the cost is measured?
