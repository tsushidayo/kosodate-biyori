import { apiFailure, apiJson, checkOrigin, refreshFeeds } from "@/lib/parenting-store";
export const dynamic = "force-dynamic";
// Only the source URLs bundled in the project are fetched; request parameters cannot select a URL.
export async function POST(request:Request){try{checkOrigin(request);return apiJson(await refreshFeeds());}catch(e){return apiFailure(e);}}
