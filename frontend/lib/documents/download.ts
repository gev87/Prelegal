/**
 * Handing a document to the visitor as a file.
 *
 * Extracted from `DocumentCreator` when PL-7 added a second screen that
 * downloads documents — the saved-document viewer. Two copies of this would be
 * two chances for a live document and a saved one to come out differently
 * named, or for one to gain a fix the other did not.
 */

import { documentFilename } from "@/lib/documents/render";
import type { DocumentFields, DocumentType } from "@/lib/documents/types";

export function downloadMarkdown(
  doc: DocumentType,
  fields: DocumentFields,
  markdown: string,
): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = documentFilename(doc, fields, "md");
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking in the same tick can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The print stylesheet reduces the page to the sheet alone; the browser's
 * "Save as PDF" destination produces real, selectable text rather than the
 * bitmap a canvas-based exporter would give.
 */
export function downloadPdf(): void {
  window.print();
}
