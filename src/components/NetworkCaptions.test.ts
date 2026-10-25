// The caption tabs' rules (publish-per-network): which caption each network gets, what is stored on the draft, the
// placements the media allows, the options the server is sent, and Move hashtags to first comment.
import { describe, expect, it } from "vitest";
import { captionOf, moveHashtags, networkFields, optionsProblem, ownCaption, placementOf, placementsFor, sendCaptions, tabFlagged, withCaption, type Versions } from "./NetworkCaptions";

const BASE = "3 CPF myths at 55\n\nMyth one.";
const TABS = ["linkedin", "instagram", "facebook"];
const PICTURES = { pictures: 3, videos: 0 };
const VIDEO = { pictures: 0, videos: 1 };
const NONE = { pictures: 0, videos: 0 };

describe("captions per network", () => {
  it("every tab shows the shared caption until typed in, and the first tab is the shared caption", () => {
    expect(TABS.map((p) => captionOf(TABS, {}, BASE, p))).toEqual([BASE, BASE, BASE]);
    const v = withCaption(TABS, {}, BASE, "linkedin", "Shared, edited");
    expect(v).toEqual({ linkedin: { caption: "Shared, edited" } });
    expect(TABS.map((p) => captionOf(TABS, v, BASE, p))).toEqual(["Shared, edited", "Shared, edited", "Shared, edited"]);
    expect(ownCaption(TABS, v, "instagram")).toBe(false);
  });

  it("typing in another tab gives it its own version; Use the shared caption takes it back", () => {
    const v = withCaption(TABS, {}, BASE, "facebook", "For Facebook");
    expect(captionOf(TABS, v, BASE, "facebook")).toBe("For Facebook");
    expect(captionOf(TABS, v, BASE, "instagram")).toBe(BASE);
    expect(ownCaption(TABS, v, "facebook")).toBe(true);
    expect(withCaption(TABS, v, BASE, "facebook", null)).toEqual({});
  });

  it("a caption equal to the shared one is not stored, and other options on the entry stay", () => {
    expect(withCaption(TABS, {}, BASE, "facebook", BASE)).toEqual({});
    expect(withCaption(TABS, {}, BASE, "linkedin", BASE)).toEqual({});
    const v: Versions = { instagram: { caption: "Mine", instagram: { placement: "story" } } };
    expect(withCaption(TABS, v, BASE, "instagram", BASE)).toEqual({ instagram: { instagram: { placement: "story" } } });
  });

  it("sends the shared caption as content and a caption only for the networks that differ", () => {
    const v = withCaption(TABS, withCaption(TABS, {}, BASE, "facebook", "For Facebook"), BASE, "linkedin", "Shared, edited");
    expect(sendCaptions(TABS, v, BASE)).toEqual({ content: "Shared, edited", captions: { facebook: "For Facebook" } });
    expect(sendCaptions(["linkedin"], {}, BASE)).toEqual({ content: BASE, captions: {} });
  });
});

describe("placements and options", () => {
  it("placement defaults follow the media", () => {
    expect(placementsFor("instagram", PICTURES)).toEqual(["feed", "story"]);
    expect(placementsFor("instagram", VIDEO)).toEqual(["reel", "story"]);
    expect(placementsFor("instagram", NONE)).toEqual([]);
    expect(placementsFor("facebook", VIDEO)).toEqual(["feed", "reel", "story"]);
    expect(placementsFor("facebook", PICTURES)).toEqual(["feed", "story"]);
    expect(placementsFor("facebook", NONE)).toEqual(["feed"]);
    expect(placementsFor("linkedin", PICTURES)).toEqual([]);
    // a Reel picked on a video falls back to the feed once the media is pictures
    const v: Versions = { instagram: { instagram: { placement: "reel" } } };
    expect(placementOf("instagram", v, VIDEO)).toBe("reel");
    expect(placementOf("instagram", v, PICTURES)).toBe("feed");
  });

  it("maps Instagram's, Facebook's and LinkedIn's options for the ticked networks only", () => {
    const v: Versions = {
      instagram: { instagram: { placement: "reel", shareToFeed: false, trial: true, collaborators: ["@moneybees", " ", "sg.money"], commentsOff: true } },
      facebook: { facebook: { placement: "story" } },
      linkedin: { linkedin: { poll: { question: "Which first?", options: ["CPF", " SRS ", ""], days: 3 } } },
    };
    expect(networkFields(["instagram", "facebook"], v, VIDEO)).toEqual({
      instagram: { placement: "reel", shareToFeed: false, trial: true, collaborators: ["moneybees", "sg.money"], commentsOff: true },
      facebook: { placement: "story" },
    });
    // a story carries no collaborators or comment switch
    expect(networkFields(["instagram"], { instagram: { instagram: { placement: "story", collaborators: ["a"], commentsOff: true } } }, PICTURES)).toEqual({ instagram: { placement: "story" } });
    // a poll goes only without media
    expect(networkFields(["linkedin"], v, NONE)).toEqual({ linkedin: { poll: { question: "Which first?", options: ["CPF", "SRS"], days: 3 } } });
    expect(networkFields(["linkedin"], v, PICTURES)).toEqual({});
    expect(networkFields(["linkedin"], {}, NONE)).toEqual({});
  });

  it("refuses the options in the server's own words", () => {
    expect(optionsProblem(["instagram"], { instagram: { instagram: { placement: "feed", collaborators: ["a", "b", "c", "d"] } } }, PICTURES)).toBe("Add up to 3 collaborators.");
    expect(optionsProblem(["instagram"], { instagram: { instagram: { placement: "feed", collaborators: ["no spaces!"] } } }, PICTURES)).toMatch(/^Check the collaborators/);
    expect(optionsProblem(["linkedin"], { linkedin: { linkedin: { poll: { question: " ", options: ["a", "b"], days: 7 } } } }, NONE)).toBe("Write the poll question in 140 characters or fewer.");
    expect(optionsProblem(["linkedin"], { linkedin: { linkedin: { poll: { question: "Q?", options: ["a", ""], days: 7 } } } }, NONE)).toBe("Give the poll 2 to 4 options.");
    expect(optionsProblem(["linkedin"], { linkedin: { linkedin: { poll: { question: "Q?", options: ["a", "b"], days: 7 } } } }, NONE)).toBeNull();
    // an unticked network's options are not checked
    expect(optionsProblem(["linkedin"], { instagram: { instagram: { placement: "feed", collaborators: ["a", "b", "c", "d"] } } }, PICTURES)).toBeNull();
  });
});

describe("Move hashtags to first comment", () => {
  it("moves the trailing hashtags only", () => {
    expect(moveHashtags("Three moves before 55.\n\n#cpf #money #retirement")).toEqual({ body: "Three moves before 55.", comment: "#cpf #money #retirement" });
    expect(moveHashtags("Why #cpf matters at 55. Read on.")).toBeNull();
    expect(moveHashtags("No tags here.")).toBeNull();
    expect(moveHashtags("#only #tags")).toBeNull();
  });
  it("adds them after the first comment already there", () => {
    expect(moveHashtags("Read this. #cpf", "Link in the comments: https://x.sg")).toEqual({ body: "Read this.", comment: "Link in the comments: https://x.sg\n\n#cpf" });
  });
});

describe("a tab's red label", () => {
  it("turns red over the network's limit or on a red compliance flag", () => {
    expect(tabFlagged("threads", "x".repeat(500))).toBe(false);
    expect(tabFlagged("threads", "x".repeat(501))).toBe(true);
    expect(tabFlagged("facebook", "It's risk-free.")).toBe(true);
    expect(tabFlagged("facebook", "Plan early.")).toBe(false);
  });
});
