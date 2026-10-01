const fs=require('node:fs'),vm=require('node:vm');
const {createCanvas,Path2D}=require('@napi-rs/canvas');
const context=vm.createContext({console});vm.runInContext(fs.readFileSync('vendor/content.js','utf8'),context);
const content=context.InkContent,stroke={color:'#263f43',width:4,points:[]};
for(let i=0;i<=300;i++)stroke.points.push({x:24+i*1.4,y:75+Math.sin(i/18)*32+Math.sin(i/5)*3,p:.25+.65*(Math.sin(i/40)+1)/2});
function layer(density,smooth){const c=createCanvas(470*density,150*density),ctx=c.getContext('2d');ctx.scale(density,density);ctx.fillStyle='#fffefb';ctx.fillRect(0,0,470,150);ctx.fillStyle=stroke.color;ctx.strokeStyle=stroke.color;ctx.lineCap='round';if(smooth)ctx.fill(new Path2D(content.strokePath(stroke)));else for(let i=1;i<stroke.points.length;i++){const a=stroke.points[i-1],b=stroke.points[i];ctx.lineWidth=stroke.width*(.35+.65*(a.p+b.p)/2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}return c}
const old=layer(1,false),fresh=layer(2,true),out=createCanvas(1020,590),ctx=out.getContext('2d');
ctx.fillStyle='#f4f6f3';ctx.fillRect(0,0,1020,590);ctx.fillStyle='#263f43';ctx.font='bold 24px Segoe UI';ctx.fillText('Ink rasterization comparison',28,42);ctx.font='16px Segoe UI';ctx.fillText('Previous: short segments, 1x raster',28,84);ctx.fillText('Updated: smooth contour, 2x raster',530,84);
ctx.drawImage(old,28,104,470,150);ctx.drawImage(fresh,530,104,470,150);
ctx.fillText('4x pixel inspection (same samples and pressure)',28,300);
ctx.imageSmoothingEnabled=false;ctx.drawImage(old,140,35,110,65,28,328,440,260);ctx.drawImage(fresh,280,70,220,130,530,328,440,260);
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/ink-comparison.png',out.toBuffer('image/png'));
console.log('artifacts/ink-comparison.png');
