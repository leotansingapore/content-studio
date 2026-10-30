# Every walkthrough ends by asking for one peer by name

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 1 (Every booking is held).

## Why

AuthoredUp's affiliate page has a door just for referring friends and readers (authoredup.com/affiliate-program). Buffer pays 25% for 12 months on any customer a referral brings (buffer.com/partners), Taplio 30% for a year (taplio.com/affiliates) and Supergrow 30% for life (supergrow.ai/affiliate-program). Research/teardown.md ranks this first among the moves that need only Leo's time.

Postmosis has no public price, so the ask is a name and a slot. Money for referrals waits for pm-mk-referrals.

## What we have today

Checked 30 Oct 2026 against content-studio origin/main (268438fe), ~/calendarios origin/main (7e715fe) and the vault.

- No peer ask, no referral link and no count of referred bookings.
- The walkthrough script it belongs in does not exist yet (pm-mk-walkthrough-script).
- Pick a Time saves ?src= and ?ref= on a booking as a pair, each up to 128 characters (calendarios useBookingFlow.ts and normalize_external_token in its migrations), so a peer's booking can say where it came from (pm-mk-booking-source).
- Standing rule: nobody is chased more than once.

## What to do

1. Claude writes the script's last minute: "Who else do you know who should be posting and isn't?" Leo asks once. No name is a fine answer.
2. If they name someone, Leo gives the customer the walkthrough link with src=postmosis&ref=peer to pass on. Leo does not write to the peer himself unless the customer introduces them.
3. When a peer books, Leo holds a slot for them in the same week.
4. Each call note records asked, named and booked (yes or no). Claude counts all three weekly from the notes and the bookings with ref=peer, and adds the line to the Monday read-back.
5. Any reward for a referral, such as money off or a free month, needs billing: stop and ask Leo before offering one.

## Done when

- The script's last minute holds the ask.
- Four weeks of counts exist: asked, named, booked.
- At least one booking arrives with ref=peer.

## Open questions

None.
