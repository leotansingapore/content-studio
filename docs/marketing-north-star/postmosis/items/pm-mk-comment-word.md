# Talking-head videos end with comment WALKTHROUGH, each answered by hand once

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 3 (Reach that compounds).

## Why

The Meta Ad Library showed about 74 Predis.ai results on 30 Oct. Of the 22 that loaded, 14 came from its own page and 4 from creators' pages running ads "with Predis.ai". 8 of the 22, all 4 creator ads among them, ask viewers to comment a word to get the link by DM (facebook.com/ads/library, q=Predis.ai, research/teardown.md, move 3).

Shares work with the hub card faces-leo-weekly, which owns the reel scripts and the Tuesday filming; this card adds only the closing ask and the replies.

Those ads promise the link by DM. Here Leo answers each comment by hand, once, which keeps inside the standing rule: no automated DMs, nobody chased more than once.

## What we have today

Checked 30 Oct 2026 against the hub specs, content-studio origin/main (268438fe) and ~/.local/bin.

- Leo's weekly reels come from the hub card faces-leo-weekly (started). The Sunday script generator, ~/.local/bin/generate-weekly-content.sh, has no line about Postmosis (grep, 30 Oct).
- Auto-DM in Content Studio is Leo only, and the posting switch does not open it (product-truth.md, "Shipped 28 Oct"). It stays off for this card.
- Reply drafts in the app turn pasted comments into replies to copy out, and never post (product-truth.md, /recruit/engage).

## What to do

1. Claude adds a closing line to two of the week's three reel scripts: "Comment WALKTHROUGH and I'll send you the link." The scripts pass aicheck under 15 with the line in.
2. Leo films them in the Tuesday session (faces-leo-weekly) and posts them.
3. For three days after each post, Leo replies by hand to each person who commented the word. One reply, or one DM since they asked for it, with the link carrying src=postmosis&ref=reel-<yyyy-mm-dd>. No second message, and no tool sends it.
4. Leo notes how many comments had the word and how many links he sent. Claude counts bookings with ref=reel- weekly in the Monday read-back.
5. Once Leo's account is in the hub read-back, Jev judges which other comments ask how to join, as it does for the other accounts there.

## Done when

- Four weeks with two reels a week ending on the ask.
- Every comment with the word got exactly one reply by hand, by Leo's count.
- The Monday read-back shows bookings with ref=reel- for those four weeks.

## Open questions

None.
