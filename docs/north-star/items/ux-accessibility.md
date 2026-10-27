# Anyone can use it: contrast, names, targets and keys

`ux-accessibility` | ux | phase 9 | status: partial | /north-star#ux-accessibility

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Accessibility: Can people with different abilities use it? (Readable contrast, labeled controls, and screen-reader support.)"

## The bar

Every core page passes WCAG 2.2 AA as a script measures it, in both themes, at 1440 px and 390 px, and every core job can be done with the keyboard alone and with a thumb on a phone.

Core pages (13): /home, /generate, /make, /calendar, /drafts, /agent, /analytics, /accounts, /settings, /competitors, /campaigns, and the public /auth and /roadmap. Core jobs (5): ask the agent from Home, write a post in Write, remix from the remix sheet, schedule a draft, connect or disconnect an account.

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| A1 | axe-core serious and critical violations per core page, each of dark 1440, light 1440 and dark 390 | 0 on all 39 runs | 21 nodes; 11 of 13 pages at 0 |
| A2 | Text contrast in both themes: axe `color-contrast` nodes, plus every text token pair and tint in `src/index.css` | 0 nodes; every text pair at 4.5:1 or more; field outlines at 3:1 | 14 nodes on 2 pages; 27 of 28 text pairs per theme (destructive on muted is 4.37:1 light, 4.38:1 dark); field outline 1.33:1 light, 1.57:1 dark |
| A3 | Every control named: axe `button-name`, `link-name`, `label`, `select-name`, `aria-input-field-name`, `label-content-name-mismatch` | 0 nodes | 7 nodes, all on /roadmap |
| A4 | Touch targets at 390 px with a touch pointer, outside inline text links, measured with any `::before` hit area included | 0 under 24 px (stricter than WCAG 2.5.8, which allows spacing instead); 0 under 44 px on the core job paths | 60 under 44 px of 832 (the script counted 67, but 7 were InfoTips whose 44 px halo it missed); 7 under 24 px |
| A5 | Keyboard path through each core job: a visible focus ring on every stop, no stop hidden under the dock or a bar (WCAG 2.4.11), the job's first control within 10 Tabs after the skip link | 5 of 5 jobs | ring on all of the first 60 stops per page (756 in all), none covered, dark 1440 only; Home's ask box 20 Tabs, Write's box 18 |

## How the best do it

Fastlane has no accessibility page (usefastlane.ai/accessibility answered 404 on 27 Oct, and its home page links none), and Leo's recordings show no keyboard use, so it sets no bar here. The bar comes from the standard and from the suites that publish theirs.

- WCAG 2.2 AA is the standard. It needs 4.5:1 for text and 3:1 for large text ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)), 3:1 for the parts of a control you need to see to find it ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)), targets of at least 24 by 24 CSS px or enough spacing ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)), and, new in 2.2, a focused control that sticky content does not hide entirely (2.4.11) and a pointer alternative for every drag (2.5.7) ([what is new in 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).
- Apple and Google set the touch size higher than WCAG: Android asks for 48 by 48 dp ([Android accessibility help](https://support.google.com/accessibility/android/answer/7101858)), and Apple says "a button needs a hit region of at least 44x44 pt" ([Apple HIG, buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)). Leo's UX law 2 asks for large, spaced targets, so this item uses 44 px on touch.
- Canva says it "supports WCAG 2.1 AA compliance across our core product experiences, as documented in our VPAT" and tests on VoiceOver, NVDA and JAWS. Its editor has a checker that "detects issues with color contrast, typography, alternative text (alt-text), and more" in a design ([Canva accessibility](https://www.canva.com/accessibility/)). Its Settings > Accessibility page holds switches for high color contrast, captions, reduce motion, longer on-screen messages and shortcuts that need a modifier key ([Mobbin, Canva](https://mobbin.com/screens/48fac4c0-6cf1-46f8-9c38-1aa02372c292)).
- Buffer says it is "partially conformant with WCAG 2.1 level AA", publishes a VPAT, is "starting to run jest-axe and other accessibility tooling with some of our workflow", and tests by hand with VoiceOver on macOS ([Buffer accessibility](https://buffer.com/accessibility)). That is the closest match to this repo: an automated axe check plus one screen reader by hand.
- Hootsuite publishes a policy under Ontario's AODA but no conformance level ([Hootsuite accessibility policy](https://www.hootsuite.com/legal/accessibility)).
- X's Settings > Accessibility has "Increase color contrast", "Reduce motion" and a reminder to add image descriptions before posting ([Mobbin, X](https://mobbin.com/screens/a207ec80-034c-4c56-ae53-f8cbb9fcc772)). Whereby's brand colour fields show each colour's contrast ratio with an AA badge, and the tip reads "WCAG 2.2 recommends a contrast ratio of 4.5 or above" ([Mobbin, Whereby](https://mobbin.com/screens/e86cb1da-6690-4693-bff7-5632af4a4f9c)). Our brand kit lets an adviser pick the colours their carousels print text on, with no such check.
- How common the failures are: the WebAIM Million (2026) found detectable WCAG failures on 95.9% of the top million home pages, 56.1 errors a page on average. Low contrast text was on 83.9%, missing alt text on 53.1%, missing form labels on 51% and empty buttons on 30.6% ([WebAIM Million 2026](https://webaim.org/projects/million/)). A2 and A3 cover contrast, labels and button names.

## What we have today

Measured 27 Oct on origin/main 78e49edb, Leo's view (a dev build with `?asLeo=1`), a fake session for the demo account's device data from the 25 Oct dogfood (`live-p6replay/state-end.json`), and every Supabase call answered on the machine from fixtures; nothing reached production. axe-core 4.14.0 with the wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa tags. Code references were checked again at origin/main 8664c00d. The script and its raw results lived in a session scratchpad and are not in the repo.

What is already right:

- One skip link, first in the Tab order, that moves focus into `<main>` (`src/pages/StudioLayout.tsx:514`, `#main-content`). Each core page has one `<main>` and one `<h1>`.
- A global focus ring: `*:focus-visible` draws a 2 px ring and a glow (`src/index.css:158`). All of the first 60 Tab stops on each page showed it at dark 1440, and none was covered.
- 853 `aria-label=` attributes and 75 `sr-only` texts in non-test components, and `lang="en"` on the page.
- 309 uses of `[@media(pointer:coarse)]:min-h-11` in 138 files grow controls to 44 px on a touch screen; 175 components have some coarse-pointer rule, inputs among them (`src/components/ui/input.tsx`). InfoTip keeps its 24 px circle and adds a 44 by 44 halo on touch (`src/components/ui/info-tip.tsx:125`).
- Reduced motion: `index.css` cuts every CSS animation and transition to 0.01 ms under `prefers-reduced-motion: reduce`. CSS cannot stop JavaScript motion: 52 `scrollIntoView` calls pass `behavior: "smooth"`, which overrides the CSS rule, and none checks the setting.
- Drag alternatives (2.5.7) exist where people reorder most: the calendar's post panel has "Move to" and a time field, the carousel moves slides with arrows, and the slideshow has "Move this slide left" and "Move this slide right".
- 27 of the 28 text token pairs per theme (foreground, muted, primary, brand, destructive, success and warning on background, card, muted and sidebar) are at 4.5:1 or more. Destructive on muted is 4.37:1 light and 4.38:1 dark.

What fails:

| Page | Variant | Rule | Nodes | Detail |
| --- | --- | --- | --- | --- |
| /calendar | dark 1440 | color-contrast | 8 | Month chips: `text-primary` on `bg-primary/15` at 10 px, #5090f7 on #212d3f, 4.41:1 (`CalendarPage.tsx:1147`) |
| /roadmap | all three | color-contrast | 2 each | The board's load error note, `text-destructive` on `bg-destructive/10` at 14 px, #dc2828 on #fceaea, 4.13:1 (`ErrorNote`, `src/components/feedback/FeedbackBoard.tsx`). It showed because the fixtures did not answer the board's API; people see it when the board fails to load |
| /roadmap | all three | label-content-name-mismatch | 2 each | "Back to Content Studio" and "Filter the roadmap" do not contain their visible words |
| /roadmap | 390 | button-name | 1 (critical) | An icon button with no name |

- Field outlines: `--input` on `--background` is 1.33:1 light and 1.57:1 dark (1.47:1 on a dark card). Where the outline is all that shows a field, WCAG 1.4.11 asks for 3:1. axe does not check this, so a token test has to.
- Touch at 390 px: /calendar has 42 day buttons at 28 by 28 (`aria-label="Open ..."`, `CalendarPage.tsx:1320`); /generate has four unnamed 16 by 16 icon buttons and a 13 by 14 input; /auth's "Email me a link instead" is 20 px tall; all 9 controls on /roadmap are under 44 px; Analytics' Instagram and TikTok chips are 26 px tall. The script measured each element's box, so it reported InfoTips as 24 px; their touch halo is 44 px.
- Keyboard: from the skip link, Home's ask box is 20 Tabs away and Write's topic box 18, because cards and section links come first in `<main>`. The script did not reach a Calendar day button at all.
- No accessibility test in the suite: no axe, no contrast test, no keyboard test. The `__pins__` HTML snapshots catch markup changes; they say nothing about whether the markup is accessible.
- Dogfood: the open agent dock covered the tour popover's Next at 1440 px (p6 replay D9), and the agent bubble covered the left edge of a button at 390 px (p7a-post D11); both block a pointer, and whether keyboard focus lands under the dock (2.4.11) is untested, because the script ran with the dock closed.

So the status is partial: the shell, the focus ring, reduced motion in CSS and the drag alternatives are in place; two pages fail axe, phone targets and keyboard paths are not yet held to a number, and nothing stops a regression.

## Build

Nothing here changes what a page does; it changes sizes, colours, names and order, and adds the check. Who it reaches: the check, the tests and the VoiceOver pass are internal. Items 2 to 6 change what everyone sees, so they go to everyone only on Leo's yes (first open question); until then the component fixes sit behind `useLeoOnly()` and the token change waits.

1. The check (every card below): write `scripts/ux/a11y.mjs` and commit it: a local dev server, Supabase answered from fixtures, the 13 pages in 3 variants, the touch check reading the `::before` hit area, and the on-load call list `ux-trust` reads for T2. It uses the global Playwright (`/opt/homebrew/lib/node_modules/playwright`, as the dogfood drivers do) and reads `axe.min.js` from a path in an env var (Lighthouse's npx cache has 4.14.0), so no npm dependency is added. It writes one JSON per run and a one-line summary per page.
2. Token test (`brand-kit`, which owns the colours): `src/lib/contrast.test.ts` parses `src/index.css` and checks, in both themes, every text pair at 4.5:1, each status colour on its own `/10` and `/15` tint at 4.5:1, and `--input`, `--border` and `--ring` on `--background` and `--card` at 3:1. Raise `--input` to about 3:1 (light near 220 9% 56% gives 3.4:1; dark near 220 7% 42% gives 3.4:1 on the canvas and 3.2:1 on a card) and darken `--destructive` until it clears muted. Leo-only addition, from Whereby: the brand kit's colour fields show the text contrast on that colour with a pass or fail mark.
3. Calendar (`publish-calendar`, `publish-queue`): chips get `text-foreground` on the tint, or 12 px semibold, and day buttons grow to 44 px on a coarse pointer, the pattern the rest of the app uses.
4. Roadmap (no card; the public `/roadmap`, which renders `FeedbackBoard`): name the icon button, start the two mismatched names with their visible words, and make `ErrorNote` pass 4.5:1 (the token test in item 2 covers it).
5. Touch targets (`edit-text-post` for Write, `business-onboarding` for /auth): name and size the four 16 px buttons on /generate, give /auth's text button 44 px of height on touch, and give Analytics' platform chips the coarse-pointer height.
6. Keyboard paths (`agent-home`, `agent-chat`, `agent-tour`, `edit-text-post`): put Home's ask box and Write's topic box earlier in the DOM or behind a second skip link ("Skip to the ask box"), never with a positive `tabindex`; Escape closes the agent dock, and the dock moves aside when focus lands under it (2.4.11).
7. Drag alternatives (2.5.7): calendar, carousel and slideshow already have one, so check the other drag handlers (the video editor timeline, `SlideCanvas` text drag, `LaunchFilm`, `BoardPage`, `ReelsPage`) and add a button or number field where a drag is the only way.
8. Screen reader pass by hand (`remix-everywhere`, `publish-schedule`, `publish-accounts`): once per phase, VoiceOver on macOS Safari through the 5 core jobs, as Buffer does; findings go in the wave's results file.
9. Reduced motion in JavaScript (no card): one helper returns `"auto"` instead of `"smooth"` when `prefers-reduced-motion: reduce` matches; the 52 smooth scrolls use it, and a test fails on a bare `behavior: "smooth"` in `src`.

Copy stays as it is except the names in items 4 and 5.

## Done when

- [ ] `scripts/ux/a11y.mjs` is in the repo, runs the 13 pages in 3 variants, and prints 0 serious and 0 critical nodes on all 39 runs.
- [ ] `src/lib/contrast.test.ts` passes in both themes, field outlines at 3:1 and status tints at 4.5:1 included.
- [ ] At 390 px with a touch pointer, 0 controls under 24 px on all 13 pages and 0 under 44 px on the 5 core job paths, hit areas included.
- [ ] A keyboard script completes each of the 5 core jobs with fixtures, with the agent dock open and closed: every stop shows the ring, none is covered, and each job's first control is within 10 Tabs after the skip link.
- [ ] A VoiceOver pass through the 5 jobs is written up with no blocker.
- [ ] `src/data/northStar.ts` item `ux-accessibility` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/contrast.test.ts`: every token pair and tint named in item 2 meets its ratio in both themes; it fails today on `--input` and on destructive over muted.
- A source test that fails on `behavior: "smooth"` outside the helper (item 9).
- `scripts/ux/a11y.mjs` is the page-level check; it runs by hand per wave, not in vitest.

## Scoring each build wave

The integrator runs these after every wave, before the push, on a quiet machine (check `uptime`; above a load of 20, run twice):

| Script | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `scripts/ux/a11y.mjs` (13 pages x 3 variants, fixtures, local dev server) | A1, A2, A3 and A4 counts per page, plus on-load network calls | about 4 min | US$0 |
| `npx vitest run src/lib/contrast.test.ts` | A2 token pairs | seconds | US$0 |
| `scripts/ux/a11y.mjs keys` (5 job scripts, dock open and closed) | A5 | about 2 min | US$0 |
| VoiceOver pass by hand | blockers per job | 20 min, once per phase | US$0 |

Contrast, names and target sizes do not depend on the hostname, so the local dev server is fine for this item. A wave passes when no count goes up against the last wave and every page it touched is at 0. The score is the share of the 5 targets met, shown as "A 2 of 5" on the card's `ours` line.

## Open questions

- Leo: items 2 to 6 change colours, sizes and names that everyone sees, with no change in behaviour. Ship them to everyone, or hold them behind your sign-ins like other north-star work? Recommended: everyone, since they fix failures rather than add features; it is your call.
- Leo: add `@axe-core/playwright` and `playwright` as dev dependencies so the check runs in CI, or keep the global install like the dogfood drivers? Recommended: keep the global install; adding dependencies is your call, and the script works without them.
- Leo: publish an accessibility statement like Buffer's ("partially conformant with WCAG 2.2 AA") once A1 to A4 hold? Recommended: yes, after one phase at 0, on the public `/roadmap` footer.
- Whether field outlines count under 1.4.11 depends on whether anything else marks the field; raising `--input` settles it either way and costs nothing.

## Related

brand-kit, publish-calendar, publish-queue, edit-text-post, edit-carousel, edit-slideshow, agent-home, agent-chat, agent-tour, business-onboarding, remix-everywhere, publish-schedule, publish-accounts, ux-usability (presses per job), ux-workflow-fit (it leaves touch sizes to A4), ux-performance, ux-reliability, ux-trust

## References

Fetched 27 Oct 2026 with Scrapling; Mobbin screens found through the Mobbin connector the same day. The captures were kept in a session scratchpad and are not in the repo, so each link above is the source.

- W3C, WCAG 2.2: [what is new](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/), [1.4.3 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [2.5.8 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WebAIM Million 2026](https://webaim.org/projects/million/)
- [axe-core rule list](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [Android touch target size](https://support.google.com/accessibility/android/answer/7101858), [Apple HIG, buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Canva accessibility](https://www.canva.com/accessibility/), [Buffer accessibility](https://buffer.com/accessibility), [Hootsuite accessibility policy](https://www.hootsuite.com/legal/accessibility)
- Mobbin: [Canva accessibility settings](https://mobbin.com/screens/48fac4c0-6cf1-46f8-9c38-1aa02372c292), [X accessibility settings](https://mobbin.com/screens/a207ec80-034c-4c56-ae53-f8cbb9fcc772), [Whereby brand colours with contrast](https://mobbin.com/screens/e86cb1da-6690-4693-bff7-5632af4a4f9c)
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p6replay/results.md` (D9), `live-p7a-post/results.md` (D11)
