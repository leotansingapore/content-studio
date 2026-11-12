# Navigation overhaul (wave 3, r3-nav)

Base origin/main cbbd8707, branch r3-nav in ~/worktrees.noindex/cs-ff-choices. Leo: "do be very aggressive in the
navigation improvement overhaul too" and "everything should be stupidly simple to use".

No address changes. Every page keeps its URL and its Leo-only gate; what changes is where the nav lists it.

## Before (87 entries)

Sidebar: Home, Strategy, Studio, Radar, Grow, Analytics, then Brand, Learn, Feedback and Settings at the foot. Ten
places to go, plus New post with a second menu on its arrow, and Jump to.

- Tabs per section on Leo's sign-ins: Strategy 7, Studio 8 (five of them with a second row of chips), Radar 5 (two
  with chips), Grow 5, Analytics 2, Brand 6, Learn 4.
- Phone bar: Home, Strategy, Create (a menu), Studio or Chats, More. More held 7 or 8 tiles.

## After

Sidebar: Home, Create, Library, Plan, Insights, then Brand and Settings at the foot. One button: New post for
customers, Ask the agent for Leo. Jump to stays as the search box under it.

A section has at most 5 tabs and one row. The open tab, when it holds several pages, shows the open page's name and
a small arrow; pressing it lists the others (the picker). Filters stay on the pages.

| Section | Tabs (pages in each tab's picker) |
|---|---|
| Home | no tabs. /home; /agent (Leo, from the button and the chat list); /north-star (Leo, account menu) |
| Create | Start (/studio); Write (Post, Weekly batch, Answer, Sales script, Hooks, Script); Slides (Carousel, Slideshow, Design, Auto slideshows, Picture sets, Image); Video (Video editor, Hook + demo, Clone a reel, Faces and voices); Formats (All formats, Blitz), Leo only |
| Library | My work (Everything, All posts, Board, Grid, as a switch on the page); Approvals (Posts board, Leader approvals) |
| Plan | Calendar; Campaigns (Leo); Plans (Weekly plan, Launch plan, LinkedIn, Social north star); Ideas (Leo) |
| Insights | Results (/analytics); Coach; Find posts (Top posts, Carousels, What's working, Trends, Inspiration, Saved, Your market); Creators (Following, Creators to follow, Research); Recruit (Recruit kit, Conversations, Reply agent, Reply drafts, Auto-DM), on adviser brands only |
| Brand | Fastlane's five (wave 7): Profile (Profile, Your voice, Brand kit, Audiences, Positioning); Products (/brand/products, Leo); Competitors (Leo); Demo videos (/brand/demo-videos, Leo); Media. Anyone else's Brand is Profile and Media |
| Settings | index of tiles: You, Connections, Your team, The agent, Help (Getting started, Academy, How to post, How it works, Feedback) |

Phone bar: Home, Create, Library, Plan, More. Leo's is Home, Create, Chats, Plan, More. More holds what the bar
does not: Insights, Brand, Settings (and Library on Leo's).

## Where every entry goes

| Before | Address | After | Why |
|---|---|---|---|
| Home > Overview | /home | Home | same |
| Home > Agent (Leo) | /agent | Home, from Ask the agent and the chat list | same |
| Home > North star (Leo) | /north-star | account menu | same |
| Strategy > Campaigns (Leo) | /campaigns | Plan > Campaigns | Strategy is called Plan: the word a stranger uses |
| Strategy > Calendar | /calendar | Plan > Calendar | first tab for customers |
| Strategy > Plan | /plan | Plan > Plans, as Weekly plan | three plans are one job |
| Strategy > Launch | /launch | Plan > Plans picker, Launch plan | same job |
| Strategy > LinkedIn | /linkedin | Plan > Plans picker, LinkedIn | same job |
| Strategy > Ideas (Leo) | /ideas | Plan > Ideas | same |
| Strategy > Social north star (Leo) | /social-north-star | Plan > Plans picker | a plan of formats |
| Studio > Overview | /studio | Create > Start | becomes the "what do you want to make?" screen |
| Studio > Create > All formats (Leo) | /make | Create > Formats, and "More formats" on Start | the catalogue sits behind one link |
| Studio > Create > Carousel | /carousel | Create > Slides | slides and pictures are one job |
| Studio > Create > Image (Leo) | /image | Create > Slides picker | same job |
| Studio > Create > Video | /edit | Create > Video | same |
| Studio > Create > Hook + demo | /make/hook-demo | Create > Video picker | it makes a video |
| Studio > Write > Post | /generate | Create > Write | first maker |
| Studio > Write > Batch | /generate/batch | Create > Write picker, Weekly batch | named as its page |
| Studio > Write > Answer | /generate/answer | Create > Write picker | same job |
| Studio > Write > VSL | /generate/vsl | Create > Write picker, Sales script | VSL is jargon |
| Studio > Write > Hooks | /hooks | Create > Write picker | same job |
| Studio > Write > Script (Leo) | /script | Create > Write picker | same job |
| Studio > Library > Everything | /library | Library > Everything | Library is its own place, as on Fastlane's Studio tab row but one level up |
| Studio > Library > All posts | /drafts | Library > Everything picker, Posts | a view of my stuff |
| Studio > Library > Board | /board | Library > Everything picker | a view |
| Studio > Library > Grid | /grid | Library > Everything picker | a view |
| Studio > Library > Media | /media | Brand > Media (wave 7; was Library > Media) | Fastlane's Photos and videos: the logo, product photos and footage the makers draw from |
| Studio > Blitz (Leo) | /blitz | Create > Formats picker, "Blitz: swipe through ready drafts" | a way to make; plain subtitle |
| Studio > Influencers > Faces and voices (Leo) | /people | Create > Video picker | who appears in videos |
| Studio > Slideshows > Slideshow | /slideshow | Create > Slides picker | same job as Carousel |
| Studio > Slideshows > Design | /design | Create > Slides picker | same job |
| Studio > Slideshows > Campaigns | /design/campaigns | Create > Slides picker, Auto slideshows | no longer a second "Campaigns" |
| Studio > Slideshows > Libraries | /design/libraries | Create > Slides picker, Picture sets | no longer a second "Library" |
| Studio > Approvals > Posts board | /reels | Library > Approvals | review of made posts |
| Studio > Approvals > Leader approvals | /team | Library > Approvals picker | same job |
| Radar > Posts > Top posts | /swipe | Insights > Find posts | find something to remix |
| Radar > Posts > Carousels | /carousels | Insights > Find posts picker | a source |
| Radar > Posts > What's working | /working | Insights > Find posts picker | a source |
| Radar > Posts > Trends | /trends | Insights > Find posts picker | a source |
| Radar > Posts > Inspiration | /inspiration | Insights > Find posts picker | a source; the page keeps its name |
| Radar > Creators > Following | /following | Insights > Creators | who to watch |
| Radar > Creators > Creators | /profiles | Insights > Creators picker, Creators to follow | named as its heading |
| Radar > Creators > Research (Leo) | /research | Insights > Creators picker | same job |
| Radar > Remix > Clone a reel | /clone | Create > Video picker | it makes a script from a reel |
| Radar > Saved (Leo) | /saved | Insights > Find posts picker | saved things to remix |
| Radar > Your market | /market | Insights > Find posts picker | research |
| Grow > Brand Brain | /recruit | Insights > Recruit, as Recruit kit | Brand Brain is an internal name |
| Grow > Conversations | /recruit/conversations | Insights > Recruit picker | same page, its tab |
| Grow > AI agent | /recruit/agent | Insights > Recruit picker, Reply agent | "Agent" already means the studio's agent |
| Grow > Reply drafts | /recruit/engage | Insights > Recruit picker | same |
| Grow > Auto-DM (Leo) | /recruit/auto-dm | Insights > Recruit picker | same |
| Analytics > Analytics | /analytics | Insights > Results | first tab |
| Analytics > Coach | /coach | Insights > Coach | same |
| Brand > My Playbook | /playbook | Brand > Profile, first in its picker | Fastlane's word; the page's heading changes with it |
| Brand > Your voice | /voice | Brand > Profile picker, Your voice (wave 7) | Profile's Tone and voice rows lead here; named as its heading |
| Brand > Brand kit | /brand | Brand > Profile picker, Brand kit (wave 7), without its products and demo videos | Profile's Identity and Look rows lead here |
| Brand > Audiences (Leo) | /audiences | Brand > Profile picker (wave 7) | Profile's Personas rows lead here |
| Brand > Competitors (Leo) | /competitors | Brand > Competitors (wave 7; was Insights > Creators in waves 3 to 6) | Fastlane's Brand tab; their ads stay in Insights > Find posts |
| Brand > F.A.D.S. | /fads | Brand > Profile picker, Positioning | F.A.D.S. is an internal name |
| Learn > Getting started | /welcome | Settings > Help | help is not a destination |
| Learn > Academy | /academy | Settings > Help | same |
| Learn > How to post | /create-guide | Settings > Help | same |
| Learn > How the studio works | /tutorial | Settings > Help, How it works | same |
| Feedback | /feedback | Settings > Help | same |
| Settings and its 12 tiles | unchanged | Settings | same |
| New post arrow menu | 7 links | removed; Create > Start is that list | one button |
| Phone Create menu | 7 links | the bar's Create opens Create > Start | one screen for both |

## Create > Start

One question, "What do you want to make?", a box for the topic with Write it, and six big choices: Post, Carousel,
Slideshow, Video, Weekly batch, Answer. "More formats" opens the catalogue for Leo and the rest of the makers for
everyone else. The rows that were on the page (formats, ads, trending, your latest) stay under it.

## Taps to a first written post (new customer, phone, from Home)

| | Before | After |
|---|---|---|
| Phone | 8: Create, Post, Next, Next, Next, Generate 3 hooks, Skip, pick a hook | 5: Create, Write it, Generate 3 hooks, Skip, pick a hook |
| Computer | 7: New post, Next, Next, Next, Generate 3 hooks, Skip, pick a hook | 5: New post, Write it, Generate 3 hooks, Skip, pick a hook |

Walked on localhost as the demo login at 390 up to the three hooks (two paid hook calls); the last tap, picking a
hook, was read off the screen and not pressed. The three taps inside the writer are GeneratePage's own.

## Judged too risky to move, and why

- The writer's own steps (Generate 3 hooks, the one question, pick a hook). Cutting them is a change to GeneratePage
  (5,000+ lines, another builder's) and to what gets paid for; the topic box skips the three Nexts without touching it.
- Truly merging pages into one (one Write page, one Slides page, one Library page with a view switch). Each is its own
  route with its own state and deep links; the picker gives the one-tab, one-control result with no address or state
  change. Merging Library's four views into one page is the best next candidate.
- New post now opens Create > Start with the topic box focused (wave 4, Leo's call), and goes back to the writer
  while the tab holds an unfinished post there (src/lib/newPost.ts).
- F.A.D.S. inside page copy (Plan's "F.A.D.S. tool", the page's own steps). The nav, the heading and Jump to say
  Positioning; the framework's name stays where the academy teaches it.
- Help under Settings has no place on the phone bar or sidebar; it is in the account menu, Settings and Jump to.
  Getting started is also a step on Home.
- Insights > Recruit: the recruit kit is not an insight, but it needed a home under five destinations. Since wave 4
  the tab shows on adviser brands only; any brand still opens its pages by address and from Jump to.
- "One obvious next action on every screen" was applied to the shell, the tab rows and Create > Start. The 80 pages
  under them were walked for dead ends and errors, not redesigned.

## First-tab pages: what is left inside each page (wave 4 pass)

Looked at as the demo login at 390 and 1440, once with its posts and once as a new sign-in (nothing on the device, the
sync faked). Fixed in the shell and headers: Getting started no longer says "back to Settings", and the empty Library,
the empty calendar and Getting started each offer one button that opens Create > Start. Left inside the pages:

| Page | What is still more than one thing, or unclear |
|---|---|
| Home (/home), with posts | At 1440 the page itself has no filled button: Write a post, Plan a week and Weekly batch are three equal outlines beside Start diagnosis and the Get set up list. The sidebar's New post is the one filled button on screen. On a phone Write a post is filled and the page reads well |
| Getting started (/welcome), a new sign-in's Home | Four ways on at once: Set my voice, Write a post and Plan a week on the step cards, then Start with my first post, Show me around and a Skip link. On a phone the filled button sits under three cards, below the fold. The heading carries an emoji. The phone bar lights More, because the page lives under Settings |
| Create > Start (/studio) | Clear. The Post tile opens the writer on its first step while the topic box opens it on its last; a tile press with an empty box could ask for the topic first |
| Library (/library) | Empty: clear (Write a post, Find a post to remix). With posts there is no leading action, which fits a place to browse; every card has its own Open |
| Calendar (/calendar) | On a phone four rows of controls (view, platform, status and Add note, month) come before the first week. "3 a week, 5 a week, 7 a week" are three equal choices with none recommended. Write a post in the week card is a button only when nothing at all is planned; otherwise it is a link in small print |
| Results (/analytics) | A new sign-in meets three tools in a row that each ask for a handle (Audit your account, Analyze a creator, Your accounts) before any result. "Your account audit" sits directly over a card titled "Audit your account". Audit my Instagram is the one filled button |
| Profile (/playbook) | Clear: one filled button names the next gap. The two Saved panels under it were not opened empty |
| Every page, phones | The round chat button covers the bottom right of the content (the Answer tile's words on Create, a row's arrow on Profile). It comes from the shared feedback component |

## Brand as Fastlane's five tabs (wave 7, 12 Nov)

| | Before | After |
|---|---|---|
| Leo | Profile, Voice, Brand kit, Audiences (Audiences, Positioning) | Profile (Profile, Your voice, Brand kit, Audiences, Positioning), Products, Competitors, Demo videos, Media |
| Anyone else, adviser brand | Profile, Voice, Brand kit, Positioning | Profile (Profile, Your voice, Brand kit, Positioning), Media |
| Anyone else, other brand | Profile, Voice, Brand kit | Profile (Profile, Your voice, Brand kit), Media |

- Products and Demo videos were sections in the middle of the 20-section Brand kit page. They are pages of their own
  now, /brand/products and /brand/demo-videos (Fastlane's addresses), drawn by BrandPage with `part`, so they load and
  save the kit exactly as before and nothing about them changed. The script product card went with Products. The
  Brand kit page no longer shows them. Every older address (/brand#products, ?product=, ?products=review,
  #script-product, #demo-videos, ?demo=) opens the new tab with the rest of the address kept (links.ts
  brandPartAddress), and every link the app builds goes there directly.
- Competitors came back from Insights > Creators, as gaps/brand.md row 1 proposed; their ads stay in Find posts.
- Media came from the Library, where it was the one tab that was not something you made.
- Gates: unchanged. Products, Competitors, Demo videos and Audiences are Leo's; Positioning is an adviser brand's.
  Anyone else opening /brand/products or /brand/demo-videos gets "This page isn't on your account yet", as for any
  Leo-only page; /brand#products for them stays on the kit, which never had that section for them.

Left:
- The tab is called Media, not Fastlane's "Photos and videos". About 25 lines across other builders' pages say "Saved
  to Media", "Add from Media" or "No photos in Media yet"; renaming the tab alone would name a place nothing else
  calls by that name. Renaming it everywhere is one sweep, Leo's call.
- Brand kit is still one long page under Profile's picker (You, DM links, offers, emoji and hashtags, words to avoid,
  colours, fonts, sign-off, posting times, language, logo, on every post). Fastlane splits these across Profile's
  rows with in-place editing; ours links each Profile row to its section. Editing in place is a page rebuild.
- Products and Demo videos have no visible page title: the section's own card heading ("Products and services",
  "Demo videos") is the first thing under the tab, as on Fastlane, so a visible title would say it twice.
