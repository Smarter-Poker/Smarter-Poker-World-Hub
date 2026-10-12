import {rankReelsForViewer,reelAssetKey,reelMatchesFeedback} from './reelsFeedback.mjs';
export function rankUpcomingReels(rows, index, state, {chronological=false}={}) {
  if (!Array.isArray(rows)) return [];
  const end=Math.max(0,Math.min(rows.length,Math.trunc(index)+1));
  const prefix=rows.slice(0,end);
  const assets=new Set(prefix.map(reelAssetKey));
  const upcoming=rows.slice(end).filter(row=>!reelMatchesFeedback(row,state) && !assets.has(reelAssetKey(row)));
  return [...prefix,...rankReelsForViewer(upcoming,state,{chronological})];
}
/** Event-driven actual playing wall-time, separate from the media seek clock. */
export function createReelPlayedTime({now=()=>performance.now()}={}) {
  let started=null,seconds=0,visible=true,rate=1;
  const pause=()=>{if(started!==null){seconds+=Math.max(0,now()-started)/1000*rate;started=null;}};
  return {
    playing(){if(visible&&started===null)started=now();},
    pause,
    rate(value){
      const next=Number(value);
      if(!Number.isFinite(next)||next<=0||next>16)return;
      const wasPlaying=started!==null;
      pause();rate=next;
      if(wasPlaying&&visible)started=now();
    },
    visibility(value){visible=Boolean(value);if(!visible)pause();},
    seconds(){return seconds+(started===null?0:Math.max(0,now()-started)/1000*rate);},
  };
}
