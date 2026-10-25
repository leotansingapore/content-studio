# Fastlane vs Content Studio: navigation and layout

Read from Leo's own Fastlane account (Activity Tracker workspace, Starter plan) on 24 Oct 2026, against
consultant-content-studio.vercel.app at main 6c7cbbbf. Screenshots: `~/Documents/Content Studio/Competitive Research/_raw/fastlane-1024/`
(01-27, ours in `ours-before/`). Older recordings of the same app: `docs/north-star/videos/fastlane-2026-10-19*`.

## Fastlane's shell

One sidebar, 218px, as its own rounded panel on a dark canvas. Top to bottom:

| Block | What is in it |
|---|---|
| Logo + workspace switcher | dropdown lists workspaces and the plan's workspace limit |
| 5 destinations | Home (count of things that need you), Strategy, Studio, Radar, Analytics (plan tag "Growth") |
| One call to action | "Start a chat with Senna", opens /home/new |
| Chat threads | Today / Earlier, title + first line + time, each its own URL (/home/<id>) |
| Foot | Brand (full width), Refer and earn + Support (half width), Senna's fuel meter (links to Plan and spend), account card (workspace icon, name, credits; menu: Settings, Sign out) |

The main area is a second rounded panel. Content sits in a centred column about 990px wide; editors and detail
pages (a campaign, a format, Influencers) use the full panel width.

## How Fastlane gets you around

1. Level 1 is the sidebar, and it never changes with the page.
2. Level 2 is a tab row under the page title: Strategy (Campaigns, Calendar), Studio (Overview, Create, Library,
   Blitz, Influencers), Brand (Profile, Products, Competitors, Demo videos, Photos and videos), Support (Feedback,
   Changelog).
3. Level 3 is chips on the page itself: Library (All formats, Video, Slideshow, Image; All, Ready, Scheduled,
   Posted, Building, Failed; search), Radar (brand chips, search, Filters, sort), Create (All 46, Ready 39, Needs
   something 7).
4. A detail page swaps the tabs for a way back: "< Studio" chip, "Strategy" breadcrumb, "< Settings".
5. Panels open inline at the top of the page, each with its own link: /strategy?show=new, ?show=goal,
   ?show=audiences. No modals.
6. Settings is one index page of grouped tiles (You; Workspace and plan; Senna; Connections; Replay the tour), each
   tile a sub-page.
7. Chat is three columns: sidebar, centred thread, and a "Your work" panel (recent runs, Hide).

## Ours today

| | Fastlane | Content Studio |
|---|---|---|
| Nav width before content | 218px | 488px (72 icon rail + 208 pages + 208 context) |
| Level 1 | 5 items + 1 chat button | 7 sections + 3 at the foot |
| Level 2 | tabs on the page | rail 2 lists every page under group headings; tabs only on phones, and only on the ~25 pages that render them |
| Level 3 | chips on the page | rail 3 holds a page's filters (Calendar, Posts board, All posts, Ideas, Analytics) or "On this page" |
| Main CTA | Start a chat | New post |
| Chat threads | in the sidebar | in a column inside /agent (4 columns on that page) |
| Account | card at the foot, menu with Settings and Sign out | Sign out button + email |
| Settings | index page of tiles | a section with 5 pages in rail 2 |
| Theme | dark, toggle in the header | light only (dark tokens exist, unused; 102 hard-coded light colour classes in 39 files) |

## Mapping our pages onto Fastlane's shape

| Fastlane | Ours, after the change | Tabs (pages) |
|---|---|---|
| Home | Home | Overview, Agent, Getting started, North star |
| Strategy | Strategy (was Plan) | Plan, Ideas, Campaigns, Calendar |
| Studio | Studio (was Create + Review + the post lists) | Create: Post, Formats, Batch, Carousel, Image, Slideshow, Video; Library: All posts, Board, Grid, Media, Saved files; Review: Posts board, Leader approvals; Influencers: Faces and voices |
| Radar | Radar (was Plan's "Find ideas") | Top posts, Trends, Clone a reel, Inspiration, Creators, Following, Competitors, Saved, Your market |
| (none) | Grow | Brand Brain, Conversations, AI agent, Reply drafts, Auto-DM |
| Analytics | Analytics | Analytics, Coach |
| Brand (foot) | Brand (foot) | My Playbook, Your voice, Brand kit, Audiences, F.A.D.S., Social accounts, Link in bio, Tracked links |
| Support (foot) | Learn + Feedback (foot) | Academy, How to post, How the studio works; Feedback |
| Settings (account menu) | Settings (account menu) | Reviewers, Connect Claude, Skills, Automations, Activity |

Grow has no Fastlane twin and stays because the recruit kit is ours. Refer and earn is not copied: there is no
referral programme.

## Build order

1. Shell: one sidebar, the section's tabs at the top of every page, no rail 2 or rail 3; filters go back onto
   their pages. Chat button and thread list for the agent's users, New post for everyone else. Live 25 Oct (00ac5b0e).
2. Dark theme by default with a switch in the account menu; public pages stay light. Done 25 Oct.
3. Settings index page of tiles (Connections, Your team, The agent), each page leading back to it; Social accounts,
   Link in bio and Tracked links moved there from Brand. Done 25 Oct.
4. Still open: the chat's "Your work" panel, a usage meter in the sidebar.
