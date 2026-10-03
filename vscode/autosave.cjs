// Keep modifications in the extension host; debounce disk commits with a ceiling.
class AutoSave{
 constructor(save,options={}){this.save=save;this.delay=options.delay??2000;this.maxDelay=Math.max(this.delay,options.maxDelay??10000);this.clock=options.clock||globalThis;this.onError=options.onError||(()=>{});this.idle=null;this.limit=null}
 clear(){this.clock.clearTimeout(this.idle);this.clock.clearTimeout(this.limit);this.idle=this.limit=null}
 changed(){this.clock.clearTimeout(this.idle);const commit=()=>this.flush().catch(this.onError);this.idle=this.clock.setTimeout(commit,this.delay);if(this.limit===null)this.limit=this.clock.setTimeout(commit,this.maxDelay)}
 flush(){this.clear();return Promise.resolve().then(this.save)}
 dispose(){return this.flush()}
}
module.exports={AutoSave};
