// Commands share one undo boundary. Nested engine mutations never add checkpoints.
(() => {
  let batch = null;
  const original = checkpoint;
  checkpoint = function () {
    if (!batch) original();
  };
  function run(label, change) {
    if (batch) return change();
    window.inkspaceInlineText?.finish();
    finishInteraction();
    const before = snapshot(),
      undoEntries = history.slice(),
      redoEntries = future.slice();
    batch = { label };
    try {
      const result = change();
      if (result?.then) throw Error("画布事务必须同步提交");
      history.push(before);
      if (history.length > 80) history.shift();
      future = [];
      render();
      persist();
      return result;
    } catch (error) {
      doc = before;
      history = undoEntries;
      future = redoEntries;
      clearSelection();
      render();
      throw error;
    } finally {
      batch = null;
    }
  }
  window.inkspaceTransactions = { run };
})();
