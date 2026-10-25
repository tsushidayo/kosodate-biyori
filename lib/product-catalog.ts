type Item=Record<string,any>;
const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s　]+/g,' ').trim();
/** Search actual product facts rather than merchant URLs or unrelated offer notes. */
export function catalogMatches(product:Item,query:string){
 const words=normalized(query).split(' ').filter(Boolean);if(!words.length)return true;
 const specifications=product.specification||product.specifications;
 const specificationValues=specifications&&typeof specifications==='object'&&!Array.isArray(specifications)?Object.values(specifications):[];
 const text=normalized([product.name,product.brand,product.manufacturer,product.jan,product.ean,product.gtin13,product.gtin12,product.gtin,product.model,product.manufacturerSku,product.sku,product.unit,product.capacity,product.size,product.material,product.color,product.compatibility,product.summary,product.description,...(product.searchTerms||[]),...(product.features||[]),...specificationValues].filter(v=>typeof v==='string').join(' '));
 return words.every(word=>text.includes(word));
}
export function productFacts(product:Item){
 const age=product.manufacturerAgeNote||product.sourceAgeText||product.targetAge||(!/分類の目安|商品タグに記載|サイズや使える時期|年齢を推測|月齢を推定/.test(String(product.ageNote||''))?product.ageNote:undefined);
 const productCode=product.manufacturerSku||product.sku;
 const pairs=[['対象',age],['容量・規格',product.capacity||product.unit],['サイズ',product.size],['素材',product.material],['色',product.color],['型番',product.model],['商品番号',productCode!==product.model?productCode:undefined],['JAN',product.jan||product.ean||product.gtin13],['適合',product.compatibility],['適応体重',product.weightGuidance],['タイプ',product.diaperType]];
 const base=pairs.filter(([,value])=>typeof value==='string'&&value.trim()).map(([label,value])=>({label,value:String(value)}));
 const specifications=product.specification||product.specifications;
 if(specifications&&typeof specifications==='object'&&!Array.isArray(specifications))for(const [label,value]of Object.entries(specifications)){if(typeof value==='string'&&value.trim()&&value.length<300&&!base.some(fact=>fact.label===label||fact.value===value))base.push({label,value});}
 return base.slice(0,12);
}
/** A broad catalog starts with different uses; categories retain their price-coverage order. */
export function diverseCatalog<T extends Item>(products:T[]):T[]{
 const groups=new Map<string,T[]>();for(const product of products){const key=String(product.category||'その他');const group=groups.get(key)||[];group.push(product);groups.set(key,group);}
 const result:T[]=[];for(let index=0;result.length<products.length;index++)for(const group of groups.values())if(group[index])result.push(group[index]);return result;
}
