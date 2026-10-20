# Marketing platforms for financial advisers and insurance agents

Researched 2026-10-19. 23 competitors, 128 sourced features. Data: `adviser-marketing.json` (same folder).
Prices are as published, in USD unless noted. "Unverified" means no source confirmed it.

Content Studio already has some of this: a leader review queue (pending, approved, changes requested,
rejected), regex compliance flags for SG/MAS wording (`src/lib/compliance.ts`, they only warn and never
block), compliance preview links (`/review/<token>`) and a CSV audit trail. The patterns at the end
cover what is still missing.

## Research gaps (read first)
- **Lumio:** no product by that name turned up. The closest hit was Lumico, a US Medicare insurer's agent
  portal, which is not related. I covered the insurance-agent tools in Pinney's 2026 list instead.
- **Asian agency tools:** no third-party, Asia-built adviser content platform with manager push was found
  before the shared web-search budget ran out. Vymo (AIA Indonesia and Thailand) and Turtlemint Pro (India)
  are the only Asian entries, and both are thin. AIA's own agent apps were not found publicly.
- **Advisorpedia** and the AdvisorStream help center blocked automated fetches (HTTP 403).
- The Hearsay datasheets are dated 2022. Hearsay is now part of Yext and its current pages say less.

## Regulatory context that shapes the features
- **Singapore (MAS):** MAS published Guidelines on digital advertising on 2025-09-25, effective
  2026-03-25. Financial institutions are responsible for everything their digital marketers produce,
  share or repost. A "this is not financial advice" label is not enough on its own. Each post must be
  "clear and balanced" by itself. Institutions should give marketers **pre-approved advertisement
  templates, checklists and case studies** of acceptable and unacceptable content, and MAS holds the
  board and senior management accountable. This comes from a secondary source and I did not read the MAS
  text itself, so treat the detail as unverified:
  https://www.compliancecorylated.com/news/singapores-mas-this-is-not-financial-advice-label-insufficient-for-finfluencer-compliance/
- **Hong Kong (IA):** insurers, brokers and agencies should have a social media policy with clear dos and
  don'ts, a formal approval process for product-specific posts, and record keeping for audit (per a
  search summary of IA Conduct in Focus Issue 12; the page itself returned 403).
- **India (2023):** some insurers require agents to use only insurer-approved content on their personal
  handles, approved in writing before use. https://cafemutual.com/news/insurance/29045-agents-will-have-to-use-insurers-approved-marketing-content-on-their-social-media-handles
- **US:** FINRA 2210 (BrokerCheck link, filing), FINRA 3110/4511 and SEC 17a-4 (supervision, WORM
  retention). This is why every US tool sells "pre-approved library + approval routing + archive".

---

## FMG Suite
https://fmgsuite.com/ . The market leader. It owns Twenty Over Ten (since Nov 2020) and Vestorly
(since 2022), and GTCR agreed to acquire FMG in July 2025.
- **Pricing:** Marketing Suite Essential 99/mo + 199 setup (1,000 contacts), Premium 269 + 199
  (2,000 contacts), Do It For Me 895 + 499. Websites 79 to 149/mo with 795 to 2,995 setup. Testimonials 99/mo.
- **Compliance:** a pre-approved, FINRA-reviewed library of emails, social posts and e-books. One-Click
  Compliance routes each new email or website edit to the compliance inbox, and "when they hit approve the
  content goes live", while a dashboard keeps the status and history of every submission. Social posts route to the broker-dealer and
  auto-post on approval or at the scheduled time, whichever comes later. The firm library is pushed to
  advisors, and compliance reviews only what an advisor edits.
- **AI (June 2025):** Muse writes drafts from tone, topic and goals (Premium). Overwatch flags risky
  language while the advisor drafts (FINRA/SEC, firm opt-in); risk scoring and one-click corrections were
  announced but may not have shipped. Sidekick is an in-app helper that hands off to a live person.
  Curator picks articles from "thousands" of sources, learns the advisor's interests and writes captions.
- **Content and automation:** breaking-news content within 48 hours. Collections: Market Insights
  newsletters, Life Stages (ages 20-39, 40-54, 55-65, 66+), Financial Know-How (Life Insurance, Medicare
  and more), Celebrations eCards. Automated social posting runs week after week. Canva and Unsplash
  built in. Greeting cards and an events toolkit.
- **Mobile app:** share in one tap and the post goes to compliance first. Its calendar has three states
  (scheduled, waiting on compliance, sent), and each send reports opens and clicks.
- **Do It For Me:** a concierge delivers a fixed monthly quota: 5-8 social posts, 2-4 emails,
  1-2 blogs, 1 video script, a webinar outline and breaking-news emails. The advisor spends about
  30 minutes a month approving it.

## Twenty Over Ten Lead Pilot
https://help.twentyoverten.com/en/lead-pilot . Owned by FMG, pricing not published.
- **Content:** 10 finance and 10 lifestyle articles, 3 infographics and 1 quiz added each month. Filter by
  topic and persona.
- **Sharing:** separate message per network. You can edit the link preview title, image and description
  for Facebook, LinkedIn and Twitter. Schedule to the minute.
- **Lead capture:** every share opens on a branded landing page with a Subscribe Form. Gated content
  comes through a success button linking to a PDF or Calendly. A BrokerCheck button (CRD#, Firm or
  Individual) is built into the template.
- **Compliance:** landing pages and social content are archived WORM for at least 7 years. Emails and
  native posts are not archived (there is a BCC option). A "Compliance PDF" icon sits on drafts and on
  scheduled and shared items.
- **Analytics:** a LEAD score from 1 to 100 updates in real time and learns from the advisor's star
  ratings. It sits beside Profile Insights (third-party bios), an Insights dashboard and an activity feed.
- **Other:** Curated Campaigns (pick a template, set day and time, Start Campaign), users and teams with
  seats, Redtail, Wealthbox and Riskalyze sync, Facebook Pixel.

## Vestorly
FMG-owned AI engine that picks third-party and original content for each advisor, and for each client
based on what that client opens, behind a "Robo-Compliance" filter. Third-party price listing (unverified): Free, Standard
59/mo, Professional 599/mo.

## Snappy Kraken
https://snappykraken.com/ . Claims 7,000+ advisors across 200 networks.
- **Pricing:** Foundations 199/mo + 199 setup (10k contacts, 20k emails), Grow 299 + 499 (50k / 80k),
  Freedom360 899 + 499 (100k contacts, unlimited email). Extra advisor workspace 99 or 699, admin seat 99,
  Convos texting 99.
- **Campaigns:** 150+ pre-built, FINRA-reviewed campaigns across web, email, text and social, launched in
  one click. Built-in approval workflows that lock edits after approval, plus archiving. SOC 2 Type 2.
- **Opportunities Feed:** prospects ranked by behaviour and intent, with "Call this contact" prompts. You
  can text or email from the card.
- **Snappy AI:** "Ask Snappy AI", plus suggested actions: "Review account readiness", "Find the right
  campaign", "Prioritize the next opportunity". It also files leads into approved automations, and at
  launch it could only read, with no access to contact PII.
- **Speed to lead:** new leads get a personalized reply in under 5 minutes. Convos texting archives every
  message, routes texts for pre-approval and triggers on downloads, clicks and form fills.
- **Enterprise Hub:** the home office pushes campaigns to any subset of advisors by hierarchy, cohort or
  office, and locks the elements advisors may not change. It adds email journaling, a full action log, user impersonation, adoption
  dashboards, and reports by advisor, cohort, campaign and channel.

## Hearsay Social (Yext)
Enterprise only. Yext bought Hearsay in June 2024 for 125M cash plus up to 95M earn-out. The 2022
datasheet cites 225,000+ users, including life and P&C insurers (New York Life, Allstate, American National).
- **Post Library:** a "Recommended for Your Audience" filter with Netflix-style AI picks. AI suggests what,
  when and where to post. Content+ adds top-performing posts to the library after checking them against the firm lexicon.
- **Dynamic Campaigns:** the home office auto-posts approved content to agents' own profiles.
- **Supervision:** pre-approval, a lexicon, a Risk Meter, AI alerts, routing of the highest-risk items
  first, approval trails and infraction resolution, built for FINRA, SEC, IIROC, FCA and MiFID II firms;
  Hearsay claims it cuts review time by up to 80%.
- **AI video pre-review:** an ML scan of frames for inappropriate imagery, plus a transcript, title and
  caption lexicon scan. A person makes the final call.
- **Central Profile Control**, comment nudges ("Your LinkedIn post has 2 comments. Reply to them now."),
  and Hearsay Relate for compliant SMS, voice and WhatsApp with AI replies and archiving.

## Levitate
https://levitate.ai/ . Essential, Preferred and Prestige tiers. No public prices (GetApp: from 349, unverified).
- **Compliance flow, on by default for financial customers:** the advisor enters the compliance officer's
  email, Levitate sends that officer a PDF, and the campaign waits in pending until someone approves it,
  either by replying to the email (Levitate reads the reply) or by clicking "Approve Campaign". Once the send time passes, approval is blocked: email gets a
  2-day grace period, social posts get none. Attachments are capped at 3 MB. Admins can lock the
  compliance email.
- **Library review:** a broker-dealer or Super Admin marks each template Pre-Reviewed, Approved or Rejected,
  and agents never see the rejected ones. A rejection needs a reason (Citations, Content, Images, Other) plus
  a note, and the owner gets an email naming the reviewer.
- **Other:** Lev AI rewrites, translates into 10 languages or writes new content. Emails go from the
  advisor's own Outlook or Gmail. Handwritten cards, texting from a dedicated number, surveys that lead
  to review requests, and Google Review replies. A content calendar approved months ahead, read tracking,
  an opportunity board, and a dedicated Success Specialist.

## Advisorpedia
Advisor publisher (IRIS Media Works since 2021). Its "Content Engine" gives advisors personalized content
to use as their own. Details and price are unverified because the site blocked fetches.

## Seismic Social (formerly LiveSocial)
Enterprise. Firm research sits beside third-party articles chosen for each rep's market. Aura AI drafts
captions only in styles the program owner approves. Publishing is governed by approval workflows.
Adoption and engagement analytics.

## Smarsh (incl. legacy Actiance Socialite)
- **Capture and archive:** posts, comments, DMs, reactions and media across LinkedIn, Facebook, Instagram,
  X, TikTok, YouTube and more (100+ channels). SEC 17a-4, FINRA 3110/4511. 40M+ messages a day. Automated
  supervision policies.
- **Socialite (legacy):** pre-approved library posts publish immediately and cannot be edited. Anything the
  advisor adds, such as a comment or their own post, goes to compliance first. Its current status is
  unverified.

## Proofpoint Patrol
200+ classifiers (AI, lexicon, regex), each with its own action (Delete, Notify, Delete and Review). The
compliance rules cover financial promotions and testimonials, and Patrol works before or after posting.
An open API lets any publishing tool check a post first and show the user what is wrong. The review
queue offers Approve, Mark Reviewed, Reject, Reject & Remove, Permanently Mask Content and Flag. Profile
snapshots roll back unapproved bio edits automatically. Archive-agnostic (17a-4).

## Broadridge Advisor (AdvisorStream, Forefield heritage)
https://advisor.broadridge.com/pricing . Digital Marketing 175 or 235/mo, websites 75 or 215, bundles
225 or 400. Through the Osaic partner program it is 25/mo, paid by commission deduction.
- Licensed articles from WSJ, Dow Jones, NYT and 20+ other publishers feed weekly newsletters written
  and sent for the advisor, on top of a 3,000+ piece FINRA-reviewed library inherited from Forefield.
- **Video Studio:** 30+ FINRA-reviewed videos auto-branded with the advisor's photo, colours, logo and
  contact details, with CTAs (BlueRush IndiVideo). The Sept 2025 update added a script library, an
  in-platform teleprompter with retakes and coaching, unified compliance approval and network analytics.
- AI insights on next-best communication, landing pages and nurture, delegate access for assistants,
  eCards and CE credits.

## Apaya
69 / 129 / 229 per month. The Brand Framework holds approved language, **disclaimers and banned
phrases**, and every AI generation obeys it. Posts stay drafts until approved, and reviewers can ask for
a regeneration with feedback. Access can be scoped by brand, office, region or role, and analytics split
by branch. It states plainly that it is not an archive.

## SageContent
Flex costs 250/mo (200 on annual). Teams 100/seat. The Sage Profile questionnaire drives evergreen and
timely topic ideas. Scripts run 150-210 words (hook, body, CTA) at a grade 6-8 reading level. A 7-step
video board (idea, thumbnail, script, descriptions, recording, editing, posting) has a **Compliance
Review stage** that records approval dates and the reviewer, with CSV or DOCX export. In-browser recording,
an AI editor, human editing credits, and coaching on which videos converted.

## Lately AI
Turns long-form text, audio or video into hundreds of posts, tuned per region or employee. Advanced
Controls name who must review each post. Employees pick pre-approved posts to share on their own
accounts. Parent-child dashboards.

## Marky
Generic AI tool at 39 / 79 / 229 per month that writes a month of posts at once. The approval workflow is
Pro-only, and there is no archive.

## Cloud Campaign
49 / 199 / 299 per month, aimed at agencies serving insurance agents. One workspace per agent, office or
carrier agency. A reviewer can approve a whole calendar from **one secure link**, with multi-level
sign-off. Evergreen queues recycle approved posts. CaptionAI, ImageAI, an AI social inbox, watermarks
per workspace, and one-click branded reports.

## Insurance-agent tools (Pinney 2026 list)
- **Social Jazz:** auto-scheduled branded insurance posts. Free gets 2 posts a week; paid tiers 19, 49 or 199.
- **BrightFire:** done for you, 32 posts a month, from 100/mo, and the agent approves them.
- **SocialCoach:** teleprompter, auto-subtitles, branded overlays and compliance filters.
- **Insureio:** a life-agent CRM with a content library and pre-written campaigns, from 25/mo.
- **Denim Social:** compliant organic and paid social for agencies.

## Asia
- **Vymo:** AI nudges for insurer field forces. At AIA Thailand, managers allocate leads and send
  engagement nudges. The AIA Indonesia case reports 134% more leads and over 92% daily active use.
  Content sharing was not confirmed.
- **Turtlemint Pro (India):** WhatsApp and SMS marketing tools, training on new products, and quotes from 40+ insurers.

---

## Patterns worth copying

Ordered by value to Singapore advisers and agency leaders under the MAS guidelines that took effect
on 2026-03-25.

1. **A pre-approved library is the fast lane, and editing sends a post back to review.** Untouched
   approved posts publish with no review. Any edit, added comment or caption change reopens review.
   Rejected items vanish from agents' view. (FMG enterprise, Socialite, Levitate statuses.) MAS asks firms
   for exactly this: pre-approved templates. Content Studio's review queue covers member-written posts,
   but leaders cannot yet publish an approved library that members post from without review.
2. **A compliance coach while drafting, driven by a firm-owned rule set.** Overwatch, Patrol's immediate
   feedback and Apaya's Brand Framework (disclaimers and banned phrases) all check the draft before it is
   submitted. Next steps: per-rule severity and action (warn, block, require review), a risk score, a
   one-click fix, and required disclaimers added automatically by product type. Content Studio's
   `compliance.ts` regex set is a start, but it only warns and the firm cannot edit it.
3. **Leaders push to the downline, and approved posts go out under the agent's name.** Snappy Kraken
   Enterprise Hub (target by hierarchy, cohort or office, lock fields, impersonate, adoption dashboard)
   and Hearsay Dynamic Campaigns (auto-post approved content to agents' own profiles). This maps directly
   to an AIA agency leader and their team.
4. **Approve where the reviewer already works.** Levitate's PDF to the compliance email, with
   reply-to-approve detection. Cloud Campaign's whole-calendar approval from one link. Lead Pilot's
   Compliance PDF button. Approval also depends on time: once the send time passes the post cannot be
   approved, and the reviewer must pick a new time. Content Studio already sends preview links, so adding
   approve and reject buttons to that link, plus a PDF copy, would close the loop.
5. **An immutable record of what went out.** Lead Pilot keeps WORM records for at least 7 years and says
   plainly what it does not archive, while Smarsh goes further and captures comments and DMs. SageContent exports approval
   dates and reviewer names. Proofpoint delivers to any archive. For MAS and insurer audits, keep a frozen
   copy of the exact published text and media, with who approved it and when.
6. **Check video by its transcript.** Hearsay runs a lexicon over the transcript, captions and title, plus
   a visual scan. SageContent's video board has a Compliance Review column. Content Studio makes reels,
   avatar videos and voice clones, so its compliance flags need to scan scripts and transcripts, not just
   captions.
7. **Every share becomes a lead capture.** Lead Pilot wraps shared content in a branded landing page that
   holds a subscribe form, a gated download and a BrokerCheck link. The Singapore equivalent is the
   representative's licence or register number. Snappy Kraken replies to new leads in under 5 minutes,
   and Hearsay Relate supervises WhatsApp, the channel Singapore agents actually sell on.
8. **Turn engagement into a ranked to-do list.** Lead Pilot's 1-100 LEAD score that learns from the
   advisor's stars, Snappy Kraken's Opportunities Feed ("Call this contact"), Hearsay's "2 comments, reply
   now" nudges, and Snappy AI's "Review account readiness / Find the right campaign / Prioritize the next
   opportunity". This is the "next up" agent from the north star.
9. **Brand a template video with the agent's identity.** Broadridge Video Studio stamps the advisor's
   photo, logo, colours and contact details onto 30+ pre-reviewed videos, and adds a script library and
   teleprompter with built-in approval. This is the compliant version of Remix: a firm-approved source,
   rebuilt in the agent's face and brand, with the approval already done.
10. **Approve once, reuse many times, on a fixed monthly quota.** FMG Do It For Me sets a quota (5-8
    posts, 2-4 emails, 1 script) and asks for one 30-minute approval pass a month. Levitate and FMG approve
    the calendar months ahead. Cloud Campaign's evergreen queues recycle approved posts. FMG publishes
    breaking-news content within 48 hours. An agent that fills a month to a quota, gets it approved in
    one pass and recycles approved evergreen posts suits advisers who post rarely.

**Pricing anchors:** US adviser platforms charge 99 to 900/mo, plus 199 to 3,000 setup, and meter
contacts, email volume and advisor workspaces (99 to 699 each). Video-first tools charge 250/mo. Generic
AI social tools charge 19 to 229/mo with no compliance features. Broadridge also sells through
distributors, at 25/mo deducted from commission, which is worth copying for agency-wide deals.
