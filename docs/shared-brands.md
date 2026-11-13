# Shared brands (Invite your team)

Leo approved "Invite your team" in the Add a brand onboarding, the way Holo does it, with shared brands: an invited
teammate opens the same brand and works on its posts, plan and calendar.

Today every brand lives in its owner's account: localStorage under `content-studio-*` keys, mirrored per user into
`cs_user_data` by `src/lib/cloudSync.ts`, so an invitee would sign in to an empty studio. This is version 2 of the
design, with every finding of the independent review folded in (they are listed at the end); the builder applies
and deploys nothing, and the lead runs the deploy list.

## Facts this rests on

- One database, shared: Supabase project hgdbflprrficdoyxmdxe also runs the FINternship academy, and its Site URL
  and auth settings stay as they are.
- Email is not identity: academy logins auto-confirm and an email change needs no confirmation, so membership is
  keyed by the auth user id and a pending invite is a hashed one-time token bound to one brand.
- No public sign-up: the app asks Supabase with `shouldCreateUser: false`, accounts are made with the admin API,
  and the `handle_new_user` trigger gives each one an academy profile with no roles.
- PKCE: the app's client uses PKCE, so a sign-in link only finishes in the browser that asked for it. A link a
  server requests lands as an implicit-flow URL the client refuses ("Not a valid PKCE flow url"), as
  `docs/postmosis-billing.md` found for checkout. The server sends the invite; the invitee's browser asks for the
  sign-in link.
- How a brand is keyed: a brand is a profile (`src/lib/profiles.ts`) whose data sits under
  `content-studio-<thing>-<scope>`. The scope is the bare owner id for the default brand "me" and
  `<ownerId>~<profileId>` for any other (`scoped()`).
- The sync can't forget on its own: a key deleted on one device comes back from another that still holds it, unless
  the account's own tombstone list says otherwise, so no access rule may depend on deleting a synced key.
- Server jobs read the owner's rows: `notify`, `slide-campaigns` (brand kit, facts, learnings, then posts to TikTok
  unattended), the account audit (`_shared/auditRunner.ts`, brand kit) and Connect Claude (`content-studio-mcp`)
  all read a brand's keys from the owner's `cs_user_data` rows.
- Supabase grants EXECUTE on every new function in `public` to anon and authenticated by default, so each function
  here revokes that explicitly.

## Decisions in five lines

1. A shared brand's data stays in the owner's `cs_user_data` rows. Members reach a fixed allow-list of its keys
   through security-definer SQL functions that check membership on every call, so nothing is copied or moved.
2. Two roles: the owner and members, who edit the posts, plan and calendar parts, read the brand kit and facts,
   and can leave. Only the owner invites, removes or deletes.
3. A member's device runs a small brand sync per shared brand where every save is compare-and-set: a save made on
   an old copy never overwrites a newer one, and posts merge one by one as they do today.
4. The `brand-team` function emails invites (only from an owner whose plan gives access, with caps per inviter,
   recipient, owner and overall); an account is made only when the invitee opens a valid link, never at invite.
5. Billing change: an account made by an invite gets a `member` subscription row, which opens the studio while it
   is on a brand whose owner's plan gives access; its AI use counts against its own daily caps.

## Roles

| Can | Owner | Member |
| --- | --- | --- |
| Edit the brand's posts, weekly plan, calendar notes, board, ideas, campaigns, goals, angles, audiences, products, positioning and voice | yes | yes |
| Read the brand kit, brand fonts, facts and learnings | yes | yes |
| Change the brand kit, brand fonts, facts and learnings | yes | no |
| Change or remove a post the owner scheduled through Post it for me | yes | no |
| Use the AI writers inside the brand | yes, own caps | yes, own caps |
| Invite people, revoke an invite, remove a member | yes, with an active plan | no |
| See the team list | everyone, with emails and last edit | the owner and themselves |
| Leave the brand | no (delete it instead) | yes |
| Rename or delete the brand | yes | no |
| Connected social accounts, Post it for me, link in bio, tracked links, slideshow campaigns, Telegram, Connect Claude, compliance links, posts board | yes (as today) | no: these stay the owner's |

There is no "admin" member in v1, and ownership can't be handed over.

The brand kit, fonts, facts and learnings are read-only for members because the owner's slideshow campaigns write
from them and post to TikTok with no one looking, and the account audit reads the brand kit. A member who could
change them would be steering the owner's unattended public posts (review finding 3).

## Where a shared brand's data lives

The data stays in the owner's own `cs_user_data` rows, where it is today. A shared brand is one `cs_brands` row
naming the owner and the profile id, and members reach the brand's rows through SQL functions rather than a policy
on `cs_user_data` itself.

The brief suggested a separate table keyed by brand, with the data moved there when a brand is first shared. I
weighed it against keeping the rows in place, for four reasons:

- A move can lose work: the owner's other devices, an open tab on an older build or a phone with unsent edits would
  keep writing to `cs_user_data` after the move, and those edits would never reach the shared copy.
- Server jobs would go blind: `notify`, `slide-campaigns`, the account audit and Connect Claude read the owner's
  rows, and each would need a second read path.
- The owner's sync rules stay as they are: the owner's engine still syncs the owner's keys by today's rules. The
  engine, `scoped()` and `loadProfiles` do change shape for everyone, so today's sync tests must stay green.
- `cs_user_data`'s one policy (`user_id = auth.uid()`) is unchanged, so the risk and cost for every other account
  are unchanged.

The cost is that a member's writes land in the owner's account. That is what sharing means here: the brand is the
owner's, and deleting the owner's account deletes it for everyone.

## What is shared: an allow-list

```
key = content-studio-<prefix><scope>, character for character
members read and write: drafts- plan- calnotes- board- ideas- campaigns- goals- angles- audiences- products-
                        positioning- voice-
members read only:      carousel-brand- brandfont- brandfont2- brandfont3- brandfont4- brandfont5- facts- learnings-
scope:                  <ownerId> for "me", <ownerId>~<profileId> for any other brand
```

There is no pattern matching, so `content-studio-voice-nudge-dismissed` or a key ending in another brand's scope
never matches.

Why an allow-list and not "every key of the brand":

- The default brand can be shared: /welcome sets up "me", whose keys end in the bare owner id just like the
  account's own keys (tombstones, the brand list, onboarding, academy progress, Connect Claude links), and only an
  allow-list can tell the two apart.
- Credentials never leak by accident: `content-studio-mcplink-<scope>` is a working Connect Claude link, and a
  deny-list would expose the next such key someone adds. A new feature isn't shared until a new migration adds it.
- Keys the owner's device acts on stay out: `content-studio-zernio-outbox-<scope>` moves and cancels the owner's
  scheduled Zernio posts when the owner's device sends it, and a member's own failed tries would block the owner's.
- The owner's tombstone list is never reachable by a member's write: one who could write
  `content-studio-tombstones-<owner>` could make the owner's devices delete keys of other brands.

The lists live in `public.cs_brand_keys()` (SQL, enforced) and `SHARED_PREFIXES` / `READ_ONLY_PREFIXES` in
`src/lib/sharedBrands.ts` (what a member's device syncs); `src/lib/sharedBrands.test.ts` reads the SQL file and
fails if they differ.

## Database: `supabase/hub/037_shared_brands.sql`

Every table has RLS on with no policies and every grant taken from public, anon and authenticated. Only the
functions below and the service role touch them.

```
cs_brands         id uuid pk, owner_id -> auth.users (cascade), profile_id text ^(me|p[a-z0-9]{1,39})$,
                  name text (1-40), created_at; unique (owner_id, profile_id)
cs_brand_members  brand_id -> cs_brands (cascade), member_id -> auth.users (cascade), added_at; pk (both)
cs_brand_invites  id uuid pk, brand_id -> cs_brands (cascade), email (lower-case, trimmed, 3-254),
                  token_hash (64 hex, unique), invited_by -> auth.users (cascade), created_at, expires_at,
                  accepted_at, accepted_by, revoked_at; one open invite per (brand, email)
cs_brand_edits    brand_id -> cs_brands (cascade), member_id -> auth.users (cascade), key, at;
                  pk (brand_id, member_id, key): who last changed what, for the owner's team list
```

Removing a member deletes their membership row, and deleting a brand deletes its `cs_brands` row with everything
under it; because these are server rows rather than synced keys, the sync has nothing to bring back.

### Who reaches a brand

`cs_brand_reach(brand)` (internal, no grant) answers for `auth.uid()`: the owner, or a current member, of a brand
whose profile is still in the owner's synced brand list (`content-studio-profiles-<owner>`, or "me"). The last
check means a brand removed on any of the owner's devices, even by an older build that never told the server, stops
being reachable at once (finding 13).

### Functions a signed-in account may call

All `security definer`, `set search_path = ''`, executable by `authenticated` only.

| Function | Who | Does |
| --- | --- | --- |
| `cs_my_brands()` | anyone | Brands this account owns (with a `cs_brands` row) or is a member of: id, owner, profile id, name, role. |
| `cs_brand_rows(brand, keys?)` | owner or member | The brand's allow-listed rows (both lists), optionally only the keys asked for. |
| `cs_brand_swap(brand, key, data, stamp, seen)` | owner or member | Writes one read-write key only if its stamp is still `seen` (null: only if there is no row). Returns the stamp written, or null for a conflict. |
| `cs_brand_drop(brand, key, seen)` | owner or member | Deletes one read-write key if its stamp is still `seen`, and adds the key to the owner's tombstone list so the owner's devices drop it too. |
| `cs_brand_team(brand)` | owner or member | Owner, members (email, joined, last edit) and open invites. A member gets the owner's line and their own. |
| `cs_brand_accept(token)` | anyone signed in | Takes an invite (see Invites). |
| `cs_brand_remove(brand, member)` | owner | Deletes that membership. |
| `cs_brand_revoke(invite)` | owner | Turns off an open invite. |
| `cs_brand_leave(brand)` | member | Deletes their own membership. |
| `cs_brand_forget(profile)` | owner | Deletes the caller's `cs_brands` row for that profile, if any (brand removal). |

What `cs_brand_swap` refuses, so a member's device can't be used against the owner:

- a key off the read-write list, or any key of a brand the caller can't reach;
- data that isn't JSON, or longer than 4,000,000 characters for posts and 500,000 for anything else (finding 11);
- any string in it that starts, after spaces and control characters, with `javascript:` or `vbscript:`, the only
  way a stored link becomes script when the owner's app renders it (finding 11);
- for the posts key, any change to or removal of a post Zernio holds (it has a post id and hasn't published,
  failed or been cancelled): that post still goes out from the owner's account, so only the owner may touch it
  (finding 4). `cs_brand_drop` refuses the posts key while it holds one.

The stamp written is `greatest(least(stamp, now + 1 minute), the row's stamp + 1 ms)`. It never runs ahead of the
server's clock, and it never goes backwards, so every owner device sees a member's change as newer and takes it
(finding 3: a back-dated write could otherwise sit in the cloud while the owner's screens kept the old text).

### Functions only the service role may call

| Function | Does |
| --- | --- |
| `cs_brand_invite(brand, inviter, email, hash, expires)` | Locks the brand, checks the inviter owns it, refuses the owner's own email, revokes an open invite for the same email, then refuses past 10 people per owner (members across all their brands plus open invites), and past 3 invites to the same address in a day. Inserts the invite. |
| `cs_brand_invite_open(hash)` | The open, unexpired invite for a token hash: its email and brand name. For the join page's first step. |
| `cs_member_owner_rows(member)` | The subscription rows (status, past_due_since) of the owners of every brand this account is on, for the billing check. |

Every function in 037 has its EXECUTE revoked from public, anon and authenticated first, then granted only as above
(finding 10). The test checks `has_function_privilege` for anon and authenticated on every one of them.

The test file `037_shared_brands.test.sql` runs each rule as owner, member, removed member, stranger and anon.

## Sync on a member's device

The owner's engine (`createCloudSync`) keeps its rules. A member's device adds one brand sync per shared brand,
`createBrandSync` in `src/lib/brandSync.ts`, with simpler rules because the server is the only copy that counts:

- It owns exactly the allow-listed keys of its brand. The member's main engine already ignores them (they name the
  owner's id, so `isSyncedKeyFor` is false). Brand syncs of different brands own different scopes, and none of them
  ever owns a key the main engine owns; a test holds both.
- Per key it keeps `seen`, the stamp of the cloud row it last took or wrote, and `pending`, keys changed on this
  device and not yet confirmed. Both are stored per user and brand (`cs-brand-sync-<userId>~<brandId>`), so two
  accounts on one browser never share them (finding 6).
- Pull: a cloud row whose stamp isn't `seen` replaces this device's copy unless the key is pending. A key this
  device holds that the cloud doesn't: pending goes up, one with a `seen` stamp was removed elsewhere and goes here
  too, and one with neither is a leftover and goes (finding 7: a key another tab just made has no `seen` yet and is
  re-read as pending from storage before anything is removed).
- Save: every write is `cs_brand_swap` against `seen` (finding 5). For posts, a lost race reads the cloud copy,
  merges post by post as `syncMerge.ts` does today, puts back exactly any post Zernio holds, and tries again (three
  times). For any other key a lost race means someone saved first: the cloud copy is taken and the person sees "Your
  last change didn't save: someone else on this brand changed it first." Nothing is overwritten silently.
- Removal: `cs_brand_drop` against `seen`, which also tombstones the key for the owner's devices.
- Read-only keys are pulled and never sent; a page that writes one locally is overwritten at the next pull.
- Refresh: all of the brand's keys are read again when a tab comes back into view, at most every 10 seconds, not
  only posts (finding 5).
- Writes before the first pull can't overwrite anything: they go up against `seen` = none, which the server refuses
  when a row exists, and the cloud's copy wins (finding 1).

### Opening a shared brand

- `cs_my_brands()` is read after the main engine's first pull and kept on the device under
  `cs-shared-brands-<userId>` (outside the sync prefix, so it never syncs and never comes back). One brand sync
  starts per brand the account is a member of, and `initCloudSync` waits for their first pull before the studio
  draws (finding 1).
- A shared brand opens only once its brand sync has pulled on this device at least once. Until then the studio shows
  "Can't reach <brand> right now" with Try again and Open my own brand. Nobody types into an empty copy (UX: never
  lose typed work).
- `loadProfiles(member)` returns the account's own brands plus one entry per shared brand: id `s<brand uuid without
  dashes>` (so it can't clash with the member's own "me"), the brand's name, and `shared: { brand, owner, profile }`.
  `saveProfiles` strips shared entries before writing, so rename, add, link or remove can never write them into the
  member's synced list (finding 12).
- `scoped(member)` with a shared brand open returns the owner's scope, so every page that already uses `scoped()`
  reads and writes the shared keys with no change. `scopeFor(userId, profileId)` does the same for the two places
  that build a scope by hand (`draftsOfBrand`, `brandLogoFor`).
- Keys a page writes under the owner's scope that aren't on the allow-list stay on that device; nothing sends them.

### Stopping, signing out, shared browsers

- A brand that is no longer in `cs_my_brands()` stops its sync after one last flush, and this device's copies of its
  keys, their merge bases and the sync's own state are removed with the raw (unpatched) storage calls, so nothing
  is sent as a deletion (finding 6). Sign-out does the same for every brand sync.
- Before any engine starts, keys a different account left on this browser for a shared brand (listed in that
  account's `cs-shared-brands-` cache) are removed the same way. An owner signing in after a member on one browser
  therefore never uploads the member's leftover copies as their own (finding 6).

### Two editors at once

- Posts merge post by post. Two people editing different posts both keep their work; on the same post the later
  save of that post wins.
- Any other shared key is one value. On a member's device a save made on an old copy is refused and the person is
  told; it never reverts the newer copy. The owner's devices keep today's rule (the newer save wins), so the owner's
  stale tab can still replace a member's earlier change to the plan, which the known limits below record.
- Removing a whole key (Delete plan) reaches the owner's devices through the tombstone `cs_brand_drop` writes, so it
  doesn't come back (finding 5).
- The calendar notes, ideas and the like are not merged item by item in v1: a refused save there loses that one
  change, with the message above.

## Invites

### Create (owner)

From the Team step in onboarding or the brand's Members page the owner types one email and presses Invite. The app
calls `brand-team` `{action: "invite", profileId, name, email}`:

1. `getUser(jwt)`. The user id is all that is trusted.
2. The owner's own subscription row must give access (trialing, active or comp). No row, a lapsed row or a `member`
   row: 403 "Inviting your team needs an active plan." This keeps the public demo login, academy accounts and
   members from minting accounts (finding 2). Leo's own accounts need a `comp` row to invite (deploy step).
3. The email is trimmed and lower-cased, must look like `local@host.tld`, at most 254 characters, no spaces, and
   not `@demo.com`.
4. Caps: `consumeUsage(uid, "brand-invite")` (10 a day per inviter) and `"brand-invite-global"` on
   `GLOBAL_COUNTER_USER` (200 a day across everyone); in SQL, 10 people per owner and 3 invites per address per day.
5. The function upserts `cs_brands (owner, profile, name)`, which is what makes the brand shared.
6. A 32-byte random token, base64url; `cs_brand_invite` stores its sha256 with a 7-day expiry.
7. Plain-text email from the Postmosis sender (`noreply@mail.themoneybees.co`, Resend, `notify`'s key): who invited
   them and the brand's name (both stripped of line breaks and control characters and cut to 60 and 40 characters),
   and the link `https://app.postmosis.com/brands/join#<token>`, which carries no sign-in credential.
8. The answer is `{invited: true, email}` either way: no account is looked up or made at this point, so the reply
   can't reveal who has one (finding 8).

The owner never sees the token.

### Accept (invitee)

1. `/brands/join#<token>` is a public page. It moves the token to this device's storage (`cs-brand-invite`, outside
   the sync prefix) and takes it out of the address, so it never reaches a log, the sign-in redirect or a referrer
   (finding 15).
2. Signed out, it calls `brand-team` `{action: "start", token}` (the anon key passes JWT verification; no user is
   needed). For an open, unexpired invite the function makes the invitee's account if the invite's email has none
   (`email_confirm: true`, `app_metadata.postmosis_invited_by`), adds its `member` row with insert-if-absent, and
   answers with the invite's email and brand name. A bad or used token gets "This invite has expired or was already
   used. Ask for a new one." Accounts are only ever made for someone holding a live link (finding 8).
3. The page then asks for the sign-in link for that email from this browser (PKCE), returning to `/brands/join`,
   with the code box beside it for a link opened elsewhere.
4. Back on the page and signed in, `cs_brand_accept(token)` hashes the token and locks the invite in one
   transaction. It refuses an invite that is used, revoked or expired, the brand's owner, and an account whose email
   isn't the one invited ("This invite was sent to another email. Sign in with that one."); otherwise it adds the
   member and closes the invite.
5. The page clears the token, marks the account onboarded (so /home doesn't send a new account into setting up its
   own brand), opens the brand and loads `/calendar?profile=s...` as a full page load, so the brand sync's first
   pull runs before anything is drawn.

The email match narrows who can use a forwarded or leaked link; it is not the identity. From the accept on, the
membership is keyed by user id.

### Expire, revoke, re-send

- An invite lasts 7 days, after which the accept refuses it and the owner's Members page shows it as expired, with
  Invite again beside it.
- Invite again, or inviting the same email a second time, revokes the open invite for that email and sends a new
  token, so only the newest link works.
- Revoke turns an invite off at once.

## Removing a member, leaving and deleting a brand

- Removing a member is the owner's action: `cs_brand_remove` deletes the membership, their next call is refused,
  and their device drops its copy at the next refresh. What they already saw can't be taken back.
- A member leaves with `cs_brand_leave`, from the Members page or the brand menu, with the same effect.
- Deleting a brand runs its server clean-up before anything local goes, as today, and `cs_brand_forget(profile)`
  is added first, so members lose access before the data is deleted. If it fails, nothing is removed and the owner is
  told to try again. Even without it, members lose access once the profile leaves the owner's brand list.
- The default brand can't be deleted; to stop sharing it the owner removes its members.
- Deleting the owner's account cascades to their brands, members, invites and rows, while deleting a member's
  account only removes their memberships.

## Billing and caps (billing change)

Today an account with no `cs_subscriptions` row is never gated, so without a change every invite would hand out a
free, open Postmosis account for good.

- A `member` status: an account made by an invite gets `cs_subscriptions (status: 'member')` with insert-if-absent,
  so it never overwrites a row a checkout wrote meanwhile (finding 9). On its own it gives no access. Accounts that
  existed when invited keep their own row, or no row, as before.
- Covered by a team: `teamCovered` in `supabase/functions/_shared/subscription.ts` is true when the account is a
  member of a brand whose owner's row gives access. An owner with no row covers nobody, and a `member` row never
  covers, so it can't chain (finding 2). The app's gate asks through `brand-team` `{action: "covered"}` (a member
  can't read the owner's row); `consumeUsage` asks through `cs_member_owner_rows`. A failed lookup refuses nobody,
  like the rest of the gate.
- Repair: an account with `app_metadata.postmosis_invited_by` and no row is treated as `member` by the app, and the
  `covered` call writes the missing row (finding 9).
- Whose caps: a member's AI use counts against the member's own daily caps (`cs_ai_usage` by user id). An owner's
  US$29 plan therefore covers up to 10 teammates in all, each with their own daily limits. Leo should agree to this
  before deploy, or pick a team pool instead (open decision).
- Server side: `consumeUsage` lets a `member` row through only when `teamCovered` says so. A function deployed before
  this change reads `member` as lapsed and refuses the member's metered AI (402), failing closed until redeployed.
  `social` keeps refusing member rows.
- Paywall: a `member` row with no covering team sees "Your team access has ended" and a link to the plans page, not
  "Subscribe again" (there is no Stripe customer to restart). Settings > Billing stays hidden for member rows.
- Paying later: a member who buys their own plan is held as `customer_mismatch` (their row has no Stripe customer)
  and attached by hand with the SQL in `docs/postmosis-billing.md`.

## Screens

- Onboarding step "Invite your team", after the review on `/brands/new` and on `/welcome` once the brand is saved:
  one email box with an Invite button, the people already invited listed below it, and Continue, always enabled, so
  the step is skipped with Continue alone. Continue lands where the flow lands today (`/brands/new` on the new
  brand's calendar, `/welcome` on Connect or the finish screen). Holo's layout; no Holo words, pictures or mascot.
  An owner without an active plan sees the reason under the box, and Continue.
- Members page `/brand/members` (Brand > Members), in the Brand section's Profile group (no new section or tab): the same box and list for
  the owner, with Remove beside each member, Revoke beside each open invite and Invite again beside an expired one.
  A member sees who owns the brand and a Leave button.
- Brand switcher: brands shared with you under "Shared with you", whose edit form offers Leave in place of rename and
  remove.
- Join page `/brands/join`: the brand's name and the invited email, the sign-in step, then the calendar, or the
  refusal in plain words.

## Out of scope for v1, and known limits

- Real-time co-editing and presence, or any merging finer than post by post.
- Version history or undo: a member can delete or overwrite the read-write parts as any editor can, and removing
  them doesn't restore it. Owners should invite people they trust; the team list shows each member's last edit.
- The owner's stale tab can still replace a member's earlier change to a whole-value key (the owner keeps today's
  rules).
- Content a member writes is read by the owner's Connect Claude chats as brand data, so a member could plant text
  meant to steer the owner's Claude. Claude acts on the owner's word only, and can't publish, but it does run paid
  tools on the owner's caps.
- Members get nothing of the owner's connected accounts, Post it for me, link in bio, tracked links, slideshow
  campaigns, Telegram, Connect Claude, compliance links or posts board for the brand.
- Roles beyond owner and member, and handing a brand to another owner.
- Sharing more than the allow-list, such as Studio outputs (carousels, designs, videos and media); each needs a look
  at what its data holds before a new migration adds its prefix.
- Accepting an invite with an email other than the one invited.

## Deploy order (for the lead)

1. Review `037_shared_brands.sql` with Leo. It adds foreign keys to `auth.users`, which take a lock that queues
   academy sign-ins while it waits: apply it by hand in a quiet window (`lock_timeout` gives up after 3 seconds and
   is safe to retry). Then run `037_shared_brands.test.sql` on a throwaway or local database, never through the
   Management API.
2. Deploy the invite function with JWT verification on:
   `supabase functions deploy brand-team --project-ref hgdbflprrficdoyxmdxe --use-api`. It needs `RESEND_API_KEY`,
   which `notify` already uses.
3. Redeploy every function that calls `consumeUsage`, so member accounts are covered (until then their metered AI is
   refused, which is safe). Three of them must keep `--no-verify-jwt`; the rest deploy with JWT verification on:

   ```
   for f in content-studio-mcp notify slide-campaigns; do
     supabase functions deploy $f --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt; done
   for f in ai-image ai-video assistant-act brand-dna carousel-copy carousel-fit clone-reel competitors engage-assist \
     engage-picks feed-ideas generate-social-content hook-writer idea-dump linkedin-strategy market media-sort mentions \
     post-score reel-visuals remix remix-link remix-patterns script-desk social social-plays stock-media storyboard \
     team-board telegram text-voice track-accounts video-assist viral-search week-pick writing-judge youtube-captions; do
     supabase functions deploy $f --project-ref hgdbflprrficdoyxmdxe --use-api; done
   ```
4. Give Leo's accounts a `comp` row if he wants to invite from them.
5. Push the client once the steps above are done.

## Independent review

A fresh reviewer (Opus, given only this document's first version and the code paths) returned 16 findings. Its
judgement of version 1: the access-control core was sound, but the design would overwrite owners' data on a member's
first session, let anyone mint free accounts through the public demo login, and let members reach owner-only
automations that post publicly.

| # | Severity | Finding | How it was handled |
| --- | --- | --- | --- |
| 1 | high | A member's first session (or any write before the brand engine's first pull) overwrote whole keys in the owner's account. | Every member save is compare-and-set against the stamp this device last saw; a write made on nothing is refused when a row exists. `initCloudSync` waits for each brand sync's first pull, a shared brand opens only after one, and the join page loads the calendar as a full page load. Test: a write before the pull leaves the cloud value. |
| 2 | high | Billing bypass: the public demo login or any no-row account could invite itself and get a free covered account; unlimited seats per paid owner. | Only an owner whose own row gives access may invite. An owner with no row covers nobody; `member` rows never cover. 10 people per owner, not per brand. Team pool left as an open decision for Leo. |
| 3 | high | Members steer the owner's unattended public posts: slideshow campaigns read brand kit, facts and learnings; a back-dated write could hide from the owner's screens. | Brand kit, fonts, facts and learnings are read-only for members. Stamps never go backwards (`greatest(..., row + 1 ms)`). `cs_brand_edits` records who last changed each key, shown on the team list. |
| 4 | high | A member deleting, moving or re-texting a post the owner scheduled through Zernio: Zernio still publishes the old one and the owner loses the card. | `cs_brand_swap` refuses any change to or removal of a held post; the brand sync puts held posts back before every save, so an honest member's device never hits the refusal. |
| 5 | medium | Stale tabs silently revert days of edits on whole-value keys; the doc wrongly said calendar notes merge and that shared pages never remove whole keys (Delete plan does). | Member saves are compare-and-set with a visible "didn't save" message; all brand keys refresh when a tab comes back; `cs_brand_drop` writes a tombstone into the owner's list. Doc corrected; the owner's own stale tab is listed as a known limit. |
| 6 | medium | Shared browsers: an owner signing in after a member uploads the member's stale copies; teardown through the patched storage sent deletions; sync state not keyed by user. | Brand sync state is per user and brand; teardown and sign-out use raw storage calls after a final flush; another account's shared-brand leftovers are removed before any engine starts. |
| 7 | medium | `forgetUnseen` could delete a key another tab had just created. | A key is only forgotten if this device saw it confirmed in the cloud (`seen`), and pending is re-read from storage first. |
| 8 | medium | Invites as an account-creation and email relay; timing enumeration; a squatted account could paywall a future customer. | Accounts are made only at `start`, for someone holding a live link. Global (200 a day) and per-recipient (3 a day) caps, inviter must have an active plan, names stripped and cut in a plain-text email. |
| 9 | medium | Account creation and the `member` row weren't atomic: a failed insert left a free, open account. | The account carries `postmosis_invited_by` from creation; the app treats it as `member` without a row and `covered` writes the row. Inserts never overwrite an existing row. |
| 10 | medium | Service-role functions would be callable by authenticated through Supabase's default EXECUTE grant; `profile_id` allowed `_`. | Every function revokes EXECUTE from public, anon and authenticated, then grants as listed; the test checks `has_function_privilege` for each. `profile_id` is `^(me|p[a-z0-9]{1,39})$`. Helpers stay in `public` but with no grant (a new schema on the shared project was judged a bigger change than it saves). |
| 11 | medium | Member-written rows are untrusted input: `javascript:` links, loaders that throw, 8 MB rows that fill localStorage. | Swap refuses non-JSON, rows over 4,000,000 characters for posts or 500,000 for others, and any string starting with `javascript:` or `vbscript:`. Shape checks on read are not added; a malformed row can make one page of that brand show an error, and the loaders already fall back on a parse failure. |
| 12 | low | Shared entries would leak into the member's synced brand list through the four save paths. | `saveProfiles` strips shared entries; tested. |
| 13 | low | A brand removed by an older owner build stays shared. | `cs_brand_reach` also requires the profile to be in the owner's synced brand list. |
| 14 | low | The allow-list missed brand fonts 4 and 5. | Added (read-only). |
| 15 | low | The invite token sat in the query string (logs, the sign-in redirect, Resend's copy). | The link carries it in the fragment; the page moves it to device storage at once. Resend still stores the email itself. |
| 16 | low | The migration's foreign keys queue academy sign-ins; "the owner's code stays as it is" overstated. | Deploy step 1 now says apply in a quiet window with `lock_timeout`; the doc says which shared modules change shape. |
