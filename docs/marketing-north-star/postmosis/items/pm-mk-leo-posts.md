# Leo's posts are made in Postmosis and link the walkthrough

Status: todo
App Postmosis (postmosis.com), owner Leo, phase 3 (Reach that compounds).

## Why

Shares work with the hub cards faces-leo-weekly (Leo films three reels every Tuesday) and faces-leo-linkedin-system (a strategy file, idea cards and a check before each post). Those cards own the filming habit, the scripts and the LinkedIn plan. This card adds what Postmosis needs from them: some posts are made in Postmosis, say so, and link the walkthrough.

FeedHive's founder has about 89K LinkedIn followers. AuthoredUp's has about 18K, and her posts open its Made-with wall. Supergrow's two founders have about 20K between them and sign its onboarding emails (research/teardown.md, pattern 2, each LinkedIn profile read logged out).

## What we have today

Checked 30 Oct 2026 against the hub data and specs, ~/postmosis-site origin/main (2b81272), content-studio origin/main (268438fe) and ~/.local/bin.

- faces-leo-weekly is started. A generator writes three reel scripts and a carousel every Sunday (hub ours line), and the hub plan finishes the reels with the talking-head-reel skill, outside Postmosis (hub spec, step 4).
- That generator, ~/.local/bin/generate-weekly-content.sh, has no Postmosis line or link (grep, 30 Oct).
- The hub's Monday read-back reads @the_moneybees, @finternshipofficial and @activity_tracker_io, not Leo's own account (hub ours line for loop-monday-readback).
- postmosis.com links none of Leo's social profiles (site src).
- Write's LinkedIn post check is live for everyone since 30 Oct (content-studio 268438fe, product-truth.md), so his LinkedIn posts can be checked inside Postmosis.

## What to do

1. Leo picks which account carries Postmosis posts, his own or a Postmosis one. Posting in public is his call.
2. Each week Leo makes at least one post in Postmosis itself, a carousel in the carousel maker or a clip cut in /edit. Only those carry the one line saying what made them.
3. Claude adds one Postmosis idea a week to the Sunday generator, one that shows the making: a carousel from a client question, or a clip before and after the editor. Back up the script, write the new version to a temp file and mv it in. The generated words pass aicheck under 15.
4. Every post that names Postmosis links the walkthrough with src=postmosis&ref=<network>-<yyyy-mm-dd> (pm-mk-booking-source), directly or through a tracked link /t/<slug>.
5. LinkedIn posts go through the LinkedIn post check in Write before posting (faces-leo-linkedin-system, step 3).
6. Claude counts bookings by those refs weekly in the Monday read-back. Once Leo's account is in the read-back, his Postmosis posts are labelled there.
7. Claude links Leo's profiles from /about and the Person markup (sameAs) once he names them (pm-mk-about-story).

## Done when

- Four weeks in a row, at least one post a week is made in Postmosis, says so, and links the walkthrough with its ref.
- Bookings with those refs show in the Monday read-back.
- /about links Leo's profiles.

## Open questions

None.
