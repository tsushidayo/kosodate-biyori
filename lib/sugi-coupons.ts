/** Local-only examples. These amounts never become verified store offers or price rankings. */
export type SugiCouponKind='single15'|'app15'|'all8'|'app10'|'u25'|'goHappy5'|'customPercent'|'customYen'|'none';
export type SugiCouponPreset={id:SugiCouponKind;label:string;scope:'single'|'all'|'none';percent?:number;verifiedProgram:boolean;condition:string;source?:string};
export const SUGI_COUPON_PRESETS:SugiCouponPreset[]=[
 {id:'single15',label:'1品15%OFF・仮設定',scope:'single',percent:15,verifiedProgram:false,condition:'1販売単位だけを15%引きにする仮設定です。配布・利用できることを確認したクーポンではありません。'},
 {id:'app15',label:'アプリ・1品15%OFF',scope:'single',percent:15,verifiedProgram:true,condition:'公式アプリが案内する1品15%OFFの例。全員へ毎回届く固定特典とは扱いません。入手済みか、有効期限・対象・回数・最低金額等を券面で確認してください。',source:'https://faq.sugi-net.jp/faq/show/20564?category_id=17&site_domain=default'},
 {id:'all8',label:'全品8%OFF・仮設定',scope:'all',percent:8,verifiedProgram:false,condition:'全対象品を8%引きにする仮設定です。現在配布中の公式クーポンとしては確認していません。'},
 {id:'app10',label:'初回アプリ登録・全品10%OFF',scope:'all',percent:10,verifiedProgram:true,condition:'公式アプリに初めて会員登録した方向け。入手済みか、有効期限・対象商品・使用条件は券面で確認してください。',source:'https://www.sugi-net.jp/service/digital/sugi-app'},
 {id:'u25',label:'U25・1品15%OFF',scope:'single',percent:15,verifiedProgram:true,condition:'25歳以下の方向け。月曜配信で月〜金に週1回、1品15%OFF。配信5日前23:59までの登録と過去12か月の購入等の条件があります。登録後12か月以内は購入履歴を問いません。年齢・利用日・券面を確認してください。',source:'https://faq.sugi-net.jp/faq/show/3888?site_domain=default'},
 {id:'goHappy5',label:'Goハッピー・全品5%OFF',scope:'all',percent:5,verifiedProgram:true,condition:'60歳以上の方向け、毎月15・16・17日の全品5%OFF。年齢・利用日・入手方法・使用回数を券面で確認してください。',source:'https://faq.sugi-net.jp/faq/show/3393?site_domain=default'},
 {id:'customPercent',label:'割引率を自分で入力',scope:'all',verifiedProgram:false,condition:'入力した率を、選んだ適用範囲に1回使います。券面の対象と条件を確認してください。'},
 {id:'customYen',label:'値引き額を自分で入力',scope:'all',verifiedProgram:false,condition:'入力した額を、選んだ適用範囲から1回だけ引きます。券面の対象と条件を確認してください。'},
 {id:'none',label:'クーポンを使わない',scope:'none',percent:0,verifiedProgram:false,condition:'店頭の税込価格のみを計算します。'}
];
export const SUGI_EXCLUSIONS_URL='https://www.sugi-net.jp/www2/itemlist';
export const SUGI_COMBINATION_URL='https://faq.sugi-net.jp/faq/show/1510?site_domain=default';
type Item=Record<string,any>;
export function sugiProductEligibility(product:Item):{status:'excluded'|'check';reason:string}{
 const category=String(product.category||'').normalize('NFKC'),name=String(product.name||'').normalize('NFKC');
 const terms=[category,name,product.formulation,...(Array.isArray(product.searchTerms)?product.searchTerms:[])].filter(Boolean).join(' ').normalize('NFKC');
 const accessory=/ローション|乳液|クリーム|石けん|石鹸|ソープ|シャンプー|クレンジング|哺乳瓶|ミルクケース|ミルクポット|ミルクウォーマー|ミルクストッカー|調乳ポット|調乳用|調乳じょ〜ず/.test(name);
 if(category==='ミルク'||!accessory&&/粉ミルク|液体ミルク|育児用ミルク|育児ミルク|フォローアップミルク|ベビーミルク/.test(terms))return {status:'excluded',reason:'ベビーミルクは公式の割引・値引対象外です。ここでは、割引を使えた場合の参考額だけを計算します。実際に使える価格ではありません。'};
 const tableware=/食器|スプーン|フォーク|容器|保存パック|調理セット|食事セット|食事スタイ|お食事エプロン|おかゆクッカー|離乳食エプロン|ベビーフードケース/.test(name);
 const confectionery=/おやつ|菓子|せんべい|ビスケット|ボーロ|ぼうろ|クッキー|ウエハース|ウェハース|クラッカー|キャンディ|グミ|すなっく|スナック/.test(name)||/^(?:菓子|おやつ)$/.test(category);
 if(!confectionery&&!tableware&&(/離乳食|ベビーフード|レトルト|食品|飲料|飲み物|ジュース|麦茶|スープ|おかゆ|お粥|ふりかけ/.test(category+' '+name)))return {status:'excluded',reason:'食品は菓子類を除き、公式の割引・値引対象外です。ここでは、割引を使えた場合の参考額だけを計算します。実際に使える価格ではありません。'};
 return {status:'check',reason:confectionery?'菓子類は「食品」の一律除外から外れますが、個別の対象外や券面の条件を確認してください。':'おむつ等も、個別商品・店舗・券面によって条件が異なります。対象商品であることを確認してください。'};
}
export function parseSugiNumber(value:string):number|null {const s=value.trim();if(!s)return null;if(!/^\d+(?:\.\d+)?$/.test(s))return NaN;return Number(s);}
export type SugiSimulationInput={unitPrice:number|null;purchaseCount:number;coupon:SugiCouponKind;customValue?:number|null;customScope?:'single'|'all';conditionsConfirmed?:boolean;minimumSpend?:number|null;product:Item;packageConfirmed?:boolean;hypothetical?:boolean};
export type SugiSimulationResult={status:'needs-input'|'invalid'|'needs-confirmation'|'excluded'|'below-minimum'|'ready';message:string;normalTotal:number|null;discount:number|null;afterTotal:number|null;appliedCount:number;percent:number|null};
export function simulateSugiCoupon(input:SugiSimulationInput):SugiSimulationResult{
 const result:SugiSimulationResult={status:'needs-input',message:'定価・通常の税込価格を入力すると試算できます。',normalTotal:null,discount:null,afterTotal:null,appliedCount:0,percent:null};
 if(input.unitPrice===null)return result;
 if(!Number.isSafeInteger(input.unitPrice)||input.unitPrice!<1||input.unitPrice!>10_000_000||!Number.isSafeInteger(input.purchaseCount)||input.purchaseCount<1||input.purchaseCount>1000)return {...result,status:'invalid',message:'価格は1円以上の整数、購入点数は1以上の整数で入力してください。'};
 const normalTotal=input.unitPrice!*input.purchaseCount;
 const preset=SUGI_COUPON_PRESETS.find(p=>p.id===input.coupon);
 if(!preset)return {...result,status:'invalid',normalTotal,message:'クーポンの種類を選んでください。'};
 if(preset.scope==='none')return {...result,status:'ready',normalTotal,discount:0,afterTotal:normalTotal,message:'クーポンなしの店頭価格です。'};
 const eligibility=sugiProductEligibility(input.product);
 if(!input.hypothetical&&eligibility.status==='excluded')return {...result,status:'excluded',normalTotal,message:eligibility.reason};
 if(!input.hypothetical&&input.packageConfirmed!==true)return {...result,status:'needs-confirmation',normalTotal,message:'入力した価格の販売単位と、購入する点数を確認してください。'};
 if(!input.hypothetical&&input.conditionsConfirmed!==true)return {...result,status:'needs-confirmation',normalTotal,message:'対象商品・入手・年齢・利用日・期限・最低金額などの条件を確認してください。'};
 if(input.minimumSpend!==null&&input.minimumSpend!==undefined&&(!Number.isSafeInteger(input.minimumSpend)||input.minimumSpend<0||input.minimumSpend>10_000_000))return {...result,status:'invalid',normalTotal,message:'最低会計額は0円以上の整数で入力してください。'};
 if(typeof input.minimumSpend==='number'&&normalTotal<input.minimumSpend)return {...result,status:'below-minimum',normalTotal,message:'この商品分だけでは、入力した最低会計額に届きません。別の商品の額は自動で加えていません。'};
 const custom=input.coupon==='customPercent'||input.coupon==='customYen';
 if(custom&&(input.customValue===null||input.customValue===undefined))return {...result,normalTotal,message:'試算に使う割引率または値引き額を入力してください。'};
 const scope=custom?(input.customScope??'single'):preset.scope;
 if(!['single','all','none'].includes(scope))return {...result,status:'invalid',normalTotal,message:'割引を使う範囲を確認してください。'};
 const percent=input.coupon==='customPercent'?input.customValue!:preset.percent??null;
 if(percent!==null&&(!Number.isFinite(percent)||percent<0||percent>100))return {...result,status:'invalid',normalTotal,message:'割引率は0〜100%で入力してください。'};
 if(input.coupon==='customYen'&&(!Number.isSafeInteger(input.customValue)||input.customValue!<0||input.customValue!>(scope==='single'?input.unitPrice!:normalTotal)))return {...result,status:'invalid',normalTotal,message:scope==='single'?'1点への値引き額は、その1点の価格までの整数で入力してください。':'値引き額は0円から通常合計までの整数で入力してください。'};
 const appliedCount=scope==='single'?1:input.purchaseCount;
 // The exact rounding used at the till is not confirmed. Do not promise the fractional yen.
 const discount=input.coupon==='customYen'?input.customValue!:Math.floor(input.unitPrice!*appliedCount*(percent??0)/100+1e-9);
 return {...result,status:'ready',normalTotal,discount,afterTotal:normalTotal-discount,appliedCount,percent,message:input.hypothetical&&eligibility.status==='excluded'?eligibility.reason:'通常価格からクーポン額を引いた仮の価格です。実際の店頭価格・利用条件とは異なる場合があります。'};
}

export function sugiComparisonAmount(reference:Item|null,quantity:number,totalGrams:number|null,unitLabel:string){
 if(!reference||reference.unitLabel!==unitLabel||!Number.isInteger(quantity/reference.quantity)||quantity<reference.quantity)return null;
 const purchaseCount=quantity/reference.quantity;
 // A bundle with bonus powder cannot be matched by the same number of plain cans.
 if(reference.totalGrams!=null||totalGrams!=null){if(typeof reference.totalGrams!=='number'||typeof totalGrams!=='number'||Math.abs(reference.totalGrams*purchaseCount-totalGrams)>1e-7)return null;}
 return {unitPrice:reference.price,purchaseCount};
}
