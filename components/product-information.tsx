'use client';
import {Check,ExternalLink,Package} from 'lucide-react';
import {productFacts} from '../lib/product-catalog';
type Item=Record<string,any>;
export default function ProductInformation({product,compact=false}:{product:Item;compact?:boolean}){
 const points=(Array.isArray(product.features)?product.features:[]).filter((value:unknown)=>typeof value==='string'&&value).slice(0,compact?3:6),facts=productFacts(product);
 const source=product.source||product.sourceUrl||product.sourceURL||product.productUrl;
 let safe:string|undefined;try{const u=new URL(source);if(u.protocol==='https:'&&!u.username&&!u.password)safe=u.href;}catch{}
 const summary=typeof product.summary==='string'?product.summary:typeof product.description==='string'?product.description:'';
 return <section className={'product-information '+(compact?'is-compact':'')} aria-label="商品の特徴と規格"><div className="product-information-title"><Package size={19}/><h3>商品の特徴と規格</h3></div>{summary&&<p className="product-information-summary">{summary}</p>}{points.length>0&&<ul>{points.map((point:string,index:number)=><li key={index}><Check size={16}/><span>{point}</span></li>)}</ul>}{facts.length>0&&<dl>{facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}{product.caution&&<p className="product-information-caution">{product.caution}</p>}{safe&&<a href={safe} target="_blank" rel="noopener noreferrer">{product.sourceName||'商品の案内'}<ExternalLink size={14}/></a>}{!summary&&!points.length&&!facts.length&&<p className="product-information-summary">型番・容量・入数をそろえて販売価格を比較しています。</p>}</section>;
}
