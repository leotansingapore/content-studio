# Profile bios kept compliant

`trust-profile-governance` | trust | phase 8 | status: partial | /north-star#trust-profile-governance

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has nothing for this in Leo's recording or its public pages. The adviser-compliance tools treat a social profile as advertising that needs approval, the same as a post:

- Hearsay Social (Yext), "Central Profile Control": update an adviser's or agent's profiles across all networks from one place, with suggested profiles and pre-review of profile changes. ([platform](https://www.yext.com/platform/hearsay-social), [datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf))
- Proofpoint Patrol, "Closed-loop profile governance": onboarding a profile needs supervisory approval, approved profiles are kept as snapshots for version control, unauthorised profile changes are rolled back automatically, recertification reviews run on a schedule, and onboarding and offboarding run through an API; its price is not published. ([data sheet](https://www.proofpoint.com/uk/resources/data-sheets/patrol))

How Patrol performs the rollback is not described, and Instagram and TikTok do not document an API that writes a bio (unverified), so this spec flags and restores by hand.

## What we have today

- The account audit on /analytics (`src/components/AccountAudit.tsx`, `src/lib/accountAudit.ts`, edge functions `audit-social-account` and the weekly `refresh-social-audits`) reads an Instagram or TikTok handle through Apify. It stores `profile` in `cs_social_audits` (SQL 005): `fullName`, `bio` (500 characters), `link`, `isPrivate`, followers. `openAudit(platform, handle)` returns the saved row and refreshes it at most once per 20 hours. Refreshes are also held to 6 per person per day (`MAX_RUNS_PER_DAY` in `supabase/functions/audit-social-account/index.ts`, counted in `cs_social_audit_runs`, not in `usageCaps.ts`); past that it answers "You've used today's updates. Your audit refreshes again tomorrow." A refresh costs about US$0.05 of Apify for Instagram and US$0.09 for TikTok (docs/account-audit.md). Opening a handle that has no audit yet creates one, so it also appears in the /analytics audit list.
- "Profile score" (`src/components/ProfileScore.tsx`, writing-judge mode `profile`, cap `profile-score` 10) scores name, bio, pinned posts and contact out of 100 and writes name and bio rewrites within `PROFILE_LIMITS` (Instagram name 30 and bio 150, TikTok name 30 and bio 80). Its questions are about pulling followers and clients, so nothing in it looks for a regulated claim or a missing line.
- Social accounts (/accounts, `social` function, Zernio) knows each connected account's `username`, display `name` and `url` on all six networks (`supabase/functions/social/logic.ts` lines 106-131). Zernio does not return a bio as far as this code reads (unverified whether its API has one).
- Compliance chips (`scanCompliance` in `src/lib/compliance.ts`) and the brand kit's allowed links (`allowedLinks` in `src/lib/brandRules.ts`) exist for posts and are never run on a bio. `allowedLinks` is empty when the kit has no offers, and then nothing is flagged.
- Team review's `cs_submit_for_review` accepts any platform and format matching `^[a-z0-9-]{1,40}$` and any draft id up to 200 characters. A bio can therefore go through a leader's approval with no schema change. A member's /team list (`src/components/team/MemberView.tsx`) shows "Open in Write" only for a draft id it finds in the drafts store (line 205), so a profile submission shows no link today.
- The Needs-you count is `countNeedsYou` in `src/lib/needsYou.ts`, worked out on the device in `src/pages/StudioLayout.tsx` (line 253) for the badge on the Pipeline rail icon and the phone Calendar tab; the Calendar's "Needs you" strip (`CalendarPage.tsx` line 1526) lists the items. Home has no count of its own.
- Missing: a check of the bio against firm rules and required lines, an approved snapshot, a flag when the live profile drifts from it, and a re-check date.

## Build

Gate: the new section and every check run only when `leoOnly(email)`.

Each account gets one row that reads the live profile, checks it, records the approved version, and keeps comparing the live profile against that version.

### Screens and states

/accounts gets a section `#profiles` under "Connected", titled "Your profiles". Rows: every account in the open brand's Zernio status, plus the brand kit's Instagram handle (`brand.instagram`) when it is not connected.

```
Your profiles                                                     (i)
 Instagram  @leotan.sg     Approved 12 Oct by you      Checked 2 days ago   [Check again]
 TikTok     @leotan        Changed since it was approved on 3 Oct
            - Helping young SG families plan for retirement
            + Guaranteed 6% returns. DM me
            Breaks: "Risk-free" ... | Missing your bio line
            [Approve the new one]  [Copy the approved bio]  [Open TikTok]
 LinkedIn   Leo Tan        Not approved yet            [Paste your bio]
```

Row states:
1. Not read yet (Instagram or TikTok with no audit row): "Read my profile". Pressing it calls `openAudit` and shows "Reading your profile..." (the audit's own refresh limit applies).
2. Read, never approved: the check results, then "Approve this profile", or "Send to your leader" for someone who is a member of a team.
3. Waiting for the leader, while the team review state is `pending`: "Waiting for your leader's approval." When the leader asks for changes or rejects it (`changes_requested`, `rejected`): "Your leader asked for changes: {comment}" or "Your leader turned this down: {comment}", with "Send to your leader" again once the text differs.
4. Approved and unchanged: "Approved {d MMM} by {who}" beside "Checked {time ago}", so the reader sees both when it was approved and how fresh the read is.
5. Changed since approval: amber "Changed since it was approved on {d MMM}." with a line-by-line before and after of name, bio and link, the check results for the new text, and three buttons: "Approve the new one" (or "Send to your leader"), "Copy the approved bio", "Open {platform}".
6. Due again: approved more than 90 days ago shows "Approved {n} days ago. Check it again." with "Check again".
7. Private account (`isPrivate`): "This account is private, so its bio can't be read. Paste it below." and the paste box.
8. No read on this network (LinkedIn, Facebook, YouTube, Threads): "Paste your bio" opens a 500-character box. Checks and approval work on the pasted text. A drift check here covers only the display name Zernio returns, and the 90-day re-check covers the rest.
9. Read failed: "Couldn't read this profile. {reason from the audit}" with "Try again".
10. Over the audit's limit: the audit's own refusal text, shown in the row.

Check results, all in code except item 4:
1. Bio line: the profile must carry the brand's bio line (Data). It is skipped when trust-disclosures' "Your bio" tick is off. With no bio line set, trust-disclosures' who-you-are line stands in when it fits the platform's bio limit (`PROFILE_LIMITS`: Instagram 150, TikTok 80; the pasted networks use 500); when it is too long, the row says "Your who-you-are line is longer than {platform} allows. Add a short bio line." and links to `#profiles-rules`.
2. Compliance: `scanCompliance(name + "\n" + bio)`, shown as today's warn and error chips.
3. Link: the profile link must be in `allowedLinks(brand, accounts)` or be the brand's published link-in-bio page (`publicPageUrl(origin, slug)` for the brand's page from `fetchMyBioPages()` in `src/lib/bioPage.ts`). Otherwise: "This link isn't one of your offers or your link-in-bio page." When the kit has no offers (`allowedLinks` empty) and no bio page, the link check is skipped, as it is for posts.
4. Brand rules: when brand-rules has shipped, its writing-judge `rules` check runs on name and bio and its hit rows show here.
- All clear: "Keeps to your rules."
- Approving with a warning shows the warnings in the confirm and still allows it (warn by default). A brand whose disclosures are set to Block cannot approve a bio missing its bio line; the button reads "Add your bio line first."

A small form `#profiles-rules` at the bottom: "Bio line" (80 characters, fits TikTok), "Check every" (30, 90 or 180 days, default 90).

Needs you: the badge on the Pipeline rail and the phone Calendar tab gains changed and due profiles, from the device cache (Data), so it stays a no-network count. The Calendar's "Needs you" strip lists each one as "{platform} bio changed" or "{platform} bio due for a check", linking to its row.

Team leaders: a bio sent for approval appears in the /team queue like a post, with the chip "Profile bio". On the member's /team list, a `format: "profile"` submission gets "Open profile" linking to `/accounts?account=<platform>:<handle>` in place of "Open in Write".

### Copy

- h2 "Your profiles"; InfoTip "Your name, bio and link are advertising too. Approve them once and we tell you when they change."
- Buttons: "Read my profile", "Approve this profile", "Send to your leader", "Approve the new one", "Copy the approved bio", "Open {platform}", "Check again", "Paste your bio", "Try again"
- States: "Reading your profile...", "Waiting for your leader's approval.", "Your leader asked for changes: {comment}", "Your leader turned this down: {comment}", "Approved {d MMM} by {who}", "Checked {time ago}", "Changed since it was approved on {d MMM}.", "Approved {n} days ago. Check it again.", "Not approved yet", "This account is private, so its bio can't be read. Paste it below.", "Couldn't read this profile. {reason}"
- Checks: "Keeps to your rules.", "Missing your bio line", "This link isn't one of your offers or your link-in-bio page.", "Your who-you-are line is longer than {platform} allows. Add a short bio line.", "Add your bio line first."
- Confirm: "Approve with {n} warning?" / "Approve with {n} warnings?" with "Approve" and "Cancel"
- Toasts: "Approved. We'll tell you if it changes." / "Sent to {leader}." / "Approved bio copied. Paste it into {platform}."
- Rules form: "Bio line", placeholder "Rep of ABC Financial Advisers", "Check every", options "30 days", "90 days", "180 days"
- Team chip: `FORMAT_LABEL.profile = "Profile bio"` in `src/components/team/shared.tsx`; member link "Open profile"
- Calendar strip: "{platform} bio changed", "{platform} bio due for a check"
- `you` in "by {who}" reads "you"; a leader's approval reads their display name.

### Data

- Approved snapshots: `content-studio-profilesnaps-${scoped(userId)}` = `Record<string, Snap[]>`, keyed `${platform}:${handle}` (handle lowercased; for pasted networks the Zernio username), newest last, kept to 10 per account. `Snap = { name: string; bio: string; link: string; hash: string; at: string; by: string; submissionId?: string }`. `hash` is `reviewHash` of the review text below, so a leader's approval and the local record match. A newer snapshot replaces an older one only by being newer, and nothing is ever deleted to undo an approval.
- The rules form saves to `content-studio-profilerules-${scoped(userId)}` as `{ bioLine?: string; everyDays?: 30 | 90 | 180 }`.
- Pasted bios: kept in the snapshot when approved; an unapproved paste lives in component state only.
- Device cache for the Needs-you count: `cs-profilecheck-${scoped(userId)}` = `Record<accountKey, { changed: boolean; due: boolean; at: string }>`, written whenever /accounts or /analytics reads an audit. `countNeedsYou` takes one more argument, the number of flagged accounts, and `StudioLayout.tsx` line 253 passes it.
- A leader's approval goes through `submitForReview({ draftId: "profile-" + platform + "-" + handle, platform, format: "profile", content: "Name: {name}\nBio: {bio}\nLink: {link}", flags: scanCompliance(...) })`. The immutable submission and the append-only event in SQL 011 are the record. `deriveReviewState(latest, hash)` on that content's hash gives none, pending, changes_requested, rejected, approved or edited_since_approval.
- New helpers in `src/lib/profileGovernance.ts`: `profileText`, `checkProfile`, `latestSnap`, `driftState(current, snap, now, everyDays)`, `lineDiff`.
- No schema change.

### AI and cost

- No new paid call. Instagram and TikTok profiles come from the account audit that already runs (about US$0.05 and US$0.09 a refresh, at most once per 20 h per account and 6 refreshes per person per day, plus the weekly cron). Other networks use Zernio's account list, which the page already reads under `social-read`.
- Checks 1 to 3 are code. Check 4 reuses brand-rules' writing-judge `rules` mode and its `rule-check` cap; without brand-rules it is left out.
- No new Jev question and no new cap.
- Writing a bio through a network's API: none in this build (Open questions).

### Deep links

- `/accounts#profiles` and `/accounts#profiles-rules` (useScrollToHash).
- `/accounts?account=<platform>:<handle>` scrolls to and highlights that row (push). The name `account` is used because `profile` is taken by the brand switch.
- The Calendar "Needs you" item for a changed or due bio, and the member's "Open profile" on /team, link to `/accounts?account=<platform>:<handle>`.
- Rows in docs/deep-links.md (/accounts moves out of the "(none)" row), builder `accountsProfileUrl(platform, handle)` in `src/lib/links.ts`.

## Done when

- [ ] On Leo's sign-in /accounts shows "Your profiles" with a row per account in the open brand; other sign-ins see /accounts as before.
- [ ] Leo's Instagram row reads name, bio and link from the audit, runs the three code checks, and "Approve this profile" records a snapshot that survives a reload on another device.
- [ ] Editing the bio on Instagram, then "Check again" after the audit refreshes, shows "Changed since it was approved" with the before and after, the Pipeline rail badge goes up by one, and the Calendar's "Needs you" strip lists the bio.
- [ ] "Copy the approved bio" copies the approved text; "Open Instagram" opens the edit page.
- [ ] As a team member, "Send to your leader" puts a "Profile bio" item in the leader's /team queue, and the leader's approval shows as "Approved {d MMM} by {leader}".
- [ ] A LinkedIn row accepts a pasted bio, checks it and approves it; a snapshot older than the chosen period shows "Check it again".
- [ ] `npm run build`, the full `npx vitest run`, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item `trust-profile-governance` flipped to live with its `ours` line, in the same commit.

## Tests

- `src/lib/profileGovernance.test.ts`:
  - `checkProfile` flags a missing bio line, ignores case and spacing in the match, and falls back to the who-you-are line only when it fits the platform limit;
  - an unknown link is flagged, an offer or the brand's `/l/<slug>` page passes, and with no offers and no bio page nothing is flagged;
  - the bio line check is skipped when the "Your bio" tick is off;
  - `scanCompliance` hits on the bio come through;
  - `driftState` returns unchanged, changed and due (at 89, 90 and 91 days for a 90-day period);
  - `latestSnap` takes the newest snapshot and the store keeps 10.
- `src/lib/needsYou.test.ts`: the count adds flagged profiles.
- `src/components/team/shared.test.tsx` (or the nearest existing test): `FORMAT_LABEL.profile` is "Profile bio".
- `src/lib/teamReview.test.ts`: the review text for a profile hashes the same as the snapshot hash.
- Prove each case bites by breaking the code once.

## Open questions

- Leo: should a team leader be able to make bio approval required for members (the "needs approval before posting" rule extended to profiles)? `cs_team_approval_rules` (SQL 014) is one row per team and member with no rule kind, so this needs a `kind` column or a new table, and a new setter beside `cs_set_approval_required`: a schema change.
- Writing bios from one place: read Zernio's API docs (docs.zernio.com) for any profile update call before building it. Instagram and TikTok are assumed read-only (unverified); a YouTube channel description and a Facebook Page's about text may be writable through their own APIs (unverified through Zernio).
- Leo, or the firm: the exact bio line advisers must carry and the re-check period. This spec defaults to 90 days.
- A Monday email line for a changed bio would need `notify` to read the snapshot rows from `cs_user_data`; left for later.

## Related

trust-disclosures, brand-rules, trust-compliance-check, trust-approval, trust-archive, publish-accounts, publish-link-in-bio, learn-real-numbers
