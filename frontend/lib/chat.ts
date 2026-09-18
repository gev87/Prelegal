/**
 * Talking to the drafting assistant.
 *
 * The backend keeps nothing between turns, so this module sends the whole
 * conversation, the document type and the whole cover page every time. That
 * sounds wasteful and is the cheap half of the exchange — the transcript is a
 * few kilobytes next to what the model itself costs — and it buys a server
 * with no session to expire and a draft that survives a backend restart.
 *
 * Nothing here trusts the response. A reply is rendered as text, never as
 * markup, and the fields are checked for shape before they are allowed near
 * the renderer, because a malformed payload reaching the renderer is a blank
 * screen rather than a bad sentence.
 */

import { apiUrl, describeFailure } from "@/lib/api";
import { isParty, UNDETERMINED, type DocumentFields } from "@/lib/documents/types";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /**
   * Written by the app rather than the assistant — the opening greeting, the
   * note about what is still missing when a download is blocked, and the
   * account of what carried across when the document type changed.
   *
   * Shown in the transcript, never sent to the model. Feeding it back would
   * let the model treat the app's own words as something it said, and a
   * greeting it never wrote is a poor thing for it to build on.
   */
  local?: boolean;
}

/** Every leaf the assistant can set, as the backend names them. */
export type FieldPath = string;

export interface ChatTurn {
  reply: string;
  /**
   * The document in effect *after* this turn, which is not always the one
   * that was sent: this is how the browser learns a document was chosen or
   * changed. `undetermined` until the assistant has settled on one.
   */
  documentType: string;
  /** What to call it on screen. `null` only while undetermined. */
  documentTypeName: string | null;
  fields: DocumentFields;
  updatedFields: FieldPath[];
  /**
   * Set only on a turn that changed the document type. The settled set is
   * *replaced* by this rather than extended, because answers that did not
   * carry are outstanding again.
   */
  carriedFields: FieldPath[];
  droppedFields: FieldPath[];
}

/** The assistant is switched off on this server, and will stay off. */
export class ChatUnavailableError extends Error {}

/** Something went wrong this time. Worth another go. */
export class ChatFailedError extends Error {}

export interface ChatRequest {
  messages: ChatMessage[];
  documentType: string;
  fields: DocumentFields;
  confirmedFields: FieldPath[];
  today: string;
}

export async function sendChatTurn(request: ChatRequest): Promise<ChatTurn> {
  let response: Response;

  try {
    response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // The assistant never sees the app's own interjections.
        messages: request.messages
          .filter((message) => !message.local)
          .map(({ role, content }) => ({ role, content })),
        documentType: request.documentType,
        fields: request.fields,
        confirmedFields: request.confirmedFields,
        today: request.today,
      }),
    });
  } catch {
    throw new ChatFailedError("Could not reach the server. Check that it is running.");
  }

  if (response.status === 503) {
    throw new ChatUnavailableError(await describeFailure(response));
  }

  if (!response.ok) {
    throw new ChatFailedError(await describeFailure(response));
  }

  const body: unknown = await response.json().catch(() => null);

  if (!isChatTurn(body)) {
    throw new ChatFailedError("The assistant sent something I could not read.");
  }

  return body;
}

/**
 * Enough of a check that nothing malformed reaches the renderer.
 *
 * Not a revalidation of the cover page's *meaning* — the server has already
 * applied its own schema, and duplicating those rules here would be two
 * places to keep in step. What it checks is that every value the renderer
 * goes on to dereference is actually there and actually the right kind of
 * thing, because the renderer calls `.trim()` and reads a party's `company`
 * without asking first.
 *
 * What PL-6 changed is *how* it checks. There used to be a list of the
 * eleven field names the Mutual NDA has; with eleven document types and 112
 * fields between them, a list here could only be one document's list, and it
 * would reject the other ten outright. So the shape of the values is checked
 * rather than their names — which is also strictly harder to let rot, since
 * there is no second list to forget to update.
 *
 * `typeof x === "object"` is not enough on its own: `typeof null` is
 * `"object"` too, so every object check here is paired with a null check.
 */
function isChatTurn(body: unknown): body is ChatTurn {
  if (!isObject(body)) return false;
  if (typeof body.reply !== "string") return false;
  if (typeof body.documentType !== "string" || !body.documentType) return false;
  if (body.documentTypeName !== null && typeof body.documentTypeName !== "string") {
    return false;
  }
  if (!Array.isArray(body.updatedFields)) return false;
  if (!Array.isArray(body.carriedFields)) return false;
  if (!Array.isArray(body.droppedFields)) return false;
  if (!isObject(body.fields)) return false;

  // Nothing has been chosen, so there is no cover page to check.
  if (body.documentType === UNDETERMINED) return true;

  return isRenderableFields(body.fields);
}

/** Every value is something the renderer can print or a party it can read. */
function isRenderableFields(fields: Record<string, unknown>): boolean {
  const values = Object.values(fields);
  if (values.length === 0) return false;

  return values.every(
    (value) =>
      typeof value === "string" || typeof value === "number" || isParty(value),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
