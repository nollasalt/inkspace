import {InteractionMachine, intent, Owner, PointerFacts} from './machine';

export interface InteractionHost {
  facts(event: PointerEvent): PointerFacts;
  prepare(event: PointerEvent, owner: Owner): void;
  begin(event: PointerEvent, owner: Owner): boolean;
  move(event: PointerEvent, owner: Owner): void;
  end(event: PointerEvent, owner: Owner): void;
  cancel(reason: string, owner: Owner): void;
  hover(event: PointerEvent): void;
  key(event: KeyboardEvent): boolean;
  wheel(event: WheelEvent): void;
  doubleClick(event: MouseEvent): void;
}

/** The only canvas pointer dispatcher. Renderers never arbitrate gestures. */
export class InputRouter {
  readonly machine = new InteractionMachine();
  private shortcuts = new Map<string, (event: KeyboardEvent) => boolean>();
  private endingDiagram = false;
  constructor(private host: InteractionHost) {}
  registerShortcut(id: string, handler: (event: KeyboardEvent) => boolean): void { this.shortcuts.set(id,handler); }
  shortcut(event: KeyboardEvent): boolean {
    for (const handler of this.shortcuts.values()) if (handler(event)) return true;
    return false;
  }
  nativeDiagramAllowed(): boolean { return this.machine.gesture?.owner === 'diagram' || this.endingDiagram; }
  endDiagram(): void { this.machine.release(); this.endingDiagram = false; }
  down(event: PointerEvent): void {
    const facts = this.host.facts(event), owner = intent(facts);
    if (!owner) { if(facts.device==='pen'&&!facts.ui)event.preventDefault(); return; }
    if (owner === 'editor') { this.host.prepare(event, owner); return; }
    if (!this.machine.begin(owner, event.pointerId, facts.device)) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    try {
      this.host.prepare(event, owner);
      if (!this.host.begin(event, owner)) this.machine.end(event.pointerId);
    } catch (error) {
      this.cancel('error'); throw error;
    }
    if (owner !== 'diagram') { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  move(event: PointerEvent): void {
    if (this.host.facts(event).duplicate) return;
    const current = this.machine.gesture;
    if (!current) { this.host.hover(event); return; }
    if (!this.machine.owns(event.pointerId)) return;
    this.host.move(event, current.owner);
    if (current.owner !== 'diagram') { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  up(event: PointerEvent): void {
    if (this.host.facts(event).duplicate || !this.machine.owns(event.pointerId)) return;
    const owner = this.machine.gesture!.owner;
    if (event.type === 'pointercancel') { this.cancel('pointercancel'); return; }
    this.host.end(event, owner);
    if (owner === 'diagram') {
      // Its compatibility mouseup can arrive after pointerup's microtasks.
      // The delegated adapter acknowledges completion after committing geometry.
      this.endingDiagram = true;
    } else { this.machine.end(event.pointerId); event.stopImmediatePropagation(); }
  }
  cancel(reason: string): void {
    const owner = this.machine.gesture?.owner;
    this.machine.release(); this.endingDiagram = false;
    if (owner) this.host.cancel(reason, owner);
  }
  bind(viewport: HTMLElement): void {
    viewport.addEventListener('pointerdown', event => this.down(event), {capture: true});
    viewport.addEventListener('pointermove', event => this.move(event), {capture: true});
    viewport.addEventListener('pointerrawupdate', event => {
      if (this.machine.gesture?.owner === 'ink') this.move(event as PointerEvent);
    }, {capture: true});
    viewport.addEventListener('pointerup', event => this.up(event), {capture: true});
    viewport.addEventListener('pointercancel', event => this.up(event), {capture: true});
    viewport.addEventListener('lostpointercapture', event => {
      // An older release may be delivered after the same pointer was recaptured.
      if (event.target === viewport && !viewport.hasPointerCapture(event.pointerId) && this.machine.owns(event.pointerId)) this.cancel('capture-lost');
    }, {capture: true});
    viewport.addEventListener('pointerover', event => { if (!this.machine.gesture) this.host.hover(event); }, {capture: true});
    viewport.addEventListener('dblclick', event => this.host.doubleClick(event), {capture: true});
    viewport.addEventListener('wheel', event => this.host.wheel(event), {capture: true, passive: false});
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.machine.gesture) {
        this.cancel('escape'); event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (this.host.key(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, {capture: true});
    window.addEventListener('blur', () => this.cancel('blur'));
  }
}
