import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{RULE,assessChart,makeUniverse,summarize,refreshBatch,runSlot,handleSchedule} from '../worker/src/breadth.mjs';
import {eligible,candidates} from '../pwa/allocation.mjs';
const now=Date.parse('2026-10-28T12:00:00Z');
function chart(sym='AAA',up=true){return {chart:{result:[{meta:{symbol:sym+'.BK',currency:'THB'},timestamp:Array.from({length:90},(_,i)=>(Date.parse('2026-07-30T03:00:00Z')+i*864e5)/1000),indicators:{quote:[{close:Array.from({length:90},(_,i)=>up?100+i:200-i)}]}}]}}}
function fixture(total=5,up=3,valid=5){const universe=Array.from({length:total},(_,i)=>'A'+i),run={runId:'test',universe,symbols:Object.fromEntries(universe.map(s=>[s,'TECH'])),membershipAsOf:new Date(now).toISOString(),source:'synthetic test only'};const chunks=Array.from({length:6},()=>({runId:'test',records:[]}));chunks[0].records=universe.map((sym,i)=>({sym,status:i<valid?'ready':'unavailable',asOf:'2026-10-27',up:i<up}));return {run,chunks}}
test('Closed daily uptrend assessed',()=>assert.equal(assessChart(chart(),'AAA',now).up,true));
test('Closed daily downtrend assessed',()=>assert.equal(assessChart(chart('AAA',false),'AAA',now).up,false));
test('Wrong symbol rejected',()=>assert.throws(()=>assessChart(chart('BAD'),'AAA',now)));
test('Open candle excluded',()=>{const j=chart();j.chart.result[0].timestamp.push(Date.parse('2026-10-28T03:00:00Z')/1000);j.chart.result[0].indicators.quote[0].close.push(10000);assert.equal(assessChart(j,'AAA',Date.parse('2026-10-28T09:00:00Z')).asOf,'2026-10-27')});
test('Stale bars rejected',()=>assert.throws(()=>assessChart(chart(),'AAA',now+5*864e5)));
test('Out of order timestamps rejected',()=>{const j=chart();j.chart.result[0].timestamp.reverse();assert.throws(()=>assessChart(j,'AAA',now))});
test('60% threshold inclusive',()=>{const f=fixture();assert.equal(summarize(f.run,f.chunks,now).groups.TECH.eligible,true)});
test('Below threshold excluded',()=>{const f=fixture(5,2);assert.equal(summarize(f.run,f.chunks,now).groups.TECH.eligible,false)});
test('Missing data stays in denominator',()=>{const f=fixture(5,2,4);const g=summarize(f.run,f.chunks,now).groups.TECH;assert.equal(g.breadthPct,40);assert.equal(g.coveragePct,80)});
test('Less than 80% coverage blocks group',()=>{const f=fixture(5,3,3);assert.equal(summarize(f.run,f.chunks,now).groups.TECH.status,'unavailable')});
test('Groups under 3 members blocked',()=>{const f=fixture(2,2,2);assert.equal(summarize(f.run,f.chunks,now).groups.TECH.reason,'small-group')});
test('Mismatched bar dates lower coverage',()=>{const f=fixture();f.chunks[0].records[1].asOf='2026-10-26';f.chunks[0].records[2].asOf='2026-10-26';assert.equal(summarize(f.run,f.chunks,now).groups.TECH.status,'unavailable')});
test('Missing chunk cannot publish',()=>{const f=fixture();f.chunks[3]=null;assert.throws(()=>summarize(f.run,f.chunks,now))});
test('Chunks from another run rejected',()=>{const f=fixture();f.chunks[2].runId='old';assert.throws(()=>summarize(f.run,f.chunks,now))});
test('Held stocks scan regardless of filter',()=>assert.deepEqual(candidates(['AAA'],['HELD'],null,now),['HELD']));
test('Snapshot and group must be fresh',()=>{const f=fixture();const s=summarize(f.run,f.chunks,now);assert.equal(eligible(s,'A0',now),true);assert.equal(eligible(s,'A0',now+5*864e5),false)});
test('Future dated group blocked',()=>{const f=fixture();const s=summarize(f.run,f.chunks,now);s.groups.TECH.asOf='2099-01-01';assert.equal(eligible(s,'A0',now),false)});
test('Schedule splits into six batches',()=>{for(let i=0;i<6;i++)assert.equal(runSlot(Date.parse('2026-10-28T11:'+String(30+i)+':00Z')).batch,i);assert.throws(()=>runSlot(Date.parse('2026-10-28T11:36:00Z')))});
const universeInput=()=>{const symbols=Array.from({length:50},(_,i)=>'X'+i);return {tv:{data:symbols.map(s=>({d:[s]}))},rows:[...symbols.map(symbol=>({symbol,market:'SET',sector:'Banking'})),...Array.from({length:500},(_,i)=>({symbol:'OTHER'+i,market:'mai'}))],metadata:{last_updated:'2026-10-28T00:00:00'}}};
test('Universe has verified group for each symbol',()=>{const f=universeInput();assert.equal(makeUniverse(f.tv,f.rows,f.metadata,now).symbols.X1,'FINCIAL')});
test('Unknown mapping stops run',()=>{const f=universeInput();f.rows[0].sector='unknown';assert.throws(()=>makeUniverse(f.tv,f.rows,f.metadata,now))});
test('Old classification stops run',()=>{const f=universeInput();f.metadata.last_updated='2020-01-01';assert.throws(()=>makeUniverse(f.tv,f.rows,f.metadata,now))});
test('Failure invalidates prior snapshot',async()=>{const map=new Map([['latest',{status:'ready'}]]),env={ALLOCATION:{get:async k=>map.get(k),put:async(k,v)=>map.set(k,JSON.parse(v))}};await assert.rejects(()=>refreshBatch(env,Date.parse('2026-10-28T11:31:00Z'),now));assert.equal(map.get('latest').status,'unavailable')});
test('Read API has no public write route',async()=>assert.equal((await worker.fetch(new Request('https://test/allocation',{method:'POST'}),{})).status,405));
test('Health serves current rule only',async()=>{const f=fixture(),s=summarize(f.run,f.chunks,Date.now());const r=await worker.fetch(new Request('https://test/health'),{ALLOCATION:{get:async()=>s}});assert.equal((await r.json()).ruleVersion,RULE)});
test('Admin schedule calls fetch and validates six batches before publishing',async()=>{
 const f=universeInput(),map=new Map(),env={ALLOCATION:{put:async(k,v)=>map.set(k,JSON.parse(v)),get:async k=>map.get(k)??null}},old=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async url=>{calls++;const target=String(url);if(target.endsWith('metadata_en.json'))return Response.json(f.metadata);if(target.endsWith('compact_en.json'))return Response.json(f.rows);const upstream=new URL(target).searchParams.get('url');if(upstream.includes('tradingview'))return Response.json(f.tv);const symbol=decodeURIComponent(upstream.split('/chart/')[1].split('.BK')[0]);return Response.json(chart(symbol))};
 try{for(let i=0;i<6;i++){await handleSchedule({scheduledTime:now,cron:''},env,now+i*60000);if(i<5)assert.notEqual(map.get('latest').status,'ready')}assert.equal(calls,53);assert.equal(map.get('latest').ruleVersion,RULE);assert.equal(map.get('latest').status,'ready');assert.equal(map.get('admin:cursor').next,6)}finally{globalThis.fetch=old}
});
