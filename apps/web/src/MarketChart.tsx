import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionType, IndicatorSeries, dispose, init, registerIndicator, registerOverlay } from 'klinecharts';
import type { Chart, Crosshair, Indicator, KLineData } from 'klinecharts';
import type { AppearanceColors } from './AppearanceSettings';

/** Display-only projection. Prices arrive from the core as integer cents. */
export type ChartBar={timestamp:number;worldDay:number;hour:number|null;open:number;high:number;low:number;close:number;volume:number;completed:boolean;noTrade:boolean;referenceOnly:boolean};
type MovingAverages=Record<string,number>;
registerOverlay({name:'TERMINAL_STATUS',totalStep:1,needDefaultPointFigure:false,needDefaultXAxisFigure:false,needDefaultYAxisFigure:false,
  createPointFigures:({coordinates,overlay})=>coordinates[0]?[{type:'text',attrs:{x:coordinates[0].x,y:coordinates[0].y-12,text:overlay.extendData,align:'center',baseline:'bottom'},styles:{color:'#aeb8c5',size:9,backgroundColor:'transparent'},ignoreEvent:true}]:[]});
registerIndicator<MovingAverages>({name:'TERMINAL_MA',shortName:'MA',series:IndicatorSeries.Price,precision:2,calcParams:[5,20],
  figures:[5,20].map(n=>({key:`ma${n}`,title:`MA${n}: `,type:'line'})),
  createTooltipDataSource:({indicator,crosshair,kLineDataList})=>{
    const i=crosshair.dataIndex??kLineDataList.length-1,result=indicator.result[i];
    return {name:'MA',calcParamsText:'(5,20)',icons:[],values:[5,20].map(n=>({title:`MA${n}: `,value:result?.[`ma${n}`]===undefined?'—':result[`ma${n}`]!.toFixed(2)}))};
  },
  calc:(data:KLineData[],indicator:Indicator<MovingAverages>)=>data.map((bar,i)=>{
    const result:MovingAverages={};if(bar.completed!==true)return result;
    for(const p of indicator.calcParams){const n=Number(p);if(i+1<n)continue;const window=data.slice(i+1-n,i+1);if(window.some(b=>b.completed!==true))continue;result[`ma${n}`]=window.reduce((sum,b)=>sum+b.close,0)/n;}
    return result;
  }),
});

export function MarketChart({stockId,bars,scale,showAverage,colors}:{stockId:string;bars:ChartBar[];scale:'day'|'hour';showAverage:boolean;colors:AppearanceColors}){
  const host=useRef<HTMLDivElement>(null),chart=useRef<Chart|null>(null),current=useRef(bars);
  const [inspection,setInspection]=useState<number|null>(null);
  current.current=bars;
  useLayoutEffect(()=>{
    const node=host.current;if(!node)return;const instance=init(node);if(!instance)return;
    chart.current=instance;instance.setStyles('dark');instance.setTimezone('UTC');instance.setPriceVolumePrecision(2,0);
    instance.setBarSpace(10);instance.setOffsetRightDistance(52);instance.createIndicator('VOL',false,{height:92});
    instance.setPaneOptions({id:'candle_pane',gap:{top:0.22,bottom:0.10}});
    instance.setCustomApi({formatDate:(_formatter,timestamp)=>{
      const source=current.current;const bar=source.find(b=>b.timestamp===timestamp)??[...source].reverse().find(b=>b.timestamp<timestamp)??source[0];
      return bar?`${bar.worldDay}${bar.hour===null?'':` / ${bar.hour+1}时`}`:'';
    }});
    const crosshair=(value?:unknown)=>{const selected=(value as Crosshair|undefined)?.dataIndex;setInspection(typeof selected==='number'?selected:null);};
    instance.subscribeAction(ActionType.OnCrosshairChange,crosshair);
    const observer=new ResizeObserver(()=>instance.resize());observer.observe(node);
    return()=>{observer.disconnect();instance.unsubscribeAction(ActionType.OnCrosshairChange,crosshair);dispose(node);chart.current=null;};
  },[]);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    instance.applyNewData(bars.map(bar=>({timestamp:bar.timestamp,open:bar.open/100,high:bar.high/100,low:bar.low/100,close:bar.close/100,volume:bar.volume,completed:bar.completed})),false);
    instance.removeOverlay({groupId:'terminal-status'});
    for(const bar of bars.filter(b=>b.noTrade||!b.completed))instance.createOverlay({id:`${stockId}-${scale}-${bar.timestamp}`,groupId:'terminal-status',name:'TERMINAL_STATUS',lock:true,
      points:[{timestamp:bar.timestamp,value:bar.high/100}],extendData:[bar.noTrade?'0':'',!bar.completed?'进行中':''].filter(Boolean).join(' · ')});
    setInspection(null);
  },[bars,stockId,scale]);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    instance.setStyles({candle:{bar:{upColor:colors.up,downColor:colors.down,upBorderColor:colors.up,downBorderColor:colors.down,upWickColor:colors.up,downWickColor:colors.down}},indicator:{bars:[{upColor:colors.up,downColor:colors.down,noChangeColor:'#84919d'}]}});
  },[colors]);
  useEffect(()=>{
    const instance=chart.current;if(!instance)return;
    if(showAverage)instance.createIndicator('TERMINAL_MA',true,{id:'candle_pane'});else instance.removeIndicator('candle_pane','TERMINAL_MA');
  },[showAverage]);
  const latest=bars.at(-1),bar=inspection===null?latest:bars[Math.max(0,Math.min(bars.length-1,inspection))]??latest;
  return <div className="market-chart" data-testid="market-chart" data-stock-id={stockId} data-scale={scale} data-bars={bars.length}>
    <div className="chart-inspection" aria-live="polite">
      {bar?<><span>世界日 {bar.worldDay}{bar.hour===null?'':` · 第${bar.hour+1}小时`}</span><span>{bar.completed?'已完成':'进行中'}</span>
        {bar.noTrade&&<span>无成交 · V=0</span>}{bar.referenceOnly&&<span>发行参考，尚无真实成交</span>}
        <span>开 {(bar.open/100).toFixed(2)}</span><span>高 {(bar.high/100).toFixed(2)}</span><span>低 {(bar.low/100).toFixed(2)}</span><span>收 {(bar.close/100).toFixed(2)}</span><span>量 {bar.volume.toLocaleString()}</span></>:<span>当前窗口尚未处理竞价批次</span>}
    </div>
    <div ref={host} className="canvas-chart" role="img" aria-label={`${stockId}真实${scale==='day'?'日':'小时'}K线及成交量`} />
    <div className="chart-caption"><span>0 = 无成交 · 可拖动查看真实历史</span><span>均线仅计算已完成窗口</span></div>
  </div>;
}

export default MarketChart;
