const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const postHtml = (text: string, src: string): string =>
  `${text
    .split("\n")
    .map((line) => `<div>${line.trim() ? escapeHtml(line) : "<br>"}</div>`)
    .join("")}<div><br></div><div><img src="${escapeHtml(src)}" alt=""></div>`;

const pngOf = async (pic: Blob): Promise<Blob> => {
  if (pic.type === "image/png") return pic;
  const img = await createImageBitmap(pic);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")?.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be copied."))), "image/png"));
};

const dataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

const pngFrom = (picture: Promise<Blob | undefined>): Promise<Blob> =>
  picture.then((p) => {
    if (!p) throw new Error("The picture isn't on this device.");
    return pngOf(p);
  });

export const canCopyPictures = (): boolean => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

export const copyPost = async (text: string, picture: Promise<Blob | undefined>): Promise<void> => {
  const png = pngFrom(picture);
  const html = png.then(async (b) => new Blob([postHtml(text, await dataUrl(b))], { type: "text/html" }));
  await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": html, "image/png": png })]);
};

export const copyPicture = (picture: Promise<Blob | undefined>): Promise<void> =>
  navigator.clipboard.write([new ClipboardItem({ "image/png": pngFrom(picture) })]);
