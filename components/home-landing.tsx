'use client';
import {ArrowRight, Baby, Bookmark, BookOpen, CalendarDays, ChevronRight, Heart, Newspaper, Search, Settings, ShoppingBag, Sun} from 'lucide-react';
type Item=Record<string,any>;
type Props={stage:Item;stages:Item[];news:Item[];go:(page:string)=>void;chooseStage:(id:string)=>void;open:(item:Item)=>void;settings:()=>void;search:(value:string)=>void;hasStage:boolean};
export default function HomeLanding({stage,stages,news,go,chooseStage,open,settings,search,hasStage}:Props){
 const ageGroups=[['prenatal','妊娠中'],['m0','0〜3か月'],['m4','4〜6か月'],['m7','7〜11か月'],['y1','1〜2歳'],['y3','3歳〜小学生']];
 function age(id:string,index:number){const match=stages.find(s=>s.id===id)||stages.find(s=>s.minMonth>=[-9,0,4,7,12,36][index]);if(match)chooseStage(match.id);go('age')}
 const menus=[{id:'age',icon:Baby,title:'月齢・年齢から',tone:'rose'},{id:'shop',icon:ShoppingBag,title:'価格を比べる',tone:'butter'},{id:'support',icon:CalendarDays,title:'お金・手続き',tone:'mint'},{id:'guide',icon:BookOpen,title:'お世話の基本',tone:'peach'},{id:'read',icon:Newspaper,title:'ニュース・コラム',tone:'lavender'},{id:'saved',icon:Bookmark,title:'保存した記事',tone:'blue'}];
 return <div className="landing">
  <section className="landing-hero" aria-labelledby="home-title">
   <div className="landing-hero-copy"><span className="hero-label"><Sun size={18}/>妊娠中から、小学生まで</span><h1 id="home-title">出産準備も、<br/>毎日の子育ても。</h1><p>いま知りたいことが、すぐ見つかる。</p><button className="primary" onClick={()=>go('age')}>月齢・年齢から探す<ArrowRight size={20}/></button></div>
   <div className="landing-hero-photo"><img src="/photos/family.jpg" alt="赤ちゃんと顔を合わせて遊ぶ親子" fetchPriority="high"/><span className="photo-flower flower-one" aria-hidden="true">✳</span><span className="photo-flower flower-two" aria-hidden="true">✳</span><div className="hero-photo-caption"><Heart size={16}/>こそだて日和</div></div>
  </section>
  <nav className="purpose-nav" aria-label="目的から探す">{menus.map(m=><button key={m.id} onClick={()=>go(m.id)} className={'purpose-item '+m.tone}><span className="purpose-icon"><m.icon size={30} strokeWidth={1.7}/></span><span>{m.title}</span><ChevronRight size={15}/></button>)}</nav>
  <section className="age-section" aria-labelledby="age-section-title"><div className="section-head"><div><span className="section-caption">成長に合わせて</span><h2 id="age-section-title">うちの子の、いま。</h2></div><button className="text-link" onClick={()=>go('age')}>月齢別ガイド<ArrowRight size={18}/></button></div>
   <div className="age-links">{ageGroups.map(([id,label],k)=><button key={id} onClick={()=>age(id,k)}><span className={'age-illustration age-step-'+k}>{k===0?<Heart/>:k<4?<Baby/>:k===4?<Sun/>:<BookOpen/>}<i aria-hidden="true"/></span><strong>{label}</strong><ChevronRight size={17}/></button>)}</div>
   <div className="my-age-strip"><div><Baby size={23}/><span>{hasStage?'選んでいる月齢':'お子さまの月齢を登録できます'}{hasStage&&<strong>{stage?.label}</strong>}</span></div><button onClick={settings}>{hasStage?'変更する':'予定日・誕生日を登録'}<Settings size={16}/></button></div>
  </section>
  <section className="home-features" aria-label="買い物とお世話">
   <div className="shopping-feature"><span className="section-caption">いつもの買い物を、少しお得に</span><h2>買う前に、<br/>価格をチェック。</h2><div className="feature-products" aria-hidden="true"><img src="/products/haihai-810.jpg" alt=""/><img src="/products/merries-premium-m46.jpg" alt=""/><img src="/products/bottle-bonyu-glass240.jpg" alt=""/></div><p>ミルク・おむつ・ベビー用品</p><button className="feature-link" onClick={()=>go('shop')}>お店ごとの価格を見る<ArrowRight size={21}/></button></div>
   <button className="care-feature" onClick={()=>go('guide')}><div className="care-feature-photo"><img src="/photos/baby.jpg" alt="寝具の上で過ごす赤ちゃん" loading="lazy"/></div><div className="care-feature-copy"><span className="section-caption">はじめてのお世話に</span><h2>これ、どうする？<br/>をひとつずつ。</h2><span className="care-topics">ミルク・おむつ・寝かしつけ</span><span className="feature-link">お世話の基本を見る<ArrowRight size={21}/></span></div></button>
  </section>
  <section className="home-search-words"><span>気になる言葉から</span><div>{['離乳食','ミルク','おむつ','児童手当','入学'].map(t=><button key={t} onClick={()=>search(t)}><Search size={15}/>{t}</button>)}</div></section>
  <section className="home-journal" aria-labelledby="home-journal-title"><div className="section-head"><div><span className="section-caption">子育ての気になる話題</span><h2 id="home-journal-title">新着ニュース</h2></div><button className="text-link" onClick={()=>go('read')}>一覧を見る<ArrowRight size={18}/></button></div><div className="news-lines">{[...news].sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))).slice(0,3).map((item,k)=><button key={item.id||k} onClick={()=>open(item)}><time>{String(item.publishedAt||'').slice(0,10).replaceAll('-','.')}</time><span className="news-type">ニュース</span><strong>{item.title}</strong><ArrowRight size={19}/></button>)}</div></section>
 </div>
}
