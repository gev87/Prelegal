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
  fields: NdaFields;
  onTermSelect: (key: DefinedTermKey) => void;
}

export default function DocumentPreview({
  markdown,
  fields,
  onTermSelect,
}: DocumentPreviewProps) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        // Cross-references into the cover page are rendered as live defined
        // terms; anything else is an ordinary outbound link.
        const term = href?.startsWith("#")
          ? DEFINED_TERM_BY_LABEL[plainText(children)]
          : undefined;

        if (term) {
          return (
            <DefinedTermRef
              term={term}
              value={describeTerm(term.key, fields)}
              onSelect={onTermSelect}
            />
          );
        }

        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    }),
    [fields, onTermSelect],
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
