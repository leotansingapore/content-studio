// /make/text-over-clip (docs/north-star/items/formats-text-over-clip.md): Words over a made scene. One page serves
// both formats: the wall of text's page with a scene ai-video makes behind the words (WallOfText's scene mode, the
// run in src/lib/wallJob.ts).
import WallOfText from "@/components/make/WallOfText";
import type { RemixSource } from "@/lib/remixSource";

export default function TextOverClip(p: { userId: string; source: RemixSource | null }) {
  return <WallOfText {...p} scene />;
}
