"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DocumentPreview from "@/components/DocumentPreview";
import DownloadBar from "@/components/DownloadBar";
import NdaForm from "@/components/NdaForm";
import { documentFilename, renderMnda } from "@/lib/nda/render";
import {
  createDefaultFields,
  DEFINED_TERMS,
  ERROR_FIELD_IDS,
  validateFields,
  type DefinedTermKey,
  type FieldErrors,
  type NdaFields,
  type Party,
  type PartySlot,
} from "@/lib/nda/schema";

interface NdaCreatorProps {
  /** The Standard Terms, read from the repository's templates/ directory. */
  standardTerms: string;
  today: string;
}

type MobileView = "form" | "document";

const FLASH_DURATION_MS = 1400;

export default function NdaCreator({ standardTerms, today }: NdaCreatorProps) {
  const [fields, setFields] = useState(() => createDefaultFields(today));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("form");
  const [flashedFieldId, setFlashedFieldId] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const errors = useMemo(() => validateFields(fields), [fields]);
  const markdown = useMemo(
    () => renderMnda(fields, standardTerms),
    [fields, standardTerms],
  );

  /**
   * Every party field starts empty, so showing all twelve errors on first
   * paint would just be noise. An error appears once its field has been
   * visited, or once a download has been attempted.
   */
  const visibleErrors: FieldErrors = useMemo(() => {
    if (showAllErrors) return errors;
    return Object.fromEntries(
      Object.entries(errors).filter(([name]) => touched[name]),
    );
  }, [errors, touched, showAllErrors]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const revealField = useCallback((fieldId: string) => {
    setMobileView("form");

    // Wait a frame so the form is on screen before scrolling to it.
    window.requestAnimationFrame(() => {
      const group = document.getElementById(fieldId);
      if (!group) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      group.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
      group
        .querySelector<HTMLElement>("input:not([disabled]), textarea, select")
        ?.focus({ preventScroll: true });

      setFlashedFieldId(fieldId);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(
        () => setFlashedFieldId(null),
        FLASH_DURATION_MS,
      );
    });
  }, []);

  const handleTermSelect = useCallback(
    (key: DefinedTermKey) => revealField(DEFINED_TERMS[key].fieldId),
    [revealField],
  );

  const handleChange = useCallback((patch: Partial<NdaFields>) => {
    setFields((previous) => ({ ...previous, ...patch }));
  }, []);

  const handlePartyChange = useCallback(
    (slot: PartySlot, patch: Partial<Party>) => {
      setFields((previous) => ({
        ...previous,
        [slot]: { ...previous[slot], ...patch },
      }));
    },
    [],
  );

  const handleFieldBlur = useCallback((name: string) => {
    setTouched((previous) => ({ ...previous, [name]: true }));
  }, []);

  /** Downloads are blocked until the document is complete enough to sign. */
  const withCompleteDocument = useCallback(
    (download: () => void) => {
      const firstProblem = Object.keys(ERROR_FIELD_IDS).find((name) => errors[name]);

      if (firstProblem) {
        setShowAllErrors(true);
        revealField(ERROR_FIELD_IDS[firstProblem]);
        return;
      }

      download();
    },
    [errors, revealField],
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
            label="Details"
            view="form"
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
          className={`pane pane-form${mobileView === "form" ? "" : " pane-hidden"}`}
          aria-label="Agreement details"
        >
          <NdaForm
            fields={fields}
            errors={visibleErrors}
            flashedFieldId={flashedFieldId}
            onChange={handleChange}
            onPartyChange={handlePartyChange}
            onFieldBlur={handleFieldBlur}
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
