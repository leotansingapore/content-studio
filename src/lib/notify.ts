// Phone alerts and the Monday results email (supabase/functions/notify).
//   key: content-studio-notify-${userId}   {"email": boolean, "push": boolean}
// Account-wide, not per profile, and synced, so the hourly job reads it from
// cs_user_data. Off is written as an explicit false, never by removing the key:
// the sync has no tombstones, so a removed key comes back from another device.
// Each browser that switches alerts on saves its push subscription with
// cs_save_push_subscription (supabase/hub/016_notify.sql); public/sw.js shows
// the alerts.

import { supabase } from "@/lib/supabase";

export const NOTIFY_PREFIX = "content-studio-notify-";
/** VAPID public key. The private half is the notify function's VAPID_KEYS secret. */
export const VAPID_PUBLIC_KEY = "BHXVNSVTIWp65KR3r6IDByi4YIM33e0rz0nNKDUdZQVsjKoCffumrfF9ETYoI4MpPk74oP_F-ZfPQvdJ6jUBMgo";

export interface NotifyPrefs {
  email: boolean;
  push: boolean;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadNotifyPrefs(userId: string | null | undefined): NotifyPrefs {
  if (!userId) return { email: false, push: false };
  try {
    const p = JSON.parse(storage()?.getItem(NOTIFY_PREFIX + userId) ?? "{}");
    return { email: p?.email === true, push: p?.push === true };
  } catch {
    return { email: false, push: false };
  }
}

/** Always writes both switches, so turning one off is a value that syncs. */
export function saveNotifyPrefs(userId: string, prefs: NotifyPrefs): NotifyPrefs {
  const tidy = { email: prefs.email === true, push: prefs.push === true };
  storage()?.setItem(NOTIFY_PREFIX + userId, JSON.stringify(tidy));
  return tidy;
}

export type PushSupport = "ok" | "ios-install" | "unsupported";

/** iPhone and iPad offer push only to the app added to the Home Screen; iPadOS says "Macintosh". */
export function pushSupport(hasPush: boolean, ua: string, touchPoints: number): PushSupport {
  if (hasPush) return "ok";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ios-install";
  return "unsupported";
}

export function browserPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return pushSupport(hasPush, navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** The VAPID key as the bytes pushManager.subscribe wants (atob takes it unpadded). */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64url.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (browserPushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Alerts reach this device: permission granted and a live subscription. */
export async function pushOnHere(): Promise<boolean> {
  try {
    return Notification.permission === "granted" && !!(await currentSubscription());
  } catch {
    return false;
  }
}

/** Asks for permission (call it straight from the tap), subscribes this device and saves it. */
export async function enablePushHere(): Promise<"ok" | "denied" | "failed"> {
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  try {
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const { endpoint, keys } = sub.toJSON();
    const { error } = await supabase.rpc("cs_save_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: keys?.p256dh,
      p_auth: keys?.auth,
    });
    if (error) throw error;
    return "ok";
  } catch (e) {
    console.error("Could not switch alerts on", e);
    return "failed";
  }
}

/** Stops alerts on this device and forgets it on the server (call while still signed in). */
export async function disablePushHere(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const { error } = await supabase.rpc("cs_delete_push_subscription", { p_endpoint: sub.endpoint });
  if (error) console.error("Could not forget this device", error);
  await sub.unsubscribe();
}
