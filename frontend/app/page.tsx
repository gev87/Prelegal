import DocumentEntry from "@/app/document-entry";
import { loadDocuments } from "@/lib/documents/catalog";

/**
 * Every document type is read here, on the server, and so — because the app
 * is statically exported — at build time. That is the right moment for both
 * halves of what a document type is: the Standard Terms are fixed, versioned
 * legal texts, and the field descriptors change only when a template does.
 * Baking them in means the running container needs no templates/ directory
 * at all, exactly as it did when there was one document.
 *
 * The effective date is the opposite kind of value, and is deliberately not
 * computed here. See app/document-entry.tsx.
 */
export default async function Page() {
  const documents = await loadDocuments();

  return <DocumentEntry documents={documents} />;
}
