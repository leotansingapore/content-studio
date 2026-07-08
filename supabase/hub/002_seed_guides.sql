-- Starter guides for the Members Hub. Idempotent: upsert on slug.
insert into public.hub_posts (title, slug, body_md, category, audience_type, published)
values
(
  'Edit a talking-head video in CapCut in under 20 minutes',
  'capcut-talking-head-20-minutes',
  $md$Most people spend two hours editing a 45-second talking-head clip. The edit below takes under 20 minutes once you have done it three or four times.

## Before you open CapCut

Record your takes in one continuous clip. Flub a line? Pause two seconds, then say it again. The pauses make bad takes easy to spot on the timeline, and you skip the mess of importing fifteen separate files.

## The pass order

Do these in order. Jumping between them is what burns your two hours.

1. Rough cut. Drop the clip on the timeline, play it at 1.5x, and split-delete every pause, flub, and false start. Do not fix anything else yet.
2. Tighten. Play it again at normal speed. Cut the gap between every sentence to almost nothing. Talking-head videos feel slow because of the air between sentences, not the sentences.
3. Punch-ins. Every 5 to 8 seconds, alternate between 100% and about 115% scale on your cuts. This fakes a two-camera setup and hides your jump cuts at the same time.
4. Captions. Auto captions, then read every single line. CapCut mishears names, prices, and local terms. One wrong caption costs more trust than no captions.
5. Sound. Add a music bed at roughly -20dB, so quiet you barely notice it. Voice always sits on top.

## Caption style that holds up

Use one style and keep it for every video, so your clips are recognisable in the feed. White text, heavy weight, thin black outline, positioned in the lower third but above the platform UI zone. Skip the word-by-word bouncing animation. It tested well in 2023; now it reads as template.

## Export

1080p, 30fps, highest bitrate CapCut allows. Upload native inside each platform rather than cross-posting from one app, since watermarked re-uploads get suppressed.

If your edit takes longer than 25 minutes, the problem is almost always the recording. Cleaner takes cut faster than any editing trick.$md$,
  'editing',
  'all',
  true
),
(
  'Shoot clean short-form on your phone: the 15-minute setup',
  'phone-videography-15-minute-setup',
  $md$You do not need a camera. Every viral talking-head video you have saved this month was probably shot on a phone. What separates clean footage from amateur footage is three decisions made before you press record.

## Light

Face the biggest window in the room. Not beside it, facing it. Window light is soft, free, and flattering, and it beats a cheap ring light every time. Recording at night? Put one lamp behind your phone pointed at your face, and one lamp somewhere behind you to separate you from the background. Two lamps, done.

The one thing to never do: sit with a window behind you. Your phone will expose for the window and turn you into a silhouette.

## Sound

Viewers forgive soft visuals. They do not forgive bad audio, and most scroll past within a second of hearing echo. Record in a room with soft stuff in it: bed, sofa, curtains, carpet. A wireless mic clipped to your collar (a DJI Mic 2 or a cheaper clone) is the single best money you can spend on content. Under SGD 150 gets you audio that sounds professional even in an average room.

## Framing

Wipe the lens with your shirt. It sounds like a joke; it fixes more blurry footage than any setting.

Then set up the shot:

- Phone at eye level. Stack books under it if you have no tripod. Looking down into a phone on a desk adds a chin and reads as webcam.
- Eyes on the top third line of the frame, not dead centre.
- Stand about an arm's length away, close enough that your face carries the frame.
- Lock exposure and focus by holding your finger on your face in the camera app, so the image stops pulsing when you move.

Shoot 4K at 30fps if your phone offers it. That gives you room to punch in during the edit without going soft.

## The test

Record ten seconds, play it back with the volume up, and look at it the way a stranger would. Would you stop scrolling for this person? If the answer is no, it is one of the three things above. Fix that one thing and test again.$md$,
  'videography',
  'all',
  true
),
(
  'How to ride a trend without looking desperate',
  'ride-trends-without-looking-desperate',
  $md$A trend is a distribution hack: the platform is already pushing that sound, format, or hook, so you borrow reach you have not earned yet. Done badly, it reads as a middle-aged brand doing a teenager's dance. The difference is one question.

## The one question

Can you connect the trend to something you actually know? If yes, you are adapting a trend. If no, you are copying content, and viewers smell it instantly.

A mortgage broker using the "things I'd never do as a..." format to list mistakes she sees buyers make is adapting. The same broker lip-syncing an audio because it is popular is copying.

## Speed matters more than polish

Trends have a window, usually a couple of weeks from first spike to saturation on any given platform. A rough version posted in the window beats a polished version after it. This is why the trend drops in this hub refresh every few hours: the whole point is catching the window.

A decent rule: if you first saw the trend through a brand account rather than a creator, the window is nearly shut. Skip it and wait for the next one.

## The adaptation checklist

Before you film, write one sentence: "This trend, but for [your niche], where the twist is [your specific knowledge]." If you cannot fill in the second blank, do not film it.

Keep the parts that make the trend recognisable: the audio, the text placement, the timing of the beat drop. Change the subject matter to yours. Recognisable shell, your filling.

## When to sit one out

Skip a trend when the joke depends on context you do not share, when it involves mocking someone, or when you would cringe showing the video to a client. One off-key trend does little damage on its own; a feed full of them tells people you have nothing of your own to say.

Trends are a spice. Two trend posts out of every ten is plenty. The other eight should be things only you could have posted.$md$,
  'trends',
  'all',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  body_md = excluded.body_md,
  category = excluded.category,
  published = excluded.published,
  updated_at = now();
