/** Topic labels describe an article; they never establish age eligibility or medical suitability. */
type EditorialItem = Record<string, any>;
const TOPICS: ReadonlyArray<readonly [string, RegExp]> = [
  ['食事・栄養', /食事|食育|栄養|離乳食|幼児食|授乳|母乳|ミルク|給食|お弁当|弁当|アレルギー|レシピ|偏食/],
  ['健康・安全', /健康|医療|受診|病気|発熱|感染|予防接種|ワクチン|事故|安全|危険|窒息|誤飲|けが|熱中症|救急|歯みがき|歯磨き|アレルギー|防災|災害/],
  ['園・学校', /保育|保活|幼稚園|こども園|入園|入学|学校|小学生|学童|登校|給食|就学|PTA|教科書|教育費|教育課程/],
  ['仕事・制度', /育休|育児休業|産休|産前産後休業|復職|仕事|働き方|両立|給付|手当|助成|補助|支援制度|申請|手続き|無償化|減免|所得制限|確定申告|ひとり親|年金|保険料/],
  ['家族・心', /家族|夫婦|パートナー|きょうだい|兄弟|姉妹|祖父母|父親|母親|パパ|ママ|孤独|メンタル|ストレス|相談|虐待|声かけ|声掛け|叱り|自己肯定感|イヤイヤ|不安/],
  ['遊び・学び', /遊び|あそび|絵本|読み聞かせ|工作|おもちゃ|玩具|学習|学び|体験|自由研究|読書|博物館|図書館|運動|スポーツ/],
  ['暮らし', /家事|掃除|洗濯|収納|住まい|住居|住宅|節約|家計|買い物|ベビーカー|抱っこひも|チャイルドシート|おむつ|オムツ|着替え|衣服/],
  ['お出かけ', /お出かけ|おでかけ|外出|旅行|公園|帰省|レジャー|動物園|水族館|博物館|科学館|美術館|テーマパーク|遊園地|屋内遊び場|室内遊び場|親子向けイベント|子ども向けイベント/],
  ['発達・生活習慣', /発達|成長|寝かしつけ|睡眠|夜泣き|昼寝|トイレ|排泄|ことば|言葉|歯みがき|歯磨き|生活習慣|身支度|イヤイヤ|健診/],
];
function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, 20_000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ');
}
export function deriveEditorialTags(item: EditorialItem): string[] {
  const explicit = Array.isArray(item?.tags) ? item.tags.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 40 && !/[<>\u0000-\u001f\u007f]/.test(v)).map((v: string) => v.trim() === 'おでかけ' ? 'お出かけ' : v.trim()) : [];
  const text = [item?.title, item?.summary, item?.category].map(plain).join(' ');
  const outing = TOPICS.find(([label]) => label === 'お出かけ')![1].test(text) || item.contentType === 'outing' || item.practicalTopics?.includes('おでかけ');
  return [...new Set([...explicit.filter(label => label !== 'お出かけ' || outing), ...TOPICS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)])].slice(0, 20);
}
