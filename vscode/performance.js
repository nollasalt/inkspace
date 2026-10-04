// Bounded timing samples; no stroke coordinates, text, file paths or engine keys.
(()=>{
  const timings=new Map();let longTasks=0,longTaskMaxMs=0,errors=0;
  function record(name,ms){let entry=timings.get(name);if(!entry){entry={count:0,totalMs:0,maxMs:0,samples:[]};timings.set(name,entry)}entry.count++;entry.totalMs+=ms;entry.maxMs=Math.max(entry.maxMs,ms);if(entry.samples.length===128)entry.samples.shift();entry.samples.push(ms)}
  function measured(name,fn){return function(...args){const started=performance.now();try{const value=fn.apply(this,args);if(value?.then)return value.finally(()=>record(name,performance.now()-started));record(name,performance.now()-started);return value}catch(error){record(name,performance.now()-started);throw error}}}
  render=measured('sceneRender',render);finishInk=measured('penUp',finishInk);undo=measured('undo',undo);redo=measured('redo',redo);
  asyncCairoBitmap=measured('nativeRasterRoundTrip',asyncCairoBitmap);
  if(typeof dispatch==='function')dispatch=measured('inputDispatch',dispatch);
  let observer;try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTasks++;longTaskMaxMs=Math.max(longTaskMaxMs,entry.duration)}});observer.observe({type:'longtask'})}catch{}
  window.addEventListener('error',()=>errors++);window.addEventListener('unhandledrejection',()=>errors++);window.addEventListener('beforeunload',()=>observer?.disconnect(),{once:true});
  window.inkspacePerformance={report(){
    const summary={};for(const [name,entry]of timings){const sorted=[...entry.samples].sort((a,b)=>a-b);summary[name]={count:entry.count,meanMs:entry.totalMs/entry.count,maxMs:entry.maxMs,recentP95Ms:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)],recentSamples:sorted.length}}
    const input=window.inkspaceNative.status();return{timings:summary,longTasks:{count:longTasks,maxMs:longTaskMaxMs},errors,input:{connected:!!input.connected,calibrated:!!input.calibrated,rawSamples:input.rawSamples||0,deliveredPackets:input.deliveredPackets||0},focus:{windowFocused:typeof hostWindowFocused==='boolean'?hostWindowFocused:document.hasFocus(),editorActive:typeof hostEditorActive==='boolean'?hostEditorActive:true,documentVisible:!document.hidden},canvas:{scale:view.scale,strokes:doc.strokes.length,textAndImages:doc.notes.length,shapes:doc.shapes.length,pdfs:doc.pdfs?.length||0,pages:notebook.pages.length,pendingRasters:cairoPending.size,queuedRasters:cairoRasterQueue.length,retainedStrokes:cairoRetained.size},renderCounters:Object.fromEntries(Object.entries(renderStats).filter(([,value])=>Number.isFinite(value)))};
  }};
})();
