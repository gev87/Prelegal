"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import ChatPanel, { type ChatPanelHandle } from "@/components/ChatPanel";
import DocumentPreview from "@/components/DocumentPreview";
import DownloadBar from "@/components/DownloadBar";
import { documentFilename, renderMnda } from "@/lib/nda/render";
import {
  createDefaultFields,
  describeMissingFields,
  validateFields,
  type DefinedTermKey,
} from "@/lib/nda/schema";

interface NdaCreatorProps {
  /** The Standard Terms, read from the repository's templates/ directory. */
  standardTerms: string;
  today: string;
}

type MobileView = "chat" | "document";

export default function NdaCreator({ standardTerms, today }: NdaCreatorProps) {
  const [fields, setFields] = useState(() => createDefaultFields(today));
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const chat = useRef<ChatPanelHandle>(null);

  const errors = useMemo(() => validateFields(fields), [fields]);
  const markdown = useMemo(
    () => renderMnda(fields, standardTerms),
    [fields, standardTerms],
  );

  /**
   * Clicking a defined term in the document asks the assistant about it.
   *
   * It used to scroll the form to the field that set it. With no form, the
   * equivalent is to bring the reader to the one place that can still change
   * it — the panel seeds the question rather than sending it, so reading the
   * document never spends a turn.
   */
  const handleTermSelect = useCallback((key: DefinedTermKey) => {
    setMobileView("chat");
    chat.current?.askAboutTerm(key);
  }, []);

  /**
   * Downloads are blocked until the document is complete enough to sign.
   *
   * The assistant says what is outstanding, in the words it would use to ask
   * for them. Worked out here rather than asked of the model: the answer is
   * already known, and a server with no key still has to be able to explain
   * why the button did nothing.
   */
  const withCompleteDocument = useCallback(
    (download: () => void) => {
      const missing = describeMissingFields(errors);

      if (missing.length > 0) {
        setMobileView("chat");
        chat.current?.reportMissing(missing);
        return;
      }

      download();
    },
    [errors],
  );

  const downloadMarkdown = useCallback(() => {
    withCompleteDocument(() => {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = documentFilename(fields, "md");
      document.body.append(link);
      link.click();
      link.remove();

      // Revoking in the same tick can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }, [fields, markdown, withCompleteDocument]);

  const downloadPdf = useCallback(() => {
    // The print stylesheet reduces the page to the sheet alone; the browser's
    // "Save as PDF" destination produces real, selectable text rather than the
    // bitmap a canvas-based exporter would give.
    withCompleteDocument(() => window.print());
  }, [withCompleteDocument]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1 className="brand-name">Prelegal</h1>
          <span className="brand-doc">Mutual NDA</span>
        </div>

        <div className="view-switch">
          <ViewSwitchOption
            label="Chat"
            view="chat"
            active={mobileView}
            onSelect={setMobileView}
          />
          <ViewSwitchOption
            label="Document"
            view="document"
            active={mobileView}
            onSelect={setMobileView}
          />
        </div>

        <DownloadBar
          onDownloadMarkdown={downloadMarkdown}
          onDownloadPdf={downloadPdf}
        />
      </header>

      <div className="panes">
        <section
          className={`pane pane-chat${mobileView === "chat" ? "" : " pane-hidden"}`}
          aria-label="Drafting assistant"
        >
          <ChatPanel
            ref={chat}
            fields={fields}
            today={today}
            onFieldsChange={setFields}
          />
        </section>

        <section
          className={`pane pane-document${mobileView === "document" ? "" : " pane-hidden"}`}
          aria-label="Agreement preview"
        >
          <DocumentPreview
            markdown={markdown}
            fields={fields}
            onTermSelect={handleTermSelect}
          />
        </section>
      </div>
    </div>
  );
}

interface ViewSwitchOptionProps {
  label: string;
  view: MobileView;
  active: MobileView;
  onSelect: (view: MobileView) => void;
}

function ViewSwitchOption({ label, view, active, onSelect }: ViewSwitchOptionProps) {
  const selected = active === view;

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`view-switch-option${selected ? " view-switch-option-active" : ""}`}
      onClick={() => onSelect(view)}
    >
      {label}
    </button>
  );
}
