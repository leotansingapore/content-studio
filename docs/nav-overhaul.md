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
| Library | Everything (Everything, Posts, Board, Grid); Media; Approvals (Posts board, Leader approvals) |
| Plan | Calendar; Campaigns (Leo); Plans (Weekly plan, Launch plan, LinkedIn, Social north star); Ideas (Leo) |
| Insights | Results (/analytics); Coach; Inspiration (Top posts, Carousels, What's working, Trends, Examples, Saved, Your market); Creators (Following, Creator list, Research, Competitors); Recruit (Recruit kit, Conversations, Reply agent, Reply drafts, Auto-DM) |
| Brand | Profile (/playbook); Voice; Brand kit; Audiences (Audiences, Positioning). A tab that holds one page for a sign-in is named after that page, so customers see Positioning |
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
| Studio > Library > Media | /media | Library > Media | uploads, not made things |
| Studio > Blitz (Leo) | /blitz | Create > Formats picker, "Blitz: swipe through ready drafts" | a way to make; plain subtitle |
| Studio > Influencers > Faces and voices (Leo) | /people | Create > Video picker | who appears in videos |
| Studio > Slideshows > Slideshow | /slideshow | Create > Slides picker | same job as Carousel |
| Studio > Slideshows > Design | /design | Create > Slides picker | same job |
| Studio > Slideshows > Campaigns | /design/campaigns | Create > Slides picker, Auto slideshows | no longer a second "Campaigns" |
| Studio > Slideshows > Libraries | /design/libraries | Create > Slides picker, Picture sets | no longer a second "Library" |
| Studio > Approvals > Posts board | /reels | Library > Approvals | review of made posts |
| Studio > Approvals > Leader approvals | /team | Library > Approvals picker | same job |
| Radar > Posts > Top posts | /swipe | Insights > Inspiration | find something to remix |
| Radar > Posts > Carousels | /carousels | Insights > Inspiration picker | a source |
| Radar > Posts > What's working | /working | Insights > Inspiration picker | a source |
| Radar > Posts > Trends | /trends | Insights > Inspiration picker | a source |
| Radar > Posts > Inspiration | /inspiration | Insights > Inspiration picker, Examples | a source; no tab and item with one name |
| Radar > Creators > Following | /following | Insights > Creators | who to watch |
| Radar > Creators > Creators | /profiles | Insights > Creators picker, Creator list | same job |
| Radar > Creators > Research (Leo) | /research | Insights > Creators picker | same job |
| Radar > Remix > Clone a reel | /clone | Create > Video picker | it makes a script from a reel |
| Radar > Saved (Leo) | /saved | Insights > Inspiration picker | saved things to remix |
| Radar > Your market | /market | Insights > Inspiration picker | research |
| Grow > Brand Brain | /recruit | Insights > Recruit, as Recruit kit | Brand Brain is an internal name |
| Grow > Conversations | /recruit/conversations | Insights > Recruit picker | same page, its tab |
| Grow > AI agent | /recruit/agent | Insights > Recruit picker, Reply agent | "Agent" already means the studio's agent |
| Grow > Reply drafts | /recruit/engage | Insights > Recruit picker | same |
| Grow > Auto-DM (Leo) | /recruit/auto-dm | Insights > Recruit picker | same |
| Analytics > Analytics | /analytics | Insights > Results | first tab |
| Analytics > Coach | /coach | Insights > Coach | same |
| Brand > My Playbook | /playbook | Brand > Profile | Fastlane's word; the page's heading changes with it |
| Brand > Your voice | /voice | Brand > Voice | shorter |
| Brand > Brand kit | /brand | Brand > Brand kit | same |
| Brand > Audiences (Leo) | /audiences | Brand > Audiences | same |
| Brand > Competitors (Leo) | /competitors | Insights > Creators picker | Brand keeps to 5; it is a source to remix |
| Brand > F.A.D.S. | /fads | Brand > Audiences picker, Positioning | F.A.D.S. is an internal name |
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
| Computer | 7: New post, Next, Next, Next, Generate 3 hooks, Skip, pick a hook | 5 through Create (Create, Write it, then the same three); New post is still 7 |

Walked on localhost as the demo login at 390 up to the three hooks (two paid hook calls); the last tap, picking a
hook, was read off the screen and not pressed. The three taps inside the writer are GeneratePage's own.

## Judged too risky to move, and why

- The writer's own steps (Generate 3 hooks, the one question, pick a hook). Cutting them is a change to GeneratePage
  (5,000+ lines, another builder's) and to what gets paid for; the topic box skips the three Nexts without touching it.
- Truly merging pages into one (one Write page, one Slides page, one Library page with a view switch). Each is its own
  route with its own state and deep links; the picker gives the one-tab, one-control result with no address or state
  change. Merging Library's four views into one page is the best next candidate.
- New post still opens the writer on its first step. Pointing it at Create > Start would save two taps on a computer
  and cost the one-click habit; Leo's call.
- F.A.D.S. inside page copy (Plan's "F.A.D.S. tool", the page's own steps). The nav, the heading and Jump to say
  Positioning; the framework's name stays where the academy teaches it.
- Help under Settings has no place on the phone bar or sidebar; it is in the account menu, Settings and Jump to.
  Getting started is also a step on Home.
- Insights > Recruit: the recruit kit is not an insight. It needed a home under five destinations and has the fewest
  users; Leo may prefer it under Brand or hidden for brands that do not recruit.
- "One obvious next action on every screen" was applied to the shell, the tab rows and Create > Start. The 80 pages
  under them were walked for dead ends and errors, not redesigned.
