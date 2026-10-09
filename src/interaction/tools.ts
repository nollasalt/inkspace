export type InputDevice = "mouse" | "pen";
export type Tool =
  | "select"
  | "pen"
  | "erase"
  | "pan"
  | "text"
  | "shape"
  | "diagram"
  | "pdftext";
const valid = new Set<Tool>([
  "select",
  "pen",
  "erase",
  "pan",
  "text",
  "shape",
  "diagram",
  "pdftext",
]);

/** Device preferences are independent of gesture ownership and document history. */
export class InputTools {
  private tools: Record<InputDevice, Tool> = { mouse: "select", pen: "pen" };
  private previous: Record<InputDevice, Tool> = { mouse: "select", pen: "pen" };
  device: InputDevice = "mouse";
  get(device: string = this.device): Tool {
    return this.tools[device === "pen" ? "pen" : "mouse"];
  }
  use(device: string): void {
    if (device === "mouse" || device === "pen") this.device = device;
  }
  set(next: Tool, toggle = false): Tool {
    if (!valid.has(next)) return this.get();
    const device = this.device,
      current = this.tools[device];
    if (toggle && next === current) next = this.previous[device];
    if (next !== current) {
      this.previous[device] = current;
      this.tools[device] = next;
    }
    return next;
  }
  snapshot() {
    return { ...this.tools };
  }
  restore(value: unknown): void {
    if (!value || typeof value !== "object") return;
    for (const device of ["mouse", "pen"] as const) {
      const tool = (value as Record<string, Tool>)[device];
      // A one-shot shape placement must not resume after restarting the editor.
      if (valid.has(tool) && tool !== "shape") this.tools[device] = tool;
    }
  }
}
