import NdaCreator from "@/components/NdaCreator";
import { loadStandardTerms } from "@/lib/nda/templates";

/**
 * The effective date defaults to today, so the page is rendered per request
 * rather than frozen at the moment of the build.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const standardTerms = await loadStandardTerms();

  return (
    <NdaCreator standardTerms={standardTerms} today={isoToday()} />
  );
}

function isoToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
