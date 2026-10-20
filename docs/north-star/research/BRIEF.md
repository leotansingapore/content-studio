# North-star research brief (shared by every subagent)

Date: 2026-10-19. Owner: Leo. Product: Content Studio, live at https://consultant-content-studio.vercel.app/
(repo checkout for reading: ~/worktrees.noindex/cs-north-star, branch feat/north-star; NEVER edit, commit or push there).

## What Content Studio is today
An all-in-one ORGANIC social media tool, one account managing several social profiles. Users: Singapore
financial advisers / insurance consultants, plus Leo's own brands (MoneyBees, FINternship, ActivityTracker).
It already has: AI post writing (Write), reel cloning, a video editor, an AI avatar/explainer video, carousels,
a swipe file of top posts and ads, Following (track competitor IG/TikTok accounts), trends, a content
calendar, publishing through Zernio, analytics, recruitment content (Recruit), engagement helpers.

## The north star Leo set (2026-10-19)
"One can remix any content format and the AI will regenerate." A user finds a proven piece of content
(a viral reel, a slideshow, a talking-head video, a UGC ad, a static ad, a carousel, a text post, a meme,
a competitor's ad), presses Remix, and the AI rebuilds it in THEIR brand, voice, face and offer, ready to
schedule and post. Reference product: Fastlane (app.usefastlane.ai), which Leo screen-recorded.

## What we need from you
A detailed, sourced FEATURE INVENTORY that a builder subagent can later build from without redoing your
research. Specific beats general: name the inputs, outputs, options, defaults, limits, prices, UI labels,
states and the exact flow. Every feature needs evidence (a URL, or a frame/file path).

## Output rules
- Write ASCII only (no em dashes, no smart quotes). Plain, direct sentences.
- Write ONLY to the output paths your task names, under /Users/leo/Documents/Content Studio/Competitive Research/.
- Do not sign up for anything, do not log in, do not call paid APIs, do not use browser automation.
  WebSearch and WebFetch only for web research.
- If a fact is not confirmed by a source, mark it "unverified".

## Feature areas (use these exact slugs for `area`)
inspiration (finding proven content: feeds, swipe files, viral search, competitor tracking, ad libraries),
remix (turn an existing post/ad into your own version),
format-video (short video formats: talking head, UGC, b-roll, faceless, slideshow-video, green screen, memes),
format-image (static images, ads, quote cards, memes),
format-carousel (carousels, slideshows, documents),
format-text (text posts, threads, captions, scripts, hooks),
ai-avatar (AI people, digital twins, voice clones, AI influencers),
editor (video/image editing, captions, b-roll, music, templates),
brand (brand kit, voice, audience/ICP, offers, media sets),
strategy (goals, avatars/personas, campaign planning, content pillars, content plans),
calendar (scheduling, queues, slots),
publishing (connected accounts, auto-post, approval, inbox modes),
analytics (post/account performance, competitor benchmarks, reports),
engagement (comments, DMs, replies, community, lead capture),
agent (chat agent / copilot that does tasks, proactive "next up" suggestions),
compliance (approvals, pre-approved libraries, archiving, disclaimers; matters for financial advisers),
team (seats, roles, clients/workspaces, agency),
billing (credits, plans, usage meters, referrals),
onboarding (first-run, setup, tutorials),
integrations (Canva, Drive, MCP, APIs, Zapier),
other.

## JSON schema for competitor research files
{
  "category": "<your category name>",
  "researched_at": "2026-10-19",
  "competitors": [
    {"name": "", "url": "", "pricing": "plans and prices as published, with currency", "positioning": "one line",
     "audience": "", "sources": ["url", "..."]}
  ],
  "features": [
    {"competitor": "", "feature": "short name", "area": "<slug>",
     "detail": "what it does, concretely: inputs -> process -> outputs; options, defaults, UI labels",
     "limits_or_cost": "credits, caps, plan needed, or empty",
     "notable": "what is clever or worth copying, or empty",
     "sources": ["url", "..."]}
  ]
}
