import fs from "node:fs/promises";
// Credentials are accepted through stdin only and never logged or written to disk.
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=JSON.parse(Buffer.concat(chunks).toString("utf8"));const origin=new URL(input.url);
if(origin.protocol!=="https:"||!origin.hostname.endsWith(".chatgpt.site")||origin.username||origin.password)throw new Error("Use the exact published Sites HTTPS origin.");
if(typeof input.token!=="string"||!input.token)throw new Error("Get the Site service-access token from get_site first.");
const headers={"Content-Type":"application/json","OAI-Sites-Authorization":"Bearer "+input.token};
async function call(path,body,method="POST"){
  const response=await fetch(new URL(path,origin.origin),{method,headers,body:method==="GET"?undefined:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(90_000)});
  let data;try{data=await response.json();}catch{throw new Error("Site did not return JSON (HTTP "+response.status+")");}
  if(!response.ok)throw new Error("Site update failed (HTTP "+response.status+"): "+String(data.error||"Unknown error"));return data;
}
const updates=[];for(const u of input.updates??[])updates.push(u.path?{section:u.section,payload:JSON.parse(await fs.readFile(u.path,"utf8")),...(u.expectedRevision!==undefined?{expectedRevision:u.expectedRevision}:{})}:u);
const result={};if(updates.length)result.update=await call("/api/update",{updates});if(input.refreshFeeds===true)result.refresh=await call("/api/refresh",{});
result.readback=await call("/api/status",null,"GET");if(!result.readback.storageAvailable)throw new Error("Fallback data was returned; persistence was not verified.");console.log(JSON.stringify(result));
