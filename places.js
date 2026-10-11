// Named world-space regions and stable notebook-local links.
(() => {
  function dialog(title) {
    window.inkspaceInlineText?.finish();
    finishInteraction();
    const element = document.createElement("dialog");
    element.className = "workbench-dialog";
    const heading = document.createElement("div");
    heading.className = "dialog-title";
    heading.textContent = title;
    const body = document.createElement("div");
    body.className = "place-body";
    const actions = document.createElement("div");
    actions.className = "dialog-footer";
    const close = document.createElement("button");
    close.textContent = "关闭";
    close.onclick = () => element.close();
    actions.append(close);
    element.append(heading, body, actions);
    document.body.append(element);
    element.addEventListener(
      "close",
      () => {
        element.remove();
        viewport.focus({ preventScroll: true });
      },
      { once: true },
    );
    element.showModal();
    return { element, body, actions };
  }
  function navigate(target) {
    const page = notebook.pages.find((p) => p.id === target?.page);
    if (!page) {
      toast("链接的画布已删除");
      return false;
    }
    const source = page.id === notebook.activePage ? doc : page.document;
    const bookmark =
      target.bookmark &&
      (source.bookmarks || []).find((b) => b.id === target.bookmark);
    if (target.bookmark && !bookmark) {
      toast("链接的书签已删除");
      return false;
    }
    window.inkspaceInlineText?.finish();
    finishInteraction();
    if (page.id === notebook.activePage) window.inkspaceNavigation?.remember();
    switchPage(page.id);
    if (bookmark) {
      const r = bookmark.rect,
        margin = 48;
      view.scale = usableZoom(
        Math.min(
          8,
          (viewport.clientWidth - margin * 2) / r.w,
          (viewport.clientHeight - margin * 2) / r.h,
        ),
      );
      view.x = viewport.clientWidth / 2 - (r.x + r.w / 2) * view.scale;
      view.y = viewport.clientHeight / 2 - (r.y + r.h / 2) * view.scale;
    }
    clearSelection();
    render();
    persist();
    viewport.focus({ preventScroll: true });
    return true;
  }
  function editBookmark(existing) {
    window.inkspaceInlineText?.finish();
    finishInteraction();
    const page = notebook.activePage,
      picked = selectionBounds(),
      start = world(0, 0);
    const rect =
      existing?.rect ||
      (picked && picked.w > 0 && picked.h > 0
        ? { ...picked }
        : {
            x: start.x,
            y: start.y,
            w: viewport.clientWidth / view.scale,
            h: viewport.clientHeight / view.scale,
          });
    const ui = dialog(existing ? "重命名书签" : "保存画布区域");
    const form = document.createElement("form"),
      input = document.createElement("input");
    input.maxLength = 100;
    input.placeholder = "区域名称";
    input.setAttribute("aria-label", "书签名称");
    input.value = existing?.name || "";
    form.append(input);
    ui.body.append(form);
    const save = document.createElement("button");
    save.textContent = "保存";
    save.className = "primary";
    const submit = (event) => {
      event?.preventDefault();
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      if (page !== notebook.activePage) {
        ui.element.close();
        return;
      }
      window.inkspaceTransactions.run("书签", () => {
        doc.bookmarks = (doc.bookmarks || [])
          .filter((b) => b.id !== existing?.id)
          .concat({ id: existing?.id || crypto.randomUUID(), name, rect });
      });
      ui.element.close();
    };
    form.onsubmit = submit;
    save.onclick = submit;
    ui.actions.prepend(save);
    input.focus();
    input.select();
  }
  function open() {
    rememberPage();
    const ui = dialog("画布书签"),
      list = document.createElement("div");
    list.className = "place-list";
    ui.body.append(list);
    const add = document.createElement("button");
    add.textContent = "添加当前区域";
    add.onclick = () => {
      ui.element.close();
      editBookmark();
    };
    ui.actions.prepend(add);
    let count = 0;
    for (const page of notebook.pages)
      for (const bookmark of (page.id === notebook.activePage
        ? doc
        : page.document
      ).bookmarks || []) {
        count++;
        const row = document.createElement("div");
        row.className = "layer-row";
        const jump = document.createElement("button");
        jump.textContent =
          (notebook.pages.length > 1 ? page.title + " / " : "") + bookmark.name;
        jump.onclick = () => {
          ui.element.close();
          navigate({ page: page.id, bookmark: bookmark.id });
        };
        row.append(jump);
        if (page.id === notebook.activePage) {
          const rename = document.createElement("button");
          rename.textContent = "改名";
          rename.onclick = () => {
            ui.element.close();
            editBookmark(bookmark);
          };
          const remove = document.createElement("button");
          remove.textContent = "删除";
          remove.onclick = () => {
            window.inkspaceTransactions.run("删除书签", () => {
              doc.bookmarks = doc.bookmarks.filter((b) => b.id !== bookmark.id);
            });
            row.remove();
          };
          row.append(rename, remove);
        }
        list.append(row);
      }
    if (!count) {
      const help = document.createElement("p");
      help.textContent = "保存选中内容的区域；没有选区时保存当前视野。";
      list.append(help);
    }
  }
  function linkTo() {
    const refs = window.inkspaceBlocks.references(),
      pageId = notebook.activePage;
    if (!refs.length || window.inkspaceArrangement.selectionLocked()) return;
    rememberPage();
    const ui = dialog("链接到画布或书签"),
      list = document.createElement("div");
    list.className = "place-list";
    ui.body.append(list);
    const choose = (target) => {
      if (notebook.activePage === pageId)
        window.inkspaceTransactions.run("内部链接", () =>
          window.inkspaceArrangement.setState(refs, { link: target }),
        );
      ui.element.close();
    };
    for (const page of notebook.pages) {
      const button = document.createElement("button");
      button.textContent = page.title;
      button.onclick = () => choose({ page: page.id });
      list.append(button);
      for (const bookmark of page.document.bookmarks || []) {
        const item = document.createElement("button");
        item.textContent = "↳ " + bookmark.name;
        item.onclick = () => choose({ page: page.id, bookmark: bookmark.id });
        list.append(item);
      }
    }
    const remove = document.createElement("button");
    remove.textContent = "移除链接";
    remove.onclick = () => choose(null);
    ui.actions.prepend(remove);
  }
  function openLink() {
    const ref = window.inkspaceBlocks.references()[0],
      target = ref && window.inkspaceArrangement.state(ref)?.link;
    if (target) navigate(target);
  }
  function installFooter(footer) {
    if (document.querySelector("#canvas-bookmarks")) return;
    const button = document.createElement("button");
    button.id = "canvas-bookmarks";
    button.textContent = "书签";
    button.title = "命名区域与跳转";
    button.onclick = open;
    footer.prepend(button);
  }
  document.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest?.('a[href^="inkspace:"]');
      if (!anchor) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const url = new URL(anchor.href);
        if (url.hostname === "canvas")
          navigate({
            page: decodeURIComponent(url.pathname.slice(1)),
            bookmark: url.searchParams.get("bookmark") || undefined,
          });
      } catch {
        toast("内部链接无效");
      }
    },
    { capture: true },
  );
  window.inkspacePlaces = {
    dialog,
    navigate,
    open,
    editBookmark,
    linkTo,
    openLink,
    installFooter,
  };
})();
