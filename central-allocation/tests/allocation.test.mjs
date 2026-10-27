import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{evaluate,refresh} from '../worker/src/index.mjs';
import {eligible,candidates} from '../pwa/allocation.mjs';
const now=Date.parse('2026-10-27T12:00:00Z');
function feed(){return {schemaVersion:1,generatedAt:new Date(now).toISOString(),groups:[{id:'TEST',name:'Test only',symbols:['AAA'],bars:Array.from({length:90},(_,i)=>({date:new Date(Date.parse('2026-07-29T00:00:00Z')+i*864e5).toISOString().slice(0,10),close:100+i,closed:true}))}]}}
// Synthetic fixtures test mechanics only; they are never shipped as market inputs.
test('Uptrend passes with closed fresh bars',()=>assert.equal(evaluate(feed(),now).groups.TEST.eligible,true));
test('Downtrend fails',()=>{const f=feed();f.groups[0].bars.forEach((b,i)=>b.close=200-i);assert.equal(evaluate(f,now).groups.TEST.eligible,false)});
test('Open candle fails closed',()=>{const f=feed();f.groups[0].bars.at(-1).closed=false;assert.equal(evaluate(f,now).groups.TEST.status,'unavailable')});
test('Unsorted bars fail closed',()=>{const f=feed();f.groups[0].bars.reverse();assert.equal(evaluate(f,now).groups.TEST.eligible,false)});
test('Stale data excluded',()=>{const f=feed();f.generatedAt=new Date(now+5*864e5).toISOString();assert.equal(evaluate(f,now+5*864e5).groups.TEST.reason,'stale-bars')});
test('Stale feed rejected',()=>assert.throws(()=>evaluate(feed(),now+2*864e5)));
test('Duplicate membership rejected',()=>{const f=feed();f.groups.push({...f.groups[0],id:'OTHER'});assert.throws(()=>evaluate(f,now))});
test('Nonfinite prices excluded',()=>{const f=feed();f.groups[0].bars[5].close=Infinity;assert.equal(evaluate(f,now).groups.TEST.eligible,false)});
test('Unknown symbol fails closed',()=>assert.equal(eligible(evaluate(feed(),now),'UNKNOWN',now),false));
test('Expired snapshot fails closed',()=>assert.equal(eligible(evaluate(feed(),now),'AAA',now+31*3600e3),false));
test('Held stocks always scanned',()=>assert.deepEqual(candidates(['AAA','BBB'],['BBB','CCC'],evaluate(feed(),now),now),['AAA','BBB','CCC']));
test('No feed still scans portfolio',()=>assert.deepEqual(candidates(['AAA'],['BBB'],null,now),['BBB']));
test('Held stocks do not bypass display filter',()=>assert.equal(eligible(evaluate(feed(),now),'BBB',now),false));
test('Refresh publishes computed snapshot',async()=>{const old=globalThis.fetch;let saved;try{globalThis.fetch=async()=>Response.json(feed());await refresh({INDUSTRY_FEED_URL:'https://example.test/feed',ALLOCATION:{put:async(k,v)=>saved=JSON.parse(v)}},now);assert.equal(saved.groups.TEST.eligible,true)}finally{globalThis.fetch=old}});
test('Refresh failure invalidates old result',async()=>{let saved;await assert.rejects(()=>refresh({INDUSTRY_FEED_URL:'http://example.test/feed',ALLOCATION:{put:async(k,v)=>saved=JSON.parse(v)}},now));assert.equal(saved.status,'unavailable')});
test('Public API has no refresh write route',async()=>{const r=await worker.fetch(new Request('https://example.test/allocation',{method:'POST'}),{});assert.equal(r.status,405)});
test('Expired API response is unavailable',async()=>{const r=await worker.fetch(new Request('https://example.test/allocation'),{ALLOCATION:{get:async()=>({...evaluate(feed(),now),expiresAt:'2000-01-01'})}});assert.equal(r.status,503)});
test('Unexpected browser origin denied',async()=>{const r=await worker.fetch(new Request('https://example.test/allocation',{headers:{Origin:'https://other.test'}}),{PWA_ORIGIN:'https://pwa.test'});assert.equal(r.status,403)});
test('Scheduled handler performs refresh',async()=>{const old=globalThis.fetch;let job,saved;try{globalThis.fetch=async()=>Response.json(feed());await worker.scheduled({scheduledTime:now},{INDUSTRY_FEED_URL:'https://example.test/feed',ALLOCATION:{put:async(k,v)=>saved=JSON.parse(v)}},{waitUntil:p=>job=p});await job;assert.equal(saved.status,'ready')}finally{globalThis.fetch=old}});

import fs from 'node:fs';
import vm from 'node:vm';
test('PWA renders held excluded stock but hides both entry lists',()=>{
 const html=fs.readFileSync(new URL('../pwa/index.html',import.meta.url),'utf8');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import \{eligible, candidates\} from "\.\/allocation\.mjs";/,'');
 const nodes=new Map();const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',textContent:'',innerHTML:'',style:{},content:'',hidden:false});return nodes.get(s)};
 const ctx=vm.createContext({eligible,candidates,document:{querySelector:node,documentElement:{getAttribute:()=>null},addEventListener:()=>{}},localStorage:{getItem:()=>null},window:{},navigator:{},matchMedia:()=>({matches:false}),console});
 vm.runInContext(script,ctx);
 vm.runInContext("results=[{sym:'BLOCKED',entry:true,price:100,chg:1,chgPct:1,zone:'up',t:1},{sym:'EARLY',zone:'dn',early:{entry:90,sl:80,riskPct:10},price:90,chg:1,chgPct:1,t:1}];held=['BLOCKED'];render()",ctx);
 assert.equal(node('#out').innerHTML.includes('BLOCKED'),false);
 assert.equal(node('#out3').innerHTML.includes('EARLY'),false);
 assert.equal(node('#out2').innerHTML.includes('BLOCKED'),true);
 assert.equal(typeof ctx.window.toggleRow,'function');
});
