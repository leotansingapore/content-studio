// The brand's own bot in the Telegram card: "Posting as @<bot>", with the replace-token box folded under a quiet link
// while the bot works and open when its token stopped working. Rendered to static HTML; no network.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import { OwnBotPanel } from "./TelegramCard";

const bot = { id: "b1", bot_id: 7000000002, username: "mb_test_bot", display_name: "MoneyBees", status: "active" as const };
const html = (o: Partial<Parameters<typeof OwnBotPanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(OwnBotPanel, {
      bot,
      replaceOpen: false,
      onOpenReplace: () => undefined,
      onCloseReplace: () => undefined,
      token: "",
      onToken: () => undefined,
      busy: "",
      error: "",
      onReplace: () => undefined,
      onSwitchBack: () => undefined,
      ...o,
    }),
  );

describe("the brand's own bot in the Telegram card", () => {
  it("while the bot works, says who it posts as and folds the replace box under a quiet Replace token link", () => {
    const out = html();
    expect(out).toContain("Posting as @mb_test_bot");
    expect(out).toContain("Switch back to the shared bot");
    expect(out).toMatch(/<button[^>]*h-11[^>]*>Replace token<\/button>/);
    expect(out).not.toContain("telegram-bot-new-token");
  });

  it("opens the box from that link, with a way to fold it again", () => {
    const out = html({ replaceOpen: true });
    expect(out).toContain('id="telegram-bot-new-token"');
    expect(out).toContain("Use this token");
    expect(out).toMatch(/<button[^>]*h-11[^>]*>Cancel<\/button>/);
    expect(out).not.toContain(">Replace token<");
  });

  it("when the token stopped working, says so and keeps the box open, with nothing to fold", () => {
    const out = html({ bot: { ...bot, status: "revoked" } });
    expect(out).toContain("This bot&#x27;s token no longer works: paste a new token");
    expect(out).toContain('id="telegram-bot-new-token"');
    expect(out).not.toContain(">Replace token<");
    expect(out).not.toContain(">Cancel<");
  });
});
