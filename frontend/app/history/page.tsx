import HistoryScreen from "@/components/HistoryScreen";
import { loadDocuments } from "@/lib/documents/catalog";

/**
 * The catalog is read here for the same reason `app/page.tsx` reads it: a
 * saved document is stored as answers, not as text, so showing one means
 * rendering it against the Standard Terms — which are baked into this build
 * and are not in the running container at all.
 *
 * Everything else about this screen happens in the browser. See
 * `components/HistoryScreen.tsx`.
 */
export default async function HistoryPage() {
  const documents = await loadDocuments();

  return <HistoryScreen documents={documents} />;
}
