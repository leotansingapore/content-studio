// Two copies of a synced list become one, item by item, instead of the last device to save wiping the other's (QA 6
// Nov: a laptop and a phone open together lost posts, and deleted ones came back). A three-way merge against `base`,
// what this device last knew the cloud held (each item's id and a hash of it): an item one side added is kept, one a
// side deleted is dropped unless the other side edited it since, an item one side changed takes that side's copy, and
// when both changed it the newer save wins. With no base yet nothing counts as deleted, so a first sync only adds.

export type SyncBase = Record<string, string>;

/** A short fingerprint of an item's whole content. */
export function hashOf(value: unknown): string {
  const s = JSON.stringify(value) ?? "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
}

export const baseOf = <T extends { id: string }>(list: T[]): SyncBase => Object.fromEntries(list.map((x) => [x.id, hashOf(x)]));

/**
 * One list from this device's (`local`) and the cloud's. It keeps the order of the side saved last (`localNewer`), with
 * the other side's new items on top, so two devices holding the same items settle on one order instead of re-saving.
 */
export function mergeById<T extends { id: string }>(local: T[], cloud: T[], base: SyncBase | null, localNewer: boolean): T[] {
  const mine = new Map(local.map((x) => [x.id, x]));
  const theirs = new Map(cloud.map((x) => [x.id, x]));
  const changed = (x: T) => !base || base[x.id] === undefined || hashOf(x) !== base[x.id];
  // an item only one side holds: added there (kept), or deleted on the other side (kept only if edited since)
  const alone = (x: T) => (!base || base[x.id] === undefined ? x : changed(x) ? x : null);
  const pick = (l: T, c: T) =>
    hashOf(l) === hashOf(c) ? l : changed(l) && !changed(c) ? l : changed(c) && !changed(l) ? c : localNewer ? l : c;
  const [lead, other, leadIsLocal] = localNewer ? [local, theirs, true] : [cloud, mine, false];
  const leadIds = new Set(lead.map((x) => x.id));
  const out: T[] = [];
  for (const x of (localNewer ? cloud : local)) if (!leadIds.has(x.id) && alone(x)) out.push(x);
  for (const x of lead) {
    const y = other.get(x.id);
    if (!y) {
      if (alone(x)) out.push(x);
    } else out.push(leadIsLocal ? pick(x, y) : pick(y, x));
  }
  return out;
}

/** A stored list whose every item has a string id, or null. */
function parseList<T extends { id: string }>(raw: string): T[] | null {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof x.id === "string") ? (v as T[]) : null;
  } catch {
    return null;
  }
}

/** How cloudSync merges a key's two stored copies (cloudSync.ts SyncMerger). */
export interface SyncMerger {
  /** The merged stored value, or null to fall back to the whole-value rules (a value that isn't a list of items). */
  merge(local: string, cloud: string, base: SyncBase | null, localNewer: boolean): string | null;
  /** The base to keep after the cloud is known to hold `value`. */
  base(value: string): SyncBase | null;
  /** Called after a merge rewrote the key on this device, so open pages read it again. */
  changed?(key: string): void;
}

export function listMerger<T extends { id: string }>(opts: { after?: (list: T[]) => T[]; changed?: (key: string) => void } = {}): SyncMerger {
  return {
    merge(local, cloud, base, localNewer) {
      const l = parseList<T>(local);
      const c = parseList<T>(cloud);
      if (!l || !c) return null;
      const merged = mergeById(l, c, base, localNewer);
      return JSON.stringify(opts.after ? opts.after(merged) : merged);
    },
    base(value) {
      const list = parseList<T>(value);
      return list ? baseOf(list) : null;
    },
    changed: opts.changed,
  };
}
