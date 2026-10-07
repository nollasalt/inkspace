/** Input policy is independent of DOM, renderers and the file format. */
export type Owner = 'ink' | 'erase' | 'shape' | 'pan' | 'selection' | 'text-scale' |
  'width' | 'height' | 'connection' | 'view-toggle' | 'editor' | 'diagram';
export type Phase = 'pressed' | 'dragging' | 'marquee' | 'resizing' | 'drawing' | 'panning' | 'delegated';
const phases: Record<Owner, Phase[]> = {
  ink:['drawing'],erase:['drawing'],shape:['drawing'],pan:['panning'],
  selection:['pressed','dragging','marquee','resizing'], 'text-scale':['resizing'],width:['resizing'],height:['resizing'],
  connection:['pressed'], 'view-toggle':['pressed'],editor:['pressed'],diagram:['delegated']
};
export interface PointerFacts {
  pointerId: number;
  device: string;
  button: number;
  tool: string;
  space: boolean;
  ui: boolean;
  duplicate: boolean;
  control?: Owner;
  connection: boolean;
  diagram: boolean;
}
export function intent(f: PointerFacts): Owner | null {
  if (f.duplicate) return null;
  if (f.ui) return 'editor';
  if (f.space || f.button === 1 || f.device === 'touch') return 'pan';
  if (f.tool === 'pan') return f.device === 'mouse' && f.control ? f.control : 'pan';
  if (f.button === 2) return 'selection';
  if (f.tool === 'pen') return 'ink';
  if (f.tool === 'erase') return 'erase';
  if (f.tool === 'shape') return 'shape';
  if (f.tool === 'pdftext') return 'pan';
  // Hover never owns a gesture. Only a hit on a control can start one.
  if (f.device === 'mouse' && f.connection && (!f.control || f.control === 'selection')) return 'connection';
  if (f.device !== 'touch' && f.control && (f.device === 'mouse' || f.control !== 'connection' && f.control !== 'view-toggle')) return f.control;
  if (f.device === 'mouse' && f.connection) return 'connection';
  if (f.device === 'mouse' && f.diagram) return 'diagram';
  return 'selection';
}

export class InteractionMachine {
  private contact: {owner: Owner; phase: Phase; pointers: Set<number>; device: string} | null = null;
  private linking: {source: string; page: string} | null = null;
  private editing: string | null = null;
  get gesture() { return this.contact && {owner: this.contact.owner, phase:this.contact.phase, pointers: [...this.contact.pointers]}; }
  get connection() { return this.linking; }
  get editor() { return this.editing; }
  begin(owner: Owner, pointerId: number, device: string): boolean {
    if (this.contact) {
      if (this.contact.owner === 'pan' && owner === 'pan' && device === 'touch' && this.contact.device === 'touch') {
        this.contact.pointers.add(pointerId); return true;
      }
      return false;
    }
    this.contact = {owner,phase:phases[owner][0],pointers: new Set([pointerId]), device};
    return true;
  }
  transition(pointerId: number, phase: Phase): boolean {
    if(!this.owns(pointerId)||!phases[this.contact!.owner].includes(phase))return false;
    this.contact!.phase=phase;return true;
  }
  owns(pointerId: number, owner?: Owner): boolean {
    return !!this.contact?.pointers.has(pointerId) && (!owner || this.contact.owner === owner);
  }
  end(pointerId: number): void {
    this.contact?.pointers.delete(pointerId);
    if (!this.contact?.pointers.size) this.contact = null;
  }
  release(): void { this.contact = null; }
  startConnection(source: string, page: string): void { this.linking = {source, page}; }
  cancelConnection(): void { this.linking = null; }
  edit(id: string | null): void { this.editing = id; }
  reset(): void { this.release(); this.cancelConnection(); this.editing = null; }
}
