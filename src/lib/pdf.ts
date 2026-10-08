// A PDF of full-page JPEG images (a carousel as a LinkedIn document post),
// written by hand: one page per image, each image a DCTDecode XObject drawn
// to fill the page. No dependency; tested in pdf.test.ts.

export interface PdfImage {
  /** JPEG file bytes. */
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const enc = new TextEncoder();

/** Page size in PDF points follows the image size, so a 1080x1350 slide keeps its 4:5 shape. */
export function buildPdf(images: PdfImage[]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%âãÏÓ\n");
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`);
  images.forEach((img, i) => {
    const page = 3 + i * 3;
    const w = Math.round(img.width);
    const h = Math.round(img.height);
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`);
    offsets[page + 1] = length;
    push(`${page + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
    push(img.jpeg);
    push("\nendstream\nendobj\n");
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(page + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  });

  const count = 3 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
