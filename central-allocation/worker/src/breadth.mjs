export const RULE='industry-breadth-ema12-26-v1';
const PROXY='https://set-proxy.phkrissanath.workers.dev/?url=';
const DATA='https://raw.githubusercontent.com/lumduan/thai-securities-data/main/';
const MAX_AGE=96*3600000;
const GROUPS={
 AGRO:['Agro & Food Industry','Agribusiness','Food & Beverage'],
 CONSUMP:['Consumer Products','Fashion','Home & Office Products','Personal Products & Pharmaceuticals'],
 FINCIAL:['Financials','Banking','Finance & Securities','Insurance'],
 INDUS:['Industrials','Automotive','Industrial Materials & Machinery','Paper & Printing Materials','Petrochemicals & Chemicals','Packaging','Steel and Metal Products'],
 PROPCON:['Property & Construction','Construction Materials','Construction Services','Property Development','Property Fund & REITs'],
 RESOURC:['Resources','Energy & Utilities','Mining'],
 SERVICE:['Services','Commerce','Health Care Services','Media & Publishing','Professional Services','Tourism & Leisure','Transportation & Logistics'],
 TECH:['Technology','Electronic Components','Information & Communication Technology']
};
const sectorGroup=Object.fromEntries(Object.entries(GROUPS).flatMap(([id,[,...sectors]])=>sectors.map(s=>[s,id])));
const day=ms=>new Date(ms+7*3600000).toISOString().slice(0,10);
const closeTime=d=>Date.parse(d+'T17:00:00+07:00');
export function ema(a,n){let p=a.slice(0,n).reduce((x,y)=>x+y,0)/n;for(let i=n;i<a.length;i++)p+=(a[i]-p)*2/(n+1);return p}
export function assessChart(j,sym,now=Date.now()){
 const r=j?.chart?.result?.[0],c=r?.indicators?.quote?.[0]?.close;
 if(j?.chart?.error||r?.meta?.symbol!==sym+'.BK'||r.meta.currency!=='THB'||!Array.isArray(r.timestamp)||!Array.isArray(c)||c.length!==r.timestamp.length||c.length>400)throw Error('invalid-chart');
 const values=[];let previous=0,asOf=null;
 for(let i=0;i<c.length;i++){
  const t=r.timestamp[i];if(!Number.isFinite(t)||t<=previous)throw Error('unordered-bars');previous=t;
  const date=day(t*1000);if(closeTime(date)>now||c[i]===null)continue;
  if(!Number.isFinite(c[i])||c[i]<=0)throw Error('invalid-price');values.push(c[i]);asOf=date;
 }
 if(values.length<60||now-closeTime(asOf)>MAX_AGE)throw Error('insufficient-or-stale-bars');
 return {sym,status:'ready',asOf,up:ema(values,12)>ema(values,26)};
}
export function makeUniverse(tv,rows,metadata,now=Date.now()){
 const updated=String(metadata?.last_updated||'');
 const stamp=Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(updated)?updated:updated+'Z');
 if(!Number.isFinite(stamp)||stamp>now+300000||now-stamp>7*86400000)throw Error('stale-membership');
 if(!Array.isArray(rows)||rows.length<500||rows.length>3000||!Array.isArray(tv?.data))throw Error('invalid-input');
 const universe=[...new Set(tv.data.map(x=>x?.d?.[0]))].sort();
 if(universe.length<45||universe.length>55||universe.some(s=>typeof s!=='string'||!/^[A-Z0-9&-]{1,16}$/.test(s)))throw Error('invalid-set50');
 const found=new Map();
 for(const r of rows){if(r.market!=='SET'||!universe.includes(r.symbol))continue;if(found.has(r.symbol))throw Error('duplicate-membership');found.set(r.symbol,r.sector)}
 const symbols={};for(const s of universe){const sector=found.get(s),g=Object.hasOwn(sectorGroup,sector)?sectorGroup[sector]:null;if(!g)throw Error('unknown-membership:'+s);symbols[s]=g}
 return {universe,symbols,membershipAsOf:new Date(stamp).toISOString(),source:'SET50 list: TradingView via existing proxy; membership: lumduan/thai-securities-data (SET-derived); daily prices: Yahoo via existing proxy'};
}
export function summarize(run,chunks,now=Date.now()){
 if(!run||chunks.length!==6||chunks.some(x=>!x||x.runId!==run.runId||!Array.isArray(x.records)))throw Error('incomplete-run');
 const records=chunks.flatMap(x=>x.records);
 if(records.length!==run.universe.length||new Set(records.map(x=>x.sym)).size!==records.length||records.some(x=>!run.universe.includes(x.sym)))throw Error('invalid-batch');
 const asOf=records.filter(x=>x.status==='ready').map(x=>x.asOf).sort().at(-1);
 if(!asOf||closeTime(asOf)>now||now-closeTime(asOf)>MAX_AGE)throw Error('no-fresh-bars');
 const groups={};
 for(const id of Object.keys(GROUPS)){
  const members=run.universe.filter(s=>run.symbols[s]===id);if(!members.length)continue;
  const valid=records.filter(x=>members.includes(x.sym)&&x.status==='ready'&&x.asOf===asOf),up=valid.filter(x=>x.up).length,total=members.length,coverage=valid.length/total;
  const ready=total>=3&&coverage>=0.8;
  groups[id]={name:GROUPS[id][0],status:ready?'ready':'unavailable',eligible:ready&&up/total>=0.6,asOf,total,valid:valid.length,up,breadthPct:Math.round(up/total*10000)/100,coveragePct:Math.round(coverage*10000)/100,reason:total<3?'small-group':coverage<0.8?'insufficient-coverage':up/total>=0.6?'breadth-uptrend':'breadth-below-threshold'};
 }
 return {schemaVersion:1,ruleVersion:RULE,status:'ready',method:'tracked-universe-breadth',label:'ความแข็งแกร่งของกลุ่มในหุ้นที่ติดตาม (SET50)',generatedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+72*3600000,closeTime(asOf)+MAX_AGE)).toISOString(),asOf,membershipAsOf:run.membershipAsOf,universe:run.universe,source:run.source,groups,symbols:run.symbols};
}
async function json(url,options={}){
 const ac=new AbortController(),to=setTimeout(()=>ac.abort(),15000);
 try{const r=await fetch(url,{...options,signal:ac.signal,redirect:'manual'});if(!r.ok)throw Error('upstream-http-'+r.status);const t=await r.text();if(t.length>1000000)throw Error('response-too-large');return JSON.parse(t)}finally{clearTimeout(to)}
}
const unavailable=(reason,now)=>({schemaVersion:1,ruleVersion:RULE,status:'unavailable',reason,generatedAt:new Date(now).toISOString(),groups:{},symbols:{}});
export function runSlot(ms){const d=new Date(ms),m=d.getUTCMinutes(),h=d.getUTCHours();if(![11,13].includes(h)||m<30||m>35)throw Error('outside-schedule');return {runId:day(ms)+':'+h,batch:m-30}}
export async function refreshBatch(env,scheduledTime,now=Date.now(),adminSlot=null){
 const {runId,batch}=adminSlot||runSlot(scheduledTime),prefix='run:'+runId+':';
 try{
  let run;
  if(batch===0){
   await env.ALLOCATION.put('latest',JSON.stringify(unavailable('updating',now)));
   const [tv,rows,metadata]=await Promise.all([
    json(PROXY+encodeURIComponent('https://scanner.tradingview.com/thailand/scan'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbols:{symbolset:['SYML:SET;SET50']},columns:['name'],range:[0,100]})}),
    json(DATA+'thai_securities_compact_en.json'),json(DATA+'metadata_en.json')]);
   run={...makeUniverse(tv,rows,metadata,now),runId,startedAt:now};
   await env.ALLOCATION.put(prefix+'meta',JSON.stringify(run),{expirationTtl:86400});
  }else run=await env.ALLOCATION.get(prefix+'meta','json');
  if(!run||run.runId!==runId||now-run.startedAt>30*60000||now<run.startedAt)throw Error('missing-run');
  const queue=run.universe.slice(batch*10,(batch+1)*10),records=[];
  const job=async()=>{while(queue.length){const sym=queue.shift();try{const j=await json(PROXY+encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(sym)+'.BK?range=6mo&interval=1d'));records.push(assessChart(j,sym,now))}catch{records.push({sym,status:'unavailable'})}}};
  await Promise.all([job(),job(),job()]);
  await env.ALLOCATION.put(prefix+batch,JSON.stringify({runId,records}),{expirationTtl:86400});
  if(batch===5){const chunks=await Promise.all(Array.from({length:6},(_,i)=>env.ALLOCATION.get(prefix+i,'json')));const snapshot=summarize(run,chunks,now);await env.ALLOCATION.put('latest',JSON.stringify(snapshot));return snapshot}
  return {status:'batch-complete',runId,batch,count:records.length};
 }catch(e){await env.ALLOCATION.put('latest',JSON.stringify(unavailable('scan-incomplete',now)));console.error('Allocation batch failed',batch,e.message);throw e}
}
// Quick Edit's admin-only "Trigger scheduled event" uses the current time.
// Let administrators verify the same validated fetch path one batch per click.
// No HTTP route can trigger writes or supply market results.
export async function handleSchedule(event,env,now=Date.now()){
 if(event.cron==='30-35 11,13 * * 1-5')return refreshBatch(env,event.scheduledTime,now);
 const prior=await env.ALLOCATION.get('admin:cursor','json');
 const resume=prior&&prior.next<6&&now-prior.startedAt>=0&&now-prior.startedAt<30*60000;
 const cursor=resume?prior:{runId:'admin:'+now,next:0,startedAt:now};
 const result=await refreshBatch(env,event.scheduledTime,now,{runId:cursor.runId,batch:cursor.next});
 await env.ALLOCATION.put('admin:cursor',JSON.stringify({...cursor,next:cursor.next+1}),{expirationTtl:3600});
 console.log('Allocation validated batch',cursor.next,result.status);
 return result;
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(handleSchedule(event,env))},
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin'),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin'};
  if(origin===env.PWA_ORIGIN)headers['Access-Control-Allow-Origin']=origin;
  if(origin&&origin!==env.PWA_ORIGIN)return new Response('{"error":"origin-not-allowed"}',{status:403,headers});
  if(request.method!=='GET')return new Response('{}',{status:405,headers:{...headers,Allow:'GET'}});
  if(!['/allocation','/health'].includes(url.pathname))return new Response('{}',{status:404,headers});
  const s=await env.ALLOCATION.get('latest','json'),ready=s?.ruleVersion===RULE&&s.status==='ready'&&Date.parse(s.expiresAt)>Date.now();
  const body=url.pathname==='/health'?{status:ready?'ready':'unavailable',ruleVersion:RULE,generatedAt:s?.generatedAt??null,asOf:s?.asOf??null}:ready?s:unavailable(s?.reason||'missing-or-expired',Date.now());
  return new Response(JSON.stringify(body),{status:ready?200:503,headers});
 }
};
