# Post to a Telegram group or channel

`publish-telegram` | publish | phase 7 | status: missing | /north-star#publish-telegram

## Leo asked

27 Oct 2026: "make it easy for one to also connect telegram bot through whatever".

## The bar

Connecting a Telegram group or channel takes one tap in Content Studio and four in Telegram, and nobody types a token or copies a code. Within 5 seconds of the last tap the app reads "Connected to {name}". From then on the chat is a place to post like any network: it sits in Channels, it is a row in the schedule steps, posts go out between 9am and 9pm Singapore time, and Disconnect takes the bot back out.

## How the best do it

Fastlane has no Telegram. Its "Schedule post" step 1 lists Instagram, LinkedIn and TikTok only (notes-2.md F14).

![Fastlane 1:56](../../../public/north-star/fastlane/t116.webp)

Tools that post to Telegram:

- Publer makes you add its bot yourself. "Regardless if you're adding a Group or a Channel, you need to make Publer Bot an admin": search `publr_bot` under Members or Administrators, confirm the rights, then paste the chat's username or invite link into Social Accounts > Telegram. A private chat needs the bot's invite link, which "only the owner" can see. In a group the post shows the bot's name; in a channel it shows "on behalf of the Channel" with "no reference to Publer". "Telegram does not provide any insights", and daily post limits apply. [Publer help](https://publer.com/help/en/article/how-to-connect-telegram-xp1zpl)
- Zernio, our own publisher, already does Telegram with its bot `@ZernioScheduleBot`. `GET /v1/connect/telegram?profileId=` returns a code valid 15 minutes and these steps: "1. Add @ZernioScheduleBot as an administrator in your channel/group", "2. Open a private chat with @ZernioScheduleBot", "3. Send: ZRN-ABC123 @yourchannel", and for a chat with no username, "forward a message from it along with the code". The app polls `PATCH /v1/connect/telegram?code=` (every 3 s) until `connected`, which returns `chatId`, `chatTitle`, `chatType` and an account id. Group posts show as "ZernioScheduleBot", which cannot be changed, and the post fields (`parseMode`, `disableWebPagePreview`, `disableNotification`, `protectContent`) carry no topic; text runs to 4,096 characters and captions to 1,024. [connect](https://docs.zernio.com/platforms/telegram/connect.mdx), [posts](https://docs.zernio.com/platforms/telegram/posts.mdx), [fields](https://docs.zernio.com/platforms/telegram/fields.mdx), [limits](https://docs.zernio.com/platforms/telegram/reference.mdx). A Telegram chat counts as a connected account: US$6 a month each for accounts 3 to 10 ([pricing](https://docs.zernio.com/pricing.mdx)).
- PostFast has you add `@postfastapp_bot` with "Post Messages" and "Edit Messages" on a channel, while in a group "the bot only needs admin status to post", and it finds a private chat from a pasted message link such as `https://t.me/c/1234567890/5`. [PostFast help](https://help.postfa.st/telegram/connect-telegram-channel-or-group)
- Postiz (self-hosted) wants your own bot from BotFather in `TELEGRAM_TOKEN`, made an admin. It reads updates by long polling, so "use one bot token per deployment"; two instances on one token get `409 Conflict`. [Postiz docs](https://docs.postiz.com/providers/telegram.md)
- Zapier: paste a bot token from BotFather's `/token`; the Chat ID dropdown "only shows active chats or channels from the past 24 hours", so you send a message first and press Load More. [Zapier help](https://help.zapier.com/hc/en-us/articles/16700016131085-How-to-get-started-with-Telegram-on-Zapier). Make: "/newbot", copy the token, paste it into a Telegram Bot connection. [Make](https://apps.make.com/telegram)
- No Telegram at all: Buffer's 12 channels ([publish](https://buffer.com/publish), [supported channels](https://support.buffer.com/en-us/articles/supported-channels-LM3P7Y4zsp)), Hootsuite's networks ([FAQ](https://www.hootsuite.com/faq)), Metricool's 15 connections ([help](https://help.metricool.com/how-to-connect-social-media-and-ad-platforms-to-metricool-qrkvn)) and Later's 8 platforms ([help](https://help.later.com/hc/en-us/articles/360060842914-Supported-Social-Platforms-Post-Types)). SocialBee lists Telegram under Universal Posting, a phone reminder to "copy your caption and download your media" and post it yourself ([SocialBee](https://socialbee.com/universal-posting/)).

Telegram's own pieces (read 27 Oct 2026):

- Bot links: `t.me/<bot>?startgroup=<parameter>&admin=<rights>` opens a group picker; `t.me/<bot>?startchannel&admin=<rights>` opens a channel picker, where `admin` is required and there is no parameter. Rights are joined with `+`, such as `post_messages`, `edit_messages`, `delete_messages`, `manage_topics`. A group parameter is up to 64 base64url characters. [links](https://core.telegram.org/api/links)
- `t.me/<bot>?start=<code>` opens a private chat and the bot receives `/start <code>`; `A-Z, a-z, 0-9, _ and -`, up to 64 characters. With `startgroup` the bot gets `/start@<bot> <code>` posted in the group, where every member sees it. [deep linking](https://core.telegram.org/bots/features#deep-linking)
- A reply keyboard button with `request_chat` (`KeyboardButtonRequestChat`: `chat_is_channel`, `chat_is_forum`, `user_administrator_rights`, `bot_administrator_rights`, `request_title`, `request_username`) opens Telegram's own chat picker. "The bot will be granted requested rights in the chat if appropriate", and the bot gets a `chat_shared` message with the chat id and title. [Bot API](https://core.telegram.org/bots/api#keyboardbuttonrequestchat)
- `setWebhook` takes a `secret_token` sent back in `X-Telegram-Bot-Api-Secret-Token`. "You will not be able to receive updates using getUpdates for as long as an outgoing webhook is set up." [setWebhook](https://core.telegram.org/bots/api#setwebhook)
- `message_thread_id` sends into a forum topic. The Bot API can create, edit and close topics but has no method that lists them. [Bot API](https://core.telegram.org/bots/api#sendmessage)
- Files by URL: "5 MB max size for photos and 20 MB max for other types of content"; by upload, 10 MB and 50 MB. [sending files](https://core.telegram.org/bots/api#sending-files)
- Limits: in one chat, about one message a second; "In a group, bots are not be able to send more than 20 messages per minute." Sending stays free below about 30 messages a second. [bots FAQ](https://core.telegram.org/bots/faq)

Mobbin (searched 27 Oct: flows "connect Telegram account" on web, screens "connect Telegram integration settings screen in a SaaS app", flows "add a bot to a group chat" on iOS) has Telegram's own sign-in and channel flows but no scheduler's Telegram connect. The nearest patterns: Outseta's Integrations row "Discord / Add the Outseta bot to your Discord server" with Configure ([Mobbin](https://mobbin.com/screens/68e8f72b-42a7-475e-9ac1-3080c627311b)), and Laravel Cloud's "Connect a Slack workspace / Select a workspace to send notifications to." ([Mobbin](https://mobbin.com/screens/e580c974-e9e6-4c4a-9716-a3d7140eaab3)). Both start from one button and let the other app's own picker choose the place.

What the best get wrong for "easy for one": every one of them makes you find the bot, promote it by hand, then copy something back (a username, an invite link, a code with `@yourchannel`, a token). Telegram's `request_chat` picker removes all three steps, and none of them uses it.

## What we have today

Checked 27 Oct against 9ec351aa.

- Nothing in the app connects a Telegram chat or posts to one. `/accounts` (`src/pages/AccountsPage.tsx`, `src/lib/socialConnect.ts`) connects six Zernio networks; `SOCIAL_PLATFORMS` in `supabase/functions/_shared/zernio.ts` is instagram, facebook, tiktok, linkedin, youtube, threads, and `social` refuses anything else with "That platform can't be connected here." (`supabase/functions/social/logic.ts`).
- The Channels block (`src/components/ChannelsBlock.tsx`) draws the open brand's accounts from the cache `socialStatus` keeps (`cs-social-channels-<uid>`), with icons for the six networks and "Connect a channel" to /accounts.
- The schedule steps (`src/components/ScheduleSteps.tsx`) list networks from `SOCIAL_PLATFORMS` and post through Zernio (`supabase/functions/social/posts.ts`).
- The calendar knows the word: `PLATFORM_LABEL.telegram` and `/calendar?platform=telegram` (`src/pages/CalendarPage.tsx`) show Leo's team posts (`src/lib/teamPosts.ts`: FINTERNSHIP FASTRACK, AdvisorOS) and the MoneyBees channel feed (`src/lib/channelFeeds.ts`). Jobs on Leo's Mac write both; the app only reads them and writes his reviews (`content-studio-teamreviews-<uid>`, `content-studio-channelreviews-<uid>`).
- Leo's sending today: `~/.local/bin/team-posts publish` sends approved posts at 10:00 through @leotanclaudebot with `sendPhoto` and `sendMessage`, `message_thread_id` set to FASTRACK's topic 3768 or AdvisorOS's topic 326 (both are forum supergroups). Its token sits in `~/.claude/channels/telegram/.env` on Leo's Mac, read fresh for every call. The Claude Code Telegram plugin and `team-posts poll` read that same bot's updates with getUpdates, while `team-posts reply` acts on Leo's replies.
- Nothing in `supabase/` stores a Telegram chat, token or post: the only matches are `link-in-bio`'s list of preview bots and `writing-judge`'s check for a Telegram link in a bio.
- Sending hours exist elsewhere but on no posting path: the WhatsApp numbers hold first messages and broadcasts to 09:00 to 21:00 (memory `wa-sending-hours-default`), and the phone alerts here promise "At most one a day, 9am to 9pm." (`src/components/NotifySettings.tsx`).

## Build

### Recommended design

One Content Studio bot that everyone shares, connected through Telegram's own chat picker:

1. On /accounts (and in the schedule steps' Telegram row) the person taps "Connect Telegram". The `telegram` function makes a one-time code and the browser opens `t.me/<bot>?start=<code>`.
2. In Telegram they tap Start. The bot ties their Telegram user to the code and answers with two buttons, "Pick a group" and "Pick a channel" (`request_chat`, bot asked in as an admin; for a channel with `can_post_messages`).
3. They pick the chat in Telegram's picker and confirm adding the bot. Telegram sends the hook `chat_shared` and `my_chat_member`; the hook checks the bot can post there and the person is an admin of it, then ties the chat to their brand.
4. The page has been reading that row every 3 s, so "Connected to {name}." shows at once and the chat joins Channels and the schedule steps; a forum group posts to General until the person sends `/here` in a topic.
5. Posts wait in a queue for 9am to 9pm, and Disconnect makes the bot leave.

Nothing shows in the group except Telegram's own "X added Content Studio" line, because the whole exchange happens in the private chat. The bot's reply also carries two plain links for an app where the buttons do not show: `t.me/<bot>?startgroup&admin=<group rights>` and `t.me/<bot>?startchannel&admin=post_messages`. The tie rule is the same for every path: inside a started, unexpired connect, the first chat that same Telegram user shares or makes the bot an admin of is the one tied.

Gate: `useLeoOnly()` hides the Telegram card, the row in the steps and the Channels entry; the `telegram` function answers 404 `{enabled:false}` unless `TELEGRAM_BOT_TOKEN` is set and the caller is in `NORTH_STAR_USERS` (`isAllowed`).

### Alternatives

| Option | What it costs | Risk |
| --- | --- | --- |
| A. Through Zernio (`@ZernioScheduleBot`) | No schema change and the smallest build: add `telegram` to the allowlist, a code panel that polls, Telegram's caption rules. US$6 a month per chat in our band, on the Zernio bill. | Group posts read "ZernioScheduleBot". No topic, so Leo's two groups would get General. The person still types "code @channel" in a DM, or forwards a message for a private chat. Zernio's direct connect (`POST /v1/connect/telegram` with a chat id) must never be reachable from a request: any chat where Zernio's bot is an admin, another Zernio customer's too, could be claimed. |
| B. Bring your own bot token (Zapier, Make, Postiz) | A token per person stored server-side (its own column or Vault entry, so a schema change too) and a chat finder. | Making a bot in BotFather is the step most people would give up on, and a leaked token posts as them. A webhook on their bot would also stop whatever else reads its updates, which on @leotanclaudebot means the Claude Code plugin and `team-posts poll`. |
| C. A topic picker beyond `/here` | Small: the app takes a link to any message in the topic (`t.me/c/<id>/<topic>/<msg>`) and checks the chat matches; or the hook records topics it sees (`forum_topic_created`). | The Bot API cannot list a forum's topics, so a list is only ever partial; a pasted link names the topic by number, not name. |

Recommended: the design above. A is the fallback if Leo says no to the schema change, with its three costs said to him first.

Left out of the first build: editing or deleting a sent message, videos over 20 MB, polls, link-preview switches, silent sends, analytics (the Bot API has none).

### Screens and states

/accounts, Leo only, a Telegram card after the six networks (`#telegram`):

```
Telegram (#telegram)
  AdvisorOS          Group, topic: Feature updates   Working   [Disconnect]
  MoneyBees          Channel                          Working   [Disconnect]
  [Add another Telegram chat]
```

- No chat yet: the card holds one button, "Connect Telegram".
- Waiting (a started connect): the button turns into "Open Telegram" (the `t.me` link, opened again if the tab was blocked), with "In Telegram, tap Start, then pick your group or channel." and a live "Waiting for Telegram..." line. The page reads its own row every 3 s while the tab is visible, for up to 15 minutes. A reload resumes from the newest unexpired row.
- Connected: a green line "Connected to {name}." For a forum group, a second line: "Posts go to General. To post in a topic, open it in Telegram and send /here." If the connect started in the schedule steps, "Back to your post" as on today's Zernio return (`cs-connect-return`).
- Expired (15 minutes): "That link expired." with "Connect Telegram" again.
- Refused: "{name} isn't connected: the bot needs to be an admin that can post there." or "{name} isn't connected: only an admin of it can connect it."
- Removed in Telegram (the bot was kicked or lost its posting right): the row reads "Removed in Telegram" or "Can't post here", its waiting posts are cancelled with that reason, and "Connect again" restarts.
- A group that turns into a supergroup moves its new chat id onto the same row (`migrate_to_chat_id`).

The schedule steps (Where): a Telegram row lists the brand's connected chats with a tick each, or "Connect Telegram" when there are none. When: a Telegram pick outside 9am to 9pm reads "Telegram posts go out between 9am and 9pm. This one goes at 9am." Caption: a Telegram tab, 4,096 characters for text alone and 1,024 for a caption; a longer text with pictures goes as the pictures, then the text as a second message (as `team-posts publish` does). One to ten pictures go as one album; one video up to 20 MB.

After sending: the chip on the post reads "Posted" with a link to the message (`t.me/<username>/<id>` for a public chat, `t.me/c/<id>/<topic>/<msg>` or `t.me/c/<id>/<msg>` for a private one), "Held until 9am", "Failed" with Telegram's reason in plain words, or "Cancelled".

In Telegram (the bot's words): see Copy.

### Copy

App:
- "Connect Telegram", "Add another Telegram chat", "Open Telegram", "Connect again", "Disconnect"
- "In Telegram, tap Start, then pick your group or channel."
- "Waiting for Telegram..."
- "Connected to {name}."
- "Posts go to General. To post in a topic, open it in Telegram and send /here."
- "That link expired."
- "{name} isn't connected: the bot needs to be an admin that can post there."
- "{name} isn't connected: only an admin of it can connect it."
- "Removed in Telegram", "Can't post here", "Group", "Channel", "topic: {topic}"
- Disconnect confirm: "Disconnect {name}? The bot leaves it, and posts waiting for it are cancelled."
- "Telegram posts go out between 9am and 9pm. This one goes at 9am."
- "Held until 9am"
- "Telegram takes videos up to 20 MB from Content Studio. Post a shorter one, or send it in Telegram."
- InfoTip on the card title: "Content Studio's bot posts for you. It reads nothing else."

Bot:
- After Start: "Pick the group or channel Content Studio should post to." Buttons "Pick a group", "Pick a channel". Under them: "Not in the list? Add me by link: {group link} or {channel link}"
- Expired or used code: "That link has expired. Go back to Content Studio and tap Connect Telegram again."
- Connected: "Connected to {name}. Posts you schedule in Content Studio go here between 9am and 9pm."
- Forum: "{name} has topics. Posts go to General. To use another, open the topic and send /here."
- After `/here` from the person who connected: "Posts from Content Studio now go to the topic {topic}." (sent in the private chat, so the group sees only their `/here`)
- Not an admin: "You need to be an admin of {name} to connect it."
- Can't post: "I can't post in {name}. Make me an admin with Post messages, then tap Pick again."
- Anyone else who writes to the bot: "This bot posts for Content Studio. Connect it from consultant-content-studio.vercel.app/accounts."

### Data

Stop for Leo: this needs new tables, a schema change, his yes and an independent review before it is applied (`migration-review-before-apply`). Zernio's route (alternative A) is the only way without one.

`supabase/hub/025_telegram.sql`, written in 018's shape (service role writes, owner reads, `revoke all` from public, anon and authenticated, then `grant select` to authenticated), with `025_telegram.test.sql`:

- `cs_telegram_chats`, one row per connect: `id uuid`, `owner_id` (auth.users, on delete cascade), `profile_id` (018's check), `code_hash` (sha256 of the code, unique; the code itself is never stored), `code_expires_at`, `tg_user_id bigint` (who tapped Start), then once tied `chat_id bigint`, `chat_type` (group, supergroup, channel), `title`, `username`, `is_forum`, `topic_id int`, `topic_name`, and `status` (pending, connected, cant_post, removed), `connected_at`, `removed_at`. A partial unique index on (owner_id, profile_id, chat_id) where status is connected.
- `cs_telegram_posts`, the queue: `id uuid`, `owner_id`, `profile_id`, `chat_row` (to `cs_telegram_chats`), `client_key uuid` unique per owner (a retried schedule never makes two), `text` (4,096 at most), `media` (up to 10 storage paths), `send_at`, `status` (scheduled, sending, posted, failed, cancelled), `message_ids bigint[]`, `link`, `error`, `sent_at`.
- A private storage bucket `telegram-media`, paths `<owner>/<profile>/<uuid>.<ext>`, written through signed upload URLs from `telegram` and read by the hook through 1-hour signed URLs at send time. Files go 7 days after their post is posted or cancelled.
- A pg_cron job `telegram-send`, every minute, that calls the hook only when a post is due (`where exists (... status = 'scheduled' and send_at <= now())`), with the `x-telegram-cron-secret` header from Vault (`cs_telegram_cron_secret`), as `notify` and `social-sweep` do.

The names are free in `supabase/` (grep, 27 Oct). Whether they are free on the live academy project needs `select to_regclass('public.cs_telegram_chats')`, the same for `cs_telegram_posts`, and the bucket list, run by the dispatcher (`check-live-name-before-migration`); builders never call production.

On the device: the draft keeps `telegram?: { postId: string; chatRow: string }[]` beside its Zernio link (synced, not security state; the server checks every id). The Channels cache gains a `label` for a chat with no @ handle.

### Secrets

Edge secrets on the academy project, set by Leo's session only, never printed and never read back by a builder (`builders-never-read-prod-settings`):

| Name | What |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The new bot's token from BotFather. Server only; never in client code, a URL, a log line or an error. |
| `TELEGRAM_BOT_USERNAME` | The bot's @ name, for the `t.me` links. |
| `TELEGRAM_WEBHOOK_SECRET` | The `secret_token` given to `setWebhook`; the hook refuses any request without it. |
| `TELEGRAM_CRON_SECRET` | The `x-telegram-cron-secret` the cron job sends; also in Vault. |

`NORTH_STAR_USERS` exists already. `setWebhook` (url `.../functions/v1/telegram-hook`, `allowed_updates` message and my_chat_member) is a one-off run by Leo's session after the deploy.

### Functions

- `telegram` (JWT on), in the house shape (pure logic in `logic.ts`, thin `index.ts`): `start {profileId}` returns the `t.me` link and the row id; `disconnect {profileId, chatRow}` calls `leaveChat` and cancels waiting posts; `presign`, `schedule {profileId, chatRows, clientKey, text, media, sendAt | now}` and `cancel {profileId, postId}`. Every id from a request is checked against the caller's own rows first, as `social` does (H1, M2).
- `telegram-hook` (`--no-verify-jwt`, like `notify`): a request carrying `X-Telegram-Bot-Api-Secret-Token` is an update (`/start <code>`, `chat_shared`, `my_chat_member`, `/here`, `migrate_to_chat_id`); one carrying `x-telegram-cron-secret` is a send tick. Anything else is a 401 and nothing is read. The tick takes due posts with `for update skip locked`, at most one per chat a tick and 20 a tick, inside 09:00 to 21:00 Singapore time. A post left in `sending` for 10 minutes turns `failed` ("Check the group before you retry"), never sent again by itself.
- Text goes with no `parse_mode`, so a person's own `<` or `*` can never fail a post with "Can't parse entities".

### AI and cost

- No model and no Jev question: nothing here is classified, scored or ranked. The schedule steps' compliance scan runs on the Telegram caption as on every other network.
- Telegram's Bot API is free at these volumes (paid broadcasts start above about 30 messages a second).
- Supabase: the cron calls the hook only when a post is due, so a quiet day costs nothing.
- Daily caps in `supabase/functions/_shared/usageCaps.ts`: `telegram-connect` 5, `telegram-schedule` 30, `telegram-presign` 30.

### Deep links

- `/accounts#telegram` scrolls to the Telegram card (Leo only); add `#telegram` to the /accounts row in `docs/deep-links.md`.
- The schedule steps' `network` param on /drafts and /calendar gains `telegram`, as in `/drafts?schedule=<id>&step=caption&network=telegram`, and the shipped `/calendar?platform=telegram` filter shows posts scheduled here beside the team posts and the channel feed.
- A waiting connect needs no param of its own because it resumes from its row on load, which also keeps the one-time code out of every URL of ours.

## Done when

- [ ] Leo has made the bot and his session has set the four secrets and the webhook.
- [ ] 025 has had its independent review, the live names were checked, and it is applied.
- [ ] On Leo's sign-in, Connect Telegram, Start, Pick a group and the test group's confirm read "Connected to {test group}." on /accounts within 5 s of the last tap, without a reload, and the Channels block lists it.
- [ ] The same for a test channel.
- [ ] In a forum test group, `/here` in a topic moves its posts to that topic, and the card names the topic.
- [ ] From the schedule steps, a text post and a 3-picture post 5 minutes out land in the test group; each chip turns "Posted" and its link opens the message.
- [ ] A post scheduled for 22:00 reads "Held until 9am" and goes at 09:00 (clock-mocked test; live only with Leo's yes).
- [ ] Removing the bot in Telegram marks the chat "Removed in Telegram" and cancels its waiting posts with that reason; Disconnect in the app makes the bot leave and cancels them too.
- [ ] Other sign-ins see nothing new, and `telegram` answers them 404 `{enabled:false}`.
- [ ] `npm run build`, the full `npx vitest run`, the functions' deno tests and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

Live checks, one rung at a time:

1. Fixtures: every update shape above, as JSON, through `logic.ts`. No network.
2. A local `telegram-hook` with Telegram's fetch stubbed and the secrets made up for the run.
3. Live in a test group and a test channel Leo owns, with Leo the only member: one connect each, one text post and one album each.
4. A real audience (FASTRACK, AdvisorOS, any adviser's or client's group) only after Leo's yes in his words.

A refusal is never proved by calling the live hook or `telegram` (`never-test-live-side-effects`): it is proved by tests and the local run.

## Tests

- `supabase/functions/telegram-hook/logic.test.ts`: the webhook secret and the cron secret each gate their path, and a wrong or missing one reads nothing; `/start` with a good code ties the Telegram user once and a second `/start` with it is refused; an expired code is refused; `chat_shared` or `my_chat_member` from a different Telegram user ties nothing; a person who is not an admin, or a bot that cannot post, ties nothing (stubbed `getChatMember`); a forum chat sets `is_forum`; `/here` sets the topic only from the person who connected; the bot kicked or demoted marks the row and cancels its waiting posts; `migrate_to_chat_id` moves the id.
- Same file, sending: 08:59 and 21:00 Singapore time hold, 09:00 sends; one post per chat a tick; a caption over 1,024 with pictures sends the album, then the text; 2 to 10 pictures make one album; the link builder gives `t.me/<username>/<id>` and `t.me/c/<id>/<topic>/<msg>`; a `sending` row older than 10 minutes turns failed and is not sent again.
- `supabase/functions/telegram/logic.test.ts`: the gate; a chat row or post id that is not the caller's is a 404; the same `client_key` twice makes one post; file type and size limits (20 MB video); `sendAt` outside the hours moves to 09:00.
- `supabase/hub/025_telegram.test.sql`: the owner reads only their rows; authenticated and anon cannot insert, update or delete; anon reads nothing.
- `src/lib/telegramConnect.test.ts`: the waiting panel's lines from a row (pending, connected, expired, refused, removed), and the Channels mapping with `label`.
- Prove each case bites by breaking the code once.

## Open questions

- Which bot? Recommended: a new Content Studio bot that Leo makes in BotFather (only he can, on his Telegram account), not @leotanclaudebot. A webhook on @leotanclaudebot stops getUpdates, which the Claude Code plugin and `team-posts poll` both use, and its name would be the author of every group post.
- Who may connect? Recommended: Leo only first (`useLeoOnly` and `NORTH_STAR_USERS`); everyone is his call later, in his words.
- The schema change (025: two tables, a private bucket, a cron job)? Recommended: yes, with the independent review before it is applied. If no, alternative A through Zernio, at US$6 a month a chat and with no topics.
- Connect FINTERNSHIP FASTRACK and AdvisorOS through it? Recommended: not in the first build. `team-posts` keeps posting through @leotanclaudebot with its review flow. After two weeks of clean posts in the test group, connect AdvisorOS (topic 326) first, and move `team-posts publish` onto the queue only when Leo says.
- The bot's display name and @ name are Leo's (BotFather); "Content Studio" is the default the copy assumes. Whether the name he wants is free is unverified.
- Whether Telegram lists a chat in the `request_chat` picker when the person may add members but not admins is unverified; the test group settles it, and the plain links in the bot's reply cover a miss.

## Own bot per brand

Leo, 27 Oct: in a group every post shows the bot's name, so a brand may want its own bot. Decision: the shared Content Studio bot stays the default, and each brand can switch to its own.

### Flow

1. On /accounts#telegram, under the brand's chats, "Use your brand's own bot" opens a short how-to: in Telegram, open @BotFather and send /newbot; send /setdomain, pick the bot and send consultant-content-studio.vercel.app (the Confirm button needs it); paste the token BotFather gives.
2. "Use this bot" sends the token to `telegram` (action bot-add). The page reads "Checking your bot..." and then "Posting as @<username>".
3. The server checks the token with getMe, refuses one that isn't a bot, the shared bot, or a bot already set up in Content Studio (any account), stores the token in Vault, and calls setWebhook for that bot with its own secret_token and the hook URL `.../functions/v1/telegram-hook?bot=<bot id>`. It answers with the bot's username and name only. If setWebhook fails, nothing is kept.
4. From then on Connect Telegram for that brand opens `t.me/<own bot>?start=<code>`, the Confirm and the pickers come from the own bot, and chats tied that way post through it.
5. "Switch back to the shared bot" (asks once) deletes that bot's webhook, marks the chats tied through it disconnected, cancels their waiting posts, and deletes the row and its Vault secret. Chats tied through the shared bot are untouched.

### Data

`supabase/hub/027_telegram_bots.sql`:

- `cs_telegram_bots`: id, owner, brand profile, Telegram bot id (unique: a bot belongs to one brand of one account), username, display name, the Vault secret id of its token, the sha256 of its webhook secret, status (active, revoked), created and updated. One own bot per brand.
- Clients may select the non-secret columns of their own rows only (a column-level grant; the token's Vault id and the webhook hash are never readable).
- Service-role-only functions: save a bot (creates the Vault secret and the row together) and read a bot's token for a send or a webhook reply. Deleting the row deletes its Vault secret (trigger).
- `cs_telegram_chats.bot_id`: the bot a code was issued for and a chat was tied through; null is the shared bot.

### Security

- The token is pasted once, sent over the signed-in session, and from then on only exists in Vault. It is never in a response, a log line, an error or one of our URLs (Telegram's own API puts it in its request path, which is never logged).
- A webhook for an own bot is accepted only with that bot's secret_token, compared timing-safe against its stored hash; an unknown bot id or a wrong secret is a 401.
- Every hook query is scoped to the bot the update came through: a code issued for the shared bot can't be started on an own bot, and a bot removed from a chat marks only the rows tied through that bot.
- The Confirm login is checked against the token of the bot the code was issued for.

### Done when

- [ ] 027 has had its independent review, its live names are checked free, and it is applied.
- [ ] On Leo's sign-in, a test bot from BotFather (with /setdomain) is added to a test brand: "Posting as @<bot>", and getWebhookInfo shows the hook URL with its bot id.
- [ ] Connect Telegram for that brand goes through the test bot, and a post lands in the test group under the test bot's name.
- [ ] "Switch back to the shared bot" disconnects that group, cancels its waiting posts, deletes the webhook and the Vault secret; the next connect uses the shared bot.
- [ ] A bad token, the shared bot's token, and a token already used by another account are refused with no row kept.
- [ ] Other sign-ins see nothing new.

### Leo's answer (27 Oct)

- Shared bot + own bot option.

## Related

publish-accounts, publish-schedule, publish-per-network, publish-calendar, trust-team-push, trust-approved-library, find-alerts-digest, ux-trust

## Leo's answers (27 Oct)

- Bot: a new Content Studio bot Leo makes in @BotFather; its token goes in the keychain as cs-telegram-bot-token and then the edge secret, never in chat. @leotanclaudebot stays with the Claude plugin and team-posts.
- Schema: yes to 025_telegram.sql, applied only after an independent migration review passes and the live names are checked free.
- Who: Leo's sign-ins only at first.
- His two groups: not yet. team-posts keeps posting to FINTERNSHIP FASTRACK and AdvisorOS; after two weeks of clean posts in a test group he owns, AdvisorOS connects first, and publishing moves only when he says.
