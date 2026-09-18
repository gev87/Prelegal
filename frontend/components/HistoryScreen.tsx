"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAccount } from "@/components/AccountProvider";
import SavedDocumentViewer from "@/components/SavedDocumentViewer";
import { formatSavedAt } from "@/lib/date";
import {
  fetchSavedDocument,
  listSavedDocuments,
  type SavedDocument,
  type SavedDocumentSummary,
} from "@/lib/documents/history";
import type { DocumentType } from "@/lib/documents/types";

interface HistoryScreenProps {
  documents: DocumentType[];
}

type Listing =
  | { state: "loading" }
  | { state: "ready"; rows: SavedDocumentSummary[] }
  | { state: "failed"; message: string };

/**
 * The documents this visitor has saved.
 *
 * Everything here happens after mount. The app is a static export, so this
 * page's HTML is written at build time when there is no visitor and no list —
 * which is also why a saved document cannot have a route of its own
 * (`/history/12/` would have to exist before anybody had saved anything).
 * Choosing one is state on this page instead.
 */
export default function HistoryScreen({ documents }: HistoryScreenProps) {
  const { status } = useAccount();
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  const [opened, setOpened] = useState<SavedDocument | null>(null);
  const [openFailed, setOpenFailed] = useState<string | null>(null);

  /**
   * Which read of the list is the current one.
   *
   * Only the newest answer may write, so two overlapping reads cannot land out
   * of order. No sequence of clicks produces that today — "Try again" only
   * exists once a read has already failed — but the effect also re-runs
   * whenever `status` changes, and signing out and back in while a read is in
   * flight would otherwise let the first one answer for the second.
   *
   * Deliberately a ref, not state: nothing renders differently because of it.
   */
  const read = useRef(0);

  const load = useCallback(() => {
    const attempt = ++read.current;

    listSavedDocuments()
      .then((rows) => {
        if (attempt === read.current) setListing({ state: "ready", rows });
      })
      .catch((error: Error) => {
        if (attempt === read.current) {
          setListing({ state: "failed", message: error.message });
        }
      });
  }, []);

  useEffect(() => {
    // Nothing is asked of the API until somebody is known to be signed in — a
    // guest would only be asking for the 401 the shell already knows about.
    //
    // `load` sets no state until its answer arrives, which is what keeps this
    // effect free of the synchronous setState React warns about.
    if (status === "signed-in") load();
  }, [status, load]);

  /** Says it is working again straight away — from an event handler, where
   *  setting state immediately is exactly right. */
  const retry = useCallback(() => {
    setListing({ state: "loading" });
    load();
  }, [load]);

  const open = useCallback(async (id: number) => {
    setOpenFailed(null);

    try {
      setOpened(await fetchSavedDocument(id));
    } catch (error) {
      setOpenFailed((error as Error).message);
    }
  }, []);

  const close = useCallback(() => setOpened(null), []);

  if (opened) {
    return (
      <SavedDocumentViewer saved={opened} documents={documents} onBack={close} />
    );
  }

  return (
    <main className="history-page">
      <div className="history">
        <h1 className="history-heading">My documents</h1>

        {status === "loading" ? (
          <p className="history-loading" aria-busy="true">
            Loading…
          </p>
        ) : null}

        {status === "guest" ? <SignInFirst /> : null}

        {status === "signed-in" ? (
          <>
            {openFailed ? (
              <p className="history-error" role="alert">
                {openFailed}
              </p>
            ) : null}

            <Listed listing={listing} onOpen={open} onRetry={retry} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function SignInFirst() {
  return (
    <div className="history-empty">
      <p>
        Documents you save are kept against your account, so there is nothing
        to show until you have one.
      </p>
      <Link href="/login/" className="button button-primary">
        Sign in or create an account
      </Link>
    </div>
  );
}

interface ListedProps {
  listing: Listing;
  onOpen: (id: number) => void;
  onRetry: () => void;
}

function Listed({ listing, onOpen, onRetry }: ListedProps) {
  if (listing.state === "loading") {
    return (
      <p className="history-loading" aria-busy="true">
        Looking for your documents…
      </p>
    );
  }

  if (listing.state === "failed") {
    return (
      <div className="history-error" role="alert">
        <p>{listing.message}</p>
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (listing.rows.length === 0) {
    return (
      <div className="history-empty">
        <p>
          Nothing saved yet. Draft an agreement and save it — or download one,
          which saves it too.
        </p>
        <Link href="/" className="button button-primary">
          Draft a document
        </Link>
      </div>
    );
  }

  return (
    <ul className="history-list">
      {listing.rows.map((row) => (
        <li key={row.id} className="history-card">
          <div className="history-card-text">
            <span className="history-card-type">
              {row.documentTypeName ?? row.documentType}
            </span>
            <span className="history-card-date">{formatSavedAt(row.createdAt)}</span>
          </div>

          <button type="button" className="button" onClick={() => onOpen(row.id)}>
            View
          </button>
        </li>
      ))}
    </ul>
  );
}
