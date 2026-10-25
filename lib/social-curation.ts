/** Human reviews are the publishing gate. Metrics and keywords cannot approve a social post. */
type Obj = Record<string, any>;
type Review = {id: string; status: 'approved' | 'rejected'; reason: string; tags: string[]; ageGroups?: string[]; allAges?: boolean};
export type SocialCuration = {schemaVersion: 1; checkedAt: string; reviews: Review[]; additionalPosts: Obj[]; shorts: Obj[]};
export type SocialCurationResult = {ok: boolean; error: string | null; source: 'github' | 'bundled'; checkedAt: string | null; reviewedX: number; rejectedX: number; shortsCount: number; topics: Obj[]; shorts: Obj[]};
const CURATION_URL = 'https://raw.githubusercontent.com/tsushidayo/kosodate-biyori/main/data/social-curation.json';
const MAX_BYTES = 1_000_000;
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
  if (!object(value) || value.schemaVersion !== 1 || !date(value.checkedAt) || !Array.isArray(value.reviews) || !Array.isArray(value.additionalPosts) || !Array.isArray(value.shorts) || value.reviews.length > 2000 || value.additionalPosts.length > 500 || value.shorts.length > 500) throw new Error('Social curation schema is invalid');
  const seen = new Set<string>();
  const reviews: Review[] = value.reviews.map((v: unknown) => {
    if (!object(v) || typeof v.id !== 'string' || !/^\d{10,25}$/.test(v.id) || !['approved', 'rejected'].includes(v.status) || !clean(v.reason, 500) || !Array.isArray(v.tags) || seen.has(v.id)) throw new Error('Social curation review is invalid');
    seen.add(v.id); return {id: v.id, status: v.status, reason: clean(v.reason, 500), tags: labels(v.tags), ...ageMetadata(v)} as Review;
  });
  return {schemaVersion: 1, checkedAt: value.checkedAt, reviews, additionalPosts: value.additionalPosts, shorts: value.shorts};
}
export function normalizeCuratedXPost(value: unknown): Obj | null {
  if (!object(value) || value.parentingUseful !== true) return null;
  const identity = xStatusIdentity(value.url); if (!identity) return null;
  if (value.id !== undefined && (typeof value.id !== 'string' || ![identity.id, 'github-x-' + identity.id, 'official-x-' + identity.id, 'x-' + identity.id].includes(value.id))) return null;
  if (value.handle !== undefined && (typeof value.handle !== 'string' || value.handle.toLowerCase() !== identity.handle.toLowerCase())) return null;
  const title = clean(value.title || value.summary, 180), summary = clean(value.summary || value.title, 180);
  if (!title || !clean(value.sourceName || value.source, 160)) return null;
  const result: Obj = {id: value.id || 'official-x-' + identity.id, title, summary, url: identity.url, source: clean(value.sourceName || value.source, 160), sourceName: clean(value.sourceName || value.source, 160), platform: 'X', handle: identity.handle, publishedAt: date(value.publishedAt), tags: labels(value.tags), parentingUseful: true, ...ageMetadata(value), summaryKind: 'post-excerpt', readingLabel: '投稿の一部', ingestion: value.ingestion === 'github-collection' ? 'github-collection' : 'curated-social'};
  for (const key of ['author', 'category', 'collectedAt', 'checkedAt', 'caution', 'metricsLabel']) if (typeof value[key] === 'string') result[key] = clean(value[key], key === 'caution' ? 500 : 180);
  if (object(value.recordedMetrics)) {
    const metrics: Obj = {}; for (const key of ['likes', 'views']) if (Number.isSafeInteger(value.recordedMetrics[key]) && value.recordedMetrics[key] >= 0) metrics[key] = value.recordedMetrics[key];
    if (Object.keys(metrics).length) result.recordedMetrics = metrics;
  }
  return result;
}
export function normalizeCuratedVideo(value: unknown): Obj | null {
  if (!object(value) || value.parentingUseful !== true || typeof value.videoId !== 'string') return null;
  const u = web(value.url), title = clean(value.title, 180), sourceName = clean(value.sourceName, 160); if (!u || !title || !sourceName) return null;
  let url = '', platform = '';
  if (value.platform === 'YouTube' && /^[A-Za-z0-9_-]{11}$/.test(value.videoId)) {
    const id = ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname) ? u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || (u.pathname === '/watch' ? u.searchParams.get('v') : null) : u.hostname === 'youtu.be' ? u.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] : null;
    if (id === value.videoId) {platform = 'YouTube'; url = value.videoFormat === 'short-video' ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/shorts/${id}`;}
  } else if (value.platform === 'Instagram' && /^[A-Za-z0-9_-]{5,50}$/.test(value.videoId) && ['www.instagram.com', 'instagram.com'].includes(u.hostname)) {
    const id = u.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{5,50})\/?$/)?.[1]; if (id === value.videoId) {platform = 'Instagram'; url = `https://www.instagram.com/reel/${id}/`;}
  } else if (value.platform === 'TikTok' && /^\d{15,25}$/.test(value.videoId) && ['www.tiktok.com', 'tiktok.com'].includes(u.hostname)) {
    const match = u.pathname.match(/^\/@([A-Za-z0-9._]{1,30})\/video\/(\d{15,25})\/?$/); if (match?.[2] === value.videoId) {platform = 'TikTok'; url = `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;}
  }
  if (!url) return null;
  const result: Obj = {id: `${platform.toLowerCase()}-${value.videoId}`, videoId: value.videoId, platform, url, title, sourceName, source: sourceName, summary: clean(value.summary, 400), tags: labels(value.tags), parentingUseful: true, publishedAt: date(value.publishedAt), checkedAt: date(value.checkedAt), ...ageMetadata(value), ingestion: 'curated-short-video'};
  for (const key of ['reason', 'reviewReason', 'caution', 'durationLabel', 'sourceUrl']) if (typeof value[key] === 'string' && (key !== 'sourceUrl' || web(value[key]))) result[key] = clean(value[key], 500);
  if (!result.reviewReason && typeof value.usefulnessReason === 'string') result.reviewReason = clean(value.usefulnessReason, 500);
  if (platform === 'YouTube') result.thumbnailUrl = `https://i.ytimg.com/vi/${value.videoId}/hqdefault.jpg`;
  if (value.videoFormat === 'shorts' || value.videoFormat === 'short-video') result.videoFormat = value.videoFormat;
  if (typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0 && value.durationSeconds <= 3600) result.durationSeconds = value.durationSeconds;
  if (value.embedVerified === true) result.embedVerified = true;
  return result;
}
const wasApproved = (item: Obj) => item.parentingUseful === true && (item.reviewStatus === 'approved' || item.curation?.status === 'approved');
/** Merge fresh reactions with the prior editorial decision, using the canonical X status ID. */
export function applySocialCuration(document: SocialCuration, incomingTopics: Obj[], previousTopics: Obj[], previousShorts: Obj[] = [], preservePreviousShorts = false): {topics: Obj[]; shorts: Obj[]; rejectedX: number} {
  const reviews = new Map(document.reviews.map(v => [v.id, v]));
  const previous = new Map(previousTopics.map(v => [xStatusIdentity(v.url)?.id, v]).filter(([id]) => !!id) as [string, Obj][]);
  const topics: Obj[] = [], seen = new Set<string>();
  for (const raw of [...document.additionalPosts, ...incomingTopics, ...previousTopics]) {
    if (!object(raw)) continue; const identity = xStatusIdentity(raw.url); if (!identity || seen.has(identity.id)) continue;
    const prior = previous.get(identity.id), review = reviews.get(identity.id);
    if (review?.status === 'rejected') {seen.add(identity.id); continue;}
    const additional = document.additionalPosts.includes(raw) && raw.parentingUseful === true;
    if (review?.status !== 'approved' && !wasApproved(raw) && !(prior && wasApproved(prior)) && !additional) continue;
    const metadata: Obj = review?.status === 'approved' ? {tags: review.tags, ...ageMetadata(prior || {}), ...ageMetadata(review)} : prior && wasApproved(prior) ? {tags: labels(prior.tags), ...ageMetadata(prior)} : {tags: labels(raw.tags), ...ageMetadata(raw)};
    const item = normalizeCuratedXPost({...raw, ...metadata, parentingUseful: true}); if (!item) continue;
    const reason = review?.reason || clean(prior?.reviewReason || prior?.curation?.reason || raw.reviewReason || raw.reason, 500) || '子育てに役立つ実用情報として編集確認';
    const checkedAt = review?.status === 'approved' || additional ? document.checkedAt : date(prior?.curation?.checkedAt || raw.curation?.checkedAt) || document.checkedAt;
    topics.push({...item, reviewStatus: 'approved', reviewReason: reason, curation: {status: 'approved', reason, checkedAt}}); seen.add(identity.id);
  }
  const shorts: Obj[] = [], videos = new Set<string>();
  for (const raw of [...document.shorts, ...(preservePreviousShorts ? previousShorts : [])]) {const item = normalizeCuratedVideo(raw); if (item && !videos.has(item.id)) {videos.add(item.id); shorts.push(item);}}
  return {topics: topics.slice(0, 500), shorts: shorts.slice(0, 500), rejectedX: document.reviews.filter(v => v.status === 'rejected').length};
}
async function fetchCuration(fetcher: typeof fetch): Promise<SocialCuration> {
  const res = await fetcher(CURATION_URL, {headers: {Accept: 'application/json', 'User-Agent': 'KosodateBiyori/1.0 (curation reader)'}, signal: AbortSignal.timeout(7000), redirect: 'manual'});
  if (!res.ok) throw new Error('Social curation HTTP ' + res.status);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Social curation size limit');
  const reader = res.body?.getReader(); if (!reader) throw new Error('Social curation body is empty');
  const parts: Uint8Array[] = []; let bytes = 0;
  try {for (;;) {const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > MAX_BYTES) throw new Error('Social curation size limit'); parts.push(next.value);}} catch (e) {await reader.cancel().catch(() => {}); throw e;}
  const all = new Uint8Array(bytes); let at = 0; for (const part of parts) {all.set(part, at); at += part.length;}
  return validateSocialCuration(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(all)));
}
export async function refreshSocialCuration(input: {previousTopics: Obj[]; incomingTopics: Obj[]; previousShorts: Obj[]; fallback: unknown}, fetcher: typeof fetch = fetch): Promise<SocialCurationResult> {
  let document: SocialCuration, ok = true, error: string | null = null;
  try {document = await fetchCuration(fetcher);} catch (e) {ok = false; error = e instanceof Error ? e.message : 'Social curation failed'; document = validateSocialCuration(input.fallback);}
  const result = applySocialCuration(document, input.incomingTopics, input.previousTopics, input.previousShorts, !ok);
  return {ok, error, source: ok ? 'github' : 'bundled', checkedAt: document.checkedAt, reviewedX: result.topics.length, shortsCount: result.shorts.length, ...result};
}
