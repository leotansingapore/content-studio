// Pressing Remix opens the sheet over the page by its address: ?remix=<key>, and ?keep=<choice> when the card starts it
// on a Keep choice (the social north star's Make one like this keeps the format: topic).
import { describe, expect, it } from "vitest";
import { remixParams } from "./RemixButton";

describe("the address Remix opens", () => {
  it("adds the source's key to what the page's address already holds", () => {
    expect(remixParams(new URLSearchParams("tab=similar&f=slideshows"), "follow:tiktok:741").toString()).toBe("tab=similar&f=slideshows&remix=follow%3Atiktok%3A741");
  });

  it("starts on the card's Keep choice, and leaves the sheet's default out of the address", () => {
    expect(remixParams(new URLSearchParams(), "follow:tiktok:741", "topic").toString()).toBe("remix=follow%3Atiktok%3A741&keep=topic");
    expect(remixParams(new URLSearchParams(), "follow:tiktok:741", "structure").toString()).toBe("remix=follow%3Atiktok%3A741");
  });
});
