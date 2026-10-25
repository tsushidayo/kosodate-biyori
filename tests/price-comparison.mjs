import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {normalizeOffer,compareOffers}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const data=JSON.parse(fs.readFileSync(new URL('./fixtures/shop-base.json',import.meta.url),'utf8'));
// This arithmetic fixture represents confirmed stock; unknown stock is tested separately.
for(const product of data.products)for(const offer of product.offers)offer.available=true;
const NOW=Date.parse('2026-10-25T12:00:00Z');
const hai=data.products.find(p=>p.id==='haihai-810');
const pure=data.products.find(p=>p.id==='pure-820');
const base=hai.offers[0];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
test('same-SKU rankings distinguish unit price from total order cost',()=>{
 const normal=compareOffers(hai,{now:NOW});
 assert.equal(normal[0].id,'am_hai_normal');
 near(normal[0].total,4409);near(normal[0].unitCost,4409/16.2);near(normal[0].perPack,4409/2);
 assert.equal(compareOffers(hai,{now:NOW,includeConditional:true})[0].id,'am_hai_sub');
 assert.equal(compareOffers(hai,{now:NOW,sort:'total'})[0].id,'ak_single');
 assert.ok(normal.every((o,i)=>i===0||normal[i-1].unitCost<=o.unitCost));
 assert.ok(!normal.some(o=>o.id.startsWith('am_pure')));
});
test('discount filters do not mistake explanatory text for an applied discount',()=>{
 const regular=compareOffers(pure,{now:NOW});assert.equal(regular[0].id,'am_pure_normal');
 const withDeals=compareOffers(pure,{now:NOW,includeConditional:true});assert.equal(withDeals[0].id,'rak_pure_coupon');
 assert.ok(!regular.some(o=>o.conditional));
 const diaper=data.products.find(p=>p.id==='merries-premium-m46');assert.equal(compareOffers(diaper,{now:NOW}).length,1);
});
test('unknown shipping, stale data, unproven prices, and unavailable stock never rank',()=>{
 for(const patch of [{shipping:null},{quantity:0},{quantity:-1},{price:-1},{price:NaN},{verified:false},{status:'売り切れ'},{status:'価格表示に差'},{checkedAt:'2026-10-23T11:59:59Z'},{checkedAt:'not a date'},{source:'javascript:alert(1)'},{totalGrams:null}]){
  const result=normalizeOffer(hai,{...base,...patch},NOW);assert.equal(result.eligible,false,JSON.stringify(patch));assert.ok(result.ineligibleReason);
 }
 assert.equal(normalizeOffer(hai,{...base,mode:'配送・取り寄せ',status:'掲載あり'},NOW).eligible,true);
 assert.equal(normalizeOffer(hai,{...base,checkedAt:'2026-10-26T11:59:00Z'},NOW).eligible,true);
 assert.equal(normalizeOffer(hai,{...base,checkedAt:'2026-10-26T12:00:01Z'},NOW).eligible,false);
});
test('unit price is recomputed with shipping and bonus milk grams',()=>{
 const n=normalizeOffer(hai,{...base,price:2000,shipping:600,quantity:2,totalGrams:1620,unitPrice:1},NOW);near(n.unitCost,2600/16.2);near(n.perPack,1300);assert.equal(n.quantityLabel,'810g × 2缶');
 const gift=normalizeOffer(hai,hai.offers.find(o=>o.id==='nishi_hai_case'),NOW);near(gift.unitCost,14078/51.2);near(gift.perPack,(14078/51.2)*8.1);assert.equal(gift.quantityLabel,'810g × 6缶 ＋ 260g');assert.equal(gift.perPackLabel,'810g換算');
});
test('store pickup is separate, regions preserved, and input records remain unchanged',()=>{
 const wipes=data.products.find(p=>p.id==='wipes-su-640'),before=JSON.stringify(wipes);
 const online=compareOffers(wipes,{mode:'オンライン',now:NOW}),store=compareOffers(wipes,{mode:'店舗受取',now:NOW});
 assert.equal(online.length,1);assert.equal(store.length,1);assert.equal(online[0].total,1190);assert.equal(store[0].total,590);near(online[0].unitCost,1190/640);assert.equal(online[0].quantityLabel,'640枚');assert.equal(online[0].region,wipes.offers[0].region);assert.equal(JSON.stringify(wipes),before);
});

test('in-store purchases never contain online delivery, click-and-collect, or flea listings',()=>{
 const product={id:'example',category:'育児用品',unit:'1個',offers:[
 {...base,id:'online',mode:'配送',price:100,shipping:0,quantity:1},
 {...base,id:'pickup',mode:'配送・店舗受取可',price:90,shipping:0,quantity:1},
 {...base,id:'physical',mode:'店頭',price:120,shipping:0,quantity:1},
 {...base,id:'flea',mode:'フリマ',purchaseChannel:'marketplace',price:50,shipping:0,quantity:1,store:'メルカリ'}]};
 assert.deepEqual(compareOffers(product,{mode:'店舗',now:NOW}).map(o=>o.id),['physical']);
 assert.deepEqual(compareOffers(product,{mode:'店頭購入',now:NOW}).map(o=>o.id),['physical']);
 assert.deepEqual(compareOffers(product,{mode:'店舗受取',now:NOW}).map(o=>o.id),['pickup']);
 assert.deepEqual(compareOffers(product,{mode:'オンライン',now:NOW}).map(o=>o.id),['online']);
 assert.deepEqual(compareOffers(product,{mode:'フリマ',now:NOW}).map(o=>o.id),['flea']);
});

test('used marketplace prices require an explicit opt-in outside the flea tab',()=>{
 const product={category:'育児用品',unit:'1個',offers:[{...base,id:'used',mode:'フリマ',purchaseChannel:'marketplace',itemCondition:'目立った傷や汚れなし',conditionClass:'used',price:50,shipping:0,quantity:1}]};
 assert.equal(compareOffers(product,{mode:'すべて',now:NOW}).length,0);
 assert.equal(compareOffers(product,{mode:'すべて',includeUsed:true,now:NOW}).length,1);
 assert.equal(compareOffers(product,{mode:'フリマ',now:NOW}).length,1);
 assert.equal(compareOffers(product,{mode:'フリマ',includeUsed:false,now:NOW}).length,0);
});

test('liquid milk and cube packs retain their own quantity units without being forced into cans',()=>{
 const offer={id:'liquid',store:'公式通販',mode:'配送',price:328,shipping:600,quantity:1,unitLabel:'個',source:'https://shop.example.org/products/liquid',checkedAt:'2026-10-25',verified:true,available:true};
 const liquid=normalizeOffer({category:'ミルク',unit:'240ml',name:'液体ミルク',formulation:'liquid'},offer,NOW);assert.equal(liquid.eligible,true);assert.equal(liquid.quantityLabel,'1個');near(liquid.total,928);
 const cubes=normalizeOffer({category:'ミルク',unit:'108g',name:'キューブミルク',packUnit:'個'},{...offer,totalGrams:108,unitLabel:'100g'},NOW);assert.equal(cubes.quantityLabel,'108g × 1個');near(cubes.unitCost,928/1.08);
});
