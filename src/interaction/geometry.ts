export interface Rect { x: number; y: number; w: number; h: number }
export const contains = (r: Rect | null, p: {x: number; y: number}, pad = 0): boolean =>
  !!r && p.x >= r.x - pad && p.y >= r.y - pad && p.x <= r.x + r.w + pad && p.y <= r.y + r.h + pad;
export const enclosed = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const frames=new WeakMap<HTMLElement,{signature:string;local:Rect}>();

/** Adapters publish local geometry; observation transforms never affect layout. */
export function noteFrame(note: any, el: HTMLElement, zoom: number): Rect | null {
  if (typeof getComputedStyle !== 'function' || !el.style.getPropertyValue('--text-width')) return null;
  const signature=[...['left','top','width','height'].map(key=>el.style.getPropertyValue('--text-'+key)),el.style.getPropertyValue('--control-unit'),note.kind,el.classList.contains('window-text')].join('|');
  const cached=frames.get(el);
  if(cached?.signature===signature)return{x:note.x+cached.local.x*(note.scale||1),y:note.y+cached.local.y*(note.scale||1),w:cached.local.w*(note.scale||1),h:cached.local.h*(note.scale||1)};
  const pseudo = getComputedStyle(el, '::after'), style = getComputedStyle(el);
  if (pseudo.content === 'none' || pseudo.content === 'normal') return null;
  const scale = note.scale || 1;
  const number = (s: string) => parseFloat(s) || 0;
  const border = number(pseudo.borderLeftWidth);
  const rect = {
    x: note.x + (number(style.borderLeftWidth) + number(pseudo.left)) * scale,
    y: note.y + (number(style.borderTopWidth) + number(pseudo.top)) * scale,
    w: (number(pseudo.width) + (pseudo.boxSizing === 'border-box' ? 0 : 2 * border)) * scale,
    h: (number(pseudo.height) + (pseudo.boxSizing === 'border-box' ? 0 : 2 * border)) * scale
  };
  if(!Object.values(rect).every(Number.isFinite)||rect.w<=0||rect.h<=0)return null;
  frames.set(el,{signature,local:{x:(rect.x-note.x)/scale,y:(rect.y-note.y)/scale,w:rect.w/scale,h:rect.h/scale}});
  return rect;
}
