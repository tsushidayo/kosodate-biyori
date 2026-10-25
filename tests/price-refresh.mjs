import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPrices} from '../scripts/price-refresh.mjs';

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
