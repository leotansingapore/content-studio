# A YouTube how-to for filming and editing a talking head, one per profession

Status: todo
App Postmosis (postmosis.com), owner Leo + Claude, phase 3 (Reach that compounds).

## Why

Later has the biggest YouTube channel of the eight, 57.1K subscribers and 752 videos (youtube.com/latermedia), and none of the eight edits phone video at all (research/teardown.md, move 18). A video that shows a professional filming on a phone and editing it in Postmosis shows the gap.

Shares work with the hub card faces-leo-crosspost (every founder reel also goes to LinkedIn and YouTube Shorts). The hub card owns Shorts from Leo's weekly reels and the Zernio seats. This card owns the long how-to videos and where they sit on postmosis.com.

## What we have today

Checked 30 Oct 2026 against the live site, ~/postmosis-site origin/main (2b81272) and the vault.

- /guides/talking-head-video covers filming and editing a talking head in writing (live, 200). The vault adds short-form-video-editing and short-form-video-marketing.
- The site links no YouTube channel and embeds no video, and no page carries VideoObject markup (grep of the site's src).
- faces-leo-crosspost step 2 notes Leo may need to make a YouTube channel first.
- The video editor exports 9:16, 4:5, 1:1 and 16:9 in one run (product-truth.md), so one edit gives the 16:9 video and the Shorts.

## What to do

1. Leo decides the channel, his own or a Postmosis one. Making a channel and posting in public are his call.
2. Claude writes six outlines in ~/Documents/Postmosis/copy/youtube/, one per /for audience, each about 5 minutes: film a talking head on a phone for that work (an agent's listing walkthrough, a coach's tip, a consultant's take), then cut pauses, add captions and export sizes in Postmosis. Built from /guides/talking-head-video and the audience's example week. Gates: the brief first, aicheck under 15, brief-check. Leo reads each outline.
3. Leo films each in one sitting and edits it in Postmosis's /edit, so the video shows the real product.
4. Leo uploads it. The description links the matching guide and the walkthrough with src=postmosis&ref=youtube-<audience>.
5. Claude embeds each video on /guides/talking-head-video and its /for page with a click-to-load player and VideoObject markup (name, description, thumbnail, upload date, duration). Run next build and the site's tests, check 390 wide, push to main.
6. Shorts are cut from each through faces-leo-crosspost's flow.

## Done when

- Six videos are live, one per /for audience, each edited in Postmosis.
- Each is embedded on its guide and /for page with VideoObject markup that parses, and the site's tests pass.
- Bookings with ref=youtube-<audience> show in the Monday read-back.

## Open questions

None.
