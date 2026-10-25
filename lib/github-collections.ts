/** Import only the collection manifest owned by this project; callers cannot choose a remote URL. */
const COLLECTION_BASE = 'https://raw.githubusercontent.com/tsushidayo/kosodate-biyori/main/';
const MANIFEST_PATH = 'collections/index.json';
const MAX_FILES = 20;
const MAX_FILE_BYTES = 600_000;
const MAX_TOTAL_BYTES = 8_000_000;
const MAX_TOPICS = 500;
type Obj = Record<string, any>;
export type GithubCollectionResult = {ok:boolean;files:number;added:number;error:string|null;topics:Obj[]};
const object=(value:unknown):value is Obj=>!!value&&typeof value==='object'&&!Array.isArray(value);
function iso(value:unknown):string|null {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
  const [y,m,d]=value.slice(0,10).split('-').map(Number);
  if(m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return null;
  const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}
const excerpt=(value:string,length:number)=>{const chars=Array.from(value.replace(/\s+/g,' ').trim());return chars.slice(0,length).join('')+(chars.length>length?'…':'');};
function postUrl(value:unknown,id:string,handle?:string):string|null {
  if(typeof value!=='string')return null;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))return null;
    const match=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})\/?$/);
    if(!match||match[2]!==id||(handle&&match[1].toLowerCase()!==handle.toLowerCase()))return null;
    return `https://x.com/${match[1]}/status/${id}`;
  } catch {return null;}
}
export function normalizeGithubPost(value:unknown,collectedAt:unknown):Obj|null {
  if(!object(value)||typeof value.id!=='string'||!/^\d{10,25}$/.test(value.id)||typeof value.handle!=='string'||! /^[A-Za-z0-9_]{1,15}$/.test(value.handle))return null;
  if(typeof value.text!=='string'||!value.text.trim()||value.text.length>60_000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.text))return null;
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>200)return null;
  if(typeof value.genre!=='string'||!value.genre.trim()||value.genre.length>60)return null;
  if(![value.likes,value.views].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))return null;
  const publishedAt=iso(value.time),recordedAt=iso(collectedAt),url=postUrl(value.url,value.id,value.handle);
  if(!publishedAt||!recordedAt||!url||Date.parse(publishedAt)>Date.parse(recordedAt)+300_000)return null;
  const author=value.name.trim();const sourceName=`X / @${value.handle}`;
  return {
    id:'github-x-'+value.id,title:excerpt(value.text,50),summary:excerpt(value.text,110),url,
    source:sourceName,sourceName,publishedAt,collectedAt:recordedAt,platform:'X',
    recordedMetrics:{likes:value.likes,views:value.views},ingestion:'github-collection',category:value.genre.trim(),
    author,handle:value.handle,summaryKind:'post-excerpt',readingLabel:'投稿の一部',metricsLabel:'収集時点の反応',
    caution:'投稿者の体験や意見を含みます。反応の数値は収集時点の記録です。健康に関する記載は、公的な案内や医療機関でも確認してください。'
  };
}
export function validateCollectionManifest(value:unknown):string[] {
  if(!object(value)||value.schemaVersion!==1||!iso(value.updatedAt)||!Array.isArray(value.files)||value.files.length>MAX_FILES)throw new Error('GitHub collection manifest is invalid');
  const paths=value.files;
  if(paths.some(p=>typeof p!=='string'||p.length>180||p.includes('..')||!/^collections\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(p))||new Set(paths).size!==paths.length)throw new Error('GitHub collection paths are invalid');
  return paths;
}
function keys(item:Obj,index:number):string[] {
  const result:string[]=[];
  if(typeof item.id==='string'&&item.id)result.push('id:'+item.id);
  if(typeof item.url==='string'&&item.url){try{const u=new URL(item.url);const status=u.pathname.match(/\/status\/(\d{10,25})(?:\/|$)/);result.push(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&status?'x:'+status[1]:'url:'+u.origin+u.pathname+u.search);}catch{result.push('url:'+item.url);}}
  return result.length?result:['unkeyed:'+index];
}
const recordedTime=(i:Obj)=>Date.parse(i.collectedAt||i.checkedAt||i.publishedAt||'')||0;
export function mergeGithubTopics(existing:Obj[],incoming:Obj[],limit=MAX_TOPICS):{topics:Obj[];added:number} {
  const previousKeys=new Set(existing.flatMap((v,i)=>keys(v,i)));
  const seen=new Set<string>();
  const kept=[...incoming.map(v=>({value:v,incoming:true})),...existing.map(v=>({value:v,incoming:false}))]
    .sort((a,b)=>recordedTime(b.value)-recordedTime(a.value))
    .filter(({value},i)=>{const ids=keys(value,i);if(ids.some(k=>seen.has(k)))return false;ids.forEach(k=>seen.add(k));return true;})
    .slice(0,limit);
  const added=kept.filter(({value,incoming},i)=>incoming&&!keys(value,i).some(k=>previousKeys.has(k))).length;
  return {topics:kept.map(({value})=>value),added};
}
async function fetchJson(path:string,maxBytes:number,budget:{bytes:number},fetcher:typeof fetch):Promise<unknown> {
  const res=await fetcher(COLLECTION_BASE+path,{headers:{Accept:'application/json','User-Agent':'KosodateBiyori/1.0 (collection reader)'},signal:AbortSignal.timeout(7000),redirect:'manual'});
  if(!res.ok)throw new Error('GitHub collection HTTP '+res.status);
  if(Number(res.headers.get('content-length')||0)>maxBytes)throw new Error('GitHub collection size limit');
  const reader=res.body?.getReader();if(!reader)throw new Error('GitHub collection body is empty');
  const parts:Uint8Array[]=[];let bytes=0;
  try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;budget.bytes+=next.value.length;if(bytes>maxBytes||budget.bytes>MAX_TOTAL_BYTES)throw new Error('GitHub collection size limit');parts.push(next.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
  const all=new Uint8Array(bytes);let at=0;for(const part of parts){all.set(part,at);at+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
}
export async function refreshGithubCollections(existing:Obj[],fetcher:typeof fetch=fetch):Promise<GithubCollectionResult> {
  let files=0;
  try {
    const budget={bytes:0};const manifest=await fetchJson(MANIFEST_PATH,100_000,budget,fetcher);const paths=validateCollectionManifest(manifest);
    // At most 21 GitHub requests plus the existing 12 feeds, below the Worker's 50-request ceiling.
    const outcomes=await Promise.allSettled(paths.map(async path=>{
      const raw=await fetchJson(path,MAX_FILE_BYTES,budget,fetcher);
      if(!object(raw)||!iso(raw.collectedAt)||!Array.isArray(raw.posts)||raw.posts.length>2000)throw new Error('GitHub collection data is invalid');
      const topics=raw.posts.map((p:unknown)=>normalizeGithubPost(p,raw.collectedAt)).filter((p:Obj|null):p is Obj=>p!==null);
      if(raw.posts.length&&!topics.length)throw new Error('GitHub collection has no valid posts');
      files++;return topics;
    }));
    const failure=outcomes.find(o=>o.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
    const incoming=outcomes.flatMap(o=>o.status==='fulfilled'?o.value:[]);
    return {ok:true,files,...mergeGithubTopics(existing,incoming),error:null};
  } catch(e){return {ok:false,files,added:0,error:e instanceof Error?e.message:'GitHub collection failed',topics:existing};}
}
