"use client";

import { useCallback, useMemo } from "react";

import DocumentPreview from "@/components/DocumentPreview";
import DownloadBar from "@/components/DownloadBar";
import { downloadMarkdown, downloadPdf } from "@/lib/documents/download";
import type { SavedDocument } from "@/lib/documents/history";
import { renderDocument } from "@/lib/documents/render";
import { findDocument, isMutualNda, type DocumentType } from "@/lib/documents/types";
import type { NdaFields } from "@/lib/nda/schema";

interface SavedDocumentViewerProps {
  saved: SavedDocument;
  /** The catalog, read at build time and handed down from the page — the same
   *  array the creator works from. */
  documents: DocumentType[];
  onBack: () => void;
}

/**
 * A document somebody saved earlier, read back.
 *
 * Rendered by `renderDocument` — the same function the live creator uses, not
 * a second one for saved documents. That is the reason the server stores the
 * answers rather than the finished text: a saved agreement is rebuilt from the
 * Standard Terms in the current build, so a correction to a template reaches
 * documents already saved instead of only new ones.
 *
 * Read-only throughout. PL-7 asks that a visitor be able to look back at what
 * they drafted, not carry on drafting it, so there is no chat panel here and
 * no defined term is a control.
 */
export default function SavedDocumentViewer({
  saved,
  documents,
  onBack,
}: SavedDocumentViewerProps) {
  const doc = useMemo(
    () => findDocument(documents, saved.documentType),
    [documents, saved.documentType],
  );

  const markdown = useMemo(
    () => (doc ? renderDocument(doc, saved.fields) : ""),
    [doc, saved.fields],
  );

  const handleDownloadMarkdown = useCallback(() => {
    if (doc) downloadMarkdown(doc, saved.fields, markdown);
  }, [doc, markdown, saved.fields]);

  if (!doc) {
    // A stored slug that is no longer a document type. Nothing does this
    // today, but the alternative to saying so is a blank sheet.
    return (
      <div className="history-error" role="alert">
        <p>
          This was drafted as a document type the product no longer offers, so
          it cannot be shown.
        </p>
        <button type="button" className="button" onClick={onBack}>
          Back to my documents
        </button>
      </div>
    );
  }

  return (
    <div className="viewer">
      <header className="app-header">
        <div className="brand">
          <button type="button" className="viewer-back" onClick={onBack}>
            ← My documents
          </button>
          <span className="brand-doc">{doc.name}</span>
        </div>

        <DownloadBar
          onDownloadMarkdown={handleDownloadMarkdown}
          onDownloadPdf={downloadPdf}
        />
      </header>

      {/* The same wrapper classes the creator's document pane uses, so the
          print stylesheet — which reduces the page to `.sheet` — applies here
          without a rule of its own. */}
      <div className="panes panes-single">
        <section className="pane pane-document" aria-label="Saved agreement">
          <DocumentPreview
            markdown={markdown}
            ndaFields={
              isMutualNda(doc.slug) ? (saved.fields as unknown as NdaFields) : null
            }
          />
        </section>
      </div>
    </div>
  );
}
