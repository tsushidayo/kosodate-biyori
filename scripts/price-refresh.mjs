/** Bounded public-page price refresh. No login, CAPTCHA bypass, or proxy rotation.
 * Usage: node price-refresh.mjs input.json output.json [--max=20]
 * Export: refreshPrices(data, {maxRequests:20, fetchImpl:fetch, now:ISODate}).
 * Only pre-registered product-page URLs in trusted hosts are requested.
 */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const HOSTS=new Set(['www.yodobashi.com','www.biccamera.com','sundrug-online.com','shop.akachan.jp','www.24028-net.jp','www.amazon.co.jp','fast-delivery-mart.rakuten.co.jp','shop.tsuruha.co.jp','www.e-welcia.com','e-welcia.com','aeonretail.com','netshop.create-sd.co.jp','mrmax.jp','www.seims.co.jp','joyfulhonda.jp']);
const MAX_BYTES=2500000;
function registeredUrl(value){
 let u; try{u=new URL(value)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))return null;
 if(!(/\/product[s]?\//.test(u.pathname)||/\/bc\/item\//.test(u.pathname)||/\/shop\/g\//.test(u.pathname)||/\/category\//.test(u.pathname)||/\/dp\//.test(u.pathname)))return null;
 return u;
}
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s・（）()\-－]+/g,'');
const money=v=>{const x=Number(String(v??'').replace(/[,¥￥円\s]/g,''));return Number.isFinite(x)&&x>0&&x<10000000?x:null};
function walk(x,fn){if(!x||typeof x!=='object')return;fn(x);for(const v of Object.values(x)){if(v&&typeof v==='object')if(Array.isArray(v))v.forEach(y=>walk(y,fn));else walk(v,fn)}}
function productMatches(node,product){
 const name=norm(node.name), expected=norm(product.name);
 if(!name)return false;
 // Require the named product; related products and generic categories must not supply a price.
 if(name.includes(expected)||expected.includes(name)&&name.length>=8)return true;
 const terms=(product.matchTerms??[]).map(norm).filter(Boolean);
 return terms.length>=2&&terms.every(t=>name.includes(t));
}
export function parsePublishedPrice(html,product){
 const candidates=[];
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  let tree;try{tree=JSON.parse(m[1].trim())}catch{continue}
  walk(tree,node=>{
   const types=[node['@type']].flat();
   if(!types.includes('Product')||!productMatches(node,product))return;
   for(const offer of [node.offers].flat().filter(Boolean)){
    // Aggregated price ranges are not a concrete sellable offer.
    if([offer['@type']].flat().includes('AggregateOffer')||offer.lowPrice||offer.highPrice)continue;
    const amount=money(offer.price??offer.priceSpecification?.price);
    const currency=offer.priceCurrency??offer.priceSpecification?.priceCurrency;
    if(amount===null||currency!=='JPY')continue;
    if(offer.availability&&!/InStock|LimitedAvailability/.test(offer.availability))continue;
    candidates.push(amount);
   }
  });
 }
 const unique=[...new Set(candidates)];
 if(unique.length!==1)return null; // Ambiguous or absent: do not guess from the first number.
 return unique[0];
}
async function bodyLimited(response){
 const declared=Number(response.headers.get('content-length')??0);if(declared>MAX_BYTES)throw Error('response_too_large');
 const reader=response.body?.getReader();if(!reader)throw Error('empty_response');
 let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('response_too_large')}chunks.push(value)}
 const merged=new Uint8Array(size);let offset=0;for(const c of chunks){merged.set(c,offset);offset+=c.byteLength}return new TextDecoder().decode(merged);
}
function robotsAllows(text,path){
 let active=false,disallow=[];
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();const colon=line.indexOf(':');if(colon<0)continue;
  const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
  if(key==='user-agent')active=value==='*'||value.toLowerCase()==='kosodatehiyori';
  if(active&&key==='disallow'&&value)disallow.push(value);
 }
 return !disallow.some(p=>p==='/'||path.startsWith(p.replace(/\*.*$/,'')));
}
export async function refreshPrices(input,{maxRequests=20,fetchImpl=fetch,now=new Date().toISOString()}={}){
 const data=structuredClone(input), cache=new Map(),robots=new Map();let requested=0,success=0,failed=0;
 const cap=Math.max(1,Math.min(40,Number(maxRequests)||20));
 for(const product of data.products??[]){
  for(const offer of product.offers??[]){
   const url=registeredUrl(offer.source);
   if(!offer.refreshEligible||!url)continue;
   if(!cache.has(url.href)&&requested>=cap)continue;
   offer.lastAttemptAt=now;
   try{
    if(!robots.has(url.origin)){
     const rr=await fetchImpl(url.origin+'/robots.txt',{signal:AbortSignal.timeout(8000),redirect:'error',headers:{'User-Agent':'KosodateHiyori/1.0 (public price reader)'}});
     // Respect a robots fetch denial; do not infer permission from an error.
     if(rr.status===404)robots.set(url.origin,'');else if(rr.ok)robots.set(url.origin,await bodyLimited(rr));else throw Error('robots_unavailable_'+rr.status);
    }
    if(!robotsAllows(robots.get(url.origin),url.pathname))throw Error('robots_disallowed');
    if(!cache.has(url.href)){
     requested++;
     const res=await fetchImpl(url.href,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{'User-Agent':'KosodateHiyori/1.0 (public price reader)','Accept':'text/html'}});
     if(!res.ok)throw Error('http_'+res.status);
     if(!/text\/html/.test(res.headers.get('content-type')??''))throw Error('not_html');
     cache.set(url.href,await bodyLimited(res));
    }
    const amount=parsePublishedPrice(cache.get(url.href),product);
    if(amount===null)throw Error('unambiguous_product_price_not_found');
    // Refresh supports one ordinary sale unit only. Coupons/subscriptions require explicit re-verification.
    offer.previousPrice=offer.price;
    offer.price=amount;offer.basePrice=amount;offer.total=offer.shipping===null?null:amount+offer.shipping;
    offer.unitPrice=offer.total===null?null:Math.round(offer.total/(offer.totalGrams?offer.totalGrams/100:offer.quantity)*100)/100;
    offer.checkedAt=now;offer.status='掲載あり';offer.verified=Number.isFinite(offer.shipping);offer.live=false;
    offer.verificationType='公開ページの価格データ';delete offer.refreshError;success++;
   }catch(error){
    // Preserve the last amount/date as a dated reference, but remove it from confirmed cheapest results.
    offer.verified=false;offer.status='要再確認';offer.refreshError=String(error.message??error).slice(0,160);failed++;
   }
  }
 }
 data.lastPriceRefresh={attemptedAt:now,requested,success,failed,maxRequests:cap};
 if(success>0)data.updatedAt=now;
 return data;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const [,,source,destination,...args]=process.argv;
 if(!source||!destination)throw Error('Usage: node price-refresh.mjs input.json output.json [--max=20]');
 const max=Number(args.find(a=>a.startsWith('--max='))?.slice(6)??20);
 const data=await refreshPrices(JSON.parse(await fs.readFile(source,'utf8')),{maxRequests:max});
 await fs.writeFile(destination,JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify(data.lastPriceRefresh));
}
