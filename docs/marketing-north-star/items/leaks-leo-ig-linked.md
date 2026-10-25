# Leo's Instagram can be scheduled and promoted as ads

Status: todo
App all apps, owner Leo, phase 1 (stop the leaks).

## Why

Oren John (1:41:02) on whitelisting: a creator gives you "what's called an ad code, you can plug it right into Meta ... and it will run that ad from their account", and "they often perform way higher than regular ads." At 1:41:47 he adds that some brands run "30% 50% of the ads in their account white-listed from other accounts."

Phase 3 makes Leo the face of the adviser apps at three reels a week, and phase 4 runs organic winners as partnership ads. Both need @leotan_js to be a professional account that our tools can post to and that a brand's ad account can promote from his handle.

## What we have today

Checked 26 Oct 2026.

- @leotan_js is Leo's personal Instagram (memory talking-head-reel-skill.md). Its follower and play numbers: see private-notes.md on Leo's Mac (card faces-leo-weekly).
- The Meta system-user token reaches three Instagram accounts through its Pages, the IG map in ~/Documents/moneybees-reels/tools/publish_ig.py: the_moneybees, finternshipofficial and activity_tracker_io. @leotan_js is not one of them. The same file's header says "Leo's personal account is not linked to a Page in that Business Manager yet, so Leo cards wait with a note."
- The reels board already has a `leo` brand (`BRANDS` in tools/studio.py). A Leo card that comes due today gets the note "Instagram: Leo is not connected, post it by hand" and is skipped.
- Radiant VEP shows the route that works without a Page: its Instagram is connected in Content Studio through Zernio, and publish_ig.py posts it through `IG_ZERNIO = {"radiant": ...}` (since 20 Oct).
- Zernio needs a card on file before a third connected account, at about US$6 a month per account from the third to the tenth (memory zernio-live-1017.md). Content Studio caps each team at 10 accounts (ZERNIO_MAX_ACCOUNTS).
- generate-weekly-content.sh writes three reel scripts and a carousel for Leo's account every Sunday at 12:00 (launchd com.leo.weekly-content-generator). Nothing posts them for him.

## What to do

Instagram renames these menus often. If a name below has moved, search Settings for the word in quotes.

1. Leo, in the Instagram app: if @leotan_js is still a personal account, switch it to professional ("Account type and tools", then "Switch to professional account"), choosing Creator.
2. Leo: turn on partnership ads ("Partnership ads" or "Branded content" under creator tools) and allow brand partners to boost his posts. Approve @finternshipofficial and @the_moneybees as partners when they ask. This is the permission an ad account needs to run his post from his handle.
3. Leo, in Meta Business Suite (Settings, Accounts, Instagram accounts, Add): add @leotan_js to the Business Manager that runs the MoneyBees ad account. Then, under Users, System users, assign the Instagram account to the system user, so the token the read-back already uses can read its insights. This is an access change only Leo makes.
4. Leo: approve the Zernio seat (open question 1). Then Leo and Claude connect @leotan_js in Content Studio /accounts under Leo's own brand profile, through Zernio's Instagram sign-in.
5. Claude: add `"leo": "<Leo's Content Studio profile id>"` to `IG_ZERNIO` in publish_ig.py, so Leo's approved board cards post through Zernio at their slot, the same way Radiant's do.
6. Claude, read-only checks: Zernio's account list shows @leotan_js under Leo's profile, and `me/accounts` on the system-user token now returns his Instagram account. Add it to the account list in the Monday read-back (loop-monday-readback).
7. Claude: check one Leo reel without posting it, using `python3 tools/publish_ig.py --card <id> --dry`, which for a Zernio brand runs Zernio's validate calls and publishes nothing. Then Leo approves the card and it posts at its slot.

## Done when

- @leotan_js is a professional account with partnership ads turned on.
- Business Settings lists @leotan_js under Instagram accounts, assigned to the system user.
- Content Studio /accounts shows it connected, and one approved Leo card posts at its slot with no "not connected" note.
- In Ads Manager, the MoneyBees ad account can pick @leotan_js as a partnership ad identity on a new ad.

## Open questions

1. Pay about US$6 a month for the extra Zernio seat? Recommended: yes. Without it the Tuesday reels wait for Leo to post them by hand.
2. Creator or Business as the professional account type? Recommended: Creator, which is the type made for a person's own account.
