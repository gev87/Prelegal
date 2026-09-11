import NdaEntry from "@/app/nda-entry";
import { loadStandardTerms } from "@/lib/nda/templates";

/**
 * The Standard Terms are read here, on the server, and so — because the app
 * is statically exported — at build time. That is the right moment for them:
 * they are a fixed, versioned legal text, and baking them in means the
 * running container needs no templates/ directory at all.
 *
 * The effective date is the opposite kind of value, and is deliberately not
 * computed here. See app/nda-entry.tsx.
 */
export default async function Page() {
  const standardTerms = await loadStandardTerms();

  return <NdaEntry standardTerms={standardTerms} />;
}
