# Content Studio today: what already exists (2026-10-19)

Source: the read-only worktree ~/worktrees.noindex/cs-north-star at origin/main 08537d1 (branch feat/north-star,
clean). Every claim below was read from code or repo docs in that checkout; file paths are relative to it unless
absolute. Live app: https://consultant-content-studio.vercel.app/. "unverified" marks anything the code cannot prove
(live secret values, live deploy state of functions not versioned here).

Ground rules a builder must know first (from CLAUDE.md):
- Supabase project is the shared "academy" instance hgdbflprrficdoyxmdxe (also serves aia-product-compass-hub).
- The post writer `generate-social-content`, `generate-brand-template`, `generate-collateral` and
  `analyze-ig-creator` live on that project and are NOT deployed from this repo. Reference copies (2026-09-15) are in
  supabase/snapshots/functions/. Everything else in supabase/functions/ IS versioned and deployed from here
  (`supabase functions deploy <name> --project-ref hgdbflprrficdoyxmdxe --use-api`, JWT on unless noted).
- All user data is localStorage-first under `content-studio-*` keys and is mirrored to the `cs_user_data` table by
  src/lib/cloudSync.ts (SYNC_PREFIX = "content-studio-"), while device-only state uses `cs-*` keys; the sync has no
  tombstones, so a deleted synced key can come back from another device.
- Per-brand data keys on `scoped(userId)` from src/lib/profiles.ts (bare uid for the default brand,
  `${uid}~${profileId}` for others).
- Decisions in edge functions go through supabase/functions/_shared/jev.ts (TypeSafe Jev, pinned jev-1.13.0) and the
  LLM only writes words. Most OpenAI calls go through supabase/functions/_shared/openaiChat.ts, whose model is the
  OPENAI_MODEL secret (default "gpt-6-luna") with one retry on the caller's own older model id, but reel-visuals,
  storyboard, video-assist (VIBE_MODEL) and the ai-video script still pin "gpt-4.1" directly.
- Paid calls are capped per user per day in supabase/functions/_shared/usageCaps.ts (table cs_ai_usage, migration
  supabase/hub/009_ai_usage.sql), reset 08:00 Singapore time. Full cap list in section 7.

---------------------------------------------------------------------------------------------------------------------

## 1. Route table

This covers every `<Route path>` in src/App.tsx. "Signed in" means the route sits inside `<ProtectedRoute>` and
StudioLayout; the nav column is the src/lib/nav.ts SECTIONS id, and a route left out of the nav appears in the
EXCEPTIONS map of src/lib/navRoutes.test.ts with its reason. All studio pages are `lazy()` except Home.

### Public (no sign-in)

| Public path | Component file | Nav | Gate | Purpose |
|---|---|---|---|---|
| /roadmap | src/pages/PublicRoadmap.tsx (eager) | none (exception) | public | Content Studio's public feedback board / roadmap (shared FeedbackBoard component, leotan-feedback service). |
| /auth | src/pages/Auth.tsx (eager) | none (exception) | public | Sign in (password, magic link + code via src/lib/magicLink.ts). |
| /review/:token | src/pages/PreviewReviewPage.tsx | none (exception) | token in URL | Compliance preview: a manager or compliance officer reads a shared post snapshot and comments without an account (edge fn preview-link, --no-verify-jwt, SQL 012). |
| /l/:slug | src/pages/BioPublicPage.tsx | none (exception) | public | A brand's published link-in-bio page; buttons go through a counting redirect (edge fn link-in-bio, SQL 015). |
| /join | src/pages/JoinPage.tsx | none (exception) | public, then sign-in | /join#<token>: accept Leo's invite to his posts board (team-board claim, SQL 022/023). |
| /t/report/:slug | src/pages/TrackedReportPublicPage.tsx | none (exception) | public | A campaign's public tracked-link report (edge fn tracked-link). |
| /t/:slug | not a React route: vercel.json rewrite to edge fn tracked-link | - | public | Tracked short link redirect, counts taps and people. |

### Studio (signed in, inside StudioLayout)

| Studio path | Component file | Nav section > label | Who sees it | Purpose |
|---|---|---|---|---|
| / | Navigate | - | signed in | Redirects to /home. |
| /home | src/pages/HomePage.tsx (eager) | home > Overview | signed in | Dashboard: Coming up, pick up where you left off, Need an idea?, weekly goals. |
| /welcome | src/pages/WelcomePage.tsx | home > Getting started | signed in | First-run welcome (src/lib/onboarding.ts flag). |
| /generate | src/pages/GeneratePage.tsx (4,294 lines) | write > Post | signed in | Write: the AI post writer (brief wizard, hooks, variants, checks, image, schedule). Landing point of every text remix link. |
| /generate/batch | src/pages/BatchPage.tsx | write > Batch | signed in | "Weekly batch": one topic + pillar + audience -> one post per platform in parallel (src/lib/batchGenerate.ts). |
| /carousel | src/pages/CarouselPage.tsx | write > Carousel | signed in | Carousel maker: post -> branded 1080x1350 slides, PNG and PDF download, "Tighten with AI". |
| /edit | src/pages/VideoEditPage.tsx (2,641 lines) | write > Video | signed in | Video editor + "Make a video without filming" (AI avatar, explainer, template clip, montage), clips, YouTube clips. |
| /media | src/pages/MediaPage.tsx | write > Media | signed in | Photo library kept on this device (IndexedDB), folders, alt text, Pexels stock search. |
| /plan | src/pages/PlanPage.tsx | pipeline > Plan | signed in | Content plan from F.A.D.S. positioning + reference competitors -> weekly funnel slots that open Write. |
| /calendar | src/pages/CalendarPage.tsx (2,165 lines) | pipeline > Calendar | signed in (team posts + channel feeds: Leo only, see section 5) | Month/week/upcoming calendar of posts, day notes, coverage, Post it for me, team-post review. |
| /board | src/pages/BoardPage.tsx | pipeline > Board | signed in | Kanban: Idea, Scripted, To film, Editing, Scheduled, Posted (src/lib/board.ts). |
| /drafts | src/pages/DraftsPage.tsx | pipeline > My posts | signed in | All posts with filters, labels, CSV import, repurpose, Share for review, Post it for me. |
| /grid | src/pages/GridPage.tsx | pipeline > Grid | signed in | Instagram grid preview of planned + posted posts. |
| /reels | src/pages/ReelsPage.tsx | pipeline > Reels (`show: reelsShown`) | Leo (TEAM_OWNER_IDS) and invited board members with the reels module | Leo's MoneyBees/FINternship/ActivityTracker posts review board (Posts feed, board, grid), proxied by edge fn team-board. |
| /reels/team | src/pages/ReelsTeamPage.tsx | none (exception: Team button on /reels) | owner only (server) | Leo makes invite links (role + brands) and manages board members. |
| /recruit | src/pages/RecruitPage.tsx | recruit > Brand Brain | signed in | Recruitment kit "From Chasing to Chosen": Brand Brain document. |
| /recruit/:tab | src/pages/RecruitPage.tsx | recruit > Conversations, AI agent (exception covers the param) | signed in | Conversations (WhatsApp share scripts) and AI agent (briefs + agent pack from the Brand Brain). |
| /recruit/engage | src/pages/EngagePage.tsx | recruit > Reply drafts | signed in | Engage: paste comments/DMs, copy drafts out (replies, dms, comments, connect, snippets). |
| /recruit/auto-dm | src/pages/AutoDmPage.tsx | recruit > Auto-DM (`show: socialConnectShown`) | SOCIAL_CONNECT_USERS allowlist (server) | Comment keyword -> DM / public reply automations through Zernio. |
| /coach | src/pages/CoachPage.tsx | improve > Coach | signed in | Diagnosis quiz, About you, Idea Dump, one long piece -> 5 posts, review your posts, progress. |
| /diagnosis | Navigate | - | signed in | Redirects to /coach. |
| /analytics | src/pages/AnalyticsPage.tsx (1,124 lines) | improve > Analytics | signed in (Your real numbers needs Social accounts on) | This week card, account audit, real numbers, breakdowns, best time, top posts, creator lookup. |
| /team | src/pages/TeamPage.tsx | improve > Team review | signed in; adapts to no team / member / leader | Agency team review: submit, approve / changes / reject, audit trail, mentions, approval rules. |
| /swipe | src/pages/SwipeFilePage.tsx | discover > Top posts | signed in | Swipe file: top posts (tab posts), news (industry news, your feeds, mentions), Meta ads (tab ads). |
| /trends | src/pages/TrendsPage.tsx | discover > Trends | signed in | Daily trend kits (hooks, talking points, CTA, how to film) + top SG YouTube finance videos. |
| /clone | src/pages/CloneReelPage.tsx | discover > Clone a reel | signed in | Paste an IG reel / TikTok link -> breakdown, 3 concepts, your script, shot list, caption. |
| /inspiration | src/pages/InspirationPage.tsx -> src/components/Inspiration.tsx | discover > Inspiration | signed in | 100 hand-picked example posts; "use as vibe" opens Write with that structure. |
| /inspiration/:id | src/pages/InspirationDetailPage.tsx | none (exception) | signed in | One inspiration example, Copy link, use as vibe. |
| /profiles | src/pages/ProfilesPage.tsx -> src/components/AdvisorProfiles.tsx | discover > Creators | signed in | 66 hand-picked SG finance creators/advisers, filters, saved. |
| /profiles/:id | src/pages/ProfileDetailPage.tsx | none (exception) | signed in | One creator with their top posts (TopPostCard: Remix this, Clone this reel). |
| /following | src/pages/FollowingPage.tsx | discover > Following | signed in | Track up to 5 public IG/TikTok accounts; new posts with Remix; Engage this week. |
| /market | src/pages/MarketPage.tsx | discover > Your market (`show: marketShown`) | MARKET_USERS allowlist (server); Leo only today | Weekly check: ChatGPT answers to client questions, keyword news, Following's best posts, each judged by Jev; write from what moved. |
| /playbook | src/pages/PlaybookPage.tsx | playbook > My Playbook | signed in | Summary of positioning, voice, reminders (NotifySettings). |
| /voice | src/pages/VoicePage.tsx | playbook > Your voice | signed in | Paste 3-5 past posts -> voice summary (generate-social-content mode voice-summary). |
| /brand | src/pages/BrandPage.tsx | playbook > Brand kit | signed in | Name, handle, headshot, logo, colour, sign-off, DM links, offers, emoji/hashtag rules, avoid words, posting times. |
| /bio | src/pages/LinkInBioPage.tsx | playbook > Link in bio | signed in | Build and publish /l/<slug> per brand, clicks per link. |
| /links | src/pages/TrackedLinksPage.tsx | playbook > Tracked links | signed in; making links needs hub membership (hub_is_member) | Tracked /t/ short links, clicks and people, campaign public reports. |
| /accounts | src/pages/AccountsPage.tsx | playbook > Social accounts (`show: socialConnectShown`) | SOCIAL_CONNECT_USERS allowlist (server) | Connect IG, FB, TikTok, LinkedIn, YouTube, Threads per brand via Zernio. |
| /fads | src/pages/FadsPage.tsx | playbook > F.A.D.S. | signed in | Positioning workshop ported from AIA Product Compass Hub (generate-brand-template, generate-collateral), Send to Plan. |
| /fads/:tab | src/pages/FadsPage.tsx | (exception: a tab of /fads) | signed in | personality, purpose, experience, audience, solutions, messaging, output. |
| /connect | src/pages/ConnectPage.tsx | playbook > Connect Claude | signed in | Make a private MCP link so Claude can read posts/calendar/results/brand and add drafts. |
| /brands/new | src/pages/AddBrandPage.tsx | none (exception: profile switcher) | signed in | Add a brand from its website (edge fn brand-dna) and pre-fill its stores. |
| /academy | src/pages/AcademyPage.tsx | learn > Academy | signed in | Video lessons (YouTube ids in src/data/academy.ts). |
| /create-guide | src/pages/CreateGuidePage.tsx | learn > How to post | signed in | Step guide: idea, draft, carousel, reel, reverse-engineer, compliance, schedule. |
| /tutorial | src/pages/TutorialPage.tsx | learn > How the studio works | signed in | Long-form how-to of the studio. |
| /feedback | src/pages/FeedbackPage.tsx | feedback > Requests and roadmap | signed in | Feedback board (vote, roadmap, changelog). |
| /hub | src/components/hub/HubGate.tsx + src/pages/hub/HubHomePage.tsx | none (exception: "paid hub, unlinked on purpose (e0da451)") | hub_memberships: admin, or status client/active; else HubPaywallPage (SGD 49/month) | Members Hub home. |
| /hub/trends | src/pages/hub/HubTrendsPage.tsx | none | hub member | Trends per niche, TrendCard "Remix in Write". |
| /hub/guides | src/pages/hub/HubGuidesPage.tsx | none | hub member | Guides by category (editing, videography, trends, tips). |
| /hub/guides/:slug | src/pages/hub/HubGuideDetailPage.tsx | none | hub member | One guide. |
| /hub/admin | src/pages/hub/HubAdminPage.tsx | none | hub admin | Clients, posts, members. |
| * | src/pages/NotFoundPage.tsx (eager) | - | signed in | 404 inside the layout. |

Not routes but always mounted in StudioLayout: ProfileSwitcher (brand switch, Add a brand), JumpTo (Cmd/Ctrl+K,
src/lib/jumpTo.ts), ExportPill (video export progress on any page), AssistantMount (in-app assistant, section 2
"agent"), the Pipeline badge count (src/lib/needsYou.ts).

---------------------------------------------------------------------------------------------------------------------

## 2. Feature inventory by area

Status key: live = any signed-in user; gated (who) = allowlist or role; partial = exists but the named piece is
missing. Caps are DAILY_LIMITS entries in supabase/functions/_shared/usageCaps.ts (per user per day unless "global").

### inspiration

| Inspiration feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Top posts swipe file | /swipe?tab=posts | Top 3 recent IG posts per profile for 47 creators in src/data/topPosts.json (about 140 posts), with covers committed to public/covers. Derived labels: topic, angle, audience, psychological trigger, structure; outperformance vs each creator's own average. You filter by format, from (advisor/influencer), topic, angle, audience, saved and sort (for-you, engagement, viewed, liked, commented, newest, trending), with a "Formats working now" strip on top and a post drawer that lists similar posts. | No runtime AI. Weekly data drop (scripts/refresh-top-posts.mjs: Apify scrape ~US$0.75, build-top-posts, fetch-covers, gen-ideas with free Claude CLI; launchd com.leo.top-posts-refresh Sundays 21:00). | src/pages/SwipeFilePage.tsx, src/lib/topPosts.ts, src/lib/postInsights.ts, src/components/ReelCard.tsx, src/components/PostDetailDrawer.tsx, src/data/topPosts.json | live (static, weekly) |
| Ads swipe | /swipe?tab=ads | 21 real Singapore Meta Ad Library ads (src/data/adsSwipe.json): advertiser, industry, format (image/video/carousel), headline, body, CTA, start date ("Running N days"), platforms, Jev-picked hook family (AdLauncher's seven). Search, industry filter. | No runtime AI. Weekly drop by scripts/ads-swipe.mjs from ~/.local/bin/ads-swipe-collect on Leo's Mac. | src/components/AdsSwipe.tsx, src/lib/adsSwipe.ts | live (static, small) |
| Industry news | /swipe?tab=news | SG news copied daily from ActivityTracker Bulletin (49 stories), each with gist, talking point, client message; "write about this". | Static drop scripts/industry-news.mjs. | src/components/IndustryNews.tsx, src/lib/industryNews.ts | live |
| Your feeds | /swipe?tab=news | Up to 10 RSS/news feeds per brand; newest items -> "Write about this". | edge fn feed-ideas, cap feeds 60 | src/components/YourFeeds.tsx, src/lib/feeds.ts, supabase/functions/feed-ideas | live |
| Mentions | /swipe?tab=news | Up to 5 keywords checked against SG Google News (DataForSEO, 10 results each). | edge fn mentions, cap mentions 10 | src/components/Mentions.tsx, src/lib/mentions.ts | live |
| Trends | /trends | Daily trend kits (src/data/trends.json, 10 now): title, why it works, hooks, talking points, CTA + cta_type, how to film, source video embed, platform/type filters. Plus this month's most-viewed SG finance YouTube videos (8). | Static drop scripts/trend-scout.mjs (Apify TikTok hashtags + IG reels vs creator median, Claude writes kits), scripts/sg-feeds.mjs (YouTube). | src/pages/TrendsPage.tsx, src/lib/trends.ts, src/components/YouTubeTrends.tsx, src/lib/sgFeeds.ts | live |
| Real questions | Write idea step | Newest r/singaporefi + HardwareZone Money Mind questions (60), shown in Write as "A real question from a client this week". | Static drop scripts/sg-feeds.mjs (Jev judges, body not stored). | src/components/RealQuestions.tsx, src/data/realQuestions.json | live |
| Inspiration library | /inspiration, /inspiration/:id | 100 hand-picked example posts (src/data/inspiration.json) filtered by pillar, platform, format, audience; saved; "use as vibe". | none | src/components/Inspiration.tsx, src/lib/savedItems.ts | live |
| Creators | /profiles, /profiles/:id | 66 hand-picked SG finance creators (src/data/advisors.json): company, platform, audience, niche (8 parent groups), saved; detail shows their top posts. | none | src/components/AdvisorProfiles.tsx, src/lib/nicheGroups.ts, src/pages/ProfileDetailPage.tsx | live |
| Creator lookup | /analytics | Analyse a creator by handle: the hand-picked data first, live fallback for any public IG handle. | analyze-ig-creator (academy-hosted, Apify; not versioned here, no cap in usageCaps) | src/components/CreatorLookup.tsx, src/lib/creatorAnalysis.ts | live (backend unverified) |
| Following | /following | Up to 5 public IG/TikTok accounts per brand; each check stores a follower snapshot and about 15 newest posts; new posts marked; growth, posts per week, best post; Remix per post. | edge fn track-accounts (Apify), cap track-accounts 10 | src/pages/FollowingPage.tsx, src/lib/following.ts | live |
| Your market | /market | Set up name, site, audience, topics, up to 5 client questions; weekly check = ChatGPT search answers via DataForSEO llm_scraper (your position: not mentioned / passing / named / cited), keyword news, Following's best posts; Jev tags each item act or watch, and any item opens Write. One check a week per brand, 3 per account, 20 a day global. | edge fn market (OpenAI suggest + Jev), caps market-check 3, market-check-global 20, market-suggest 5 | src/pages/MarketPage.tsx, src/lib/market.ts, supabase/functions/market | gated (MARKET_USERS; Leo only today) |
| Saved items | /inspiration, /profiles, /swipe | Bookmarks per brand. | none | src/lib/savedItems.ts | live |
| Members Hub trends | /hub/trends | Trends per niche with angles and example videos; "Remix in Write". | none | src/components/hub/TrendCard.tsx | gated (hub members; hub unlinked) |
| Viral search / ad library search by keyword | - | Search across all public posts or all ads by keyword. | - | - | missing (only the static drops above) |

### remix
See section 3 for every entry point. Summary: 14 entry points exist; all but two hand TEXT (a `ctx` brief) to Write.
Clone a reel is the only one that reads a video's transcript and pacing; Copy a reel's style is the only one that
changes a video. No entry point produces media (image, video, carousel slides) from someone else's content in one
step, and none fills the AI avatar or the editor from a remix.

### format-text

| Text feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Write (single post) | /generate | Brief wizard: topic step (pillar interest/identity/topic/market + detail), funnel step, idea step (idea source: real-question, common-mistake, news-hook, personal-story, before-after, three-things, myth-bust + context), format step (text-post, carousel, short-video, story; platform linkedin/instagram/facebook/tiktok; audience general/young-adult/working-adult/parent/pre-retiree; CTA dm-keyword/comment-keyword/save-share/book-call/open-question). Hooks-first: "Pick a hook" (named hook formulas, Jev "Recommended"), then "Three variations", "Re-roll 3". Voice profile and vibe/style reference applied. Brief templates. Singlish option in the function. | generate-social-content (academy-hosted; snapshot uses OpenAI gpt-4.1-2025-04-14, modes hooks/body/post/voice-summary/hashtags/image-prompt, SSE stream, n variants). No daily cap in usageCaps (unverified whether the live function caps). Jev: writing-judge (hooks, idea thin-check), cap writing-judge 60. | src/pages/GeneratePage.tsx, src/lib/hookFormulas.ts, src/lib/writingJudge.ts, src/lib/templates.ts, supabase/snapshots/functions/generate-social-content/index.ts | live |
| Post checks | /generate | Coach rules check (src/lib/coach.ts), "sounds human" check (3 measured + 2 Jev) with "Clean AI tells" rewrite, predicted engagement score out of 10 (Jev), fact flags (Jev), compliance chips (regex, warn/error, never blocks), near-duplicate warning (60% word overlap with 5 recent posts), platform word/char counters, brand rules (offers, emoji/hashtag policy, avoid words). | post-score (cap 40), writing-judge human/facts (caps 60/60) | src/lib/humanCheck.ts, src/lib/postScore.ts, src/components/FactFlags.tsx, src/lib/compliance.ts, src/lib/nearDuplicate.ts, src/lib/platformCounters.ts, src/lib/brandRules.ts | live |
| One-tap rewrites | /generate | Rewrite presets and free "ask" (/generate?draft=<id>&ask=<words>, used by the assistant), offered with Undo. | generate-social-content | src/pages/GeneratePage.tsx (rewriteFields) | live |
| Hashtags, first comment, image prompt, live preview | /generate | Hashtag set (Copy all), first-comment text, image prompt, platform-flavoured preview wearing the brand kit. | generate-social-content modes hashtags, image-prompt | src/components/PostPreview.tsx | live |
| Disclosures | /generate copy | Disclosure lines added on copy (DISCLOSURES in src/lib/plainText.ts), markdown stripped on copy. | none | src/lib/plainText.ts | live |
| Weekly batch | /generate/batch | One topic -> one post per chosen platform in parallel; copy with sign-off and tagged links. | generate-social-content | src/pages/BatchPage.tsx, src/lib/batchGenerate.ts | live |
| Repurpose a post | /drafts menu | Existing draft -> Write pre-filled for LinkedIn post, LinkedIn carousel, IG carousel, IG Reel, TikTok script, Facebook post (text ctx only). Also "Make a carousel" -> /carousel?draft=. | generate-social-content | src/lib/repurpose.ts, src/pages/DraftsPage.tsx | live |
| One long piece -> 5 posts | /coach | Paste transcript/newsletter/webinar notes -> claims, numbers, stories, quotable lines + 5 posts each opening with a different hook formula; keep as drafts. | idea-dump mode long, cap repurpose-long 20 (~4 US cents) | src/components/LongPiece.tsx, src/lib/repurpose.ts | live |
| Idea Dump | /coach#idea-dump | Rough notes (typed or dictated) -> post briefs (angle, hooks, talking points, CTA, format, platform, funnel stage), scored; send to board Idea column or Write. | idea-dump, cap idea-dump 30 | src/components/IdeaDump.tsx, src/lib/ideaDump.ts | live |
| Short-video script + storyboard | /generate | short-video format writes HOOK/BODY/CTA + caption; "Storyboard" splits the script into shots (say, on screen, show, seconds), saved on the draft. | storyboard (gpt-4.1), cap storyboard 30 | src/lib/storyboard.ts, src/components/ShotList.tsx, src/lib/scriptCaption.ts | live |
| Story frames | /generate | story format writes 3-5 frames as text (sentence + design suggestion). | generate-social-content | - | partial (text only, no rendered story images) |
| Video captions per platform | /edit | Caption for TikTok, LinkedIn, Facebook, YouTube (title + description), X, Threads in one call; spoken "comment X" keyword detected by Jev. | video-assist captions (gpt-4.1), cap video-captions 30 | src/components/PlatformCaptions.tsx, src/lib/platformCaptions.ts | live |
| Threads / X long threads | - | Multi-post thread writing. | - | - | missing |

### format-carousel

| Carousel feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Carousel maker | /carousel | Source tabs: drafts, paste, topic, saved. It splits a post into 2-10 slides (cover hook of up to 6 words, one point per slide at up to 40 words, a CTA) and dresses them with brand colour presets, headshot or logo, slide pictures from Media and an optional recap slide; each slide is drawn as SVG and saved as a 1080x1350 PNG ("Download all"), or all of them as one PDF for a LinkedIn document post, and saved carousels reopen with their edits. | carousel-copy "Tighten with AI" (openaiChat, MAS-safe rewrite, recap), cap carousel 30. Writing-judge mode carousel says when a text post reads better. | src/pages/CarouselPage.tsx, src/lib/carousel.ts, src/lib/carouselLayout.ts, src/lib/carouselRender.ts, src/lib/carouselCopy.ts, src/lib/pdf.ts, supabase/functions/carousel-copy | live |
| Carousel templates / visual styles beyond colour | - | Multiple layouts, fonts, image-led slide designs. | - | - | partial (one layout family, system fonts, brand colour; no template gallery) |
| Slideshow (TikTok photo mode) | - | Image slideshow post with music. | - | - | missing (AI explainer in /edit is the nearest: pictures + voiceover as an MP4) |

### format-image

| Image feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Make the image | /generate | The post's image prompt -> one picture (Higgsfield Soul v2, ~US$0.006, 1080p), saved to Media folder "AI images", usable on a carousel slide. "Fix it": Qwen Image 3 edit of that picture. | ai-image modes start/status/fix; caps ai-image 5, ai-image-fix 5, ai-image-fix-global 40 | src/lib/aiImage.ts, supabase/functions/ai-image | live |
| Free stock photo | /generate, /media | Pexels photo search, credit kept. | stock-media, cap stock-search 100 (cached searches free) | src/components/StockSearch.tsx, src/lib/stockMedia.ts | live |
| Media library | /media | Photos on this device (IndexedDB, never synced), folders, search, alt text. | none | src/lib/mediaLibrary.ts, src/lib/deviceFiles.ts | live (device-only) |
| Static ad / quote card / meme image designer | - | Text-on-image designs, ad sizes, meme templates. | - | - | missing (carousel slides are the only designed image output) |

### format-video and editor

| Video feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Video editor core | /edit | Upload (kept on device, up to ~4 GB, captions up to ~2 h in 10-min parts); word-timed transcript (Whisper); tabs style, cuts, frame, face, stickers, broll, words (fix/cut). Cuts: pauses, fast pauses, retakes, filler; captions in 6 styles (bold, cutout, minimal, editorial, native, documentary); frame modes fill, blur, framed, stacked (2 speakers), slides (screen + face); face follow / active speaker crop (MediaPipe on device); burned-in subtitle crop; denoise (RNNoise); loudness; hook on screen with 3 formula hooks (Jev pick); name tag; cold open (Jev); motion zooms + pop-ups (Jev + LLM); number/chart cards; B-roll (Pexels) placed by "Add B-roll for me", B-roll card layouts; AI B-roll clip when stock has nothing; style presets (Leo's signatures) and saved "skills"; vibe edit (plain-words instruction -> settings patch, can match up to 3 frames of a reference video); translate captions zh/ms/ta; voiceover from text and dub (ElevenLabs premade voices); Music for me (hidden: AI_MUSIC = false); IG/TikTok button guide overlay; cover frame + titles. | video-assist (Whisper, gpt-4.1, Jev, Gemini watch) caps video-transcribe 30, vibe-edit 100, video-clips 20, video-translate 30, video-cutaways 20, video-publish 30, motion-picks 20, broll-picks 20, cold-open 20, video-captions 30, video-watch 30; text-voice caps ai-voice 10, ai-music 5, ai-music-global 20, music-mood 30; ai-image broll caps ai-broll 3, ai-broll-global 20 (needs AI_BROLL_ENABLED="1") | src/pages/VideoEditPage.tsx, src/lib/videoEdit.ts, src/lib/videoMedia.ts, src/lib/videoMotion.ts, src/lib/autoBroll.ts, src/lib/stylePresets.ts, src/lib/videoSkills.ts, supabase/functions/video-assist, supabase/functions/text-voice | live |
| Export | /edit | Fast export (WebCodecs + mp4-muxer) or real-time fallback; several sizes in one run: 9:16, 4:5, 1:1, 16:9, as filmed; export checks (clipping, black frames); "Watch it like a viewer" (Gemini gemini-3.8-flash, ~US$0.07 a 40 s reel). Saves the caption to My posts as a short-video draft ("Schedule it"). | video-assist watch | src/lib/fastExport.ts, src/lib/exportVersions.ts, src/lib/exportCheck.ts, src/lib/watchCut.ts | live |
| Find clips | /edit | Long video -> 3-5 clips (under 8 min) up to 16 an hour; LLM proposes, Jev scores out of 100; each clip its own project; Export all. | video-assist clips, cap video-clips 20 | src/components/ClipFinder.tsx | live |
| From a YouTube link | /edit | YouTube captions -> best clips; each opens on YouTube at its start or goes to Write (video not downloaded). | youtube-captions (DataForSEO ~US$0.006), cap yt-captions 10 | src/components/YoutubeClips.tsx, src/lib/youtubeClips.ts | partial (no clip file is produced) |
| Join takes | /edit?panel=join | Several takes, each trimmed, joined in order into one video. | none | src/components/JoinTakes.tsx | live |
| Subtitle import | /edit | .srt/.vtt as the transcript (skips Whisper). | none | src/lib/subtitleImport.ts | live |
| Copy a reel's style | /edit (vibe box) | Paste IG/TikTok link -> measured cuts per minute, zooms, punch-ins, transitions + LLM read of caption/framing look, Jev picks the editor look -> one recipe over YOUR video, Undo, save as skill. | clone-reel style mode (Apify, cap reel-style 20), reel-visuals style (gpt-4.1 + Jev, cap reel-visuals 20) | src/components/ReelStyleCopy.tsx, src/lib/reelStyle.ts | live |
| Montage from a theme | /edit?panel=ai&kind=montage | Theme -> 6-10 beats (LLM), one colour grade (Jev), Jev picks a Pexels clip per beat, 20-45 s, words on screen, your music, cuts on the beat. No paid generation. | video-assist montage, montage-pick; caps montage-beats 10, montage-pick 20 | src/lib/montage.ts | live |
| UGC / product template clip | /edit?panel=ai&kind=template&template=<id> | 8 Seedance 2.5 templates: ugc-creator-review, product-commercial-shotlist, handheld-ugc-vlog, timeline-shot-script, character-reference-lock, travel-city-walk, food-asmr, pov-continuous-take. Fill blanks + optional person/product photos; 4 or 8 s; 480p or 720p (US$0.82 to US$3.70); cost shown in Higgsfield credits. | ai-video mode template (OpenAI writes prompt), caps ai-clip 2, ai-clip-global 8 | src/components/AiVideo.tsx, src/lib/aiVideo.ts, supabase/functions/ai-video/templates.ts | live |
| Faceless / green screen / meme video formats | - | Green-screen over an article, meme templates, text-on-video memes. | - | - | missing |

### ai-avatar

| Avatar feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| You speaking (avatar video) | /edit?panel=ai&kind=avatar | "Who speaks": a photo of you, or an AI presenter (Soul v2 9:16 from a typed look, each a different Singaporean). Type a script (600 chars, up to 30 s), pick one of 7 premade ElevenLabs voices (Alice, Lily, George, Eric, Matilda, Sarah, Liam), "Make the voiceover", then Higgsfield Speak animates each slice (up to 4 slices of 9.5 s); clips joined on device and opened in the editor with captions. Cost shown in credits (up to 88 credits, ~US$5.50). Failed jobs refund the cap. | ai-video modes presenter/avatar/status; text-voice; caps ai-video 2, ai-video-global 20, ai-image 5, ai-voice 10 | src/components/AiVideo.tsx, src/lib/aiVideo.ts, supabase/functions/ai-video/logic.ts (SPEAK_MODEL v1/speak/higgsfield, PICTURE_MODEL soul/v2/standard) | live |
| Explainer | /edit?panel=ai&kind=explainer | Topic -> 3-6 scenes (OpenAI), one Soul v2 picture each, one voiceover; joined as a slideshow video on device. | ai-video modes script/explainer; caps ai-video-script 10, ai-video 2 | same | live |
| Voice clone of the user | - | Your own voice. | - | - | missing (premade voices only; comment in text-voice/logic.ts says cloned voices are not usable through their plan's API) |
| Saved digital twin / persistent avatar | - | A trained likeness reused across videos. | - | - | missing (a photo per run; presenter picture not stored as a character) |

### brand

| Brand feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Brand profiles | profile switcher | One account runs several brands (Leo: himself, MoneyBees, FINternship); each brand has its own posts, board, plan, voice, positioning, handles, recruit kit, social accounts; ?profile=<id> on any link opens that brand. | none | src/lib/profiles.ts, src/components/ProfileSwitcher.tsx, docs/brand-isolation.md | live |
| Add a brand from its website | /brands/new | One URL -> name, colour, logo, social handles from the markup; LLM writes one-liner, audience, topics, edge, voice; Jev picks life stage; confirm cards pre-fill brand kit, positioning, accounts, voice. | brand-dna (openaiChat + Jev), cap brand-dna 10 | src/pages/AddBrandPage.tsx, supabase/functions/brand-dna | live |
| Brand kit | /brand | You (name, role, handle, headshot), DM links, offers (up to 5), emoji and hashtags policy, avoid words, colour, sign-off, posting times (weekly slots), logo. Used by carousels, videos (end card), copy, previews, captions. | none | src/pages/BrandPage.tsx, src/lib/carousel.ts (BRAND_KEY_PREFIX content-studio-carousel-brand-), src/lib/brandRules.ts, src/lib/postingSlots.ts | live |
| Your voice | /voice | 3-5 past posts -> voice summary used by Write and Clone. | generate-social-content voice-summary | src/pages/VoicePage.tsx, src/lib/voiceProfile.ts | live |
| Positioning (F.A.D.S.) | /fads, /plan?view=setup | Who you serve, edge, positioning statement, cadence; feeds Plan, labels, goals. | generate-brand-template, generate-collateral (academy-hosted) | src/pages/FadsPage.tsx, src/lib/positioning.ts | live |
| Coach profile | /coach | Origin story, life events fair to share, who you are for, what worked, likes/dislikes; folded into briefs. | none | src/lib/coachProfile.ts | live |
| Recruit Brand Brain | /recruit | One document per brand built from the user's own words (context document assembled, not generated). | none | src/lib/recruit.ts, src/components/recruit/BrandBrain.tsx | live |
| Media sets / product catalogue / face set | - | Reusable photo sets of the person and products for AI generation. | - | - | missing |

### strategy

| Strategy feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Content plan | /plan | Positioning + optional competitor angles -> funnel-balanced weekly slots (ABC funnel stages) with angle + starter hook from the inspiration library; cadence and weeks; slots open Write; posted slots ticked off. Deterministic, client-side. | none (Write is called per slot) | src/pages/PlanPage.tsx, src/lib/contentPlan.ts, src/data/funnelFramework.ts | live |
| Diagnosis + Coach | /coach | Self-assessment across ideas, storytelling, camera confidence, consistency, strategy, conversion, compliance -> the single next action; review your posts against the Coach's writing rules; progress reports. | none | src/lib/diagnosis.ts, src/lib/coach.ts, src/components/DiagnosisQuiz.tsx | live |
| Weekly goals | /home | Posts per week per platform per brand. | none | src/lib/goals.ts | live |
| Labels (pillars) | /drafts | User labels per brand, seeded from positioning topics; label mix card in Analytics. | none | src/lib/labels.ts, src/components/LabelMixCard.tsx | live |
| Recruitment kit | /recruit/* | Brand Brain, Conversations, AI agent, recruit numbers (Friday numbers, 3C path, 50/30/20). | none | src/pages/RecruitPage.tsx, src/components/recruit/* | live |

### calendar

| Calendar feature | Route | What it does | Main files | Status |
|---|---|---|---|---|
| Calendar | /calendar | Views month, week, upcoming; filters business, platform, status; day panel; "Write a post for this day" (/generate?day=&time=); open posting slots from the brand kit; day notes/campaigns; coverage (which business runs out of planned posts within 14 days); overdue block; Needs you strip; recurring posts (DraftEntry.repeat). | src/pages/CalendarPage.tsx, src/lib/calendarNotes.ts, src/lib/calendarCoverage.ts, src/lib/postingSlots.ts, src/lib/dueDates.ts | live |
| Board | /board | Production Kanban: Idea, Scripted, To film, Editing, Scheduled, Posted. | src/pages/BoardPage.tsx, src/lib/board.ts | live |
| My posts | /drafts | Filters status/platform/pillar/label/search, labels, CSV import (hook, text, platform, date, time, media, hashtags; validate-first, clash shifting), repurpose, Make a carousel, Share for review. Cap: MAX_DRAFTS = 50 per brand (FIFO). | src/pages/DraftsPage.tsx, src/lib/draftHistory.ts, src/lib/csvImport.ts | live (note the 50-post cap) |
| Instagram grid | /grid | Grid preview of scheduled then posted posts. | src/pages/GridPage.tsx, src/lib/igGrid.ts | live |
| Team posts review | /calendar?business=team-posts | Leo's GAC/AT team posts (written by ~/.local/bin/team-posts jobs) reviewed in the calendar: approve, comment, skip. | src/lib/teamPosts.ts, src/components/TeamPostReview.tsx | gated (only the account whose synced key holds them: uid 40f07a18) |
| Channel feeds | /calendar, /board | Posts that outside jobs publish (MoneyBees Telegram roundup) shown by business. | src/lib/channelFeeds.ts, src/components/ChannelPostDrawer.tsx | gated (REELS_BOARD_OWNERS email, or cs-flag-channel-feeds=1) |
| Queue / auto-slotting | - | Drop posts into the next open slot automatically. | - | partial (open slots are shown and suggested for a day; no auto-fill queue) |

### publishing

| Publishing feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Social accounts | /accounts | Connect IG, FB, TikTok, LinkedIn, YouTube, Threads per brand through Zernio; reconnect, disconnect; 6 accounts per adviser, team cap ZERNIO_MAX_ACCOUNTS (2 when unset); daily recount and weekly orphan sweep. | social (status/connect), social-sweep (cron); caps social-connect 3, social-read 300 | src/pages/AccountsPage.tsx, src/lib/socialConnect.ts, supabase/functions/social, docs/zernio-connection.md | gated (SOCIAL_CONNECT_USERS + ZERNIO_API_KEY) |
| Post it for me | /drafts, /calendar, /generate?panel=post | Schedule a dated draft on connected accounts; media uploaded browser -> Zernio storage (pictures under 8 MB, up to 10; video under 300 MB); status chip Scheduled / Posted with links / Failed + Retry / Cancel. | social posts.ts; caps social-schedule 30, social-presign 30 | src/components/PostItForMe.tsx, src/lib/autoPost.ts | gated (same allowlist) |
| Manual posting | everywhere | Copy (markdown stripped, sign-off, disclosure, tagged links), Mark posted, phone alert when due. | notify | src/lib/plainText.ts, src/lib/notify.ts | live |
| Reels board auto-publish | /reels | Approved/scheduled cards for moneybees, finternship, activitytracker are posted to IG by a publisher on Leo's Mac (IG_HANDLES map). | team-board -> moneybees-studio API | src/lib/reelsBoard.ts, src/components/reels/* | gated (Leo + board members) |
| Approval before publish inside a client workspace | - | Client approves a post that then publishes. | - | partial (team review + preview links exist; they gate Copy/Mark posted, not Zernio) |

### analytics

| Analytics feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Self-reported analytics | /analytics?period=&by=&time=&rank= | Typed post numbers -> what is working (min sample gates), engagement rate over time and by platform/pillar/format/hook formula, length vs engagement, hashtags, best time to post heatmap, top posts ranked by 8 measures. | none | src/pages/AnalyticsPage.tsx, src/lib/analytics.ts | live |
| Your real numbers | /analytics | Year of post numbers + daily follower counts from connected accounts via Zernio; numbers land on matching drafts. | social metrics.ts (social-read) | src/components/RealNumbers.tsx, src/lib/realNumbers.ts | gated (Social accounts on) |
| Account audit | /analytics | Last 30 IG/TikTok posts of YOUR handle vs your usual numbers: double down / fix / stop with cited posts, "Your best posts to remix" with a new angle, post ideas in your style (up to 5, never repeated), profile score out of 100 with name/bio rewrites. Refresh at most once per 20 h; weekly background refresh. | audit-social-account (Apify + OpenAI), refresh-social-audits (cron), suggest-post-ideas, writing-judge profile (cap profile-score 10) | src/components/AccountAudit.tsx, src/lib/accountAudit.ts, supabase/functions/_shared/socialAudit.ts, docs/account-audit.md | live |
| This week card + Monday email | /analytics, email | Week report (best, weakest posts) and Jev's one move for the week; same logic as the Monday results email and phone alerts. | week-pick (cap 10), notify (cron, Resend, web push) | src/pages/AnalyticsPage.tsx, supabase/functions/notify | live |
| Competitor benchmarks | /following, /market | Followers, growth, posts per week, best post per tracked account. | track-accounts | src/lib/following.ts | partial (no side-by-side benchmark report) |
| Tracked links | /links | Clicks and people per /t/ link, 7/30 days, campaign public report. | tracked-link | src/pages/TrackedLinksPage.tsx, docs/tracked-links.md | gated (hub membership to create) |
| Link in bio clicks | /bio | Clicks per link. | link-in-bio | src/pages/LinkInBioPage.tsx | live |

### engagement

| Engagement feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| Reply drafts | /recruit/engage?tool=replies | Paste comments under your post -> Jev sorts potential client / adds something / peer / support / noise, reply each, first DM for clients. Never posts. | engage-assist (Jev + OpenAI ~2 US cents/30), cap engage-replies 30 | src/components/engage/Replies.tsx, src/lib/engageDrafts.ts | live |
| DM drafts | ?tool=dms | Sort DMs into lead, recruiter, peer, favour, spam; automated sequences flagged; draft steered to goal (call, guide, rapport). Thread mode for one conversation. | engage-assist, caps engage-dms 30 | src/components/engage/Dms.tsx | live |
| Comments on others' posts | ?tool=comments | Comments of different kinds for 1-10 pasted posts. | engage-assist, cap engage-comments 30 | src/components/engage/Comments.tsx | live |
| LinkedIn connect | ?tool=connect | Note under 200 chars, first message, two follow-ups at 4 and 10 days added to calendar. | engage-assist, cap engage-connect 30 | src/components/engage/Connect.tsx | live |
| Saved replies | ?tool=snippets | Snippets per brand with compliance flags. | none | src/lib/replySnippets.ts | live |
| Engage this week | /following | 10 people: 5 bigger accounts, 3 peers, 2 likely clients from your own commenters (Jev). | engage-picks, cap 20 | src/components/EngageWeek.tsx, src/lib/engage.ts | live |
| Auto-DM | /recruit/auto-dm | Comment keyword -> DM (IG, FB) or public reply (TikTok, Threads, LinkedIn, YouTube); who got it log; ?keyword= from Write ("Set up the auto-DM"). | social automations.ts, cap social-automation-write 30 | src/pages/AutoDmPage.tsx, src/lib/autoDm.ts | gated (SOCIAL_CONNECT_USERS) |
| Unified inbox | - | Read and answer comments/DMs inside the app. | - | - | missing (paste-in, copy-out only, by design per docs/social-api-app-review.md) |

### agent

| Agent feature | Route | What it does | AI / function, caps | Main files | Status |
|---|---|---|---|---|---|
| In-app assistant | floating dock on every studio page | Answers from Content Studio's map on the feedback service (leotan-feedback /assistant/chat); chips post feedback, message the team, open a page. Before answering, Jev classifies the message into an act: move (reschedule a post to a day/time), write (rewrite a post in Write via ?ask=), week (last week's numbers), engage_replies / engage_dms / engage_thread / engage_comment (paste into Engage), none; shows a confirm card, applies with Undo. Never posts. | assistant-act (Jev only), cap assistant-act 30 | src/components/feedback/AssistantDock.tsx, src/components/feedback/AssistantMount.tsx, src/lib/assistantActs.ts, supabase/functions/assistant-act | live |
| Connect Claude (MCP) | /connect | Private per-brand link; Claude tools list_posts, get_post, get_calendar, get_results, get_brand, add_draft. | content-studio-mcp (--no-verify-jwt; link is the credential; revocation rows never deleted) | src/pages/ConnectPage.tsx, src/lib/claudeConnect.ts, supabase/functions/content-studio-mcp | live |
| Proactive "next up" | /home, /coach | Diagnosis next action, Need an idea?, Coming up, overdue, Needs you badge, Monday email move. | week-pick | src/pages/HomePage.tsx, src/lib/needsYou.ts | live (rule-based) |
| Agent that makes content end to end | - | "Remix this reel into my video and schedule it" in one ask. | - | - | missing |

### compliance

| Compliance feature | Route | What it does | Main files | Status |
|---|---|---|---|---|
| Compliance chips | Write, Idea Dump, snippets, recruit | SG insurance / MAS regex set, warn or error chip, never blocks. | src/lib/compliance.ts | live |
| MAS-safe prompts | all writers | Prompts forbid promised returns, named insurer products, invented numbers (clone-reel, carousel-copy, video-assist, generate-social-content). | supabase/functions/*/logic.ts | live |
| Fact flags | Write | Jev flags stated facts to check. | src/components/FactFlags.tsx | live |
| Disclosures | Write copy | Disclosure lines appended on copy. | src/lib/plainText.ts | live |
| Team review | /team | Members submit, leaders approve / request changes / reject (reason required); immutable submissions, append-only audit trail (SQL 011, 013, 014); @mentions; "needs approval before posting" locks Copy and Mark posted until the latest version is approved. | src/lib/teamReview.ts, src/components/team/*, supabase/hub/011-014 | live |
| Preview links | /drafts?review= -> /review/:token | Read-only snapshot for someone without an account, comments back on My posts; expiry, revocation, caps. | src/lib/previewLinks.ts, supabase/functions/preview-link, SQL 012 | live |
| Pre-approved content library | - | Compliance-cleared posts an agency shares to its advisers. | - | missing |

### team

| Team feature | Route | What it does | Status |
|---|---|---|---|
| Agency team review | /team | Invite code (/team?code=), member/leader roles, review queue, audit trail. | live |
| Leo's posts board team | /reels/team, /join | Invite links with role (viewer, commenter, editor, approver) and brands; claim at /join#token; owner = TEAM_OWNER_IDS. Files src/lib/reelsBoard.ts, supabase/functions/team-board, docs/team-roles.md. | gated (Leo) |
| Multiple brands per account | profile switcher | See brand. | live |
| Seats, client workspaces, agency billing | - | - | missing |

### billing
See section 7. Daily caps only; Members Hub subscription (SGD 49/month, Stripe) exists but is unlinked; no credits.

### onboarding

| Onboarding feature | Route | What it does | Status |
|---|---|---|---|
| Getting started | /welcome | First-run welcome; returning users go to Home (src/lib/onboarding.ts). | live |
| Diagnosis quiz | /coach?view=quiz | Picks the first action. | live |
| Add a brand from website | /brands/new | Pre-fills a brand in one URL. | live |
| Learn | /academy, /create-guide, /tutorial | Lessons, step guide, studio tour; QuickTip cards (src/data/quickTips.ts). | live |
| Voice nudge | /generate | "Paste 3-5 of your past posts once" banner. | live |

### integrations

| Integration | Where | Notes |
|---|---|---|
| Zernio (publishing, metrics, auto-DM) | supabase/functions/social, _shared/zernio.ts | gated, docs/zernio-connection.md |
| Claude MCP | content-studio-mcp | /connect |
| Higgsfield (Soul v2, Speak, DoP lite, Qwen Image 3, Seedance 2.5) | ai-image, ai-video | prepaid pool, global caps |
| ElevenLabs (TTS eleven_turbo_v2_5, Music music_v2_5) | text-voice | music hidden |
| OpenAI (chat, Whisper), Gemini (watch) | most functions | |
| TypeSafe Jev | _shared/jev.ts | every decision |
| Apify (IG/TikTok scrape) | clone-reel, track-accounts, audit-social-account, data drops | |
| DataForSEO (news, YouTube captions, ChatGPT answers) | mentions, youtube-captions, market | |
| Pexels | stock-media | |
| Resend + web push | notify | |
| Stripe | hub-checkout, hub-stripe-webhook | 503 until STRIPE_SECRET_KEY + HUB_PRICE_ID set |
| Feedback service (leotan-feedback.vercel.app) | /feedback, /roadmap, assistant | |
| CSV import | /drafts | |
| Canva, Google Drive, Zapier, public API | - | missing |

---------------------------------------------------------------------------------------------------------------------

## 3. Remix today: every entry point that turns someone else's content into the user's own

All "-> Write" links land on /generate and are read once by GeneratePage (params pillar, detail, ctx, format,
platform, cta, ref, vibe, audience, idea, formula, funnel; see docs/deep-links.md "Still read (Create pages)"). The
original post's text travels inside `ctx` as a brief that says "do not copy the wording". Write then produces TEXT in
the chosen format (text post, carousel slide text, short-video script + caption, story frames).

| # | Entry point (UI label) | Where it shows | Builder (file) | In (format read) | Out |
|---|---|---|---|---|---|
| 1 | "Remix this" / "Remix this for my business" | /swipe cards and post drawer, /profiles/:id cards | buildRemixUrl in src/lib/topPosts.ts; used by src/components/ReelCard.tsx, TopPostCard.tsx, PostDetailDrawer.tsx | A top IG post (reel, carousel or single) from the static drop: caption, idea hook, why it worked, how to adapt, angle, structure. No video, no slides. | Write, format mapped from the post type (generatorFormat: short-video / carousel / text-post), platform instagram, ref=<handle> |
| 2 | "Clone this reel" | /swipe card + drawer (short-video only), /profiles/:id | cloneLinkFor in src/lib/reelClone.ts | Same post's URL | /clone?url= (see #5) |
| 3 | "Remix" | /following, per tracked post | remixUrl in src/lib/following.ts | A tracked IG/TikTok post: video -> Clone a reel; anything else -> caption only | Video: /clone?url=. Else Write, pillar topic, text from caption |
| 4 | "Write a post like this" | /swipe?tab=ads | buildAdWriteUrl in src/lib/adsSwipe.ts (src/components/AdsSwipe.tsx) | A Meta ad (image/video/carousel): advertiser, industry, hook family, headline, first 2 lines of body. Picture not read. | Write: an ORGANIC post with the same kind of opening (format left to the user); never the ad's words, brand or claims |
| 5 | Clone a reel (paste a link) | /clone | src/pages/CloneReelPage.tsx, src/lib/reelClone.ts, supabase/functions/clone-reel, supabase/functions/reel-visuals | Public Instagram reel or TikTok video URL: caption, transcript, numbers via Apify (cached in cs_reel_sources, SQL 010); IG frames sampled in the browser at scene changes + pacing (reelFrames.ts) | Breakdown (hook, beats, payoff, CTA, why it worked); 3 concepts (each buildable, cap reel-concepts 20); my version: hook options by named formulas, script, shot list (say, on screen, visual, seconds, delivery), caption, CTA, filming notes; visual plan per beat matched to the original's look (IG only, first concept). Actions: Open in Write (draft), Add to board (Scripted), Copy, Copy link. Caps reel-clone 20, reel-visuals 20, reel-video 20. Uses voice profile + your 3+ best posts ("winners"). |
| 6 | Copy a reel's style | /edit vibe box | src/components/ReelStyleCopy.tsx, src/lib/reelStyle.ts | IG/TikTok link: the video itself (downloaded, measured), captions/overlays read from frames | A style recipe (caption look, grade, frame, pace, zooms, punch-ins, transitions) applied to the user's own uploaded video, savable as a skill. Does not copy content. |
| 7 | Vibe edit "match a reference video" | /edit | video-assist mode vibe with frames | Up to 3 stills from a reference video (uploaded) | Edit settings patch on the user's video |
| 8 | "Use as vibe" | /inspiration, /inspiration/:id | src/components/Inspiration.tsx, src/pages/InspirationDetailPage.tsx -> /generate?vibe=<id> | A hand-picked example post (text) | Write pre-filled: pillar, topic, format, platform, audience + "match the structural pattern" style reference |
| 9 | "Remix in Write" (trend) and "Clone" on a trend's source video | /trends | buildTrendRemixUrl in src/lib/trends.ts; cloneLinkFor | A trend kit (title, why, hooks, talking points, CTA, how to film) or its source reel | Write with format/platform/cta from the kit; or /clone |
| 10 | "Remix their best post in Write" | /analytics Creator lookup | src/components/CreatorLookup.tsx (buildRemixUrl or a ctx line) | A looked-up creator's best post caption | Write |
| 11 | "Remix this" (own posts) | /analytics account audit "Your best posts to remix" | remixUrl in src/lib/accountAudit.ts | The user's OWN best IG/TikTok post (caption, ratio vs usual) + Jev/LLM new angle | Write, same format (short-video / carousel / text-post) |
| 12 | Your market post "write from this" | /market | postWriteUrl in src/lib/market.ts | A Following account's best post caption | Write ("Remix this angle from @handle, never copy") |
| 13 | "Write about this" (news) | /swipe?tab=news (feeds, mentions, industry news), /market news and ChatGPT reads, YouTube trends | storyWriteUrl (src/lib/feeds.ts), buildNewsWriteUrl (src/lib/industryNews.ts), newsWriteUrl / geoWriteUrl (src/lib/market.ts), buildVideoWriteUrl (src/components/YouTubeTrends.tsx) | An article or a YouTube video's title/summary | Write (news-hook style brief) |
| 14 | "Remix in Write" (hub) | /hub/trends | buildTrendRemixUrl in src/components/hub/TrendCard.tsx | Hub trend (summary, angles) | Write |
| - | Repurpose / Make a carousel / One long piece | /drafts, /coach | src/lib/repurpose.ts, src/components/LongPiece.tsx | The user's OWN draft or long text | Write in another format/platform; /carousel?draft=; 5 posts |
| - | Find clips / From a YouTube link | /edit | ClipFinder.tsx, YoutubeClips.tsx | User's own long video; any YouTube link (captions only) | Clips (own video) or clip timestamps + Write |

What remix does NOT do today (the north-star gap):
- No "Remix" output is media. Remix links stop at a text brief in Write; Clone stops at a script and shot list.
- Clone a reel output does not flow into /edit or the AI avatar: there is no /edit param that pre-fills the avatar
  script, template fields or montage theme (src/lib/links.ts `edit` has p, tab, mode, sticker, broll, guide, panel,
  kind, template only). The user must film, or retype the script in "You speaking".
- Inputs supported: IG reel and TikTok video (Clone), IG posts in the static drop, Meta ads in the static drop, text
  captions of tracked accounts. Not supported as input: arbitrary carousel slides (images), static ad images,
  YouTube Shorts video, LinkedIn/X/Threads posts, memes, UGC ads as video.
- Inputs are mostly the static drops; the only live-URL remix inputs are /clone?url= (IG/TikTok) and
  Copy a reel's style.

---------------------------------------------------------------------------------------------------------------------

## 4. Formats the app produces end to end

| Format | Produced where | Final artifact | Can it be published from the app | Files |
|---|---|---|---|---|
| Text post (LinkedIn, IG caption, FB, TikTok caption) | /generate, /generate/batch | Text (copy) | Yes: Copy, or Post it for me (gated) | GeneratePage.tsx, batchGenerate.ts, autoPost.ts |
| Carousel (IG 4:5, LinkedIn PDF) | /generate format carousel -> /carousel | 2-10 PNG slides 1080x1350, one PDF | Yes: download; Post it for me takes up to 10 pictures | CarouselPage.tsx, carouselLayout.ts, carouselRender.ts, pdf.ts |
| Short-video script + shot list | /generate, /clone, /coach long piece | Text script, caption, storyboard | Text only; the video is filmed by the user | storyboard.ts, ShotList.tsx, reelClone.ts |
| Story frames | /generate format story | Text frames + design suggestions | No rendered frames | generate-social-content snapshot |
| Edited talking-head video (reel, feed, square, wide) | /edit | MP4 (H.264/AAC), several sizes in one run | Download; draft saved to My posts; Post it for me uploads video under 300 MB | VideoEditPage.tsx, videoEdit.ts, videoMedia.ts, fastExport.ts, exportVersions.ts |
| Clips from a long recording | /edit Find clips | One project per clip, Export all | Same as above | ClipFinder.tsx |
| AI avatar video (your photo or AI presenter speaking) | /edit?panel=ai&kind=avatar | MP4 up to 30 s, opened in the editor with captions | Same as above | AiVideo.tsx, aiVideo.ts, supabase/functions/ai-video |
| AI explainer (slideshow video) | /edit?panel=ai&kind=explainer | MP4: 3-6 AI pictures over one voiceover | Same | same |
| AI template clip (UGC review, product commercial, handheld vlog, POV, etc.) | /edit?panel=ai&kind=template | 4 or 8 s Seedance clip, opened in the editor | Same | ai-video/templates.ts |
| Stock montage | /edit?panel=ai&kind=montage | 20-45 s MP4 of Pexels clips | Same | montage.ts |
| Joined takes | /edit?panel=join | MP4 | Same | JoinTakes.tsx |
| Voiceover / dub | /edit | MP3 laid on the video (dub zh, ms, ta) | Inside the video | text-voice |
| Single AI image | /generate Make the image | 1 picture in Media "AI images" | Via a carousel slide or Post it for me | aiImage.ts, ai-image |
| Link-in-bio page | /bio | Public page /l/<slug> | Live page | bioPage.ts, link-in-bio |
| Tracked link + public report | /links | /t/<slug>, /t/report/<slug> | Live | trackedLinks.ts, tracked-link |
| Not produced | - | Static ad creatives, quote cards, memes, TikTok photo slideshows, green-screen videos, faceless b-roll-with-voiceover from a script, UGC ad from a product link, threads | - | - |

---------------------------------------------------------------------------------------------------------------------

## 5. Owner gates (how pages are Leo-only today)

| Gate | Kind | Where | Value in code | What it gates |
|---|---|---|---|---|
| REELS_BOARD_OWNERS | client email list (UX gate) | src/lib/reelsBoard.ts line 12 | ["tanjunsing@gmail.com"] | Channel feeds on /calendar and /board via canSeeChannelFeeds (src/lib/channelFeeds.ts; also a device flag cs-flag-channel-feeds=1). Comment says it gates "nothing on the board". |
| TEAM_OWNER_IDS | server secret (uid list) | supabase/functions/team-board/index.ts line 42 | Not in code. docs/team-roles.md: "Leo's uid". The test uses 13b28b1d-2ecb-40be-b3a9-aefc90366f9b (team-board/index.test.ts). Live value unverified. | /reels board (owner), /reels/team, team.* actions. Nav "Reels" shows via `show: reelsShown` = remembered team-board `me` (cs-team-me, 10 min). |
| TEAM_CLAIM_DENY_IDS | server secret | team-board | demo/shared logins (value not in code) | Who may never claim a board invite |
| MARKET_USERS | server secret (uid list or *) | supabase/functions/market/index.ts line 184, isAllowed in market/logic.ts | Not in code. Memory says the live value is 40f07a18 (tanjunsing@gmail.com); the test uses 13b28b1d as OWNER. Unverified from code. | /market and its nav entry (`show: marketShown`, cs-market-shown, 6 h), notify's Monday market reminder |
| SOCIAL_CONNECT_USERS | server secret (uid list or *) | supabase/functions/social/index.ts line 48 | Not in code | /accounts, /recruit/auto-dm (`show: socialConnectShown`, cs-social-connect, 6 h), Post it for me, Your real numbers |
| GLOBAL_COUNTER_USER | constant (not a gate) | supabase/functions/_shared/usageCaps.ts line 122 | 13b28b1d-2ecb-40be-b3a9-aefc90366f9b ("the owner's account") | Row that holds the across-everyone caps |
| Team posts | data ownership | src/lib/teamPosts.ts (content-studio-teamposts-<uid>) | Written by ~/.local/bin/team-posts with UID 40f07a18-b087-4c95-ba1f-d5444222968a, commented there as "Leo's Content Studio account, tanjunsing@gmail.com" | Team-post review in /calendar shows only for that account |
| NavPage.owners | client email list per nav page | src/lib/nav.ts (type field), filtered by visiblePages(pages, email); honoured by the rails, the More sheet (moreSheet), Jump to (pageItems) and SectionTabs (fetches the email when any tab has owners) | Field exists; NO page uses it today | Hides a nav page for everyone else |
| hub_memberships.is_admin / status | DB rows (RLS) | supabase/hub/001_hub_schema.sql, src/lib/hub.ts | Seeded per the 2026-07-08 hub plan for tanjunsing8@gmail.com (docs/superpowers/plans/2026-07-08-hub.md; live row unverified) | /hub/*, tracked-link creation |

Leo's logins, checked against code:
- tanjunsing@gmail.com = uid 40f07a18-b087-4c95-ba1f-d5444222968a: verified (REELS_BOARD_OWNERS holds the email;
  ~/.local/bin/team-posts line 50 pairs the uid with the email; src/lib/teamPosts.test.ts uses the uid).
- leotanjs95@gmail.com = uid 13b28b1d-2ecb-40be-b3a9-aefc90366f9b: the uid is in code (GLOBAL_COUNTER_USER, team-board
  and market tests) but the email appears nowhere in the repo; the pairing comes from memory
  (content-studio-social-os.md) only. Unverified from code.
- No constant today lists BOTH logins.

Right pattern for a Leo-only /north-star page:
- It reads static roadmap data and calls no paid server work, so the server-allowlist pattern (MARKET_USERS +
  status probe + cs-*-shown hint) is overkill. Use the nav's existing `owners` field: one constant, e.g.
  `NORTH_STAR_OWNERS = ["tanjunsing@gmail.com", "leotanjs95@gmail.com"]` (lowercase; visiblePages lowercases the
  signed-in email), set as `owners` on the nav entry, and the page itself renders NotFoundPage (or Navigate to
  /home) when the signed-in email is not in the list, because nav hiding alone does not stop a typed URL.
- This is a UX gate, the same strength as REELS_BOARD_OWNERS: the lazy chunk and any data bundled in it can be
  fetched by anyone who finds the chunk. If the roadmap must be private, serve its content from an edge function
  that checks a uid allowlist secret (the isAllowed shape in supabase/functions/market/logic.ts) instead of bundling
  it.
- Put it in a NON-tabbed section that keeps nav.test.ts green: "home" (Overview, Getting started) or "improve"
  (Coach, Analytics, Team review). Do NOT add it to "feedback": that section has one page today, and a second page
  changes its More-sheet tile from "Feedback" to "Requests and roadmap", which breaks the singles assertion in
  src/lib/nav.test.ts. Adding to a tabbed section (write, pipeline, playbook, recruit, learn) also works via
  SectionTabs but puts a roadmap among working tabs.

---------------------------------------------------------------------------------------------------------------------

## 6. How to add a page correctly

1. Page file: src/pages/<Name>Page.tsx, default export. Use existing UI from src/components/ui/* and the design tokens
   (Tailwind config tailwind.config.ts); headings use `font-serif`.
2. Route: in src/App.tsx add `const XPage = lazy(() => import("@/pages/XPage"));` with the other lazy imports and a
   `<Route path="/x" element={<XPage />} />` inside the `<ProtectedRoute><StudioLayout/>` block (above the `*`
   route). The `<Suspense>` lives around `<Outlet/>` in StudioLayout, so no Suspense of your own. Never add a vite
   `manualChunks` object (it force-preloads lazy chunks). Public pages go above the studio block wrapped in
   `<Suspense fallback={null}>`.
3. Nav: add one entry to exactly one section's `pages` in src/lib/nav.ts SECTIONS
   (`{ to, label, end?, owners?, show?, title?, icon? }`), where `title` sets the browser tab title through pageTitle
   ("<title or label> - Content Studio"), `show` is for visibility the server decides (a function reading a cs-*
   localStorage hint that StudioLayout refreshes on load) and `owners` is a list of emails. CLAUDE.md asks you not to
   add a new section without checking the grouping.
4. Tests that must stay green:
   - src/lib/navRoutes.test.ts reads App.tsx with a regex: every `<Route path="/...">` must be a nav page or a key in
     EXCEPTIONS (with the reason); every nav page must have a route; no stale exceptions; more than 40 routes.
     A route you deliberately keep out of the nav goes in EXCEPTIONS.
   - src/lib/nav.test.ts: every path in its `routes` list maps to exactly one page via pageFor (add the new path to
     that list); no duplicate `to`; the More sheet for "someone@example.com" must stay singles ["Getting started",
     "Recruit", "Playbook", "Learn", "Feedback"] and groups ["Improve", "Discover"] (so an owner-gated page must be
     filtered out for that email, and a page added to a non-tabbed section shows as its own tile for everyone it is
     visible to); bottom-bar pages and owner-only pages stay out of the sheet.
   - src/lib/jumpTo.test.ts: Jump to items come from visiblePages; optional keywords for the page live in the
     "Words a page is looked for by" map in src/lib/jumpTo.ts.
   - `npm run build` (tsc + vite) must pass (CLAUDE.md). Not run here (read-only task).
5. Deep links (docs/deep-links.md, contract for jobs outside the app; builders in src/lib/links.ts, readers in
   src/lib/urlState.ts: useUrlState, useUrlList, useUrlItem, useUrlSearch, useUrlFlag, useUrlLabel(s),
   useScrollToHash):
   - Every view, filter, period and open item lives in the URL. The URL wins, then the remembered pick, then the
     default. Defaults are left out of links. Values are words or real ids; unknown values fall back silently.
   - Filters/views/periods replace the history entry; opening an item pushes one (Back closes it).
   - Param names never change once shipped; a renamed param keeps reading the old one.
   - ?profile=<id> must keep working on the page (handled globally in StudioLayout).
   - Add the page's row to the right table in docs/deep-links.md (or to the "(none)" row if it has no state), and a
     builder in src/lib/links.ts if anything links to it. Sections of a reading page are #anchors scrolled to once
     drawn (useScrollToHash).
   - Give shareable states a CopyLinkButton (src/components/CopyLinkButton.tsx).
6. Storage: anything that must persist and sync uses a key starting `content-studio-` (cloudSync SYNC_PREFIX), keyed
   per brand with `scoped(userId)` from src/lib/profiles.ts (or the bare uid for account-wide data). Device-only
   hints use `cs-` keys. Never make security or revocation state depend on deleting a synced key (no tombstones;
   write an explicit off/revoked row instead).
7. UX conventions seen across pages: a page header with h1, InfoTip for one-sentence explanations, long jobs run
   outside React (module-level job + listeners) so leaving the page does not lose them, AI buttons show uses left
   today (src/lib/aiUsage.ts reading cs_ai_usage), edge calls through callFn in src/lib/edgeFn.ts (plain-words
   refusal messages).
8. Deploy: push to main is the deploy (Vercel Git); never `vercel --prod`; verify the live bundle hash afterwards
   (CLAUDE.md).

---------------------------------------------------------------------------------------------------------------------

## 7. Credits and billing

- No credit system and no plans for the studio. There is no balance, no top-up, no per-plan feature table, no
  referral system. Every signed-in user gets the same daily caps.
- Usage caps: supabase/functions/_shared/usageCaps.ts DAILY_LIMITS, counted atomically by SQL
  `cs_consume_ai_usage` on table `cs_ai_usage` (user_id, feature, day; migration supabase/hub/009_ai_usage.sql),
  reset at 00:00 UTC = 08:00 Singapore. Fail closed (an unreadable counter blocks the paid call). `refundUsage`
  gives a use back when a paid job fails (ai-video, ai-music). `claimOnce` for once-a-day claims. Refusal: 429
  `daily_limit` "You've used all N for today. It resets at 8am Singapore time." or 503 `usage_unavailable`.
- Global caps (across all users) sit on GLOBAL_COUNTER_USER 13b28b1d-...: ai-image-fix-global 40, ai-broll-global
  20, ai-music-global 20, ai-video-global 20, ai-clip-global 8, market-check-global 20. They protect prepaid
  provider pools (Higgsfield, ElevenLabs).
- Per-user caps (per day): reel-clone 20, reel-concepts 20, storyboard 30, reel-visuals 20, reel-style 20,
  reel-video 20, idea-dump 30, repurpose-long 20, carousel 30, video-transcribe 30, vibe-edit 100, video-clips 20,
  video-translate 30, video-cutaways 20, video-publish 30, motion-picks 20, feeds 60, mentions 10, yt-captions 10,
  track-accounts 10, market-check 3 (read over 7 days), market-suggest 5, engage-picks 20, week-pick 10,
  assistant-act 30, stock-search 100, broll-picks 20, montage-beats 10, montage-pick 20, cold-open 20,
  video-captions 30, video-watch 30, ai-image 5, ai-image-fix 5, ai-broll 3, ai-voice 10, ai-music 5,
  music-mood 30, post-score 40, writing-judge 60, profile-score 10, fact-check 60, engage-replies 30,
  engage-dms 30, engage-comments 30, engage-connect 30, ai-video 2, ai-video-script 10, ai-clip 2,
  social-connect 3, social-read 300, social-automation-write 30, social-schedule 30, social-presign 30,
  team-comment 60, brand-dna 10, plus the account audit's own limit of one refresh per 20 hours per account.
- Not capped in this repo: generate-social-content (Write, Batch, Voice), analyze-ig-creator, generate-brand-template,
  generate-collateral (academy-hosted; live caps unverified).
- Shown to the user: uses left today beside AI buttons (src/lib/aiUsage.ts); AI video/clip costs shown as
  "N Higgsfield credits (about US$X)" (src/components/AiVideo.tsx, CREDIT_USD 0.0625 in ai-video/logic.ts). These
  are the provider's credits, informational only; nothing is deducted from a user balance.
- Paid plan that exists: Members Hub, SGD 49/month (src/pages/hub/HubPaywallPage.tsx), Stripe subscription via
  supabase/functions/hub-checkout (returns 503 payments-not-configured until STRIPE_SECRET_KEY + HUB_PRICE_ID are
  set; live state unverified) and hub-stripe-webhook (status rules in membership.ts). Membership (admin, client
  via email allowlist hub_allowlist, or active subscriber) unlocks /hub and creating tracked links. /hub is
  unlinked from the nav on purpose.
- Zernio account caps (6 per adviser, team cap ZERNIO_MAX_ACCOUNTS default 2) are cost guards, not a plan.
