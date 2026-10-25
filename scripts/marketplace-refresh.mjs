/** Recheck registered public listings. New listings come from a reviewed research batch, never invented search results. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const MAX_BYTES=3_000_000;
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function marketplaceUrl(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(u.hostname==='jp.mercari.com'&&/^\/item\/m\d{8,14}\/?$/.test(u.pathname))return new URL(u.origin+u.pathname);
  if(u.hostname==='item.fril.jp'&&/^\/[a-f0-9]{32}\/?$/.test(u.pathname))return new URL(u.origin+u.pathname);
  if(u.hostname==='paypayfleamarket.yahoo.co.jp'&&/^\/item\/[A-Za-z0-9_-]{8,30}\/?$/.test(u.pathname))return new URL(u.origin+u.pathname);
 }catch{}return null;
}
function walk(value,fn){if(!value||typeof value!=='object')return;fn(value);for(const child of Object.values(value))if(Array.isArray(child))child.forEach(item=>walk(item,fn));else if(child&&typeof child==='object')walk(child,fn);}
export function parseMarketplaceListing(html,offer){
 const expected=marketplaceUrl(offer.source);if(!expected)throw Error('unregistered_listing_url');
 const candidates=[];
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  let json;try{json=JSON.parse(match[1]);}catch{continue;}
  walk(json,node=>{
   if(![node['@type']].flat().includes('Product')||!node.name)return;
   const actual=norm(node.name),registered=norm(offer.listingTitle);
   if(!registered||actual!==registered)return;
   if(node.url&&marketplaceUrl(node.url)?.href!==expected.href)return;
   for(const item of [node.offers].flat().filter(Boolean)){
    if([item['@type']].flat().includes('AggregateOffer'))continue;
    const price=Number(String(item.price||'').replace(/,/g,''));
    if(item.priceCurrency!=='JPY'||!Number.isFinite(price)||price<=0||price>10_000_000)continue;
    const availability=String(item.availability||'');
    if(!/\/(InStock|OutOfStock|SoldOut|Discontinued|LimitedAvailability)$/.test(availability))continue;
    const shippingRate=item.shippingDetails?.shippingRate?.value;
    candidates.push({price,available:/\/(InStock|LimitedAvailability)$/.test(availability),shipping:shippingRate===0||shippingRate==='0'?0:null});
   }
  });
 }
 if(candidates.length!==1)throw Error('listing_identity_price_or_stock_not_confirmed');
 const record=candidates[0];
 let main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1]||'';
 main=main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').split(/この商品に近い商品|おすすめの商品|おすすめアイテム/)[0];
 if(/売り切れました|SOLD\s*OUT|販売終了/.test(main))record.available=false;
 if(record.shipping===null&&/送料込み|送料込|出品者負担/.test(main)&&!/着払い|購入者負担/.test(main))record.shipping=0;
 return record;
}
async function limited(response){const reader=response.body?.getReader();if(!reader)throw Error('empty_response');let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('response_too_large');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 const all=new Uint8Array(size);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length;}return new TextDecoder().decode(all);
}
function allowedByRobots(text,path){let active=false;const denied=[];for(const line of text.split(/\r?\n/)){const [key,...rest]=line.split('#')[0].trim().split(':');const value=rest.join(':').trim();if(key?.toLowerCase()==='user-agent')active=value==='*'||value.toLowerCase()==='kosodatebiyori';else if(active&&key?.toLowerCase()==='disallow'&&value)denied.push(value);}return !denied.some(rule=>rule==='/'||path.startsWith(rule.replace(/\*.*$/,'')));}
export async function refreshMarketplaces(input,{fetchImpl=fetch,maxRequests=40,now=new Date().toISOString()}={}){
 const data=structuredClone(input),robots=new Map();let attempted=0,updated=0,sold=0,failed=0;const results=[];
 for(const product of data.products||[])for(const offer of product.offers||[]){
  const url=marketplaceUrl(offer.source);if(!url||attempted>=Math.min(60,maxRequests))continue;attempted++;offer.lastAttemptAt=now;
  try{
   if(!robots.has(url.origin)){const response=await fetchImpl(url.origin+'/robots.txt',{redirect:'error',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'KosodateBiyori/1.0 (public listing reader)'}});if(response.status===404)robots.set(url.origin,'');else if(response.ok)robots.set(url.origin,await limited(response));else throw Error('robots_unavailable_'+response.status);}
   if(!allowedByRobots(robots.get(url.origin),url.pathname))throw Error('robots_disallowed');
   const response=await fetchImpl(url.href,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html','User-Agent':'KosodateBiyori/1.0 (public listing reader)'}});
   if(response.status===404||response.status===410){offer.available=false;offer.verified=false;offer.status='出品終了';offer.stockCheckedAt=now;sold++;results.push({id:offer.id,status:'ended'});continue;}
   if(!response.ok)throw Error('http_'+response.status);
   const record=parseMarketplaceListing(await limited(response),offer);
   offer.previousPrice=offer.price;offer.price=record.price;offer.basePrice=record.price;offer.shipping=record.shipping;offer.available=record.available;offer.checkedAt=now;offer.stockCheckedAt=now;offer.purchaseChannel='marketplace';offer.marketplace=true;offer.total=record.shipping===null?null:record.price+record.shipping;
   offer.verified=record.available&&record.shipping!==null;offer.status=!record.available?'売り切れ':record.shipping===null?'送料未確認':'掲載あり';offer.verificationType='個別出品の公開データを再確認';delete offer.refreshError;
   if(record.available)updated++;else sold++;results.push({id:offer.id,status:record.available?'updated':'sold'});
  }catch(error){offer.verified=false;offer.status='要再確認';offer.refreshError=String(error.message||error).slice(0,160);failed++;results.push({id:offer.id,status:'unconfirmed',reason:offer.refreshError});}
 }
 data.marketplaceRefresh={attemptedAt:now,attempted,updated,sold,failed,results};return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [source,destination,...args]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node scripts/marketplace-refresh.mjs input.json output.json [--max=40]');const maxRequests=Number(args.find(a=>a.startsWith('--max='))?.slice(6)||40);const result=await refreshMarketplaces(JSON.parse(await fs.readFile(source,'utf8')),{maxRequests});await fs.writeFile(destination,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.marketplaceRefresh));}
