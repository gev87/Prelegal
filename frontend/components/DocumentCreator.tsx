"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import ChatPanel, { type ChatPanelHandle } from "@/components/ChatPanel";
import DocumentPreview from "@/components/DocumentPreview";
import DownloadBar from "@/components/DownloadBar";
import type { ChatTurn } from "@/lib/chat";
import {
  findDocument,
  isMutualNda,
  UNDETERMINED,
  type DocumentFields,
  type DocumentType,
} from "@/lib/documents/types";
import { documentFilename, renderDocument } from "@/lib/documents/render";
import { describeMissing, validateDocument } from "@/lib/documents/validate";
import type { DefinedTermKey, NdaFields } from "@/lib/nda/schema";

interface DocumentCreatorProps {
  /** Every document type, with its Standard Terms and field descriptors, read
   *  at build time — see lib/documents/catalog.ts. */
  documents: DocumentType[];
  today: string;
}

type MobileView = "chat" | "document";

export default function DocumentCreator({ documents, today }: DocumentCreatorProps) {
  /**
   * Which document this is, and what has been said about it.
   *
   * Both start empty. PL-6 put the choice of document in the conversation
   * rather than in a picker, so there is genuinely nothing to draft until the
   * assistant has worked out what the visitor wants — and `undetermined` is
   * how the backend spells that, on a cover page with no fields at all.
   */
  const [documentType, setDocumentType] = useState(UNDETERMINED);
  const [fields, setFields] = useState<DocumentFields>({});
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const chat = useRef<ChatPanelHandle>(null);

  const active = useMemo(
    () => findDocument(documents, documentType),
    [documents, documentType],
  );

  const errors = useMemo(
    () => (active ? validateDocument(active, fields) : {}),
    [active, fields],
  );

  const markdown = useMemo(
    () => (active ? renderDocument(active, fields) : ""),
    [active, fields],
  );

  /**
   * One turn's worth of change, applied together.
   *
   * The type and the fields have to move in the same render: a cover page
   * from the new document shown against the old document's descriptors would
   * be read with the wrong labels, and for a moment the preview would be
   * nonsense.
   */
  const handleTurn = useCallback((turn: ChatTurn) => {
    setDocumentType(turn.documentType);
    setFields(turn.fields);
  }, []);

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
      if (!active) {
        setMobileView("chat");
        chat.current?.reportMissing(["a document to draft"]);
        return;
      }

      const missing = describeMissing(active, errors);

      if (missing.length > 0) {
        setMobileView("chat");
        chat.current?.reportMissing(missing);
        return;
      }

      download();
    },
    [active, errors],
  );

  const downloadMarkdown = useCallback(() => {
    withCompleteDocument(() => {
      if (!active) return;

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = documentFilename(active, fields, "md");
      document.body.append(link);
      link.click();
      link.remove();

      // Revoking in the same tick can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }, [active, fields, markdown, withCompleteDocument]);

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
          <span className="brand-doc">
            {active ? active.name : "Choose a document"}
          </span>
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
            documents={documents}
            documentType={documentType}
            fields={fields}
            today={today}
            onTurn={handleTurn}
          />
        </section>

        <section
          className={`pane pane-document${mobileView === "document" ? "" : " pane-hidden"}`}
          aria-label="Agreement preview"
        >
          {active ? (
            <DocumentPreview
              markdown={markdown}
              ndaFields={
                isMutualNda(active.slug) ? (fields as unknown as NdaFields) : null
              }
              onTermSelect={handleTermSelect}
            />
          ) : (
            <NothingChosenYet />
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The document pane before there is a document.
 *
 * Says what is on offer without listing all eleven: the conversation beside
 * it is where the choosing happens, and a list here would be a picker by
 * another name.
 */
function NothingChosenYet() {
  return (
    <article className="sheet">
      <div className="document document-empty">
        <h1>No document yet</h1>
        <p>
          Tell the assistant what you need — an NDA, a cloud service or
          software licence agreement, a data processing agreement, a pilot, a
          statement of work and more — and the draft will appear here as you
          answer.
        </p>
      </div>
    </article>
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
