# Instagram and TikTok app review: checklist

**For:** Leo · **Written:** 15 September 2026 · **Status:** research and paperwork only; nothing submitted

**Goal.** Consultants connect their own Instagram and TikTok accounts through the
official logins. The account audit then gets real views, reach, saves and watch
time, instead of scraping public posts with Apify (`docs/account-audit.md`).

Every fact below cites a source in [Sources](#sources). All sources were accessed
on 15 September 2026. **[CONFIRM: …]** marks something to check. **Unverified**
marks something no official page confirmed.

---

## 0. Read this first: four things that set the timeline

1. **Both reviews need the feature working on video.**
   - Meta: the screen recording must show "an app user granting your app each
     permission" and "how your app uses each granted permission" [M11].
   - TikTok: the demo video must show "the complete end-to-end flow" and "all
     selected products and scopes" [T9].

   So engineering builds the connection **before** you submit. It can do this in
   Meta's development mode with test accounts [M1, M17] and in a TikTok sandbox
   [T11]. "After approval" is mostly switching it on for everyone (section 11).
2. **Meta Business Verification is required** for Advanced Access, which you need
   to serve accounts you don't own [M1, M12]. It needs a registered business and
   official documents. Start it today: it's the step you control that can stall
   longest.
3. **TikTok rejects a website that is only a login page.**
   - Your privacy policy and terms links must be visible without opening a menu
     [T9].
   - Today, every route except `/auth` and `/roadmap` is behind sign-in
     (`src/App.tsx`), so visitors to consultant-content-studio.vercel.app hit the
     sign-in page.
   - You need a public homepage plus `/privacy`, `/terms` and `/data-deletion`
     pages.
4. **TikTok's official API won't give you watch time or saves.** Its video object
   has views, likes, comments and shares, but no watch-time, saves or reach field
   [T4]. Instagram does provide reach, saves and Reels watch time [M3]. Set
   expectations: the TikTok connection mostly makes the numbers reliable and
   consented, not richer.

---

## 1. Your first 10 steps

1. Choose the legal entity that will own both apps. Get its ACRA business profile
   and make sure its legal name, address and phone match what you'll enter
   everywhere. (Section 4.)
2. Decide on a custom domain vs `consultant-content-studio.vercel.app`. A domain
   you control makes TikTok URL verification and Meta's redirect URIs simpler.
   [CONFIRM: whether TikTok URL-prefix verification works on a vercel.app
   subdomain]
3. Create a Meta Business Portfolio under that exact legal name. Start Business
   Verification. (Section 4.)
4. Register as a Meta developer and create the app for **Instagram API with
   Instagram Login**. Connect it to the Business Portfolio under *App Settings >
   Basic > Verification* [M12].
5. Create a TikTok for Developers account and an **organization**. Create the app
   and add **Login Kit** and **Display API**. (Section 3.)
6. Get the drafts reviewed, then publish them with a public homepage:
   `docs/drafts/privacy-policy.md` and `docs/drafts/data-deletion.md`. Terms of
   service still need writing. (Section 7.)
7. Set up test accounts:
   - an Instagram **Creator or Business** account with a few posts and Reels;
   - a TikTok account with a few public videos;
   - a dedicated Content Studio reviewer login. Don't reuse a personal or shared
     demo login [M11].
8. Approve the engineering work in section 11. It includes a schema change (a
   connections table) and new edge functions. It runs against test accounts only.
9. Record the screencasts (section 8). Submit Meta App Review for
   `instagram_business_basic` and `instagram_business_manage_insights`, and TikTok
   review for `user.info.basic`, `user.info.profile`, `user.info.stats` and
   `video.list`.
10. Plan for at least one rejection-and-resubmit cycle on each platform. Once
    approved, switch the Meta app to Live [M17] and roll out.

---

## 2. Timeline and costs

### Realistic timeline (my estimate; the platforms only publish review times)

| Week | What happens |
| --- | --- |
| 0 | Business Verification started. Developer accounts and apps created. Domain decision. Legal review of drafts starts. |
| 1 to 3 | Engineering builds connect, read, refresh and delete flows against test accounts. Public homepage, privacy, terms and data deletion pages go live. |
| 3 to 4 | Screencasts recorded. Meta and TikTok submissions sent. |
| 4 to 6 | Meta: "you should receive a decision within a week" [M11]. TikTok: "several days to two weeks" [T12]. Fix and resubmit if rejected. |
| 6 to 8 | Meta app to Live. TikTok production approved. Rollout to consultants. |

Business Verification time isn't stated in the Meta docs I checked [M12].
**Unverified.** Budget extra time for document back-and-forth.

### Costs

| Item | Cost |
| --- | --- |
| Meta developer account, App Review, Business Verification | No fee found in the docs checked. [CONFIRM] |
| TikTok developer account and app review | No fee found in the docs checked. [CONFIRM] |
| API calls (both platforms) | No per-call price found; both use rate limits instead [M15, T6]. |
| ACRA business profile (proof of registration) | A small fee (S$5.50 per one secondary source). **Unverified.** [CONFIRM] |
| Custom domain | Yearly registrar fee, if you choose one. |
| Lawyer review of privacy policy and terms | [CONFIRM budget]. Strongly recommended before publishing. |
| Savings | Connected accounts skip Apify: about US$0.05 per Instagram refresh and US$0.09 per TikTok refresh today (`docs/account-audit.md`). |

---

## 3. Accounts to create

### Meta

1. **Developer account** on developers.facebook.com, using your own Facebook login.
2. **Business Portfolio** (business.facebook.com) under the company's exact legal
   name. Only a Business admin can complete verification [M12].
3. **App.** Pick the Instagram use case that gives *API setup with Instagram
   business login*. Set App Purpose to **"Clients"**, because the app serves other
   people's accounts [M11]. [CONFIRM: the use case title in the dashboard; Meta's
   docs show it as "Manage messaging and content on Instagram"]
4. **App Settings > Basic** [M10, M11]:
   - app icon (1024x1024);
   - privacy policy URL;
   - category;
   - business email;
   - data deletion instructions URL or callback [M13];
   - terms of service URL. [CONFIRM: whether terms are required or optional]
5. **Connect the app to the Business Portfolio** under *Settings > Basic >
   Verification* [M12].
6. **Instagram testers.** Add your test professional account as an Instagram
   tester under *App Roles > Roles*. Accept the invite in Instagram (*Edit profile
   > Apps and websites > Tester invites*). **Unverified:** this path comes from a
   third-party guide [S2]. In development mode, only people with a role on the app
   can use it [M17].
7. **Reviewer access.** A dedicated Content Studio login plus step-by-step test
   instructions [M10, M11]. Content Studio uses Academy sign-in (`src/pages/Auth.tsx`).
   [CONFIRM: how to create a reviewer account in the shared Academy auth]

### TikTok

1. **Developer account** on developers.tiktok.com.
2. **Organization.** You can register apps under an individual account, but TikTok
   advises against it for production [T10].
3. **App** [T9, T10]:
   - icon 1024x1024 px (JPEG or PNG, up to 5 MB);
   - name, category and description;
   - terms of service URL and privacy policy URL;
   - platform **Web** with the website URL.

   The name must not reference TikTok or other social media companies, and must
   match the website's name. The description must not suggest private or personal
   use.
4. **Products.** Add **Login Kit** and set its redirect URI [T7]. Add **Display
   API**: its setup guide requires "Approval for both a Login Kit and TikTok API
   products" [T14]. [CONFIRM: which product adds `user.info.profile` and
   `user.info.stats` in the portal; the scopes page lists them under the User Info
   API [T2]]
5. **Sandbox.** Up to 5 sandboxes and up to 10 target TikTok accounts. No review
   needed [T11]. Record the demo video here; TikTok says to use sandbox for
   first-time submissions [T9].
6. **URL properties.** Verify ownership of the terms, privacy policy and website
   URLs before submitting [T10]. Verify by domain (DNS record) or by URL prefix
   [T10, S5].

---

## 4. Meta Business Verification

**Who needs it.** "Apps that request advanced access for permissions and apps that
allow other Businesses to access their own data must be connected to a Business
that has completed Business Verification" [M12].

**Steps**

1. In the Business Portfolio, enter the legal name, address, phone and website
   exactly as registered.
2. An app admin connects the app to the Business (*App Settings > Basic >
   Verification*). A Business admin completes verification [M12].
3. Upload documents. Meta's help centre page on accepted documents wouldn't load
   for this research, so this list comes from secondary sources [S1] and is
   **unverified**:
   - certificate or articles of incorporation;
   - business registration or licence document;
   - government-issued business tax document;
   - business bank statement;
   - utility bill (address and phone only; not accepted for the legal name).

   For Singapore, an ACRA business profile from BizFile is the natural proof of
   registration. [CONFIRM: Meta's Singapore document list in the Business Help
   Centre] Documents must be current and unedited, and the name must match exactly.
4. Complete any email, phone or domain confirmation Meta offers.

Separately, Meta introduced identity verification for **advertisers** targeting
Singapore in 2025 [S3]. That is a different process from app Business
Verification.

---

## 5. Instagram: exactly what to request

**Product:** Instagram API with Instagram Login. It needs no Facebook Page [M2].

**Accounts supported:** Instagram professional accounts only, meaning Business
or Creator [M1]. The insights guide says it "cannot be used to get data for media
owned by personal Instagram accounts" [M6].

### Permissions (request Advanced Access for both)

| Permission | What it unlocks | Justification for the reviewer (one sentence) |
| --- | --- | --- |
| `instagram_business_basic` | The connected account's profile: username, name, profile picture, bio, website, follower, following and post counts [M18]. Its posts: caption, media type, link, date, like and comment counts, and Reels `view_count` [M5]. | "Content Studio uses instagram_business_basic to identify the consultant's connected Instagram professional account and list their recent posts, so the Account Audit on the Analytics page can rate each post against that account's own usual performance." |
| `instagram_business_manage_insights` | Per-post insights and account insights (tables below) [M3, M4, M6] | "Content Studio uses instagram_business_manage_insights to show consultants the views, reach, saves, shares and Reels watch time of their own posts in the Account Audit, so its advice is based on real performance instead of public like counts." |

**Don't request** `instagram_business_content_publish`,
`instagram_business_manage_comments` or `instagram_business_manage_messages`
[M2, M9]. Content Studio doesn't publish, comment or message. Meta: "If you request
permissions or features that your app does not use … your submission will not be
approved" [M10].

The old Instagram Login scope values were deprecated on 27 January 2025. Use the
`instagram_business_*` names [M2].

`docs/analytics-integration.md` still lists `instagram_basic`,
`instagram_manage_insights` and `pages_show_list`. Those belong to the
**Facebook Login** version of the API, which needs a linked Facebook Page. Use the
Instagram Login permissions above.

### Per-post insights (`GET /{ig-media-id}/insights`) [M3]

| Metric | Feed posts | Reels | Stories |
| --- | --- | --- | --- |
| `views` | yes | yes | yes |
| `reach` | yes | yes | yes |
| `saved` | yes | yes | |
| `shares` | yes | yes | yes |
| `likes`, `comments` | yes | yes | |
| `total_interactions` | yes | yes | yes |
| `ig_reels_avg_watch_time` | | yes | |
| `ig_reels_video_view_total_time` | | yes | |
| `reels_skip_rate` | | yes | |
| `reposts` | yes | yes | yes |
| `follows`, `profile_visits`, `profile_activity` | yes | | yes |

`views` works on feed posts too [M3]. That fixes today's gap where Instagram
photos and carousels have no public views (`docs/account-audit.md`).

### Account insights (`GET /{ig-user-id}/insights`) [M4]

The metrics are:

- `views`, `reach`, `accounts_engaged`, `total_interactions`;
- `likes`, `comments`, `saves`, `shares`;
- `follower_count`, `follows_and_unfollows`, `profile_links_taps`,
  `online_followers`;
- `engaged_audience_demographics`, `follower_demographics`.

The post-level metric is `saved`; the account-level metric is `saves` [M3, M4].

### Deprecated or renamed metrics

| Old metric | What happened | Use instead |
| --- | --- | --- |
| `impressions` (media and account) | Deprecated in v22.0, then for all versions on 21 April 2025 [M4, M7]. Not available for media created after 2 July 2024 [M3]. | `views` |
| `plays`, `clips_replays_count`, `ig_reels_aggregated_all_plays_count` | Deprecated for all versions on 21 April 2025 [M7] | `views` |
| `video_views` (media) | No longer supported from 8 January 2025 [M8] | `views` |
| `profile_views`, `website_clicks`, `email_contacts`, `phone_call_clicks`, `text_message_clicks`, `get_direction_clicks` (account) | No longer supported from 8 January 2025 [M8] | `profile_links_taps`, `profile_visits` (closest remaining) |

### Limits worth designing around

- **Delay.** Data can be delayed up to 48 hours [M3, M4]. The audit already skips
  posts younger than 48 hours.
- **Follower minimums.** `follower_count` and `online_followers` need 100 or more
  followers. Demographics need at least 100 engagements or followers in the period
  [M4].
- **Media type limits.** No insights for photos inside an album (carousel
  children). Story metrics last 24 hours only [M3].
- **Retention.** The media insights reference says data is kept "up to 2 years"
  [M3]. The insights guide says "User Metrics data is stored for up to 90 days"
  [M6]. These may cover different data, but the pages don't say. Store the
  numbers you need.

### Tokens [M1, M2]

- **Authorize** at `https://www.instagram.com/oauth/authorize` with `client_id`,
  `redirect_uri` (must "exactly match" a configured URI), `response_type=code` and
  comma-separated `scope`.
- **Short-lived token:** 1 hour, from `https://api.instagram.com/oauth/access_token`.
- **Long-lived token:** 60 days. Exchange at `https://graph.instagram.com/access_token`
  with `grant_type=ig_exchange_token`.
- **Refresh** at `https://graph.instagram.com/refresh_access_token` with
  `grant_type=ig_refresh_token`. The token must be at least 24 hours old, still
  valid, and the user must have granted `instagram_business_basic`. Unrefreshed
  tokens expire after 60 days.

### Rate limits [M1, M15]

Instagram Platform uses Business Use Case limits: "Calls within 24 hours = 4800 *
Number of Impressions". Read the `X-Business-Use-Case-Usage` response header and
back off as it climbs. A weekly refresh of 30 posts is small, but a new account
with few impressions gets a smaller budget. (That last point is my inference from
the formula.)

### Access levels and ongoing duties

- **Access levels.** Standard Access is the default, "intended for apps that will
  only be used by people who have roles on them". Advanced Access "requires App
  Review and Business Verification" [M1].
- **Development mode.** Apps in Development mode can only request permissions from
  role users. Switch to Live after App Review [M17].
- **Data Use Checkup.** Annual, for apps that are live or have Advanced Access
  [M16].
- **Platform Terms** [M14]:
  - delete Platform Data when it's no longer needed or the user asks (3.d);
  - never sell it (3.a.iv);
  - keep industry-standard security and report incidents (6);
  - the privacy policy must explain what you process, why, and how to request
    deletion (4.b).

### Personal accounts: what the app should say

Instagram doesn't let apps read personal accounts [M1, M6]. Suggested copy when a
consultant tries to connect one:

> **Instagram only shares insights for Creator and Business accounts.**
> Switching is free and takes a minute in the Instagram app. Then come back and
> connect again. Until then, your audit keeps using your public numbers.
> Heads up: if your account is private, switching makes it public.

- **Private accounts become public.** Instagram's help centre says a private
  account becomes public when it switches to professional [S4]. **Unverified:**
  seen in a search excerpt, not the full page.
- **Menu path.** [CONFIRM: the current in-app path to "Switch to professional
  account"]
- **What the login does.** [CONFIRM: what Instagram's login screen shows for a
  personal account. Test it with a personal account in development mode, and match
  the in-app copy to it]

---

## 6. TikTok: exactly what to request

**Products:** Login Kit (web) and Display API [T13, T14].

### Scopes

| Scope | Fields it unlocks | Justification for the reviewer (one sentence) |
| --- | --- | --- |
| `user.info.basic` | `open_id`, `union_id`, `avatar_url` (and sizes), `display_name` [T3] | "Content Studio uses user.info.basic to identify the consultant's TikTok account when they connect it and show their name and avatar on the Analytics page." |
| `user.info.profile` | `bio_description`, `profile_deep_link`, `is_verified`, `username` [T3] | "Content Studio uses user.info.profile to show the connected @username and profile link on the Account Audit and to give its advice the context of the consultant's bio." |
| `user.info.stats` | `follower_count`, `following_count`, `likes_count`, `video_count` [T3] | "Content Studio uses user.info.stats to track the consultant's follower count week to week in the Account Audit." |
| `video.list` | The user's **public** videos, newest first [T5]. Each video has `id`, `create_time`, `title`, `video_description`, `duration`, `cover_image_url`, `share_url`, `embed_link`, `view_count`, `like_count`, `comment_count`, `share_count` [T4]. | "Content Studio uses video.list to read the consultant's recent public videos and their views, likes, comments and shares, so the Account Audit can rate each video against that account's usual performance." |

- **Only the basic scope is free.** `user.info.basic` is Login Kit's baseline.
  "Anything beyond that requires pre-approval in your app configuration" [T13].
- **Users can grant fewer scopes.** "Users can grant a subset of what you request"
  [T13]. Handle missing scopes gracefully.
- **Not available:** watch time, saves or favourites, and reach. The video object
  has no such fields [T4].
- **Unverified lead, not researched:** TikTok's separate business API products may
  offer deeper analytics for TikTok Business accounts. Check before promising
  TikTok watch time.

### Endpoints and limits

- **Endpoints** [T1, T5]:
  - `GET https://open.tiktokapis.com/v2/user/info/?fields=…`
  - `POST https://open.tiktokapis.com/v2/video/list/`, with `max_count` of at most
    20 per page, so 30 videos is two calls.
  - `POST /v2/video/query/`
- **Rate limits** [T6]: 600 requests per minute for each of `/v2/user/info/`,
  `/v2/video/list/` and `/v2/video/query/`, on a one-minute sliding window. Over the
  limit you get HTTP 429 `rate_limit_exceeded`. The docs don't say whether the
  limit is per app or per user.

### Tokens [T7, T8]

- **Authorize** at `https://www.tiktok.com/v2/auth/authorize/` with `client_key`,
  comma-separated `scope`, `redirect_uri`, `state` and `response_type=code`.
- **Redirect URIs:**
  - at most 10;
  - each under 512 characters;
  - absolute and `https`;
  - static, with no query parameters and no `#`;
  - registered in the portal.
- **Tokens:** the access token lasts **24 hours** and the refresh token **365 days**.
- **Refresh** by POST to `https://open.tiktokapis.com/v2/oauth/token/` with
  `grant_type=refresh_token`. "The returned `refresh_token` may be different … You
  must use the newly-returned token."
- **Revoke** by POST to `https://open.tiktokapis.com/v2/oauth/revoke/`.
- **PKCE** isn't mentioned in the web Login Kit guide checked [T7]. [CONFIRM
  before building]

### Restrictions and regional notes

- **Individual developers** can register apps, but TikTok recommends an
  organization for production [T10].
- **App purpose.** Apps "must not be for private or personal use" [T9].
- **Singapore.** No regional restrictions for Singapore developers were found in
  the pages checked [T9, T12, T15]. **Couldn't confirm either way.**
- **Developer Terms** [T15, T16]:
  - disclose privacy practices accurately (III.2(c));
  - keep strong safeguards (III.2(e));
  - don't share users' personal data without consent.

---

## 7. URLs to host before submitting

| URL (proposed) | Needed by | Status today |
| --- | --- | --- |
| `https://<domain>/`: public homepage describing Content Studio, with privacy and terms links visible without a menu | TikTok website URL [T9, T10] | **Missing.** `/` goes into the signed-in app. |
| `https://<domain>/privacy` | Meta privacy policy URL [M10, M14]; TikTok [T10] | Draft: `docs/drafts/privacy-policy.md` |
| `https://<domain>/terms` | TikTok [T10]; Meta [CONFIRM: required or optional] | **Not drafted.** Include: consultants audit only their own accounts, are responsible for their posts and MAS rules, and AI output needs checking. |
| `https://<domain>/data-deletion` | Meta data deletion instructions URL [M13, M14] | Draft: `docs/drafts/data-deletion.md` |
| Data deletion callback (Supabase edge function) and status page `https://<domain>/data-deletion/status?code=…` | Meta callback option [M13] | To build (data-deletion.md, part 5) |
| Deauthorize callback | Instagram business login settings. [CONFIRM: field name] | To build |
| Instagram OAuth redirect, e.g. `https://<domain>/connect/instagram/callback` | Must exactly match the configured URI [M2] | To build |
| TikTok OAuth redirect, e.g. `https://<domain>/connect/tiktok/callback` | Static https, no query string [T7] | To build |

Point both redirects at app routes on your own domain. Those routes then pass the
code and state to an edge function. That keeps the redirect on a domain you can
verify for TikTok. [CONFIRM: whether TikTok requires redirect URIs to be on a
verified URL property]

**Privacy policy page tips:**

- It must load fast, be public and not be geoblocked [M14].
- It should name the Instagram and TikTok data you read.
- Publish the version that includes the "Planned" sections before submitting.

---

## 8. Screencast shot lists

### Meta rules [M10, M11]

- English UI, or add captions and tooltips.
- Show the user granting each permission, then show the app using it.
- Reviewers won't listen to audio, so add on-screen captions.
- Record at 1080p or better, on a monitor 1440 px wide or less.
- Keep the mouse cursor visible.
- Use test accounts, not personal credentials.

**Meta shot list** (one recording covering both permissions; attach it to each)

1. Caption card: "Content Studio: connect Instagram (instagram_business_basic,
   instagram_business_manage_insights)".
2. Browser address bar showing your domain. Sign in to Content Studio with the
   reviewer account.
3. Go to **Analytics → Your accounts** and click **Connect Instagram**.
4. Instagram's login page (instagram.com/oauth/authorize). Log in with the test
   **professional** account.
5. **Consent screen.** Hold for 3 seconds on the permission list, with a caption
   naming both permissions. Click **Allow**.
6. Back in Content Studio: "Connected as @testaccount" with profile picture and
   follower count. Caption: "instagram_business_basic: profile".
7. Account Audit post list: captions, dates, likes, comments. Caption:
   "instagram_business_basic: media list".
8. Each post's **views, reach, saves, shares**, and for a Reel, **average and total
   watch time**. Open one post's detail. Caption:
   "instagram_business_manage_insights: media insights".
9. Account summary: reach, views, follower trend. Caption:
   "instagram_business_manage_insights: account insights".
10. Advice lines that cite those numbers.
11. Optional but persuasive: the same Reel's insights in the Instagram app, showing
    the numbers match.
12. **Disconnect**, then the privacy policy and data deletion links.

**Reviewer notes to paste in the submission:** numbered steps for 2 to 10, the
reviewer login, and where each permission appears in the UI.

### TikTok rules [T9]

- Show the complete end-to-end flow and every selected product and scope.
- For web apps, the domain shown in the video must match the website URL.
- Up to 5 videos, 50 MB each.
- Record in sandbox for a first submission.

**TikTok shot list**

1. Public homepage with the URL visible, and the privacy and terms links on screen
   without opening a menu.
2. Sign in to Content Studio with the reviewer account.
3. Go to **Analytics → Your accounts** and click **Connect TikTok**.
4. TikTok's authorize page listing the four scopes. Authorize with a sandbox target
   user.
5. Back in the app:
   - display name and avatar (`user.info.basic`);
   - @username, bio, verified badge, profile link (`user.info.profile`);
   - follower, following, likes and video counts (`user.info.stats`).

   Caption each.
6. Video list with views, likes, comments, shares, and the audit rating each video.
   Caption `video.list`.
7. Refresh; show the "since last week" follower change (`user.info.stats`).
8. **Disconnect** (token revoked), then the privacy policy link.

Keep each file under 50 MB: 1080p, short takes, compressed.

---

## 9. Main rejection reasons to avoid

**Meta**

- Requesting permissions the app doesn't use, or that the recording doesn't show
  [M10, M11]. Request only the two above.
- A recording that skips the login, the consent screen, or visible use of each
  permission [M11].
- A privacy policy that's missing, slow, geoblocked or vague about data and
  deletion [M14]. Secondary sources report slow pages alone causing rejections
  [S6].
- Reviewers unable to get in: no test login or unclear steps [M10, M11].
- App icon or name infringing a trademark (don't use Instagram's logo) [M11].
- Business Verification not complete, so no Advanced Access [M1].

**TikTok**

- The website is a landing or login page, or the privacy and terms links sit
  behind a menu [T9].
- The app name references TikTok or a social media company, or just describes
  the app [T9].
- An icon that looks like an established brand [T9].
- A demo video missing a scope, or showing a different domain from the website
  URL [T9].
- Unverified URL properties. Secondary sources report this showing as an
  "Invalid Website URL" failure [S5].
- An app that reads as private or personal use [T9].
- Fake or incomplete app information [S5].

---

## 10. Singapore PDPA and MAS, briefly

**PDPA obligations** [P1]:

- consent;
- purpose limitation;
- notification;
- access and correction;
- accuracy;
- protection;
- retention limitation;
- transfer limitation (overseas transfers need comparable protection);
- data breach notification;
- accountability.

Accountability includes designating a DPO and publishing their business contact
details [P4]. Data portability was listed as not yet in effect in PDPC's May 2021
summary [P1].

**Breaches** [P2, P3]:

- A breach is notifiable if it's likely to cause significant harm, or affects 500
  or more people.
- Assess within 30 calendar days.
- Notify the PDPC no later than 3 calendar days after deciding it's notifiable.
- Notify affected individuals as soon as practicable where required.

**Penalties.** Up to the higher of S$1 million or 10% of Singapore annual turnover
since 1 October 2022, per secondary sources [P5]. **Unverified** against PDPC's own
pages.

**MAS (one line).** The MAS Guidelines on Standards of Conduct for Digital
Advertising Activities apply to financial institutions and their appointed third
parties such as finfluencers, and took effect on 25 March 2026 [X2]. Content
Studio isn't the regulated institution, but consultants using it are covered
through their FIs; the terms should say they stay responsible. The MAS page was
unavailable when checked [X1]. Secondary sources give different **issue** dates:
25 September 2025 [X3] and 17 February 2026 [X4].

---

## 11. What engineering builds

Most of this has to work **before** submission (section 0), against test accounts
in Meta development mode and TikTok sandbox. Only rollout waits for approval.
Section 11.1 is a schema change and new functions, so it needs Leo's approval.

### 11.1 Connect flow and token storage

- **Table `cs_social_connections`:**
  - columns: `user_id`, `platform`, `platform_user_id`, `username`,
    `scopes_granted`, `access_token_enc`, `refresh_token_enc`, `expires_at`,
    `refresh_expires_at`, `status` (`active` / `needs_reconnect`),
    `connected_at`, `last_refreshed_at`, `last_error`;
  - RLS on with **no client policies**: service role only;
  - the app reads a safe summary through a function that never returns tokens.
- **Encryption.** Encrypt tokens at rest, e.g. with Supabase Vault, or AES-GCM
  with a key kept as a function secret. Tokens never reach the browser and are
  never logged. [CONFIRM: choice]
- **Edge functions:**
  - `social-connect-start` (JWT required): creates a single-use `state` tied to
    the user, stored hashed with a 10-minute expiry, and returns the authorize URL.
  - `social-connect-callback`: checks `state`, exchanges the code with the secret
    and fetches the profile.
    - Instagram: swaps the short-lived token for a 60-day one [M2].
    - TikTok: stores the access and refresh tokens [T8].
    - Both: saves the connection and points the account audit at the connected
      username.
  - `social-disconnect`: revokes the TikTok token [T8], then deletes the connection
    and data read with it.
  - `instagram-data-deletion` and the deauthorize callback: see
    `docs/drafts/data-deletion.md` part 5.
- **Frontend.** Add "Connect" buttons in **Your accounts** on `/analytics`
  (`AnalyticsPage.tsx`, `AccountAudit.tsx`), connection status, "Reconnect" when a
  token dies, and the personal-account message from section 5.

### 11.2 Reading official data

- **Mapper.** Add a reader beside `scrapeAccount` in
  `supabase/functions/_shared/auditRunner.ts`. It maps official responses into the
  existing `SocialPost` and `AuditProfile` shapes (`_shared/socialAudit.ts`), so
  `computeAudit`, advice, snapshots and post ideas keep working.
- **Instagram:**
  - profile fields [M18];
  - `/me/media` fields [M5];
  - then `/{media-id}/insights`, asking only for metrics valid for that media type
    (table in section 5).
- **TikTok:** `/v2/user/info/`, then two pages of `/v2/video/list/` [T3, T5].
- **New optional fields:** `reach`, average and total watch time, and a `source` of
  `official` or `public` on the audit. The UI labels numbers "From Instagram
  insights" or "Public numbers".
- **Tests.** Unit-test the mappers with fixture JSON, plus the token-refresh
  decision logic (a pure function).

### 11.3 Refresh job

- **Extend the existing hourly cron** (`refresh-social-audits`,
  `supabase/hub/005_social_audits.sql`) to use tokens for connected accounts.
- **Instagram.** Refresh the long-lived token once it's over 24 hours old and
  within about 10 days of expiring [M2].
- **TikTok.** Refresh the access token before its 24 hours run out, and always save
  the rotated refresh token [T8].
- **On failure.** If a refresh fails (revoked, expired, or scopes removed), mark the
  connection `needs_reconnect` and show "Reconnect".
- **Rate limits.** Respect them: Instagram `X-Business-Use-Case-Usage` [M15];
  TikTok 429s [T6].

### 11.4 What switches from scraping to official data

| Feature | Today | After rollout |
| --- | --- | --- |
| Account audit (`audit-social-account`, `refresh-social-audits`, `auditRunner.scrapeAccount`) | Apify public scrape | Official APIs for connected accounts. Apify stays as a fallback for unconnected accounts, or is retired. [CONFIRM: decision] |
| Audit history (`cs_social_snapshots`) | Followers, median views, engagement | Add median reach and watch time (schema change) |
| Post ideas (`suggest-post-ideas`) | Built from scraped posts | Same code; it gains reach, saves and watch time through `posts` |
| Manual metrics on `/analytics` and `/drafts` (`docs/analytics-integration.md`) | Typed in by hand | Pre-filled from official data for matching posts |
| Profiles page creator lookups (`analyze-ig-creator`) | Public data on other creators | **Unchanged.** These logins only read the connected user's own account. |

**Rollout after approval:** switch the Meta app to Live [M17], confirm TikTok
production is approved, turn on the feature for all consultants, and update
`docs/account-audit.md` and `docs/analytics-integration.md`.

---

## 12. Open items [CONFIRM]

1. Whether TikTok URL-prefix verification works on `consultant-content-studio.vercel.app`, or a custom domain is needed.
2. The Meta dashboard use case name for Instagram API with Instagram Login.
3. Whether a terms of service URL is required or optional for Meta.
4. The Instagram tester invite path (third-party source only).
5. How to create a dedicated reviewer account in the shared Academy sign-in.
6. Which TikTok portal product adds `user.info.profile` and `user.info.stats`.
7. Whether TikTok Login Kit for web requires or supports PKCE.
8. Whether TikTok requires redirect URIs to be on a verified URL property.
9. Meta's Singapore document list for Business Verification.
10. Whether Meta and TikTok charge anything, and the current ACRA business profile price.
11. The Instagram data deletion request URL and deauthorize callback field names, and whether Instagram Login uses the same `signed_request` format.
12. Instagram's in-app menu path to switch to a professional account, and what its login screen shows for personal accounts.
13. The token encryption method.
14. Whether Apify stays as a fallback after rollout.
15. The lawyer review budget.

## Sources

All accessed 15 September 2026. **M** = Meta official, **T** = TikTok official,
**P** = PDPC, **X** = MAS or about MAS, **S** = secondary (not official;
treat as unverified).

- [M1] Meta, Overview of the Instagram Platform: https://developers.facebook.com/docs/instagram-platform/overview
- [M2] Meta, Business Login for Instagram: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- [M3] Meta, IG Media Insights reference: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
- [M4] Meta, Instagram account insights reference: https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights
- [M5] Meta, IG Media reference: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media
- [M6] Meta, Instagram Platform Insights guide: https://developers.facebook.com/docs/instagram-platform/insights/
- [M7] Meta, Graph API v22.0 changelog: https://developers.facebook.com/docs/graph-api/changelog/version22.0/
- [M8] Meta, Graph API v21.0 changelog: https://developers.facebook.com/docs/graph-api/changelog/version21.0/
- [M9] Meta, Permissions reference: https://developers.facebook.com/docs/permissions
- [M10] Meta, Instagram Platform App Review: https://developers.facebook.com/docs/instagram-platform/app-review
- [M11] Meta, App Review submission guide: https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide
- [M12] Meta, Business Verification: https://developers.facebook.com/docs/development/release/business-verification
- [M13] Meta, Data Deletion Callback: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
- [M14] Meta Platform Terms: https://developers.facebook.com/terms/dfc_platform_terms/
- [M15] Meta, Graph API rate limiting: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- [M16] Meta, Data Use Checkup: https://developers.facebook.com/docs/development/maintaining-data-access/data-use-checkup
- [M17] Meta, App modes: https://developers.facebook.com/docs/development/build-and-test/app-modes
- [M18] Meta, IG User reference: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/
- [T1] TikTok, Display API overview: https://developers.tiktok.com/doc/display-api-overview
- [T2] TikTok, API scopes: https://developers.tiktok.com/doc/tiktok-api-scopes
- [T3] TikTok, Get user info: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
- [T4] TikTok, Video object: https://developers.tiktok.com/doc/tiktok-api-v2-video-object
- [T5] TikTok, List videos: https://developers.tiktok.com/doc/tiktok-api-v2-video-list
- [T6] TikTok, Rate limits: https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit
- [T7] TikTok, Login Kit for web: https://developers.tiktok.com/doc/login-kit-web
- [T8] TikTok, Manage user access tokens: https://developers.tiktok.com/doc/oauth-user-access-token-management
- [T9] TikTok, App review guidelines: https://developers.tiktok.com/doc/app-review-guidelines
- [T10] TikTok, Register your app: https://developers.tiktok.com/doc/getting-started-create-an-app
- [T11] TikTok, Add a sandbox: https://developers.tiktok.com/doc/add-a-sandbox
- [T12] TikTok, App review FAQ: https://developers.tiktok.com/doc/getting-started-faq
- [T13] TikTok, Login Kit overview: https://developers.tiktok.com/doc/login-kit-overview
- [T14] TikTok, Display API get started: https://developers.tiktok.com/doc/display-api-get-started
- [T15] TikTok Developer Terms of Service: https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- [T16] TikTok, Developer guidelines: https://developers.tiktok.com/doc/our-guidelines-developer-guidelines
- [P1] PDPC, Data Protection Obligations under the PDPA (PDF, correct as of May 2021): https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/resource-for-organisation/data-protection-obligations-under-the-pdpa.pdf
- [P2] PDPC, Guide on Managing and Notifying Data Breaches under the PDPA (15 March 2021): https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/other-guides/guide-on-managing-and-notifying-data-breaches-under-the-pdpa-15-mar-2021.pdf
- [P3] PDPC, Report your organisation's data breach: https://www.pdpc.gov.sg/report-data-breach
- [P4] PDPC, Data Protection Obligations page (the page body didn't render; content seen in a search excerpt): https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act/data-protection-obligations
- [P5] (secondary) Raffles Corporate Services, PDPA breach notification 2026: https://rafflescorporateservices.com/mandatory-data-breach-notification-pdpa-singapore-2026/
- [X1] MAS, Guidelines on Standards of Conduct for Digital Advertising Activities (unavailable when fetched): https://www.mas.gov.sg/regulation/guidelines/guidelines-on-standards-of-conduct-for-digital-advertising-activities
- [X2] (secondary) Linklaters: https://financialregulation.linklaters.com/post/102l7qp/singapore-mas-introduces-comprehensive-framework-to-promote-responsible-online-f
- [X3] (secondary, search excerpt) Global Compliance News / Baker McKenzie: https://www.globalcompliancenews.com/2025/10/22/https-insightplus-bakermckenzie-com-bm-financial-institutions_1-singapore-mas-issues-guidance-on-responsible-digital-financial-advertising-and-content-creation_13102025/
- [X4] (secondary) iCOMPASS: https://icompass.ai/new-mas-guideline-on-standards-of-conduct-for-digital-advertising-activities-to-take-effect-from-25-march-2026/
- [S1] (secondary) Meta Business Verification documents: https://saveoffice.io/blog/meta-business-verification-documents and https://support.wati.io/en/articles/11463208-meta-business-verification-required-documents-by-country (Meta's own page, https://www.facebook.com/business/help/159334372093366, wouldn't load)
- [S2] (secondary) Verbb, Instagram provider setup (tester invites): https://verbb.io/craft-plugins/social-login/docs/providers/instagram
- [S3] Meta for Business, verification for advertisers targeting Singapore (search excerpt): https://www.facebook.com/business/news/new-verification-requirements-for-all-advertisers-targeting-singapore
- [S4] Instagram Help Centre, set up a professional account (search excerpt only): https://help.instagram.com/502981923235522
- [S5] (secondary) PostZen, TikTok "Invalid Website URL": https://www.postzen.dev/blog/tiktok-api-invalid-website-url; TikTok URL-properties details also seen only in search excerpts of developers.tiktok.com
- [S6] (secondary) Meta App Review rejection guides: https://woopsocial.com/blog/meta-app-review-rejected-2026-fix-guide and https://www.saurabhdhar.com/blog/meta-app-approval-guide
- OpenAI, data controls (used in the privacy draft): https://developers.openai.com/api/docs/guides/your-data
- Vercel, Web Analytics privacy (used in the privacy draft): https://vercel.com/docs/analytics/privacy-policy
- Apify, storage retention (used in the drafts): https://docs.apify.com/platform/storage/usage
