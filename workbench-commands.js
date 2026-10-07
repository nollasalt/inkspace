// Commands are shared by the workbench, the selection strip and context menus.
// Media engines contribute content actions; they never acquire pointer ownership.
(() => {
  const commands = new Map();
  const selection = () => window.inkspaceBlocks?.selectionEntries() || [];
  const single = () => {
    const entries = selection();
    return entries.length === 1 ? entries[0] : null;
  };
  const text = () => {
    const item = single();
    return item?.kind === "notes" && item.value.kind !== "image"
      ? item.value
      : null;
  };
  function register(id, descriptor) {
    commands.set(id, descriptor);
  }
  function describe(id) {
    const command = commands.get(id);
    if (!command) return null;
    return {
      ...command,
      id,
      label:
        typeof command.label === "function" ? command.label() : command.label,
      enabled: command.enabled ? !!command.enabled() : true,
    };
  }
  async function execute(id, argument) {
    const command = describe(id);
    if (!command?.enabled) return false;
    try {
      await command.run(argument);
      return true;
    } catch (error) {
      toast(error.message);
      return false;
    }
  }
  const refs = () => window.inkspaceBlocks.references();
  for (const name of ["undo", "redo"])
    register(name, {
      label: name === "undo" ? "撤销" : "重做",
      run: () => {
        if (window.inkspaceInlineText?.history(name)) return;
        const focused = document.activeElement;
        if (focused?.matches("input,textarea")) {
          document.execCommand(name);
          return;
        }
        name === "undo" ? undo() : redo();
      },
    });
  const grouped = () =>
    (doc.groups || []).some((group) =>
      InkBlockModel.groupMembers(doc, group).some((r) =>
        refs().some((s) => r.kind === s.kind && r.id === s.id),
      ),
    );
  register("edit", {
    label: "编辑",
    enabled: () => !!text() || single()?.kind === "diagram",
    run: (position) => {
      const item = single();
      if (item?.kind === "diagram") window.inkspaceDiagram.editAt(item.index);
      else if (text()) edit(text(), position);
    },
  });
  register("view", {
    label: "查看",
    enabled: () =>
      single()?.kind === "pdfPages" ||
      (single()?.kind === "notes" && single().value.kind === "image"),
    run: () => {
      const item = single(),
        src =
          item.kind === "notes"
            ? item.value.src
            : [...document.querySelectorAll(".pdf-page")]
                .find((el) => el.dataset.page === item.value.id)
                ?.querySelector("canvas")
                ?.toDataURL();
      if (!src) {
        toast("页面仍在加载，请稍后查看");
        return;
      }
      const dialog = document.createElement("dialog");
      dialog.className = "media-viewer";
      const image = new Image();
      image.src = src;
      image.alt = item.kind === "notes" ? "图片原稿" : "PDF 页面原稿";
      const close = document.createElement("button");
      close.textContent = "关闭";
      close.onclick = () => dialog.close();
      dialog.append(close, image);
      document.body.append(dialog);
      dialog.addEventListener(
        "close",
        () => {
          dialog.remove();
          viewport.focus();
        },
        { once: true },
      );
      dialog.showModal();
    },
  });
  register("text-window", {
    label: () => (text()?.viewMode === "window" ? "展开全文" : "小窗显示"),
    enabled: () => !!text(),
    run: () => {
      const note = text();
      window.inkspaceInlineText.setView(
        note.viewMode === "window" ? "full" : "window",
        note,
      );
    },
  });
  register("pdf-source", {
    label: "PDF 原稿与文字",
    enabled: () => single()?.kind === "pdfPages",
    run: () => window.inkspaceWorkbench.openResource("pdf", false),
  });
  for (const format of ["md", "html"])
    register("format-" + format, {
      label: () =>
        "类型：" +
        (format === "md" ? "Markdown" : "HTML") +
        (text() && InkBlockModel.textFormat(text()) === format ? " ✓" : ""),
      enabled: () => !!text(),
      run: () => window.inkspaceBlocks.setTextFormat(text(), format),
    });
  for (const name of ["copy", "paste"])
    register(name, {
      label: name === "copy" ? "复制" : "粘贴",
      enabled: () => name === "paste" || !!selection().length,
      run: () => window.inkspaceBlocks.clipboard(name),
    });
  register("group", {
    label: "组合",
    enabled: () => selection().length > 1,
    run: () => window.inkspaceBlocks.groupSelection(),
  });
  register("ungroup", {
    label: "取消组合",
    enabled: grouped,
    run: () => window.inkspaceBlocks.ungroupSelection(),
  });
  register("delete", {
    label: "删除",
    enabled: () => !!selection().length,
    run: () => window.inkspaceBlocks.deleteSelection(),
  });
  register("insert-text", {
    label: "文本",
    run: (position) => {
      const p =
        position || world(viewport.clientWidth / 2, viewport.clientHeight / 2);
      edit({
        id: crypto.randomUUID(),
        x: position ? p.x : p.x - 280,
        y: position ? p.y : p.y - 60,
        width: 560,
        markdown: "",
      });
    },
  });
  register("insert-pdf", {
    label: "PDF…",
    run: () => $("#pdf-import").click(),
  });
  register("import-html", {
    label: "导入 HTML…",
    run: () => window.inkspaceBlocks.importHtml(),
  });
  register("insert-image", { label: "图片…", run: () => imageFile.click() });
  const imageFile = document.createElement("input");
  imageFile.type = "file";
  imageFile.accept = "image/png,image/jpeg,image/webp,image/gif";
  imageFile.hidden = true;
  document.body.append(imageFile);
  imageFile.onchange = async () => {
    const file = imageFile.files[0],
      page = notebook.activePage;
    try {
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) throw Error("图片超过 50 MB");
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("无法读取图片"));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = src;
      await image.decode();
      if (page !== notebook.activePage) return;
      window.inkspaceInlineText?.finish();
      finishInteraction();
      const p = world(viewport.clientWidth / 2, viewport.clientHeight / 2),
        width = Math.min(560, image.naturalWidth),
        aspect = image.naturalWidth / image.naturalHeight;
      checkpoint();
      const note = {
        id: crypto.randomUUID(),
        kind: "image",
        src,
        aspect,
        width,
        x: p.x - width / 2,
        y: p.y - width / aspect / 2,
        markdown: "",
      };
      doc.notes.push(note);
      clearSelection();
      selected.notes = [doc.notes.length - 1];
      render();
      persist();
    } catch (error) {
      toast(error.message);
    } finally {
      imageFile.value = "";
    }
  };
  const menu = () =>
    [
      ...(selection().length
        ? [
            "edit",
            "view",
            "text-window",
            "pdf-source",
            "format-md",
            "format-html",
            "copy",
            "group",
            "ungroup",
            "delete",
          ]
        : ["insert-text", "insert-image", "insert-pdf", "import-html"]),
      "paste",
    ].filter((id) => describe(id)?.enabled);
  window.inkspaceCommands = {
    register,
    describe,
    execute,
    selection,
    single,
    text,
    menu,
  };
})();
