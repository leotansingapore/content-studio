import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyBytes, loadNotifyPrefs, NOTIFY_PREFIX, pushSupport, refreshPushHere, saveNotifyPrefs, VAPID_PUBLIC_KEY } from "./notify";

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: true, error: null })));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const UID = "3f2b6c1e-8a4d-4c2b-9f1e-2a3b4c5d6e7f";

function memoryStorage() {
  const m = new Map<string, string>();
  const calls: string[] = [];
  return {
    calls,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      calls.push(`set ${k}`);
      m.set(k, v);
    },
    removeItem: (k: string) => {
      calls.push(`remove ${k}`);
      m.delete(k);
    },
  };
}

describe("notify prefs", () => {
  let store: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal("window", { localStorage: store });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("are off until switched on", () => {
    expect(loadNotifyPrefs(UID)).toEqual({ email: false, push: false });
    expect(loadNotifyPrefs(null)).toEqual({ email: false, push: false });
  });

  it("live in one synced, account-wide key", () => {
    saveNotifyPrefs(UID, { email: true, push: false });
    expect(store.getItem(`${NOTIFY_PREFIX}${UID}`)).toBe('{"email":true,"push":false}');
    expect(NOTIFY_PREFIX.startsWith("content-studio-")).toBe(true);
    expect(loadNotifyPrefs(UID)).toEqual({ email: true, push: false });
  });

  it("turning off writes an explicit false and never removes the key", () => {
    saveNotifyPrefs(UID, { email: true, push: true });
    saveNotifyPrefs(UID, { email: false, push: false });
    expect(store.getItem(`${NOTIFY_PREFIX}${UID}`)).toBe('{"email":false,"push":false}');
    expect(store.calls.some((c) => c.startsWith("remove"))).toBe(false);
  });

  it("reads anything but true as off", () => {
    store.setItem(`${NOTIFY_PREFIX}${UID}`, '{"email":"yes","push":1}');
    expect(loadNotifyPrefs(UID)).toEqual({ email: false, push: false });
    store.setItem(`${NOTIFY_PREFIX}${UID}`, "{broken");
    expect(loadNotifyPrefs(UID)).toEqual({ email: false, push: false });
  });
});

describe("pushSupport", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
  it("is on wherever the browser has push", () => {
    expect(pushSupport(true, IPHONE, 5)).toBe("ok");
  });
  it("tells iPhone and iPad users to add the app to the Home Screen", () => {
    expect(pushSupport(false, IPHONE, 5)).toBe("ios-install");
    expect(pushSupport(false, IPAD, 5)).toBe("ios-install");
  });
  it("calls other browsers unsupported, a Mac included", () => {
    expect(pushSupport(false, IPAD, 0)).toBe("unsupported");
    expect(pushSupport(false, "Mozilla/5.0 (X11; Linux x86_64)", 0)).toBe("unsupported");
  });
});

describe("keyBytes", () => {
  it("turns the VAPID key into its 65 raw bytes", () => {
    const bytes = keyBytes(VAPID_PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4); // an uncompressed P-256 point
  });
  it("decodes base64url", () => {
    expect([...keyBytes("_-8")]).toEqual([255, 239]);
  });
});

describe("refreshPushHere", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/dev";
  function browser(permission: string, subscribed: boolean) {
    const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "B".repeat(87), auth: "k".repeat(22) } }) };
    vi.stubGlobal("window", { PushManager: class {}, Notification: { permission } });
    vi.stubGlobal("Notification", { permission });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0",
      maxTouchPoints: 0,
      serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => (subscribed ? sub : null) } }) },
    });
  }
  beforeEach(() => rpc.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("saves this browser's subscription again for whoever is signed in", async () => {
    browser("granted", true);
    await refreshPushHere();
    expect(rpc).toHaveBeenCalledWith("cs_save_push_subscription", { p_endpoint: endpoint, p_p256dh: "B".repeat(87), p_auth: "k".repeat(22) });
  });

  it("does nothing where alerts were never switched on or are blocked", async () => {
    browser("granted", false);
    await refreshPushHere();
    browser("denied", true);
    await refreshPushHere();
    expect(rpc).not.toHaveBeenCalled();
  });
});
