# Short-form video creation, editing and repurposing: OpusClip, Vizard, Klap

Researched 2026-10-19 from pricing pages, help centers and API docs. Prices are USD unless noted. "unverified" means no source confirmed it.

## OpusClip

**Positioning.** Long-to-short AI clipping built around a multimodal clip model (ClipAnything). It adds a full clip editor, a scheduler for 9 networks, an API and MCP server, and Agent Opus for prompt-to-video.

**Pricing.**
- Free: $0, 60 credits a month. Clips carry a watermark, media is stored for 3 days and export is capped at 1080p.
- Starter: $15 a month for 150 credits a month, with no watermark.
- Pro: $29 a month (monthly billing) for 300 credits a month. Annual Pro moved from $14.50 a month ($174 a year) to $19.43 a month ($233.16 a year) in a capture dated 2026-10-06. That figure comes from a single third-party tracker.
- Max: referenced in the help docs. The Agent Opus pricing page lists Max at $129 a month or $1,548 a year (18,000 credits a year). This comes from a search snippet because the page did not render.
- Business: custom pricing.
- Credit rule: 1 credit = 1 minute of imported source video. Monthly credits last 60 days and yearly credits last 12 months.
- Extra Pro packs add 300 credits and 2 seats each.

**Core flow.**
1. Paste a link or upload a file. Links can come from YouTube, Drive, Zoom, Vimeo, Riverside, Loom and about 12 more. Uploads go up to 10GB on Free and 30GB on paid plans. Sources can run up to 10 hours.
2. In the submit panel, set these options:
   - "Clip model": ClipAnything or ClipBasic.
   - An optional genre and an optional English prompt, for example "Find all the laughing scenes".
   - "Clip Length" (default "Auto (0m-3m)").
   - The "Processing timeframe" slider. You pay only for the range you select.
   - "Speech Language" and "Translate To" (English is the only translation target).
   - The Auto headline toggle.
   - A caption style from "Quick Presets", or "No Caption".
   - A brand template.
   You can save these choices as defaults.
3. Processing finishes on the results page. Clips are sorted by Virality Score (0-99) and shown in Grid or List view. Each clip has an AI title and description. Use the heart or thumbs-down buttons to rate clips, re-prompt to regenerate, and use "AI tools" such as dubbing.
4. In the clip editor you can:
   - Edit the transcript.
   - Use Speech Cleanup (fillers, pauses, bad takes).
   - Use AI Enhance (speech enhancement, AI emoji, dubbing, auto censor).
   - Add B-roll (AI image, stock, AI video), music, audio upload and Auto SFX.
   - Use the "AI hook" voiceover.
   - Change the layout per segment and use the Tracker.
   - Switch to another brand template.
   - Use "Add a Section" to extend a clip.
5. To finish a clip, choose one of these:
   - Download in HD or 4K (4K needs a true 4K source and the Pro plan).
   - Use "Export to XML" for Premiere or DaVinci (Pro).
   - Bulk download.
   - Schedule it from the results page or "Calendar". The AI writes the descriptions and hashtags. You can post to YouTube, Instagram Reels, TikTok, Facebook Page, LinkedIn Business, X, Pinterest, Threads and Bluesky.
   - Use "Bulk Schedule" to set an order number and a fixed interval.

**Worth copying for Content Studio.**
- **Virality Score rubric.** It rates Hook, Flow, Value and Trend on a 0-99 scale, sorted best first. Use the same frame to rank proven content in the inspiration feed. https://help.opus.pro/docs/article/virality-score.md
- **Brand Template as one object.** It holds layout, hook style, caption style and highlight colours, a logo or CTA overlay, the intro and outro, emojis and transitions, and is applied at generation time. This maps directly to the Remix brand kit. https://help.opus.pro/docs/article/how-to-add-a-brand-template.md
- **Auto headline.** It writes a one-line hook overlay for the top 10 clips, styled from the template. https://help.opus.pro/docs/article/auto-headline.md
- **Brand Vocabulary.** It keeps captions from misspelling CPF, MediShield Life, insurer names and fund names. https://help.opus.pro/docs/article/brand-vocabulary.md
- **Custom censored-word list.** It masks words in captions and audio. Reuse the pattern as an adviser compliance phrase list that flags phrases rather than beeping them. https://help.opus.pro/docs/article/how-to-censor-curse-words.md
- **Speech Cleanup.** It detects issues, shows a count, and lets you remove items one by one or all at once. Nothing is cut without approval. https://help.opus.pro/docs/article/speech-cleanup.md
- **Prompt manual with dos, don'ts and example prompts.** Ship the same guidance beside the Remix prompt box. https://help.opus.pro/docs/article/clip-anything-prompt-manual.md
- **Agent Opus structured brief and per-second pricing.** The brief has fields for topic, audience, tone, must-include points, source text and @assets. Pricing by quality tier is quoted before you commit, and each edit gets one free retry. https://help.opus.pro/agent-opus/prompt-guide.md and https://help.opus.pro/agent-opus/article/ao-faq-credits-faq.md
- **OpusSearch.** It indexes moments across a whole library by topic, speaker, mood and duration, with a Trends view. This is the right shape for an inspiration library. https://help.opus.pro/docs/article/opussearch.md
- **MCP server.** Read tools are free and need no approval. Write tools need approval. https://help.opus.pro/api-reference/agent-setup.md

## Vizard

**Positioning.** AI clipping with a text-based editor, a calendar and rules-based auto-posting. It is expanding into Vizard Agent (prompt-to-video with 22 templates) and AI Studio, which offers Seedance, Veo 3, Sora 2, Kling and other models.

**Pricing.**
- Free: $0 for 60 credits a month. It includes a watermark, 720p export, uploads up to 60 minutes and 1GB, deletion after 3 days, and 1 TikTok account.
- Creator: $14.50 a month billed yearly ($174 a year) for 600 credits a month, with 6 social accounts. A third-party snapshot from 2026-03-05 reports monthly billing at $29, which is unverified.
- Business: $19.50 a month billed yearly ($234 a year) plus $5 a month per seat. It adds a shared workspace, a brand kit and 20 social accounts. The help center example prices 1 seat at $294 a year.
- Credit tiers: 15 yearly options from 7,200 to 74,400 credits.
- Credit rule: 1 credit = 1 minute of upload. Unused minutes carry over to the next month.
- Extra credits: AI Enhance costs 1 to 2 credits per second, and AI Edit costs 0.5 credits per second.

**Core flow.**
1. Upload a file or use "Upload from Link". Supported links are YouTube, Drive, Vimeo, StreamYard, TikTok, X, Twitch, Loom, Facebook, LinkedIn, Dropbox and Instagram. Files can be up to 600 minutes and 10GB, in mp4, 3gp, avi or mov, at up to 4K.
2. Set Clip Preferences:
   - "Clip preferred length" (for example "<30s", "Auto" or "60s-90s").
   - "Ratios": 9:16 and/or 1:1.
   - Styles: "Emojis" and "Highlight words".
   - "Templates": Default or Custom.
   - An optional Spark 1.0 prompt (up to 10 per project).
   - Optionally, "One click viral shorts" with "Auto schedule and post".
3. Click "Get AI clips". Clips are sorted by viral score (0-10), and each comes with a written viral reason, a title, a transcript and related topics.
4. In the editor you can:
   - Edit by deleting transcript text and fine-tune on the timeline.
   - Add scenes and merge or split subtitle lines.
   - Edit emojis.
   - Add AI B-roll and the AI headline.
   - Build a cover page and set a custom thumbnail.
   - Change the ratio.
5. To finish, use "Save & Export" at 720p, 1080p, 2K or 4K, with optional "AI Enhance". You can also:
   - Export to Google Drive.
   - Share a link.
   - Schedule from "Calendar" with "New post" (month, week or feed view). The AI writes the caption, guided by the saved Post Style "Default Prompt".

**Worth copying for Content Studio.**
- **A written reason next to every viral score.** Show why a piece works on each inspiration card. https://docs.vizard.ai/docs/retrieve-video-clips.md
- **Auto-schedule rules.** Set a minimum viral score, a post limit per day, weekdays only or until done, a start date and a time window. This is a complete autopilot spec. https://help.vizard.ai/en/articles/10848181-auto-schedule-post-ai-clips
- **Post Style Default Prompt.** It saves tone, emoji use, hashtags and CTAs for every AI caption, with per-platform regeneration. This is the text version of a voice profile. https://help.vizard.ai/en/articles/14778410-understanding-post-style-preferences-regenerations
- **AI Edit.** It turns a raw talking-head (9:16, 15 s to 3 min) into an edited cut with a style picker and a per-second cost estimate. It is the closest existing feature to the Remix output step. https://help.vizard.ai/en/articles/16658532-what-is-ai-edit
- **Short-video edit mode.** It dresses an existing short (under 3 minutes) in a template with subtitles, B-roll, headline, logo and outro. https://docs.vizard.ai/docs/submit-a-short-video-for-editing.md
- **Languages that fit Singapore.** Transcription covers Malay, Tamil, Mandarin (Simplified and Traditional) and Cantonese, and subtitles translate into 128 languages. https://docs.vizard.ai/docs/supported-languages.md and https://help.vizard.ai/en/articles/8767561-what-languages-are-supported
- **Agent template gallery.** You pick a job first and then prompt. https://vizard.ai

## Klap

**Positioning.** A speech-driven long-to-short clipper. It offers content-aware AI Reframe 2, captions in 52 languages, dubbing on Pro, and an open API with an embeddable editor and managed sub-users.

**Pricing.** Billing is changing and sources disagree, so confirm at checkout.
- Free: 1 video, no credit card.
- Official page, yearly billing: Basic $14, Pro $39 and Pro+ $94 a month, for 100, 300 and 1,000 clips.
- Klap blog (2026-07-21), monthly billing: Basic $29 (10 uploads, sources up to 45 minutes, HD), Pro $79 (30 uploads, up to 2 hours, 4K, 29-language dubbing) and Pro+ $189 (100 uploads, up to 3 hours).
- A competitor article (prices checked 2026-09-26) says Klap now bills per minute: 300, 900 and 2,700 minutes a month.
- API usage pricing: $0.44 per video input, $0.32 per short and $0.48 per export.

**Core flow.**
1. "Drop a file or paste a link from YouTube". Sources can run up to 4 hours in the app or 5 hours through the API.
2. The AI transcribes the video, finds topics and cuts clips (the API defaults to 10 clips of about 60 s each). Each clip gets a Virality Score and an explanation.
3. In the editor you can:
   - Use AI Reframe 2: split screen, picture-in-picture, 3-screen, 4-screen, screencast or gaming.
   - Edit captions with keyword highlights.
   - Apply a brand kit or style preset.
   - Layer B-roll and make precise cuts.
   - Dub (Pro only).
4. Export (HD on Basic, 4K on Pro), download in bulk, or publish and schedule to TikTok, YouTube, Instagram and LinkedIn (Facebook through the API). The AI writes a caption with a "tone" setting.

**Worth copying for Content Studio.**
- **Style preset ID shared by the UI and the API.** One brand object drives both manual and automated output. https://docs.klap.app/styling
- **Caption writer with a "tone" setting plus a free-text prompt.** Tones include professional, funny, inspirational and educational. https://docs.klap.app/oauth/social-posts
- **"transcription_context" field (up to 1,000 characters).** It gives the transcriber names and jargon before it runs. https://docs.klap.app/endpoints/tasks
- **Embeddable editor with per-user tokens and managed sub-users.** It is a build-versus-embed option for clipping. https://docs.klap.app/usecases/managed-users
- **Unlimited social accounts on every plan.** https://klap.app/pricing
# Short-form video creation, editing and repurposing

## Submagic

**Positioning.** A one-click web editor. It turns talking-head footage into captioned, zoomed, B-rolled shorts, then schedules them. It also has an API, an MCP server and Zapier, Make and n8n hooks.

**Pricing (USD, per member).**
- Starter is 19/mo, or 12/mo billed yearly. It gives 15 videos, up to 2 min each, at 1080p, for 1 user.
- Pro is 39/mo or 23/mo yearly. It gives 40 videos up to 5 min, up to 2K, for 3 users.
- Business is 69/mo or 41/mo yearly. It gives 100 videos up to 30 min, 4K at 60fps, for unlimited users.
- Magic Clips is a USD 19/mo add-on with 10 uploads.
- The free trial is 3 short videos with a watermark. Paid plans have no watermark.
- API minute packs run from 250 min at USD 57/mo.

**Core flow.**
1. Dashboard: 'Generate Captions' > 'Generate AI Captions'. Upload a file (MP4 or MOV, up to 3,000 MB) or paste a YouTube link.
2. Pick the spoken language and number of speakers, then 'Generate Captions' (about 40 s).
3. Trim (optional): 'Remove Silences' (pace natural, fast or extra-fast) and 'Remove Bad Takes'.
4. Pick a caption template, then edit words, colors, emojis and highlights.
5. 'Generate Hook Title'. 'Clean Audio'. Add music. 'Correct Eye Contact'. Adjust color.
6. B-rolls page: 'Magic B-rolls' adds stock B-roll, zooms and transitions in one click. 'Change Media' swaps a clip. 'Add Media' > 'AI B-rolls' or 'AI Images' generates from a prompt.
7. 'Export': 1080p, 2K or 4K at 30 or 60 FPS. 'Save Preset' keeps the setup for next time.
8. Publish: pick platforms and a time. AI pre-fills titles, descriptions, tags and the first comment per platform. Then 'Publish Now' or 'Start Scheduling'.

Shortcut: 'AI Auto Edit' does steps 3-6 in one click with the Kelly, Karl or Ella style.

**Worth copying.**
- **Per-platform AI fields with a mockup preview.** AI fills the caption, tags and first comment for each platform, and shows each in its own mockup. TikTok gets 'branded content' and 'made with AI' flags. https://www.submagic.co/social-media-scheduler and https://docs.submagic.co/api-reference/publish-project.md
- **Virality score in four parts.** Each clip's score splits into shareability, hook_strength, story_quality and emotional_impact. https://docs.submagic.co/api-reference/magic-clips.md
- **Hook title as its own layer.** It has 13 templates and AI-written or custom text, so a proven hook shape can take the adviser's words. https://docs.submagic.co/api-reference/hook-title-templates.md
- **Custom dictionary.** It takes up to 100 terms per request and the account keeps 1,000, so brand and product terms are always spelled right. https://docs.submagic.co/api-reference/create-project.md
- **B-roll density and layouts.** A slider sets the B-roll share of runtime (0-100, default 50), with split and picture-in-picture layouts. https://docs.submagic.co/api-reference/create-project.md
- **Three named one-click styles.** Kelly, Karl and Ella replace dozens of settings. https://care.submagic.co/en/article/how-to-use-ai-auto-edit-in-submagic-gaxw7t/
- **Google Drive watch folder and MCP server.** You get hands-free ingest and agent control. https://www.submagic.co/integrations and https://docs.submagic.co/mcp-server.md

## Captions (incl. Mirage)

**Positioning.** A mobile-first AI video studio. It covers AI Edit styles, chat-to-edit, AI twins and actors (Mirage), dubbing and lipdub, and long-to-short Clips.

**Pricing (USD).**
- Free gives 60-200 one-time credits and 1 caption template.
- Basic is 9.99/mo with 200 credits.
- Max is 24.99/mo with 500 credits.
- Frontier is 69.99/mo with 1,400 credits. Frontier 2x is 139.99 (2,800) and Frontier 4x is 279.99 (5,600).
- Lite (Android only) is 4.99/mo. Enterprise is custom.
- Yearly plans are discounted, but the figures are not published.
- Credits roll over up to 3x the monthly allowance.
- Max-only features exported from Basic get a watermark.
- API: USD 0.15 per minute for captions and USD 0.15 per second for avatar video.

**Core flow (AI Edit, web).**
1. Home > Edit. Upload a clip (3 min or less, one speaker, 9:16 or 16:9, unedited) and write a prompt.
2. Pick a style (21 Premium, 95 Basic). Optionally add your own media and paste links as context.
3. 'Create my video' opens the editable video plan. Here you set the 'Voiceover only' toggle and review recommended cuts ('Restore original' or 'Revert'). You also set style, edit intensity and color, and choose custom or generated media.
4. 'Create project' (10-40 credits).
5. Refine with 'Chat to edit' (effort Low to Ultra, click timeline items to scope the edit) or by hand: AI Trim, Eye Contact, Zoom, Denoise, music, captions.
6. 'Export': resolution, frame rate, bitrate Auto and SRT. No direct publish or scheduling is documented.

**Worth copying.**
- **Remix Video.** Takes a source video or project and outputs new actors, a new script or a 'different hook', a translation and a new voice, with one video per actor. This is the closest analogue to the Content Studio north star. https://captions.ai/help/mirage/step-3-generate-edito-share/remix-video.md
- **Editable video plan before render.** Cuts, style, intensity and media are reviewed before credits are spent. https://www.captions.ai/help/docs/project/ai-edit
- **AI Twin from a short recording or an existing video upload.** Saved 'Avatar Looks' and prompts change the outfit or background. https://www.captions.ai/features/create-ai-twin and https://captions.ai/help/whats-new.md
- **AI Echo.** The adviser's own voice memo drives the avatar's delivery. https://captions.ai/help/docs/project/ai-creator.md
- **Clips with an optional topic prompt and Clips Chat.** You can ask for more or different clips from the same source. https://captions.ai/help/docs/project/clips.md
- **Script Generator, teleprompter and camera in one app.** https://captions.ai/help/docs/project/script.md and https://captions.ai/help/docs/project/camera.md
- **Lipdub into about 31 languages.** It includes Chinese and Tamil, which covers Singapore's client languages, and has 'Export All'. https://captions.ai/help/docs/captions/lipdub.md

## Quso.ai (formerly Vidyo.ai)

**Positioning.** A repurposing and social suite. It does long-to-short AI clips with virality scores, editing, a scheduler for 7 platforms, a planner, analytics and an AI writer.

**Pricing (USD).**
- Free is 75 credits/mo with 720p, watermarked exports and TikTok-only publishing.
- Lite is 29/mo or 174/yr with 100 credits and 1080p.
- Essential is 39/mo or 234/yr with 300 credits, 7-platform scheduling, filler and silence removal, and the planner.
- Growth is 49/mo or 294/yr with 600 credits, Brand Kit, Viddy and analytics.
- 1 credit equals 1 uploaded minute, and edits and re-renders are free.
- Add-on credits are USD 0.15 each and never expire.

**Core flow.**
1. Import a link (YouTube, Zoom, Loom, Drive, Dropbox and others) or upload a file (5GB on Free, 15GB on paid).
2. Set the language. Toggle CutMagic and 'Open every clip with an AI headline' under 'AI Video Tools'.
3. Clips come back ranked with virality scores from 75 to 99, each with an editable word-level transcript.
4. Edit: captions (99 languages, emoji, animation), B-roll from Pexels, progress bar, split layout, aspect ratio, music and brand template.
5. Downloads > 'Publish' > 'Schedule'. Write or generate a description, pick a thumbnail frame, check the mobile preview, and set the date. Or use 'Send for Approval'.
6. Manage posts in 'Scheduled Posts'. Track results in Analytics.

**Worth copying.**
- **Send for Approval to any email.** The approver views without an account. 'Add Schedule time and Send for Approval' auto-publishes once approved, which suits a compliance or supervisor sign-off for advisers. https://helpdesk.quso.ai/help/send-post-for-approval.md
- **Virality score with four named categories and plain-English tiers.** The categories are Trends, Hook and Flow, Engagement and Shareability. https://quso.ai/help/virality-scrore
- **AI Headline.** A 4-7 word headline over the first 5 s, with a remembered default toggle and per-clip reword. https://helpdesk.quso.ai/help/editor/ai-headline.md
- **Viddy.** Chat with the video to draft LinkedIn posts, captions, newsletters and hooks from the transcript. https://helpdesk.quso.ai/help/what-is-viddy.md
- **Social Sets.** Each set holds one account per platform, for separate brands or clients. https://helpdesk.quso.ai/help/what-is-a-social-set.md
- **Credits charged on upload only.** Failed jobs are refunded automatically. https://helpdesk.quso.ai/help/how-credits-work.md
- **What did not stick.** Script to AI Video and AI Influencer (80+ stock avatars) are being discontinued. https://helpdesk.quso.ai/help/what-is-ai-influencer.md

## Edits (Instagram, by Meta)

**Positioning.** Instagram's free mobile editor for Reels. It covers capture, timeline editing, AI animate and restyle, and direct posting to Instagram, with Reels insights built in.

**Pricing.**
- Free. The App Store lists 'In-App Purchases' but itemizes none.
- No watermark at any resolution, with export up to 4K.
- Mobile only (iOS 16.3+, Android 9+), and it needs an Instagram login.

**Core flow.**
1. Ideas tab: sticky notes, saved Reels and audio, and up to 10 AI clip ideas a week from your past Reels. The Inspiration tab shows trending audio.
2. Projects > '+': record in-app or pick clips from the gallery. Recording is in short takes, up to 10 min, up to 4K 60fps, with green screen and a teleprompter.
3. Timeline: reorder, trim, 'Split', set speed and volume, add keyframes, and keep multiple takes on the storyboard.
4. Add 'CC Captions' > 'Add captions', 'Text', 'Audio' (music, sound effects, 'Volume Ducking', 'Voiceover', voice enhance, 'Cut silences'), Cutout, AI Animate, Restyle (10 s clips), effects and filters.
5. 'Export' > 'Save to device' or 'Open in Instagram'. You can share to Instagram, Facebook, Stories or Messages, or DM a draft for feedback.
6. Insights tab: skip rate, like rate, share rate and a retention graph, with followers and non-followers split, over 7-60 days.

**Worth copying.**
- **Weekly personalised ideas.** Up to 10 clip ideas a week, built from the user's own Reels. https://www.socialmediatoday.com/news/edits-gets-ig-links-weekly-ideas-and-new-video-effects-features/809644/
- **Idea notes become teleprompter scripts.** The path from plan to shoot is direct. https://posteverywhere.ai/blog/what-is-instagram-edits
- **Restyle presets.** They change the setting, outfit or lighting of a clip, which is a cheap brand-fit step. https://marketing4ecommerce.net/en/instagram-restyle/
- **Retention graph and skip rate next to the editor.** https://posteverywhere.ai/blog/what-is-instagram-edits
- **Share an unpublished draft by DM for feedback.** It works as a light approval loop. https://www.planoly.com/blog/instagrams-edits-app-review.md
- **Watermark-free 4K export with no paywall.** This sets the bar Content Studio exports must meet. https://apps.apple.com/us/app/edits-an-instagram-app/id6738967378
# Short-form video creation, editing and repurposing: Descript, CapCut, VEED

Researched 2026-10-19 with WebSearch and WebFetch only. Where a fact came from a third party rather than the vendor, it is marked unverified.

## Descript

**Positioning.** A text-based video and podcast editor. Its AI co-editor, Underlord, takes chat prompts and runs the editing tools for you.

**Pricing (USD).**
- Free: $0, 60 media min/mo, 100 AI credits one-time, 720p with watermark.
- Hobbyist: $16/person/mo billed annually, or $24 monthly. 600 media min, 400 credits/mo, 1080p.
- Creator: $24 annual or $35 monthly, up to 3 seats. 1,800 min, 800 credits, 4K.
- Business: $50 annual or $65 monthly, up to 5 seats. 2,400 min, 1,500 credits, 4K, Brand Studio.
- Enterprise: custom.
- Which price is annual and which is monthly is inferred from the checkout links.
- Top-ups (Creator and Business only, expire after 12 months): AI credits 350 for $35, 1,000 for $80, 4,000 for $200. Media hours 5 for $25, 20 for $80, 50 for $150.
- Nothing rolls over. Studio Sound and Remove Filler Words cost at most 30 credits per application. Other per-tool costs are not published.

**Core flow.**
1. Record in Descript, or upload. Upload caps are 1 GB on Free and 50 GB on Business. Media is transcribed into a script covering 25 languages.
2. Edit the script like a doc. Deleted words cut the video.
3. Clean up from AI Tools:
   - Remove filler words.
   - Edit for Clarity (Low, Medium or Heavy).
   - Remove retakes.
   - Studio Sound.
   - Eye Contact.
   - Green Screen.
   - Or ask Underlord in chat, for example "Hide my jumpcuts by adding zooms".
4. Design. Quick Design splits the script into scenes, applies layouts and optionally adds stock or AI B-roll. Then style the captions.
5. Repurpose. Create clips gives 1 to 20 clips of 10 s to 5 min, with a 9:16 or 1:1 layout and a topic prompt. Translate dubs into 30 languages, with optional lip sync.
6. Export. Local MP4 or GIF up to 4K, a web share page, or direct YouTube publish (no Shorts, no scheduling). There is no direct TikTok, Instagram or LinkedIn posting.

**Worth copying.**
- **Skills.** Saved Markdown instructions run with "/" in Underlord chat; this works as a saved "remix recipe" per adviser. https://help.descript.com/ai-assistant/skills.md
- **Underlord bulk edits.** Chat prompts run tools across the whole video, and each tool's charge is itemised in a Usage tab. https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript
- **AI layout packs.** Upload brand files plus a prompt and get four design directions to choose from, which is good brand onboarding. https://help.descript.com/templates-and-presets/overview.md
- **Glossary and "Do Not Translate" list in Brand Studio.** Fits fund, insurer and regulated terms. https://help.descript.com/branding/brand-studio.md
- **Avatar from one photo.** .jpeg, .png or .webp up to 10 MB, safety-checked, built on Kling Avatar. https://help.descript.com/generative-media/create-your-avatar.md
- **Voice clone consent.** The user reads a consent statement aloud to create the clone. https://help.descript.com/ai-speech/custom-speaker.md
- **Regenerate.** Changes spoken words on real footage, so a remix can swap in the adviser's offer without a reshoot. https://help.descript.com/script-editing/regenerate-overview.md
- **Create clips topic field and editable outputs.** The topic, goal or criteria field steers selection, and each clip lands as an editable composition. https://help.descript.com/repurpose/create-clips-from-your-content

## CapCut

**Positioning.** ByteDance's free-first editor on mobile, desktop and web. It has a huge trending template library, Seedance AI video, and direct sharing to TikTok.

**Pricing (region-priced).**
- The official page, fetched from Singapore, shows SGD:
  - Pro: SGD 23.48/mo or SGD 214.98/yr, 850 credits/mo, 1 TB.
  - Ultra: SGD 100.98/mo or SGD 1,149/yr, 11,112 credits/mo.
  - Teams: about SGD 11.74 to 19.90 per seat/mo, with brand kit.
- USD: Pro is $19.99/mo or $179.99/yr (Newsweek, Feb 2026). A $9.99 monthly-only Standard tier with 1080p export is unverified.
- UK in-app prices (July 2026): Pro GBP 21.99/mo with 550 credits, Ultra GBP 55/mo with 6,830 credits, Teams GBP 13.49/seat.
- Credits:
  - 1 credit = USD 0.01.
  - Deducted in this order: subscription, then activity, then purchased.
  - Purchased credits are valid for 2 years.
  - Buying credits needs a membership.
  - Seedance video costs from $0.12/sec on Pro and $0.18/sec on Ultra (first month), with max length per plan.
- Watermark: CapCut says export adds none. The branding comes from template outro clips, which the user deletes.

**Core flow.**
1. Find a trend on TikTok, tap "Try this template", and it opens in CapCut. Or browse Trending Templates, where each card shows a usage count and duration.
2. Swap in your own media from Media or stock, and edit the text and audio.
3. Clean up:
   - Auto captions with styles (Glow, Trending, Multiline) or "Style captions with AI".
   - Transcript-based editing with "Identify filler words" (desktop).
   - Remove Silence (reported as Pro).
   - Auto reframe.
   - Remove background.
4. Or generate from scratch:
   - Script to video in Narration or Commercial mode, which offers 5 script options.
   - Instant AI video (Seedance).
   - Avatar video, using a stock avatar or your own 10 s to 5 min selfie clip.
5. Export to MP4/MOV at up to 1080p free or 4K/HDR on Pro, and share directly to TikTok (title, permissions, audience), YouTube, Instagram or Facebook.
6. Scheduling is not in CapCut. It sits in a sister product, Pippit (formerly CapCut Commerce Pro). Pippit's Publisher schedules to TikTok, Facebook and Instagram on a calendar. Its analytics are TikTok only.

**Worth copying.**
- **"Try this template" from inside TikTok.** The proven content lives on the platform and opens as an editable template in one tap. This is the closest existing Remix loop. https://www.capcut.com/resource/how-to-use-capcut-on-tiktok
- **Usage counts on template cards.** Social proof of what works. https://www.capcut.com/templates
- **Commercial mode in script to video.** The user enters a product or service, then picks from 5 scripts before rendering. https://www.capcut.com/tools/script-to-video-maker
- **Custom avatar from a 10 s to 5 min selfie video.** https://www.capcut.com/resource/ai-talking-video
- **Clear credit model.** A fixed cent value and a stated deduction order. https://www.capcut.com/help/credit-types
- **Removable outro as the watermark.** A softer growth lever than a burned-in logo. https://www.capcut.com/help/how-to-export-video-without-watermark
- **Editing and scheduling split into two products (CapCut and Pippit).** Content Studio can win by keeping Remix, the calendar and posting in one flow. https://www.pippit.ai/resource/help-center/publisher-n-analytics

## VEED

**Positioning.** A browser AI video editor for teams. It does subtitles, one-click cleanup (Magic Cut, Clean Audio, Eye Contact), avatars, dubbing and a multi-model AI Playground.

**Pricing (USD per seat, from trackers; the live cards are JS-rendered).**
- Free: $0, watermark, 720p.
- Creator: $12/mo billed yearly ($147/yr). 6,000 credits/yr, 1080p, 4 hr AI voice.
- Pro: $22/mo billed yearly ($265/yr; an A/B variant shows $24). 30,000 credits/yr, 4K, 144 hr voice, 6 hr dubbing.
- Studio: $39/mo billed yearly ($465/yr). 180,000 credits/yr, 4K, 960 hr voice, 12 hr dubbing.
- Enterprise: custom.
- Monthly-billed prices are unverified. There is no rollover and no top-up packs. Subtitles are unlimited on paid plans, with a 50 hr/mo fair-use cap.

**Core flow.**
1. Create Project, then upload a file or record.
2. Clean up:
   - Magic Cut does silences, fillers and repeated mistakes in one click (English only, all plans).
   - Clean Audio.
   - Eye Contact (one free try).
3. Add subtitles with Auto Subtitle (125+ languages), style them with Karaoke highlight, and translate with "+ Add language".
4. Add brand elements from the Brand Kit tab: fonts, colors, and saved groups such as lower thirds and intros.
5. Repurpose:
   - Clips takes an upload or YouTube link, a goal (viral shorts, highlights or insights), a prompt and a length. It returns scored clips.
   - AI Dubbing with lipsync.
   - Talking Characters or a personal avatar.
6. Export: server render, then MP4 download (720p, 1080p or 4K by plan), or a share link. There is no documented direct posting or scheduling.

**Worth copying.**
- **AI Asset Templates "Recreate this".** A proven template loads its prompt, the user adds a product photo, and the credit cost shows on the Generate button. Categories include Viral Hooks. This is nearly the Remix pattern. https://www.veed.io/newsroom/veed-ai-asset-templates
- **Clips scores.** Each clip is rated out of 10 on Flow, Impact, Clarity and Relevance. The flow also has a video goal picker, a custom prompt, "Trim with Text" and an email when clips are ready. https://veed.io/tools/auto-video-editor/ai-clip-generator and https://www.veed.io/blog/introducing-clips-by-veed
- **AI Playground charges only on success.** The price is shown per model. https://support.veed.io/en/articles/11712887-ai-playground
- **Brand Fetch.** A website URL becomes a brand kit with logo, fonts and colors. Brand Control locks approved assets. https://www.veed.io/learn/branded-videos-at-scale
- **Personal avatar.** About 2 minutes of recording with built-in consent. After a script edit, only the changed sections are regenerated. https://veed.io/blog/introducing-personal-avatars-by-veed
- **Dubbing Proofread step before the voice is generated.** A control for regulated wording (Enterprise). https://support.veed.io/en/articles/10406623-how-to-use-the-ai-dubbing-tool
- **Magic Cut.** A single button for the whole cleanup pass. https://support.veed.io/en/articles/11589317-how-to-use-our-magic-cut-tool
- **Save to Brand Kit from the timeline.** Right-click a styled group (for example a lower third) and save it as a reusable brand part. https://support.veed.io/en/articles/9616498-how-to-create-and-manage-brand-kits

## Cross-competitor gaps Content Studio can own

- None of the three schedules natively to the adviser's own IG, FB, LinkedIn and TikTok from the editor. Descript publishes to YouTube only, without Shorts. VEED stops at download. CapCut pushed scheduling into Pippit.
- None ships a compliance layer (approval, disclaimer insertion, claim checks). The nearest controls are Descript's glossary and "Do Not Translate" list and VEED's dubbing Proofread and Brand Control locks.
- Only VEED scores clips, and it uses four sub-scores rather than one virality number. CapCut and Descript do not score.
# Short-form video creation, editing and repurposing: competitor notes

Covers InVideo, Kapwing, plus three 2025-2026 entrants picked for relevance to "remix a proven video into my version": Revid.ai (the only one with a true viral search + remix flow), Riverside (strongest AI editor agent for talking-head footage, with AI Twin and VideoDub), and Zebracat (prompt-to-video that also plans, schedules and learns). All prices in $ as shown; most pages do not name the currency code.

## InVideo

**Positioning.** "The agentic video editor for serious creatives." It has pivoted from prompt-to-stock-video into Agent Two: AI agents that script, cast, generate and cut on a pro multitrack timeline, with 200+ generative models.

**Pricing.** Per seat per month. Billed annually: Starter $10, Plus $30, Max $75. Billed monthly: $20, $60, $150. Credits per seat: 400, 2,000 or 5,000. Seats: 5, 10 (+10 guests) or 20 (+20 guests). Credits do not roll over. Add-on credits last up to 12 months. Manual editing and exports are free, with no watermark. Starter gets only the Lite agent.

**Core flow (UGC ad / remix path).**
1. Paste a product or app link. The agent pulls product details and imagery.
2. Optionally upload a script, a creator brief, past winning ads, or "any ad or trending hook to rebuild around your product".
3. Cast an AI creator from a description. Face and voice are locked together.
4. Approve each shot as a still before it animates.
5. The agent animates with voice and line-by-line lip sync, then scores, paces and stitches the ad.
6. Request batches (for example ten hooks), switch style (testimonial, unboxing, demo), or localise.
7. Export the ad, or all assets, or an editable Premiere / Final Cut / Resolve project. No direct social posting found.

**Prompt path.** Pick a workflow and write a prompt (length, platform, accent). Choose audience and look, then click "Generate now". Edit by typing commands in the Magic Box ("delete scene 2", "change accent").

**Worth copying.**
- Rebuild a winning or trending ad around your own offer, with stills approved before paid animation. https://invideo.io/make/ugc-ads/
- Reference-video matching: apply a reference's pacing, structure and style to your own footage. https://invideo.io/news/introducing-invideo-editor/
- Approve-before-spend. Modes are "Always allow", "Ask before generating videos" and "Always ask before generating". The popup shows prompt, model, duration and ratio, all editable. You can also set a per-project credit limit. https://help.invideo.io/en/articles/14718313-how-credits-are-charged-when-using-ai-agents
- AI Twin consent. The user reads an on-screen consent code in English on camera, and uploads without it are rejected. Express twin from a short clip or a YouTube link. https://invideo.io/make/ai-avatar-generator/ and https://help.invideo.io/en/articles/11388821-how-to-create-an-avatar-by-recording-or-uploading-a-video
- Playbooks: standing rules applied to every generation, a natural home for compliance wording. https://invideo.io/agent-two/
- Workflows saved as reusable recipes (markdown), including "Reframing" from 16:9 to 9:16 and "Campaign Transfer". https://invideo.io/news/introducing-workflows-invideo-agent-two/
- Free manual editing and export, paid AI only. https://invideo.io/faq/is-invideo-editor-free-when-i-use-an-ai-editing-agent/

## Kapwing

**Positioning.** A browser-based team video editor with AI tools: Repurpose Studio, subtitles, dubbing, eye contact, and a chat assistant called Kai that generates and edits video.

**Pricing.** Per seat. Free: $0, 10 credits for life, 720p, watermark, 250 MB uploads, projects deleted after 3 days. Pro: $16 per month billed annually ($192 a year), about $24 billed monthly (monthly price unverified on the vendor page). Pro includes 1,000 credits a month, 4K, 6 GB uploads, 120-minute exports, no watermark and Brand Kit. Business: $50 per month billed annually or $64 billed monthly. It includes 4,000 credits, voice clones and lip sync, plus top-ups at 500 credits for $50. Credits reset on the 1st with no rollover.

Example credit costs: subtitles 1 a minute, translation 2 a minute, Repurpose 2 a minute, Clean Audio 2 a minute, Eye Contact 30 a minute, Lip Sync 30 a minute, dubbing about 10 per 30 seconds. Smart Cut is free.

**Core flow (Repurpose).**
1. Upload a video or audio file of 10+ minutes, or paste a link.
2. Optionally name topics in the prompt and ask for a ratio such as 4:5.
3. With no prompt you get 3-5 clips in 9:16 with subtitles and a title. Speaker Focus keeps the active speaker centred. Fillers and unrelated footage are cut.
4. Refine in the prompt box (longer, shorter, other topics).
5. Open in Studio for subtitle styling, music, images, Trim with Transcript, Eye Contact, Clean Audio and Smart B-roll.
6. "Export Project" (MP4/MOV/WebM, up to 4K). No direct publishing or scheduling found.

**Worth copying.**
- Postable defaults: 3-5 clips, 9:16, subtitles and a title with no settings. https://www.kapwing.com/help/how-to-use-kapwings-repurpose-tool/
- Kai shows a storyboard and a credit estimate before generating, and you can ask for a cheaper plan. https://www.kapwing.com/help/ai-video-generator
- Custom Kais are reusable format recipes. Each has a name, a description, a sample input plus example output, and a placeholder. There is a gallery of trending formats. https://www.kapwing.com/help/custom-kai/amp/ and https://www.kapwing.com/help/kapwing-november-2025-release-notes/
- Brand Characters and voices are @mentioned in prompts, which is how "my face, my voice" gets into a generation. https://www.kapwing.com/help/ai-video-generator
- Captions: the "Characters Per Subtitle" slider, word-highlight toggle, "Safe Zones" overlay, and a saved style as the brand default. https://www.kapwing.com/help/add-captions/
- Eye Contact as a one-click AI tool (30 credits a minute). https://www.kapwing.com/tools/adjust/eye-contact
- Dubbing is transcript-driven. You can edit a line, then use "Regenerate dubbed audio" for that section only. https://www.kapwing.com/help/dubbing-faqs/

## Revid.ai

**Why picked.** It is the only candidate with a real "find a viral video, press Remix" product. It combines a 3M+ viral database, three remix modes, source tracking, and auto-posting.

**Positioning.** An AI short-form generator built around viral inspiration: find what works in your niche, make your own version, and post it daily.

**Pricing.** Growth: $39 a month, or $32 a month billed yearly, with 2,000 credits and 3 workers. Elite: $89 or $74, with 5,000 credits, voice cloning and 5 workers. Ultra: $199 or $166, with 12,000 credits and 10 workers. Higher Ultra tiers run up to 200,000 credits for $2,799. Booster packs are one-off and never expire: 1,000 credits for $49 up to 100,000 for $1,900. Viral search is free.

A 30-second video costs about 40-80 credits with Pro moving images, or 600+ with Veo3. The "Estimated cost" shows next to Generate.

**Core flow (remix).**
1. Search a topic across TikTok, Shorts and Reels, or open your daily feed. Sort by engagement rate, likes, comments or recency. Filter by duration, platform and date. Follow competitor channels.
2. Watch the post in place with its transcript and stats.
3. Choose a mode. "Repurpose" keeps the idea, hook and pacing but writes a new script, visuals and voice. "Part 2" continues the story. "Restyle" applies an AI look to footage you own.
4. Edit in the scene editor. "Regenerate from prompt" changes one slide at a time. You can also swap media, change captions (16 presets such as HORMOZI or BOLD PUNCH), and pick voice and music.
5. Export at 720p, 1080p or 4K, in 9:16, 1:1 or 16:9.
6. Publish or queue to TikTok, YouTube or Instagram. Per-post performance comes back to the dashboard, and the remix keeps a link to its source.
7. Optionally turn a winner into a series, or set an Auto-Mode worker to make one video a day.

**Worth copying.**
- The remix mode spec (Repurpose / Part 2 / Restyle) and the rights line in the FAQ: a new original version is allowed, but re-uploading someone else's footage is not. https://www.revid.ai/features/repurpose-viral-videos
- Engagement-rate ranking instead of raw views, with transcript and stats shown inline. https://www.revid.ai/features/repurpose-viral-videos
- Each remix stores its source, and a one-click series. https://www.revid.ai/features/repurpose-viral-videos
- "See inside" recipe cards (prompt, style, format, length) plus "Remix this video" with the tool, style and format prefilled. https://www.revid.ai/category/remix
- Teleprompter recording whose transcript becomes the script, so the user can be their own face without an avatar. https://www.revid.ai/llm/how-to-create-a-video-with-revid-ai.md
- Product URL to a brand profile to an editable 7-day plan. Each day has Objective, Angle, format, big idea and "Goes to". Then a daily worker runs, and "Nothing posts without you" applies. https://www.revid.ai/auto-mode
- Per-channel queue slots: a post with no time takes the next open slot. https://www.revid.ai/llm/revid-ai-publishing-and-automation.md
- A public, transparent credit table and a free cost-estimate endpoint. https://www.revid.ai/llm/revid-ai-credit-costs.md

## Riverside (Magic Clips + Co-Creator)

**Why picked.** It has the strongest AI editor for people who film themselves, which is the "my face" half of a remix. Co-Creator edits by chat and writes the post copy in a saved tone. AI Twin and VideoDub let you change lines without reshooting. Advisers already use it for podcasts and talking heads.

**Positioning.** A record-edit-publish studio for podcasts and talking-head video, with an AI editing and repurposing agent built in.

**Pricing.** Free: 720p with watermark. Pro: $29 a month, or $24 a month billed annually. Pro includes 4K, no watermark, Co-Creator, eye contact, AI B-roll, silence and filler removal, Magic Clips, and 2,000 AI credits to start. Grow: $39, or $34 annually. It adds social scheduling, AI thumbnails and MCP. Webinar: $99, or $79 annually. Business: custom pricing. It includes 12,000 AI credits to start and AI Translation. The pricing page labels itself staging, and per-action credit costs are not published.

**Core flow.**
1. Record in Riverside (up to 4K, separate tracks, teleprompter) or upload.
2. Open the Editor and the Co-Creator sidebar. Set "Personalize" once with a show description and tone.
3. Prompt the agent, for example "Enhance my episode's audio, cut filler, fix eye gaze, and clean up pauses" or "make a reel from the part about X".
4. Magic Clips proposes clips. You can focus on a speaker, topic or keyword, and saved presets set ratio, layout, branding and length.
5. Fix lines with VideoDub (edit the transcript and the audio regenerates in your voice with lip sync), or generate new lines with AI Twin.
6. Schedule in Content Planner to YouTube, TikTok, Instagram, LinkedIn, X or Facebook, with auto-written descriptions.

**Worth copying.**
- One agent that both edits and writes the LinkedIn post or caption in a saved tone ("Personalize"). https://riverside.com/co-creator
- VideoDub: rewrite one line and regenerate it in the same voice with lip sync. This is ideal for swapping a non-compliant phrase. https://riverside.com/ai
- AI Twin built from "Smart references" in existing recordings. It is pitched for A/B testing hooks and CTAs. https://riverside.com/ai-twin
- Silence removal with a sensitivity setting (natural to very snappy), plus "Find Fluff" to flag rambles. https://riverside.com/ai
- Saved clip presets (ratio, layout, branding, length). https://riverside.com/magic-clips
- One calendar holding both recordings and scheduled posts, with descriptions that write themselves. https://riverside.com/content-planner

## Zebracat

**Why picked.** It is a prompt/script/link-to-video tool that also closes the loop. It plans a strategy from your website, schedules posts, and learns from performance. It also offers custom avatars, voice clones and brand kits per plan. It has no explicit remix feature.

**Positioning.** An AI video generator for faceless and marketing short-form, with planning and auto-posting.

**Pricing.**
- Free: 5 credits a week, 30-second videos, 720p, watermark.
- Cat Mode: $39 a month, or $23 billed yearly. 15 videos, 2-minute cap, 1080p, 1 brand kit.
- Super Cat: $99, or $59 yearly. 40 videos, 5-minute cap, 120+ premium avatars, 5 custom avatars and 5 voice clones a month, translation.
- Unlimited Cat: $199, or $119 yearly. Unlimited videos, with 10 custom avatars and 10 voice clones.
- Enterprise: $599+ a month, with API.

The page contradicts itself on credit and minute figures.

**Core flow.**
1. Give it a prompt, script, blog URL, photo or voice recording.
2. Choose pacing, voice, music and visual tone, or pick a template.
3. Zebracat cuts, syncs, adds transitions, captions and voiceover. You get 3-5 free edit rounds per video depending on plan.
4. Optionally add an avatar or digital twin, a voice clone, or translation with lip sync.
5. Approve the plan and cadence. Videos are scheduled and posted, and performance feeds back into future videos.

**Worth copying.**
- Strategy from the user's website, then approve themes and cadence, then schedule, then learn from results. https://www.zebracat.ai/
- Voice clone in 3 labelled steps: "Upload Your Voice", "Create Your AI Clone", "Use It Anywhere". It needs about a minute of audio and explicit permission. https://www.zebracat.ai/features/ai-voice-cloning
- Capped free edit rounds per video as a visible cost control. https://www.zebracat.ai/pricing
- A per-plan count of custom avatars and voice clones each month (5 or 10). https://www.zebracat.ai/features/ai-avatar-generator

## Side note: platform-native remix

YouTube Shorts "Reimagine" was announced on 2026-03-18. It sits under the Remix tool on eligible Shorts. It turns one frame of an existing Short, plus up to two of your photos, into a new 8-second Veo clip, and "Every Reimagined Short links directly back to the original work." This attribution model is worth noting for Content Studio. https://blog.youtube/news-and-events/reimagine-new-ai-powered-remix-tool-youtube-shorts/
