/** Shared age filters. Birthdays remain in the private profile; content receives no personal dates. */
export type FamilyProfile = Record<string, any>;
export type FamilyChild = {id:string;birthDate:string;months:number;label:string;ordinal:number;isPregnancy?:boolean;dueDate?:string;schoolGrade?:number};
export type AgeTargetStatus = 'matching'|'unknown'|'not-matching';
type Item=Record<string,any>;
type Now=Date|string|number;
const GROUPS=['妊娠中','0歳','1〜2歳','3〜5歳','小学生','中学生以上'] as const;

export function tokyoDate(now:Now=new Date()):string {
  const date=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(date.getTime()))throw new RangeError('Invalid current date');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const value=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function validCalendarDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function lastDay(year:number,month:number){const d=new Date(0);d.setUTCFullYear(year,month,0);return d.getUTCDate();}
/** A month anniversary is clamped to the last day of short months (Jan 31 → Feb 28). */
export function completedMonths(birthDate:string,now:Now=new Date()):number|null {
  const today=tokyoDate(now);if(!validCalendarDate(birthDate)||birthDate>today)return null;
  const [by,bm,bd]=birthDate.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
  return (ty-by)*12+tm-bm-(td<Math.min(bd,lastDay(ty,tm))?1:0);
}
/** School grade follows Japan's April school year and April 1 birthday boundary. */
export function schoolGradeForBirthday(birthDate:string,now:Now=new Date()):number|null {
 if(completedMonths(birthDate,now)===null)return null;
 const [by,bm,bd]=birthDate.split('-').map(Number),[year,month]=tokyoDate(now).split('-').map(Number);
 const entranceYear=by+(bm<4||bm===4&&bd===1?6:7);
 return Math.max(0,(year-(month<4?1:0))-entranceYear+1);
}
export function formatAge(months:number):string {
  if(months<0)return '妊娠中';
  if(months<12)return `生後${months}か月`;
  const year=Math.floor(months/12),month=months%12;return `${year}歳${month?`${month}か月`:''}`;
}
export function getAgeGroup(months:number):typeof GROUPS[number] {
  if(months<0)return '妊娠中';if(months<12)return '0歳';if(months<36)return '1〜2歳';if(months<72)return '3〜5歳';if(months<156)return '小学生';return '中学生以上';
}
/** An explicit children array is authoritative, including [], so cleared dates cannot reappear from legacy fields. */
export function getFamilyChildren(profile:FamilyProfile,now:Now=new Date()):FamilyChild[] {
  const p=profile||{};const hasChildren=Array.isArray(p.children);
  const children=hasChildren?p.children.slice(0,5):p.childDate||p.birthDate?[{id:'child-1',birthDate:p.childDate||p.birthDate}]:[];
  const seen=new Set<string>();const result:FamilyChild[]=[];
  children.forEach((value:unknown,index:number)=>{
    if(!value||typeof value!=='object')return;const child=value as Item;
    const id=typeof child.id==='string'&&child.id?child.id:`child-${index+1}`;
    if(seen.has(id))return;seen.add(id);
    if(!validCalendarDate(child.birthDate))return;
    const ordinal=/^child-[1-5]$/.test(id)?Number(id.slice(-1)):index+1;
    if(child.dateKind==='due'||child.birthDate>tokyoDate(now)){
      result.push({id,birthDate:child.birthDate,months:-1,label:'妊娠中',ordinal,isPregnancy:true,dueDate:child.birthDate});return;
    }
    const months=completedMonths(child.birthDate,now);if(months===null)return;
    result.push({id,birthDate:child.birthDate,months,label:formatAge(months),ordinal,schoolGrade:schoolGradeForBirthday(child.birthDate,now)??0});
  });
  // A due date is a separate family context, rather than another copy of a registered birthday.
  if(result.length<5&&validCalendarDate(p.dueDate)&&p.dueDate>=tokyoDate(now)&&!result.some(c=>c.isPregnancy&&c.dueDate===p.dueDate))result.push({id:'pregnancy',birthDate:'',months:-1,label:'妊娠中',ordinal:result.length+1,isPregnancy:true,dueDate:p.dueDate});
  return result;
}
export function normalizeFamilyProfile(profile:FamilyProfile={}):FamilyProfile {
  const p=profile||{};const children=Array.isArray(p.children)?p.children.map((c:Item)=>({...c})).slice(0,5):p.childDate||p.birthDate?[{id:'child-1',birthDate:p.childDate||p.birthDate}]:[];
  return {...p,children,personalize:p.personalize===true};
}
function finite(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
function range(value:unknown):{min:number;max:number}|null {
  if(!value||typeof value!=='object')return null;const item=value as Item;
  const lo=item.minAgeMonths??item.minMonth,hi=item.maxAgeMonths??item.maxMonth;
  if(!finite(lo)&&!finite(hi))return null;
  if(lo!==undefined&&lo!==null&&!finite(lo)||hi!==undefined&&hi!==null&&!finite(hi))return null;
  const min=finite(lo)?lo:-Infinity,max=finite(hi)?hi:Infinity;return min<=max?{min,max}:null;
}
function normalizedGroup(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const group=value.trim().replace(/[～~−–—-]/g,'〜');
  if(['全年齢','すべて','年齢不問'].includes(group))return '*';
  if(GROUPS.includes(group as any))return group;
  return null;
}
/** Only explicit age metadata is interpreted. Titles, summaries and free-form age notes are not eligibility rules. */
export function ageTargetStatus(item:Item,children:FamilyChild[]):AgeTargetStatus {
  if(!children.length)return 'unknown';
  if(item.allAges===true||item.ageScope==='all')return 'matching';
  const direct=range(item);
  const declared=Array.isArray(item.ageRanges)?item.ageRanges.map(range).filter((v:any):v is {min:number;max:number}=>v!==null):[];
  const ranges=declared.length?declared:direct?[direct]:[];
  const groups=Array.isArray(item.ageGroups)?item.ageGroups.map(normalizedGroup).filter((g:any):g is string=>g!==null):[];
  const hasGrade=finite(item.minSchoolGrade)||finite(item.maxSchoolGrade);
  if(!ranges.length&&!groups.length&&!hasGrade)return 'unknown';
  const base=(child:FamilyChild)=>(!ranges.length||ranges.some((r:{min:number;max:number})=>child.months>=r.min&&child.months<=r.max))&&(!groups.length||groups.includes('*')||groups.includes(getAgeGroup(child.months)));
  if(children.some(child=>base(child)&&(!hasGrade||finite(child.schoolGrade)&&(!finite(item.minSchoolGrade)||child.schoolGrade>=item.minSchoolGrade)&&(!finite(item.maxSchoolGrade)||child.schoolGrade<=item.maxSchoolGrade))))return 'matching';
  if(hasGrade&&children.some(child=>base(child)&&!finite(child.schoolGrade)))return 'unknown';
  return 'not-matching';
}
export function matchesFamilyAge(item:Item,children:FamilyChild[],includeUnknown=true):boolean {
  const status=ageTargetStatus(item,children);return status==='matching'||status==='unknown'&&includeUnknown;
}
export function personalizationEnabled(profile:FamilyProfile,now:Now=new Date()):boolean{return profile?.personalize===true&&getFamilyChildren(profile,now).length>0;}
export function personalizeItems<T extends Item>(items:T[],profile:FamilyProfile,now:Now=new Date(),includeUnknown=true):T[] {
  if(profile?.personalize!==true)return items;
  const children=getFamilyChildren(profile,now);return children.length?items.filter(item=>matchesFamilyAge(item,children,includeUnknown)):items;
}
