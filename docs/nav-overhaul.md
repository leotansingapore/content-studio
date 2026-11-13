# Navigation map

Laid out as Fastlane's (app.usefastlane.ai) after Leo, 12 Nov: "FOLLOW THE USEFASTLANE LAYOUT, GO THROUGH EVERY SINGLE
THING". The reference is the 11 Nov meeting frames (~/worktrees.noindex/ff1111/fastlane-ref/frames-1111/, for example
t11-13.jpg) and the 24 Oct screenshots beside them (20-account-menu.jpg, 24-chat-thread.jpg, 25-chat-new.jpg). The
code is src/lib/nav.ts (every page, once), src/pages/StudioLayout.tsx (the sidebar, phone bar and More sheet) and
src/components/SectionTabs.tsx (the tab row and its picker).

No address has changed since the first nav overhaul (11 Nov): every page keeps its URL and its gate, and only where
the nav lists it moves. src/lib/nav.test.ts holds the list of addresses, the five-tab limit for both sign-ins, the
Leo-only set, and the order below.

## The sidebar

| Fastlane (11 Nov) | Ours |
|---|---|
| Logo, workspace switcher | Logo, brand switcher, and a search icon for Jump to (ours; Cmd or Ctrl K anywhere) |
| Home, Campaigns, Studio, Brand, Competitor Radar, Analytics, Warmed accounts | Home, Campaigns, Studio, Brand, Competitor Radar, Analytics (no warmed accounts) |
| Chats with a plus, then Today and Previous 30 days | Leo: Chats with a plus, then Today, Yesterday and Earlier, each chat its own link. Everyone else: New post in that place, as an outline, so the page's own action stays the one filled button |
| Workspace card: name, credits, usage bar, menu | Workspace card: the open brand, today's agent messages used as a bar (Leo) or who is signed in, and a menu with North star (Leo), Settings, Help, the theme and Sign out. A dot on it, and New on Help, when the feedback board has news |
| New version ready, Later, Refresh | The same, above the card |
| Collapse handle on the sidebar's edge | The same (Jilian, 12 Nov): the sidebar folds to an icon rail and back from its edge or Cmd/Ctrl+\\, remembered per device (src/lib/navFold.ts). Folded, the rail shows the six places, New post (Leo: New chat), Jump to and the workspace card's square, each named on hover |

Settings and Help left the sidebar: they are in the card's menu (Help opens /settings#help, Settings' Help tiles).
Brand moved up from the foot into the list.

## The phone

Bottom bar: Home, Campaigns, then Chats (Leo) or Studio (everyone else), and More. More holds a tile for each other
place (Studio on Leo's, Brand, Competitor Radar, Analytics, Settings), the theme, Help and Sign out.

## Tabs

Five at most, one row. A tab that holds several pages shows an arrow when open; pressing it lists them (the picker),
under kind headings where one tab holds several kinds. Filters stay on the pages.

| Place | Leo | Everyone else |
|---|---|---|
| Home | no tabs | no tabs |
| Campaigns | Campaigns, Calendar, Plans (Weekly plan, Launch plan, LinkedIn, Social north star), Ideas, Approvals (Posts board, Leader approvals) | Calendar, Plans (Weekly plan, Launch plan, LinkedIn), Leader approvals (Approvals when on the posts board) |
| Studio | Overview, Create (All formats, Video editor, Ask the agent: every other maker is folded into the agent's Make, 13 Nov, and stays at its address, in Jump to and on Overview), Library (Everything, All posts, Board, Grid, switched on the page), Blitz, Influencers | Overview, Create (opening on Post; the same makers without All formats, Script and Image), Library |
| Brand | Profile (Profile, Your voice, Brand kit, Audiences, Positioning), Products, Competitors, Demo videos, Media | Profile (Profile, Your voice, Brand kit, Positioning on an adviser brand), Media |
| Competitor Radar | Find posts (Top posts or Swipe file, Carousels, What's working, Trends, Inspiration), Creators (Following, Creators to follow, Research), Saved, Your market when on | Find posts (Top posts or News, Carousels, What's working, Trends and Inspiration on an adviser brand), Creators (Following, Creators to follow on an adviser brand), Your market when on |
| Analytics | Results, Coach, Recruit on an adviser brand (Recruit kit, Conversations, Reply agent, Reply drafts, Auto-DM) | Results, Coach, Recruit on an adviser brand |
| Settings | tiles, each page leading back: You, Connections, Your team, The agent, Help | the same, without the Leo-only tiles |

The recruit pages are a tab on adviser brands only; any brand still opens them by address and from Jump to.

## The agent's chat

Fastlane's three columns from lg: the sidebar with the chats list, the open chat centred in the panel with its
composer pinned at the bottom, and Your work full height against the panel's right edge (xl up; a Your work button
opens it as a sheet below that). On a chat, the sidebar lights that chat, not Home. Phones keep Chats and Your work
as buttons over the chat.

## Every page, and where it is

| Address | Name | Where | Who |
|---|---|---|---|
| /home | Overview | Home (no tabs) | everyone |
| /agent | Agent | Chats in the sidebar (+ for a new one); Chats on the phone bar | Leo |
| /north-star | North star | the workspace card's menu | Leo |
| /brands | Brands | All brands in the brand switcher's menu (no tabs) | everyone |
| /campaigns | Campaigns | Campaigns > Campaigns | Leo |
| /calendar | Calendar | Campaigns > Calendar | everyone |
| /plan | Weekly plan | Campaigns > Plans > Weekly plan | everyone |
| /launch | Launch plan | Campaigns > Plans > Launch plan | everyone |
| /linkedin | LinkedIn | Campaigns > Plans > LinkedIn | everyone |
| /social-north-star | Social north star | Campaigns > Plans > Social north star | Leo |
| /ideas | Ideas | Campaigns > Ideas | Leo |
| /reels | Posts board | Campaigns > Approvals > Posts board | posts board members |
| /team | Leader approvals | Campaigns > Approvals > Leader approvals | everyone |
| /studio | Overview | Studio > Overview | everyone |
| /make | All formats | Studio > Create > All formats | Leo |
| /generate | Post | Studio > Create > Post | everyone |
| /generate/batch | Weekly batch | Studio > Create > Weekly batch | everyone |
| /generate/answer | Answer | Studio > Create > Answer | everyone |
| /generate/vsl | Sales script | Studio > Create > Sales script | everyone |
| /hooks | Hooks | Studio > Create > Hooks | everyone |
| /script | Script | Studio > Create > Script | Leo |
| /carousel | Carousel | Studio > Create > Carousel | everyone |
| /slideshow | Slideshow | Studio > Create > Slideshow | everyone |
| /design | Design | Studio > Create > Design | everyone |
| /design/campaigns | Auto slideshows | Studio > Create > Auto slideshows | everyone |
| /design/libraries | Picture sets | Studio > Create > Picture sets | everyone |
| /image | Image | Studio > Create > Image | Leo |
| /edit | Video editor | Studio > Create > Video editor | everyone |
| /make/hook-demo | Hook + demo | Studio > Create > Hook + demo | everyone |
| /clone | Clone a reel | Studio > Create > Clone a reel | everyone |
| /library | Everything | Studio > Library > Everything | everyone |
| /drafts | All posts | Studio > Library > All posts | everyone |
| /board | Board | Studio > Library > Board | everyone |
| /grid | Grid | Studio > Library > Grid | everyone |
| /blitz | Blitz | Studio > Blitz | Leo |
| /people | Influencers | Studio > Influencers (was Faces and voices) | Leo |
| /playbook | Profile | Brand > Profile | everyone |
| /voice | Your voice | Brand > Profile > Your voice | everyone |
| /brand | Brand kit | Brand > Profile > Brand kit | everyone |
| /audiences | Audiences | Brand > Profile > Audiences | Leo |
| /fads | Positioning | Brand > Profile > Positioning | adviser brand |
| /brand/products | Products | Brand > Products | Leo |
| /competitors | Competitors | Brand > Competitors | Leo |
| /brand/demo-videos | Demo videos | Brand > Demo videos | Leo |
| /media | Photos and videos | Brand > Photos and videos (was Media) | everyone |
| /swipe | Top posts | Competitor Radar > Find posts > Top posts | everyone |
| /carousels | Carousels | Competitor Radar > Find posts > Carousels | everyone |
| /working | What's working | Competitor Radar > Find posts > What's working | everyone |
| /trends | Trends | Competitor Radar > Find posts > Trends | adviser brand |
| /inspiration | Inspiration | Competitor Radar > Find posts > Inspiration | adviser brand |
| /following | Following | Competitor Radar > Creators > Following | everyone |
| /profiles | Creators to follow | Competitor Radar > Creators > Creators to follow | adviser brand |
| /research | Research | Competitor Radar > Creators > Research | Leo |
| /saved | Saved | Competitor Radar > Saved | Leo |
| /market | Your market | Competitor Radar > Your market | market switched on |
| /analytics | Results | Analytics > Results | everyone |
| /coach | Coach | Analytics > Coach | everyone |
| /recruit | Recruit kit | Analytics > Recruit > Recruit kit | tab on adviser brands |
| /recruit/conversations | Conversations | Analytics > Recruit > Conversations | tab on adviser brands |
| /recruit/agent | Reply agent | Analytics > Recruit > Reply agent | tab on adviser brands |
| /recruit/engage | Reply drafts | Analytics > Recruit > Reply drafts | tab on adviser brands |
| /recruit/auto-dm | Auto-DM | Analytics > Recruit > Auto-DM | Leo, tab on adviser brands, posting switched on |
| /settings | Settings | the workspace card's menu (Help opens /settings#help) | everyone |
| /notifications | Notifications | Settings > You tile | everyone |
| /settings/post-choices | Post choices | Settings > You tile | everyone |
| /accounts | Connections (was Social accounts) | Settings > Connections tile | everyone; its Social accounts group only with posting switched on, Telegram only for Leo |
| /bio | Link in bio | Settings > Connections tile | everyone |
| /links | Tracked links | Settings > Connections tile | everyone |
| /connect | Connect Claude | Settings > Connections tile | everyone |
| /adlauncher | AdLauncher | Settings > Connections tile | Leo |
| /reels/team | Reviewers | Settings > Your team tile | board owners |
| /automations | What runs without you | Settings > The agent tile | Leo |
| /activity | Activity | Settings > The agent tile | Leo |
| /skills | Skills | Settings > The agent tile | Leo |
| /welcome | Getting started | Settings > Help tile (a new sign-in's first screen: no way-back row) | everyone |
| /academy | Academy | Settings > Help tile | everyone |
| /create-guide | How to post | Settings > Help tile | everyone |
| /tutorial | How it works | Settings > Help tile | everyone |
| /feedback | Feedback | Settings > Help tile | everyone |


Jump to finds every page by its name, its own old names (`was` in nav.ts: F.A.D.S., Brand Brain, VSL, My Playbook,
Influencers...) and its section's old names (Plan, Strategy, Create, Library, Radar, Insights, Grow, Studio), the
section's ranked below the page's own words.

## Measured (12 Nov, before and after this map)

| | Before | After |
|---|---|---|
| Sidebar controls at 1440, everyone else | 12, 5 with a border | 11, 2 with a border |
| Sidebar controls at 1440, Leo (no chats yet) | 13, 6 with a border | 11, 2 with a border |
| Filled buttons in the sidebar | 1 for everyone (New post, or Ask the agent) | 0 (New post is an outline; Leo has Chats with a plus) |
| Phone bar | 5 (Home, Create, Library or Chats, Plan, More) | 4 (Home, Campaigns, Studio or Chats, More) |
| Places in the sidebar | 5 plus Brand and Settings at the foot | 6, Settings in the card's menu |
| Agent chat at 1440, new chat | Chat 664px wide in the 990px column, Your work 256px inside it | Chat column 890px with the thread centred at 672px, Your work 288px full height at the panel's edge |
| Sideways scroll at 390 on every nav page | 0 | 0 |

## How we got here

- 24 Oct: one sidebar and tab rows after Fastlane's shell (docs/fastlane-nav-gap.md).
- 11 Nov, waves 3 and 4: 87 entries cut to five places, five tabs at most, pickers instead of chip rows, Create's
  first screen, New post opening it, recruit tabs on adviser brands only.
- 12 Nov, wave 7: Brand as Fastlane's five tabs; Products and Demo videos pages of their own.
- 12 Nov, wave 8: this map. Plan is Campaigns, Create and Library are one Studio again, Insights split back into
  Competitor Radar and Analytics, Brand in the list, Settings and Help in the workspace card, the chat in three
  columns.

## Left

- Fastlane puts the section's name over its tabs ("Studio", then Overview, Create...). Ours shows the tabs, then each
  page's own heading; adding the section name would put a third heading on every page.
- Faces and voices is called Influencers, and Media is called Photos and videos, as Fastlane names them. Renamed on 13 Nov in one sweep, every line a person reads, "Saved to Media" included; the old names stay searchable in Jump to.
- Everyone else's Campaigns has no page called Campaigns (that page is Leo's): it opens on the calendar.
- Home for everyone else shows two filled buttons at once: New post in the sidebar and the page's own Finish your
  post or Write a post. Home is not part of the shell.
- The brand's connected channels (ChannelsBlock) still sit under the brand switcher when posting is switched on;
  Fastlane has none there and lists them in Settings > Integrations.
