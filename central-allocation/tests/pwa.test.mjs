import test from 'node:test';
import assert from 'node:assert/strict';
import {eligible,candidates} from '../pwa/allocation.mjs';
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
