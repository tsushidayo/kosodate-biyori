import { apiFailure, apiJson, content } from "@/lib/parenting-store";
export const dynamic = "force-dynamic";
export async function GET(){try{const a=await content();return apiJson({...a.meta,counts:{products:a.shop.products?.length??0,chains:a.shop.chains?.length??0,stages:a.care.stages?.length??0,guides:a.care.guides?.length??0,programs:a.care.programs?.length??0,news:a.editorial.news?.length??0,columns:a.editorial.columns?.length??0,topics:a.editorial.topics?.length??0,instagram:a.editorial.instagram?.length??0,shorts:a.editorial.shorts?.length??0}});}catch(e){return apiFailure(e);}}
