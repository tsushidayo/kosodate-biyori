type Item=Record<string,any>;
const text=(value:unknown)=>Array.isArray(value)?value.join('、'):typeof value==='string'?value:'';
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g,' ').trim();
/** Search the published explanation and application details, excluding IDs and source URLs. */
export function programMatchesQuery(program:Item,query:string){
 const words=normalize(query).split(' ').filter(Boolean);if(!words.length)return true;
 const fields=['title','summary','eligibility','how','amountLabel','ageNote','area','prefecture','municipality','category','programYear','deadline','deadlineNote','preparation','preparationNote','notes','caution','upcomingChange','tags'];
 const steps=Array.isArray(program.steps)?program.steps.flatMap((step:Item)=>[text(step.title),text(step.body)]):[];
 const sources=Array.isArray(program.additionalSources)?program.additionalSources.map((source:Item)=>text(source.name)):[];
 const haystack=normalize([...fields.map(field=>text(program[field])),...steps,...sources].join(' '));
 return words.every(word=>haystack.includes(word));
}
export function programScope(program:Item){
 const prefecture=text(program.prefecture).trim(),area=text(program.area).trim(),direct=text(program.municipality).trim();
 if(prefecture==='全国'||area==='全国'||program.scope==='national')return{national:true,prefecture:'全国',municipality:''};
 const inferred=direct&&!['全国','都道府県','県内全域','全域',prefecture].includes(direct)?direct:!direct&&area&&area!==prefecture&&area!=='都道府県'?area.replace(new RegExp('^'+prefecture),''):'';
 return{national:false,prefecture,municipality:inferred.startsWith(prefecture)?inferred.slice(prefecture.length):inferred};
}
export function municipalityProgramCounts(programs:Item[]){
 const counts=new Map<string,number>();for(const program of programs){const scope=programScope(program);if(scope.national)continue;const cities=new Set([scope.municipality,...(Array.isArray(program.coveredMunicipalities)?program.coveredMunicipalities:[])].filter(city=>typeof city==='string'&&city));for(const city of cities){const key=scope.prefecture+'|'+city;counts.set(key,(counts.get(key)||0)+1);}}return counts;
}
