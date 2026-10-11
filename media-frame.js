// A single screen-space selection frame. Its chrome never changes document bounds.
(() => {
  let installed = false,
    signature = "";
  const strip = document.createElement("div");
  strip.className = "media-action-strip";
  strip.hidden = true;
  strip.setAttribute("role", "toolbar");
  strip.setAttribute("aria-label", "选中内容操作");
  const handles = document.createElement("div");
  handles.className = "media-frame-handles";
  handles.hidden = true;
  const width = document.createElement("button"),
    height = document.createElement("button");
  width.className = "note-resize media-width";
  width.type = "button";
  width.title = "调整排版宽度（改变换行）";
  width.setAttribute("aria-label", width.title);
  height.className = "note-height-resize media-height";
  height.type = "button";
  height.title = "调整小窗高度";
  height.setAttribute("aria-label", height.title);
  handles.append(width, height);
  const commands = () => window.inkspaceCommands;
  function install() {
    if (installed) return;
    installed = true;
    window.inkspaceWorkbenchUI.preserveNativeKeys(strip);
    viewport.append(strip, handles);
    refresh();
  }
  function refresh() {
    if (!installed) return;
    const editing = window.inkspaceInlineText?.isEditing(),
      entries = commands().selection(),
      single = commands().single(),
      note = single?.kind === "notes" ? single.value : null;
    const visible =
      !selectionRect &&
      entries.length > 0 &&
      ["select", "text", "diagram", "pan"].includes(
        pointerTool({ pointerType: "mouse" }),
      ) &&
      !viewport.classList.contains("pen-input") &&
      !editing;
    strip.hidden = !visible;
    handles.hidden = !visible;
    $("#selection").classList.toggle("media-selection", visible);
    const scale = $("#selection .selection-scale");
    if (scale)
      scale.style.display =
        visible && (!note || note.kind === "image") ? "block" : "none";
    strip.classList.toggle("media-editor-strip", editing);
    if (editing) {
      showEditorStrip();
      return;
    }
    if (!visible) return;
    const ids = entries.map((e) => e.kind + ":" + e.value.id).join("|"),
      key =
        ids +
        ":" +
        note?.viewMode +
        ":" +
        note?.format +
        ":" +
        commands().describe("ungroup").enabled +
        ":" +
        JSON.stringify(doc.blockState);
    if (key !== signature) {
      signature = key;
      strip.replaceChildren();
      const badge = document.createElement("span");
      badge.className = "media-type-label media-grip";
      badge.title = window.inkspaceArrangement?.selectionLocked()
        ? "内容已锁定"
        : "拖动移动选中内容";
      badge.textContent =
        entries.length > 1
          ? entries.length + " 项"
          : window.inkspaceBlocks.descriptor(single)?.label || "内容";
      strip.append(badge);
      if (window.inkspaceArrangement?.selectionLocked()) addButton("lock");
      if (commands().describe("open-link").enabled) addButton("open-link");
      if (commands().describe("edit").enabled) addButton("edit");
      if (commands().describe("view").enabled) addButton("view");
      if (note && note.kind !== "image") addButton("text-window");
      if (entries.length > 1) addButton("group");
      if (commands().describe("ungroup").enabled) addButton("ungroup");
      const more = document.createElement("button");
      more.type = "button";
      more.innerHTML = window.inkspaceWorkbenchUI.icon("more");
      more.title = "更多操作";
      more.setAttribute("aria-label", more.title);
      more.onclick = () => {
        const r = more.getBoundingClientRect();
        window.inkspaceBlocks.contextMenu({
          clientX: r.left,
          clientY: r.bottom + 4,
          target: viewport,
          pointerType: "mouse",
          preventDefault() {},
        });
      };
      strip.append(more);
    }
    const vp = viewport.getBoundingClientRect(),
      r = $("#selection").getBoundingClientRect();
    positionStrip(r, vp);
    $("#selection").style.setProperty(
      "--selection-control-unit",
      1 / (r.width / Math.max(1e-9, parseFloat($("#selection").style.width))) +
        "px",
    );
    const locked = window.inkspaceArrangement?.selectionLocked();
    if (scale && locked) scale.style.display = "none";
    width.hidden = locked || !note || note.kind === "image";
    height.hidden =
      locked || !note || note.kind === "image" || note.viewMode !== "window";
    for (const control of [width, height])
      control.dataset.blockId = note?.id || "";
    if (!width.hidden)
      Object.assign(width.style, {
        left: r.right - vp.left - 3 + "px",
        top: r.top - vp.top + r.height / 2 - 11 + "px",
      });
    if (!height.hidden)
      Object.assign(height.style, {
        left: r.left - vp.left + r.width / 2 - 11 + "px",
        top: r.bottom - vp.top - 3 + "px",
      });
  }
  function addButton(id) {
    const descriptor = commands().describe(id),
      button = document.createElement("button");
    button.type = "button";
    button.dataset.command = id;
    const name = { edit: "pen", view: "expand", "text-window": "window" }[id];
    if (name) button.innerHTML = window.inkspaceWorkbenchUI.icon(name);
    else button.textContent = descriptor.label;
    button.title = descriptor.label;
    button.setAttribute("aria-label", descriptor.label);
    if (id === "text-window")
      button.setAttribute(
        "aria-pressed",
        String(commands().text()?.viewMode === "window"),
      );
    button.onclick = () => commands().execute(id);
    strip.append(button);
  }
  function positionStrip(r, vp) {
    const w = strip.offsetWidth,
      h = strip.offsetHeight;
    const top = r.top - vp.top - 64; // The connection port occupies the nearer vertical band.
    Object.assign(strip.style, {
      left:
        Math.max(
          4,
          Math.min(vp.width - w - 4, r.left - vp.left + (r.width - w) / 2),
        ) + "px",
      top:
        Math.max(
          4,
          Math.min(vp.height - h - 4, top >= 4 ? top : r.bottom - vp.top + 36),
        ) + "px",
    });
  }
  function showEditorStrip() {
    const note = window.inkspaceInlineText.selectedNote(),
      cache = note && noteCache.get(note.id);
    if (!cache) return;
    strip.hidden = false;
    handles.hidden = true;
    const key =
      "editing:" +
      note.id +
      ":" +
      !!window.inkspaceInlineText.editingState()?.fragment;
    if (signature !== key) {
      signature = key;
      strip.replaceChildren();
      const add = (label, action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.onclick = action;
        strip.append(button);
      };
      const title = document.createElement("span");
      title.className = "media-editor-title";
      title.textContent = window.inkspaceInlineText.editingState()?.fragment
        ? "编辑当前片段"
        : InkBlockModel.textFormat(note) === "html"
          ? "HTML 源码"
          : "Markdown 源码";
      strip.append(title);
      if (window.inkspaceInlineText.editingState()?.fragment)
        add("完整源码", () => window.inkspaceInlineText.fullSource());
      add("取消", () => window.inkspaceInlineText.cancel());
      add("完成", () => window.inkspaceInlineText.finish());
    }
    const r = cache.el
        .querySelector(".inline-note-editor")
        .getBoundingClientRect(),
      vp = viewport.getBoundingClientRect();
    Object.assign(strip.style, {
      left:
        Math.max(
          4,
          Math.min(vp.width - strip.offsetWidth - 4, r.left - vp.left),
        ) + "px",
      top:
        Math.max(
          4,
          Math.min(vp.height - strip.offsetHeight - 4, r.top - vp.top - 30),
        ) + "px",
    });
  }
  strip.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button === 0)
      event.preventDefault();
  });
  window.inkspaceMediaFrame = { install, refresh, strip, handles };
})();
