"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";

import {
  ChatUnavailableError,
  sendChatTurn,
  type ChatMessage,
  type FieldPath,
} from "@/lib/chat";
import { DEFINED_TERMS, type DefinedTermKey, type NdaFields } from "@/lib/nda/schema";

/**
 * What the rest of the app can make the conversation do.
 *
 * Two things happen outside this panel that belong in the transcript: a
 * defined term is clicked in the document, and a download is refused because
 * the cover page is not finished. Both are one-off events rather than state,
 * so they arrive as calls rather than as props — a prop would have to be
 * cleared again afterwards to avoid firing twice.
 */
export interface ChatPanelHandle {
  askAboutTerm(key: DefinedTermKey): void;
  reportMissing(missing: string[]): void;
}

interface ChatPanelProps {
  ref?: Ref<ChatPanelHandle>;
  fields: NdaFields;
  today: string;
  onFieldsChange: (fields: NdaFields) => void;
}

/**
 * Written by the app, not the model.
 *
 * Generating this would mean a paid call on every page load, before anyone
 * has asked for anything — and on a server with no key it would turn the
 * first thing a visitor sees into an error, when the document and both
 * downloads work perfectly well without an assistant.
 */
const GREETING =
  "I can help you draft a mutual NDA. Tell me what it's for and who the two " +
  "companies are, and I'll fill in the cover page as we go — you'll see it " +
  "take shape beside us.";

export default function ChatPanel({
  ref,
  fields,
  today,
  onFieldsChange,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING, local: true },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  /**
   * Which answers the assistant has actually settled, as opposed to which
   * fields hold a value. A blank cover page already holds a suggested
   * purpose, Delaware and one year; told those were answers, the assistant
   * would never ask the questions they stand in for.
   */
  const confirmed = useRef<FieldPath[]>([]);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    askAboutTerm(key) {
      // Seeded, not sent. A click on the document is someone reading it, and
      // spending a request — and their turn — on that would be a surprise.
      setDraft(`About the ${DEFINED_TERMS[key].label.toLowerCase()} — `);
      composer.current?.focus();
    },
    reportMissing(missing) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Before you can download it, I still need ${asList(missing)}.`,
          local: true,
        },
      ]);
    },
  }));

  // Follows the conversation down as it grows.
  useEffect(() => {
    const list = transcript.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending || unavailable) return;

    const asked: ChatMessage[] = [...messages, { role: "user", content }];

    setMessages(asked);
    setDraft("");
    setError(null);
    setSending(true);

    try {
      const turn = await sendChatTurn({
        messages: asked,
        fields,
        confirmedFields: confirmed.current,
        today,
      });

      confirmed.current = [
        ...new Set([...confirmed.current, ...turn.updatedFields]),
      ];
      onFieldsChange(turn.fields);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: turn.reply },
      ]);
    } catch (failure) {
      if (failure instanceof ChatUnavailableError) {
        // Sticky: a key is either configured for the server or it is not, so
        // letting them try again would just walk them into the same wall.
        setUnavailable(failure.message);
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setSending(false);
    }
  }, [draft, sending, unavailable, messages, fields, today, onFieldsChange]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void send();
    },
    [send],
  );

  /** Enter sends; shift-and-enter is how you get a second line. */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void send();
    },
    [send],
  );

  return (
    <div className="chat">
      <div
        className="chat-transcript"
        ref={transcript}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.map((message, index) => (
          <p
            key={index}
            className={`chat-message chat-message-${message.role}`}
          >
            <span className="chat-who">
              {message.role === "user" ? "You" : "Assistant"}
            </span>
            {message.content}
          </p>
        ))}

        {sending ? (
          <p className="chat-message chat-message-assistant chat-thinking">
            <span className="chat-who">Assistant</span>
            Thinking&hellip;
          </p>
        ) : null}
      </div>

      <form className="chat-composer" onSubmit={handleSubmit}>
        {unavailable ? (
          <p className="chat-notice" role="alert">
            {unavailable} The document beside this still works — you can read
            it and download it, but nothing will fill it in for you.
          </p>
        ) : null}

        {error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="visually-hidden" htmlFor="chat-message">
          Your message
        </label>
        <textarea
          id="chat-message"
          className="chat-input"
          ref={composer}
          rows={3}
          value={draft}
          disabled={Boolean(unavailable)}
          placeholder={
            unavailable ? "The assistant is unavailable." : "Type your answer…"
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          type="submit"
          className="button button-primary chat-send"
          disabled={sending || Boolean(unavailable) || !draft.trim()}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

/** "a, b and c" — the assistant is talking, not printing a list. */
function asList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
