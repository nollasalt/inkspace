const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function client(records={}){
 const events={},windowEvents={},messages=[],boot={native:{endpoint:'http://127.0.0.1:1',key:'x'},calibrations:records};
 const sandbox={console,TextDecoder,Uint8Array,Uint8ClampedArray,Map,JSON,Math,performance:{now:()=>10},atob:s=>Buffer.from(s,'base64').toString('binary'),InkCalibration:require('../ink-engine/calibration.js'),screen:{width:1920,height:1080,availLeft:0,availTop:0,availWidth:1920,availHeight:1040},devicePixelRatio:1,updatePenCursor(){},clearPenCursor(){},toast:message=>{throw Error(message)},updateNativeStatus(){},viewport:{getBoundingClientRect:()=>({left:0,top:0,right:800,bottom:600,width:800,height:600})},acquireVsCodeApi:()=>({postMessage:m=>messages.push(m)}),fetch:async()=>({ok:true,json:async()=>({inputReady:true})}),XMLHttpRequest:class{open(){}setRequestHeader(){}send(){this.status=200;this.responseText='{"inputReady":true}'}},WebSocket:class{constructor(){sandbox.socket=this}},document:{hidden:false,hasFocus:()=>true,body:{append(){}},createElement:()=>({style:{},remove(){}}),querySelector:selector=>selector==='#inkspace-boot'?{content:Buffer.from(JSON.stringify(boot)).toString('base64')}:selector==='main#viewport'?sandbox.viewport:selector==='.toolbar-actions'?{prepend(){}}:null,addEventListener:(type,fn)=>(events[type]||=[]).push(fn)},addEventListener:(type,fn)=>(windowEvents[type]||=[]).push(fn)};
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync('vscode/engine-client.js','utf8'),sandbox);events.DOMContentLoaded[0]();
 return{sandbox,messages,events,windowEvents,run:s=>vm.runInContext(s,sandbox),raw:samples=>sandbox.socket.onmessage({data:JSON.stringify({type:'raw',samples})})};
}
const first=client();first.sandbox.inkspaceEngineValidation.startCalibration();
for(const [x,y]of [[100,100],[700,500],[700,100]]){
 first.raw([{device:123,deviceKey:'stable-pen',x,y,pressure:800,pressureMax:1000,contact:true,inRange:true}]);
 for(const fn of first.events.pointerdown)fn({nativeInk:false,pointerType:'pen',isTrusted:true,screenX:x+20,screenY:y+30,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 first.raw([{device:123,deviceKey:'stable-pen',x,y,pressure:0,pressureMax:1000,contact:false,inRange:true}]);
}
const record=first.messages.find(m=>m.type==='calibration')?.record;assert(record,'three contacts persist calibration');
const restored=client({[record.deviceKey+'|'+record.display]:record});restored.raw([{device:987,deviceKey:'stable-pen',x:200,y:200,pressure:0,pressureMax:1000,contact:false,inRange:true}]);assert(restored.sandbox.inkspaceNative.status().calibrated,'restore across changed runtime handle');
restored.sandbox.devicePixelRatio=1.5;restored.raw([{device:987,deviceKey:'stable-pen',x:200,y:200,pressure:0,pressureMax:1000,contact:false,inRange:true}]);assert(!restored.sandbox.inkspaceNative.status().calibrated,'DPI change invalidates mapping');
const other=client({[record.deviceKey+'|'+record.display]:record});other.raw([{device:987,deviceKey:'other-pen',x:200,y:200,pressure:0,pressureMax:1000,contact:false,inRange:true}]);assert(!other.sandbox.inkspaceNative.status().calibrated);
console.log('Passed calibration persistence, restart handle change, device isolation and DPI invalidation.');

const focused=client({[record.deviceKey+'|'+record.display]:record}),packets=[];focused.sandbox.desktop.onPen(p=>packets.push(...p));focused.sandbox.document.hasFocus=()=>false;for(const fn of focused.events.pointermove)fn({isTrusted:true,nativeInk:false,screenX:20,screenY:30,clientX:0,clientY:0});
const report=contact=>[{device:1,deviceKey:'stable-pen',x:200,y:200,pressure:contact?800:0,pressureMax:1000,contact,inRange:true}];
for(const fn of focused.windowEvents.message)fn({data:{type:'engine-focus',windowFocused:false,editorActive:true}});focused.raw(report(true));focused.raw(report(false));assert.equal(packets.length,0,'background apps never draw');
for(const fn of focused.windowEvents.message)fn({data:{type:'engine-focus',windowFocused:true,editorActive:true}});focused.raw(report(true));focused.raw(report(false));assert.deepEqual(packets.map(p=>p.type),['pointerdown','pointerup'],'Alt+Tab return draws without mouse or iframe focus');
for(const fn of focused.windowEvents.message)fn({data:{type:'engine-focus',windowFocused:true,editorActive:false}});focused.raw(report(true));focused.raw(report(false));assert.equal(packets.length,2,'inactive notebook never draws');console.log('Passed host focus return without mouse click and background/inactive input isolation.');
