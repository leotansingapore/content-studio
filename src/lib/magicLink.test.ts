import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));

import { sendSignInLink, verifySignInCode } from "@/lib/magicLink";

const refuse = (message: string, status = 400) => ({ error: { message, status } });

beforeEach(() => {
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe("the emailed sign-in link", () => {
  it("sends the trimmed email with where to land and whether a new account may be made", async () => {
    expect(await sendSignInLink("  mei@acme.sg ", "https://app.test/join", true)).toBeNull();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "mei@acme.sg", options: { emailRedirectTo: "https://app.test/join", shouldCreateUser: true } });
  });

  it("never emails a demo account, whatever its case or spacing", async () => {
    for (const email of ["user@demo.com", " User@Demo.COM "]) {
      expect(await sendSignInLink(email, "https://app.test/", false), email).toBe("Demo accounts sign in with their password.");
    }
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("answers an email with no account the same as one with an account, so nobody can look people up", async () => {
    for (const message of ["Signups not allowed for otp", "User not found"]) {
      auth.signInWithOtp.mockResolvedValueOnce(refuse(message, 422));
      expect(await sendSignInLink("stranger@acme.sg", "https://app.test/", false), message).toBeNull();
    }
  });

  it("says to wait a minute when too many emails went out", async () => {
    auth.signInWithOtp.mockResolvedValueOnce(refuse("email rate limit exceeded", 429));
    auth.signInWithOtp.mockResolvedValueOnce(refuse("For security purposes, you can only request this after 42 seconds."));
    for (let i = 0; i < 2; i++) expect(await sendSignInLink("mei@acme.sg", "https://app.test/", false)).toBe("Too many emails just now. Wait a minute, then try again.");
  });
});

describe("the emailed sign-in code", () => {
  it("takes the code typed with spaces, and says plainly when it doesn't work", async () => {
    expect(await verifySignInCode(" mei@acme.sg ", " 123 456 ")).toBeNull();
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "mei@acme.sg", token: "123456", type: "email" });
    auth.verifyOtp.mockResolvedValueOnce(refuse("Token has expired or is invalid", 403));
    expect(await verifySignInCode("mei@acme.sg", "000000")).toBe("That code didn't work. Check it, or ask for a new email.");
  });
});
