/** Editorial approval confirms parenting relevance, not the truth of a social post. */
type Obj = Record<string, any>;
type Review = {id: string; status: 'approved' | 'rejected'; reason: string; tags: string[]; ageGroups?: string[]; allAges?: boolean};
export type SocialCuration = {schemaVersion: 1; checkedAt: string; reviews: Review[]; additionalPosts: Obj[]; instagramPosts?: Obj[]; shorts: Obj[]};
export type SocialCurationResult = {ok: boolean; error: string | null; source: 'github' | 'bundled'; checkedAt: string | null; reviewedX: number; rejectedX: number; shortsCount: number; instagramCount: number; topics: Obj[]; instagram: Obj[]; shorts: Obj[]};
const CURATION_URL = 'https://raw.githubusercontent.com/tsushidayo/kosodate-biyori/main/data/social-curation.json';
const MAX_BYTES = 5_000_000;
const MAX_RESULTS = 3000;
const object = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const labels = (value: unknown, max = 20) => Array.isArray(value) ? [...new Set(value.filter((v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 40 && !/[<>\u0000-\u001f\u007f]/.test(v)).map((v: string) => v.trim()))].slice(0, max) : [];
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const parsed = Date.parse(value), [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return Number.isFinite(parsed) && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() ? value : null;
}
function web(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 600) return null;
  try {const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash ? u : null;} catch {return null;}
}
export function xStatusIdentity(value: unknown): {id: string; handle: string; url: string} | null {
  const u = web(value); if (!u || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(u.hostname)) return null;
  const match = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})\/?$/);
  return match ? {id: match[2], handle: match[1], url: `https://x.com/${match[1]}/status/${match[2]}`} : null;
}
function ageMetadata(value: Obj): Obj {
  const result: Obj = {};
  if (Array.isArray(value.ageGroups)) result.ageGroups = labels(value.ageGroups, 12);
  if (typeof value.allAges === 'boolean') result.allAges = value.allAges;
  for (const key of ['minAgeMonths', 'maxAgeMonths', 'minMonth', 'maxMonth', 'minSchoolGrade', 'maxSchoolGrade']) if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = value[key];
  if (Array.isArray(value.ageRanges)) result.ageRanges = value.ageRanges.slice(0, 12).filter(object).map((range: Obj) => Object.fromEntries(['minAgeMonths', 'maxAgeMonths', 'minMonth', 'maxMonth'].filter(key => typeof range[key] === 'number' && Number.isFinite(range[key])).map(key => [key, range[key]]))).filter((range: Obj) => Object.keys(range).length);
  if (value.ageScope === 'all') result.ageScope = 'all';
  for (const key of ['ageBasis', 'ageClassification']) if (typeof value[key] === 'string') result[key] = clean(value[key], 180);
  return result;
}
export function validateSocialCuration(value: unknown): SocialCuration {
  if (!object(value) || value.schemaVersion !== 1 || !date(value.checkedAt) || !Array.isArray(value.reviews) || !Array.isArray(value.additionalPosts) || !Array.isArray(value.shorts) || value.reviews.length > 10000 || value.additionalPosts.length > 5000 || value.shorts.length > 5000 || value.instagramPosts !== undefined && (!Array.isArray(value.instagramPosts) || value.instagramPosts.length > 5000)) throw new Error('Social curation schema is invalid');
  const seen = new Set<string>();
  const reviews: Review[] = value.reviews.map((v: unknown) => {
    if (!object(v) || typeof v.id !== 'string' || !/^\d{10,25}$/.test(v.id) || !['approved', 'rejected'].includes(v.status) || !clean(v.reason, 500) || !Array.isArray(v.tags) || seen.has(v.id)) throw new Error('Social curation review is invalid');
    seen.add(v.id); return {id: v.id, status: v.status, reason: clean(v.reason, 500), tags: labels(v.tags), ...ageMetadata(v)} as Review;
  });
  return {schemaVersion: 1, checkedAt: value.checkedAt, reviews, additionalPosts: value.additionalPosts, instagramPosts: value.instagramPosts || [], shorts: value.shorts};
}
export function normalizeCuratedXPost(value: unknown): Obj | null {
  if (!object(value) || value.parentingUseful !== true && value.parentingRelevant !== true) return null;
  const identity = xStatusIdentity(value.url); if (!identity) return null;
  if (value.id !== undefined && (typeof value.id !== 'string' || ![identity.id, 'github-x-' + identity.id, 'official-x-' + identity.id, 'x-' + identity.id].includes(value.id))) return null;
  if (value.handle !== undefined && (typeof value.handle !== 'string' || value.handle.toLowerCase() !== identity.handle.toLowerCase())) return null;
  const title = clean(value.title || value.summary, 180), summary = clean(value.summary || value.title, 180);
  if (!title || !clean(value.sourceName || value.source, 160)) return null;
  const result: Obj = {id: value.id || 'official-x-' + identity.id, title, summary, url: identity.url, source: clean(value.sourceName || value.source, 160), sourceName: clean(value.sourceName || value.source, 160), platform: 'X', handle: identity.handle, publishedAt: date(value.publishedAt), tags: labels(value.tags), parentingUseful: true, parentingRelevant: true, verificationStatus: 'unverified', ...ageMetadata(value), summaryKind: 'post-excerpt', readingLabel: '投稿の一部', ingestion: value.ingestion === 'github-collection' ? 'github-collection' : 'curated-social'};
  for (const key of ['author', 'category', 'collectedAt', 'checkedAt', 'caution', 'metricsLabel']) if (typeof value[key] === 'string') result[key] = clean(value[key], key === 'caution' ? 500 : 180);
  if (object(value.recordedMetrics)) {
    const metrics: Obj = {}; for (const key of ['likes', 'views']) if (Number.isSafeInteger(value.recordedMetrics[key]) && value.recordedMetrics[key] >= 0) metrics[key] = value.recordedMetrics[key];
    if (Object.keys(metrics).length) result.recordedMetrics = metrics;
  }
  return result;
}
/** Canonical identity for public image, carousel, and Reel posts, with no copied embed HTML. */
export function instagramPostIdentity(value: unknown): {shortcode: string; kind: 'p'|'reel'; url: string} | null {
  const u = web(value); if (!u || !['www.instagram.com', 'instagram.com'].includes(u.hostname)) return null;
  const match = u.pathname.match(/^\/(p|reels?)\/([A-Za-z0-9_-]{5,50})\/?$/);
  if (!match) return null;
  const kind = match[1] === 'p' ? 'p' : 'reel';
  return {shortcode: match[2], kind, url: `https://www.instagram.com/${kind}/${match[2]}/`};
}
export function normalizeCuratedInstagramPost(value: unknown): Obj | null {
  if (!object(value) || value.parentingRelevant !== true && value.parentingUseful !== true) return null;
  const identity = instagramPostIdentity(value.url); if (!identity) return null;
  if (value.shortcode !== undefined && value.shortcode !== identity.shortcode || value.videoId !== undefined && value.videoId !== identity.shortcode) return null;
  if (value.id !== undefined && ![identity.shortcode, 'instagram-' + identity.shortcode].includes(value.id)) return null;
  if (value.handle !== undefined && (typeof value.handle !== 'string' || !/^[A-Za-z0-9_.]{1,30}$/.test(value.handle))) return null;
  const title = clean(value.title, 80), sourceName = clean(value.sourceName || value.source, 160);
  if (!title || !sourceName) return null;
  const isVideo = identity.kind === 'reel' || value.isVideo === true;
  if (isVideo && !isRelevantParentingVideo(value)) return null;
  const result: Obj = {id: 'instagram-' + identity.shortcode, shortcode: identity.shortcode, videoId: identity.shortcode, platform: 'Instagram', url: identity.url, title, summary: clean(value.summary, 180), sourceName, source: sourceName, publishedAt: date(value.publishedAt), checkedAt: date(value.checkedAt), tags: labels(value.tags), parentingRelevant: true, parentingUseful: true, verificationStatus: 'unverified', isVideo, ...ageMetadata(value), summaryKind: 'post-excerpt', readingLabel: '投稿の一部', ingestion: 'curated-instagram'};
  const thumbnail = web(value.thumbnailUrl);
  if (thumbnail && (thumbnail.hostname.endsWith('.cdninstagram.com') || thumbnail.hostname.endsWith('.fbcdn.net') || thumbnail.hostname === 'ignewsimg.s3.ap-northeast-1.wasabisys.com')) result.thumbnailUrl = thumbnail.href;
  if (typeof value.handle === 'string') result.handle = value.handle;
  if (typeof value.author === 'string') result.author = clean(value.author, 160);
  if (typeof value.sourceUrl === 'string' && web(value.sourceUrl)) result.sourceUrl = web(value.sourceUrl)!.href;
  if (typeof value.caution === 'string') result.caution = clean(value.caution, 500);
  if (typeof value.captionExcerpt === 'string') result.captionExcerpt = clean(value.captionExcerpt, 160);
  result.postFormat=isVideo?'video':['image','carousel'].includes(value.postFormat)?value.postFormat:value.isVideo===false?'image':'unknown';
  if (isVideo) {
    result.videoFormat = 'instagram-video';
    result.durationSeconds = typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0 && value.durationSeconds <= 3600 ? value.durationSeconds : null;
    result.embedVerified = value.embedVerified === true;
  }
  // A relatedness review does not establish medical or factual accuracy, even for a named publisher.
  return result;
}
/** Videos require explicit parenting words; disaster and accident topics are excluded. */
export function isRelevantParentingVideo(value: Obj): boolean {
  const contentText=[value.title,value.summary,value.description,value.captionExcerpt].filter(v=>typeof v==='string').join(' ');
  const text=[contentText,...(Array.isArray(value.tags)?value.tags:[])].filter(v=>typeof v==='string').join(' ');
  if(/地震|震災|津波|台風|豪雨|洪水|土砂|火災|防災|災害|避難|備蓄|ローリングストック|携帯トイレ|事故|感電|やけど|火傷|熱傷|誤嚥|窒息|誤飲|溺水|溺れ|転落|転倒|救命|心肺蘇生|パワーウインド|交通安全|防犯/.test(text))return false;
  return /妊娠|妊婦|出産|産前|産後|育児|子育て|育休|赤ちゃん|新生児|乳幼児|乳児|幼児|ベビー|離乳食|授乳|おむつ|オムツ|抱っこ|寝かしつけ|夜泣き|親子|子ども|子供|こども|お子さん|お子様|子連れ|息子|娘|[一二三四五]男|[０-９0-9]+歳児|先輩ママ|イヤイヤ期|保育|幼稚園|小学生|小学校|中学生|学童|習い事|家庭学習|知育|教育|手遊び|読み聞かせ|絵本|通園|通学|つわり|妊活|母乳|ミルク|おもちゃ|生後[０-９0-9]/.test(contentText);
}
export function normalizeCuratedVideo(value: unknown): Obj | null {
  if (!object(value) || value.parentingUseful !== true && value.parentingRelevant !== true || typeof value.videoId !== 'string' || !isRelevantParentingVideo(value)) return null;
  if (typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 180) return null;
  const u = web(value.url), title = clean(value.title, 180), sourceName = clean(value.sourceName, 160); if (!u || !title || !sourceName) return null;
  let url = '', platform = '';
  if (value.platform === 'YouTube' && /^[A-Za-z0-9_-]{11}$/.test(value.videoId)) {
    const id = ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname) ? u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || (u.pathname === '/watch' ? u.searchParams.get('v') : null) : u.hostname === 'youtu.be' ? u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] : null;
    if (id === value.videoId) {platform = 'YouTube'; url = value.videoFormat === 'short-video' ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/shorts/${id}`;}
  } else if (value.platform === 'Instagram' && /^[A-Za-z0-9_-]{5,50}$/.test(value.videoId) && ['www.instagram.com', 'instagram.com'].includes(u.hostname)) {
    const identity = instagramPostIdentity(value.url); if (identity?.shortcode === value.videoId && (identity.kind === 'reel' || value.isVideo === true)) {platform = 'Instagram'; url = identity.url;}
  } else if (value.platform === 'TikTok' && /^\d{15,25}$/.test(value.videoId) && ['www.tiktok.com', 'tiktok.com'].includes(u.hostname)) {
    const match = u.pathname.match(/^\/@([A-Za-z0-9._]{1,30})\/video\/(\d{15,25})\/?$/); if (match?.[2] === value.videoId) {platform = 'TikTok'; url = `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;}
  }
  if (!url) return null;
  const result: Obj = {id: `${platform.toLowerCase()}-${value.videoId}`, videoId: value.videoId, platform, url, title, sourceName, source: sourceName, summary: clean(value.summary, 400), tags: labels(value.tags), parentingUseful: true, parentingRelevant: true, verificationStatus: 'unverified', publishedAt: date(value.publishedAt), checkedAt: date(value.checkedAt), ...ageMetadata(value), ingestion: 'curated-short-video'};
  for (const key of ['reason', 'reviewReason', 'caution', 'durationLabel', 'sourceUrl']) if (typeof value[key] === 'string' && (key !== 'sourceUrl' || web(value[key]))) result[key] = clean(value[key], 500);
  if (!result.reviewReason && typeof value.usefulnessReason === 'string') result.reviewReason = clean(value.usefulnessReason, 500);
  if (platform === 'YouTube') result.thumbnailUrl = `https://i.ytimg.com/vi/${value.videoId}/hqdefault.jpg`;
  if (value.videoFormat === 'shorts' || value.videoFormat === 'short-video') result.videoFormat = value.videoFormat;
  if (platform === 'Instagram') {result.videoFormat = 'instagram-video'; result.isVideo = true; result.durationSeconds = null; result.embedVerified = false;}
  if (typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0 && value.durationSeconds <= 3600) result.durationSeconds = value.durationSeconds;
  if (value.embedVerified === true) result.embedVerified = true;
  if(typeof value.captionExcerpt==='string')result.captionExcerpt=clean(value.captionExcerpt,160);
  if(typeof value.sourceTitle==='string')result.sourceTitle=clean(value.sourceTitle,180);
  return result;
}
/** Instagram videos share the video shelf; the Instagram shelf contains confirmed feed formats only. */
export function splitSocialMedia(instagramInput:Obj[]=[],videoInput:Obj[]=[]):{instagram:Obj[];shorts:Obj[]}{
 const instagram:Obj[]=[],shorts:Obj[]=[],feedIds=new Set<string>(),videoIds=new Set<string>();
 const candidates=[...videoInput];
 for(const raw of instagramInput){
  const item=normalizeCuratedInstagramPost(raw);if(!item)continue;
  if(item.isVideo===true){if(item.durationSeconds===null||item.durationSeconds<=180)candidates.push(item);}
  else if(['image','carousel'].includes(item.postFormat)&&!feedIds.has(item.id)){feedIds.add(item.id);instagram.push(item);}
 }
 for(const raw of candidates){const item=normalizeCuratedVideo(raw);if(!item||videoIds.has(item.id)||item.platform==='Instagram'&&typeof item.durationSeconds==='number'&&item.durationSeconds>180)continue;videoIds.add(item.id);shorts.push(item);}
 return{instagram:instagram.slice(0,MAX_RESULTS),shorts:shorts.slice(0,MAX_RESULTS)};
}
const wasApproved = (item: Obj) => (item.parentingUseful === true || item.parentingRelevant === true) && (item.reviewStatus === 'approved' || item.curation?.status === 'approved');
/** Merge fresh reactions with the prior editorial decision, using the canonical X status ID. */
export function applySocialCuration(document: SocialCuration, incomingTopics: Obj[], previousTopics: Obj[], previousShorts: Obj[] = [], preservePreviousShorts = false, previousInstagram: Obj[] = []): {topics: Obj[]; instagram: Obj[]; shorts: Obj[]; rejectedX: number} {
  const reviews = new Map(document.reviews.map(v => [v.id, v]));
  const previous = new Map(previousTopics.map(v => [xStatusIdentity(v.url)?.id, v]).filter(([id]) => !!id) as [string, Obj][]);
  const additionalById = new Map(document.additionalPosts.filter(v => normalizeCuratedXPost(v) !== null).map(v => [xStatusIdentity(v.url)!.id, v]) as [string, Obj][]);
  const topics: Obj[] = [], seen = new Set<string>();
  // Collection time records reactions; an editorial check date must not replace a newer observation.
  const candidates = [...document.additionalPosts, ...incomingTopics, ...previousTopics].filter(object)
    .sort((a, b) => (Date.parse(b.collectedAt || '') || 0) - (Date.parse(a.collectedAt || '') || 0));
  for (const raw of candidates) {
    if (!object(raw)) continue; const identity = xStatusIdentity(raw.url); if (!identity || seen.has(identity.id)) continue;
    const prior = previous.get(identity.id), review = reviews.get(identity.id), curated = additionalById.get(identity.id);
    if (review?.status === 'rejected') {seen.add(identity.id); continue;}
    const additional = !!curated && (curated.parentingUseful === true || curated.parentingRelevant === true);
    if (review?.status !== 'approved' && !wasApproved(raw) && !(prior && wasApproved(prior)) && !additional) continue;
    const metadata: Obj = review?.status === 'approved' ? {tags: review.tags, ...ageMetadata(curated || {}), ...ageMetadata(prior || {}), ...ageMetadata(review)} : prior && wasApproved(prior) ? {tags: labels(prior.tags), ...ageMetadata(prior)} : {tags: labels(curated?.tags || raw.tags), ...ageMetadata(curated || raw)};
    const item = normalizeCuratedXPost({...curated, ...raw, ...metadata, parentingUseful: true}); if (!item) continue;
    const reason = review?.reason || clean(prior?.reviewReason || prior?.curation?.reason || curated?.reviewReason || curated?.reason || raw.reviewReason || raw.reason, 500) || '子育てに関連する投稿として掲載。内容の正確性は未確認';
    const checkedAt = review?.status === 'approved' || additional ? document.checkedAt : date(prior?.curation?.checkedAt || raw.curation?.checkedAt) || document.checkedAt;
    topics.push({...item, reviewStatus: 'approved', reviewReason: reason, curation: {status: 'approved', reason, checkedAt}}); seen.add(identity.id);
  }
  const collectedInstagram: Obj[] = [];
  for (const raw of [...(document.instagramPosts || []), ...(preservePreviousShorts ? previousInstagram : [])]) {const item = normalizeCuratedInstagramPost(raw); if(item)collectedInstagram.push(item);}
  const {instagram,shorts}=splitSocialMedia(collectedInstagram,[...document.shorts,...(preservePreviousShorts?previousShorts:[])]);

  return {topics: topics.slice(0, MAX_RESULTS), instagram: instagram.slice(0, MAX_RESULTS), shorts: shorts.slice(0, MAX_RESULTS), rejectedX: document.reviews.filter(v => v.status === 'rejected').length};
}
async function fetchCuration(fetcher: typeof fetch): Promise<SocialCuration> {
  const res = await fetcher(CURATION_URL, {headers: {Accept: 'application/json', 'Cache-Control':'no-cache', 'User-Agent': 'KosodateBiyori/1.0 (curation reader)'}, signal: AbortSignal.timeout(7000), redirect: 'manual'});
  if (!res.ok) throw new Error('Social curation HTTP ' + res.status);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Social curation size limit');
  const reader = res.body?.getReader(); if (!reader) throw new Error('Social curation body is empty');
  const parts: Uint8Array[] = []; let bytes = 0;
  try {for (;;) {const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > MAX_BYTES) throw new Error('Social curation size limit'); parts.push(next.value);}} catch (e) {await reader.cancel().catch(() => {}); throw e;}
  const all = new Uint8Array(bytes); let at = 0; for (const part of parts) {all.set(part, at); at += part.length;}
  return validateSocialCuration(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(all)));
}
export async function refreshSocialCuration(input: {previousTopics: Obj[]; incomingTopics: Obj[]; previousShorts: Obj[]; previousInstagram?: Obj[]; fallback: unknown}, fetcher: typeof fetch = fetch): Promise<SocialCurationResult> {
  let document: SocialCuration, ok = true, error: string | null = null;
  try {document = await fetchCuration(fetcher);} catch (e) {ok = false; error = e instanceof Error ? e.message : 'Social curation failed'; document = validateSocialCuration(input.fallback);}
  const result = applySocialCuration(document, input.incomingTopics, input.previousTopics, input.previousShorts, !ok, input.previousInstagram || []);
  return {ok, error, source: ok ? 'github' : 'bundled', checkedAt: document.checkedAt, reviewedX: result.topics.length, shortsCount: result.shorts.length, instagramCount: result.instagram.length, ...result};
}
