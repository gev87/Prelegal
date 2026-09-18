/**
 * The documents somebody has saved.
 *
 * One module per API surface, as `lib/chat.ts` is for `/api/chat`. What travels
 * is the pair the browser already holds while drafting — the document type and
 * the cover page — because that is all it takes to render the document again
 * from the Standard Terms baked into this build. The server keeps no rendered
 * text and could not produce any; see `backend/app/documents.py`.
 */

import { apiFetch, describeFailure } from "@/lib/api";
import type { DocumentFields } from "@/lib/documents/types";

export interface SavedDocumentSummary {
  id: number;
  documentType: string;
  documentTypeName: string | null;
  /** As SQLite wrote it: `YYYY-MM-DD HH:MM:SS`, UTC. */
  createdAt: string;
}

export interface SavedDocument extends SavedDocumentSummary {
  fields: DocumentFields;
}

/** Raised when the API refuses or cannot be reached. One type, because every
 *  caller does the same thing with it: show the message and offer a retry. */
export class HistoryFailedError extends Error {}

export async function saveDocument(
  documentType: string,
  fields: DocumentFields,
): Promise<SavedDocument> {
  const body = await request("/api/documents", {
    method: "POST",
    body: JSON.stringify({ documentType, fields }),
  });

  if (!isSavedDocument(body)) {
    throw new HistoryFailedError("The server saved something unexpected.");
  }

  return body;
}

export async function listSavedDocuments(): Promise<SavedDocumentSummary[]> {
  const body = await request("/api/documents");

  if (!Array.isArray(body) || !body.every(isSavedSummary)) {
    throw new HistoryFailedError("The server sent an unreadable list.");
  }

  return body;
}

export async function fetchSavedDocument(id: number): Promise<SavedDocument> {
  const body = await request(`/api/documents/${id}`);

  if (!isSavedDocument(body)) {
    throw new HistoryFailedError("The server sent an unreadable document.");
  }

  return body;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;

  try {
    response = await apiFetch(path, init);
  } catch {
    throw new HistoryFailedError(
      "Could not reach the server. Check that it is running.",
    );
  }

  if (!response.ok) {
    throw new HistoryFailedError(await describeFailure(response));
  }

  return response.json().catch(() => null);
}

/**
 * Checked before it is trusted, for the reason `lib/chat.ts` checks a turn:
 * these values reach `renderDocument`, and a `fields` that is not an object
 * would throw somewhere much less obvious than here.
 */
function isSavedSummary(value: unknown): value is SavedDocumentSummary {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "number" &&
    typeof row.documentType === "string" &&
    (typeof row.documentTypeName === "string" || row.documentTypeName === null) &&
    typeof row.createdAt === "string"
  );
}

function isSavedDocument(value: unknown): value is SavedDocument {
  if (!isSavedSummary(value)) return false;
  const row = value as unknown as Record<string, unknown>;

  return typeof row.fields === "object" && row.fields !== null;
}
