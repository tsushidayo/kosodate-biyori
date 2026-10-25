import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPrices} from '../scripts/price-refresh.mjs';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=(source)=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const priceModule=moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'));
const {normalizeOffer}=await import(priceModule);
const {retailerComparisons}=await import(moduleUrl(fs.readFileSync(new URL('../lib/retailer-links.ts',import.meta.url),'utf8').replace("'./price-comparison.ts'",JSON.stringify(priceModule))));

const checkedAt='2026-10-20T00:00:00Z';
function catalog(){return {products:[0,1,2].map(index=>({id:'p'+index,name:'同じ商品'+index,offers:[{id:'o'+index,source:'https://www.yodobashi.com/product/'+index+'/',refreshEligible:true,checkedAt,price:100,shipping:0,quantity:1,verified:true,status:'掲載あり'}]}))};}
function fetcher(requests){return async value=>{
 const url=new URL(value);if(url.pathname==='/robots.txt')return new Response('',{status:404});
 requests.push(url.pathname);const index=Number(url.pathname.split('/')[2]);
 return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'同じ商品'+index,offers:{'@type':'Offer',price:200+index,priceCurrency:'JPY',availability:'https://schema.org/InStock'}})+'</script>',{headers:{'Content-Type':'text/html'}});
};}

test('bounded daily checks rotate to later product pages instead of repeating the first',async()=>{
 const requests=[],input=catalog(),fetchImpl=fetcher(requests);
 let result=await refreshPrices(input,{maxRequests:1,fetchImpl,now:'2026-10-25T00:00:00Z'});
 assert.equal(result.lastPriceRefresh.requested,1);assert.equal(result.lastPriceRefresh.remainingPages,2);
 result=await refreshPrices(result,{maxRequests:1,fetchImpl,now:'2026-10-26T00:00:00Z'});
 result=await refreshPrices(result,{maxRequests:1,fetchImpl,now:'2026-10-27T00:00:00Z'});
 assert.deepEqual(requests,['/product/0/','/product/1/','/product/2/']);
 assert.deepEqual(result.products.map(product=>product.offers[0].price),[200,201,202]);
 assert.equal(input.products[0].offers[0].price,100);
});

test('failed checks retain the prior amount and confirmation date and still rotate',async()=>{
 const input=catalog(),requests=[];
 const failed=await refreshPrices(input,{maxRequests:1,fetchImpl:async()=>new Response('',{status:403}),now:'2026-10-25T00:00:00Z'});
 const offer=failed.products[0].offers[0];assert.equal(offer.price,100);assert.equal(offer.checkedAt,checkedAt);assert.equal(offer.verified,false);assert.equal(offer.status,'要再確認');assert.equal(offer.lastAttemptAt,'2026-10-25T00:00:00Z');
 const next=await refreshPrices(failed,{maxRequests:1,fetchImpl:fetcher(requests),now:'2026-10-26T00:00:00Z'});
 assert.deepEqual(requests,['/product/1/']);assert.equal(next.lastPriceRefresh.success,1);
});

test('a repeated product URL consumes one request and updates all its registered offers',async()=>{
 const input=catalog(),requests=[];input.products[0].offers.push({...input.products[0].offers[0],id:'same-page'});
 const result=await refreshPrices(input,{maxRequests:1,fetchImpl:fetcher(requests),now:'2026-10-25T00:00:00Z'});
 assert.equal(requests.length,1);assert.equal(result.lastPriceRefresh.scheduledPages,1);assert.equal(result.lastPriceRefresh.success,2);
 assert.deepEqual(result.products[0].offers.map(offer=>offer.price),[200,200]);
});

test('registered Rakuten, Yahoo, LOHACO and Matsukiyo product pages enter the daily rotation',async()=>{
 const input=catalog(),urls=[
  'https://item.rakuten.co.jp/sundrug/4987244600059/',
  'https://store.shopping.yahoo.co.jp/sundrugec/4987244600059.html',
  'https://lohaco.yahoo.co.jp/store/h-lohaco/item/j303146/',
  'https://www.matsukiyococokara-online.com/store/catalog/product/view/id/4987244600059',
 ];
 input.products=[{id:'p0',name:'同じ商品0',offers:urls.map((source,index)=>({...input.products[0].offers[0],id:'store'+index,source}))}];
 const requested=[];
 const result=await refreshPrices(input,{maxRequests:20,now:'2026-10-25T00:00:00Z',fetchImpl:async value=>{
  const url=new URL(value);if(url.pathname==='/robots.txt')return new Response('',{status:404});
  requested.push(url.href);
  return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'同じ商品0',offers:{'@type':'Offer',price:250,priceCurrency:'JPY',availability:'https://schema.org/InStock'}})+'</script>',{headers:{'Content-Type':'text/html'}});
 }});
 assert.deepEqual(requested,urls);assert.equal(result.lastPriceRefresh.success,4);assert.deepEqual(result.lastPriceRefresh.skipped,[]);
});

test('Tsuruha numeric html product pages are supported without accepting its search results',async()=>{
 const input=catalog();input.products=input.products.slice(0,1);input.products[0].offers[0].source='https://shop.tsuruha.co.jp/10016508.html';
 const requested=[];
 const result=await refreshPrices(input,{maxRequests:1,now:'2026-10-25T00:00:00Z',fetchImpl:async value=>{
  const url=new URL(value);if(url.pathname==='/robots.txt')return new Response('',{status:404});
  requested.push(url.href);return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'同じ商品0',offers:{'@type':'Offer',price:580,priceCurrency:'JPY'}})+'</script>',{headers:{'Content-Type':'text/html'}});
 }});
 assert.equal(result.products[0].offers[0].price,580);assert.equal(result.lastPriceRefresh.success,1);assert.equal(requested.length,1);
});

test('unknown shipping keeps a refreshed product price visible but excludes total-cost rankings',async()=>{
 const input=catalog();input.products=input.products.slice(0,1);input.products[0].offers[0].shipping=null;
 const now='2026-10-25T00:00:00Z';
 const result=await refreshPrices(input,{maxRequests:1,fetchImpl:fetcher([]),now});
 const product=result.products[0],offer=product.offers[0];
 assert.equal(offer.price,200);assert.equal(offer.total,null);assert.equal(offer.priceVerified,true);
 assert.equal(normalizeOffer(product,offer,Date.parse(now)).eligible,false);
 assert.equal(normalizeOffer(product,offer,Date.parse(now)).ineligibleReason,'送料未確認');
 const row=retailerComparisons(product,{now:Date.parse(now)}).find(row=>row.id==='yodobashi');
 assert.equal(row.offer.price,200);assert.equal(row.offer.total,null);assert.equal(row.status,'送料未確認');
});

test('unsupported or search URLs are recorded as skipped without fetching or changing their price',async()=>{
 const input=catalog(),requests=[];
 input.products[0].offers[0].source='https://wowma.jp/kw/formula';
 input.products[1].offers[0].source='https://shop.akachan.jp/shop/c/cb162/?brand=example';
 input.products[2].offers[0].source='https://item.rakuten.co.jp/search/?q=example';
 const result=await refreshPrices(input,{maxRequests:20,fetchImpl:fetcher(requests),now:'2026-10-25T00:00:00Z'});
 assert.equal(requests.length,0);assert.equal(result.lastPriceRefresh.scheduledPages,0);
 assert.equal(result.lastPriceRefresh.skipped.length,3);
 assert.ok(result.lastPriceRefresh.skipped.every(entry=>entry.reason==='unsupported_or_non_product_url'));
 assert.equal(result.products[0].offers[0].price,100);
});
