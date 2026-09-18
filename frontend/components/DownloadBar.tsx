"use client";

import { DRAFT_DISCLAIMER_LINE } from "@/lib/documents/render";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface DownloadBarProps {
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
  /** Absent on a screen with nothing to save — the saved-document viewer,
   *  where the document is already saved by definition. */
  onSave?: () => void;
  saveState?: SaveState;
}

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Save",
  saving: "Saving…",
  saved: "Saved",
  error: "Save",
};

export default function DownloadBar({
  onDownloadMarkdown,
  onDownloadPdf,
  onSave,
  saveState = "idle",
}: DownloadBarProps) {
  return (
    <div className="download-bar">
      <div className="download-bar-actions">
        {onSave ? (
          <button
            type="button"
            className="button"
            onClick={onSave}
            disabled={saveState === "saving"}
          >
            {SAVE_LABEL[saveState]}
          </button>
        ) : null}

        <button type="button" className="button" onClick={onDownloadMarkdown}>
          Download Markdown
        </button>
        <button type="button" className="button button-primary" onClick={onDownloadPdf}>
          Download PDF
        </button>
      </div>

      {saveState === "error" ? (
        <p className="download-save-error" role="alert">
          Could not save that. Try again.
        </p>
      ) : null}

      {/* The same sentence the document itself carries. It sits in the header,
          which the print stylesheet hides, so a printed agreement shows the
          one inside the document rather than both. */}
      <p className="download-disclaimer">{DRAFT_DISCLAIMER_LINE}</p>
    </div>
  );
}
