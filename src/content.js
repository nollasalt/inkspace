import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { codeMarkup } from './code-highlight.js';
import codeStyles from './code.css';
export { codeStyles };
export { highlightCode, installCodeControls } from './code-highlight.js';
export const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function formula(source,display=false){
  try{return katex.renderToString(source,{displayMode:display,throwOnError:false,trust:false,maxExpand:500,maxSize:20,strict:'ignore',output:'htmlAndMathml'})}
  catch{return `<code class="math-error">${escape(source)}</code>`}
}
export function codeBlock(source,language=''){
  return `<pre class="ink-code-block">${codeMarkup(source,language)}</pre>`;
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
// Keep source line boundaries on rendered blocks for in-place caret placement.
parser.core.ruler.after('inline','inkspace_source_lines',state=>{
  if(!state.env.inkSourceLines)return;
  for(const token of state.tokens)if(token.map&&token.nesting===1){token.attrSet('data-ink-source-start',String(state.env.inkSourceLines[token.map[0]]));token.attrSet('data-ink-source-end',String(state.env.inkSourceLines[token.map[1]]??state.src.length))}
});
for(const name of ['fence','code_block','math_block','math_block_eqno']){
  const rule=parser.renderer.rules[name];if(!rule)continue;
  parser.renderer.rules[name]=(tokens,index,options,env,self)=>{const html=rule(tokens,index,options,env,self),token=tokens[index];if(!env.inkSourceLines||!token.map)return html;const start=env.inkSourceLines[token.map[0]+(name==='fence'?1:0)]??0,end=env.inkSourceLines[token.map[1]]??env.inkSourceLength;return html.replace(/^(\s*<[\w-]+)/,`$1 data-ink-source-start="${start}" data-ink-source-end="${end}"`)};
}
export function markdown(source){const normalized=source.replace(/\r\n|\r/g,'\n'),lines=[0];for(let i=0;i<normalized.length;i++)if(normalized[i]==='\n')lines.push(i+1);return clean(parser.render(normalized,{inkSourceLines:lines,inkSourceLength:normalized.length})).trimEnd()}
export const unescapeMarkdown=source=>parser.utils.unescapeAll(source);
// The same Markdown parser supplies edit ranges and rendered source anchors.
// Ranges contain complete syntax, never a reconstruction of visible characters.
export function sourceRange(source,offset){
  const text=source.replace(/\r\n|\r/g,'\n'),lines=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')lines.push(i+1);
  const blocks=parser.parse(text,{}).filter(t=>t.map&&['paragraph_open','heading_open','fence','code_block','math_block','math_block_eqno','list_item_open'].includes(t.type));
  const found=blocks.map(token=>({start:lines[token.map[0]]??0,end:lines[token.map[1]]??text.length,type:token.type})).filter(r=>offset>=r.start&&offset<r.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
  const range=found[0];return range||{start:0,end:text.length,type:'document'};
}
// Use the renderer's Markdown grammar so code and horizontal rules stay literal.
export function listEnterEdit(source,start,end=start){
  if(start!==end)return null;
  const first=start===0?0:source.lastIndexOf('\n',start-1)+1,next=source.indexOf('\n',start),limit=next<0?source.length:next,line=source.slice(first,limit);
  const match=line.match(/^([ \t]*)([-+*]|(\d{1,9})([.)]))([ \t]+)(?:\[([ xX])\]([ \t]+))?/);
  if(!match||start-first<match[0].length)return null;
  const lineNumber=source.slice(0,first).split('\n').length-1,tokens=parser.parse(source,{});
  if(!tokens.some(token=>token.type==='list_item_open'&&token.map?.[0]===lineNumber)||tokens.some(token=>['fence','code_block'].includes(token.type)&&token.map&&lineNumber>=token.map[0]&&lineNumber<token.map[1]))return null;
  if(!line.slice(match[0].length).trim())return{start:first,end:limit,text:match[1]};
  const marker=match[3]?String(Number(match[3])+1)+match[4]:match[2],task=match[6]!==undefined?'[ ]'+match[7]:'';
  return{start,end,text:'\n'+match[1]+marker+match[5]+task};
}
for(const name of ['math_inline','math_inline_double','math_block','math_block_eqno']){
  const rule=parser.renderer.rules[name];if(rule)parser.renderer.rules[name]=(tokens,index,options,env,self)=>rule(tokens,index,options,env,self).replace(/^(\s*<[\w-]+)/,tag=>`${tag} data-ink-math="${escape(tokens[index].content)}"`);
}
export {createStrokeState,appendStrokePoint,strokeTailPath,strokeTailPoints,strokePath,strokeOutline} from './ink-detail.js';

export function html(source){
  const clean=DOMPurify.sanitize(source,{WHOLE_DOCUMENT:true,ADD_TAGS:['style'],FORBID_TAGS:['script','iframe','object','embed','form','input','button','textarea','select','base','meta','link'],FORBID_ATTR:['contenteditable']});
  const template=document.createElement('template');template.innerHTML=clean;
  for(const pre of template.content.querySelectorAll('pre')){
    const code=pre.querySelector('code');if(!code)continue;
    const language=[...code.classList,...pre.classList].find(name=>/^(language-|lang-)/.test(name))?.replace(/^(language-|lang-)/,'')||'';
    const original=code.textContent;pre.classList.add('ink-code-block');pre.innerHTML=codeMarkup(original,language);
  }
  return template.innerHTML;
}
