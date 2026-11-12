import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

const { default: MoreSettings, settingsLine } = await import("./MoreSettings");

const draw = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <MoreSettings picks={["Eric's voice", null, "office desk", false]}>
        <p>Voice chips</p>
      </MoreSettings>
    </MemoryRouter>,
  );

describe("More settings", () => {
  it("names every current pick in one line, empty ones left out", () => {
    expect(settingsLine(["Eric's voice", null, "office desk", undefined, false, ""])).toBe("Eric's voice, office desk");
  });

  it("starts folded with the picks named, and opens from the address so a reload keeps it open", () => {
    const shut = draw("/make/talking-head");
    expect(shut).toContain("Eric&#x27;s voice, office desk");
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).not.toContain("Voice chips");
    const open = draw("/make/talking-head?more=open");
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("Voice chips");
    expect(open).toContain("Eric&#x27;s voice, office desk");
  });
});
