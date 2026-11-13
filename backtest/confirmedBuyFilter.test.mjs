import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedBuyFilter} from './confirmedBuyFilter.mjs';
const closes=Array.from({length:90},(_,i)=>100+i*0.32+Math.sin(i*0.52)*2.9);
const bars=closes.map((close,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:close-0.3,high:close+1,low:close-1,close,volume:100+i*5}));
const pivot={poc:90,buy:91};
test('reject missing pivot or insufficient history',()=>{
 assert.equal(confirmedBuyFilter({bars,index:10,pivot}).signal,'WAIT');
 assert.equal(confirmedBuyFilter({bars,index:50,pivot:null}).buy,false);
});
test('no future leakage',()=>{
 const index=60,baseline=confirmedBuyFilter({bars,index,pivot});
 const changed=bars.map((b,j)=>j>index?{...b,close:1e6,volume:1e9}:b);
 assert.deepEqual(confirmedBuyFilter({bars:changed,index,pivot}),baseline);
});
test('reject pivot mismatch',()=>{
 const r=confirmedBuyFilter({bars,index:70,pivot:{poc:1e6,buy:1e6+6}});
 assert.equal(r.buy,false);assert.ok(r.reasons.includes('PIVOT_NOT_CONFIRMED'));
});
test('next day entry only',()=>{
 assert.equal(confirmedBuyFilter({bars,index:65,pivot}).earliestEntryIndex,66);
});
test('bullish confirmation can trigger BUY',()=>{
 const result=bars.map((_,index)=>index>=35?confirmedBuyFilter({bars,index,pivot}):null).find(x=>x?.buy);
 assert.ok(result);assert.equal(result.signal,'BUY');assert.ok(result.metrics.rsi14>50);assert.ok(result.metrics.ema9>result.metrics.ema21);
});