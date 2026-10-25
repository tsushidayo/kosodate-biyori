import { apiFailure, apiJson, content } from "@/lib/parenting-store";
export const dynamic = "force-dynamic";
export async function GET(){try{return apiJson(await content());}catch(e){return apiFailure(e);}}
