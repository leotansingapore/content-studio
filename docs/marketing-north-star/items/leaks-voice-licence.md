# Every AI voice in an ad is licensed for commercial use

Status: todo
App all apps, owner Leo, phase 1 (stop the leaks).

## Why

None of the videos talks about voice licences; this card protects the paid half of the loop they describe. Kenyon of Sideshift (50:05) promotes any organic post that gets "5 to 10x the normal number of views", and Oren John (1:24:16) puts new ads in "every week". So any voiced reel we post can become a paid ad on a Monday. An ad is commercial use, and a free voice plan does not grant it.

The page's first principle also applies: real faces before AI faces, and AI avatar videos stay out of the ad sets that test creators.

## What we have today

Checked 26 Oct 2026. There are two voice paths, and the card's ours line only describes one of them.

- The voiced reels that go out today are voiced through Higgsfield's text2speech_v2 model with its ElevenLabs variant, using the higgsfield CLI and Higgsfield credits:
  - MoneyBees reels: ~/Documents/moneybees-reels/tools/voice.py, through tools/hfbatch.py, with the brand voice in brand/voice.json;
  - ActivityTracker's one voiced reel per batch: ~/Documents/at-social/reels/voice.py.
  What Higgsfield's terms allow for this audio in ads has not been checked.
- Content Studio's own voiceovers call ElevenLabs directly with the studio's account (ELEVENLABS_API_KEY): `supabase/functions/text-voice/index.ts` voices whatever an adviser types in the video editor, and the dubbed versions too. The plan that account was on in October, and what it allows: see private-notes.md on Leo's Mac (card leaks-voice-licence). Background music from the same account stays hidden (`AI_MUSIC=false` in src/lib/aiMusic.ts) because of that plan; Leo chose hiding it over upgrading on 10 Oct.
- Three voices on the Higgsfield account are clones of real people, so the ActivityTracker reel builder uses preset voices only (memory at-reels-cozy-ugc-1023.md).
- Nothing lists which ads in the MoneyBees ad account carry an AI voice.

## What to do

1. Claude: read Higgsfield's current terms and pricing pages on commercial use of generated audio and video bought with credits, and ElevenLabs' plans page for the cheapest plan that grants a commercial licence and its price. Quote the clauses and the date read on this card. Reading only; nothing is bought.
2. Claude: list the live ads in the MoneyBees ad account (read-only Graph GET of ads with their creative's video id), match each video to a board card in studio_cards by its posted Instagram media id, and mark the ones whose card has a voice track. Post the list to Leo.
3. Leo: decide on the plan (open question 1). If yes, upgrade the studio ElevenLabs account in its billing page.
4. Leo: if Higgsfield's terms do not cover ads for what we buy, pause any voiced reel that runs as an ad until it is re-voiced by a person.
5. Claude: add a voice check to the Monday read-back (loop-monday-readback). Every promote candidate whose board card has a voice track shows either "AI voice: cleared for ads (<provider>, <plan>)" or "AI voice: not cleared, re-voice before promoting". The read-back reads this from the card's voice fields, and a reel voiced with one of the three cloned voices never becomes a promote candidate.
6. Claude, if Leo upgrades ElevenLabs: set `AI_MUSIC` to true in src/lib/aiMusic.ts as the 10 Oct note says, and make one 15-second track to prove the plan works.

## Done when

- This card quotes both providers' commercial-use terms with the date they were read.
- The studio ElevenLabs billing page shows a plan with a commercial licence, or the read-back marks Content Studio voiceovers as not cleared for ads.
- The Monday read-back labels every AI-voiced winner before it can be promoted.
- Step 2's list, run again after the fix, finds no live ad in the MoneyBees account with a cloned voice or one that is not cleared.

## Open questions

1. Pay for the voice plan, or keep ads to real voices? Recommended: pay for the cheapest ElevenLabs plan with a commercial licence before any Content Studio voiceover runs as an ad, as MK_DECISIONS `voice-plan` says. A month of it costs less than one day of one ad set.
2. Does the licence matter for organic posts on brand accounts as well as ads? Recommended: treat brand posts as commercial use too, so one plan covers both.
