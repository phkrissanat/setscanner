import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPortfolio,portfolioPrice} from '../pwa/portfolio.mjs';
test('Exact boundaries belong to one range, never duplicate',()=>{
 const prices=[0.01,9.99,10,49.99,50,99.99,100,149.99,150,199.99,200,1000];
 const by=Object.fromEntries(prices.map((price,i)=>['S'+i,{price}]));
 const p=groupPortfolio(Object.keys(by),by,()=>100);
 assert.deepEqual(p.groups.map(g=>g.symbols.length),[2,2,2,2,2,2]);
 assert.equal(p.groups.flatMap(g=>g.symbols).length,12);
});
test('Weight uses position value across all lots and follows latest price',()=>{
 const by={A:{price:9,currentPrice:10},B:{price:100}};
 const p=groupPortfolio(['A','B'],by,s=>s==='A'?1000:100);
 assert.equal(p.total,20000);
 assert.equal(p.groups[1].weight,50);
 assert.equal(p.groups[3].weight,50);
 by.A.currentPrice=200;
 assert.deepEqual(groupPortfolio(['A'],by,()=>100).groups[5].symbols,['A']);
});
test('Missing or invalid prices and quantities are explicit, never valued at cost',()=>{
 const p=groupPortfolio(['A','B','C','D'],{A:{price:NaN},B:{price:0},C:{price:20},D:{price:100}},s=>s==='C'?0:100);
 assert.equal(p.total,10000);
 assert.equal(p.unvalued,3);
 assert.deepEqual(p.groups.at(-1).symbols,['A','B']);
 assert.equal(p.groups[1].unvalued,1);
 assert.equal(p.groups[3].weight,100);
 assert.equal(portfolioPrice({currentPrice:Infinity,price:22}),22);
});
test('Empty holdings preserve six open groups with no invented percentages',()=>{
 const p=groupPortfolio([],{},()=>0);
 assert.equal(p.groups.length,6);
 assert.ok(p.groups.every(g=>g.weight===null));
});
