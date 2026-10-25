import { env } from "cloudflare:workers";
import careSeed from "../data/care.json";
import shopSeed from "../data/shop.json";
import editorialSeed from "../data/editorial.json";
import feedsSeed from "../data/feeds.json";
import socialCurationSeed from "../data/social-curation.json";
import editorialExclusionsSeed from "../data/editorial-exclusions.json";
import { refreshGithubCollections } from "./github-collections";
import { deriveEditorialTags } from "./editorial-tags";
import { isPracticalEditorial } from "./editorial-quality";
import { refreshSocialCuration } from "./social-curation";

export const sections = ["care", "shop", "editorial", "feeds"] as const;
export type Section = (typeof sections)[number];
type Obj = Record<string, any>;
const seeds: Record<Section, any> = {care:careSeed,shop:shopSeed,editorial:editorialSeed,feeds:feedsSeed};
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function apiJson(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
export function apiFailure(e:unknown){if(e instanceof ApiError)return apiJson({error:e.message},e.status);console.error("Parenting storage failed",e instanceof Error?e.message:"unknown");return apiJson({error:"保存先に接続できませんでした。時間をおいて、もう一度お試しください。"},503);}
export function db(){if(!env.DB)throw new ApiError(503,"保存先の準備中です。端末内の保存は引き続き利用できます。");return env.DB;}
export function userId(request:Request){const id=request.headers.get("oai-authenticated-user-id");if(!id)throw new ApiError(401,"別の端末でも保存内容を見るには、ChatGPTでログインしてください。");return id;}
export function checkOrigin(request:Request){const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,"このページからは変更できません。");}
export async function readJson(request:Request,maxBytes=8_000_000){
  if(Number(request.headers.get("content-length")||0)>maxBytes)throw new ApiError(413,"送信する内容が大きすぎます。");
  const raw=await request.text();if(new TextEncoder().encode(raw).length>maxBytes)throw new ApiError(413,"送信する内容が大きすぎます。");
  try{const parsed=JSON.parse(raw);if(!isObject(parsed))throw new Error("object required");return parsed;}catch{throw new ApiError(400,"送信内容の形式を確認してください。");}
}
export function isObject(v:unknown):v is Obj{return !!v&&typeof v==="object"&&!Array.isArray(v);}
export function safeWebUrl(value:string){try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&!/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(u.hostname)&&! /^[\d.]+$/.test(u.hostname)&&!u.hostname.includes(":")&&u.hostname.includes(".");}catch{return false;}}
function validateTree(value:any,depth=0){
  if(depth>12)throw new ApiError(400,"内容の階層が深すぎます。");
  if(typeof value==="number"&&!Number.isFinite(value))throw new ApiError(400,"金額や数量を確認してください。");
  if(typeof value==="string"&&value.length>60_000)throw new ApiError(400,"一つの項目が長すぎます。");
  if(Array.isArray(value)){if(value.length>3_000)throw new ApiError(400,"一度に送信できる件数を超えています。");for(const v of value)validateTree(v,depth+1);}
  else if(isObject(value))for(const[key,v]of Object.entries(value)){
    if(["__proto__","constructor","prototype","__chunkedSnapshot"].includes(key))throw new ApiError(400,"利用できない項目があります。");
    if(/^(url|sourceUrl|link|imageUrl)$/i.test(key)&&typeof v==="string"&&v&&!safeWebUrl(v))throw new ApiError(400,"出典のURLを確認してください。");
    if(key==="source"&&typeof v==="string"&&/^(https?:|javascript:|data:|file:)/i.test(v)&&!safeWebUrl(v))throw new ApiError(400,"出典のURLを確認してください。");
    validateTree(v,depth+1);
  }
}
export function validateContent(section:unknown,payload:unknown):Section{
  if(!sections.includes(section as Section))throw new ApiError(400,"更新するページを確認してください。");const s=section as Section;
  if(!(isObject(payload)||(s==="feeds"&&Array.isArray(payload))))throw new ApiError(400,"内容の形式を確認してください。");
  const shape:Record<string,string[]>={care:["stages","guides","programs"],shop:["products","chains"],editorial:["news","columns","topics"]};
  for(const key of shape[s]??[])if(!Array.isArray((payload as any)[key]))throw new ApiError(400,`${key} の一覧が必要です。`);
  validateTree(payload);if(new TextEncoder().encode(JSON.stringify(payload)).length>(s==="editorial"?8_000_000:1_500_000))throw new ApiError(413,"更新する内容が大きすぎます。");
  if(s==="shop")for(const p of(payload as any).products){
    if(!isObject(p)||typeof p.id!=="string"||typeof p.name!=="string")throw new ApiError(400,"商品名と商品IDを確認してください。");
    for(const o of p.offers??[]){if(o.price!==null&&o.price!==undefined&&(typeof o.price!=="number"||o.price<0))throw new ApiError(400,"商品の価格を確認してください。");if(o.verified===true&&(!safeWebUrl(o.source||"")||!Number.isFinite(Date.parse(o.checkedAt||""))))throw new ApiError(400,"確認済みの価格には出典と確認日が必要です。");}
  }return s;
}
export function validateProfile(profile:unknown){
  if(!isObject(profile))throw new ApiError(400,"保存内容を確認してください。");validateTree(profile);
  if(new TextEncoder().encode(JSON.stringify(profile)).length>120_000)throw new ApiError(413,"保存する内容が多すぎます。");
  const validDate=(date:unknown)=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  for(const k of["childDate","birthDate","dueDate"])if(profile[k]!==undefined&&profile[k]!==""&&!validDate(profile[k]))throw new ApiError(400,"誕生日・出産予定日には正しい日付を入力してください。");
  if(profile.residence!==undefined){if(!isObject(profile.residence))throw new ApiError(400,"住まいの設定を確認してください。");for(const key of ["prefecture","municipality"])if(profile.residence[key]!==undefined&&(typeof profile.residence[key]!=="string"||profile.residence[key].length>60))throw new ApiError(400,"住まいの設定を確認してください。");if(profile.residence.municipalityCode!==undefined&&profile.residence.municipalityCode!==""&&!/^\d{5}$/.test(profile.residence.municipalityCode))throw new ApiError(400,"自治体の設定を確認してください。");}
  if(profile.personalize!==undefined&&typeof profile.personalize!=="boolean")throw new ApiError(400,"年齢に合わせた表示の設定を確認してください。");
  if(profile.children!==undefined){
    if(!Array.isArray(profile.children)||profile.children.length>5)throw new ApiError(400,"お子さまは5人まで登録できます。");
    const ids=new Set<string>();
    for(const child of profile.children){
      if(!isObject(child)||typeof child.id!=="string"||! /^[A-Za-z0-9_-]{1,40}$/.test(child.id)||ids.has(child.id))throw new ApiError(400,"お子さまの登録内容を確認してください。");
      ids.add(child.id);
      if(child.gender!==undefined&&!["","girl","boy","unspecified"].includes(child.gender))throw new ApiError(400,"性別の設定を確認してください。");
      if(child.dateKind!==undefined&&!["birth","due"].includes(child.dateKind))throw new ApiError(400,"日付の種類を確認してください。");
      if(typeof child.birthDate!=="string"||(child.birthDate!==""&&!validDate(child.birthDate)))throw new ApiError(400,"誕生日・出産予定日には正しい日付を入力してください。");
    }
  }
  if(profile.activeChildId!==undefined&&(typeof profile.activeChildId!=="string"||(profile.activeChildId!==""&&! /^[A-Za-z0-9_-]{1,40}$/.test(profile.activeChildId))))throw new ApiError(400,"表示するお子さまの設定を確認してください。");
  for(const k of["bookmarks","todos","watchlist"])if(profile[k]!==undefined&&!Array.isArray(profile[k]))throw new ApiError(400,"保存する一覧の形式を確認してください。");return profile;
}

type Snapshot={section:Section;payload:string;updated_at:string;revision:number};
const INLINE_SNAPSHOT_BYTES=1_200_000;
const CHUNK_UTF16_LENGTH=250_000;
const MAX_SNAPSHOT_CHUNKS=40;
type SnapshotChunk={part:number;payload:string};
function serializedChunks(serialized:string):string[]{
  const result:string[]=[];
  for(let start=0;start<serialized.length;){
    let end=Math.min(start+CHUNK_UTF16_LENGTH,serialized.length);
    // A UTF-16 surrogate pair must stay together so D1's UTF-8 encoding preserves emoji.
    if(end<serialized.length&&serialized.charCodeAt(end-1)>=0xd800&&serialized.charCodeAt(end-1)<=0xdbff)end--;
    const value=serialized.slice(start,end);
    if(new TextEncoder().encode(value).length>750_000)throw new ApiError(413,"保存する内容を分割できませんでした。");
    result.push(value);start=end;
  }
  if(result.length>MAX_SNAPSHOT_CHUNKS)throw new ApiError(413,"保存する内容が多すぎます。");
  return result;
}
async function restoreSnapshot(row:Snapshot):Promise<any>{
  const parsed=JSON.parse(row.payload);
  if(!isObject(parsed)||!Object.prototype.hasOwnProperty.call(parsed,"__chunkedSnapshot"))return parsed;
  const marker=parsed.__chunkedSnapshot;
  if(Object.keys(parsed).length!==1||!isObject(marker)||typeof marker.id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(marker.id)||!Number.isInteger(marker.parts)||marker.parts<1||marker.parts>MAX_SNAPSHOT_CHUNKS)throw new Error("Invalid snapshot marker");
  const response=await db().prepare("SELECT part,payload FROM content_snapshot_chunks WHERE id=? ORDER BY part").bind(marker.id).all<SnapshotChunk>();
  const chunks=response.results;
  if(chunks.length!==marker.parts||chunks.some((chunk,index)=>chunk.part!==index||typeof chunk.payload!=="string"||new TextEncoder().encode(chunk.payload).length>750_000))throw new Error("Incomplete snapshot chunks");
  const serialized=chunks.map(chunk=>chunk.payload).join("");
  const payload=JSON.parse(serialized);validateContent(row.section,payload);return payload;
}
export async function content(){
  let rows:Snapshot[]=[];let storageAvailable=false;
  try{const res=await db().prepare("SELECT section,payload,updated_at,revision FROM content_snapshots").all<Snapshot>();rows=res.results;storageAvailable=true;}catch{/* Curated content stays available during a storage outage. */}
  const result:Obj={...seeds};const metadata:Obj={};for(const s of sections)metadata[s]={updatedAt:null,revision:0,origin:"bundled"};
  for(const r of rows)if(sections.includes(r.section))try{result[r.section]=await restoreSnapshot(r);metadata[r.section]={updatedAt:r.updated_at,revision:r.revision,origin:"database"};}catch{
    // A partial or malformed snapshot never appears as a successful database read.
    storageAvailable=false;metadata[r.section]={updatedAt:r.updated_at,revision:r.revision,origin:"bundled",error:"snapshot_unavailable"};
  }
  result.meta={sections:metadata,storageAvailable,servedAt:new Date().toISOString()};return result;
}
export async function writeContent(updates:any[]){
  if(!Array.isArray(updates)||!updates.length||updates.length>4)throw new ApiError(400,"一度に更新できるのは1〜4ページです。");
  if(updates.length>1&&updates.some(u=>isObject(u)&&u.expectedRevision!==undefined))throw new ApiError(400,"更新番号を確認して保存する場合は、1ページずつ送信してください。");
  const seen=new Set<string>();const now=new Date().toISOString();const statements:D1PreparedStatement[]=[],chunkStatements:D1PreparedStatement[]=[];
  for(const u of updates){
    if(!isObject(u))throw new ApiError(400,"更新内容を確認してください。");const s=validateContent(u.section,u.payload);
    if(seen.has(s))throw new ApiError(400,"同じページが重複しています。");seen.add(s);
    if(u.expectedRevision!==undefined&&(!Number.isInteger(u.expectedRevision)||u.expectedRevision<0))throw new ApiError(400,"更新番号を確認してください。");
    const serialized=JSON.stringify(u.payload);let stored=serialized;
    if(new TextEncoder().encode(serialized).length>INLINE_SNAPSHOT_BYTES){
      const id=crypto.randomUUID(),chunks=serializedChunks(serialized);
      stored=JSON.stringify({__chunkedSnapshot:{id,parts:chunks.length}});
      chunks.forEach((payload,part)=>chunkStatements.push(db().prepare("INSERT INTO content_snapshot_chunks(id,part,payload,created_at) VALUES(?,?,?,?)").bind(id,part,payload,now)));
    }
    if(u.expectedRevision===0)statements.push(db().prepare("INSERT INTO content_snapshots(section,payload,updated_at,revision) VALUES(?,?,?,1) ON CONFLICT(section) DO NOTHING").bind(s,stored,now));
    else if(u.expectedRevision!==undefined)statements.push(db().prepare("UPDATE content_snapshots SET payload=?,updated_at=?,revision=revision+1 WHERE section=? AND revision=?").bind(stored,now,s,u.expectedRevision));
    else statements.push(db().prepare("INSERT INTO content_snapshots(section,payload,updated_at,revision) VALUES(?,?,?,1) ON CONFLICT(section) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,revision=content_snapshots.revision+1").bind(s,stored,now));
  }
  if(chunkStatements.length)await db().prepare("CREATE TABLE IF NOT EXISTS content_snapshot_chunks (id TEXT NOT NULL,part INTEGER NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,part))").run();
  // D1 batch is transactional. The pointer and every part become visible together.
  // Existing generations are retained so concurrent readers never lose their chunks.
  const results=await db().batch([...statements,...chunkStatements]);
  if(updates[0]?.expectedRevision!==undefined&&results[0].meta.changes===0)throw new ApiError(409,"別の更新が先に保存されました。最新の内容を読み直してください。");
  return{updated:[...seen],updatedAt:now};
}
export async function readProfile(id:string){
  const row=await db().prepare("SELECT payload,updated_at,revision FROM parenting_profiles WHERE user_id=?").bind(id).first<{payload:string;updated_at:string;revision:number}>();
  return{profile:row?JSON.parse(row.payload):{childDate:"",dueDate:"",stage:"",children:[],personalize:false,activeChildId:"",bookmarks:[],todos:[],watchlist:[]},updatedAt:row?.updated_at??null,revision:row?.revision??0};
}
export async function saveProfile(id:string,profile:unknown,revision?:number){
  validateProfile(profile);if(revision!==undefined&&(!Number.isInteger(revision)||revision<0))throw new ApiError(400,"保存番号を確認してください。");const now=new Date().toISOString();
  if(revision===0){const row=await db().prepare("INSERT INTO parenting_profiles(user_id,payload,updated_at,revision) VALUES(?,?,?,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision").bind(id,JSON.stringify(profile),now).first();if(!row)throw new ApiError(409,"別の端末で変更されています。ページを読み直してください。");}
  else if(revision!==undefined){const row=await db().prepare("UPDATE parenting_profiles SET payload=?,updated_at=?,revision=revision+1 WHERE user_id=? AND revision=? RETURNING revision").bind(JSON.stringify(profile),now,id,revision).first();if(!row)throw new ApiError(409,"別の端末で変更されています。ページを読み直してください。");}
  else await db().prepare("INSERT INTO parenting_profiles(user_id,payload,updated_at,revision) VALUES(?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,revision=parenting_profiles.revision+1").bind(id,JSON.stringify(profile),now).run();
  return readProfile(id);
}
export function decodeXml(text:string){return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,(s,decimal,hex)=>{if(decimal||hex){const n=parseInt(decimal||hex,decimal?10:16);return n>0&&n<=0x10ffff?String.fromCodePoint(n):"";}return({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"}as Record<string,string>)[s.toLowerCase()]??s;}).replace(/\s+/g," ").trim();}
export function parseFeed(xml:string,source:Obj){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new ApiError(400,"このフィード形式には対応していません。");
  const blocks=xml.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi)??[];
  const tag=(b:string,n:string)=>b.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+n+">","i"))?.[1]??"";
  return blocks.slice(0,25).flatMap(b=>{
    const title=decodeXml(tag(b,"title")).slice(0,180);
    const raw=tag(b,"link")||b.match(/<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["']/i)?.[1]||b.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1]||"";
    const url=decodeXml(raw);if(!title||!safeWebUrl(url))return[];
    const date=Date.parse(decodeXml(tag(b,"pubDate")||tag(b,"published")||tag(b,"updated")||tag(b,"dc:date")));
    const summary=decodeXml(tag(b,"description")||tag(b,"summary")||tag(b,"content:encoded")).slice(0,140);
    const item={id:"feed-"+encodeURIComponent(url).slice(-140),title,summary:summary||"見出しを確認した記事です。詳しい内容は出典をご覧ください。",url,source:source.name||source.source||new URL(url).hostname,publishedAt:Number.isFinite(date)?new Date(date).toISOString():null,checkedAt:new Date().toISOString(),category:source.category||"子育て",section:feedSection(source),kind:source.kind==="体験談"?"体験談":"解説",feedUrl:source.url,ingestion:"rss",summaryKind:"feed-excerpt",readingLabel:"配信の見出し"};
    return[{...item,tags:deriveEditorialTags(item)}];
  });
}
export function feedSection(source:Obj):"news"|"columns"{return source.section==="columns"||source.kind==="columns"?"columns":"news";}
export function relevantFeedItem(item:Obj,source:Obj){
  if(!isPracticalEditorial(item))return false;
  if([...editorialExclusionsSeed.newsIds,...editorialExclusionsSeed.columnIds].includes(String(item.id||"")))return false;
  const text=(String(item.title||"")+" "+String(item.summary||"")).toLocaleLowerCase("ja");
  const has=(term:unknown)=>typeof term==="string"&&term.trim().length>0&&text.includes(term.toLocaleLowerCase("ja"));
  if(Array.isArray(source.excludeKeywords)&&source.excludeKeywords.some(has))return false;
  if(Array.isArray(source.includeUrlPatterns)&&source.includeUrlPatterns.some((v:unknown)=>typeof v==="string"&&v.length>0)&&!source.includeUrlPatterns.some((v:unknown)=>typeof v==="string"&&v.length>0&&String(item.url||"").includes(v)))return false;
  const title=String(item.title||"");
  // Department names and advertisements are not sufficient evidence of practical relevance to families.
  if(/入札|調達|落札|契約情報|競争参加|職員の?採用|採用試験|非常勤職員|会計年度任用|人材募集/.test(title))return false;
  if(/JPLS|専門医.*(?:試験|認定|更新)|(?:医療従事者|医療者)向け.*(?:研修|講習)/i.test(title))return false;
  if(/(?:[【［\[](?:PR|ＰＲ|広告)[】］\]]|広告企画|タイアップ|購入特典|新発売|発売決定|予約受付|販売開始)/i.test(title))return false;
  if(/仮面ライダー|スーパー戦隊|ウルトラマン|特撮/.test(title)&&/発売|付録|グッズ|プレゼント|予約|映画公開|新番組/.test(title))return false;
  const meeting=/審議会|分科会|部会|検討会|有識者会議|会議/.test(title)&&/開催|傍聴|議事次第|議事録|議事要旨|委員募集/.test(title);
  const familyChange=/給付|手当|助成|補助|無償化|育児休業|育休|保育|就学|子育て/.test(text)&&/改正|施行|拡充|新設|支給開始|申請受付|対象拡大|制度変更|利用開始/.test(text);
  if(meeting&&!familyChange)return false;
  if(/人口動態.*(?:統計|速報)|(?:統計調査|統計年報).*公表/.test(title)&&!familyChange)return false;
  if(Array.isArray(source.includeKeywords)&&source.includeKeywords.some((v:unknown)=>typeof v==="string"&&v.trim()))return source.includeKeywords.some(has);
  if(source.filterRequired===false)return true;
  return /妊娠|妊婦|産前|産後|出産|育児|子育て|子ども|こども|子供|赤ちゃん|乳児|幼児|離乳|保育|小学生|小学校|児童|学童|給食|産休|育休|おむつ|オムツ|ベビー|parent|baby|child/i.test(text);
}
function registeredFeeds(raw:unknown=seeds.feeds):Obj[]{const listFor=(value:any)=>Array.isArray(value)?value:isObject(value)&&Array.isArray(value.feeds??value.sources)?value.feeds??value.sources:null;const list=listFor(raw)??listFor(seeds.feeds)??[];return list.filter((f:any)=>isObject(f)&&typeof f.url==="string"&&safeWebUrl(f.url)&&f.enabled!==false).slice(0,24);}
export async function refreshFeeds(){
  const before=await content();const feeds=registeredFeeds(before.feeds);
  const githubPending=refreshGithubCollections(Array.isArray(before.editorial?.topics)?before.editorial.topics:[]);
  const outcomes=await Promise.all(feeds.map(async f=>{try{
    const res=await fetch(f.url,{headers:{"User-Agent":"KosodateBiyori/1.0 (parenting feed reader)",Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml"},signal:AbortSignal.timeout(9000),redirect:"manual"});
    if(!res.ok)throw new Error("HTTP "+res.status);const reader=res.body?.getReader();if(!reader)throw new Error("Empty feed");
    const chunks:Uint8Array[]=[];let bytes=0;for(;;){const read=await reader.read();if(read.done)break;bytes+=read.value.length;if(bytes>600_000){await reader.cancel();throw new Error("Feed size limit");}chunks.push(read.value);}
    const buf=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buf.set(chunk,offset);offset+=chunk.length;}
    return{name:f.name||f.url,url:f.url,section:feedSection(f),kind:f.kind,ok:true,items:parseFeed(new TextDecoder().decode(buf),f).filter(i=>relevantFeedItem(i,f)),error:null};
  }catch(e){return{name:f.name||f.url,url:f.url,section:feedSection(f),kind:f.kind,ok:false,items:[],error:e instanceof Error?e.message:"Fetch failed"};}}));
  const editor={...before.editorial};let added=0;
  for(const kind of["news","columns"]as const){const existing=(Array.isArray(editor[kind])?editor[kind]:[]).filter((i:Obj)=>i.ingestion!=="rss"||relevantFeedItem(i,feeds.find(f=>f.url===i.feedUrl)??{section:kind,filterRequired:false}));const items=outcomes.filter(f=>f.ok&&f.section===kind).flatMap(f=>f.items);const seen=new Set(existing.map((i:Obj)=>i.url));const fresh=items.filter(i=>{if(seen.has(i.url))return false;seen.add(i.url);return true;});added+=fresh.length;editor[kind]=[...fresh,...existing].map(i=>({...i,tags:deriveEditorialTags(i)})).sort((a,b)=>(Date.parse(b.publishedAt||"")||0)-(Date.parse(a.publishedAt||"")||0)).slice(0,500);}
  const githubResult=await githubPending;const {topics,...github}=githubResult;
  // 24 feeds + 20 collection files + their manifest + this fixed curation file = at most 46 requests.
  const {topics:reviewedTopics,instagram,shorts,...curation}=await refreshSocialCuration({previousTopics:Array.isArray(before.editorial?.topics)?before.editorial.topics:[],incomingTopics:topics,previousShorts:Array.isArray(before.editorial?.shorts)?before.editorial.shorts:[],previousInstagram:Array.isArray(before.editorial?.instagram)?before.editorial.instagram:[],fallback:socialCurationSeed});
  editor.topics=reviewedTopics;editor.instagram=instagram;editor.shorts=shorts;
  editor.feedRefresh={attemptedAt:new Date().toISOString(),results:outcomes.map(({items,...rest})=>({...rest,count:items.length})),added,github,curation:{...curation,instagram:instagram.length,shorts:shorts.length}};
  const persisted=outcomes.some(o=>o.ok)||github.ok||curation.ok;if(persisted)await writeContent([{section:"editorial",payload:editor,expectedRevision:before.meta.sections.editorial.revision}]);
  return{...editor.feedRefresh,persisted,total:{news:editor.news?.length??0,columns:editor.columns?.length??0,topics:editor.topics?.length??0,instagram:editor.instagram?.length??0,shorts:editor.shorts?.length??0}};
}
