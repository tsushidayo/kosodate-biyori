'use client';
import {getProductVariants,selectProductVariant} from '../lib/product-variants';
type Item=Record<string,any>;
const collator=new Intl.Collator('ja-JP',{numeric:true});
export default function ProductVariantSelector({products,product,onSelect}:{products:Item[];product:Item;onSelect:(product:Item)=>void}){
 const family=getProductVariants(products,product);if(!family||family.variants.length<2)return null;
 const sizes=[...new Set(family.variants.map(v=>v.size))];
 const choices=family.variants.filter(v=>v.size===family.current.size).sort((a,b)=>collator.compare(a.pieces,b.pieces));
 return <section className="comparison-variants" aria-label="商品のサイズと枚数"><div><span>商品の規格を選ぶ</span><h3>{family.familyName}</h3></div><div className="comparison-variant-fields"><label><span>サイズ</span><select aria-label="商品のサイズ" value={family.current.size} onChange={event=>{const next=selectProductVariant(products,product,{size:event.target.value});if(next)onSelect(next)}}>{sizes.map(size=><option key={size} value={size}>{size}</option>)}</select></label><label><span>1袋の枚数</span><select aria-label="1袋の枚数" value={product.id} onChange={event=>{const next=selectProductVariant(products,product,{productId:event.target.value});if(next)onSelect(next)}}>{choices.map(choice=><option key={choice.product.id} value={choice.product.id}>{choice.pieces}入り</option>)}</select></label></div><p className="comparison-variant-current" aria-live="polite">選択中：{family.current.size}・{family.current.pieces}入り</p></section>;
}
