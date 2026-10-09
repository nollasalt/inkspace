// The workbench projects state; the router owns gestures, commands own mutations.
(() => {
  const paths = {
    pointer: '<path d="m4 3 7.5 18 2.5-7 7-2.5Z"/>',
    pen: '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5 M3 22h18"/>',
    eraser:
      '<path d="m16 3 5 5a2 2 0 0 1 0 3L10 22H6l-4-4a2 2 0 0 1 0-3L13 3a2 2 0 0 1 3 0Z M8 9l7 7 M10 22h12"/>',
    shapes:
      '<path d="m3 3 6 10H1Z"/><rect x="12" y="3" width="9" height="9" rx="1"/><circle cx="6" cy="19" r="4"/><path d="m17 14 5 5-5 4-5-4Z"/>',
    plus: '<path d="M12 5v14 M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="m12 5-7 7 7 7 M5 12h14"/>',
    close: '<path d="m6 6 12 12 M6 18 18 6"/>',
    panel:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
    window:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
    page: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6"/><circle cx="12" cy="15" r="3"/><path d="M12 10v2 M12 18v2 M7 15h2 M15 15h2"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9Z M2 13l10 6 10-6 M2 17l10 6 10-6"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    text: '<path d="M4 4h16 M12 4v16 M8 20h8"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    expand: '<path d="M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"/>',
    rect: '<rect x="3" y="5" width="18" height="14"/>',
    roundrect: '<rect x="3" y="5" width="18" height="14" rx="3"/>',
    ellipse: '<circle cx="12" cy="12" r="9"/>',
    diamond: '<path d="m12 2 10 10-10 10L2 12Z"/>',
    arrow: '<path d="M3 12h18 m-6-6 6 6-6 6"/>',
    line: '<path d="m3 21 18-18"/>',
  };
  const icon = (name) =>
    '<svg class="workbench-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths.more) +
    "</svg>";
  function decorate(el, label, name, trailing) {
    el.replaceChildren();
    if (name) el.insertAdjacentHTML("beforeend", icon(name));
    if (label) {
      const span = document.createElement("span");
      span.textContent = label;
      el.append(span);
    }
    if (trailing) el.insertAdjacentHTML("beforeend", icon(trailing));
    return el;
  }
  function preserveNativeKeys(element) {
    element.addEventListener("keydown", (event) => {
      if (
        ["Enter", " "].includes(event.key) &&
        event.target.closest("button,summary")
      )
        event.stopPropagation();
    });
  }
  window.inkspaceWorkbenchUI = { icon, decorate, preserveNativeKeys };

  function install(preferences = {}) {
    if (document.body.classList.contains("media-workbench"))
      return window.inkspaceWorkbench;
    document.body.classList.add("media-workbench");
    const sidebar = $("#diagram-sidebar"),
      toolbar = $("header .tools"),
      header = $("header");
    const documentLabel = document.createElement("span");
    documentLabel.className = "workbench-note-label";
    viewport.append(documentLabel);
    // Stage first, panel second: never inherit the old left-rail layout.
    $("#editor-area").append(sidebar);
    let sidebarWidth = Math.max(
      176,
      Math.min(380, Number(preferences.sidebarWidth) || 224),
    );
    document.body.style.setProperty(
      "--workbench-sidebar-width",
      sidebarWidth + "px",
    );
    const diagramOptions = $("#diagram-options"),
      palette = $("#diagram-palette"),
      pageSettings = $(".settings-panel").closest("details");
    const shapeButtons = [...palette.querySelectorAll("[data-diagram]")];
    const toolOptions = $("#tool-options"),
      pdfLibrary = $("#pdf-library"),
      utilities = $("#svg");
    const pdfControls = [
      $("#pdf-import"),
      $("#pdf-manage"),
      $("#pdf-export"),
      $("[data-tool=pdftext]"),
      $("#pdf-options"),
    ];
    const sidebarToggle = $("#diagram-sidebar-toggle"),
      undoButton = $("#undo"),
      redoButton = $("#redo");
    sidebar.replaceChildren();
    const button = (label, title, action, id, name) => {
      const el = document.createElement("button");
      el.type = "button";
      decorate(el, label, name);
      el.title = title;
      el.setAttribute("aria-label", title);
      if (id) el.id = id;
      el.onclick = action;
      return el;
    };
    const panelHeader = document.createElement("div");
    panelHeader.className = "workbench-panel-header";
    const back = button(
      "",
      "返回属性",
      () => exitResource(),
      "workbench-panel-back",
      "back",
    );
    const propertyTitle = document.createElement("span");
    propertyTitle.id = "tool-properties-title";
    propertyTitle.className = "workbench-panel-title";
    const close = button(
      "",
      "关闭属性栏",
      () => {
        exitResource(false);
        setDiagramSidebarCollapsed(true);
        refresh();
      },
      "workbench-panel-close",
      "close",
    );
    panelHeader.append(back, propertyTitle, close);
    const panelBody = document.createElement("div");
    panelBody.className = "workbench-panel-body";
    sidebar.append(panelHeader, panelBody);
    const section = (id) => {
      const el = document.createElement("section");
      el.id = id;
      panelBody.append(el);
      return el;
    };
    const heading = (label, parent) => {
      const el = document.createElement("h4");
      el.textContent = label;
      parent.append(el);
      return el;
    };
    const subSection = (parent, title) => {
      const el = document.createElement("div");
      el.className = "workbench-section";
      heading(title, el);
      parent.append(el);
      return el;
    };
    const note = (parent, text) => {
      const el = document.createElement("p");
      el.className = "workbench-note";
      el.textContent = text;
      parent.append(el);
      return el;
    };
    const properties = section("tool-properties");
    const inputSection = subSection(properties, "配置输入设备");
    const inputChoices = choices(
      inputSection,
      [
        ["mouse", "鼠标"],
        ["pen", "触控笔"],
      ],
      inputTools.device,
      (value) => useInputDevice(value),
    );
    inputChoices.classList.add("workbench-input-choices");
    note(
      inputSection,
      "鼠标默认编排，笔默认书写；工具分别记忆。中键始终移动画布。",
    );
    properties.append(toolOptions);
    const blockProperties = document.createElement("div");
    blockProperties.id = "block-properties";
    properties.append(blockProperties);
    const graphProperties = document.createElement("div");
    graphProperties.id = "graph-properties";
    heading("外观", graphProperties);
    graphProperties.append(diagramOptions);
    properties.append(graphProperties);
    const description = note(properties, "");
    description.id = "interaction-help";
    const graphSection = section("sidebar-diagram");
    const placementSection = subSection(graphSection, "创建方式"),
      placement = document.createElement("div");
    placement.className = "workbench-choices";
    placement.setAttribute("role", "group");
    placement.setAttribute("aria-label", "图形创建方式");
    placementSection.append(placement);
    let placementMode = "center",
      shapeKind = "rect",
      repeat = false,
      resource = null,
      propertyKey = "";
    const shapePreview = document.createElement("div");
    shapePreview.className = "workbench-shape-preview";
    shapePreview.hidden = true;
    viewport.append(shapePreview);
    function previewShape(start, end) {
      const b = normalized(start, end);
      shapePreview.hidden = false;
      shapePreview.dataset.kind = shapeKind;
      Object.assign(shapePreview.style, {
        left: view.x + b.x * view.scale + "px",
        top: view.y + b.y * view.scale + "px",
        width: Math.max(1, b.w * view.scale) + "px",
        height: Math.max(1, b.h * view.scale) + "px",
      });
    }
    function clearShapePreview() {
      shapePreview.hidden = true;
    }
    const centerButton = button("居中插入", "在可见画布中心插入", () =>
      setPlacement("center"),
    );
    const drawButton = button("拖动绘制", "在画布拖动确定位置和大小", () =>
      setPlacement("draw"),
    );
    placement.append(centerButton, drawButton);
    subSection(graphSection, "基础图形").append(palette);
    const shapeLabels = {
      rect: "矩形",
      roundrect: "圆角矩形",
      ellipse: "椭圆",
      diamond: "判断",
      arrow: "箭头",
      line: "直线",
    };
    for (const el of shapeButtons)
      decorate(el, shapeLabels[el.dataset.diagram], el.dataset.diagram);
    const placing = subSection(graphSection, "放置"),
      graphHelp = note(placing, "");
    const repeatLabel = document.createElement("label");
    repeatLabel.className = "workbench-repeat";
    const repeatInput = document.createElement("input");
    repeatInput.type = "checkbox";
    repeatInput.onchange = () => (repeat = repeatInput.checked);
    repeatLabel.append(repeatInput, "连续绘制");
    placing.append(repeatLabel);
    const graphAdvanced = document.createElement("details");
    graphAdvanced.className = "workbench-advanced";
    const graphAdvancedTitle = document.createElement("summary");
    graphAdvancedTitle.textContent = "更多图形与原稿";
    graphAdvanced.append(graphAdvancedTitle);
    graphSection.append(graphAdvanced);
    const extraShapes = document.createElement("div");
    extraShapes.className = "workbench-resource-grid";
    extraShapes.append(
      ...shapeButtons.filter((el) =>
        ["arrow", "line"].includes(el.dataset.diagram),
      ),
    );
    subSection(graphAdvanced, "线条").append(extraShapes);
    const graphFiles = subSection(graphAdvanced, "原稿");
    const fileChoices = document.createElement("div");
    fileChoices.className = "workbench-choices";
    fileChoices.append($("#diagram-import"), $("#diagram-export"));
    graphFiles.append(fileChoices);
    const pdfSection = section("sidebar-pdf");
    pdfLibrary.querySelector("h3")?.remove();
    subSection(pdfSection, "PDF 原稿").append(...pdfControls.slice(0, 3));
    subSection(pdfSection, "内容操作").append(...pdfControls.slice(3));
    pdfSection.append(pdfLibrary);
    pageSettings.id = "sidebar-page-settings";
    pageSettings.className = "workbench-page-settings";
    pageSettings.open = true;
    pageSettings.querySelector("summary").hidden = true;
    panelBody.append(pageSettings);
    const exportSection = section("sidebar-utilities");
    heading("导出", exportSection);
    exportSection.append(utilities);
    // Keep the established model writers. Their presentation follows DESIGN.
    const selectValue = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    );
    const labels = {
      width: "粗细",
      "diagram-width": "边线粗细",
      "page-layout": "画布布局",
      "background-kind": "背景",
      "text-size": "默认字号",
      "background-spacing": "背景间距",
    };
    for (const id of Object.keys(labels)) {
      const select = $("#" + id),
        label = select.closest("label"),
        field = document.createElement("div"),
        title = document.createElement("h4"),
        group = document.createElement("div");
      field.className = "sidebar-choice-field workbench-section";
      title.textContent = labels[id];
      group.className = "sidebar-choices";
      group.dataset.choice = id;
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", title.textContent);
      if (label) label.replaceWith(field);
      else select.before(field);
      field.append(title, select, group);
      select.hidden = true;
      const shortLabels = {
        width: ["极细", "细", "中", "粗"],
        "page-layout": ["连续", "A4 竖向", "A4 横向"],
        "background-kind": ["空白", "点阵", "横线", "网格"],
      };
      for (const [index, option] of Array.from(select.options).entries()) {
        const el = button(
          shortLabels[id]?.[index] || option.textContent,
          option.textContent,
          () => {
            if (select.disabled || select.value === option.value) return;
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          },
        );
        el.dataset.value = option.value;
        group.append(el);
      }
      const choiceButtons = [...group.children];
      const sync = () => {
        for (const el of choiceButtons) {
          el.classList.toggle("active", el.dataset.value === select.value);
          el.setAttribute(
            "aria-pressed",
            String(el.dataset.value === select.value),
          );
          el.disabled = select.disabled;
        }
      };
      Object.defineProperty(select, "value", {
        configurable: true,
        get() {
          return selectValue.get.call(this);
        },
        set(value) {
          selectValue.set.call(this, value);
          sync();
        },
      });
      select.addEventListener("change", sync);
      new MutationObserver(sync).observe(select, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
      sync();
    }
    const settingsPanel = pageSettings.querySelector(".settings-panel"),
      backgroundField = $("#background-kind").closest(".sidebar-choice-field"),
      layoutField = $("#page-layout").closest(".sidebar-choice-field");
    const extraFields = ["text-size", "background-spacing"].map((id) =>
      $("#" + id).closest(".sidebar-choice-field"),
    );
    const backgroundColor = $("#background-color");
    backgroundColor.hidden = true;
    settingsPanel.replaceChildren();
    const paperSection = subSection(settingsPanel, "纸张");
    const whiteChoice = choices(
      paperSection,
      [["white", "白色"]],
      null,
      () => {},
    );
    whiteChoice.firstChild.disabled = true;
    whiteChoice.firstChild.setAttribute("aria-pressed", "true");
    settingsPanel.append(backgroundColor, backgroundField);
    note(
      subSection(settingsPanel, "页面边界"),
      "连续画布用于日常编排；A4 边界用于纸张布局与 PDF 对齐。",
    );
    settingsPanel.append(layoutField);
    const advanced = document.createElement("details");
    advanced.className = "workbench-advanced";
    const advancedTitle = document.createElement("summary");
    advancedTitle.textContent = "更多设置";
    advanced.append(advancedTitle, ...extraFields);
    settingsPanel.append(advanced);
    const backgroundChoices = backgroundField.querySelector(".sidebar-choices"),
      dotChoice = backgroundChoices.querySelector("[data-value=dots]");
    choices(subSection(advanced, "其他背景"), [], null, () => {}).append(
      dotChoice,
    );
    for (const value of ["ruled", "blank", "grid"])
      backgroundChoices.append(
        backgroundChoices.querySelector("[data-value=" + value + "]"),
      );
    const color = $("#color"),
      colorLabel = color.closest("label"),
      colorSection = document.createElement("div");
    colorSection.className = "workbench-section";
    heading("颜色", colorSection);
    const swatches = document.createElement("div");
    swatches.className = "workbench-swatches";
    for (const [value, name] of [
      ["#252525", "黑色"],
      ["#416996", "蓝色"],
      ["#a34343", "红色"],
    ]) {
      const el = button(" ", name, () => {
        color.value = value;
        color.dispatchEvent(new Event("change", { bubbles: true }));
      });
      el.style.setProperty("--swatch", value);
      el.className = "workbench-swatch";
      swatches.append(el);
    }
    color.setAttribute("aria-label", "自定义颜色");
    color.title = "自定义颜色";
    swatches.append(color);
    colorLabel.replaceWith(colorSection);
    colorSection.append(swatches);
    const selectButton = toolbar.querySelector("[data-tool=select]"),
      penButton = toolbar.querySelector("[data-tool=pen]"),
      eraseButton = toolbar.querySelector("[data-tool=erase]"),
      graphButton = toolbar.querySelector("[data-tool=diagram]");
    decorate(selectButton, "编排", "pointer");
    decorate(penButton, "画笔", "pen");
    decorate(eraseButton, "橡皮", "eraser");
    graphButton.removeAttribute("data-tool");
    graphButton.id = "sidebar-diagram-toggle";
    decorate(graphButton, "图形", "shapes");
    graphButton.onclick = () => openResource("diagram");
    toolbar.replaceChildren(selectButton, penButton, eraseButton, graphButton);
    toolbar.setAttribute("aria-label", "输入工具");
    for (const el of [selectButton, penButton, eraseButton])
      el.onclick = () => {
        exitResource();
        activateTool(el.dataset.tool, true);
      };
    const divider = document.createElement("span");
    divider.className = "workbench-divider";
    divider.setAttribute("aria-hidden", "true");
    const insertMenu = document.createElement("div");
    insertMenu.className = "workbench-menu";
    insertMenu.id = "workbench-insert-menu";
    insertMenu.hidden = true;
    insertMenu.setAttribute("role", "menu");
    const insertButton = button(
      "插入",
      "插入内容",
      () => {
        const opening = insertMenu.hidden,
          r = insertButton.getBoundingClientRect(),
          h = header.getBoundingClientRect();
        insertMenu.style.left =
          Math.max(4, Math.min(h.width - 166, r.left - h.left)) + "px";
        insertMenu.hidden = !opening;
        insertButton.setAttribute("aria-expanded", String(opening));
      },
      "workbench-insert",
      "plus",
    );
    insertButton.insertAdjacentHTML("beforeend", icon("down"));
    insertButton.setAttribute("aria-expanded", "false");
    for (const [id, name] of [
      ["insert-text", "text"],
      ["insert-image", "image"],
      ["insert-pdf", "page"],
    ])
      insertMenu.append(
        button(
          window.inkspaceCommands.describe(id).label.replace("…", ""),
          window.inkspaceCommands.describe(id).label,
          () => {
            insertMenu.hidden = true;
            insertButton.setAttribute("aria-expanded", "false");
            window.inkspaceCommands.execute(id);
          },
          null,
          name,
        ),
      );
    insertButton.setAttribute("aria-haspopup", "menu");
    insertButton.setAttribute("aria-controls", insertMenu.id);
    for (const el of insertMenu.children) el.setAttribute("role", "menuitem");
    insertButton.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (insertMenu.hidden) insertButton.click();
        insertMenu.firstChild.focus();
      }
    });
    insertMenu.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const items = [...insertMenu.children],
          index = items.indexOf(document.activeElement);
        items[
          (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) %
            items.length
        ].focus();
      }
    });
    const settingsButton = button(
      "页面设置",
      "当前画布的页面设置",
      () => openResource("settings"),
      "sidebar-settings-toggle",
      "page",
    );
    decorate(sidebarToggle, "属性", "panel");
    sidebarToggle.onclick = () => {
      if (resource) {
        exitResource(false);
        setDiagramSidebarCollapsed(true);
      } else
        setDiagramSidebarCollapsed(
          !document.body.classList.contains("diagram-sidebar-hidden"),
        );
      refresh();
    };
    const dormant = document.createElement("div");
    dormant.hidden = true;
    dormant.append($(".document-controls"), undoButton, redoButton);
    header.replaceChildren(
      toolbar,
      divider,
      insertButton,
      settingsButton,
      sidebarToggle,
      insertMenu,
      dormant,
    );
    header.setAttribute("aria-label", "全局画布操作");
    preserveNativeKeys(header);
    preserveNativeKeys(sidebar);
    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("#workbench-insert,#workbench-insert-menu")) {
        insertMenu.hidden = true;
        insertButton.setAttribute("aria-expanded", "false");
      }
    });
    for (const [name, el] of [
      ["undo", undoButton],
      ["redo", redoButton],
    ]) {
      el.addEventListener("pointerdown", (event) => {
        if (document.activeElement?.matches("input,textarea"))
          event.preventDefault();
      });
      el.onclick = () => window.inkspaceCommands.execute(name);
    }
    $(".hint").hidden = true;
    const sidebarResizer = document.createElement("div");
    sidebarResizer.className = "workbench-sidebar-resizer";
    sidebarResizer.tabIndex = 0;
    sidebarResizer.setAttribute("role", "separator");
    sidebarResizer.setAttribute("aria-orientation", "vertical");
    sidebarResizer.setAttribute("aria-label", "调整属性栏宽度");
    sidebarResizer.setAttribute("aria-valuemin", "176");
    sidebarResizer.setAttribute("aria-valuemax", "380");
    sidebar.append(sidebarResizer);
    let resizeSession = null;
    function resizeSidebar(width, commit = false) {
      sidebarWidth = Math.max(176, Math.min(380, width));
      document.body.style.setProperty(
        "--workbench-sidebar-width",
        sidebarWidth + "px",
      );
      sidebarResizer.setAttribute("aria-valuenow", String(sidebarWidth));
      if (commit) {
        resize();
        window.dispatchEvent(
          new CustomEvent("inkspace-workbench-layout", {
            detail: { sidebarWidth },
          }),
        );
      }
    }
    sidebarResizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      resizeSession = {
        pointerId: event.pointerId,
        x: event.clientX,
        width: sidebarWidth,
      };
      sidebarResizer.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    sidebarResizer.addEventListener("pointermove", (event) => {
      if (resizeSession?.pointerId === event.pointerId)
        resizeSidebar(resizeSession.width + resizeSession.x - event.clientX);
    });
    sidebarResizer.addEventListener("pointerup", (event) => {
      if (resizeSession?.pointerId === event.pointerId) {
        resizeSession = null;
        resizeSidebar(sidebarWidth, true);
      }
    });
    sidebarResizer.addEventListener("pointercancel", () => {
      if (resizeSession) {
        const original = resizeSession.width;
        resizeSession = null;
        resizeSidebar(original, true);
      }
    });
    sidebarResizer.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      resizeSidebar(
        sidebarWidth + (event.key === "ArrowLeft" ? 16 : -16),
        true,
      );
    });

    function setPlacement(mode) {
      placementMode = mode;
      for (const [el, value] of [
        [centerButton, "center"],
        [drawButton, "draw"],
      ]) {
        el.classList.toggle("active", mode === value);
        el.setAttribute("aria-pressed", String(mode === value));
      }
      repeatLabel.hidden = mode !== "draw";
      graphHelp.textContent =
        mode === "center"
          ? "点击图形，在当前可见画布中心创建。图形库保持打开，可连续插入。"
          : "选择图形后，在画布拖动确定位置和尺寸。";
    }
    function openResource(kind, toggle = true) {
      if (toggle && resource?.kind === kind) {
        exitResource();
        return;
      }
      const previousVisible = resource
        ? resource.previousVisible
        : !document.body.classList.contains("diagram-sidebar-hidden");
      resource = { kind, previousVisible };
      setDiagramSidebarCollapsed(false);
      refresh();
    }
    function exitResource(restore = true) {
      if (!resource) return;
      const visible = resource.previousVisible;
      resource = null;
      if (restore) setDiagramSidebarCollapsed(!visible);
      refresh();
    }
    function chooseShape(kind) {
      shapeKind = kind;
      if (placementMode === "center") window.inkspaceDiagram.add(kind);
      else {
        exitResource();
        activateTool("shape", false, true, "mouse");
        refresh();
      }
    }
    for (const el of shapeButtons)
      el.onclick = () => chooseShape(el.dataset.diagram);
    function completeShape(start, end) {
      const distance =
          Math.hypot(end.x - start.x, end.y - start.y) * view.scale,
        b = normalized(start, end);
      const cell = window.inkspaceDiagram.add(
        shapeKind,
        distance < 4 ? end : { x: b.x + b.w / 2, y: b.y + b.h / 2 },
        distance < 4
          ? null
          : { w: Math.max(12, b.w), h: Math.max(12, b.h), start, end },
      );
      activateTool(repeat ? "shape" : "select", false, true, "mouse");
      if (cell) window.inkspaceDiagram.setSelected([cell.id]);
      overlaySelection();
    }
    function choices(parent, items, current, commit) {
      const group = document.createElement("div");
      group.className = "workbench-choices";
      for (const [value, label] of items) {
        const el = button(label, label, () => commit(value));
        el.dataset.value = value;
        el.setAttribute("aria-pressed", String(value === current));
        group.append(el);
      }
      parent.append(group);
      return group;
    }
    function numberField(parent, label, value, min, max, commit) {
      const field = document.createElement("label");
      field.className = "workbench-number";
      const title = document.createElement("span");
      title.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.value = value;
      input.min = min;
      input.max = max;
      input.addEventListener("change", () => {
        const next = Number(input.value);
        if (Number.isFinite(next) && next >= min && next <= max) commit(next);
      });
      field.append(title, input);
      parent.append(field);
    }
    function selectionProperties(entries) {
      const item = entries.length === 1 ? entries[0] : null,
        noteItem = item?.kind === "notes" ? item.value : null,
        r = selectionBounds();
      window.inkspaceBlocks
        .descriptor(item)
        ?.properties?.(blockProperties, item, window.inkspaceCommands);
      if (noteItem && noteItem.kind !== "image") {
        choices(
          subSection(blockProperties, "文本格式"),
          [
            ["md", "Markdown"],
            ["html", "HTML"],
          ],
          InkBlockModel.textFormat(noteItem),
          (value) => window.inkspaceCommands.execute("format-" + value),
        );
        choices(
          subSection(blockProperties, "显示方式"),
          [
            ["full", "全部显示"],
            ["window", "小窗"],
          ],
          noteItem.viewMode === "window" ? "window" : "full",
          (value) => {
            if (value !== (noteItem.viewMode === "window" ? "window" : "full"))
              window.inkspaceCommands.execute("text-window");
          },
        );
        const grid = document.createElement("div");
        grid.className = "workbench-field-grid";
        subSection(blockProperties, "排版").append(grid);
        numberField(grid, "宽度", noteItem.width || 320, 160, 4000, (value) => {
          window.inkspaceInlineText.finish();
          checkpoint();
          noteItem.width = value;
          renderNotes(noteItem);
          renderBackground();
          overlaySelection();
          persist();
        });
        numberField(grid, "字号", textSize(noteItem), 8, 96, (value) => {
          window.inkspaceInlineText.finish();
          checkpoint();
          noteItem.fontSize = value;
          renderNotes(noteItem);
          renderBackground();
          overlaySelection();
          persist();
        });
        note(
          blockProperties,
          "宽度调整只改变换行；小窗高度只改变视口。字号独立设置。",
        );
        if (noteItem.viewMode === "window")
          numberField(
            grid,
            "窗口高度",
            noteItem.viewHeight || 240,
            80,
            1200,
            (value) => {
              checkpoint();
              noteItem.viewHeight = value;
              renderNotes(noteItem);
              renderBackground();
              overlaySelection();
              persist();
            },
          );
      } else if (item)
        note(
          subSection(blockProperties, "内容"),
          item.kind === "pdfPages"
            ? "每一页都是独立块"
            : item.kind === "diagram"
              ? "双击编辑标签"
              : item.kind === "notes"
                ? "图像 · 固定宽高比"
                : "自由笔迹",
        );
      if (noteItem?.kind === "image") {
        const scaleSection = subSection(blockProperties, "整体比例"),
          grid = document.createElement("div");
        grid.className = "workbench-field-grid";
        scaleSection.append(grid);
        numberField(
          grid,
          "比例 %",
          Math.round((noteItem.scale || 1) * 100),
          10,
          1000,
          (value) => {
            checkpoint();
            noteItem.scale = value / 100;
            renderNotes(noteItem);
            renderBackground();
            overlaySelection();
            persist();
          },
        );
        note(scaleSection, "整体缩放保持排版，控件大小不变。");
      }
      if (entries.length > 1) {
        const sel = subSection(blockProperties, "选区");
        note(sel, entries.length + " 个块 · 统一移动和缩放");
        choices(
          sel,
          [
            ["group", "组合"],
            ["copy", "复制"],
          ],
          null,
          (value) => window.inkspaceCommands.execute(value),
        );
      }
      if (window.inkspaceCommands.describe("ungroup").enabled)
        choices(
          subSection(blockProperties, "组合"),
          [["ungroup", "取消组合"]],
          null,
          (value) => window.inkspaceCommands.execute(value),
        );
      if (item) {
        const ops = subSection(blockProperties, "内容操作"),
          id = window.inkspaceCommands.describe("edit").enabled
            ? "edit"
            : window.inkspaceCommands.describe("view").enabled
              ? "view"
              : null,
          group = document.createElement("div");
        group.className = "workbench-choices";
        ops.append(group);
        if (id)
          group.append(
            button(
              id === "edit" ? "编辑" : "查看",
              id === "edit" ? "编辑内容" : "查看原稿",
              () => window.inkspaceCommands.execute(id),
              null,
              id === "edit" ? "pen" : "expand",
            ),
          );
        group.append(
          button("更多", "更多操作", (event) =>
            window.inkspaceBlocks.contextMenu({
              clientX: event.clientX,
              clientY: event.clientY,
              target: viewport,
              pointerType: "mouse",
              preventDefault() {},
            }),
          ),
        );
      }
      if (r && entries.length > 1)
        note(blockProperties, Math.round(r.w) + " × " + Math.round(r.h));
    }
    let footer = null;
    function attachFooter(statusBar) {
      footer = statusBar;
      footer.classList.add("workbench-footer");
      preserveNativeKeys(footer);
      const pages = $("#show-pages"),
        views = $(".zoom");
      footer.prepend(pages);
      footer.append(views);
      views.classList.add("workbench-view-controls");
      decorate($("#out"), "", "minus");
      decorate($("#in"), "", "plus");
      $("#home").textContent = "适合";
      $("#home").title = "适合内容";
      refreshFooter();
    }
    function refreshFooter() {
      const title = notebook.title || "笔记";
      if (documentLabel.textContent !== title)
        documentLabel.textContent = title;
      if (!footer) return;
      const page = notebook.pages.find((p) => p.id === notebook.activePage),
        name = page?.title || "画布",
        pages = $("#show-pages");
      if (pages.dataset.title !== name) {
        pages.dataset.title = name;
        decorate(pages, name, "layers", "down");
      }
    }
    function refresh() {
      for (const button of inputChoices.children)
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.value === inputTools.device),
        );
      toolbar.setAttribute(
        "aria-label",
        inputTools.device === "pen" ? "触控笔工具" : "鼠标工具",
      );
      toolbar.dataset.inputDevice = inputTools.device === "pen" ? "笔" : "鼠标";
      const entries = window.inkspaceCommands.selection(),
        editing = window.inkspaceInlineText?.isEditing(),
        editingNote = window.inkspaceInlineText?.selectedNote();
      const displayed =
          editing && editingNote
            ? [{ kind: "notes", value: editingNote }]
            : entries,
        mode = resource?.kind || (tool === "pdftext" ? "pdf" : "properties");
      undoButton.disabled = !editing && !history.length;
      redoButton.disabled = !editing && !future.length;
      properties.hidden = mode !== "properties";
      graphSection.hidden = mode !== "diagram";
      pdfSection.hidden = mode !== "pdf";
      pageSettings.hidden = mode !== "settings";
      exportSection.hidden = mode !== "settings";
      back.hidden = !resource;
      const arranging =
          ["select", "text", "diagram"].includes(
            pointerTool({ pointerType: "mouse" }),
          ) || editing,
        hasSelection = arranging && displayed.length > 0,
        item = displayed.length === 1 ? displayed[0] : null;
      propertyTitle.textContent =
        mode === "diagram"
          ? "图形库"
          : mode === "settings"
            ? "页面设置"
            : mode === "pdf"
              ? "PDF 内容"
              : hasSelection
                ? displayed.length > 1
                  ? "多选"
                  : item.kind === "notes"
                    ? item.value.kind === "image"
                      ? "图片"
                      : "文本"
                    : item.kind === "diagram"
                      ? "图形"
                      : item.kind === "pdfPages"
                        ? "PDF 单页"
                        : "笔迹"
                : {
                    pen: "画笔",
                    erase: "橡皮",
                    pan: "笔平移",
                    shape: "图形绘制",
                  }[tool] || "画布";
      toolOptions.hidden =
        hasSelection || !["pen", "erase", "shape"].includes(tool);
      $("#shape-options").hidden = true;
      graphProperties.hidden = !hasSelection || item?.kind !== "diagram";
      const key = JSON.stringify([
        mode,
        tool,
        displayed.map((e) => [
          e.kind,
          e.value.id,
          e.value.width,
          e.value.fontSize,
          e.value.scale,
          e.value.viewMode,
          e.value.viewHeight,
          e.value.format,
        ]),
        doc.groups,
      ]);
      if (key !== propertyKey) {
        propertyKey = key;
        blockProperties.replaceChildren();
        if (hasSelection) selectionProperties(displayed);
        else if (tool === "select") {
          note(
            subSection(blockProperties, "当前画布"),
            "点选块显示属性；双击文本进入编辑。",
          );
          note(
            subSection(blockProperties, "输入"),
            "中键移动 · H 笔平移\nShift 点选多个块",
          );
        } else if (tool === "shape") {
          note(subSection(blockProperties, "形状"), shapeLabels[shapeKind]);
          choices(
            subSection(blockProperties, "放置"),
            [
              ["once", "创建后编排"],
              ["repeat", "连续创建"],
            ],
            repeat ? "repeat" : "once",
            (value) => {
              repeat = value === "repeat";
              propertyKey = "";
              refresh();
            },
          );
        }
      }
      description.hidden = tool === "select" && !hasSelection;
      description.textContent = editing
        ? "Tab 缩进 · Ctrl+Z 撤销 · Ctrl+Enter 完成 · Esc 取消"
        : tool === "shape"
          ? "点击使用默认大小；拖动确定位置和尺寸。"
          : hasSelection
            ? item?.kind === "notes" && item.value.kind !== "image"
              ? "拖动移动 · 边柄调宽 · 字号独立设置 · 双击编辑段落"
              : "正文拖动 · 角柄缩放 · 悬停连线 · 双击编辑"
            : tool === "pan"
              ? "按 H 返回原工具。鼠标中键始终平移。"
              : tool === "pen"
                ? "直接书写、草图和标注。标准形状使用图形工具。"
                : "擦除笔迹；一次手势可完整撤销。";
      for (const el of [selectButton, penButton, eraseButton])
        el.setAttribute("aria-pressed", String(el.dataset.tool === tool));
      graphButton.setAttribute(
        "aria-pressed",
        String(mode === "diagram" || tool === "shape"),
      );
      graphButton.setAttribute("aria-expanded", String(mode === "diagram"));
      settingsButton.setAttribute("aria-pressed", String(mode === "settings"));
      const visible = !document.body.classList.contains(
        "diagram-sidebar-hidden",
      );
      sidebarToggle.title = visible ? "收起属性栏" : "展开属性栏";
      sidebarToggle.setAttribute("aria-label", sidebarToggle.title);
      sidebarToggle.setAttribute("aria-pressed", String(visible));
      refreshFooter();
      window.inkspaceMediaFrame?.refresh();
    }
    const originalOptions = refreshToolOptions;
    refreshToolOptions = function () {
      originalOptions();
      refresh();
    };
    const originalOverlay = overlaySelection;
    overlaySelection = function () {
      originalOverlay();
      refresh();
    };
    window.inkspaceInteraction.registerShortcut("workbench", (event) => {
      if (
        event.target.closest?.(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        event.isComposing ||
        window.inkspaceDiagram?.editing() ||
        !$("#block-menu").hidden
      )
        return false;
      if (event.key === "Escape" && !insertMenu.hidden) {
        insertMenu.hidden = true;
        insertButton.setAttribute("aria-expanded", "false");
        insertButton.focus();
        return true;
      }
      if (event.key === "Escape" && resource) {
        exitResource();
        return true;
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        ["s", "d"].includes(event.key.toLowerCase()) &&
        !active
      ) {
        openResource("diagram");
        return true;
      }
      if (
        event.key === "Enter" &&
        !active &&
        !event.target.closest?.("button,summary") &&
        window.inkspaceCommands.describe("edit").enabled
      ) {
        window.inkspaceCommands.execute("edit");
        return true;
      }
      return false;
    });
    window.addEventListener("inkspace-sidebar-change", refresh);
    window.addEventListener("inkspace-text-view-change", refresh);
    window.addEventListener("inkspace-input-tools-change", refresh);
    new ResizeObserver(() => window.inkspaceMediaFrame?.refresh()).observe(
      viewport,
    );
    window.inkspaceWorkbench = {
      refresh,
      attachFooter,
      openResource,
      exitResource,
      chooseShape,
      completeShape,
      previewShape,
      clearShapePreview,
      get resource() {
        return resource;
      },
      get placement() {
        return placementMode;
      },
      get shapeKind() {
        return shapeKind;
      },
      sidebar,
      propertyTitle,
    };
    window.inkspaceMediaFrame?.install();
    setPlacement("center");
    activateTool(inputTools.get("mouse"), false, true, "mouse");
    refresh();
    return window.inkspaceWorkbench;
  }
  window.inkspaceWorkbench = { install };
})();
