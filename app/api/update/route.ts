import { apiFailure, apiJson, checkOrigin, readJson, writeContent } from "@/lib/parenting-store";
export const dynamic = "force-dynamic";
// Shared writer relies on the owner-private Sites boundary; add admin auth before making this Site public.
export async function POST(request:Request){try{checkOrigin(request);const body=await readJson(request,4_000_000);return apiJson(await writeContent(body.updates??[body]));}catch(e){return apiFailure(e);}}
