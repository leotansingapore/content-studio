# Team roles for the posts board (v2, after the independent review)

Leo, 16 Oct 2026, asked to "give advisors access to my account so they can comment, and some roles/permissions so they can only see for certain modules/brands". He picked:

- full team roles;
- close the old public MoneyBees Studio board;
- the posts board only, scoped per brand.

v1 of this design went through an independent security review on 16 Oct. Every finding is folded in below; the finding numbers are given in brackets.

## Facts this design rests on

- **The board data.** It lives in `public.studio_cards` in the MoneyBees Supabase project (nixjfvqpjlenwnmqqpsx). The Mac pipeline (tools/studio.py, tools/publish_ig.py) writes it with the service key. The moneybees-studio Vercel API (studio/api) writes it too.
- **Approving posts to Instagram.** An approved card is scheduled, and publish_ig.py posts whatever caption and version the card holds when its slot comes.
- **Nothing is protected today.** The moneybees-studio API has no auth. Its old deployment URLs serve the board as well [1]. Content Studio proxies it publicly at /mb-studio, and only hides the page by email.
- **Email proves nothing.** Academy logins (hgdbflprrficdoyxmdxe) auto-confirm email, and an email change needs no confirmation, so identity is the auth user id only.

## Roles

| | viewer | commenter | editor | approver | owner (Leo) |
|---|---|---|---|---|---|
| See cards of their brands | yes | yes | yes | yes | all brands |
| Add a note | | yes | yes | yes | yes |
| Resolve a note | | own notes | own notes | own notes | any note |
| Caption, version or schedule on a Review or Needs-changes card | | | yes | yes | yes |
| Caption, version or schedule on an approved or scheduled card [2] | | | | yes | yes |
| Move a card review to changes, or changes to review | | | yes | yes | yes |
| Any other stage move [3], from or to approved, scheduled or archived | | | | yes | yes |
| Anything on a posted card, or a card with `ig.state` set [3] | | | | | yes |
| Change a card's brand | | | | | yes |
| Manage the team | | | | | yes |

Stage moves are checked as (from, to) pairs against the card's CURRENT stage, read by the writer [3].

## Where each rule is enforced

### 1. moneybees-studio API (studio/api): the only place a card is written

Every request needs `x-board-key`:

- Refuse with 401 when the env var `BOARD_KEY` is unset or empty, so it fails closed [8].
- Compare `sha256(header)` with `sha256(BOARD_KEY)` using `crypto.timingSafeEqual`.

A keyed request also carries `x-board-actor`, base64url JSON `{"id": uuid, "label": str, "role": "owner"|"viewer"|"commenter"|"editor"|"approver", "brands": [ids] or ["*"]}`. It is trusted only after the key check. A request without it is refused.

The rules are pure functions in `studio/api/_rules.js`; its own asserts run with `node studio/api/_rules.js`, like `_slot.js`:

- `allowedBrand(actor, card)` uses `brandOf(card) = card.brand || "moneybees"` on both reads and writes [7].
- `canUpdate(actor, card, patch)` implements the table above. It returns `{ok, reason}`, and the reason is a plain message such as "Only an approver can change a scheduled post".
- `cleanSchedule(value, actor, now)` [5]:
  - A non-owner's schedule must match `^\d{4}-\d\d-\d\dT\d\d:\d\d$` and lie in the future (Singapore wall time); otherwise refuse.
  - A move to approved or scheduled whose schedule is empty gets the next free slot from `nextSlot`. A non-owner's past schedule does too; Leo keeps a past one, which then posts within 15 minutes, as before.

board.js:

- Key, then actor.
- Non-owners get only cards whose brand is in their brands, and only those brands in the list. Cards are filtered before media is signed, so no signed link for another brand ever leaves.

card.js (ops: update, comment, resolve):

- Key, then actor, then read the card with its `updated_at`.
- `allowedBrand`, then `canUpdate`, or for a comment the role must be at least commenter; for resolve, `canResolve(actor, note)`.
- Apply the change, then write with the filter `updated_at=eq.<value read>` and `Prefer: return=representation` [6]. Zero rows means someone else wrote first: re-read and re-check, up to 3 times, then answer 409 "Someone else just changed this post. Reload and try again."
- A comment's author `by: {id, label}` comes from the actor on the server, never from the client.
- Comments are capped: text at most 2,000 characters, at most 300 notes per card [11].
- Errors return generic text such as "Couldn't save that", with the detail written to the function log only [13].

index.html becomes a redirect to `https://consultant-content-studio.vercel.app/reels`, keeping `card`, `brand`, `t`, `slide` and `c` [15].

### 2. The Mac pipeline (tools/studio.py, tools/publish_ig.py)

- Every read-modify-write of a card uses the same conditional write on `updated_at`, with up to 3 retries [6]. This matters most in publish_ig.py, which saves `ig.mediaId`.
- `studio.py todo` prints each note's author [9]. auto/FIX.md acts only on notes without a `by` or with `by == "claude"`, which are Leo's notes from before this change, and on notes whose `by.id` is the owner. Members' notes are listed for Leo, never acted on.

### 3. Vercel, project moneybees-studio

- `BOARD_KEY` is set for Production, Preview and Development [8].
- Deployment Protection (Standard) is on, so every old and preview deployment URL demands a Vercel login. The production alias runs the new keyed code [1].
- Live checks: an old deployment URL gives 401 or a login redirect, and the production `/api/board` without the key gives 401.

### 4. Academy project, Content Studio

**Migration 022 `cs_board_members`** (`supabase/hub/022_board_members.sql` plus `022_board_members.test.sql`):

```
id uuid pk default gen_random_uuid()
owner_id uuid not null references auth.users(id) on delete cascade
label text not null check (char_length(label) between 1 and 60)
member_id uuid null references auth.users(id) on delete cascade
role text not null check (role in ('viewer','commenter','editor','approver'))
brands text[] not null default '{}' check (cardinality(brands) <= 20)
modules text[] not null default '{reels}'
invite_hash text null            -- hex sha256 of the token
invite_expires_at timestamptz null
claimed_at timestamptz null
revoked_at timestamptz null
created_at timestamptz not null default now()
unique index on invite_hash where invite_hash is not null
unique index on (member_id) where revoked_at is null and member_id is not null   [10]  (one board, so one live row per person)
```

- RLS is enabled with NO policies.
- `revoke all on cs_board_members from public, anon, authenticated` [19]. Only the service role touches the table.
- The test asserts the grants, RLS, both partial unique indexes, and that anon and authenticated cannot select.

**Edge function `team-board`** (JWT verification on):

- POST JSON `{action, ...}`.
- Secrets:
  - `BOARD_KEY`: Supabase secrets are project-wide, so other functions on the academy project could read it. Accepted [8].
  - `MB_STUDIO_URL` = https://moneybees-studio.vercel.app
  - `TEAM_OWNER_IDS` = Leo's uid
  - `TEAM_CLAIM_DENY_IDS` = the demo account's uid and any other shared login [4]

Order of work on every request:

1. `getUser(jwt)`; the uid is all that is trusted.
2. If `action == "claim"`, handle it now, before any membership gate [10]:
   - Refuse owners and denied uids.
   - Hash the 32-byte base64url `token` and run `update ... set member_id = uid, claimed_at = now(), invite_hash = null where invite_hash = h and claimed_at is null and revoked_at is null and invite_expires_at > now() returning *`.
   - A unique violation (already a member) becomes "You're already on Leo's team. Ask Leo to add the brand."
   - No row becomes "This invite link has expired or was already used. Ask Leo for a new one."
3. Owner = uid in `TEAM_OWNER_IDS`. Member = the one row with `member_id = uid and revoked_at is null`.
4. `me` always answers 200 [14]: `{owner, member, id, role, brands, modules, label}`; a non-member gets `{owner:false, member:false}`.
5. Not owner and not member means 403 for every other action.
6. `board`, `card`, `comment` and `resolve` are forwarded to `MB_STUDIO_URL` with `x-board-key` and `x-board-actor` (role `owner` with brands `["*"]` for the owner). The card id is built with `encodeURIComponent`. The edge function NEVER authorises a write itself, and never uses `findCard`; the writer decides [7]. Comments are capped at 60 a day per caller through `consumeUsage("team-comment")` [11].
7. `team.*` actions are owner only:
   - `list`: no hashes.
   - `invite {label, role, brands}`:
     - 32 random bytes, base64url;
     - stores sha256;
     - expires in 7 days;
     - returns `https://consultant-content-studio.vercel.app/join#<token>` once [12].
   - `update {id, role?, brands?, label?}`
   - `revoke {id}`
   - `reinvite {id}`: only an unclaimed, unrevoked row. It sets a new hash and a new expiry.
8. Errors are generic, details go to the log [13].

### 5. Content Studio client

- `vercel.json`: remove every `/mb-studio` rewrite and the `/mb-studio` headers block. `vite.config.ts`: remove the proxy.
- `src/lib/reelsBoard.ts`:
  - `fetchBoard`, `updateCard`, `addNote` and `resolveNote` call `supabase.functions.invoke("team-board", {body})`.
  - New: `checkMe()`, remembered for 10 minutes in localStorage `cs-team-me` (outside the sync prefix, a nav hint only, cleared on sign-out), the same pattern as `checkSocialConnect`.
  - New: `listTeam`, `inviteMember`, `updateMember`, `revokeMember`, `reinviteMember`, `claimInvite`.
- ReelsPage, ReelFeed and ReelDrawer:
  - Show the board when `me.owner || me.modules.includes("reels")`.
  - Show only the controls the role allows:
    - viewer: none;
    - commenter: note only (Needs changes adds a note and does not move the card);
    - editor: caption, date and version on review or changes cards, plus the review-changes move;
    - approver: everything except brand.
  - Show the server's reason when it refuses. A 403 in the middle of a session reloads `me` [16].
  - Notes show their author. `by` may be missing, may be the string "claude", or may be `{id, label}` [18].
- CalendarPage: board posts for `me.owner` or members with reels.
- Channel feeds and the nav's owner-only items keep the `REELS_BOARD_OWNERS` email check, a UX gate over public data [14].
- Nav "Reels" uses `show: reelsShown` (the remembered `me`), refreshed by StudioLayout on load.
- `/reels/team` (the app already has a `/team`), owner only, opened from a Team button on /reels:
  - members with their role, brands and status (invited, expired, joined, revoked);
  - invite (name, role, brands) shows the link once, with Copy and a WhatsApp share;
  - change role or brands;
  - revoke and re-invite.
- `/join`:
  - Reads the token from `location.hash`, puts it in sessionStorage, then calls `history.replaceState` to drop the hash [12].
  - Signed out: a sign-in form plus a "Create account" form (email and password via `supabase.auth.signUp`, offered only on this page) [17].
  - Signed in: `claimInvite`, then "You can now see <brands> posts" and a button to /reels.
  - The refusal messages from claim are shown as they are.

## Checks before it ships

- An independent review of migration 022 before it is applied.
- `node studio/api/_rules.test.js`: every role x stage pair, the approval lock, posted and `ig.state` cards owner-only, brand, schedule validation and resolving. Each test must be shown to fail when the line it guards is removed.
- Vitest for the client's role-to-controls mapping, and for the edge function's pure parts (token, hash, owner and deny).
- Deploy order:
  1. migration;
  2. function and secrets;
  3. `BOARD_KEY` on Vercel;
  4. moneybees-studio deploy and protection;
  5. Content Studio.

  The Content Studio deploy and the moneybees-studio deploy go out together, because the proxy dies with the key.
- Live:
  - the old URLs, the production API without the key, and /mb-studio give no board JSON;
  - Leo's owner session works end to end;
  - `studio.py sync` and `publish_ig.py --check` still work;
  - two QA members (commenter and approver) scoped to `businessacademy`, which has no Instagram, see only that brand. Every action outside their role is refused by the server, and both rows are revoked afterwards [4].
