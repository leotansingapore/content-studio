import { describe, expect, it } from "vitest";
import { postHtml } from "./copyPost";

describe("a post copied with its picture", () => {
  it("keeps each line, a blank line as a break, the words escaped and the picture last", () => {
    expect(postHtml("Hook <b>here</b>\n\nDM me & ask", "data:image/png;base64,AA")).toBe(
      '<div>Hook &lt;b&gt;here&lt;/b&gt;</div><div><br></div><div>DM me &amp; ask</div><div><br></div><div><img src="data:image/png;base64,AA" alt=""></div>',
    );
  });
});
