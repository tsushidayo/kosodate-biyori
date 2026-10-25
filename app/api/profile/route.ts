import { apiFailure, apiJson, checkOrigin, readJson, readProfile, saveProfile, userId } from "@/lib/parenting-store";
export const dynamic = "force-dynamic";
export async function GET(request:Request){try{return apiJson(await readProfile(userId(request)));}catch(e){return apiFailure(e);}}
export async function PUT(request:Request){try{checkOrigin(request);const id=userId(request);const body=await readJson(request,130_000);return apiJson(await saveProfile(id,body.profile,body.expectedRevision));}catch(e){return apiFailure(e);}}
