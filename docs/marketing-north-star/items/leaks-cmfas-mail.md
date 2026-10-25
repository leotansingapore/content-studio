# Mail to CMFAS Prep support reaches someone

Status: todo
App CMFAS Prep, owner Leo + Claude, phase 1 (stop the leaks).

## Why

Oren John (1:50:05) on speed to touch: "You need to be ruthlessly dedicated to how fast people respond to those leads because you will find for every even minute that it goes by, that chance of response goes down." A CMFAS buyer who replies to a receipt with a question is the warmest person we will ever hear from, and that reply bounces today. The Pass Guarantee in our emails also asks a buyer who failed to reply to claim it.

## What we have today

Checked 26 Oct 2026 with `dig` (read-only DNS lookups) and the examprep-app repo at fe477b75.

- cmfas-exams-prep.com has no MX record and no TXT record. Its DNS is hosted on Vercel DNS (ns1 and ns2.vercel-dns.com).
- The mail subdomain the app sends from has no MX record either. Only its `send.` subdomain has records: the Amazon SES feedback MX and the SPF line Resend uses for sending. So mail goes out and nothing can come in.
- Every buyer email goes through `sendOnce` in src/lib/emails.ts, from the noreply sender on that mail subdomain (`FROM`, unless RESEND_FROM overrides it on Vercel). It sets a reply-to only when the caller passes one, and only the admin notices do (their reply-to is the buyer).
- Those buyer emails invite a reply: "Questions? Just reply." in src/lib/emails.ts, a footer in src/lib/email-html.ts saying a real person reads replies, and the Pass Guarantee line telling a buyer who did not pass to reply and get free extended access. Each of those replies bounces.
- src/lib/app.ts still defines the support address on the apex domain, but nothing in src uses it now. Memory cmfas-support-email-no-mx.md says never to show it until MX exists.
- So the card's ours line is right about the support address, and the larger leak is that replies to every buyer email bounce too.

## What to do

1. Leo: choose where support mail lands (open question 1). The recommended route is ImprovMX's free forwarding to Leo's own inbox. Leo signs up, adds cmfas-exams-prep.com, and ImprovMX shows two MX records and one SPF record.
2. Claude, with Leo's go (a DNS change): add those records to the apex in Vercel DNS, for example `vercel dns add cmfas-exams-prep.com @ MX mx1.improvmx.com 10` and the same for `mx2.improvmx.com` at 20, plus the TXT record `v=spf1 include:spf.improvmx.com ~all`. Leave the `send.` records Resend uses untouched. Confirm with `dig +short MX cmfas-exams-prep.com`.
3. Leo, in ImprovMX: forward the support address (and a catch-all for the domain) to his inbox.
4. Claude: in examprep-app src/lib/emails.ts, make `sendOnce` default the reply-to to `APP.supportEmail` from src/lib/app.ts when the caller passes none, so buyer replies reach support. Admin notices keep the buyer as their reply-to. Add a case to scripts/check-emails.mjs (`npm run check:emails`) that a buyer email carries the support reply-to and an admin notice still carries the buyer's. Ship it the way the repo's CLAUDE.md says.
5. Leo: from an address outside the domain, send one mail to the support address.
6. Claude, with Leo's go: send one buyer-type email from sendOnce to Leo's own address, with a ref_key starting `test-`. Leo replies to it.
7. Claude: once both arrive, put the support address back where buyers look for help (the privacy page and the help page), and update memory cmfas-support-email-no-mx.md to say it is fixed and when.

## Done when

- `dig +short MX cmfas-exams-prep.com` returns the forwarding host's two MX records.
- Leo's test mail to the support address arrives in his inbox within five minutes.
- Leo's reply to the test buyer email arrives in the same inbox.
- `npm run check:emails` passes with the new reply-to case, and the change is live.
- The memory note says fixed, with the date.

## Open questions

1. Forward to Leo's inbox with ImprovMX (free), or pay for a mailbox such as Google Workspace? Recommended: free forwarding now. CMFAS Prep is stalled and nobody is assigned to answer it. Moving to a paid mailbox later only means swapping the MX records.
