import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/sugi-coupons.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {simulateSugiCoupon,sugiProductEligibility,parseSugiNumber,SUGI_COUPON_PRESETS,sugiComparisonAmount}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base={unitPrice:1000,purchaseCount:2,coupon:'single15',conditionsConfirmed:true,packageConfirmed:true,product:{name:'おむつ54枚',category:'おむつ'}};
test('one item discount applies to one sale unit even when buying several',()=>{
 const single=simulateSugiCoupon(base);assert.equal(single.normalTotal,2000);assert.equal(single.discount,150);assert.equal(single.afterTotal,1850);assert.equal(single.appliedCount,1);
 const oneCase=simulateSugiCoupon({...base,purchaseCount:1,unitPrice:4000});assert.equal(oneCase.afterTotal,3400);
});
test('basket examples and custom discounts apply once and never stack',()=>{
 assert.equal(simulateSugiCoupon({...base,coupon:'all8'}).afterTotal,1840);
 assert.equal(simulateSugiCoupon({...base,coupon:'app10'}).afterTotal,1800);
 assert.equal(simulateSugiCoupon({...base,coupon:'customPercent',customValue:12.5}).afterTotal,1875);
 assert.equal(simulateSugiCoupon({...base,coupon:'customPercent',customScope:'all',customValue:12.5}).afterTotal,1750);
 assert.equal(simulateSugiCoupon({...base,coupon:'customYen',customValue:300}).afterTotal,1700);
 assert.equal(simulateSugiCoupon({...base,coupon:'none',conditionsConfirmed:false,packageConfirmed:false}).afterTotal,2000);
});
test('blank price, missing confirmation, invalid values and minimum spend do not yield a payable discount',()=>{
 for(const input of [{unitPrice:null},{packageConfirmed:false},{conditionsConfirmed:false},{unitPrice:-1},{unitPrice:0},{unitPrice:NaN},{unitPrice:1.1},{purchaseCount:0},{purchaseCount:1.5},{minimumSpend:3000},{minimumSpend:NaN},{coupon:'customPercent',customValue:null},{coupon:'customPercent',customValue:101},{coupon:'customYen',customValue:2001},{coupon:'customYen',customValue:1001},{coupon:'made-up'}]){
  const result=simulateSugiCoupon({...base,...input});assert.notEqual(result.status,'ready',JSON.stringify(input));assert.equal(result.afterTotal,null);
 }
 assert.equal(simulateSugiCoupon({...base,minimumSpend:2000}).status,'ready');
 assert.equal(simulateSugiCoupon({...base,coupon:'customYen',customScope:'all',customValue:1001}).status,'ready');
});
test('baby milk including liquid and cubes and nonconfectionery foods are excluded',()=>{
 for(const product of [{category:'ミルク',name:'はいはい810g'},{category:'ミルク',name:'液体ミルク',formulation:'liquid'},{name:'育児用ミルク キューブ'},{category:'離乳食',name:'野菜がゆ'},{category:'離乳食・おやつ',name:'栄養マルシェ 和風弁当160g'},{category:'飲料',name:'ベビー麦茶'}]){
  assert.equal(sugiProductEligibility(product).status,'excluded');assert.equal(simulateSugiCoupon({...base,product}).status,'excluded');assert.equal(simulateSugiCoupon({...base,product,coupon:'customYen',customValue:100}).afterTotal,null);
 }
 for(const product of [{category:'食品',name:'赤ちゃんのおやつ せんべい'},{category:'離乳食・おやつ',name:'元気アップカルシウム 小魚せんべい'},{category:'離乳食・おやつ',name:'はじめての離乳食エプロン チェック'},{category:'おむつ',name:'テープS54枚'},{category:'おしりふき',name:'おしりふき80枚'},{category:'授乳・食事',name:'粉ミルクケース'},{category:'授乳・食事',name:'おかゆクッカー'},{category:'おふろ・スキンケア',name:'ベビーミルクローション'}])assert.equal(sugiProductEligibility(product).status,'check');
});
test('fractional yen is conservatively rounded only at the discount and no price is guessed',()=>{
 const result=simulateSugiCoupon({...base,unitPrice:999});assert.equal(result.discount,149);assert.equal(result.afterTotal,1849);
 assert.equal(parseSugiNumber(''),null);assert.equal(parseSugiNumber('  '),null);assert.equal(parseSugiNumber('12.5'),12.5);assert.ok(Number.isNaN(parseSugiNumber('-1')));assert.ok(Number.isNaN(parseSugiNumber('1e3')));
 assert.equal(SUGI_COUPON_PRESETS.find(p=>p.id==='all8').verifiedProgram,false);
 assert.equal(SUGI_COUPON_PRESETS.find(p=>p.id==='app10').verifiedProgram,true);
 assert.equal(SUGI_COUPON_PRESETS.find(p=>p.id==='app15').verifiedProgram,true);
});
test('the calculator does not mutate products or offers and never contains shared saving calls',()=>{
 const input=structuredClone(base),before=JSON.stringify(input);simulateSugiCoupon(input);assert.equal(JSON.stringify(input),before);
 const ui=fs.readFileSync(new URL('../components/sugi-coupon-simulator.tsx',import.meta.url),'utf8');assert.ok(!/fetch\(|localStorage|api\/update|api\/profile/.test(ui));assert.ok(ui.includes('仮のシミュレーション'));assert.ok(ui.includes("useState('')"));
});

test('the requested hypothetical mode calculates milk discounts without presenting them as usable offers',()=>{
 const result=simulateSugiCoupon({...base,product:{name:'はいはい810g',category:'ミルク'},unitPrice:2300,purchaseCount:2,hypothetical:true,conditionsConfirmed:false,packageConfirmed:false});
 assert.equal(result.status,'ready');assert.equal(result.discount,345);assert.equal(result.afterTotal,4255);assert.match(result.message,/実際に使える価格ではありません/);
});
test('Sugi amount matching rejects bonus powder and mismatched units',()=>{
 const reference={price:2300,quantity:1,totalGrams:810,unitLabel:'100g'};
 assert.deepEqual(sugiComparisonAmount(reference,2,1620,'100g'),{unitPrice:2300,purchaseCount:2});
 assert.equal(sugiComparisonAmount(reference,6,5120,'100g'),null);
 assert.equal(sugiComparisonAmount(reference,1,null,'個'),null);
});
