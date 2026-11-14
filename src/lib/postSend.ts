// Post it for me's non-UI parts, shared by the schedule steps (src/components/ScheduleSteps.tsx), today's panel
// (PostItForMe.tsx) and a launched campaign (src/lib/campaignLaunch.ts): a saved carousel's slides as the post's
// pictures, the Activity row about a post, and what a schedule call leaves on the draft (keepSchedule, sendScheduled).

import { logActivity } from "@/lib/activity";
import { schedulePost, linkFromView, tiktokReason, uploadAll, wallIn, TIMEZONE, type MediaFile, type PostView, type ScheduleRequest } from "@/lib/autoPost";
import { DEFAULT_BRAND, loadBrand, type SavedCarousel } from "@/lib/carousel";
import { slideImage } from "@/lib/carouselDesigns";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgToPng } from "@/lib/carouselRender";
import { getFile } from "@/lib/deviceFiles";
import { setDraftStatus, setDraftZernio, type DraftEntry } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { anyAiFile } from "@/lib/mediaLibrary";
import type { Slideshow } from "@/lib/slideshow";

/** The draft's own carousel slides as SVGs, drawn the way Carousel draws them, in its design and size. */
export async function carouselSvgs(userId: string, c: SavedCarousel): Promise<string[]> {
  const brand = loadBrand(userId) ?? DEFAULT_BRAND;
  const measure = createCanvasMeasure();
  const pictures: Record<string, string> = {};
  for (const s of c.slides) {
    if (!s.image || pictures[s.image]) continue;
    const blob = await getFile(s.image).catch(() => undefined);
    if (blob) {
      pictures[s.image] = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => resolve("");
        r.readAsDataURL(blob);
      });
    }
  }
  return c.slides.map((s, i) =>
    renderSvg(
      layoutSlide(
        { title: s.title, body: s.body, index: i, total: c.slides.length, brand, image: s.image ? pictures[s.image] || undefined : undefined, align: c.align, scale: c.scale, font: c.font, paper: c.paper, design: c.design, size: c.size },
        measure,
      ),
    ),
  );
}

/**
 * The Made with AI label's preset (Leo only): on when a picture going out is AI-made (anyAiFile: ai-image made it),
 * off for an upload, a stock photo, a layout or a file picked by hand. An AI video is a file picked by hand by the time
 * it is posted, so it starts off too, and the person ticks it.
 */
export function aiMadePreset(userId: string, from: { carousel?: SavedCarousel | null; slideshow?: Slideshow | null; files?: (string | undefined)[] }): boolean {
  return anyAiFile(userId, [
    ...(from.carousel?.slides ?? []).map((s) => s.image),
    ...(from.slideshow?.slides ?? []).flatMap((s) => [s.image, ...(s.cells ?? []).map((c) => c?.image)]),
    ...(from.files ?? []),
  ]);
}

/** One slide as the PNG Zernio gets (a 4:5 one exactly as before). */
export const slidePng = (c: SavedCarousel, svg: string): Promise<Blob> => (c.size ? slideImage(svg, c.size, "image/png") : svgToPng(svg));

/** One Activity row about the post: Leo's sessions only, since logActivity does nothing until his session turns it on. */
export function logPost(userId: string, d: DraftEntry, title: (name: string) => string, detail?: string) {
  const hook = d.hook.replace(/\s+/g, " ").trim() || "Untitled";
  const name = `"${hook.length > 70 ? `${hook.slice(0, 67).trimEnd()}...` : hook}"`;
  logActivity(userId, { who: "you", kind: "post", title: title(name), ...(detail ? { detail } : {}), link: links.calendar({ post: d.id }) });
}

/**
 * Schedules the post and keeps Zernio's answer on the draft: on its day at the minute Zernio holds (set before the link,
 * so the save that adds the link changes no time and queues no move), then the link. `failed` is the first reason
 * when Zernio made the post and failed it at once; the draft's status is left as it was then.
 */
export async function keepSchedule(userId: string, profileId: string, draftId: string, req: ScheduleRequest, at: string | null, tz: string = TIMEZONE): Promise<{ post: PostView; failed: string | null }> {
  const { post } = await schedulePost(profileId, req);
  const failed = post.status === "failed" ? (post.platforms.find((p) => p.error)?.error ?? "Zernio couldn't post it.") : null;
  if (!failed) setDraftStatus(userId, draftId, "scheduled", wallIn(post.scheduledFor || at || new Date().toISOString(), tz));
  setDraftZernio(userId, draftId, linkFromView(req.clientKey, post));
  return { post, failed };
}

/**
 * A dated draft to Zernio with no one at the screen (a launched campaign): the key goes on the draft before the call,
 * so an answer lost on the way never sends a second post, then the media goes up and the post is scheduled at `at`
 * in `tz` (sent only when it isn't Singapore). `by` marks who sent it on the link, kept through later reads.
 * Throws in plain words; a post Zernio failed at once throws its reason.
 */
export async function sendScheduled(
  userId: string,
  profileId: string,
  draftId: string,
  o: { key: string; accountIds: string[]; content: string; media: MediaFile[]; at: string; tz: string; by?: "launch"; aiMade?: boolean },
): Promise<PostView> {
  const zone = o.tz === TIMEZONE ? {} : { tz: o.tz };
  setDraftZernio(userId, draftId, { key: o.key, ...zone, ...(o.by ? { by: o.by } : {}) });
  const mediaUrls = o.media.length ? await uploadAll(profileId, o.media, new Map(), () => {}) : [];
  const { post, failed } = await keepSchedule(
    userId,
    profileId,
    draftId,
    { accountIds: o.accountIds, clientKey: o.key, content: o.content, mediaUrls, scheduledFor: o.at, ...(zone.tz ? { timezone: zone.tz } : {}), ...(o.aiMade ? { aiMade: true } : {}) },
    o.at,
    o.tz,
  );
  if (failed) throw new Error(tiktokReason(failed));
  return post;
}
