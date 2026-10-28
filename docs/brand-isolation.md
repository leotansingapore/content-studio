# Brand isolation

Leo asked on 16 Oct 2026 to "segregate the app in terms of brands, so one account can manage multiple brands, each with their own thing", and to make adding brands easy, with tryholo.ai as the reference. He chose three things: a brand is added from its website, everything belongs to one brand with the Calendar as the single all-brands view, and team invites stay on the posts board for now.

## Where it starts

A brand is a profile in `src/lib/profiles.ts`, holding an id, a name and a date. Stores that belong to a brand use `scoped(uid)`, which is the bare uid for the default profile "me" and `uid~pid` for every other one; drafts, plan, board, voice, brand kit, positioning, recruit, engage, coach, link in bio and social accounts already work this way.

The code map found seven gaps:

1. Saved inspiration, saved creators and saved top posts sit under `content-studio-saved-<uid>`, so every brand shares one list.
2. Tracked links and their campaigns (019) carry no brand.
3. Compliance preview links (012) carry no brand.
4. The posts board at /reels guesses the brand from the profile's name, so "Me" or a renamed profile shows all of them.
5. The /board page mixes brands through its business filter.
6. Removing a brand leaves its link-in-bio page live, along with its tracked links and device-only `cs-*` data.
7. Only the Write page reads the brand from a link (`?profile=`), so a shared link can open on the wrong brand.

Team review submissions and team posts belong to a team and stay as they are.

## Phase 1: isolation

Any studio page opened with `?profile=<id>` switches to that brand first, with one reload as the switcher already does, and copied links carry the brand whenever it isn't "me".

Each profile records the posts-board brand it owns (`boardBrand`), filled once from today's name match. Leo then sees only the open brand's posts on /reels, and a brand with no board gets an empty state with a picker to link one. Invited members keep seeing the brands their role gives them.

Saved items move to `scoped(uid)`. The default brand's storage name doesn't change, so nothing already saved goes missing.

Migration 024 adds `profile_id text not null default 'me'` to tracked links and their campaigns; lists filter on it, new rows carry it, and a campaign name is unique per brand. Preview links needed no change: each one belongs to a post, and My posts only lists the open brand's posts.

/board shows the open brand only. So does the Calendar since 23 Oct 2026 (Leo: "each business should be isolated"): no All brands view, a ?business= link opens that brand. Team posts sit on their group's brand (Leo, 28 Oct 2026): AdvisorOS on ActivityTracker, FASTRACK and its memo posts on "Leo's team" (teamHome).

Removing a brand takes everything with it: after its social accounts are disconnected as today, its bio page and tracked links are deleted on the server, and only then its synced data and this device's `cs-*` data. If the server part fails, nothing is removed.

## Phase 2: add a brand from its website

This copies the shape of Holo's Brand DNA flow (teardown in `~/Documents/Catalyst Outsourcing/17 Holo Onboarding Teardown/`). The person pastes one URL and waits while named progress rows tick over. Then they confirm pre-filled fields instead of typing them: name, logo, colours, fonts, voice, audience and handles, each collapsing to one line once confirmed. The brand is created and opened at the end.

A `brand-dna` edge function reads the site, with Jev making the decisions, the LLM writing the words, and a daily cap. What it finds fills the stores a brand already has (voice profile, brand kit, positioning, social handles), so no page needs a second copy.

What shipped on 16 Oct: `brand-dna` reads the first 300 KB of the home page, and only when every address the host name resolves to is public; it checks again before each redirect and each logo. Script blocks and CDATA come out in one linear pass, so a hostile page can't stall it. It returns the name, colour, the first of up to three PNG, JPEG or WebP logos (checked by their bytes, under 250 KB), and the social handles in the markup. The LLM writes the one-liner, audience, topics, edge and voice from the page's words, which are fenced as data, and Jev picks the life stage. The daily cap is 10. Its known limit: a host name could answer differently between the check and the connection (DNS rebinding), because the edge runtime's fetch can't be pinned to the address it checked. /brands/new reloads into its ready screen once the brand is made, so every page opens on it.

## Later

Whole-brand access for invited advisers, and team review split by brand.
