import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const priceModule=moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8'));
const {offerComparisonGroups}=await import(priceModule);
const selectorSource=fs.readFileSync(new URL('../components/amazon-comparison-summary.ts',import.meta.url),'utf8').replace("'../lib/price-comparison'",JSON.stringify(priceModule));
const {selectAmazonComparison}=await import(moduleUrl(selectorSource));
const checkedAt='2026-10-25T12:00:00Z',now=Date.parse(checkedAt);
const offer=(id,source,patch={})=>({id,store:id,source,price:1000,shipping:0,quantity:1,unitLabel:'個',verified:true,available:true,checkedAt,mode:'配送',...patch});
const product=offers=>({id:'item',name:'育児用品',unit:'1個',unitType:'個',offers});
const group=(item,quantity=1)=>offerComparisonGroups(item,{now}).find(row=>row.quantity===quantity).key;

test('Amazon beyond the first ten keeps its actual rank and confirmed Prime total',()=>{
 const item=product([
  ...Array.from({length:10},(_,i)=>offer('shop'+i,`https://shop${i}.example.org/products/item`,{price:1000+i})),
  offer('amazon','https://www.amazon.co.jp/dp/B012345678',{price:2000,shippingBasis:'amazon-prime-assumption'}),
 ]);
 const summary=selectAmazonComparison(item,{groupKey:group(item),now,sort:'total'});
 assert.equal(summary.rank,11);
 assert.equal(summary.offer.id,'amazon');
 assert.equal(summary.offer.total,2000);
 assert.equal(summary.offer.shipping,0);
 assert.equal(summary.offer.shippingBasis,'amazon-prime-assumption');
 assert.deepEqual(summary.alternatives,[]);
});

test('Amazon in a two-item set appears only as another quantity when one item is selected',()=>{
 const item=product([
  offer('single','https://www.yodobashi.com/product/123/'),
  offer('amazon-set','https://www.amazon.co.jp/dp/B012345678',{price:1800,quantity:2}),
 ]);
 const single=selectAmazonComparison(item,{groupKey:group(item),now,sort:'total'});
 assert.equal(single.offer,null);
 assert.equal(single.rank,null);
 assert.equal(single.alternatives.length,1);
 assert.equal(single.alternatives[0].key,group(item,2));
 assert.equal(single.alternatives[0].label,'2個');
 assert.equal(single.alternatives[0].offer.total,1800);
 const bundle=selectAmazonComparison(item,{groupKey:single.alternatives[0].key,now,sort:'total'});
 assert.equal(bundle.offer.id,'amazon-set');
 assert.equal(bundle.offer.quantity,2);
 assert.equal(bundle.rank,1);
 assert.deepEqual(bundle.alternatives,[]);
});

test('unknown shipping, stale, unverified and unavailable Amazon offers do not get a comparison summary',()=>{
 for(const patch of [{shipping:null},{checkedAt:'2026-10-20T12:00:00Z'},{verified:false},{available:false}]){
  const item=product([
   offer('single','https://www.yodobashi.com/product/123/'),
   offer('amazon','https://www.amazon.co.jp/dp/B012345678',patch),
  ]);
  const summary=selectAmazonComparison(item,{groupKey:group(item),now});
  assert.equal(summary.offer,null);
  assert.equal(summary.rank,null);
  assert.deepEqual(summary.alternatives,[]);
  assert.deepEqual(summary.conditionalOptions,[]);
 }
});

test('conditional Amazon prices require the comparison option and keep the matching quantity',()=>{
 const item=product([
  offer('single','https://www.yodobashi.com/product/123/'),
  offer('amazon','https://www.amazon.co.jp/dp/B012345678',{price:800,mode:'配送・定期便'}),
  offer('amazon-two','https://www.amazon.co.jp/dp/B087654321',{price:1500,quantity:2,mode:'配送・定期便'}),
 ]);
 const hidden=selectAmazonComparison(item,{groupKey:group(item),now});
 assert.equal(hidden.offer,null);
 assert.deepEqual(hidden.alternatives,[]);
 assert.deepEqual(hidden.conditionalOptions.map(row=>row.offer.id),['amazon','amazon-two']);
 const shown=selectAmazonComparison(item,{groupKey:group(item),now,includeConditional:true,sort:'total'});
 assert.equal(shown.offer.id,'amazon');
 assert.equal(shown.offer.conditional,true);
 assert.equal(shown.offer.quantity,1);
 assert.equal(shown.rank,1);
 assert.equal(shown.alternatives[0].offer.quantity,2);
 assert.deepEqual(shown.conditionalOptions,[]);
});

test('the ordinary Amazon price takes priority over a cheaper conditional offer in its quantity',()=>{
 const item=product([
  offer('amazon','https://www.amazon.co.jp/dp/B012345678',{price:1000}),
  offer('amazon-subscribe','https://www.amazon.co.jp/dp/B012345678',{price:800,mode:'配送・定期便'}),
 ]);
 const summary=selectAmazonComparison(item,{groupKey:group(item),now,sort:'total'});
 assert.equal(summary.offer.id,'amazon');
 assert.equal(summary.offer.conditional,false);
 assert.equal(summary.offer.total,1000);
 assert.deepEqual(summary.conditionalOptions,[]);
});
