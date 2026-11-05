# Navigation peers on Mobbin: Buffer, Hootsuite and the phone create button

Read 5 Nov 2026 for Leo's "improve the navigation and usability of the app" (mobbin-fold-in, standard search, web and
iOS). Links, not images: Mobbin image links expire after 30 days.

## What the peers do

| Pattern | Seen in | Tag | Ours after 5 Nov |
|---|---|---|---|
| One filled create button at the top of the sidebar ("+ New"), page-level create buttons outlined ("+ New Post" on the calendar) | Buffer: [sidebar](https://mobbin.com/screens/ff02682b-e9b0-49e2-baee-c923aa867e60), [calendar](https://mobbin.com/screens/dc013ad3-aec6-4958-bfc2-183b67d2e2f2) | shared | Home's Write a post is outlined beside the sidebar's New post on computers, filled on phones (HomePage.tsx) |
| Create as a split button: the main half does the usual thing, the arrow opens the rest | Hootsuite: [Create a post + arrow](https://mobbin.com/screens/fcb9a7cc-9ae1-4ee7-87b6-acf74e33e7c7) | shared | New post + an arrow opening every format (CreateMenu.tsx, list in createFormats.ts) |
| Create choices with a one-line purpose each | Hootsuite OwlyWriter: [Repurpose / Start from scratch / Get inspired](https://mobbin.com/screens/e86bae45-0ad2-425a-83b2-12a28650d60d) | shared | each format in the menu carries its Studio blurb |
| Connected channels listed in the sidebar, each with a count, plus "Connect channels" and a setup meter | Buffer: [channels](https://mobbin.com/screens/ff02682b-e9b0-49e2-baee-c923aa867e60), [1/3 channels connected](https://mobbin.com/screens/f7df8f04-69f3-40a0-bc51-e44ce4308b20) | distinctive | already ours: ChannelsBlock under the brand switcher with a warning dot (d80c447e) |
| Count badges on the sections that hold work waiting (Publish 3, Community 1) | Buffer: [sidebar](https://mobbin.com/screens/dc013ad3-aec6-4958-bfc2-183b67d2e2f2) | distinctive | Home carries the needs-you count; not extended |
| Notifications as a page under Settings | Fastlane t346 (docs/north-star/items/find-alerts-digest.md), Buffer and Hootsuite account settings | shared | /notifications under Settings > You, moved from My Playbook's Reminders |
| Phone: create in the middle of the bottom bar, opening a short list of what to make | Instagram, TikTok, YouTube, Threads (Mobbin iOS search "social media scheduler app tab bar with center create button" returned no scheduler of its own; the convention is the networks' own apps) | shared | Create between Strategy and Studio, panel above the bar |
| Notification bell in the rail foot | Hootsuite: [rail](https://mobbin.com/screens/fcb9a7cc-9ae1-4ee7-87b6-acf74e33e7c7) | distinctive | not built: no in-app notification feed exists to open |

## Left out

- Buffer's per-channel sub-navigation (Publish, Community, Analytics under each channel): Postmosis switches by brand,
  and a brand's channels share one calendar.
- Hootsuite's icon-only rail: Leo picked Fastlane's labelled sidebar on 24 Oct (docs/fastlane-nav-gap.md).
