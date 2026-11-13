/** Strict, completed-candle-only confirmation layer for historical swing backtests.
 * Run at end of candle t, execute no earlier than candle t+1.
 * Supply pivot levels calculated from the PREVIOUS completed reference period.
 */
export function confirmedBuyFilter({bars, index, pivot, maxCrossoverAge = 3, volumeMultiplier = 1}) {
  const reasons = [];
  if (!Array.isArray(bars) || index < 35 || index >= bars.length || !pivot || !Number.isFinite(pivot.poc) || !Number.isFinite(pivot.buy)) {
    return {signal:'WAIT',buy:false,reasons:['INSUFFICIENT_HISTORY_OR_PIVOT']};
  }
  const closes=bars.slice(0,index+1).map(b=>Number(b.close));
  const ema = period => {const k=2/(period+1);let v=closes.slice(0,period).reduce((a,b)=>a+b,0)/period;let arr=Array(closes.length).fill(null);arr[period-1]=v;for(let i=period;i<closes.length;i++)arr[i]=v=k*closes[i]+(1-k)*v;return arr};
  const ema9=ema(9),ema21=ema(21);
  const rsi=Array(closes.length).fill(null);let gain=0,loss=0;
  for(let i=1;i<=14;i++){let d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d)}
  gain/=14;loss/=14;
  const calc=(g,l)=>l===0?(g===0?50:100):100-100/(1+g/l);
  rsi[14]=calc(gain,loss);
  for(let i=15;i<closes.length;i++){let d=closes[i]-closes[i-1];gain=(gain*13+Math.max(0,d))/14;loss=(loss*13+Math.max(0,-d))/14;rsi[i]=calc(gain,loss)}
  const sma14 = i => i>=27?rsi.slice(i-13,i+1).reduce((s,v)=>s+v,0)/14:null;
  const current=bars[index],close=closes[index];
  const rsiBull=rsi[index]>50 && rsi[index]>sma14(index);
  if(!rsiBull)reasons.push('RSI_NOT_BULLISH');
  const emaBull=close>ema9[index] && ema9[index]>ema21[index] && ema9[index]>ema9[index-1] && ema21[index]>ema21[index-1];
  if(!emaBull)reasons.push('EMA_NOT_BULLISH');
  const pivotBull=close>pivot.poc && close>=pivot.buy;
  if(!pivotBull)reasons.push('PIVOT_NOT_CONFIRMED');
  const avgVol=bars.slice(index-20,index).reduce((s,b)=>s+Number(b.volume),0)/20;
  if(!(Number(current.volume)>avgVol*volumeMultiplier))reasons.push('VOLUME_NOT_CONFIRMED');
  let lastCross=-1;
  for(let j=Math.max(28,index-maxCrossoverAge);j<=index;j++)if(rsi[j-1]<=sma14(j-1)&&rsi[j]>sma14(j))lastCross=j;
  if(lastCross<0)reasons.push('NO_RECENT_RSI_CROSSOVER');
  const buy=reasons.length===0;
  return {buy,signal:buy?'BUY':(close<pivot.poc||ema9[index]<ema21[index]?'AVOID':'WAIT'),reasons,observedDate:current.date??null,earliestEntryIndex:index+1,metrics:{rsi14:rsi[index],rsiSma14:sma14(index),ema9:ema9[index],ema21:ema21[index],poc:pivot.poc,buyLevel:pivot.buy,averageVolume20:avgVol}};
}
