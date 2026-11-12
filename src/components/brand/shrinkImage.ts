// The brand kit's picture reader, shared by Brand kit and Profile so a logo added on either is stored the same way.

/** Reads an image file into a small data URL: a centred square for the photo, a fitted box for the logo. */
export async function shrinkImage(file: File, kind: "photo" | "logo"): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image this browser can read."));
      i.src = url;
    });
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser can't resize images.");
    if (kind === "photo") {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      c.width = c.height = 256;
      g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      return c.toDataURL("image/jpeg", 0.85);
    }
    const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    g.drawImage(img, 0, 0, c.width, c.height);
    // WebP keeps the transparency at a fraction of PNG's size; browsers without it hand back PNG
    const webp = c.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
