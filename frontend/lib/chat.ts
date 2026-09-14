/**
 * Talking to the drafting assistant.
 *
 * The backend keeps nothing between turns, so this module sends the whole
 * conversation and the whole cover page every time. That sounds wasteful and
 * is the cheap half of the exchange — the transcript is a few kilobytes next
 * to what the model itself costs — and it buys a server with no session to
 * expire and a draft that survives a backend restart.
 *
 * Nothing here trusts the response. A reply is rendered as text, never as
 * markup, and the fields are checked for shape before they are allowed near
 * the renderer, because a malformed payload reaching `renderMnda` is a blank
 * screen rather than a bad sentence.
 */

import { apiUrl, describeFailure } from "@/lib/api";
import type { NdaFields } from "@/lib/nda/schema";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /**
   * Written by the app rather than the assistant — the opening greeting, and
   * the note about what is still missing when a download is blocked.
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
  fields: NdaFields;
  updatedFields: FieldPath[];
}

/** The assistant is switched off on this server, and will stay off. */
export class ChatUnavailableError extends Error {}

/** Something went wrong this time. Worth another go. */
export class ChatFailedError extends Error {}

export interface ChatRequest {
  messages: ChatMessage[];
  fields: NdaFields;
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
 * places to keep in step. What this checks is that every value `renderMnda`
 * goes on to dereference is actually there and actually the right kind of
 * thing, because that function calls `.trim()` and reads `partyTwo.company`
 * without asking first. A body missing one of them is a blank document pane,
 * not a bad sentence.
 *
 * `typeof x === "object"` is not enough on its own: `typeof null` is
 * `"object"` too, so every object check here is paired with a null check.
 */
function isChatTurn(body: unknown): body is ChatTurn {
  if (!isObject(body)) return false;
  if (typeof body.reply !== "string") return false;
  if (!Array.isArray(body.updatedFields)) return false;
  if (!isObject(body.fields)) return false;

  return isNdaFields(body.fields);
}

/** Every leaf `renderMnda` and `validateFields` read without checking. */
function isNdaFields(fields: Record<string, unknown>): boolean {
  const text = [
    "purpose",
    "effectiveDate",
    "governingLaw",
    "jurisdiction",
    "modifications",
  ];

  if (!text.every((name) => typeof fields[name] === "string")) return false;

  if (typeof fields.mndaTermYears !== "number") return false;
  if (typeof fields.confidentialityYears !== "number") return false;
  if (typeof fields.mndaTermMode !== "string") return false;
  if (typeof fields.confidentialityMode !== "string") return false;

  return isParty(fields.partyOne) && isParty(fields.partyTwo);
}

function isParty(party: unknown): boolean {
  if (!isObject(party)) return false;

  return ["company", "signatoryName", "signatoryTitle", "noticeAddress"].every(
    (name) => typeof party[name] === "string",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
