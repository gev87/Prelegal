"use client";

import { useId, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { describeTerm } from "@/lib/nda/render";
import {
  DEFINED_TERM_BY_LABEL,
  type DefinedTerm,
  type DefinedTermKey,
  type NdaFields,
} from "@/lib/nda/schema";

interface DocumentPreviewProps {
  markdown: string;
  /**
   * The Mutual NDA's cover page, when that is what is being drafted, and
   * `null` for the other ten document types.
   *
   * Only the NDA has defined terms you can click to edit: the mechanism needs
   * a hand-written description of what each term *means* as a sentence
   * ("Expires 1 year from the Effective Date"), which the generic field
   * descriptors do not carry. Their cross-references still render, as plain
   * anchors that jump to the cover-page heading — the reference works, it
   * just is not a control.
   */
  ndaFields: NdaFields | null;
  onTermSelect: (key: DefinedTermKey) => void;
}

export default function DocumentPreview({
  markdown,
  ndaFields,
  onTermSelect,
}: DocumentPreviewProps) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        // Cross-references into the cover page are rendered as live defined
        // terms; anything else is an ordinary outbound link.
        const term =
          ndaFields && href?.startsWith("#")
            ? DEFINED_TERM_BY_LABEL[plainText(children)]
            : undefined;

        if (term && ndaFields) {
          return (
            <DefinedTermRef
              term={term}
              value={describeTerm(term.key, ndaFields)}
              onSelect={onTermSelect}
            />
          );
        }

        // An in-page cross-reference stays in the page; only real outbound
        // links get a new tab.
        if (href?.startsWith("#")) return <a href={href}>{children}</a>;

        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    }),
    [ndaFields, onTermSelect],
  );

  return (
    <article className="sheet">
      <div className="document">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}

interface DefinedTermRefProps {
  term: DefinedTerm;
  value: string;
  onSelect: (key: DefinedTermKey) => void;
}

function DefinedTermRef({ term, value, onSelect }: DefinedTermRefProps) {
  const tipId = useId();

  const description = `${term.label}: ${value || "not filled in yet"}. Activate to edit it on the cover page.`;

  return (
    <span className="term">
      <button
        type="button"
        className="term-ref"
        aria-describedby={tipId}
        onClick={() => onSelect(term.key)}
      >
        {term.label}
      </button>

      {/* The visible tooltip is hidden from assistive tech, which reads the
          always-present description below instead — a `visibility: hidden`
          element is not reliably reachable through aria-describedby. */}
      <span className="term-tip" aria-hidden="true">
        <span className="term-tip-label">{term.label}</span>
        <span className="term-tip-value">{value || "Not filled in yet"}</span>
        <span className="term-tip-hint">Click to edit this on the cover page</span>
      </span>
      <span className="visually-hidden" id={tipId}>
        {description}
      </span>
    </span>
  );
}

function plainText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(plainText).join("");
  return "";
}
