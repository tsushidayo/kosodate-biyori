/** Bounded public-page price refresh. No login, CAPTCHA bypass, or proxy rotation.
 * Usage: node price-refresh.mjs input.json output.json [--max=20]
 * Export: refreshPrices(data, {maxRequests:20, fetchImpl:fetch, now:ISODate}).
 * Only pre-registered product-page URLs in trusted hosts are requested.
 */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {robotsAllows} from './robots-policy.mjs';
const HOSTS=new Set(['www.yodobashi.com','www.biccamera.com','sundrug-online.com','shop.akachan.jp','www.24028-net.jp','www.amazon.co.jp','item.rakuten.co.jp','store.shopping.yahoo.co.jp','lohaco.yahoo.co.jp','www.matsukiyococokara-online.com','fast-delivery-mart.rakuten.co.jp','shop.tsuruha.co.jp','www.e-welcia.com','e-welcia.com','aeonretail.com','netshop.create-sd.co.jp','mrmax.jp','www.seims.co.jp','joyfulhonda.jp']);
const MAX_BYTES=2500000;
function registeredUrl(value){
 let u; try{u=new URL(value)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))return null;
 if(['k','keyword','query','q'].some(key=>u.searchParams.has(key))||/(?:^|\/)search(?:\/|$)/i.test(u.pathname))return null;
 const retailerPage=u.hostname==='item.rakuten.co.jp'?/^\/[^/]+\/[^/]+\/?$/.test(u.pathname)&&!/^\/[^/]+\/c\/?$/.test(u.pathname):
  u.hostname==='store.shopping.yahoo.co.jp'?/^\/[^/]+\/[^/]+\.html$/.test(u.pathname):
  u.hostname==='lohaco.yahoo.co.jp'?/^\/store\/[^/]+\/item\/[^/]+\/?$/.test(u.pathname):
  u.hostname==='www.matsukiyococokara-online.com'?/^\/store\/catalog\/product\/view\/id\/[^/]+\/?$/.test(u.pathname):
  u.hostname==='shop.tsuruha.co.jp'?/^\/\d+\.html$/.test(u.pathname):false;
 if(!(retailerPage||/\/product[s]?\//.test(u.pathname)||/\/bc\/item\//.test(u.pathname)||/\/shop\/g\//.test(u.pathname)||/\/category\//.test(u.pathname)||/\/dp\//.test(u.pathname)))return null;
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
export function parsePublishedOffer(html,product,expected={}){
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
    // A multi-variant page's default price must not replace another selected variant.
    const variant=expected.source?new URL(expected.source).searchParams.get('variant'):null;
    if(variant){let publishedVariant=null;try{publishedVariant=new URL(offer.url||node.url).searchParams.get('variant')}catch{}if(publishedVariant!==variant)continue;}
    candidates.push({price:amount,available:/InStock|LimitedAvailability/.test(String(offer.availability||'')),name:node.name});
   }
  });
 }
 const unique=[...new Set(candidates.map(offer=>JSON.stringify(offer)))];
 if(unique.length!==1)return null; // Ambiguous or absent: do not guess from the first number.
 return JSON.parse(unique[0]);
}
export function parsePublishedPrice(html,product){return parsePublishedOffer(html,product)?.price??null;}
async function bodyLimited(response){
 const declared=Number(response.headers.get('content-length')??0);if(declared>MAX_BYTES)throw Error('response_too_large');
 const reader=response.body?.getReader();if(!reader)throw Error('empty_response');
 let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('response_too_large')}chunks.push(value)}
 const merged=new Uint8Array(size);let offset=0;for(const c of chunks){merged.set(c,offset);offset+=c.byteLength}return new TextDecoder().decode(merged);
}
export async function refreshPrices(input,{maxRequests=20,fetchImpl=fetch,now=new Date().toISOString()}={}){
 const data=structuredClone(input), cache=new Map(),robots=new Map();let requested=0,success=0,failed=0;const skipped=[];
 const cap=Math.max(1,Math.min(40,Number(maxRequests)||20));
 // Rotate product pages by the last attempt, including failed checks. A fixed
 // prefix would otherwise be checked every day while later products go stale.
 // Group repeated URLs so one bounded page fetch can refresh every registered
 // offer on that page without spending another slot.
 const pages=new Map();
 for(const product of data.products??[])for(const offer of product.offers??[]){
  if(!offer.refreshEligible)continue;
  if(offer.conditional===true||/定期便|クーポン/.test(String(offer.mode||''))||Number(offer.discountRate)>0||Number(offer.couponYen)>0){skipped.push({productId:product.id,offerId:offer.id,reason:'conditional_price_requires_manual_check'});continue;}
  const url=registeredUrl(offer.source);if(!url){skipped.push({productId:product.id,offerId:offer.id,reason:'unsupported_or_non_product_url'});continue;}
  const attempted=Date.parse(offer.lastAttemptAt||offer.checkedAt||'')||0;
  const page=pages.get(url.href)||{url,attempted,entries:[]};
  page.attempted=Math.max(page.attempted,attempted);page.entries.push({product,offer});pages.set(url.href,page);
 }
 const scheduled=[...pages.values()].sort((a,b)=>a.attempted-b.attempted).slice(0,cap);
 for(const page of scheduled){
  const {url}=page;
  for(const {product,offer} of page.entries){
   offer.lastAttemptAt=now;
   try{
    if(!robots.has(url.origin)){
     const rr=await fetchImpl(url.origin+'/robots.txt',{signal:AbortSignal.timeout(8000),redirect:'error',headers:{'User-Agent':'KosodateHiyori/1.0 (public price reader)'}});
     // Respect a robots fetch denial; do not infer permission from an error.
     if(rr.status===404)robots.set(url.origin,'');else if(rr.ok)robots.set(url.origin,await bodyLimited(rr));else throw Error('robots_unavailable_'+rr.status);
    }
    if(!robotsAllows(robots.get(url.origin),url.pathname+url.search,'KosodateHiyori'))throw Error('robots_disallowed');
    if(!cache.has(url.href)){
     requested++;
     const res=await fetchImpl(url.href,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{'User-Agent':'KosodateHiyori/1.0 (public price reader)','Accept':'text/html'}});
     if(!res.ok)throw Error('http_'+res.status);
     if(!/text\/html/.test(res.headers.get('content-type')??''))throw Error('not_html');
     cache.set(url.href,await bodyLimited(res));
    }
    const published=parsePublishedOffer(cache.get(url.href),product,offer);
    if(published===null)throw Error('unambiguous_product_price_not_found');
    // A displayed page price is one sale unit. Repeated purchases require an
    // explicit page-to-order calculation; never overwrite a two-unit order with one unit.
    const purchaseUnits=offer.priceCalculation&&typeof offer.priceCalculation==='object'?offer.priceCalculation.purchaseUnits:offer.purchaseUnits||1;
    const unit=String(product.unitType||offer.unitLabel||'個'),name=String(published.name).normalize('NFKC');
    const baseQuantity=unit==='枚'?Number(name.match(/(\d+)\s*枚/)?.[1]):unit==='100g'||product.category==='ミルク'?Number(name.match(/(?:×|x)\s*(\d+)\s*缶|\b(\d+)\s*缶/i)?.slice(1).find(Boolean)||1):Number(String(product.unit||'').normalize('NFKC').match(new RegExp('(\\d+)\\s*'+unit))?.[1]||1);
    if(!Number.isSafeInteger(purchaseUnits)||purchaseUnits<1||offer.quantity!==baseQuantity*purchaseUnits)throw Error('page_quantity_requires_manual_check');
    const amount=published.price*purchaseUnits;
    if(purchaseUnits>1){const rule=offer.shippingRule;if(!rule||rule.verified!==true||!Number.isFinite(rule.fee)||rule.kind!=='flat'&&rule.kind!=='threshold')throw Error('order_shipping_requires_manual_check');offer.shipping=rule.kind==='threshold'&&amount>=rule.freeFrom?0:rule.fee;offer.priceCalculation={unitPrice:published.price,purchaseUnits,calculatedPrice:amount};}
    offer.previousPrice=offer.price;
    offer.price=amount;offer.basePrice=amount;offer.total=Number.isFinite(offer.shipping)?amount+offer.shipping:null;
    offer.unitPrice=offer.total===null?null:Math.round(offer.total/(offer.totalGrams?offer.totalGrams/100:offer.quantity)*100)/100;
    // The product price can be verified even when delivery remains unknown.
    // normalizeOffer still excludes an unknown shipping charge from total-cost rankings.
    offer.checkedAt=now;offer.status=published.available?'在庫あり':'在庫未確認';offer.verified=true;offer.priceVerified=true;offer.live=false;offer.available=published.available?true:null;offer.stockVerified=published.available;if(published.available)offer.stockCheckedAt=now;
    offer.verificationType='公開ページの価格データ';delete offer.refreshError;success++;
   }catch(error){
    // Preserve the last amount/date as a dated reference, but remove it from confirmed cheapest results.
    offer.verified=false;offer.status='要再確認';offer.refreshError=String(error.message??error).slice(0,160);failed++;
   }
  }
 }
 data.lastPriceRefresh={attemptedAt:now,requested,success,failed,maxRequests:cap,scheduledPages:scheduled.length,remainingPages:Math.max(0,pages.size-scheduled.length),skipped};
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
