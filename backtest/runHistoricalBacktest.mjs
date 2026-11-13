import fs from 'node:fs';
import {confirmedBuyFilter,pivotFromAppLevels} from './confirmedBuyFilter.mjs';
const ALL = 'ACMESOLAR AFCONS AMBUJACEM APOLLOTYRE ASHOKLEY AWL BEL BELRISE BHEL BIOCON BLS BPCL BSOFT CASTROLIND CESC CGPOWER CIEINDIA COALINDIA COHANCE CONCOR CROMPTON DABUR DELHIVERY DEVYANI ELECON EMAMILTD EMMVEE ENGINERSIN ETERNAL EXIDEIND FIRSTCRY GAIL GARUDA GPIL HFCL HINDPETRO HINDZINC HONASA IDEA IEX IGL INA INDUSTOWER INOXWIND IOC IRCON IRCTC IREDA ITC ITCHOTELS JAINREC JINDALSAW JKTYRE JSWCEMENT JSWENERGY JSWINFRA JUBLFOOD JWL KEC LEMONTREE MEESHO MMTC MOTHERSON MRPL NATIONALUM NCC NLCINDIA NMDC NTPC NYKAA OLAELEC ONGC PARADEEP PATANJALI PCBL PETRONET PFOCUS POWERGRID PPLPHARMA PRSMJOHNSN PWL RAILTEL REDINGTON RELIGARE RITES RPOWER RVNL SAGILITY SAIL SAPPHIRE SONATSOFTW SUNTV SUZLON SWANCORP SYNGENE TARIL TATAPOWER TATASTEEL TMCV TMPV UPL URBANCO USHAMART VBL VEDL VMM WELSPUNLIV WIPRO ZEEL ZENSARTECH'.split(' ');
const SYMBOLS=(process.env.SYMBOLS?process.env.SYMBOLS.replaceAll(',',' ').split(/\s+/):ALL).filter(Boolean);
const API='https://frontend-rouge-one-75.vercel.app/api/backtest';
const COST=0.003,AMOUNT=100000,START='2021-10-01',LAST='2026-09-30',OOS='2025-01-01';
const round=(x,n=4)=>Number(x.toFixed(n));
const qkey=d=>d.slice(0,4)+'-Q'+(Math.floor((Number(d.slice(5,7))-1)/3)+1);
const prevQ=q=>(Number(q.slice(0,4))-(q.endsWith('Q1')?1:0))+'-Q'+(q.endsWith('Q1')?4:Number(q.slice(-1))-1);
const qEnd=q=>new Date(Date.UTC(Number(q.slice(0,4)),Number(q.slice(-1))*3,0)).toISOString().slice(0,10);
const valid=b=>b&&typeof b.date==='string'&&[b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)&&b.open>0&&b.close>0&&b.low>0&&b.high>=Math.max(b.low,b.open,b.close)&&b.low<=Math.min(b.open,b.close,b.high)&&b.volume>=0&&b.complete!==false&&b.isComplete!==false;
const csv=(records,headers)=>headers.join(',')+'\n'+records.map(r=>headers.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
function stats(t){
 const n=t.length;let wins=0,gains=0,losses=0,cash=0,peak=0,dd=0;
 for(const x of [...t].sort((a,b)=>a.exitDate.localeCompare(b.exitDate))){
  if(x.netPct>0){wins++;gains+=x.netPct}else losses-=x.netPct;
  cash+=x.netPnl;peak=Math.max(peak,cash);dd=Math.max(dd,peak-cash);
 }
 const z=1.96,p=n?wins/n:0,den=n?1+z*z/n:1,center=(p+(n?z*z/(2*n):0))/den,half=n?z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den:0;
 const net=t.map(x=>x.netPct).sort((a,b)=>a-b);
 return {trades:n,wins,losses:n-wins,winRatePct:n?round(wins*100/n,2):null,winRate95WilsonPct:n?[round(100*(center-half),2),round(100*(center+half),2)]:null,avgNetReturnPct:n?round(net.reduce((s,v)=>s+v,0)/n,3):null,medianNetReturnPct:n?round(net[Math.floor((n-1)/2)],3):null,profitFactor:losses>0?round(gains/losses,3):null,netPnlForINR100kPerTrade:round(t.reduce((s,x)=>s+x.netPnl,0),2),grossGainsPct:round(gains,3),grossLossesPct:round(losses,3),maxClosedTradeSequenceDrawdownINR:round(dd,2),targetExits:t.filter(x=>x.exitReason==='TARGET').length,stopExits:t.filter(x=>x.exitReason.startsWith('STOP')).length,quarterEndExits:t.filter(x=>x.exitReason==='QUARTER_END').length};
}
function tradeSim(bars,setups,mode,symbol) {
 const levels=new Map(setups.map(s=>[s.quarter,s]));let screened=0,signals=0,skipped=0;const trades=[];
 for(let i=35;i<bars.length-1;i++) {
  const bar=bars[i];if(bar.date<START||bar.date>LAST||!valid(bar))continue;
  const q=qkey(bar.date),setup=levels.get(q),lv=setup?.levels;
  if(!lv||setup.sourceQuarter!==prevQ(q)||!Number.isFinite(lv.ppRaw)||!Number.isFinite(lv.buyPrice)||!Number.isFinite(lv.buyT1))continue;
  if(!(bar.close>lv.ppRaw&&bar.close>=lv.buyPrice))continue;
  screened++;
  const previous=bars.slice(i-20,i);if(previous.length!==20||previous.some(b=>!valid(b)))continue;
  const avgV=previous.reduce((s,b)=>s+b.volume,0)/20;
  let signalRsi=null;
  if(mode==='strict'){
   if(!(bar.volume>avgV))continue;
   const verdict=confirmedBuyFilter({bars,index:i,pivot:pivotFromAppLevels(lv,qEnd(setup.sourceQuarter)),maxCrossoverAge:3,volumeMultiplier:1});
   if(!verdict.buy)continue;
   signalRsi=verdict.metrics?.rsi14??null;
  } else if(mode==='pivotEma') {
   if(!(bar.close>bar.ema9&&bar.ema9>bar.ema21&&bar.ema9>bars[i-1].ema9&&bar.ema21>bars[i-1].ema21))continue;
  }
  signals++;
  const entry=bars[i+1],stop=lv.buyPrice,target=lv.buyT1;
  if(!valid(entry)||qkey(entry.date)!==q||!(stop<entry.open&&entry.open<target)){skipped++;continue;}
  const qty=Math.floor(AMOUNT/entry.open);if(qty<1){skipped++;continue;}
  let exitIndex=-1,exitPrice=NaN,exitReason='';
  for(let j=i+1;j<bars.length;j++){
   const b=bars[j],days=j-(i+1);if(!valid(b)||qkey(b.date)!==q)break;
   if(b.open<=stop){exitIndex=j;exitPrice=b.open;exitReason='STOP_GAP';break;}
   if(b.low<=stop){exitIndex=j;exitPrice=stop;exitReason='STOP';break;}
   // No same-day target credit, but same-day stop always applies.
   if(days>0&&b.high>=target){exitIndex=j;exitPrice=target;exitReason='TARGET';break;}
   if(days>=62||j===bars.length-1||qkey(bars[j+1].date)!==q){
    exitIndex=j;exitPrice=b.close;exitReason=days>=62?'MAX_HOLD':'QUARTER_END';break;
   }
  }
  if(exitIndex<0){skipped++;continue;}
  const gross=qty*(exitPrice-entry.open);
  const fees=qty*(entry.open+exitPrice)*COST/2;
  const net=gross-fees,netPct=100*net/(qty*entry.open);
  trades.push({symbol,mode,quarter:q,signalDate:bar.date,entryDate:entry.date,exitDate:bars[exitIndex].date,entryPrice:round(entry.open),exitPrice:round(exitPrice),stopPrice:round(stop),targetPrice:round(target),quantity:qty,holdSessions:exitIndex-i,exitReason,signalRsi14:signalRsi===null?'':round(signalRsi,3),signalVolumeRatio:round(avgV>0?bar.volume/avgV:0,3),sourceQuarter:setup.sourceQuarter,netPct:round(netPct,5),netPnl:round(net,2),fees:round(fees,2)});
  i=exitIndex; // One open trade per stock, no same-session reentry.
 }
 return {trades,screened,signals,skipped};
}
async function fetchData(symbol){
 let error;
 const url=API+'?symbol='+encodeURIComponent(symbol)+'&mode=chart&quarter=2021-Q3&endQuarter=2026-Q3';
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(65000)});
   if(!r.ok)throw Error('HTTP '+r.status+' '+(await r.text()).slice(0,120));
   const j=await r.json();
   if(!Array.isArray(j.bars)||!Array.isArray(j.setups))throw Error('Unexpected chart data');
   return j;
  }catch(e){error=String(e);if(attempt<2)await new Promise(r=>setTimeout(r,1600*(attempt+1)));}
 }
 throw Error(error);
}
async function main(){
 fs.mkdirSync('results',{recursive:true});
 const all=[],coverage=[],perSymbol=[],errors=[];
 let next=0,complete=0;
 async function worker(){
  while(next<SYMBOLS.length){
   const symbol=SYMBOLS[next++];
   try{
    const data=await fetchData(symbol);
    const bars=data.bars.filter(b=>b.date>='2021-07-01'&&b.date<=LAST).sort((a,b)=>a.date.localeCompare(b.date));
    if(bars.length<40)throw Error('Insufficient bars '+bars.length);
    coverage.push({symbol,bars:bars.length,start:bars[0].date,end:bars.at(-1).date,missingQuarters:(data.coverage||[]).filter(q=>q.status!=='AVAILABLE').map(q=>q.quarter).join('|'),invalidBars:bars.filter(x=>!valid(x)).length,source:data.source});
    for(const mode of ['strict','pivotEma']){
     const r=tradeSim(bars,data.setups,mode,symbol);
     all.push(...r.trades);perSymbol.push({symbol,mode,...stats(r.trades),screened:r.screened,signals:r.signals,skipped:r.skipped});
    }
    console.log('OK '+(++complete)+'/'+SYMBOLS.length+' '+symbol+' '+bars.length+' bars');
   }catch(e){errors.push({symbol,error:String(e)});console.log('FAIL '+(++complete)+'/'+SYMBOLS.length+' '+symbol+' '+String(e).slice(0,120));}
  }
 }
 await Promise.all(Array.from({length:4},()=>worker()));
 const performance={};
 for(const mode of ['strict','pivotEma']){
  const t=all.filter(x=>x.mode===mode);
  performance[mode]={all:stats(t),train:stats(t.filter(x=>x.signalDate<OOS)),outOfSample:stats(t.filter(x=>x.signalDate>=OOS)),signals:perSymbol.filter(x=>x.mode===mode).reduce((s,x)=>s+x.signals,0),skipped:perSymbol.filter(x=>x.mode===mode).reduce((s,x)=>s+x.skipped,0)};
 }
 const report={generatedAt:new Date().toISOString(),requested:SYMBOLS.length,covered:coverage.length,errors,source:'Vercel SwingScanner /api/backtest?mode=chart; Yahoo Finance daily OHLC as reported by backend',period:'2021-10-01 through 2026-09-30',holdout:'2025-01-01 through 2026-09-30',strategy:'RSI14 above 50 and RSI SMA14 recent cross 3 candles; Close > previous-quarter raw POC and >= app 2/8 BUY; Close > rising EMA9 > rising EMA21; volume > prior 20-day average',execution:'Next-session open, stop=BUY, target=R1 buyT1, stop-first, disallow same-day target; maximum 63 sessions or quarter end; 30bps combined round-trip fees/slippage, one 100k INR position per stock, unrestricted cross-stock concurrency',limitations:'Adjusted market prices/splits not independently verified. Symbol selection as of 2026 is survivorship biased. Calendar OOS is not untouched if strategy developed using these years. Booked-trade sequence drawdown is not portfolio drawdown. No prospective profitability guarantee.',performance,perSymbol,coverage};
 fs.writeFileSync('results/backtest-summary.json',JSON.stringify(report,null,2));
 fs.writeFileSync('results/backtest-trades.csv',csv(all,['symbol','mode','quarter','signalDate','entryDate','exitDate','entryPrice','exitPrice','stopPrice','targetPrice','quantity','holdSessions','exitReason','signalRsi14','signalVolumeRatio','sourceQuarter','netPct','netPnl','fees']));
 fs.writeFileSync('results/backtest-by-symbol.csv',csv(perSymbol,['symbol','mode','trades','wins','losses','winRatePct','avgNetReturnPct','profitFactor','netPnlForINR100kPerTrade','screened','signals','skipped']));
 fs.writeFileSync('results/backtest-coverage.csv',csv(coverage,['symbol','bars','start','end','source','invalidBars','missingQuarters']));
 console.log('FINAL '+JSON.stringify({requested:report.requested,covered:report.covered,errors:report.errors,performance:report.performance}));
}
main().catch(e=>{console.error('FATAL '+String(e));process.exitCode=1});
