import {catalogSpecifications} from './catalog-specifications';
type Item=Record<string,any>;
type Family={id:string;name:string;productIds:string[];sizes?:Record<string,string>};
/** Explicit catalog identities keep retailer bundles, different series and stages separate. */
const families:Family[]=[
 {id:'merries-first-premium-tape',name:'メリーズ ファーストプレミアム テープ',productIds:['merries-premium-tape-nb60','merries-premium-tape-s19','merries-premium-tape-s54','merries-premium-tape-s60','merries-premium-tape-m48']},
 {id:'merries-air-pants',name:'メリーズ エアスルー パンツ',productIds:['merries-air-pants-m52','merries-air-pants-l44']},
 {id:'moony-sensitive-pants',name:'ムーニーマン 低刺激であんしん パンツ',productIds:['uc-4903111242320','uc-4903111242610','uc-4903111243099','uc-4903111243150']},
 {id:'moony-sensitive-tape',name:'ムーニー 低刺激であんしん テープ',productIds:['uc-4903111243921','uc-4903111411085','uc-4903111569786'],sizes:{'uc-4903111243921':'新生児・3,000gまで','uc-4903111411085':'新生児・5,000gまで'}},
 {id:'moony-marshmallow-tape',name:'ムーニー マシュマロ肌ごこち テープ',productIds:['moony-tape-s70','uc-4903111137800','uc-4903111692521','uc-4903111049271']},
 {id:'moonyman-marshmallow-boys',name:'ムーニーマン マシュマロ肌ごこち 男の子',productIds:['uc-4903111206155','uc-4903111207671','uc-4903111211098']},
 {id:'moonyman-marshmallow-girls',name:'ムーニーマン マシュマロ肌ごこち 女の子',productIds:['uc-4903111206438','uc-4903111208098','uc-4903111211654']},
 {id:'pampers-airy-pants',name:'パンパース 超吸収 エアリー パンツ',productIds:['akahon-264085400','akahon-264085500','akahon-264085600']},
 {id:'goon-princess-pants',name:'グーン ぐんぐん吸収パンツ ディズニープリンセス',productIds:['akahon-250496200','akahon-240476000','akahon-240476100']},
];
export type ProductVariant={product:Item;size:string;pieces:string};
export function getProductVariants(products:Item[],product:Item):{familyId:string;familyName:string;current:ProductVariant;variants:ProductVariant[]}|null{
 const family=families.find(f=>f.productIds.includes(String(product.id)));if(!family)return null;
 const variants=family.productIds.flatMap(id=>{
  const item=products.find(p=>p.id===id);if(!item)return [];
  const facts=catalogSpecifications(item);const size=family.sizes?.[id]||facts.size||'';
  // These are documented standalone pack SKUs, never a set price divided by its bags.
  if(!size||!facts.pieces||facts.packCount&&facts.packCount!=='1個')return [];
  return [{product:item,size,pieces:facts.pieces}];
 });
 const current=variants.find(v=>v.product.id===product.id);if(!current)return null;
 return {familyId:family.id,familyName:family.name,current,variants};
}
/** A sheet-count choice can only select a SKU with the same product family and size. */
export function selectProductVariant(products:Item[],product:Item,selection:{size?:string;productId?:string}):Item|null{
 const family=getProductVariants(products,product);if(!family)return null;
 const size=selection.size||family.current.size;
 if(selection.productId)return family.variants.find(v=>v.product.id===selection.productId&&v.size===size)?.product||null;
 const candidates=family.variants.filter(v=>v.size===size);
 return candidates.find(v=>v.pieces===family.current.pieces)?.product||candidates[0]?.product||null;
}
