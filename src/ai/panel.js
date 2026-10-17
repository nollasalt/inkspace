// The assistant is a conversation with optional notebook attachments, not a second toolbar.
export function createPanel() {
  const panel = document.createElement('aside'); panel.id = 'inkspace-ai-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'AI'); panel.dataset.inkspaceUi = ''; panel.tabIndex = -1;
  const icon = name => window.inkspaceWorkbenchUI.icon(name);
  panel.innerHTML = `<div class="ai-heading"><strong>AI</strong><div class="ai-heading-actions">
    <button id="ai-new" title="新对话" aria-label="新对话">${icon('pen')}</button>
    <details id="ai-settings" class="ai-menu"><summary title="设置与请求详情" aria-label="设置与请求详情">${icon('more')}</summary><div class="ai-menu-content">
      <span class="ai-menu-label">模型</span><label><input type="radio" name="ai-model" data-ai-profile="fast" checked>快速 · Luna</label><label><input type="radio" name="ai-model" data-ai-profile="precise">精细 · Sol</label>
      <details class="ai-request-details"><summary>请求详情</summary><p id="ai-metrics">尚未发送请求</p></details>
    </div></details><button id="ai-close" title="关闭 AI" aria-label="关闭 AI">${icon('close')}</button></div></div>
    <div class="ai-thread"><div id="ai-conversation" aria-label="对话记录"></div>
      <p id="ai-current-question" class="ai-user" hidden></p><p id="ai-status" role="status" hidden></p>
      <div id="ai-review" class="ai-markdown"></div><ul id="ai-questions" hidden></ul>
      <div id="ai-answer-actions" class="ai-actions" hidden><button id="ai-insert" class="ai-primary">${icon('plus')}放入画布</button><button id="ai-copy" class="ai-icon-button" title="复制回答" aria-label="复制回答">${icon('copy')}</button></div>
      <div id="ai-proposal" hidden><strong id="ai-summary"></strong><details id="ai-preview-details" open><summary>修改预览</summary><ul id="ai-changes"></ul><div id="ai-preview"></div></details>
        <div class="ai-actions"><button id="ai-apply" class="ai-primary">应用修改</button><button id="ai-discard" class="ai-icon-button" title="放弃修改" aria-label="放弃修改">${icon('close')}</button></div></div>
    </div>
    <div class="ai-compose-area"><div class="ai-composer"><div id="ai-attachment" hidden><span id="ai-attachment-label"></span><button id="ai-remove-attachment" title="移除附件并开始新对话" aria-label="移除笔记附件">${icon('close')}</button></div>
      <textarea id="ai-prompt" rows="3" aria-label="希望 AI 做什么" placeholder="提问，或描述要生成的内容…"></textarea>
      <div class="ai-compose-actions"><details id="ai-attach-menu" class="ai-menu"><summary>${icon('plus')}添加内容</summary><div class="ai-menu-content">
        <button data-ai-attach="selection">选中内容</button><button data-ai-attach="view">当前视野</button><hr>
        <label><input id="ai-include-image" type="checkbox" disabled>附带画面</label><span class="ai-menu-note">用于手写、图片或 PDF</span>
      </div></details><button id="ai-send" title="发送 · Ctrl+Enter" aria-label="发送">${icon('arrow')}</button><button id="ai-cancel" title="停止生成" aria-label="停止生成" hidden>■</button></div>
    </div><div class="ai-compose-footer"><span id="ai-input-help">未附笔记或画面</span><span>Ctrl + Enter</span></div></div>`;
  panel.addEventListener('pointerdown', event => { if (!event.target.closest('input,textarea,button,a,summary')) panel.focus({ preventScroll: true }); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') for (const menu of panel.querySelectorAll('.ai-menu[open]')) { menu.open = false; event.stopPropagation(); }
  });
  document.addEventListener('pointerdown', event => {
    for (const menu of panel.querySelectorAll('.ai-menu[open]')) if (!menu.contains(event.target)) menu.open = false;
  });
  document.getElementById('editor-area').append(panel);
  return { panel, $ai: id => panel.querySelector('#' + id), thread: panel.querySelector('.ai-thread') };
}
