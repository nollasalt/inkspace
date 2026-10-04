// Keep modifications in the extension host; debounce disk commits with a ceiling.
class AutoSave{
 constructor(save,options={}){this.save=save;this.delay=options.delay??2000;this.maxDelay=Math.max(this.delay,options.maxDelay??10000);this.retryDelay=options.retryDelay??5000;this.clock=options.clock||globalThis;this.onError=options.onError||(()=>{});this.idle=null;this.limit=null;this.failures=0;this.disposed=false}
 clear(){this.clock.clearTimeout(this.idle);this.clock.clearTimeout(this.limit);this.idle=this.limit=null}
 succeeded(){this.failures=0}
 changed(){if(this.disposed||this.failures)return;this.clock.clearTimeout(this.idle);const commit=()=>this.flush().catch(()=>{});this.idle=this.clock.setTimeout(commit,this.delay);if(this.limit===null)this.limit=this.clock.setTimeout(commit,this.maxDelay)}
 async flush(){this.clear();try{await this.save();this.failures=0}catch(error){if(!this.failures++)this.onError(error);this.clear();if(!this.disposed)this.idle=this.clock.setTimeout(()=>this.flush().catch(()=>{}),Math.min(60000,this.retryDelay*2**Math.min(this.failures-1,4)));throw error}}
 dispose(){this.disposed=true;return this.flush()}
}
module.exports={AutoSave};
