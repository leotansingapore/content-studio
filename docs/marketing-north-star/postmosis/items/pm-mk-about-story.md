# The About page tells why Leo built Postmosis

Status: done
App Postmosis (postmosis.com), owner Leo, phase 2 (Proof a professional believes).

## Why

The small rivals sell through their founders. FeedHive's founder Simon Hoiberg shows about 89K LinkedIn followers and AuthoredUp's Ivana Todorovic about 18K (linkedin.com/in/simonhoiberg and linkedin.com/in/ivanatodorovic, read logged out, research/teardown.md). AuthoredUp's about page tells how its founders began in December 2021 and grew from a free beta (authoredup.com/about-us).

A visitor who books 20 minutes with Leo wants to know who he is and why he built it.

## What we have today

Checked 30 Oct 2026 against the live postmosis.com/about and ~/postmosis-site origin/main (2b81272).

- /about is live with the H1 "I built Postmosis because I needed it." It says his posts were spread across ChatGPT, Canva, CapCut and a notes app, and that moving between them "ate most of a Sunday" (src/content/about.ts).
- Leo approved the copy on 28 Oct (the comment in src/content/about.ts cites ~/Documents/Postmosis/copy/money-pages-v1.md, section 5).
- Every guide and vault page carries "By Leo" linking /about, with Article markup naming Leo as the author (src/kits/GuideKit.tsx, src/site/seo.ts).
- The page names the company behind Postmosis and ends with Book a walkthrough.
- Since Leo's read, about.ts has changed twice, both on 29 Oct: a code note removed and the search title shortened. The story itself is as he approved it.

## What to do

1. Done. When the story changes, Claude drafts the change in the copy .md, runs aicheck under 15 and brief-check, and Leo reads it before it goes into code, because /about is a money page.
2. When Leo names public profiles for Postmosis (pm-mk-leo-posts), Claude links them from /about and adds them as sameAs on the Person in the guides' Article markup (src/site/seo.ts).

## Done when

- /about is live with Leo's approved story (approved 28 Oct 2026, live since the 29 Oct launch).
- Any later change has Leo's read noted in its copy .md.

## Open questions

None.
