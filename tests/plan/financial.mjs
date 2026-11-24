import assert from 'node:assert/strict';
import {groupFinancialOhlc,planFinancialChart,financialFamilies,financialParameterKeys} from '../../dist/financial.js';
import {planChart} from '../../dist/plan.js';
import {financialIndicators} from '../../dist/plan/financial-indicators.js';
import {movingAverage,weightedAverage,meanAbsoluteDeviation,regression} from '../../dist/plan/financial-statistics.js';

assert.deepEqual(movingAverage([1,2,3,4,5],3),[null,null,2,3,4]);
assert.deepEqual(movingAverage([1,2,3,4,5],3,'exponential'),[null,null,2,3,4]);
assert.deepEqual(movingAverage([1,2,null,3,4,5],3),[null,null,null,null,null,4]);
assert.equal(weightedAverage([1,2,3],3)[2],14/6);
assert(Math.abs(meanAbsoluteDeviation([1,2,3],3)[2]-2/3)<1e-12);
assert.deepEqual(regression([5,7,11,17],3,[0,1,3,6]).slope,[null,null,2,2]);
const source=Array.from({length:256},(_,i)=>{const middle=100+i*.1+Math.sin(i/6)*8,open=middle+Math.sin(i)*.7,close=middle+Math.cos(i)*.7;return {id:'p:'+i,x:i*2+(i%5===0?.5:0),open,high:Math.max(open,close)+1,low:Math.min(open,close)-1,close,volume:1000+i*3,title:'F'+i};});
const axes={x:{type:'linear'},y:{type:'linear'}};

const days = 86_400_000;
const observations = [
  {id:'a', x:0, open:10, high:12, low:9, close:11, volume:2},
  {id:'b', x:60_000, open:11, high:14, low:10, close:13, volume:3},
  {id:'c', x:days, open:null, high:null, low:null, close:null},
  {id:'d', x:2*days, open:20, high:20, low:20, close:20, volume:0},
];
const daily = groupFinancialOhlc(observations, 'day');
assert.deepEqual(daily[0], {point:{id:'bucket:0',x:0,open:10,high:14,low:9,close:13,volume:5},sourceIds:['a','b']});
assert.equal(daily[1].point.close,null);
assert.equal(daily[2].point.volume,0);
assert.equal(groupFinancialOhlc(observations,'week').length,1);
assert.equal(groupFinancialOhlc(observations,'month').length,1);
assert.throws(()=>groupFinancialOhlc([observations[1],observations[0]],'day'),RangeError);

const prices = [1, 3, 9, 21, 40].map((price,i)=>({id:String(i),x:i,open:price,high:price,low:price,close:price,volume:1}));
assert.deepEqual(financialIndicators('vwap',prices,{window:'blocks',period:2}).components.vwap,[1,2,9,15,40]);
assert.deepEqual(financialIndicators('vwap',prices,{period:2}).components.vwap,[null,2,6,15,30.5]);
assert.deepEqual(financialIndicators('dpo',prices,{period:2,alignment:'trailing'}).components.dpo,[null,null,null,19,34]);
const irregular = [0,1,8].map((x,i)=>({...prices[i],x,open:2*i+1,high:2*i+1,low:2*i+1,close:2*i+1}));
assert.deepEqual(financialIndicators('trendline',irregular,{regressionBasis:'session'}).components.trendline,[1,3,5]);
const atrPrior = financialIndicators('atr',prices,{period:3,atrSeed:'prior-ranges'}).components.atr;
assert.deepEqual(atrPrior.slice(0,3),[null,null,1]);
assert.ok(Math.abs(atrPrior[3] - 14/3) < 1e-12);
assert.equal(financialIndicators('natr',prices,{period:3,atrSeed:'prior-ranges'}).components.natr[2],100/9);
const quotes = prices.map(p=>({...p,high:p.close+1,low:p.close-1}));
const klinger = financialIndicators('klinger',quotes,{shortPeriod:2,longPeriod:3,signalPeriod:2,forceStart:'first-change',signalAverage:'simple'}).components;
assert.deepEqual(klinger.oscillator.slice(0,3),[null,null,null]);
assert.ok(Math.abs(klinger.signal[4] - (klinger.oscillator[3]+klinger.oscillator[4])/2) < 1e-12);
const directional = financialIndicators('dmi',quotes,{period:2,directionalIndex:'dx'}).components;
assert.deepEqual(directional.dx,[null,null,100,100,100]);
assert.ok(directional.plus[2] > 0);
assert.equal(directional.minus[2],0);
const accumulating = prices.map((p,i)=>({...p,high:p.close+1,low:p.close-3,volume:i+1}));
const chaikin = financialIndicators('chaikin',accumulating,{warmup:1,shortPeriod:1,longPeriod:2}).components.chaikin;
assert.deepEqual(chaikin.slice(0,3),[null,null,0.75]);
const rangeSwings = financialIndicators('zigzag',quotes,{threshold:10,swingSource:'high-low'}).components.zigzag;
assert.ok(rangeSwings.some(value=>value!==null));
const flat = quotes.map(p=>({...p,open:0,high:0,low:0,close:0}));
assert.ok(financialIndicators('zigzag',flat,{threshold:1,swingSource:'high-low'}).components.zigzag.every(value=>value===null));
const gappedQuotes = [...quotes.slice(0,3),{...quotes[3],open:null,high:null,low:null,close:null},...quotes.slice(4)];
assert.deepEqual(financialIndicators('psar',gappedQuotes,{sarInitialization:'two-sessions'}).components.psar.slice(3),[null,null]);
assert.ok(rangeSwings.every((value,i)=>value===null||value===quotes[i].high||value===quotes[i].low));
const sar = financialIndicators('psar',quotes,{sarInitialization:'two-sessions'}).components.psar;
assert.deepEqual(sar.slice(0,3),[null,null,0]);
const pivots = financialIndicators('pivotpoints',quotes,{period:2,pivotPlacement:'window-close'}).components.pivot;
assert.deepEqual(pivots.map((value,i)=>value===null?null:i),[null,null,2,null,4]);
const cloud = financialIndicators('ikh',quotes,{period:2,shortPeriod:1,longPeriod:3,cloudAlignment:'completed-session'});
assert.deepEqual(cloud.shifts,{spanA:1,spanB:1,lagging:-1});
assert.equal(cloud.components.conversion.at(-1),null);
const projectedCloud = planFinancialChart({
  family:'ikh', title:'Cloud', axes, series:[{id:'asset',name:'Asset',data:source}],
  parameters:{cloudAlignment:'completed-session'},
},{width:900,height:420});
assert.equal(projectedCloud.status,'ok');
const {plot, displayed} = projectedCloud.frame.viewport;
const [minimum,maximum] = displayed.y;
const cloudLine = projectedCloud.frame.series[0].parts.find(part=>part.key==='spanA').commands;
const marksByX = new Map(cloudLine.map(command=>[command.x,command.y]));
const observedCloud = projectedCloud.frame.observations.find(point=>marksByX.has(point.x));
assert.ok(observedCloud);
const renderedSpan = maximum-(marksByX.get(observedCloud.x)-plot.y)*(maximum-minimum)/plot.height;
assert.ok(Math.abs(observedCloud.financial.components.spanA-renderedSpan)<1e-10);
assert.equal(projectedCloud.frame.observations[0].financial.components.spanA,null);
assert.equal(observedCloud.financial.close,source.find(point=>point.x===observedCloud.xValue).close);
const receipts=[];
for(const family of financialFamilies)for(const variant of ['basic','zero','gaps']){
  const data=source.map((p,i)=>variant==='zero'?{...p,open:0,high:0,low:0,close:0,volume:0}:variant==='gaps'&&i%80===20?{...p,open:null,high:null,low:null,close:null}:p),spec={family,title:family,axes,series:[{id:'asset',name:'Asset',data}]},before=JSON.stringify(spec),result=planFinancialChart(spec,{width:900,height:420});
  assert.notEqual(result.status,'invalid',family+'/'+variant+': '+JSON.stringify(result));
  assert.equal(JSON.stringify(spec),before,'Immutable source');
  if(variant==='basic')assert(result.frame.observations.length>0,family+' must produce real observations');
  for(const o of result.frame.observations)assert(Number.isFinite(o.x)&&Number.isFinite(o.y)&&Number.isFinite(o.value),family+' finite');
  for(const s of result.frame.series)for(const b of [...s.bars??[],...s.parts?.flatMap(p=>p.bars??[])??[]])assert(b.width>=0&&b.height>=0);
  assert.equal(planChart(spec,{width:900,height:420}).status,result.status,'Public dispatch');
  receipts.push({family,variant,observations:result.frame.observations.length});
}
const increasing=source.map((p,i)=>({...p,x:i,open:i+1,high:i+2,low:i,close:i+1}));
assert.equal(financialIndicators('rsi',increasing,{period:14}).components.rsi.at(-1),100);
assert.equal(financialIndicators('linearregressionslope',increasing,{period:14}).components.linearregressionslope.at(-1),1);
const pricedGap=[10,20,null,30,40].map((value,i)=>({id:'v'+i,x:i,open:value,high:value,low:value,close:value,volume:1}));
assert.deepEqual(financialIndicators('vwap',pricedGap).components.vwap,[10,15,null,30,35],'A price gap resets the cumulative numerator and denominator together');
assert.deepEqual(financialIndicators('vwap',pricedGap,{period:2}).components.vwap,[null,15,null,null,35]);
const candle=planFinancialChart({family:'candlestick',title:'Original',axes,series:[{id:'a',name:'A',data:source.slice(0,5)}]},{width:640,height:360});assert.equal(candle.status,'ok');assert.equal(candle.frame.series[0].bars.length,5);assert.equal(candle.frame.observations[0].financial.close,source[0].close);
const bad=planFinancialChart({family:'ohlc',title:'Invalid',axes,series:[{id:'a',name:'A',data:[{...source[0],high:0}]}]},{width:640,height:360});assert.equal(bad.status,'invalid');
assert(!financialParameterKeys.ohlc.includes('period'));
const momentum=planFinancialChart({family:'ao',title:'Positive oscillator',axes,series:[{id:'a',name:'A',data:increasing}]},{width:640,height:360});
assert.equal(momentum.status,'ok');assert(momentum.frame.viewport.displayed.y[0]<=0,'Histogram includes the real zero baseline');
assert.equal(planFinancialChart({family:'flags',title:'Invalid text',axes,series:[{id:'a',name:'A',data:[{...source[0],title:42}]}]},{width:640,height:360}).status,'invalid');
const zigzag=planFinancialChart({family:'zigzag',title:'Connected pivots',axes,series:[{id:'a',name:'A',data:source}]},{width:640,height:360});assert.equal(zigzag.status,'ok');assert(zigzag.frame.series[0].parts[0].commands.some(command=>command.type==='L'),'Derived pivot nulls do not break ZigZag');
const psar=planFinancialChart({family:'psar',title:'SAR dots',axes,series:[{id:'a',name:'A',data:source}]},{width:640,height:360});assert.equal(psar.status,'ok');assert(psar.frame.series[0].circles.length>0);assert(!psar.frame.series[0].parts.some(part=>part.commands?.length),'PSAR is not a connected line');
const ichimoku=planFinancialChart({family:'ikh',title:'Cloud',axes,series:[{id:'a',name:'A',data:source}]},{width:640,height:360});assert.equal(ichimoku.status,'ok');assert(ichimoku.frame.series[0].parts.some(part=>part.key==='cloud'&&part.fill&&part.commands.some(command=>command.type==='Z')),'Ichimoku includes its actual shifted cloud area');
const stationary=planFinancialChart({family:'pointandfigure',title:'No price movement',axes,series:[{id:'a',name:'A',data:source.map(point=>({...point,open:0,high:0,low:0,close:0}))}]},{width:640,height:360});assert.equal(stationary.status,'empty');assert.equal(stationary.frame.observations.length,0,'No selectable phantom box when there is no price movement');
const grouped=planFinancialChart({family:'candlestick',title:'Two identical price streams',axes,series:[{id:'a',name:'A',data:source.slice(0,5)},{id:'b',name:'B',data:source.slice(0,5)}]},{width:640,height:360});assert.equal(grouped.status,'ok');const left=grouped.frame.series[0].bars[2],right=grouped.frame.series[1].bars[2];assert(left.x+left.width<=right.x,'Financial series must not obscure identical candles from another series');
assert.equal(grouped.frame.observations.length,10,'Automatic end padding preserves the first and last candle of every series');
console.log(JSON.stringify({status:'PASS',families:financialFamilies.length,cases:receipts.length,receipts}));
