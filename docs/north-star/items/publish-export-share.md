# Download, share or post from your phone

`publish-export-share` | publish | phase 7 | status: partial | /north-star#publish-export-share

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no download or share button in the recording or the captures; its posts go out through its own scheduler (publish-schedule, publish-tiktok).

The video editors set the bar, because most of them stop at the file:

- Instagram's Edits app has "Export" at the top right, then "Save to device" or "Open in Instagram", and shares straight to Instagram, Facebook, Stories or Messages. Export goes up to 4K with no watermark, while Instagram itself posts at 1080p ([App Store](https://apps.apple.com/us/app/edits-an-instagram-app/id6738967378), [walkthrough](https://primalvideo.com/video-creation/editing/how-to-use-the-new-instagram-edits-app-step-by-step/)).
- Descript's "Export" > Destination offers a local file (MP4 or GIF at 480p to 4K), a web link with a share page and an embeddable player, YouTube, podcast hosts and Google Drive. It has no scheduling and no TikTok, Instagram or LinkedIn posting, which users have asked for on its feedback board ([source](https://help.descript.com/export-and-share/export-and-publishing-overview.md), [board](https://feedback.descript.com/features/p/publishing-scheduler)).
- Vizard downloads, shares as a link, publishes, or exports straight to Google Drive, with view access per export. Free exports are 720p and up to 10 minutes, paid up to 4K ([pricing](https://vizard.ai/pricing), [help](https://help.vizard.ai/en/collections/7727292-workspace-projects)).
- VEED renders on its servers so the user can leave the page, offers private, public or "Anyone with the link can view", and ends at the download: each size is exported and uploaded by hand. Free exports are 720p with a watermark ([source](https://intercom.help/veed/en/articles/10531327-how-to-export-your-project), [repurpose](https://veed.io/tools/repurpose-video)).

## What we have today

Every format can be downloaded, each from its own maker, and nothing hands a post to the phone.

- Text: `Copy` everywhere strips markdown and adds the sign-off, disclosure lines and tagged links (`src/lib/plainText.ts`).
- Carousels: `/carousel` downloads 1080x1350 PNGs ("Download all", or "PNGs" on LinkedIn) and one PDF ("Download PDF" for a LinkedIn document post) (`src/pages/CarouselPage.tsx`, `src/lib/carouselRender.ts` `downloadBlob`, `src/lib/pdf.ts`). The same slides are drawn as PNGs inside Post it for me by `carouselPngs` in `src/components/PostItForMe.tsx`.
- Videos: the editor exports several sizes in one run (9:16, 4:5, 1:1, 16:9, as filmed) with no watermark and a download link per file (`src/components/ExportSizes.tsx`, `src/lib/exportVersions.ts`, `src/lib/fastExport.ts`), through the export queue in `src/lib/videoMedia.ts`, so a run keeps going on other pages. Clips download from `ClipFinder.tsx`. The edited file exists only in that browser tab once exported; the upload stays in IndexedDB on that device.
- AI pictures: kept in Media on the device (`src/lib/mediaLibrary.ts`).
- A share link exists for review only: Share for review (`/drafts?review=<id>`, `src/lib/previewLinks.ts`, `supabase/hub/012_preview_links.sql`) makes a read-only text snapshot with comments, expiry and revoke. It carries the words only, never slides or video.
- The phone: a scheduled post due within the hour sends a web push "Due at <time>" with the post's first line, and tapping it opens Write (`dueMessage` in `supabase/functions/notify/logic.ts`, url `/generate?draft=<id>`).
- Phone sharing exists in one place: Industry news uses `navigator.share` for a text message (`src/components/IndustryNews.tsx`).
- No Google Drive, no download on My posts cards, no file share from the phone.

## Build

Two steps. Step 1 needs no schema change and no new spend. Step 2 (links that show the slides or the video, and Drive) waits for Leo.

Gate: the new buttons and sheet show only when `leoOnly(email)`. The notify change applies only to accounts whose email passes `leoOnly`. `run.ts` reads the sign-in email only on the weekly-email path today (`confirmedEmail(await deps.authUser(uid))`), so the push branch makes that same read when exactly one due post is claimed, and treats a failed read as not Leo.

### Step 1, files

- `src/lib/postFiles.ts` (new): move `carouselPngs` here from `PostItForMe.tsx` (which then imports it) and add `postFiles(userId, draft): Promise<{ files: File[]; missing: number } | { video: string } | null>`.
  - A carousel draft uses its saved carousel (`d:<draftId>`), else slides split from its text with `splitDraftIntoSlides`.
  - A draft with `attached` device files uses those files.
  - A `video-<pid>` draft returns `{ video: pid }`.
  - Text returns null.
  - `missing` counts slide pictures that are not on this device; the slides still draw without them.
- Download on My posts cards, Library cards (publish-library) and Write's saved result:
  - carousel: `Download slides` (one PNG each, named with `slideFileName`) and `Download PDF` (via `src/lib/pdf.ts`);
  - picture: `Download picture`;
  - video: `Export the video`, which opens `/edit?p=<pid>#export` and scrolls to the export sizes (add `id="export"` there and use `useScrollToHash`);
  - text: the existing `Copy`.
  While files are drawn the button reads `Drawing the slides...`. On failure: `Couldn't draw the slides. Try again.`

### Step 1, post from your phone

`src/components/PhoneHandoff.tsx` (new), a sheet opened by `?handoff=<draftId>` on `/drafts` (and by a `Post from your phone` button on cards):

```
Post it from your phone                                         [x]
1  Copy the caption                                  [Copy caption]  (done: check mark)
2  Share the slides to Instagram or TikTok           [Share 6 slides]
   Pick Instagram or TikTok in the list, then paste the caption.
3  Mark it posted once it's up                       [Mark posted]
```

- On a phone (`pointer: coarse` and `navigator.canShare({ files })` true):
  - step 1 copies the caption as `Copy` does today;
  - step 2 calls `navigator.share({ files })` with the files only, because the caption is already on the clipboard and Instagram tends to ignore shared text (unverified);
  - step 3 marks the draft posted (`setDraftStatus`).
  Each step shows a check when done, and the sheet keeps those checks for the visit.
- When some slide pictures are not on this phone: `<n> slide pictures are on another device, so those slides go without them.`
- For a video post on a phone: `The video is on the device that made it. Export it there, then AirDrop or send it to this phone.` with `Copy caption` still shown.
- On a computer: `Open this on your phone` with a `Copy link` button (`CopyLinkButton`) for `/drafts?handoff=<id>`, and the line `When it's due, the phone alert opens this too.` when push is on for the account.
- If `navigator.share` is missing or refused: `This browser can't share files. Download them instead.` with the step 1 Download buttons.
- A cancelled share (the user closes the share list) changes nothing and shows nothing.
- Notify: its `Post` type (`supabase/functions/notify/logic.ts`) drops `zernio` when it parses drafts today, so the parser gains `zernioPostId: str(d.zernio?.postId)`. `dueMessage(due, { handoff })` then uses the url `/drafts?handoff=<id>` (plus `&profile=` as today) for a single due post with no `zernioPostId` when `handoff` is true (Leo's accounts); everyone else keeps `/generate?draft=<id>`.

### Step 2, needs Leo

- A share link that shows the slides: Share for review's snapshot gains the slide texts (the RPC `cs_create_preview_link`, today 7 text and integer arguments, takes a new `p_slides jsonb`), and `/review/:token` draws them with the brand colour. That is a new migration replacing the function from `supabase/hub/012_preview_links.sql`, with its grants and test file.
- Video and picture links, and videos on the phone: need the cloud bucket from brand-media-library step 2 (a new migration numbered at build time, since 024 is the last, and storage spend). With it, Export can keep a copy, the hand-off sheet can share the video on the phone, and a view-only link can play it.
- Save to Google Drive: a Google OAuth connection and a new integration, which is an auth change and Leo's call.

### Copy

Exact strings: `Download slides`, `Download PDF`, `Download picture`, `Export the video`, `Drawing the slides...`, `Couldn't draw the slides. Try again.`, `Post from your phone`, `Post it from your phone`, `Copy the caption`, `Copy caption`, `Share the slides to Instagram or TikTok`, `Share <n> slides`, `Share the picture`, `Pick Instagram or TikTok in the list, then paste the caption.`, `Mark it posted once it's up`, `Mark posted`, `<n> slide pictures are on another device, so those slides go without them.`, `The video is on the device that made it. Export it there, then AirDrop or send it to this phone.`, `Open this on your phone`, `Copy link`, `When it's due, the phone alert opens this too.`, `This browser can't share files. Download them instead.`

### Data

- Nothing new is stored in step 1. Files are drawn on the device each time from the synced draft and carousel, and device-only pictures stay device-only.
- `?handoff=` is a URL state, so the sheet survives a reload and opens from the push.
- No table and no migration in step 1.

### AI and cost

None. Drawing slides and sharing files happen in the browser. No model call, no Jev question, no cap.

### Deep links

- `/drafts?handoff=<draftId>` opens the hand-off sheet, push. An unknown id shows the list with the toast `That post isn't in My posts on this account.`
- `/edit?p=<pid>#export` scrolls to the export sizes.
- Add `handoff` to `links.drafts(...)` and the rows to `docs/deep-links.md`.

## Done when

- [ ] On a 1440 px screen, Download slides on a carousel post saves one PNG per slide at 1080x1350, and Download PDF saves one PDF.
- [ ] On an iPhone and an Android phone, the hand-off sheet copies the caption and opens the share list with the slides, and Instagram accepts them (checked by hand on Leo's phone).
- [ ] Mark posted moves the post to Posted in My posts and the Library.
- [ ] A due push for a post with no Zernio post opens the hand-off sheet on the phone; a Zernio post's push still opens Write.
- [ ] A video post shows the video line on the phone and `Export the video` on the computer lands on the export sizes.
- [ ] Others see none of the new buttons, and their due alerts are unchanged (notify test).
- [ ] 390 px and 1440 px checked by eye; build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/postFiles.test.ts` with fake stores: a carousel draft with a saved carousel gives one file per slide; without one it splits the text; `attached` files come through; a `video-` draft returns its project id; missing pictures are counted.
- `supabase/functions/notify/logic.test.ts`: the draft parser keeps `zernioPostId`; `dueMessage` uses the hand-off url only with `handoff` true and no `zernioPostId`, and Write otherwise; a two-post alert still opens `/home`.
- `supabase/functions/notify/run.test.ts`: the push branch reads the email once, and a failed read sends the old url.
- `src/lib/autoPost.test.ts` keeps passing after `PostItForMe.tsx` imports `carouselPngs` from `postFiles.ts`, and the build proves the move compiles.

## Open questions

- Step 2 needs Leo's yes on two things: the snapshot change to Share for review, and the media bucket with its storage spend (shared with brand-media-library).
- Google Drive: worth a Google sign-in for advisers, or is Download enough? Leo decides.

## Related

publish-library, publish-schedule, publish-tiktok, brand-media-library, formats-carousel-designs, edit-video, trust-approval
