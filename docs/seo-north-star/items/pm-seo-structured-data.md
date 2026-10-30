# Every page type carries the structured data that fits it

Status: done
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

Google reads schema.org markup to understand what a page is, and some types can earn a richer result. The fit per page type is Article for guides, DefinedTerm for glossary terms, WebApplication for tools, and FAQPage and BreadcrumbList wherever a page has questions or sits under a hub. The census counted the rivals' pages, not their markup, so this card is held to Google's structured data documentation rather than to a rival.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the JSON-LD on all 113 live pages.

- src/site/seo.ts has one helper per node: organization, softwareApplication (no offers or ratings, since there are none), faqPage, breadcrumbList, article (author Leo, a Person linked to /about), itemList, definedTerm and webApplication.
- On the live pages, guides and vault pages carry Article, FAQPage and BreadcrumbList. Glossary terms carry DefinedTerm in a DefinedTermSet, FAQPage and BreadcrumbList. Tools carry WebApplication, FAQPage and BreadcrumbList. Comparisons carry FAQPage and BreadcrumbList, and the schedulers roundup adds an ItemList of the tools it compares; the four alternatives pages list no tools, so they have none.
- Feature pages, audience pages and templates carry FAQPage and BreadcrumbList. Every hub carries ItemList and BreadcrumbList, /plans SoftwareApplication and FAQPage, /about AboutPage and Organization, and the home page Organization, SoftwareApplication and FAQPage (HomeKit).
- Every built page's JSON-LD must parse (tests/guards.test.ts). Section tests read their own node from the built HTML: Article by Leo with both dates (guides.test.ts), DefinedTerm (glossary.test.ts), WebApplication (tools.test.ts) and ItemList (compare.test.ts and the hub tests).

## What to do

1. Nothing to build. Every new page type ships with its node in src/site/seo.ts and a test that reads it from the built HTML, as the sections above do.
2. When a card adds a page type (network pages, Claude skills, idea pages), pick its node from Google's structured data documentation before writing the kit.
3. Mark up only what the page shows. No offers, ratings or review counts while none exist (product-truth.md, Not claimable).
4. After a new type deploys, run one page of it through Google's Rich Results Test, a free Google page that needs no account.

## Done when

- Every page type on the live site carries the nodes listed above, and the guards pass. Met on 30 Oct 2026.
- Each new page type ships with its node and a test that reads it.

## Open questions

None.
