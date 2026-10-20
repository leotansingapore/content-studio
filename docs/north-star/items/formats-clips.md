# Long videos into short clips

`formats-clips` | formats | phase 3 | status: partial | /north-star#formats-clips

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate". A seminar, webinar, podcast or Zoom recap is the adviser's own long format, and clips are its short remix.

## How the best do it

Fastlane shows no long-to-short clipper in Leo's recording. Asked "what can you do", Senna lists "clips" among what it makes (5:13), and Home has an "Ask Senna for" tile "Short videos" with the prompt "Make a short clip for my next post", but neither shows an upload of a long video (unverified what "clips" means there).

OpusClip sets the bar:
- ClipAnything, the default clip model, reads a link or upload for visuals, speakers, laughter, music and sentiment, applies genre narrative templates, and returns clips ranked by Virality Score. It costs 1 credit per source minute; clipping by visuals, sound and emotion is Pro, while Free and Starter clip by spoken words ([how to use](https://help.opus.pro/docs/article/how-to-use-clipanything.md), [pricing](https://www.opus.pro/pricing)).
- Its submit panel has "Clip Length" (default "Auto (0m-3m)"), a "Processing timeframe" slider that also limits what is charged, "Speech Language" with "Translate To", an Auto headline toggle, caption "Quick Presets" or "No Caption", a brand template, and a save-as-default option. Yield: 10 to 30 minutes of source gives 5 to 21 clips, 60 to 120 minutes gives 32 to 42 ([clip length](https://help.opus.pro/docs/article/select-clip-length.md), [how many](https://help.opus.pro/docs/article/how-many-clips.md), [credits](https://help.opus.pro/docs/article/how-are-credits-consumed.md)).
- An optional prompt finds a moment, an action, an emotion or a compilation ("Find the moments most likely to go viral on social media"), in English only, and the results page can be re-prompted ([prompt manual](https://help.opus.pro/docs/article/clip-anything-prompt-manual.md)).
- Auto Import watches the adviser's own YouTube channel hourly and either emails or builds projects with saved settings, for public videos over 3 minutes ([auto import](https://help.opus.pro/docs/article/auto-import.md)).

Others:
- Submagic "Magic Clips": a YouTube URL, upload or public Drive link, about 10 to 25 minutes of processing, 20 or more clips each with a transcript and a virality score in four named parts (shareability, hook_strength, story_quality, emotional_impact, summed to the total). Trim by timeline or transcript lines, add captions, a hook title and B-roll. An add-on at USD 19 a month for 10 uploads ([guide](https://care.submagic.co/en/article/how-to-use-magic-clips-step-by-step-guide-15mve5q/), [API](https://docs.submagic.co/api-reference/magic-clips.md), [cost](https://care.submagic.co/en/article/how-much-does-it-cost-to-use-submagic-1xm83pa/)).
- Vizard "Clip Preferences": "Clip preferred length" (for example "<30s", "Auto", "60s-90s"), "Ratios" 9:16, 1:1 or both, "Emojis" and "Highlight words", and "Templates" Default or Custom brand. 1 credit a minute, best on 15-minute or longer speech ([preferences](https://help.vizard.ai/en/articles/9188600-what-are-clip-preferences)).
- Quso.ai (formerly Vidyo.ai) imports from YouTube, Zoom, Loom, Drive and others, finds hooks, energy changes and emotional peaks, cuts at natural boundaries, reframes to 9:16 and captions, and keeps an editable transcript where selecting a passage cuts a custom clip ([product](https://quso.ai/products/ai-clips-generator)).
- Klap: "a one-minute long video produces about 5 video clips"; its API takes a target clip count and a free-text `transcription_context` of up to 1,000 characters for names and jargon ([site](https://klap.app), [API](https://docs.klap.app/endpoints/tasks)).
- Postiz meters clipping at 60, 120, 300 or 600 minutes a month ([pricing](https://postiz.com/pricing)). Captions (incl. Mirage) offers it on Max and above ([pricing](https://www.captions.ai/pricing)).

## What we have today

Checked against 08537d1 on 2026-10-20, and again at origin/main f2cb275 the same day (no change to these files). The engine is good; the path to it and the controls around it are thin.

- Find clips (src/components/ClipFinder.tsx, inside the editor under the export area): needs a transcript and 45 seconds or more. An optional "What should the clip be about? (optional)" box, then "Find clips", whose label shows the uses it takes ("2 uses, 18 left"). video-assist `clips` mode: the LLM (through `openaiFetch`: the OPENAI_MODEL secret, default `gpt-6-luna`, with `VIBE_MODEL` gpt-4.1 as the fallback) proposes about twice the clips kept, reading 40-minute windows with 90 seconds of overlap (`clipPasses` in video-assist/passes.ts, one `video-clips` use per pass), each clip 25 to 75 seconds (aim 30 to 60; `playable` keeps 18 to 120) with an optional skipped tangent. Jev scores each clip for standing alone (`STANDS_ALONE`), its opening line for stopping the scroll (`STOPS_SCROLL`, viewer `CLIP_VIEWER` "Singapore working adults scrolling Instagram Reels, TikTok or YouTube Shorts"), and for the asked topic (`MATCHES`). Yield by `clipCount`: 3 to 5 under 8 minutes, 4 to 8 up to 30 minutes, then 6 to 16 for an hour and 12 to 32 for two.
- Each clip becomes its own project with the long video's settings (`clipSettings`), so its captions, look and hook card follow whatever was set before finding. One combined score out of 100 shows (60% stands alone, 40% opening, in `rankClips`), with the tip "Out of 100: how well it stands alone and how strongly it opens.", plus an "On topic" chip when a topic was asked. "Export all N" exports every clip in turn and keeps going on other pages. The found list is kept for the session in a module-level `Map` (`found` in ClipFinder.tsx), so it is still there after leaving and coming back. The running find is not: `busy` is component state, so an adviser who leaves mid-find comes back to an idle "Find clips" button with no sign that a find is running, and if it is still running then, its list shows only after the page is opened again.
- Every new upload starts with the adviser's default editing skill (look plus optional instructions, `defaultSkill` in src/lib/videoSkills.ts), so clips inherit it. There is no way to pick a different look for one recording before finding.
- Long recordings are saved first and captioned in 10-minute parts (src/components/LongCaptions.tsx, `captionPlan` in src/lib/longCaptions.ts, job in src/lib/captionJob.ts), which keeps running while the adviser is elsewhere. The adviser has to press "Caption it in N parts"; the line under it names the parts and the uses left, and a day without enough uses captions the rest tomorrow.
- From a YouTube link (src/components/YoutubeClips.tsx, youtube-captions via DataForSEO, about US$0.006, cap `yt-captions` 10, then `video-clips` for the finding): the best moments by captions, each with "Watch" at its start and "Write a post", saved under `content-studio-ytclips-`. No file is cut; the panel says "To cut one into a reel, upload the video file above."
- Gaps: no way in that says "long video into clips" (the adviser uploads, presses Caption it for a long one, then finds the button under the preview); one fixed length range; no look chosen per recording; the score shows as one number; no MAS flag on what a clip says; link clips are timestamps only.

## Build

A direct path, "Long video into clips": drop a recording, set length, topic and look once, and come back to a ranked list of clips that are captioned, branded and checked.

### Screens and states

Entry: a new entry in the format registry `src/data/formats.ts` (formats-gallery): slug `clips`, name "Long video into clips", kind "video", `needs` the "Needs a video of you" requirement, `priceKind` "about" (a 1-hour recording), `cap` `video-clips`, `to` `/edit?panel=clips`. It opens a new `START_PANELS` value in VideoEditPage `Start`, allowed only when `leoOnly(email)` through the `startPanels(email)` helper that formats-custom adds (otherwise the param is ignored). `clips` and `own` open one at a time, since both read `about`. For Leo the panel absorbs YoutubeClips, which moves out of the bottom of the start screen; everyone else keeps it where it is.

```
Long video into clips                                         [Close]
+--------------------------------------------------------------+
|  Drop a webinar, seminar, podcast or Zoom recording          |
|  Up to 4 GB and about 2 hours. It stays on this device.      |
+--------------------------------------------------------------+
What should the clips be about? (optional)  [ e.g. hospital bills ]
Length:  Auto, 30 to 60 s | Short, 15 to 30 s | Long, 60 to 90 s
Look:    [ My look (default) v ]   (your saved skills, then the presets)
Or paste a YouTube link  [ https://youtu.be/...      ] [ Find moments ]
This video: about 5 uses of captioning and 2 of clip finding.  about US$0.35
```

- Empty: drop zone, choices with defaults (Auto, and the default skill by its name with "(default)", or the "Bold" style when the adviser has no skill).
- File dropped: the panel shows the plan before anything runs, from `captionPlan(duration)` (src/lib/longCaptions.ts) and `clipPasses(duration)` (video-assist/passes.ts, already imported by ClipFinder): "This video: about N uses of captioning and M of clip finding." When either is over what is left today, the line turns red and names which one, and nothing starts.
- Captioning: the upload path saves the recording with the chosen look, then starts the existing caption job itself (`startCaptions`, one use per 10-minute part) so the adviser does not have to press "Caption it in N parts". Its progress line keeps going on other pages.
- Finding: when the words land, Find clips starts by itself once, with the panel's topic, length and look (a pending ask kept in a module-level store, keyed by the project id, read by ClipFinder through a new `autoFind` prop), and its line reads "Finding clips..." as today. ClipFinder's `found` Map and the running find (its promise and busy flag) move into that store, so on return the page shows "Finding clips..." while it runs, never starts a second find, and shows the list when it lands.
- Done: the editor opens on the long video at `#clips`, scrolled to the clip list (useScrollToHash). Each clip shows its score, the score's parts and any MAS flags (below), with "Open" and, after Export all, "Download".
- Nothing found: today's 422 message "No clips stood out in this video. Try a longer one." with "Try again with Auto length".
- Off-topic: today's line "Nothing in this video is about that, so these are its best clips."
- Failed: the error with "Try again"; captions already made are kept, so a retry only re-runs finding.
- Over the cap: the plan line says "Clip finding: none left today. It resets at 8am Singapore time." and Find clips stays disabled, as `short` does now.
- YouTube link: the existing moments list, with the closing line changed to "YouTube's terms don't allow downloading the video. Upload your own copy to cut these into clips."

Per-clip additions in ClipFinder:
- Score parts under the title: "Stands alone 82 | Opening 71 | On topic 90" (the last only when a topic was asked). The combined score and its InfoTip stay.
- MAS flags: `scanCompliance` (src/lib/compliance.ts) on the clip's own words (`clipText(sentencesOf(words), clip)`, with `clipText` from src/lib/youtubeClips.ts and `sentencesOf` from src/lib/videoEdit.ts, which ClipFinder already imports) shows one warn chip per flag, `Check "<matched words>"`, with the rule's `message` in an InfoTip. They never block here, even for rules marked `error`; the adviser can still open and export. When trust-compliance-check's `MasCheck` ships, it replaces the word check on this list. A team leader's block or review rule arrives with that item's per-team rules table, a schema change for Leo.

### Copy

- Tile "Long video into clips", line "A webinar, podcast or Zoom recording cut into ranked short clips"
- Panel title "Long video into clips"
- Drop zone "Drop a webinar, seminar, podcast or Zoom recording", helper "Up to 4 GB and about 2 hours. It stays on this device."
- Labels "What should the clips be about? (optional)", "Length", "Look", "Or paste a YouTube link"
- Length pills "Auto, 30 to 60 s", "Short, 15 to 30 s", "Long, 60 to 90 s"
- Look options: each saved skill by name (the default first, with "(default)"), then each preset label from `PRESETS` in src/lib/stylePresets.ts ("Punchy talking head", "Podcast clip" and the rest)
- Plan line "This video: about N uses of captioning and M of clip finding."
- Over cap "Clip finding: none left today. It resets at 8am Singapore time." and "Captioning: none left today. It resets at 8am Singapore time."
- Score parts "Stands alone N", "Opening N", "On topic N"
- Flag chip `Check "<matched words>"`, tip text the rule's own `message`
- Retry "Try again with Auto length"
- YouTube note "YouTube's terms don't allow downloading the video. Upload your own copy to cut these into clips."
- Button "Find moments" (the YouTube button, renamed from "Find clips" so it does not promise files)

### Data

- No new synced storage. Clip projects are saved like any project in `content-studio-videoprojects-${scoped(userId)}`; the file stays on the device. The found list stays in memory for the session, as now; it moves from ClipFinder's module-level `found` Map into the store below, together with the running find.
- The panel's last length and look are device hints: `cs-clips-length`, `cs-clips-look`.
- A new module-level store in src/lib/clipAsk.ts holds the pending ask (topic, length, look) for a project still being captioned, dropped once used, each project's found list, and the find running for a project, if any.
- Nothing here needs a table or a schema change.

### AI and cost

- video-assist `clips` takes a new optional `length: "auto"|"short"|"long"`. `buildClipsMessages` swaps its length line: auto stays "25 to 75 seconds (aim for 30 to 60)", short becomes "12 to 35 seconds (aim for 15 to 30)", long becomes "50 to 100 seconds (aim for 60 to 90)". `playable` takes the same bounds (auto 18 to 120 seconds as today, short 12 to 40, long 45 to 120).
- The reply gains `parts: {alone, opening, topic?}` per clip, each 0 to 100, read from the answers Jev already gives (`s<i>`, `h<i>`, `r<i>` in `clipQuestions`), so Jev gets no new question; when Jev returns nothing, parts are left out and the list keeps the LLM's order, as today.
- The look is applied at upload, so every clip inherits it through `clipSettings`: a preset goes in with `applyRecipe` (src/lib/stylePresets.ts), and a skill with `withLook` and its `pendingSkill`, the way the upload path applies the default skill today.
- The existing caps cover all of it. Captioning uses `video-transcribe` (30 a day, one per 10-minute part) through Whisper (`whisper-1`, OpenAI's list price US$0.006 a minute, unverified against this account's bill), while finding uses `video-clips` (20 a day, one per 40-minute pass) at about 2 US cents a pass by the comment on `candidateCount`, unverified on the newer model, plus Jev. A 1-hour webinar comes to about US$0.40, 6 captioning uses and 2 clip-finding uses; a skill with instructions also takes `vibe-edit` uses when those run.
- Server gate: `length` other than `auto` is honoured only when `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (supabase/functions/market/logic.ts); for anyone else it falls back to auto, so today's clips are unchanged.
- Once the length is known, the price chip beside the plan line reads "about US$0.40 for this video", worked out as US$0.006 a minute plus 2 cents a pass.

### Deep links

- `/edit?panel=clips` opens the panel (push). It drops `own` from `panel` if present.
- `/edit?panel=clips&about=<words>&len=short|long` pre-fills the topic and length (replace; Auto is left out). `len` belongs to this panel only; formats-faceless-video uses `secs` for its length.
- `/edit?panel=clips&yt=<YouTube URL>` pre-fills the link field (replace).
- `/edit?p=<long video id>#clips` shows the clip list (ClipFinder's section gets `id="clips"` and the editor calls `useScrollToHash` from src/lib/urlState.ts); `/edit?p=<clip project id>` opens one clip, as today.
- Update src/lib/links.ts (`edit`: `"clips"` in `panel`, plus `about`, `len`, `yt`) and the /edit rows in docs/deep-links.md.

## Done when

- [ ] On Leo's sign-in the gallery tile opens the panel; elsewhere `panel=clips` is ignored.
- [ ] A 50-minute webinar dropped with "Short" and a topic shows its plan line, captions itself, finds clips by itself and opens at `#clips` with clips between 12 and 40 seconds, even when the adviser visited another page meanwhile.
- [ ] Each clip shows its score parts; a clip saying "guaranteed returns" shows a flag chip and still exports.
- [ ] Picking a preset look before dropping gives clips with that look; leaving the default gives the default skill's look, as today.
- [ ] A recording over 12 minutes is captioned without pressing "Caption it in N parts".
- [ ] With clip finding used up, the plan line says so and nothing is charged.
- [ ] The YouTube moments list still works from inside the panel, with the new closing line.
- [ ] 390 px and 1440 px checked by eye; build and full vitest green.

## Tests

- supabase/functions/video-assist/logic.test.ts: `buildClipsMessages` writes the right length line for each `length`; `playable` keeps a 14-second clip only for short and a 110-second clip for auto and long; the clips parser refuses an unknown `length` by falling back to auto; `rankClips` attaches `parts` from given answers and leaves them out on null, and the combined score is unchanged.
- src/lib/clipAsk.test.ts: a pending ask is read once for its project and ignored for another; a found list saved for one project is returned for it after the component is gone; a find started for a project reads as running until it settles, and a second start for that project returns the same promise.
- The once-only auto run rests on the read-once rule of clipAsk.ts above, so no component test is needed (vitest runs in node with no component library). `startPanels(email)` includes `clips` only for Leo's emails.
- src/lib/links.test.ts: `links.edit({ panel: ["clips"], len: "short", about: "cpf" })` is `/edit?panel=clips&about=cpf&len=short`.

## Open questions

- Leo: links from YouTube, Zoom cloud or Drive cut into real clips need the video file on our side. YouTube's terms forbid downloading, and Zoom cloud links need the owner's sign-in. This spec keeps uploads only; a paid downloader would be a new vendor and a terms risk.
- Leo: watching his own YouTube channel for new uploads (OpusClip's Auto Import) needs the file as well, so it waits on that answer.
- Clip yield stays below OpusClip's (up to 16 from an hour against their 32 to 42 from one to two hours) on purpose, since Jev drops clips that do not stand alone; Leo can ask for more after seeing real lists.
- Auto-captioning a long recording spends up to 13 `video-transcribe` uses without a second press. The plan line shows the count first and nothing starts when the uses are short; Leo may still want a confirm button for recordings over an hour.

## Related

formats-gallery, formats-custom, edit-video, edit-captions, edit-score, remix-any-link, remix-own-winners, trust-compliance-check, business-cost-preview, plan-interview
