import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import DOMPurify from 'dompurify';
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
const parser=new MarkdownIt({html:false,linkify:true,breaks:true,highlight:(source,language)=>codeBlock(source,language)}).use(taskLists).use(texmath,{engine:katex,delimiters:['dollars','brackets'],katexOptions:{trust:false,maxExpand:500,maxSize:20,strict:'ignore',output:'htmlAndMathml'}});
// Reuse texmath's recognizers to let display math interrupt a paragraph.
// This preserves fenced/inline code and requires no source rewriting.
const mathBlockStarts=texmath.mergeDelimiters(['dollars','brackets']).block.map(rule=>texmath.block(rule));
parser.block.ruler.before('paragraph','inkspace_math_start',(state,start,end,silent)=>silent&&state.sCount[start]-state.blkIndent<4&&mathBlockStarts.some(rule=>rule(state,start,end,true)),{alt:['paragraph']});
const imageRule=parser.renderer.rules.image;
parser.renderer.rules.image=(tokens,index,options,env,self)=>{const token=tokens[index],src=token.attrGet('src');if(src&&!/^(https?:|data:image\/)/i.test(src)){token.attrSet('data-inkspace-src',src);token.attrSet('src','data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=')}token.attrSet('loading','lazy');return imageRule(tokens,index,options,env,self)};
parser.renderer.rules.link_open=(tokens,index,options,env,self)=>{tokens[index].attrSet('target','_blank');tokens[index].attrSet('rel','noopener noreferrer');return self.renderToken(tokens,index,options)};
const clean=html=>typeof DOMPurify.sanitize==='function'?DOMPurify.sanitize(html,{ADD_ATTR:['target','loading'],FORBID_TAGS:['style','iframe','object','embed']}):html;
export function inline(source){return clean(parser.renderInline(source))}
export function markdown(source){return clean(parser.render(source.replace(/\r\n|\r/g,'\n'))).trimEnd()}
export {createStrokeState,appendStrokePoint,strokeTailPath,strokeTailPoints,strokePath,strokeOutline} from './ink-detail.js';
