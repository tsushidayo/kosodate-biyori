import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const specsUrl=moduleUrl(fs.readFileSync(new URL('../lib/catalog-specifications.ts',import.meta.url),'utf8'));
const variantsSource=fs.readFileSync(new URL('../lib/product-variants.ts',import.meta.url),'utf8').replace("'./catalog-specifications'",JSON.stringify(specsUrl));
const {getProductVariants,selectProductVariant}=await import(moduleUrl(variantsSource));
const {compareOffers,offerComparisonGroups}=await import(moduleUrl(fs.readFileSync(new URL('../lib/price-comparison.ts',import.meta.url),'utf8')));
const products=JSON.parse(fs.readFileSync(new URL('../data/shop.json',import.meta.url),'utf8')).products;
const product=id=>{const p=products.find(p=>p.id===id);assert.ok(p,id);return p;};

test('a single-pack sheet count chooses the exact SKU within the same series and size',()=>{
 const p=product('merries-premium-tape-s54'),family=getProductVariants(products,p);
 assert.deepEqual(family.variants.filter(v=>v.size==='S').map(v=>v.pieces).sort(),['19枚','54枚']);
 const selected=selectProductVariant(products,p,{productId:'merries-premium-tape-s19'});
 assert.equal(selected.id,'merries-premium-tape-s19');assert.notEqual(selected.jan,p.jan);
 assert.equal(selectProductVariant(products,p,{productId:'merries-premium-tape-nb60'}),null,'a sheet-count choice cannot silently change size');
 assert.equal(selectProductVariant(products,p,{productId:'moony-tape-s70'}),null,'another brand is not a count variant');
});
test('the selected count uses only its own product offers, not 54-sheet or case prices',()=>{
 const p=selectProductVariant(products,product('merries-premium-tape-s54'),{productId:'merries-premium-tape-s19'});
 const now=Date.parse('2026-10-26T00:00:00Z'),group=offerComparisonGroups(p,{now})[0];
 assert.equal(group.quantity,19);
 const offers=compareOffers(p,{mode:'オンライン',groupKey:group.key,now});
 assert.ok(offers.length>=2);assert.ok(offers.every(o=>o.quantity===19&&(!o.packs||o.packs===1)));
 assert.equal(offers[0].retailerKey,'yodobashi');assert.equal(offers[0].total,582);
 assert.ok(!offers.some(o=>o.retailerKey==='amazon'),'unknown Amazon shipping cannot rank');
});
test('gender, baby stage, retailer cases and newborn weight distinctions are preserved',()=>{
 const boys=getProductVariants(products,product('uc-4903111206155'));
 assert.ok(boys.variants.every(v=>!v.product.name.includes('女の子')));
 const sensitive=getProductVariants(products,product('uc-4903111243921'));
 assert.ok(sensitive.variants.some(v=>v.size==='新生児・3,000gまで'));
 assert.ok(sensitive.variants.some(v=>v.size==='新生児・5,000gまで'));
 assert.equal(getProductVariants(products,product('moonyman-pants-m52')),null);
 assert.equal(getProductVariants(products,product('akahon-264103600')),null);
});
