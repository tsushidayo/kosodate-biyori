import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const priceModule=moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'));
const {offerComparisonGroups,offerComparisonGroupKey,compareOffers}=await import(priceModule);
const {isBulkCatalogProduct}=await import(moduleUrl(fs.readFileSync(new URL('../lib/product-catalog.ts',import.meta.url),'utf8')));
const {selectAmazonComparison}=await import(moduleUrl(fs.readFileSync(new URL('../components/amazon-comparison-summary.ts',import.meta.url),'utf8').replace("'../lib/price-comparison'",JSON.stringify(priceModule))));
const now=Date.parse('2026-10-26T00:00:00Z'),checkedAt='2026-10-25T15:00:00Z';
const offer=(id,patch={})=>({id,store:id,source:'https://shop.example.org/products/'+id,price:1000,shipping:0,quantity:1,totalGrams:810,unitLabel:'100g',verified:true,available:true,checkedAt,mode:'配送',...patch});
const milk=offers=>({name:'はいはい810g',category:'ミルク',unit:'810g／缶',unitType:'100g',offers});

test('one-can bonus sets are not treated as the plain single can',()=>{
 const p=milk([offer('plain'),offer('gift',{price:100,purchaseLabel:'810g1缶・おしりふき付き'})]);
 assert.notEqual(offerComparisonGroupKey(p,p.offers[0]),offerComparisonGroupKey(p,p.offers[1]));
 const groups=offerComparisonGroups(p,{now});assert.equal(groups[0].isBase,true);assert.equal(groups[0].hasExtras,false);
 assert.deepEqual(compareOffers(p,{now,mode:'オンライン',groupKey:groups[0].key}).map(o=>o.id),['plain']);
 assert.ok(groups.some(g=>g.hasExtras&&g.label.includes('おまけ付き')));
});
test('a single liquid can stays the default even if Amazon currently only has a case',()=>{
 const p={name:'らくらくミルク240ml',category:'ミルク',formulation:'liquid',unit:'240ml／1商品',unitType:'個',offers:[offer('case',{quantity:24,totalGrams:null,unitLabel:'個'})]};
 const groups=offerComparisonGroups(p,{now});assert.equal(groups[0].quantity,1);assert.equal(groups[0].offerCount,0);assert.equal(groups[1].quantity,24);
});
test('retailer cases are opt-in while normal bottle parts and manufacturer cutlery stay standard',()=>{
 for(const name of ['【48パック】赤ちゃんのごはん','【12個入】麦茶125ml','【22枚×10個入】おしりふき','粉ミルク おまけ付き限定セット'])assert.equal(isBulkCatalogProduct({name}),true,name);
 for(const name of ['母乳実感 耐熱ガラス240ml 乳首M付き','フォーク＆スプーン ケース付き','さんかくクーピー12色セット','ベビーソープ500ml'])assert.equal(isBulkCatalogProduct({name}),false,name);
});
test('Amazon remains present for the same single even when shipping or the price is not yet known',()=>{
 const p=milk([offer('normal'),offer('amazon',{source:'https://www.amazon.co.jp/dp/B09S5PVZTL',price:900,shipping:null,priceVerified:true})]);
 const group=offerComparisonGroups(p,{now})[0],a=selectAmazonComparison(p,{now,groupKey:group.key});assert.equal(a.offer,null);assert.equal(a.reference.price,900);assert.equal(a.url,p.offers[1].source);
 const unknown=milk([offer('normal')]);unknown.amazonSingleSource='https://www.amazon.co.jp/dp/B09S5PVZTL';const b=selectAmazonComparison(unknown,{now,groupKey:offerComparisonGroups(unknown,{now})[0].key});assert.equal(b.offer,null);assert.equal(b.reference,null);assert.equal(b.url,unknown.amazonSingleSource);
});
test('real Amazon single-can records use the observed ordinary prices and quantities',()=>{
 const shop=JSON.parse(fs.readFileSync(new URL('../data/shop.json',import.meta.url),'utf8'));
 for(const [id,price,grams] of [['haihai-810',2045,810],['pure-820',1754,820]]){
  const p=shop.products.find(p=>p.id===id),o=p.offers.find(o=>o.singleItem&&o.sourceEvidence?.kind==='amazon-selected-single-offer');assert.ok(o,id);assert.equal(o.quantity,1);assert.equal(o.totalGrams,grams);assert.equal(o.price,price);assert.equal(o.shipping,0);assert.equal(o.shippingBasis,'amazon-prime-assumption');
  const a=selectAmazonComparison(p,{now,groupKey:offerComparisonGroups(p,{now})[0].key,sort:'total'});assert.equal(a.offer.price,price);assert.equal(a.offer.quantity,1);assert.equal(a.rank,1);
 }
});
