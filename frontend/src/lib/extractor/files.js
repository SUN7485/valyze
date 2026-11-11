// Reading the analyst's files in the browser before they go to Claude.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const ACCEPT = ".pdf,image/*,.xlsx,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif";
export const fIcon = f => f.type === "application/pdf" ? "📄" : f.type?.startsWith("image/") ? "🖼️" : f.name.match(/\.docx?$/i) ? "📝" : "📊";

export const extractPdf = async (file, mode, opts = {}) => {
  const pdfjs = pdfjsLib;
  const ab = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
  if (pdf.numPages > 100)
    throw new Error(`"${file.name}" has ${pdf.numPages} pages. API limit is 100.\n\nSplit into two PDFs and upload both.`);

  const quality = opts.quality ?? 0.85;
  const scale   = opts.scale   ?? 1.5;
  const blocks = [];
  let textPages = 0;
  let imagePages = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const pageText = tc.items.map(i => i.str).join(" ").trim();

    if (mode === "vision" || (mode === "smart" && pageText.length <= 30)) {
      imagePages++;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
    } else {
      textPages++;
      blocks.push({ type: "text", text: `[Page ${p}]\n${pageText}` });
    }
  }

  return { blocks, textPages, imagePages };
};
