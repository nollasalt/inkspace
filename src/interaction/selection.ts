export interface Reference { kind: string; id: string }
/** Canonical IDs; array indices and mxGraph selection are compatibility views. */
export class Selection {
  private members = new Map<string, Reference>();
  private changed = 0;
  get revision(): number { return this.changed; }
  refs(): Reference[] { return [...this.members.values()]; }
  has(kind: string, id: string): boolean { return this.members.has(kind + ':' + id); }
  setKind(kind: string, ids: string[]): void {
    const previous=this.refs().filter(ref=>ref.kind===kind).map(ref=>ref.id);
    if(previous.length===ids.length&&previous.every((id,index)=>id===ids[index]))return;
    for (const [key, ref] of this.members) if (ref.kind === kind) this.members.delete(key);
    for (const id of ids) this.members.set(kind + ':' + id, {kind, id});
    this.changed++;
  }
  clear(): void { if(this.members.size){this.members.clear();this.changed++} }
}

export function selectionProjection(selection: Selection, host: {
  kinds: string[]; items(kind: string): any[]; id(item: any): string;
}): Record<string, any[]> {
  const target = Object.fromEntries(host.kinds.map(kind => [kind, []]));
  const cache=new Map<string,{items:any[];length:number;revision:number;indices:any[];ids:string[];complete:boolean}>();
  const indices = (kind: string) => {
    if(kind==='pdfPages')return selection.refs().filter(r=>r.kind===kind).map(r=>r.id);
    const items=host.items(kind),previous=cache.get(kind);
    if(previous?.items===items&&previous.length===items.length&&previous.revision===selection.revision&&previous.complete&&previous.indices.every((index,i)=>items[index]?.id===previous.ids[i]))return previous.indices.slice();
    const result=items.flatMap((item,index)=>item.id&&selection.has(kind,item.id)?[index]:[]);
    cache.set(kind,{items,length:items.length,revision:selection.revision,indices:result,ids:result.map(index=>items[index].id),complete:result.length===selection.refs().filter(ref=>ref.kind===kind).length});return result.slice();
  };
  const commit = (kind: string, values: any[]) => selection.setKind(kind, kind === 'pdfPages' ? values :
    values.map(index => host.items(kind)[index]).filter(Boolean).map(item => host.id(item)));
  return new Proxy(target, {
    get(_, kind: string) {
      if (!host.kinds.includes(kind)) return Reflect.get(target, kind);
      const array = indices(kind);
      // Keep projections cloneable across the Electron/VS Code boundary.
      for (const key of ['push','pop','splice','shift','unshift','sort','reverse'])
        Object.defineProperty(array, key, {enumerable:false,value:(...args: any[]) => {
          const result = (Array.prototype as any)[key].apply(array,args); commit(kind,array); return result;
        }});
      return array;
    },
    set(_, kind: string, value) {
      if (!host.kinds.includes(kind)) return false;
      commit(kind, value); return true;
    }
  });
}
