'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, ExternalLink, Film, MessageCircle, Newspaper, Play, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { ageTargetStatus, type FamilyChild } from '../lib/age-personalization';
import './editorial-browser.css';
import { splitSocialMedia } from '../lib/social-curation';
import { EDITORIAL_TOPICS, editorialTopics, editorialSearchText, isPracticalEditorial, practicalVideoPriority } from '../lib/editorial-quality';

type Item = Record<string, any>;
type Editorial = { news: Item[]; columns: Item[]; topics: Item[]; shorts?: Item[]; instagram?: Item[] };
type Tab = 'news' | 'columns' | 'topics' | 'instagram' | 'shorts';
type Props = { editorial: Editorial; onOpen: (item: Item) => void; onSave: (item: Item) => void; savedIds: string[]; familyChildren?: FamilyChild[]; familyEnabled?: boolean; includeUnknownAges?: boolean };
type TwitterWidgets = { createTweet: (id: string, target: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLElement | undefined> };
type TwitterWindow = Window & { twttr?: { widgets?: TwitterWidgets; ready?: (callback: (api: { widgets: TwitterWidgets }) => void) => void } };

function InstagramIcon({size=20,strokeWidth=1.8}:{size?:number;strokeWidth?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>;
}

const TABS: { key: Tab; label: string; icon: typeof Newspaper | typeof InstagramIcon }[] = [
  { key: 'news', label: 'ニュース', icon: Newspaper }, { key: 'columns', label: 'コラム', icon: Sparkles },
  { key: 'topics', label: 'Xの投稿', icon: MessageCircle }, { key: 'instagram', label: 'Instagram', icon: InstagramIcon }, { key: 'shorts', label: 'ショート動画', icon: Film },
];
const AGE_OPTIONS = [ ['all', '全年齢'], ['pregnancy', '妊娠中'], ['0', '0歳'], ['1', '1歳'], ['2', '2歳'], ['3', '3歳'], ['4', '4歳'], ['5', '5歳'], ['primary', '小学生'], ['teen', '中学生以上'] ];
const PAGE_SIZE = 12;

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function itemId(item: Item): string { return text(item.id) || text(item.url) || text(item.title); }
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Invalid source links are not rendered. */ }
}
function tagsOf(item: Item): string[] {
  const values = Array.isArray(item.tags) ? item.tags : Array.isArray(item.labels) ? item.labels : [item.category];
  return [...new Set(values.filter((v: unknown): v is string => typeof v === 'string' && !!v.trim()).map((v: string) => v.trim()))];
}
function sourceOf(item: Item): string { return text(item.sourceName) || text(item.source) || text(item.authorName) || text(item.author) || text(item.platform) || '情報元'; }
function dateOf(item: Item): string { return text(item.publishedAt) || text(item.publishedDate) || text(item.sourceUpdatedAt) || text(item.date); }
function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '';
}
function durationOf(item: Item): string {
  const seconds = item.durationSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 1) return '';
  const whole = Math.floor(seconds), minutes = Math.floor(whole / 60), remainder = whole % 60;
  return minutes ? `${minutes}分${remainder ? `${remainder}秒` : ''}` : `${whole}秒`;
}
function tweetId(item: Item): string | undefined {
  const url = safeUrl(item.url || item.sourceUrl);
  if (url) {
    const parsed = new URL(url);
    if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(parsed.hostname.toLowerCase())) {
      const match = /^\/(?:[A-Za-z0-9_]{1,15}|i\/web|i)\/status\/(\d{10,25})(?:\/|$)/.exec(parsed.pathname);
      if (match) return match[1];
    }
  }
  const explicit = text(item.tweetId) || text(item.postId);
  return /^\d{10,25}$/.test(explicit) ? explicit : undefined;
}

/** A native Instagram permalink is the only input accepted by the embed frame. */
export function editorialInstagramEmbed(item: Item): { src: string; url: string } | null {
  const source = safeUrl(item.url);
  if (!source) return null;
  const parsed = new URL(source);
  if (parsed.protocol !== 'https:' || parsed.port || !['instagram.com', 'www.instagram.com'].includes(parsed.hostname.toLowerCase())) return null;
  const match = /^\/(p|reel)\/([A-Za-z0-9_-]{5,50})\/?$/.exec(parsed.pathname);
  if (!match || (text(item.shortcode) && text(item.shortcode) !== match[2]) || (text(item.videoId) && text(item.videoId) !== match[2])) return null;
  const url = `https://www.instagram.com/${match[1]}/${match[2]}/`;
  return { src: `${url}embed/captioned/`, url };
}
function videoFormatLabel(item: Item): string {
  if (item.videoFormat === 'shorts') return '縦型ショート';
  if (item.videoFormat === 'short-video') return '短い解説動画';
  if (item.videoFormat === 'instagram-video' || text(item.platform).toLowerCase() === 'instagram') return 'Instagram動画';
  return '動画';
}

/** Embed URLs are created from recognized public IDs, never from profile data or supplied HTML. */
export function editorialVideoEmbed(item: Item): { src: string; platform: string } | null {
  const platform = text(item.platform).toLowerCase();
  const source = safeUrl(item.url || item.sourceUrl);
  let parsed: URL | undefined;
  if (source) parsed = new URL(source);
  const host = parsed?.hostname.toLowerCase();
  const youtubeHost = host && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host);
  if (platform === 'youtube' || platform === 'youtube shorts' || youtubeHost) {
    let id = text(item.videoId);
    if (!id && parsed && youtubeHost) id = host?.endsWith('youtu.be') ? parsed.pathname.split('/')[1] : /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(parsed.pathname)?.[1] || (parsed.pathname === '/watch' ? parsed.searchParams.get('v') || '' : '');
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`, platform: 'YouTube' };
  }
  const instagram = editorialInstagramEmbed(item);
  if (instagram) return { src: instagram.src, platform: 'Instagram' };
  const tiktokHost = host && ['tiktok.com', 'www.tiktok.com'].includes(host);
  if (platform === 'tiktok' || tiktokHost) {
    let id = text(item.videoId);
    if (!id && parsed && tiktokHost) id = /^\/@[^/]+\/video\/(\d{10,25})(?:\/|$)/.exec(parsed.pathname)?.[1] || '';
    if (/^\d{10,25}$/.test(id)) return { src: `https://www.tiktok.com/player/v1/${id}?autoplay=0&controls=1&loop=0`, platform: 'TikTok' };
  }
  return null;
}

let twitterScriptPromise: Promise<TwitterWidgets> | undefined;
function loadTwitterWidgets(): Promise<TwitterWidgets> {
  const win = window as TwitterWindow;
  if (win.twttr?.widgets) return Promise.resolve(win.twttr.widgets);
  if (twitterScriptPromise) return twitterScriptPromise;
  twitterScriptPromise = new Promise<TwitterWidgets>((resolve, reject) => {
    let finished = false;
    const finish = (widgets?: TwitterWidgets) => {
      if (finished) return;
      if (!widgets) return;
      finished = true; window.clearTimeout(timeout); resolve(widgets);
    };
    const fail = () => { if (!finished) { finished = true; window.clearTimeout(timeout); document.querySelector('script[data-kb-x-widgets]')?.remove(); reject(new Error('X embed unavailable')); } };
    const timeout = window.setTimeout(fail, 15000);
    const ready = () => {
      if (win.twttr?.widgets) finish(win.twttr.widgets);
      else win.twttr?.ready?.(api => finish(api.widgets));
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-kb-x-widgets]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://platform.x.com/widgets.js'; script.async = true;
      script.dataset.kbXWidgets = 'true';
      script.addEventListener('load', ready, { once: true });
      script.addEventListener('error', fail, { once: true });
      document.head.appendChild(script);
    } else { script.addEventListener('load', ready, { once: true }); ready(); }
  }).catch(error => { twitterScriptPromise = undefined; throw error; });
  return twitterScriptPromise;
}

function OfficialPost({ item }: { item: Item }) {
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'waiting' | 'loading' | 'ready' | 'unavailable'>('waiting');
  const id = tweetId(item);
  useEffect(() => {
    const node = holder.current;
    if (!node || !id) { setStatus('unavailable'); return; }
    let cancelled = false;
    let started = false;
    let timer: number | undefined;
    const start = () => {
      if (started) return;
      started = true; setStatus('loading');
      timer = window.setTimeout(() => { if (!cancelled) setStatus('unavailable'); }, 22000);
      loadTwitterWidgets().then(widgets => {
        if (cancelled) return;
        return widgets.createTweet(id, node, { lang: 'ja', theme: 'light', dnt: true, align: 'center' });
      }).then(embed => { if (!cancelled) { window.clearTimeout(timer); setStatus(embed ? 'ready' : 'unavailable'); } }).catch(() => { if (!cancelled) { window.clearTimeout(timer); setStatus('unavailable'); } });
    };
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { start(); observer?.disconnect(); } }, { rootMargin: '300px' }) : null;
    if (observer) observer.observe(node); else start();
    return () => { cancelled = true; observer?.disconnect(); window.clearTimeout(timer); node.replaceChildren(); };
  }, [id]);
  return <div className="kb-editorial-post">
    <div ref={holder} className="kb-editorial-post-embed" />
    {status !== 'ready' && <div className={`kb-editorial-post-status ${status === 'unavailable' ? 'is-unavailable' : ''}`} aria-live="polite">
      <span className="kb-editorial-x-symbol" aria-hidden="true">𝕏</span>
      <p>{status === 'unavailable' ? '投稿を読み込めませんでした。元の投稿からご覧ください。' : 'Xの投稿を読み込んでいます…'}</p>
    </div>}
  </div>;
}

function OfficialInstagram({ item, autoLoad = false }: { item: Item; autoLoad?: boolean }) {
  const [active, setActive] = useState(autoLoad);
  const [failed, setFailed] = useState(false);
  const embed = editorialInstagramEmbed(item);
  const title = text(item.title) || 'Instagramの子育て投稿';
  const image = safeUrl(item.thumbnail || item.thumbnailUrl || item.image);
  useEffect(() => { setActive(autoLoad); setFailed(false); }, [embed?.url, autoLoad]);
  return <div className={`kb-editorial-instagram ${active && !failed ? 'is-active' : ''}`}>
    {active && embed && !failed ? <iframe src={embed.src} title={`${title}（Instagram公式埋め込み）`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} /> : <button type="button" className="kb-editorial-instagram-cover" onClick={() => embed && setActive(true)} disabled={!embed || failed} aria-label={`${title}のInstagram投稿を表示`}>
      {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="kb-editorial-instagram-symbol"><InstagramIcon size={34} strokeWidth={1.5} aria-hidden="true" /></span>
      <span>{!embed || failed ? '投稿は元のリンクからご覧ください' : 'Instagramの投稿を表示'}</span>
      {(!embed || failed) && <small>公開範囲などにより表示できない場合があります</small>}
    </button>}
  </div>;
}

function ShortPlayer({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  const embed = editorialVideoEmbed(item);
  const image = safeUrl(item.thumbnail || item.thumbnailUrl || item.image);
  const title = text(item.title) || '子育てのショート動画';
  useEffect(() => setFailed(false), [embed?.src]);
  if (embed?.platform === 'Instagram') return <OfficialInstagram item={item} autoLoad />;
  return <div className={`kb-editorial-video ${item.videoFormat === 'short-video' ? 'is-landscape' : ''}`}>
    {embed && !failed ? <iframe src={embed.src} title={`${title}（${embed.platform}）`} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} /> : <a className="kb-editorial-video-cover" href={safeUrl(item.url)||undefined} target="_blank" rel="noopener noreferrer" aria-label={`${title}を元のサイトで見る`}>
      {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="kb-editorial-video-grain" />
      <span className="kb-editorial-video-platform">{embed?.platform || text(item.platform) || '動画'}</span>
      <span className="kb-editorial-play"><Play fill="currentColor" size={23} aria-hidden="true" /></span>
      <span className="kb-editorial-video-caption">元の動画から見る</span>
    </a>}
  </div>;
}

function ageChildren(value: string, month: string): FamilyChild[] {
  let months: number[] = [];
  if (value === 'pregnancy') months = [-1];
  else if (value === 'primary') months = Array.from({ length: 84 }, (_, i) => i + 72);
  else if (value === 'teen') months = Array.from({ length: 84 }, (_, i) => i + 156);
  else if (/^[0-5]$/.test(value)) months = month !== 'all' && Number(value) <= 2 ? [Number(value) * 12 + Number(month)] : Array.from({ length: 12 }, (_, i) => Number(value) * 12 + i);
  return months.map((age, index) => ({ id: `age-filter-${index}`, birthDate: '', months: age, label: '', ordinal: 1 }));
}
function matchesAge(item: Item, children: FamilyChild[], unknown: boolean): boolean {
  const status = ageTargetStatus(item, children);
  return status === 'matching' || status === 'unknown' && unknown;
}
function Tags({ item, selected, toggle }: { item: Item; selected: string[]; toggle: (tag: string) => void }) {
  return <div className="kb-editorial-item-tags">{tagsOf(item).map(tag => <button key={tag} type="button" className={selected.includes(tag) ? 'is-active' : ''} aria-pressed={selected.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>)}</div>;
}
function Save({ item, saved, onSave }: { item: Item; saved: boolean; onSave: (item: Item) => void }) {
  return <button type="button" className={`kb-editorial-save ${saved ? 'is-saved' : ''}`} aria-label={saved ? '保存を解除' : 'あとで読むために保存'} aria-pressed={saved} onClick={() => onSave(item)}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /><span>{saved ? '保存済み' : '保存'}</span></button>;
}

export default function EditorialBrowser({ editorial, onOpen, onSave, savedIds, familyChildren = [], familyEnabled = false, includeUnknownAges = true }: Props) {
  const uid = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState<Tab>('news');
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('all');
  const [age, setAge] = useState('all');
  const [month, setMonth] = useState('all');
  const [videoFormat, setVideoFormat] = useState('all');
  const [unknown, setUnknown] = useState(includeUnknownAges);
  const [tags, setTags] = useState<string[]>([]);
  const [topic,setTopic]=useState('すべて');
  const [prefecture,setPrefecture]=useState('all');
  const [operator, setOperator] = useState<'or' | 'and'>('or');
  const [tagSearch, setTagSearch] = useState('');
  const [allTags, setAllTags] = useState(false);
  const [page, setPage] = useState(1);
  const familyOn = familyEnabled && familyChildren.length > 0;
  const familyAgeKey = familyChildren.map(child => `${child.id}:${child.months}:${child.schoolGrade ?? ''}`).join('|');
  useEffect(() => setUnknown(includeUnknownAges), [includeUnknownAges]);

  const collections = useMemo(() => ({
    news: (Array.isArray(editorial.news) ? editorial.news : []).filter(isPracticalEditorial), columns: (Array.isArray(editorial.columns) ? editorial.columns : []).filter(isPracticalEditorial),
    topics: (Array.isArray(editorial.topics) ? editorial.topics : []).filter(item => ['x', 'twitter'].includes(text(item.platform).toLowerCase()) && (item.parentingRelevant === true || item.parentingUseful === true)),
    ...splitSocialMedia(Array.isArray(editorial.instagram)?editorial.instagram:[],Array.isArray(editorial.shorts)?editorial.shorts:[]),
  }), [editorial]);
  const localAges = useMemo(() => ageChildren(age, month), [age, month]);
  const currentItems = collections[tab];
  const socialTab = tab === 'topics' || tab === 'instagram';
  const socialView = socialTab || tab === 'shorts';
  const ageItems = useMemo(() => currentItems.filter(item => (!familyOn || matchesAge(item, familyChildren, unknown)) && (!localAges.length || matchesAge(item, localAges, unknown))), [currentItems, familyOn, familyChildren, unknown, localAges]);
  const prefectures=useMemo(()=>[...new Set(ageItems.map(item=>text(item.prefecture)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[ageItems]);
  const sources = useMemo(() => [...new Set(ageItems.map(sourceOf))].sort((a, b) => a.localeCompare(b, 'ja')), [ageItems]);
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    ageItems.forEach(item => tagsOf(item).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
    tags.forEach(tag => { if (!counts.has(tag)) counts.set(tag, 0); });
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  }, [ageItems, tags]);
  const visibleTags = availableTags.filter(([tag]) => !tagSearch || tag.toLocaleLowerCase('ja').includes(tagSearch.toLocaleLowerCase('ja'))).filter((entry, index) => allTags || !!tagSearch || index < 14 || tags.includes(entry[0]));
  const results = useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase('ja');
    return ageItems.filter(item => {
      if (source !== 'all' && sourceOf(item) !== source) return false;
      if(topic!=='すべて'&&!editorialTopics(item).includes(topic))return false;
      if(prefecture!=='all'&&text(item.prefecture)!==prefecture)return false;
      if (tab === 'shorts' && videoFormat !== 'all' && item.videoFormat !== videoFormat) return false;
      const itemTags = tagsOf(item);
      if (tags.length && !(operator === 'and' ? tags.every(tag => itemTags.includes(tag)) : tags.some(tag => itemTags.includes(tag)))) return false;
      if (needle && !editorialSearchText(item).includes(needle)) return false;
      return true;
    }).sort((a,b)=>(tab==='shorts'?practicalVideoPriority(b)-practicalVideoPriority(a):tab==='news'?Number(!!b.expiresAt&&Date.parse(b.expiresAt)>Date.now())-Number(!!a.expiresAt&&Date.parse(a.expiresAt)>Date.now()):0)||dateOf(b).localeCompare(dateOf(a)));
  }, [ageItems, source, tags, operator, keyword, tab, videoFormat,topic,prefecture]);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const shown = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filterCount = Number(topic!=='すべて')+Number(prefecture!=='all')+tags.length + Number(!!keyword.trim()) + Number(source !== 'all') + Number(age !== 'all') + Number(tab === 'shorts' && videoFormat !== 'all');
  useEffect(() => setPage(1), [tab, keyword, source, age, month, unknown, tags, operator, familyOn, familyAgeKey, videoFormat,topic,prefecture]);
  const changeTab = (value: Tab) => { setTab(value); setSource('all'); setTags([]); setTagSearch(''); setAllTags(false);setTopic('すべて');setPrefecture('all'); };
  const toggleTag = (tag: string) => setTags(prev => prev.includes(tag) ? prev.filter(value => value !== tag) : [...prev, tag]);
  const clear = () => {setTopic('すべて');setPrefecture('all'); setKeyword(''); setSource('all'); setAge('all'); setMonth('all'); setVideoFormat('all'); setTags([]); setTagSearch(''); setOperator('or'); setUnknown(includeUnknownAges); };
  const changePage = (next: number) => { setPage(next); listRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); changeTab(TABS[next].key); tabRefs.current[next]?.focus();
  };

  return <section className="kb-editorial" aria-labelledby={`${uid}-title`}>
    <header className="kb-editorial-heading"><div><span className="kb-editorial-eyebrow">READ & WATCH</span><h2 id={`${uid}-title`}>今日の子育てに、<br className="kb-editorial-mobile-break" />ひとつのヒント。</h2><p>知っておきたいニュースから、暮らしの工夫まで。</p></div><span className="kb-editorial-heading-mark" aria-hidden="true"><Sparkles size={34} strokeWidth={1.5} /></span></header>
    <div className="kb-editorial-tabs" role="tablist" aria-label="読む・見る情報の種類">{TABS.map(({ key, label, icon: Icon }, index) => <button key={key} ref={node => { tabRefs.current[index] = node; }} id={`${uid}-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${uid}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => changeTab(key)} onKeyDown={event => tabKey(event, index)}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span><small>{collections[key].length}</small></button>)}</div>
    <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
      {tab==='instagram'&&<p className="kb-editorial-format-note">カルーセル・写真の投稿を掲載しています。Instagramの動画はショート動画へ。</p>}
      {socialView && <p className="kb-editorial-social-note"><MessageCircle size={17} aria-hidden="true" /><span>投稿者の体験・意見を含みます。内容の正確さは確認できていません。</span></p>}
      <div className="kb-editorial-quick-topics" role="group" aria-label="テーマから探す">{['すべて',...EDITORIAL_TOPICS].map(value=><button key={value} type="button" aria-pressed={topic===value} onClick={()=>setTopic(value)}>{value}</button>)}</div>
      <div className="kb-editorial-filters">
        <div className="kb-editorial-filter-heading"><span><SlidersHorizontal size={16} aria-hidden="true" />気になる情報を探す</span>{filterCount > 0 && <button type="button" onClick={clear}><X size={14} aria-hidden="true" />条件をクリア</button>}</div>
        <div className="kb-editorial-filter-row">
          <label className="kb-editorial-keyword"><span className="kb-editorial-label">キーワード</span><span className="kb-editorial-input-wrap"><Search size={18} aria-hidden="true" /><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="離乳食、保育園、給付金など" type="search" /></span></label>
          <label><span className="kb-editorial-label">情報元</span><span className="kb-editorial-select-wrap"><select value={source} onChange={event => setSource(event.target.value)}><option value="all">すべての情報元</option>{sources.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></span></label>
          <label><span className="kb-editorial-label">{familyOn ? '追加で年齢を絞る' : '子どもの年齢'}</span><span className="kb-editorial-select-wrap"><select value={age} onChange={event => { setAge(event.target.value); setMonth('all'); }}>{AGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{familyOn && value === 'all' ? '追加で絞らない' : label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></span></label>
          {prefectures.length>0&&<label><span className="kb-editorial-label">地域</span><span className="kb-editorial-select-wrap"><select value={prefecture} onChange={event=>setPrefecture(event.target.value)}><option value="all">全国の情報</option>{prefectures.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15}/></span></label>}
          {['0', '1', '2'].includes(age) && <label className="kb-editorial-month"><span className="kb-editorial-label">月齢</span><span className="kb-editorial-select-wrap"><select value={month} onChange={event => setMonth(event.target.value)}><option value="all">月齢指定なし</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{age === '0' ? `生後${index}か月` : `${age}歳${index}か月`}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></span></label>}
          {tab === 'shorts' && <label><span className="kb-editorial-label">動画の種類</span><span className="kb-editorial-select-wrap"><select value={videoFormat} onChange={event => setVideoFormat(event.target.value)}><option value="all">すべての動画</option><option value="shorts">縦型ショート</option><option value="short-video">短い解説動画</option><option value="instagram-video">Instagram動画</option></select><ChevronDown size={15} aria-hidden="true" /></span></label>}
        </div>
        {(familyOn || age !== 'all') && <div className="kb-editorial-age-note">{familyOn && <span><Check size={14} aria-hidden="true" />登録したお子さんの年齢で表示中</span>}<label><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />対象年齢の記載がない情報も含める</label></div>}
        <div className="kb-editorial-tag-tools"><span className="kb-editorial-label">内容のラベル <small>複数選べます</small></span><fieldset className="kb-editorial-operator"><legend className="kb-editorial-sr">ラベルの絞り込み条件</legend><label className={operator === 'or' ? 'is-active' : ''}><input type="radio" name={`${uid}-operator`} value="or" checked={operator === 'or'} onChange={() => setOperator('or')} />いずれか</label><label className={operator === 'and' ? 'is-active' : ''}><input type="radio" name={`${uid}-operator`} value="and" checked={operator === 'and'} onChange={() => setOperator('and')} />すべて含む</label></fieldset></div>
        {allTags && <label className="kb-editorial-tag-search"><Search size={15} aria-hidden="true" /><input aria-label="ラベルを探す" value={tagSearch} onChange={event => setTagSearch(event.target.value)} placeholder="ラベル名で探す" type="search" /></label>}
        <div className="kb-editorial-tags">{visibleTags.map(([tag, count]) => <button key={tag} type="button" aria-pressed={tags.includes(tag)} className={tags.includes(tag) ? 'is-active' : ''} onClick={() => toggleTag(tag)}>{tags.includes(tag) && <Check size={13} aria-hidden="true" />}{tag}<small>{count}</small></button>)}{!availableTags.length && <span className="kb-editorial-tag-empty">掲載時に付けられたラベルから探せます。</span>}</div>
        {availableTags.length > 14 && <button type="button" className="kb-editorial-more-tags" aria-expanded={allTags} onClick={() => { setAllTags(!allTags); setTagSearch(''); }}>{allTags ? 'ラベルを閉じる' : `ラベルをすべて見る（${availableTags.length}）`}<ChevronDown size={14} className={allTags ? 'is-open' : ''} aria-hidden="true" /></button>}
      </div>
      <div ref={listRef} className="kb-editorial-results-heading"><p><strong>{results.length}</strong><span>件</span>{results.length > 0 && <small>{(currentPage - 1) * PAGE_SIZE + 1}〜{Math.min(currentPage * PAGE_SIZE, results.length)}件を表示</small>}</p><span>{tab==='shorts'?'使い方・学びの動画を優先':socialView?'子育てに役立つ投稿を掲載':'公開日・更新日をもとに表示'}</span></div>
      {shown.length > 0 ? <div className={`kb-editorial-grid kb-editorial-grid-${tab}`}>{shown.map(item => {
        const id = itemId(item); const url = safeUrl(item.url || item.sourceUrl); const saved = savedIds.includes(id); const published = displayDate(dateOf(item));
        const image = safeUrl(item.image || item.imageUrl || item.thumbnail || item.thumbnailUrl);
        return <article key={id} className={`kb-editorial-card kb-editorial-card-${tab} ${tab === 'shorts' && item.videoFormat === 'short-video' ? 'kb-editorial-card-landscape' : ''} ${tab === 'shorts' && text(item.platform).toLowerCase() === 'instagram' ? 'kb-editorial-card-instagram-video' : ''}`}>
          {tab === 'shorts' ? <ShortPlayer item={item} /> : tab === 'topics' ? <OfficialPost item={item} /> : tab === 'instagram' ? <OfficialInstagram item={item} /> : image ? <button className="kb-editorial-article-image" type="button" onClick={() => onOpen(item)} tabIndex={-1} aria-hidden="true"><img src={image} alt="" loading="lazy" /></button> : <div className="kb-editorial-article-kicker"><span>{text(item.kind) || (tab === 'news' ? 'NEWS' : 'COLUMN')}</span><span aria-hidden="true">{tab === 'news' ? <ArrowRight size={21}/> : <Sparkles size={21}/>}</span></div>}
          <div className="kb-editorial-card-body">
            <div className="kb-editorial-card-meta"><span title={sourceOf(item)}>{sourceOf(item)}</span>{published ? <time dateTime={dateOf(item)}>{published}{!item.publishedAt&&item.sourceUpdatedAt?' 更新':tab === 'shorts' || tab === 'instagram' ? ' 公開' : ''}</time> : socialView && <span>公開日未確認</span>}</div>
            {tab === 'shorts' && <p className="kb-editorial-video-info"><span>{videoFormatLabel(item)}</span><span>{durationOf(item) || '長さ未確認'}</span></p>}
            {text(item.prefecture)&&<span className="kb-editorial-area">{text(item.prefecture)} {text(item.municipality)}</span>}
            {tab !== 'topics' && <h3>{tab === 'shorts' || tab === 'instagram' ? text(item.title) : <button type="button" onClick={() => onOpen(item)}>{text(item.title)}</button>}</h3>}
            {tab !== 'topics' && text(item.summary) && <p className="kb-editorial-summary">{text(item.summary)}</p>}
            {!socialView&&Array.isArray(item.practicalPoints)&&item.practicalPoints[0]&&<p className="kb-editorial-takeaway">{String(item.practicalPoints[0])}</p>}
            {socialView && <span className="kb-editorial-unverified">内容未確認</span>}
            <Tags item={item} selected={tags} toggle={toggleTag} />
            <div className="kb-editorial-card-footer"><Save item={item} saved={saved} onSave={onSave} />{socialView ? url && <a href={url} target="_blank" rel="noopener noreferrer">{socialTab ? '元の投稿' : '元の動画'}<ExternalLink size={13} aria-hidden="true" /></a> : <button className="kb-editorial-read" type="button" onClick={() => onOpen(item)}>読む<ArrowRight size={16} aria-hidden="true" /></button>}</div>
            {(tab === 'shorts' || tab === 'instagram') && <p className="kb-editorial-playback-note">{tab === 'instagram' ? '表示できないときは「元の投稿」からご覧ください。' : '再生できないときは「元の動画」からご覧ください。'}</p>}
          </div>
        </article>;
      })}</div> : <div className="kb-editorial-empty"><Search size={30} strokeWidth={1.4} aria-hidden="true" /><h3>条件に合う情報はありませんでした</h3><p>{socialView ? '子育てに関連する投稿を、順に追加しています。' : 'ラベルや年齢の条件を少し広げてみてください。'}</p><button type="button" onClick={clear}>絞り込みをクリア<ArrowRight size={16} aria-hidden="true" /></button></div>}
      {pages > 1 && <nav className="kb-editorial-pagination" aria-label="記事のページ"><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)} aria-label="前のページ"><ArrowLeft size={17} aria-hidden="true" /><span>前へ</span></button><p><strong>{currentPage}</strong><span>/ {pages}</span></p><button type="button" disabled={currentPage === pages} onClick={() => changePage(currentPage + 1)} aria-label="次のページ"><span>次へ</span><ArrowRight size={17} aria-hidden="true" /></button></nav>}
    </div>
  </section>;
}
