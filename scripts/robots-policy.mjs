/** Public-page access rules: RFC 9309 groups, wildcards and longest matching rule. */
const normalize=value=>String(value).replace(/[^\x00-\x7F]/gu,char=>encodeURIComponent(char)).replace(/%([\da-f]{2})/gi,(all,hex)=>{const char=String.fromCharCode(parseInt(hex,16));return /[A-Za-z0-9._~-]/.test(char)?char:'%'+hex.toUpperCase();});
export function robotsAllows(text,path,productToken='KosodateBiyori'){
 const groups=[];let group=null,hasRules=false;
 for(const raw of String(text).split(/\r?\n/)){
  const line=raw.split('#')[0].trim(),colon=line.indexOf(':');if(colon<0)continue;
  const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
  if(key==='user-agent'){
   if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}
   group.agents.push(value.toLowerCase());
  }else if(group&&(key==='allow'||key==='disallow')){hasRules=true;if(value)group.rules.push({allow:key==='allow',pattern:normalize(value)});}
 }
 const token=productToken.toLowerCase();
 const exact=groups.filter(g=>g.agents.includes(token));
 const selected=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
 const target=normalize(path);let winner=null;
 for(const {rules} of selected)for(const rule of rules){
  const anchored=rule.pattern.endsWith('$'),pattern=anchored?rule.pattern.slice(0,-1):rule.pattern;
  const expression='^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(anchored?'$':'');
  if(!new RegExp(expression).test(target))continue;
  const length=new TextEncoder().encode(rule.pattern).length;
  if(!winner||length>winner.length||(length===winner.length&&rule.allow))winner={allow:rule.allow,length};
 }
 return winner?.allow??true;
}
