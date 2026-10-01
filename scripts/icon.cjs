const fs=require('fs'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(256,256),c=canvas.getContext('2d');c.fillStyle='#23594c';c.beginPath();c.roundRect(4,4,248,248,54);c.fill();
c.strokeStyle='#fffefb';c.lineWidth=13;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(65,88);c.bezierCurveTo(95,35,144,71,111,117);c.bezierCurveTo(83,156,130,194,191,143);c.moveTo(69,185);c.lineTo(184,68);c.stroke();
const png=canvas.toBuffer('image/png'),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);fs.writeFileSync('desktop/icon.ico',Buffer.concat([header,png]));
const p=JSON.parse(fs.readFileSync('package.json'));p.build.win.icon='desktop/icon.ico';fs.writeFileSync('package.json',JSON.stringify(p,null,2));
