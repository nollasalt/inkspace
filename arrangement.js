// Shared block geometry, locks, ordering and drag feedback. No pointer listeners.
(() => {
  const previousValidator = valid;
  const reference = (r) =>
    r &&
    ["strokes", "notes", "shapes", "pdfs", "pdfPages", "diagram"].includes(
      r.kind,
    ) &&
    typeof r.id === "string" &&
    /^[\w-]+$/.test(r.id);
  const target = (t) =>
    t === null ||
    (t &&
      typeof t.page === "string" &&
      /^[\w-]+$/.test(t.page) &&
      (t.bookmark === undefined ||
        (typeof t.bookmark === "string" && /^[\w-]+$/.test(t.bookmark))));
  valid = function (value) {
    return (
      previousValidator(value) &&
      (value.blockState === undefined ||
        (Array.isArray(value.blockState) &&
          value.blockState.length <= 100000 &&
          value.blockState.every(
            (s) =>
              reference(s) &&
              (s.locked === undefined || typeof s.locked === "boolean") &&
              (s.link === undefined || target(s.link)),
          ))) &&
      (value.blockOrder === undefined ||
        (Array.isArray(value.blockOrder) &&
          value.blockOrder.length <= 100000 &&
          value.blockOrder.every(reference) &&
          new Set(value.blockOrder.map(key)).size ===
            value.blockOrder.length)) &&
      (value.bookmarks === undefined ||
        (Array.isArray(value.bookmarks) &&
          value.bookmarks.length <= 10000 &&
          new Set(value.bookmarks.map((b) => b?.id)).size ===
            value.bookmarks.length &&
          value.bookmarks.every(
            (b) =>
              b &&
              typeof b.id === "string" &&
              /^[\w-]+$/.test(b.id) &&
              typeof b.name === "string" &&
              b.name.trim().length > 0 &&
              b.name.length <= 100 &&
              b.rect &&
              [b.rect.x, b.rect.y, b.rect.w, b.rect.h].every(Number.isFinite) &&
              b.rect.w > 0 &&
              b.rect.h > 0,
          )))
    );
  };
  const key = (r) => r.kind + ":" + r.id;
  const selection = () => window.inkspaceBlocks.references();
  let stateSource,
    stateIndex = new Map();
  const state = (ref) => {
    if (stateSource !== doc.blockState) {
      stateSource = doc.blockState;
      stateIndex = new Map((stateSource || []).map((s) => [key(s), s]));
    }
    return stateIndex.get(key(ref));
  };
  const locked = (ref) => !!state(ref)?.locked;
  const selectionLocked = () => selection().some(locked);
  function entries(includeInk = true, geometry = true) {
    const result = [];
    for (const kind of [
      ...(includeInk ? ["strokes", "shapes"] : []),
      "pdfPages",
      "notes",
    ])
      for (const [index, item] of blockItems(kind).entries()) {
        blockIdentity(item);
        const value = kind === 'strokes' ? doc.strokes[index] : item;
        result.push({
          kind,
          id: value.id,
          index: kind === "pdfPages" ? value.id : index,
          value,
          bounds: geometry ? itemBounds(kind, value) : null,
        });
      }
    const graph = window.inkspaceDiagram?.graph;
    if (graph)
      for (const cell of graph.getChildCells(
        graph.getDefaultParent(),
        true,
        true,
      )) {
        if (!geometry) {
          result.push({
            kind: "diagram",
            id: cell.id,
            index: cell.id,
            value: cell,
            bounds: null,
          });
          continue;
        }
        const coverage = window.inkspaceDiagram.coverage([cell]);
        const bounds = union(
          coverage.boxes.concat(
            coverage.lines.flatMap((l) =>
              l.points.map((p) => ({ ...p, w: 0, h: 0 })),
            ),
          ),
        );
        if (bounds)
          result.push({
            kind: "diagram",
            id: cell.id,
            index: cell.id,
            value: cell,
            bounds,
          });
      }
    return result;
  }
  function ordered(includeInk = false, geometry = true) {
    const all = entries(includeInk, geometry),
      order = new Map((doc.blockOrder || []).map((r, i) => [key(r), i]));
    const defaults = {
      pdfPages: 0,
      diagram: 1,
      notes: 2,
      shapes: 3,
      strokes: 4,
    };
    return all.sort((a, b) => {
      const ai = order.get(key(a)),
        bi = order.get(key(b));
      if (ai !== undefined || bi !== undefined)
        return ai === undefined ? -1 : bi === undefined ? 1 : ai - bi;
      return defaults[a.kind] - defaults[b.kind];
    });
  }
  function pick(event) {
    const p = local(event),
      pos = world(p.x, p.y),
      graph = window.inkspaceDiagram?.graph;
    const hits = ordered().filter((e) =>
      e.kind === "diagram"
        ? graph.intersects(graph.view.getState(e.value), p.x, p.y)
        : InkInteraction.contains(e.bounds, pos),
    );
    const ink = hitCanvasItem(pos);
    if (ink && ["strokes", "shapes"].includes(ink.kind)) {
      const value = blockValue(ink.kind, ink.index);
      return { ...ink, id: value.id };
    }
    const hit = hits.at(-1);
    return hit ? { kind: hit.kind, index: hit.index, id: hit.id } : null;
  }
  function setState(refs, patch) {
    const wanted = new Set(refs.map(key)),
      old = doc.blockState || [];
    doc.blockState = old
      .filter((s) => !wanted.has(key(s)))
      .concat(
        refs.map((ref) => ({
          ...state(ref),
          kind: ref.kind,
          id: ref.id,
          ...patch,
        })),
      );
  }
  function toggleLock() {
    const refs = selection();
    if (!refs.length) return;
    const next = !refs.some(locked);
    window.inkspaceTransactions.run("锁定", () =>
      setState(refs, { locked: next }),
    );
  }
  function order(direction) {
    if (selectionLocked()) return;
    const chosen = new Set(selection().map(key));
    if (!chosen.size) return;
    const all = ordered(),
      moving = all.filter((e) => chosen.has(key(e))),
      rest = all.filter((e) => !chosen.has(key(e)));
    if (!moving.length) return;
    window.inkspaceTransactions.run("层级", () => {
      doc.blockOrder = (
        direction === "front" ? rest.concat(moving) : moving.concat(rest)
      ).map(({ kind, id }) => ({ kind, id }));
    });
  }
  function moveEntry(entry, dx, dy) {
    window.inkspaceBlocks.selectReferences([
      { kind: entry.kind, id: entry.id },
    ]);
    detachSelection();
    moveSelection(dx, dy);
  }
  function align(mode) {
    if (selectionLocked()) return;
    const refs = selection(),
      wanted = new Set(refs.map(key)),
      chosen = entries().filter((e) => wanted.has(key(e)) && e.bounds);
    if (chosen.length < (mode.startsWith("distribute") ? 3 : 2)) return;
    let units = chosen.map((e) => ({ entries: [e], bounds: e.bounds }));
    for (const group of doc.groups || []) {
      const members = new Set(InkBlockModel.groupMembers(doc, group).map(key)),
        related = units.filter((u) =>
          u.entries.some((e) => members.has(key(e))),
        );
      if (related.length > 1) {
        const entries = related.flatMap((u) => u.entries);
        units = units
          .filter((u) => !related.includes(u))
          .concat({ entries, bounds: union(entries.map((e) => e.bounds)) });
      }
    }
    if (units.length < (mode.startsWith("distribute") ? 3 : 2)) return;
    const bounds = union(units.map((e) => e.bounds)),
      moves = [];
    if (mode.startsWith("distribute")) {
      const axis = mode.endsWith("x") ? "x" : "y",
        size = axis === "x" ? "w" : "h";
      units.sort((a, b) => a.bounds[axis] - b.bounds[axis]);
      const total = units.reduce((sum, e) => sum + e.bounds[size], 0),
        gap = (bounds[size] - total) / (units.length - 1);
      let at = bounds[axis];
      for (const e of units) {
        moves.push([
          e,
          axis === "x" ? at - e.bounds.x : 0,
          axis === "y" ? at - e.bounds.y : 0,
        ]);
        at += e.bounds[size] + gap;
      }
    } else
      for (const e of units) {
        const b = e.bounds;
        const dx =
          mode === "left"
            ? bounds.x - b.x
            : mode === "center"
              ? bounds.x + bounds.w / 2 - b.x - b.w / 2
              : mode === "right"
                ? bounds.x + bounds.w - b.x - b.w
                : 0;
        const dy =
          mode === "top"
            ? bounds.y - b.y
            : mode === "middle"
              ? bounds.y + bounds.h / 2 - b.y - b.h / 2
              : mode === "bottom"
                ? bounds.y + bounds.h - b.y - b.h
                : 0;
        moves.push([e, dx, dy]);
      }
    if (moves.every(([, x, y]) => !x && !y)) return;
    window.inkspaceTransactions.run("对齐", () => {
      for (const [unit, x, y] of moves)
        for (const e of unit.entries) moveEntry(e, x, y);
      window.inkspaceBlocks.selectReferences(refs);
    });
  }
  const guides = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  guides.classList.add("arrangement-guides");
  guides.setAttribute("aria-hidden", "true");
  viewport.append(guides);
  const feedback = document.createElement("span");
  feedback.className = "arrangement-size";
  feedback.hidden = true;
  viewport.append(feedback);
  function beginMove() {
    const chosen = new Set(selection().map(key));
    return {
      bounds: selectionBounds(),
      targets: entries(false)
        .filter(
          (e) =>
            !chosen.has(key(e)) &&
            e.bounds &&
            !(e.kind === "diagram" && e.value.edge),
        )
        .map((e) => e.bounds),
    };
  }
  function snap(context, dx, dy, bypass) {
    if (!context?.bounds) return { x: dx, y: dy };
    const result = InkInteraction.snapMove(
      context.bounds,
      dx,
      dy,
      context.targets,
      view.scale,
      bypass,
    );
    guides.replaceChildren();
    for (const g of result.guides) {
      const line = document.createElementNS(guides.namespaceURI, "line");
      const p = g.value * view.scale + view[g.axis],
        from = g.from * view.scale + view[g.axis === "x" ? "y" : "x"],
        to = g.to * view.scale + view[g.axis === "x" ? "y" : "x"];
      Object.entries(
        g.axis === "x"
          ? { x1: p, x2: p, y1: from - 12, y2: to + 12 }
          : { y1: p, y2: p, x1: from - 12, x2: to + 12 },
      ).forEach(([k, v]) => line.setAttribute(k, v));
      if (g.spacing) line.classList.add("spacing");
      guides.append(line);
    }
    return result;
  }
  function clearFeedback() {
    guides.replaceChildren();
    feedback.hidden = true;
  }
  function showSize() {
    if (
      !active ||
      !["resize-selection", "resize-note", "resize-window"].includes(
        active.type,
      )
    ) {
      feedback.hidden = true;
      return;
    }
    const r = $("#selection").getBoundingClientRect(),
      vp = viewport.getBoundingClientRect();
    feedback.textContent =
      Math.round(r.width / view.scale) +
      " × " +
      Math.round(r.height / view.scale);
    feedback.hidden = false;
    feedback.style.left =
      Math.max(4, Math.min(vp.width - 120, r.right - vp.left + 12)) + "px";
    feedback.style.top =
      Math.max(4, Math.min(vp.height - 24, r.bottom - vp.top + 8)) + "px";
  }
  // Live mxGraph nodes are hosted individually, so the same z-order applies to
  // PDFs, HTML/Markdown, images and graph cells. There is no snapshot raster.
  const portals = new Map();
  function syncLayers() {
    const media = ordered(false, false),
      live = new Set(),
      pdfNodes = new Map(
        [...document.querySelectorAll(".pdf-page")].map((el) => [
          el.dataset.page,
          el,
        ]),
      );
    media.forEach((entry, index) => {
      let el;
      if (entry.kind === "notes") el = noteCache.get(entry.id)?.el;
      else if (entry.kind === "pdfPages") el = pdfNodes.get(entry.id);
      else if (entry.kind === "diagram") {
        const state = window.inkspaceDiagram.graph.view.getState(entry.value);
        if (!state) return;
        live.add(entry.id);
        let portal = portals.get(entry.id);
        if (!portal) {
          portal = document.createElement("div");
          portal.className = "diagram-cell-layer";
          portal.dataset.cell = entry.id;
          const svg = document.createElementNS(guides.namespaceURI, "svg");
          portal.append(svg);
          $("#scene").append(portal);
          portals.set(entry.id, portal);
        }
        for (const node of [state.shape?.node, state.text?.node])
          if (node) {
            const parent =
              node.namespaceURI === guides.namespaceURI
                ? portal.firstChild
                : portal;
            if (node.parentNode !== parent) parent.append(node);
          }
        el = portal;
      }
      if (el) {
        el.style.zIndex = String(index + 10);
        el.classList.toggle("block-locked", locked(entry));
      }
    });
    for (const [id, el] of portals)
      if (!live.has(id)) {
        el.remove();
        portals.delete(id);
      }
    showSize();
  }
  function label(entry) {
    if (entry.kind === "notes")
      return entry.value.kind === "image"
        ? "图片"
        : entry.value.markdown
            .replace(/[#*`<>]/g, "")
            .trim()
            .slice(0, 36) || "文本";
    if (entry.kind === "diagram")
      return (
        String(entry.value.value || "").slice(0, 36) ||
        (entry.value.edge ? "连接线" : "图形")
      );
    return entry.kind === "pdfPages"
      ? "PDF · " + (entry.value.pageIndex + 1)
      : entry.kind === "strokes"
        ? "笔迹"
        : "手绘图形";
  }
  function inspect(parent) {
    const refs = selection();
    if (!refs.length) return;
    const section = document.createElement("div");
    section.className = "workbench-section";
    const title = document.createElement("h4");
    title.textContent = "编排";
    section.append(title);
    const row = document.createElement("div");
    row.className = "workbench-choices";
    section.append(row);
    for (const id of ["lock", "layers", "link-to"]) {
      const command = window.inkspaceCommands.describe(id),
        button = document.createElement("button");
      button.textContent = id === "layers" ? "层级…" : id === "link-to" ? "链接…" : command.label;
      button.title = command.label;
      button.onclick = () => window.inkspaceCommands.execute(id);
      row.append(button);
    }
    if (refs.length > 1 && !selectionLocked()) {
      const grid = document.createElement("div");
      grid.className = "arrangement-align";
      for (const [mode, name] of [
        ["left", "左"],
        ["center", "水平居中"],
        ["right", "右"],
        ["top", "顶"],
        ["middle", "垂直居中"],
        ["bottom", "底"],
        ["distribute-x", "等距横排"],
        ["distribute-y", "等距纵排"],
      ]) {
        const button = document.createElement("button");
        button.textContent = name;
        button.title = name + "对齐";
        button.disabled = mode.startsWith("distribute") && refs.length < 3;
        button.onclick = () => align(mode);
        grid.append(button);
      }
      section.append(grid);
    }
    parent.append(section);
  }
  function openLayers() {
    const dialog = window.inkspacePlaces.dialog("内容层级");
    const help = document.createElement("p");
    help.textContent = "上方优先显示。点击可选择被遮挡的块；墨迹保持在标注层。";
    dialog.body.append(help);
    const list = document.createElement("div");
    list.className = "place-list";
    dialog.body.append(list);
    const refresh = () => {
      list.replaceChildren();
      for (const button of dialog.actions.querySelectorAll(
        "[data-layer-order]",
      ))
        button.disabled = !window.inkspaceCommands.describe(
          button.dataset.layerOrder,
        ).enabled;
      const chosen = new Set(selection().map(key));
      for (const entry of ordered(true, false).reverse()) {
        const row = document.createElement("div");
        row.className = "layer-row";
        const button = document.createElement("button");
        button.textContent = (locked(entry) ? "🔒 " : "") + label(entry);
        button.classList.toggle("active", chosen.has(key(entry)));
        button.onclick = () => {
          window.inkspaceBlocks.selectReferences([entry]);
          refresh();
        };
        const toggle = document.createElement("button");
        toggle.textContent = locked(entry) ? "解锁" : "锁定";
        toggle.onclick = () => {
          window.inkspaceTransactions.run("锁定", () =>
            setState([entry], { locked: !locked(entry) }),
          );
          refresh();
        };
        row.append(button, toggle);
        list.append(row);
      }
    };
    for (const [mode, name] of [
      ["front", "置顶"],
      ["back", "置底"],
    ]) {
      const button = document.createElement("button");
      button.textContent = name;
      button.dataset.layerOrder = mode;
      button.onclick = () => {
        order(mode);
        refresh();
      };
      dialog.actions.prepend(button);
    }
    refresh();
  }
  window.inkspaceArrangement = {
    key,
    state,
    locked,
    selectionLocked,
    entries,
    ordered,
    pick,
    setState,
    toggleLock,
    order,
    align,
    beginMove,
    snap,
    clearFeedback,
    syncLayers,
    inspect,
    label,
    openLayers,
  };
  const originalOverlay = overlaySelection;
  overlaySelection = function () {
    originalOverlay();
    syncLayers();
  };
})();
