import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import java from 'highlight.js/lib/languages/java';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';

for(const [name,grammar] of Object.entries({javascript,typescript,python,cpp,csharp,java,json,bash,css,xml,sql,rust}))hljs.registerLanguage(name,grammar);
export const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function formula(source,display=false){
  try{return katex.renderToString(source,{displayMode:display,throwOnError:false,trust:false,maxExpand:500,maxSize:20,strict:'ignore',output:'htmlAndMathml'})}
  catch{return `<code class="math-error">${escape(source)}</code>`}
}
export function codeBlock(source,language=''){
  language=language.toLowerCase();
  const known=/^[\w+-]+$/.test(language)&&hljs.getLanguage(language);
  const value=known?hljs.highlight(source,{language,ignoreIllegals:true}).value:escape(source);
  return `<pre><code class="hljs${known?' language-'+language:''}">${value}</code></pre>`;
}
export function inline(source){
  const tokens=[];const token=html=>{tokens.push(html);return `\u0000${tokens.length-1}\u0000`};
  let s=source.replace(/\u0000/g,'').replace(/`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\\\((.+?)\\\)|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g,(all,code,label,url,paren,dollar)=>{
    if(code!==undefined)return token('<code>'+escape(code)+'</code>');
    if(url!==undefined)return token(`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${inline(label)}</a>`);
    return token(formula(paren??dollar));
  });
  s=escape(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/\\\$/g,'$');
  return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[i]);
}
export function markdown(source){
  let html='',code=null,language='',math=null,mathEnd='',list=null;
  const close=()=>{if(list){html+=`</${list}>`;list=null}};
  for(const line of source.split('\n')){
    const fence=line.match(/^\s*```\s*([^\s`]*)\s*$/);
    if(code!==null){if(fence){html+=codeBlock(code.join('\n'),language);code=null}else code.push(line);continue}
    if(math!==null){const end=line.indexOf(mathEnd);if(end>=0){math.push(line.slice(0,end));html+=formula(math.join('\n'),true);if(line.slice(end+mathEnd.length).trim())html+='<p>'+inline(line.slice(end+mathEnd.length))+'</p>';math=null}else math.push(line);continue}
    if(fence){close();code=[];language=fence[1];continue}
    const trimmed=line.trim(),start=trimmed.startsWith('$$')?'$$':trimmed.startsWith('\\[')?'\\[':null;
    if(start){close();mathEnd=start==='$$'?'$$':'\\]';const remainder=trimmed.slice(2),end=remainder.indexOf(mathEnd);if(end>=0){html+=formula(remainder.slice(0,end),true);if(remainder.slice(end+2).trim())html+='<p>'+inline(remainder.slice(end+2))+'</p>'}else math=[remainder];continue}
    const heading=line.match(/^(#{1,3})\s+(.*)$/),li=line.match(/^\s*(?:([-*])|\d+\.)\s+(.*)$/);
    if(li){const tag=li[1]?'ul':'ol';if(list!==tag){close();list=tag;html+=`<${tag}>`}html+='<li>'+inline(li[2])+'</li>';continue}
    close();if(heading)html+=`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;else if(line.startsWith('> '))html+='<blockquote>'+inline(line.slice(2))+'</blockquote>';else if(trimmed)html+='<p>'+inline(line)+'</p>';
  }
  close();if(code!==null)html+=codeBlock(code.join('\n'),language);if(math!==null)html+='<pre class="math-error">'+escape((mathEnd==='$$'?'$$':'\\[')+math.join('\n'))+'</pre>';
  return html;
}
export {createStrokeState,appendStrokePoint,strokeTailPath,strokeTailPoints,strokePath,strokeOutline} from './ink-detail.js';
