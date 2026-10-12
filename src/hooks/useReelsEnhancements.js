import {useCallback,useEffect,useRef,useState} from 'react';
import {applyReelFeedbackState,applyReelEngagementState,classifyReelEngagement} from '../lib/reelsFeedback.mjs';
import {loadReelFeedbackState,persistReelFeedbackState} from '../lib/reelsWatchedStorage.mjs';
import {rankUpcomingReels,createReelPlayedTime} from '../lib/reelsEnhancementState.mjs';
import {createReelsPlaybackMeasurement,recordReelsDeliveryMetric} from '../lib/reelsDeliveryMetrics';

const captionKey=owner=>`smarter-reels-captions:v1:${encodeURIComponent(owner||'anonymous')}`;
const chronologicalMode=mode=>['latest','following','mine','saved','recent'].includes(mode);
export default function useReelsEnhancements({reels=[],currentIndex=0,setReels,ownerId=null,mode='for-you',surface='standalone',videoRef,dataSaver=false,onCompleted}={}) {
  const latest=useRef({});latest.current={reels,currentIndex,setReels,ownerId,mode,surface,videoRef,dataSaver,onCompleted};
  const feedbackRef=useRef(null);
  const ownerRef=useRef(Symbol('initial'));
  if(ownerRef.current!==ownerId){ownerRef.current=ownerId;feedbackRef.current=loadReelFeedbackState(ownerId);}
  const [feedbackVersion,setFeedbackVersion]=useState(0);
  const [captionRequested,setCaptionRequested]=useState(false);
  const [captionState,setCaptionState]=useState({status:'unknown',availability:'unknown'});
  const activeRef=useRef(null);
  const previousRef=useRef(null);
  const active=reels[currentIndex];
  useEffect(()=>{
    let value=false;try{value=globalThis.localStorage?.getItem(captionKey(ownerId))==='1';}catch(_){}
    setCaptionRequested(value);setCaptionState({status:'unknown',availability:'unknown'});
  },[ownerId]);
  const toggleCaptions=useCallback(()=>setCaptionRequested(value=>{
    const next=!value;try{globalThis.localStorage?.setItem(captionKey(latest.current.ownerId),next?'1':'0');}catch(_){}
    return next;
  }),[]);
  const onCaptionsStateChange=useCallback(state=>{
    const row=latest.current.reels[latest.current.currentIndex];
    if(state?.videoId && row?.youtube_video_id && state.videoId!==row.youtube_video_id)return;
    setCaptionState(state||{status:'unknown',availability:'unknown'});
  },[]);
  useEffect(()=>{
    if(!setReels||!active)return;
    const ranked=rankUpcomingReels(reels,currentIndex,feedbackRef.current,{chronological:chronologicalMode(mode)});
    if(ranked.length===reels.length&&ranked.every((row,index)=>row.id===reels[index]?.id))return;
    setReels(previous=>{
      if(previous!==reels)return previous;
      return ranked;
    });
  },[reels,currentIndex,setReels,mode,ownerId,feedbackVersion,active]);
  const feedback=useCallback(action=>{
    const {reels:rows,currentIndex:index,ownerId:owner}=latest.current;
    const row=rows[index];if(!row)return;
    feedbackRef.current=persistReelFeedbackState(applyReelFeedbackState(feedbackRef.current,action,row),owner);
    setFeedbackVersion(value=>value+1);
    return feedbackRef.current;
  },[]);
  useEffect(()=>{
    if(!active?.id)return;
    const owner=ownerId,row=active,selectedMode=mode,selectedSurface=surface,selectedSaver=dataSaver;
    const video=row.playback_type==='native'?videoRef?.current:null;
    const played=createReelPlayedTime();
    played.visibility(!document.hidden);
    const measurement=createReelsPlaybackMeasurement({onMetric:metric=>{
      if(ownerRef.current!==owner)return;
      void recordReelsDeliveryMetric({...metric,surface:selectedSurface,feedMode:selectedMode,dataSaver:selectedSaver,video});
    }});
    measurement.select({reelId:row.id,playbackType:row.playback_type||'unknown',transition:previousRef.current?.owner===owner&&previousRef.current?.id!==row.id});
    const session={row,owner,played,measurement,duration:0,completed:false};activeRef.current=session;
    const current=()=>activeRef.current===session&&ownerRef.current===owner;
    session.complete=()=>{
      if(!current()||session.completed)return;
      const observation={playedSeconds:played.seconds(),duration:session.duration};
      if(classifyReelEngagement(observation)!=='completed')return;
      session.completed=true;
      feedbackRef.current=persistReelFeedbackState(applyReelEngagementState(feedbackRef.current,row,observation),owner);
      latest.current.onCompleted?.(row.id);
    };
    const playing=()=>{if(!current()||document.hidden)return;played.playing();measurement.playing(row.id);};
    const pause=()=>{if(!current())return;played.pause();measurement.pause(row.id);};
    const waiting=()=>{if(!current())return;played.pause();measurement.waiting(row.id);};
    const duration=()=>{if(current()&&Number.isFinite(video?.duration)&&video.duration>0)session.duration=video.duration;};
    const rate=()=>{if(current())played.rate(video?.playbackRate);};
    const visibility=()=>{played.visibility(!document.hidden);if(document.hidden)measurement.pause(row.id);};
    const events={playing,pause,waiting,seeking:pause,ended:()=>{pause();session.complete();},timeupdate:session.complete,durationchange:duration,loadedmetadata:duration,ratechange:rate};
    for(const [name,listener] of Object.entries(events))video?.addEventListener(name,listener);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
    duration();rate();if(video&&!video.paused&&!video.seeking&&video.readyState>=3)playing();
    return()=>{
      for(const [name,listener]of Object.entries(events))video?.removeEventListener(name,listener);
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);
      played.pause();measurement.finish(row.id);
      if(ownerRef.current===owner){
        const observation={playedSeconds:played.seconds(),duration:session.duration};
        feedbackRef.current=persistReelFeedbackState(applyReelEngagementState(feedbackRef.current,row,observation),owner);
        if(!session.completed&&classifyReelEngagement(observation)==='completed')latest.current.onCompleted?.(row.id);
      }
      previousRef.current={owner,id:row.id};
      if(activeRef.current===session)activeRef.current=null;
    };
  },[active?.id,ownerId,videoRef]);
  const youtubeEvent=useCallback(event=>{
    const session=activeRef.current,data=event?.data;
    if(!session||session.owner!==ownerRef.current||!data)return;
    const videoId=session.row.youtube_video_id;
    if(videoId&&data.videoId&&videoId!==data.videoId)return;
    if(['onPlayerDisposed','onPlayerUnavailable','onError','onAutoplayBlocked'].includes(data.event)) {
      session.played.pause();session.measurement.pause(session.row.id);return;
    }
    if(data.event==='onPlaybackRateChange'){session.played.rate(data.info);return;}
    if(data.event==='infoDelivery'){
      session.played.rate(data.info?.playbackRate);
      if(Number.isFinite(data.info?.duration)&&data.info.duration>0){session.duration=data.info.duration;session.complete();}
    }
    if(data.event!=='onStateChange')return;
    if(data.info===1&&!document.hidden){session.played.playing();session.measurement.playing(session.row.id);}
    else {session.played.pause();if(data.info===3)session.measurement.waiting(session.row.id);else session.measurement.pause(session.row.id);}
  },[]);
  return{feedback,youtubeEvent,captionRequested,toggleCaptions,captionState,onCaptionsStateChange};
}
