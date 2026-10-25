import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {normalizeOffer,compareOffers}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const data=JSON.parse(fs.readFileSync(new URL('./fixtures/shop-base.json',import.meta.url),'utf8'));
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
 const online=compareOffers(wipes,{mode:'オンライン',now:NOW}),store=compareOffers(wipes,{mode:'店舗',now:NOW});
 assert.equal(online.length,1);assert.equal(store.length,1);assert.equal(online[0].total,1190);assert.equal(store[0].total,590);near(online[0].unitCost,1190/640);assert.equal(online[0].quantityLabel,'640枚');assert.equal(online[0].region,wipes.offers[0].region);assert.equal(JSON.stringify(wipes),before);
});
