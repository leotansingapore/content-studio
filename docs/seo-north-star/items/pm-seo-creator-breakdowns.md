# A breakdown of the top accounts in each profession

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Pages from data, at scale).

## Why

Taplio runs 13 /influencers/<topic> lists, such as taplio.com/influencers/money, each titled like "The 100 Best LinkedIn Influencers about marketing", and 7 /trending/<topic> pages: 20 topic pages built from public posts (census.md and census.json, 30 Oct 2026). Its lists go by topic, and no rival in the census has one by profession.

keywords.csv (28 Oct) holds no phrase for a profession's top accounts, so demand has to be read before building.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 6 creator breakdowns in the vault, at /vault/<name>-reels: Alex Hormozi, Dan Martell, Kallaway, Mino Lee, Sharran Srivatsaa and Shelby Sapp. d33ad56 split them out of /vault/creator-reels-decoded. Each measures the account's public Reels and rewrites its hooks, topics and scripts for the reader's work.
- One is written for a profession: Sharran Srivatsaa's is "rewritten for agents and consultants" (its summary in src/content/vault.ts). The other five go by creator.
- None of the six was indexed on 30 Oct; Google did not know the URLs yet (URL Inspection).
- copy/_vault/originals/x-salim holds teardowns of 10 TikTok slideshow accounts (account-teardowns.txt), a worked example of the method a profession page would follow.
- The six pages count toward pm-seo-vault. No page per profession exists and step 1 has not run, so this card is todo.

## What to do

1. Read US volume for phrases such as best realtor instagram accounts, lawyers to follow on linkedin and coach social media examples, about 36 across the 6 /for professions, with keyword_overview, under USD 0.02 (credit-prices.ts). Stop and ask Leo before it runs. Build only for professions with demand or a weak page one.
2. For each kept profession, list candidates who post as themselves, the brief's reader, not agencies or brands. Have Jev rank them (a paid call: count the rows, state the estimate, wait for Leo's yes) and keep 5.
3. Measure each account's last 30 public posts: format, hook, length and topic, read from public pages only. yt-dlp may read public video metadata. No logins, and nothing read from behind a wall.
4. Methods only. Never present their numbers as ours, and leave out any result an account reports about itself, the rule the vault already follows.
5. Publish one page per profession at /vault/<profession>-accounts through copy/_vault/scripts: check.py (aicheck under 15, brief-check), judge_vault.py (Jev, paid, same rule), to_ts.py. Each page links all 5 accounts, the matching /for page and the tools that fit.
6. Raise SEO_TARGETS.vault by each page added, run heavy npm run check, push to main, then run postmosis-indexnow-submit.sh.

## Done when

- One breakdown page is live for each profession that cleared step 1, each naming and linking 5 accounts.
- Every number on them is the account's public figure with a read date, and none is presented as Postmosis's result.
- Professions dropped at step 1 are listed in this spec with their volumes.

## Open questions

None.
