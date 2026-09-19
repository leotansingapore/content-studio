// Review status for the drafts on My posts. Silent when the user isn't a
// team member or team review isn't available: the page then works as before.
import { useCallback, useEffect, useMemo, useState } from "react";

import { scanCompliance } from "@/lib/compliance";
import type { DraftEntry } from "@/lib/draftHistory";
import {
  deriveReviewState,
  fetchMyMembership,
  fetchMySubmissions,
  friendlyError,
  latestSubmissionByDraft,
  reviewHash,
  reviewTextForDraft,
  submitForReview,
  type DraftReviewState,
  type ReviewSubmission,
  type TeamMember,
} from "@/lib/teamReview";

export interface DraftReviewInfo {
  state: DraftReviewState;
  latest?: ReviewSubmission;
}

export interface DraftReviews {
  /** True for team members. Leaders can't approve their own posts, so they don't submit. */
  enabled: boolean;
  /** null while the draft's text is still being hashed. */
  infoFor: (draft: DraftEntry) => DraftReviewInfo | null;
  submit: (draft: DraftEntry) => Promise<void>;
  submittingId: string | null;
  errors: Record<string, string>;
}

export function useDraftReviews(userId: string | null, drafts: DraftEntry[]): DraftReviews {
  const [member, setMember] = useState<TeamMember | null>(null);
  const [subs, setSubs] = useState<ReviewSubmission[]>([]);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const m = await fetchMyMembership(userId);
        if (!active || !m || m.role !== "member") return;
        const mine = await fetchMySubmissions(userId, m.team_id);
        if (!active) return;
        setSubs(mine);
        setMember(m);
      } catch {
        // No team review for this user right now; leave My posts unchanged.
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const latest = useMemo(() => latestSubmissionByDraft(subs), [subs]);

  // Only approved drafts need a hash ("Edited since approval").
  const toHash = useMemo(
    () =>
      drafts
        .filter((d) => latest.get(d.id)?.status === "approved")
        .map((d) => ({ id: d.id, text: reviewTextForDraft(d.draft) })),
    [drafts, latest],
  );

  useEffect(() => {
    if (toHash.length === 0) return;
    let active = true;
    Promise.all(toHash.map(async (d) => [d.id, await reviewHash(d.text)] as const)).then(
      (pairs) => {
        if (active) setHashes((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      },
    );
    return () => {
      active = false;
    };
  }, [toHash]);

  const infoFor = useCallback(
    (draft: DraftEntry): DraftReviewInfo | null => {
      const sub = latest.get(draft.id);
      if (!sub) return { state: "none" };
      if (sub.status !== "approved") return { state: deriveReviewState(sub, ""), latest: sub };
      const want = toHash.find((d) => d.id === draft.id);
      const hash = hashes[draft.id];
      if (!want || hash === undefined) return null;
      return { state: deriveReviewState(sub, hash), latest: sub };
    },
    [hashes, latest, toHash],
  );

  const submit = useCallback(async (draft: DraftEntry) => {
    setSubmittingId(draft.id);
    setErrors((prev) => ({ ...prev, [draft.id]: "" }));
    try {
      const content = reviewTextForDraft(draft.draft);
      const row = await submitForReview({
        draftId: draft.id,
        platform: draft.platform || "unknown",
        format: draft.format || "unknown",
        content,
        flags: scanCompliance(content),
      });
      setSubs((prev) => [row, ...prev]);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [draft.id]: friendlyError(e) }));
    } finally {
      setSubmittingId(null);
    }
  }, []);

  return { enabled: member !== null, infoFor, submit, submittingId, errors };
}
