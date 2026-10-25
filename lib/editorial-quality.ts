type Item=Record<string,any>;
export const EDITORIAL_TOPICS=['出産準備','お世話・食事','教育・遊び','グッズ','おでかけ','保育・制度','体験談'] as const;
const words=(item:Item)=>[item.title,item.summary,item.description].filter(v=>typeof v==='string').join(' ');
/** Topic labels help find useful actions; a parenting keyword alone is not editorial approval. */
export function editorialTopics(item:Item):string[]{
 const text=words(item)+' '+(Array.isArray(item.tags)?item.tags.join(' '):'');
 const result=new Set<string>(Array.isArray(item.practicalTopics)?item.practicalTopics.filter((v:unknown)=>typeof v==='string'&&(EDITORIAL_TOPICS as readonly string[]).includes(v)):[]);
 if(/妊娠|妊婦|産前|出産|入院準備|つわり|妊活/.test(text))result.add('出産準備');
 if(/離乳食|幼児食|授乳|ミルク|おむつ|オムツ|お世話|寝かしつけ|夜泣き|栄養|歯みがき|歯磨き|沐浴|スキンケア|トイレトレ/.test(text))result.add('お世話・食事');
 if(/教育|学習|小学校|小学生|習い事|知育|おもちゃ|玩具|絵本|読み聞かせ|工作|折り紙|手遊び|遊び|ことば|発達/.test(text))result.add('教育・遊び');
 if(/グッズ|用品|アイテム|ベビーカー|抱っこひも|抱っこ紐|チャイルドシート|哺乳びん|哺乳瓶|おもちゃ|玩具|マグ|スプーン|ベビー服|搾乳器|さく乳器|ケープ/.test(text))result.add('グッズ');
 if(item.kind==='おでかけ'||/おでかけ|お出かけ|子連れ|親子旅|動物園|水族館|博物館|科学館|美術館|テーマパーク|遊園地|屋内遊び場|室内遊び場/.test(text))result.add('おでかけ');
 if(/保育|幼稚園|学童|給付|手当|助成|補助|支援制度|申請|年金|育休|育児休業|産休|保活|入園|無償化/.test(text))result.add('保育・制度');
 if(/体験談|あるある|育児記録|成長記録|育児日記/.test(text))result.add('体験談');
 return [...result];
}
export function isPracticalEditorial(item:Item):boolean{
 const text=words(item),title=String(item.title||'');
 if(item.editorialStatus==='excluded')return false;
 if(/育児日記|幸せ日記|活動報告|人事異動|職員採用|入札|議事録|議事要旨|JPLS|アメブロの広告|こどもまんなかニュース/.test(title))return false;
 if(/(?:会議|審議会|分科会|シンポジウム|全国大会).*(?:開催|案内|募集)|(?:発売前|発売後)?重版|ファンクラブ|芸能|占い/.test(title))return false;
 if(/地震|災害|電気火災|携帯トイレ/.test(title))return false;
 if(item.directUsefulness===true&&Array.isArray(item.practicalPoints)&&item.practicalPoints.length>=2)return true;
 if(/研究|調査|検証|関連を報告|提言|麻酔薬/.test(title)&&!/申請|手続き|選び方|使い方|チェックリスト|家庭でできる|保護者向けの手順/.test(title))return false;
 const family=/妊娠|妊婦|出産|産後|育児|子育て|赤ちゃん|ベビー|乳幼児|子ども|子供|こども|幼児|乳児|離乳食|幼児食|授乳|ミルク|おむつ|オムツ|保育|幼稚園|小学生|小学校|学童|親子|子連れ|絵本|知育|学習|勉強|学校|保護者|母子|歯が生え|予防接種/.test(text);
 const action=/選び方|使い方|作り方|進め方|方法|手順|準備|持ち物|ポイント|チェック|相談|手続き|申請|利用|予約|募集|給付|手当|支援|免除|助成|無償|レシピ|コツ|アイデア|遊び|遊ぶ|おでかけ|お出かけ|グッズ|用品|読み聞かせ|声をかけ|声かけ|声のかけ|対処|どう|できる|確認|取り分け|必要な|工夫|見直|飾り|作る|つくる|献立|学び|洗濯|取り入れ|話し方|配布/.test(text);
 return family&&action;
}
export function practicalVideoPriority(item:Item):number{
 const title=String(item.sourceTitle||item.title||'');
 if(/あるある|突撃|インタビュー|先生に|先生の|密着|保育士の仕事|働き方|定点観測/.test(title))return 0;
 if(/作り方|使い方|選び方|準備|手順|離乳食|レシピ|手遊び|工作|折り紙|知育|読み聞かせ|授乳|沐浴|おむつ|オムツ|スプーン|抱っこひも|ベビーカー/.test(title))return 3;
 if(/申請|給付|手当|保育|入学|入園|家庭学習|支援/.test(title))return 2;
 return 1;
}
