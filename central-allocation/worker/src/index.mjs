export const RULE = 'industry-ema12-26-v1';
export function ema(values, period) {
 let value = values.slice(0, period).reduce((a,b)=>a+b,0)/period;
 for(let i=period;i<values.length;i++) value += (values[i]-value)*2/(period+1);
 return value;
}
export function evaluate(feed, now=Date.now()) {
 if(feed?.schemaVersion!==1 || !Array.isArray(feed.groups) || !feed.groups.length || feed.groups.length>100) throw Error('Invalid feed schema');
 const stamp=Date.parse(feed.generatedAt);
 if(!Number.isFinite(stamp)||stamp>now+300000||now-stamp>30*3600000) throw Error('Feed timestamp invalid or stale');
 const groups={},symbols={},seen=new Set();
 for(const group of feed.groups){
  if(!/^[A-Z0-9_-]{1,24}$/.test(group.id)||Object.hasOwn(groups,group.id)||typeof group.name!=='string'||!group.name.trim()||!Array.isArray(group.symbols)||group.symbols.length>2000) throw Error('Invalid group metadata');
  for(const symbol of group.symbols){
   if(typeof symbol!=='string'||!/^[A-Z0-9&-]{1,16}$/.test(symbol)||seen.has(symbol)) throw Error('Invalid or duplicate symbol membership');
   seen.add(symbol);symbols[symbol]=group.id;
  }
  let result={name:group.name,eligible:false,status:'unavailable',reason:'invalid-bars',asOf:null};
  const bars=group.bars;
  if(Array.isArray(bars)&&bars.length>=60&&bars.length<=1000){
   let previous='',valid=true;
   for(const bar of bars){
    const date=Date.parse(bar.date+'T00:00:00+07:00');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)||!Number.isFinite(date)||new Date(date+7*3600000).toISOString().slice(0,10)!==bar.date||bar.date<=previous||bar.closed!==true||!Number.isFinite(bar.close)||bar.close<=0||date+17*3600000>now){valid=false;break}
    previous=bar.date;
   }
   if(valid){
    result.asOf=bars.at(-1).date;
    if(now-Date.parse(result.asOf+'T17:00:00+07:00')>96*3600000)result.reason='stale-bars';
    else {const values=bars.map(b=>b.close),fast=ema(values,12),slow=ema(values,26);result={...result,ema12:fast,ema26:slow,eligible:fast>slow,status:'ready',reason:fast>slow?'uptrend':'not-uptrend'}}
   }
  }
  groups[group.id]=result;
 }
 return {schemaVersion:1,ruleVersion:RULE,status:'ready',generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+30*3600000).toISOString(),sourceAsOf:feed.generatedAt,groups,symbols};
}
export async function refresh(env,now=Date.now()){
 try{
  const url=new URL(env.INDUSTRY_FEED_URL);
  if(url.protocol!=='https:')throw Error('HTTPS feed required');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  let feed;
  try{
   const response=await fetch(url,{signal:controller.signal,redirect:'error',headers:env.FEED_TOKEN?{Authorization:'Bearer '+env.FEED_TOKEN}:{}});
   if(!response.ok)throw Error('Feed HTTP '+response.status);
   if(Number(response.headers.get('content-length'))>2000000)throw Error('Feed too large');
   const reader=response.body.getReader();let size=0,parts=[];
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('Feed too large')}parts.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
   feed=JSON.parse(new TextDecoder().decode(bytes));
  }finally{clearTimeout(timer)}
  const snapshot=evaluate(feed,now);await env.ALLOCATION.put('latest',JSON.stringify(snapshot));return snapshot;
 }catch(error){
  await env.ALLOCATION.put('latest',JSON.stringify({schemaVersion:1,ruleVersion:RULE,status:'unavailable',generatedAt:new Date(now).toISOString(),reason:'refresh-failed',groups:{},symbols:{}}));
  console.error('Allocation refresh failed');throw error;
 }
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(refresh(env,event.scheduledTime))},
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(origin && origin===env.PWA_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
  if(origin && origin!==env.PWA_ORIGIN)return new Response(JSON.stringify({error:'origin-not-allowed'}),{status:403,headers});
  if(request.method!=='GET')return new Response(JSON.stringify({error:'method-not-allowed'}),{status:405,headers:{...headers,Allow:'GET'}});
  if(url.pathname!=='/allocation'&&url.pathname!=='/health')return new Response('{}',{status:404,headers});
  const snapshot=await env.ALLOCATION.get('latest','json');
  const ready=snapshot?.status==='ready'&&Date.parse(snapshot.expiresAt)>Date.now();
  if(url.pathname==='/health')return new Response(JSON.stringify({status:ready?'ready':'unavailable',generatedAt:snapshot?.generatedAt??null}),{status:ready?200:503,headers});
  return new Response(JSON.stringify(ready?snapshot:{schemaVersion:1,ruleVersion:RULE,status:'unavailable',reason:'missing-failed-or-expired',groups:{},symbols:{}}),{status:ready?200:503,headers});
 }
};
