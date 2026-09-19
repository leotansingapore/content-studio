# Content Studio Privacy Policy

> **DRAFT: not reviewed by a lawyer; do not publish until Leo approves**
>
> Written on 15 September 2026 from the code in `leotansingapore/content-studio`
> (main at `165b98d`). Everything below describes what the app actually does
> today, except the sections marked **Planned**, which describe the Instagram
> and TikTok connections that are not built yet. Resolve every
> `[CONFIRM: …]` before publishing. Meta and TikTok reviewers read this page, so
> a version that includes the Planned sections must be live at a public URL
> before either app is submitted (see `docs/social-api-app-review.md`).

**Last updated:** [DATE]

## 1. Who we are

Content Studio ("we", "us") is a web app that helps insurance and financial
consultants in Singapore plan, write and review social media content. It is run
by **[COMPANY NAME]** (UEN [UEN]), [REGISTERED ADDRESS], Singapore.

Our Data Protection Officer (DPO) is **[DPO NAME]**, reachable at
**[DPO EMAIL]**. Contact the DPO about anything in this policy.

This policy covers the Content Studio web app at
https://consultant-content-studio.vercel.app, including the Members Hub and the
public roadmap page. [CONFIRM: final domain, if the app moves off vercel.app]

## 2. The short version

- We collect what you type into the studio, your sign-in details, and, if you
  use the account audit, public numbers about the Instagram or TikTok account
  you name.
- We use it to run the features you use. Some of it is sent to AI providers to
  write drafts, advice and post ideas.
- We don't sell your personal data. We don't use it for advertising.
- Our service providers (hosting, database, AI, payments, scraping) process data
  for us, some of them outside Singapore.
- You can ask to see, correct or delete your data at any time. See section 9 and
  our [data deletion page](DATA-DELETION-URL).

## 3. What we collect and why

### 3.1 Your account

| What | Why |
| --- | --- |
| Email address and password | To sign you in. Sign-in is handled by our database provider, Supabase (Supabase Auth). |
| Your name, if your account has one | To show your name in the in-app assistant and on feedback you post. |
| Sign-in session | Kept in your browser so you stay signed in. |

Content Studio uses the same sign-in as [ACADEMY NAME]: the sign-in page asks for
your Academy email and password. [CONFIRM: which company operates the shared
Academy sign-in, and whether the Academy has its own privacy policy to link to]

### 3.2 What you create in the studio

Everything you create is saved in your browser first and copied to our database
so it follows you across devices. This includes:

- drafts and posting history, including any post numbers (views, reactions,
  comments, shares) you type in;
- content plans, the calendar and the pipeline board;
- coach and diagnosis answers;
- positioning and brand worksheets (F.A.D.S.), including AI-polished versions;
- sample posts you give for your writing voice, and the AI voice summary;
- saved items, writing preferences, Academy and tutorial progress;
- the social media handles you enter for LinkedIn, TikTok, Instagram and
  Facebook.

**Why:** to provide the features and keep your work in sync between devices.

### 3.3 Your account audit (Instagram and TikTok)

If you enter an Instagram or TikTok handle on the Analytics page, we build an
"account audit" for it.

**What we read today.** We use Apify, a third-party service, to read the
account's **public** profile and its 30 most recent public posts. We do not log
in to your account and we can't see anything that isn't public. We don't
currently check that the handle you enter belongs to you, so please only enter
your own account. [CONFIRM: add "only audit your own account" to the Terms]

| What we store | Details |
| --- | --- |
| The handle | One per platform. Entering a new handle replaces the old audit. |
| Public profile details | Display name, bio, follower count, post count, verified badge, whether the account is private. |
| Up to 30 recent public posts | Link, format (video, carousel or image), caption, date posted, views, likes, comments, and shares, saves and video length where the platform shows them publicly. Also whether each post is pinned or a collab. |
| Our analysis | Each post's result compared with the account's usual, summary statistics, and written advice. |
| History | One set of summary numbers per refresh (followers, posts analysed, median views, median engagement rate, posts per week), so we can show changes over time. |
| Refresh log | When each refresh ran and whether you opened the page or the weekly update started it. We use it to cap refreshes at 6 a day. |
| Post ideas | Ideas we suggested for your account, and whether you used or skipped each one. |

**How it refreshes.** When you open Analytics, the audit refreshes if it is 20
or more hours old. It also refreshes weekly, but only if you opened it in the
last 30 days.

**Why:** to show what's working on your account and suggest what to post next.

### 3.4 Connected Instagram and TikTok accounts (Planned)

> Publish this section only when the connection feature ships.
> [CONFIRM: final list of fields and metrics once engineering builds it]

You'll be able to connect your own Instagram professional (Business or Creator)
account or TikTok account through the platform's official login. When you
connect, you choose to share this data with us, and we read it through the
official APIs instead of scraping:

**Instagram** (via the Instagram API with Instagram Login):

- your Instagram account ID, username, account type, and profile details such as
  follower and post counts;
- your posts: caption, media type, link, date posted, like and comment counts,
  and Reels view counts;
- insights for each post: views, reach, saves, shares, likes, comments, total
  interactions and, for Reels, average and total watch time;
- account insights such as views, reach and follower count.

**TikTok** (via TikTok Login Kit and the Display API):

- your TikTok ID, display name and profile picture;
- your bio, profile link, username and verified status;
- your follower, following, likes and video counts;
- your public videos: title, description, date posted, length, cover image link,
  share link, and view, like, comment and share counts.

**Access tokens.** The platform gives us an access token so we can read this data
again later. Tokens are stored encrypted on our servers and are never sent to
your browser.

**What we don't do with it.** We only read. We never post, comment or send
messages for you. We don't sell this data or use it for advertising, and we only
share it with the service providers in section 5 to run Content Studio.
[CONFIRM: Meta Platform Terms and TikTok Developer Terms allow sending this data
to OpenAI as a service provider for audit advice; check before launch]

**Why:** to give you real reach, saves, views and watch time in your audit and
analytics, which public data can't show.

### 3.5 Members Hub and payments

| What | Why |
| --- | --- |
| Membership status, industry, and subscription end date | To give members access to Hub guides and trend drops for their industry. |
| Stripe customer ID and subscription ID | To link your membership to your subscription. |
| Your email and account ID, sent to Stripe at checkout | So Stripe can create your subscription and tell us when it is paid. |

Card details are entered on Stripe's checkout page and handled by Stripe. We
never see or store your full card number.

**Hub clients.** If you're a Hub client, we keep your email, client name, niche
and brand notes on an access list. We use them to give you access and to write
trend ideas tailored to your brand. Those notes are sent to Anthropic (Claude)
to draft your tailored ideas. [CONFIRM: the hub trend scout still runs this way]

### 3.6 The in-app assistant, feedback board and public roadmap

The in-app assistant ("Ask"), the feedback page and the public roadmap run on a
separate feedback service we operate (leotan-feedback.vercel.app).

- **Assistant chats:** your recent messages (up to the last 12), the page you
  were on, a conversation ID and your name are sent to the service to get an
  answer. Your last 20 messages are also kept in your browser.
  [CONFIRM: whether the assistant uses an AI provider, and which one]
- **Feedback, comments and support messages:** what you write, plus your name and
  email.
- **Votes:** your account ID is used as your voter ID. Visitors who aren't signed
  in get a random ID stored in their browser.

[CONFIRM: where the feedback service stores this data and for how long]

**Why:** to answer questions, collect feature requests and bug reports, and
reply to you.

### 3.7 Crash reports and usage limits

- **Crash reports:** if the app hits an error while you're signed in, it sends
  the error message and technical trace, the page path, the app version, your
  browser type and your account ID. We send at most 5 reports per page load.
  **Why:** to find and fix bugs.
- **Usage counts:** we count how many times a day you use certain paid AI and
  account-audit features. **Why:** to keep costs fair with daily limits.

### 3.8 Website analytics, hosting and fonts

- **Vercel Web Analytics** records page views: the page address, where you came
  from, country and city-level location, and your device, operating system and
  browser. Vercel says it uses no third-party cookies and doesn't identify
  individual visitors. It recognises a visit by a hash of the request, which is
  discarded after 24 hours.
- **Hosting.** Our host (Vercel) and database provider (Supabase) receive your IP
  address and standard request information when you use the app, and may keep
  it in server logs. Some server logs include the handle being audited.
  [CONFIRM: log retention periods for Vercel and Supabase]
- **Fonts.** The app loads fonts from Google Fonts, so Google receives your IP
  address when a page loads.

### 3.9 What's stored in your browser

We use your browser's local storage instead of advertising cookies. It holds your
sign-in session, your studio work (section 3.2), a list of changes waiting to
sync, and assistant and feedback settings. A short-lived session value helps the
app reload itself after an update. Signing out keeps your saved work on that
device; clear your browser's site data to remove it.
[CONFIRM: no cookies are set by the app or its providers]

### 3.10 Public content from other creators

To give you examples, Content Studio shows public posts, captions and profile
details from other creators, mostly in Singapore. You can also look up the
public profile of another Instagram creator. If you're a creator and want your
content removed, contact our DPO. [CONFIRM: what the `analyze-ig-creator`
function stores about looked-up profiles; it is not in this repository]

## 4. How we use AI

Some features send your content to AI providers to generate text:

| Feature | What is sent | Provider |
| --- | --- | --- |
| Account audit advice and post ideas | Handle, display name, bio, statistics, your posts' captions and numbers, and ideas already suggested | OpenAI (GPT-4.1) |
| Writing tools (hooks, posts, hashtags, image prompts, voice summary) | What you type and choose in the writer, and your sample posts | [CONFIRM: provider used by `generate-social-content`] |
| F.A.D.S. brand template and polishing | Your worksheet answers | OpenAI [CONFIRM: from a code comment; function not in this repository] |
| Hub client trend ideas | Client name, niche, brand notes | Anthropic (Claude) [CONFIRM] |

OpenAI says data sent to its API is not used to train its models unless the
customer opts in, and is kept for up to 30 days for abuse monitoring. AI output
can be wrong. Check every draft before you post it.

## 5. Who we share data with

We share personal data only with service providers that help us run Content
Studio, when the law requires it, or with your consent.

| Provider | What they do for us | Where [CONFIRM] |
| --- | --- | --- |
| Supabase | Sign-in, database, server functions | [CONFIRM: project region] |
| Vercel | Hosting, web analytics, the feedback service | [CONFIRM] |
| OpenAI | AI advice, ideas and writing | United States [CONFIRM] |
| Anthropic | AI trend ideas for Hub clients | United States [CONFIRM] |
| Apify | Reading public Instagram and TikTok data | [CONFIRM] |
| Stripe | Payments and subscriptions | [CONFIRM] |
| Google | Web fonts | [CONFIRM] |
| Meta and TikTok (Planned) | We read your data from them when you connect an account | n/a |

We don't sell personal data. [CONFIRM: data processing terms are in place with
each provider]

## 6. Transfers outside Singapore

Some providers store or process data outside Singapore. When that happens, we
take steps so your data gets a standard of protection comparable to the PDPA,
such as contractual safeguards with the provider. [CONFIRM: safeguards relied on]

## 7. How long we keep data

| Data | How long |
| --- | --- |
| Account and studio work | Until you delete it or ask us to delete your account. |
| Account audit, history and post ideas | Until you stop auditing the account, change the handle, or delete your account. Audits you haven't opened for 30 days stop refreshing but stay stored. [CONFIRM: add automatic deletion after a set period of inactivity] |
| Refresh log and usage counts | Until you delete your account. [CONFIRM: add a fixed period] |
| Crash reports | No automatic deletion yet. When your account is deleted, reports stop being linked to you. [CONFIRM: set a period, e.g. 90 days] |
| Membership records | While you're a member, then as long as needed for accounting and legal purposes. [CONFIRM] |
| Payment records at Stripe | As Stripe and the law require. |
| Scrape results at Apify | According to our Apify plan's data retention setting. [CONFIRM: setting] |
| Data sent to OpenAI | Up to 30 days, per OpenAI. |
| Connected-account data and tokens (Planned) | Until you disconnect, revoke access in Instagram or TikTok, or ask for deletion. Then deleted within [X] days. [CONFIRM] |

## 8. How we protect data

- Our database only lets a signed-in user read their own rows.
- Audit results and post ideas are written only by our server functions.
- API keys for our AI, scraping and payment providers are kept on the server,
  never in the app you load.
- The app and its providers use encrypted HTTPS connections.
- Planned: platform access tokens will be encrypted and kept server-side only.

No system is perfectly secure. Tell our DPO straight away if you think your
account has been compromised.

## 9. Your choices and rights

Under Singapore's Personal Data Protection Act (PDPA) you can:

- **Access** your personal data, and find out how it has been used or disclosed
  in the past year.
- **Correct** errors in your personal data.
- **Withdraw consent** to our collecting, using or disclosing your data. We'll
  explain what that means for your use of Content Studio. Some features won't
  work without the data they need.
- **Ask us to delete** your data. See our [data deletion page](DATA-DELETION-URL).

**To make a request**, email [DPO EMAIL] from the email address you sign in with.
We may need to confirm your identity first. We aim to respond within [30] days.
[CONFIRM: response target]

**Things you can do yourself:**

- Stop auditing an account: on Analytics, use the bin icon ("Stop auditing") on
  the audit. This deletes the audit, its history and its post ideas.
- Clear your F.A.D.S. answers with the start-over option in F.A.D.S.
- Disconnect Instagram or TikTok in Content Studio, or revoke access in the
  Instagram or TikTok app (Planned).

## 10. Instagram and TikTok (Planned)

- Connecting is optional. The account audit can still use public data.
- Instagram connections work only with **professional (Business or Creator)**
  accounts. Instagram's API doesn't support personal accounts.
- You can revoke our access at any time in your Instagram or TikTok settings.
  [CONFIRM: menu paths in each app at launch]
- Meta's Privacy Policy: https://www.facebook.com/privacy/policy/ and TikTok's
  Privacy Policy: https://www.tiktok.com/legal/privacy-policy explain how those
  platforms handle your data. [CONFIRM: links]

## 11. Children

Content Studio is for working financial consultants. It is not meant for anyone
under [18]. [CONFIRM: minimum age]

## 12. Data breaches

If a data breach is likely to cause significant harm, or affects 500 or more
people, we will notify the Personal Data Protection Commission within 3 calendar
days of confirming that. Where required, we will also notify affected people as
soon as practicable.

## 13. Regulated financial content

Content Studio helps you draft content; it doesn't give financial advice and
doesn't review your posts for regulatory compliance. Some AI suggestions are
screened against basic wording rules, but that isn't a compliance check. You
remain responsible for following your financial institution's rules and MAS
requirements, including the MAS Guidelines on Standards of Conduct for Digital
Advertising Activities.

## 14. Changes to this policy

When we change this policy we'll update the date at the top. We'll tell you in
the app before any change that affects how your data is used.

## 15. Contact

[COMPANY NAME], [REGISTERED ADDRESS], Singapore.
Data Protection Officer: [DPO NAME], [DPO EMAIL].

You can also contact the Personal Data Protection Commission (www.pdpc.gov.sg).
