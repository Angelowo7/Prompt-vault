// Prompt Vault content script — runs in all frames.
// Top frame builds the full UI; sub-frames only relay copied text upward
// (needed for editors like Google Docs that capture input in a hidden iframe).
const PV_IS_TOP_FRAME = (function () {
  try { return window.self === window.top; } catch (e) { return false; }
})();

if (!PV_IS_TOP_FRAME) {
  // Sub-frame: relay copied text to the top frame so it can show the save pill.
  // (Google Docs / Word Online capture input in nested/about:blank iframes.)
  document.addEventListener('copy', (e) => {
    let immediate = '';
    try { immediate = (e.clipboardData && e.clipboardData.getData('text/plain') || '').trim(); } catch (ev) {}
    setTimeout(async () => {
      let text = immediate;
      if (!text) { try { text = (window.getSelection().toString() || '').trim(); } catch (ev) {} }
      if (!text) { try { text = (await navigator.clipboard.readText()).trim(); } catch (ev) {} }
      if (text && text.length >= 3) {
        try { window.top.postMessage({ __pvType: 'PV_COPY_TEXT', text: text }, '*'); } catch (ev) {}
      }
    }, 30);
  }, true);
} else {
  // Prompt Vault — content.js
  // FAB appears near cursor on field entry, stays still, picker opens on top of it

  let shadowHost = null;
  let shadowRoot = null;
  let fab = null;
  let picker = null;
  let varfill = null;
  let activeField = null;
  let pickerOpen = false;

  let allPrompts = [];
  let allCollections = [];
  let pickerSearch = '';
  let pickerCollection = 'all';

  // FAB anchor position (set once, stays still)
  let fabLeft = 0;
  let fabTop = 0;
  let fabShown = false;     // FAB currently visible & placed

  // ── Shadow DOM ────────────────────────────────────────

  function initShadow() {
    if (shadowHost) return;
    shadowHost = document.createElement('div');
    shadowHost.id = 'pv-shadow-host';
    shadowHost.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = getShadowStyles();
    shadowRoot.appendChild(style);
  }

  function getShadowStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #pv-fab {
        position: fixed;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #7c6dfa;
        border: none;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(124,109,250,0.5);
        font-size: 14px;
        color: white;
        user-select: none;
        pointer-events: all;
        opacity: 0;
        transition: opacity 0.18s;
      }
      #pv-fab:active { cursor: grabbing; }
      #pv-fab.visible { opacity: 0.88; }
      #pv-fab.visible:hover { opacity: 1; box-shadow: 0 4px 16px rgba(124,109,250,0.7); }
      #pv-fab.hidden { opacity: 0 !important; pointer-events: none !important; }

      #pv-picker {
        position: fixed;
        width: 320px;
        max-height: 420px;
        background: #0f0f11;
        border: 1px solid #2e2e38;
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,109,250,0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e8e8f0;
        pointer-events: all;
        animation: pv-pop 0.14s cubic-bezier(0.34,1.4,0.64,1);
      }
      #pv-picker.hidden { display: none !important; }

      @keyframes pv-pop {
        from { opacity: 0; transform: scale(0.95) translateY(-4px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }

      #pv-picker-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; border-bottom: 1px solid #2e2e38; flex-shrink: 0;
      }
      .pv-logo { font-size: 13px; font-weight: 700; color: #9384fb; white-space: nowrap; }
      #pv-search {
        flex: 1; background: #1a1a1f; border: 1px solid #2e2e38; border-radius: 6px;
        color: #e8e8f0; font-size: 12px; font-family: inherit; padding: 5px 9px;
        outline: none; transition: border-color 0.15s;
      }
      #pv-search:focus { border-color: #7c6dfa; }
      #pv-search::placeholder { color: #55556a; }
      #pv-close {
        background: #1a1a1f; border: 1px solid #2e2e38; color: #8888a0;
        border-radius: 5px; width: 24px; height: 24px; display: flex;
        align-items: center; justify-content: center; cursor: pointer;
        font-size: 12px; flex-shrink: 0; transition: all 0.12s;
      }
      #pv-close:hover { background: #232329; color: #e8e8f0; }

      #pv-collections {
        display: flex; gap: 5px; padding: 7px 10px; overflow-x: auto;
        border-bottom: 1px solid #2e2e38; flex-shrink: 0; scrollbar-width: none;
      }
      #pv-collections::-webkit-scrollbar { display: none; }
      .pv-col-chip {
        background: #1a1a1f; border: 1px solid #2e2e38; color: #8888a0;
        border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 500;
        cursor: pointer; white-space: nowrap; transition: all 0.12s;
        flex-shrink: 0; font-family: inherit;
      }
      .pv-col-chip:hover { background: #232329; color: #e8e8f0; }
      .pv-col-chip.active { background: rgba(124,109,250,0.15); border-color: #7c6dfa; color: #9384fb; }

      #pv-list {
        overflow-y: auto; flex: 1; padding: 6px;
        scrollbar-width: thin; scrollbar-color: #2c2c35 transparent;
      }
      #pv-list::-webkit-scrollbar { width: 3px; }
      #pv-list::-webkit-scrollbar-thumb { background: #2c2c35; border-radius: 3px; }

      .pv-item {
        border-radius: 8px; padding: 9px 11px; cursor: pointer;
        transition: background 0.12s; border: 1px solid transparent; margin-bottom: 3px;
      }
      .pv-item:hover { background: #1a1a1f; border-color: #2e2e38; }
      .pv-item-title {
        font-weight: 600; font-size: 12.5px; color: #e8e8f0;
        margin-bottom: 3px; display: flex; align-items: center; gap: 5px;
      }
      .pv-pin { font-size: 10px; color: #7c6dfa; }
      .pv-item-preview {
        font-size: 11.5px; color: #8888a0; line-height: 1.45;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
      }
      .pv-item-meta { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
      .pv-badge { font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 8px; background: rgba(124,109,250,0.15); color: #9384fb; }
      .pv-var-badge { font-size: 10px; color: #55556a; }

      #pv-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 32px 16px; color: #55556a;
        font-size: 12px; text-align: center; gap: 6px;
      }
      .pv-empty-icon { font-size: 22px; }

      #pv-varfill {
        position: fixed; width: 300px;
        background: #0f0f11; border: 1px solid #2e2e38; border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.7);
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        font-size: 13px; color: #e8e8f0; overflow: hidden; pointer-events: all;
        animation: pv-pop 0.14s cubic-bezier(0.34,1.4,0.64,1);
      }
      #pv-varfill.hidden { display: none !important; }
      #pv-varfill-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 11px 14px; border-bottom: 1px solid #2e2e38;
        font-weight: 700; font-size: 13px;
      }
      #pv-varfill-body {
        padding: 12px 14px; display: flex; flex-direction: column;
        gap: 10px; max-height: 280px; overflow-y: auto;
      }
      .pv-var-label {
        font-size: 10.5px; font-weight: 600; color: #8888a0;
        text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px;
        font-family: 'SF Mono', 'Fira Mono', monospace;
      }
      .pv-var-input {
        width: 100%; background: #1a1a1f; border: 1px solid #2e2e38;
        border-radius: 6px; color: #e8e8f0; font-size: 12.5px;
        padding: 7px 10px; outline: none; font-family: inherit; transition: border-color 0.12s;
      }
      .pv-var-input:focus { border-color: #7c6dfa; }
      .pv-history-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .pv-hist-chip {
        background: #1a1a1f; border: 1px solid #2e2e38; border-radius: 4px;
        color: #8888a0; font-size: 10.5px; padding: 2px 7px; cursor: pointer;
        transition: all 0.1s; font-family: inherit;
        max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pv-hist-chip:hover { background: #232329; color: #e8e8f0; }
      #pv-varfill-footer {
        display: flex; gap: 7px; justify-content: flex-end;
        padding: 10px 14px; border-top: 1px solid #2e2e38;
      }
      .pv-btn-ghost {
        background: transparent; border: 1px solid #2e2e38; color: #8888a0;
        border-radius: 6px; padding: 5px 12px; font-size: 12px;
        font-family: inherit; cursor: pointer; transition: all 0.12s;
      }
      .pv-btn-ghost:hover { background: #1a1a1f; color: #e8e8f0; }
      .pv-btn-primary {
        background: #7c6dfa; border: none; color: #fff; border-radius: 6px;
        padding: 5px 14px; font-size: 12px; font-weight: 600;
        font-family: inherit; cursor: pointer; transition: background 0.12s;
      }
      .pv-btn-primary:hover { background: #9384fb; }

      #pv-toast {
        position: fixed; bottom: 20px; left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: #232329; border: 1px solid #2e2e38; color: #e8e8f0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        font-size: 12px; padding: 7px 16px; border-radius: 20px;
        opacity: 0; pointer-events: none; transition: all 0.2s; white-space: nowrap;
      }
      #pv-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

      #pv-save-pill {
        position: fixed;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 5px;
        background: #7c6dfa;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 6px 11px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(124,109,250,0.5);
        pointer-events: all;
        user-select: none;
        white-space: nowrap;
        animation: pv-pop 0.12s cubic-bezier(0.34,1.4,0.64,1);
      }
      #pv-save-pill:hover { background: #9384fb; box-shadow: 0 6px 20px rgba(124,109,250,0.6); }
      #pv-save-pill.hidden { display: none !important; }
      #pv-save-pill .pv-pill-icon { font-size: 13px; }
    `;
  }

  // ── Helpers ───────────────────────────────────────────

  function isTextField(el) {
    if (!el) return false;
    if (el.composedPath && el.composedPath().some(n => n === shadowHost)) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      return ['text', 'search', 'email', 'url', ''].includes((el.type || '').toLowerCase());
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function extractVariables(text) {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    let t = shadowRoot.querySelector('#pv-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pv-toast'; shadowRoot.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function insertText(text) {
    // Re-acquire the target if the stored one is gone (stale/detached node)
    let el = activeField;
    if (!el || !el.isConnected) {
      const ae = document.activeElement;
      if (ae && (ae.isContentEditable || ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) el = ae;
    }
    if (!el) return false;
    activeField = el;
    try {
      if (el.isContentEditable) {
        el.focus();
        // Guarantee a caret exists (a prior save may have collapsed/cleared it)
        const sel = window.getSelection();
        if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false); // caret at end
          sel.removeAllRanges();
          sel.addRange(range);
        }
        const ok = document.execCommand('insertText', false, text);
        if (!ok) {
          const s2 = window.getSelection();
          if (s2 && s2.rangeCount) {
            const range = s2.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(text);
            range.insertNode(node);
            range.setStartAfter(node);
            range.setEndAfter(node);
            s2.removeAllRanges();
            s2.addRange(range);
          }
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
        return true;
      }
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.focus();
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, el.value.slice(0, start) + text + el.value.slice(end));
        else el.value = el.value.slice(0, start) + text + el.value.slice(end);
        el.selectionStart = el.selectionEnd = start + text.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) { console.warn('[PromptVault] insert failed:', e); }
    return false;
  }

  async function loadData() {
    try {
      const data = await chrome.runtime.sendMessage({ type: 'GET_PROMPTS' });
      allPrompts = data.prompts || [];
      allCollections = data.collections || [];
    } catch (e) { allPrompts = []; allCollections = []; }
  }

  // ── FAB ───────────────────────────────────────────────

  function createFab() {
    fab = document.createElement('button');
    fab.id = 'pv-fab';
    fab.title = 'Prompt Vault';
    fab.innerHTML = '⚡';

    // Prevent the FAB from stealing focus from the text field or triggering the
    // document's outside-click handlers — but it's a pure click button now.
    fab.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      syncInsertState();
      pickerOpen ? closePicker() : openPicker();
    });

    shadowRoot.appendChild(fab);
  }

  // Place FAB near cursor — ONLY on first appearance, then it stays put
  function placeFabNearCursor(mouseX, mouseY, field) {
    const rect = field.getBoundingClientRect();
    const size = 30;
    const offset = 20;

    let left = mouseX + offset;
    let top = mouseY - size / 2;

    if (left + size > window.innerWidth - 8) left = mouseX - offset - size;
    left = Math.max(rect.left + 4, Math.min(left, rect.right - size - 4));
    left = Math.max(6, Math.min(left, window.innerWidth - size - 6));
    top  = Math.max(rect.top + 4, Math.min(top, rect.bottom - size - 4));
    top  = Math.max(6, Math.min(top, window.innerHeight - size - 6));

    fabLeft = left;
    fabTop = top;
    fab.style.left = left + 'px';
    fab.style.top  = top  + 'px';
  }

  // Show FAB. Places near cursor only the first time it appears.
  function showFab(mouseX, mouseY, field) {
    if (!fabShown) {
      // First appearance for this field session — place near cursor
      placeFabNearCursor(mouseX, mouseY, field);
      fabShown = true;
    }
    // If already shown (or dragged), keep its current position — do NOT move it
    fab.classList.remove('hidden');
    fab.classList.add('visible');
  }

  function hideFab() {
    fab.classList.remove('visible');
    fab.classList.add('hidden');
    fabShown = false; // next entry will re-place near cursor (unless dragged)
  }

  // ── Picker ────────────────────────────────────────────

  function createPicker() {
    picker = document.createElement('div');
    picker.id = 'pv-picker';
    picker.classList.add('hidden');
    picker.innerHTML = `
      <div id="pv-picker-header">
        <span class="pv-logo">⚡ Vault</span>
        <input id="pv-search" type="text" placeholder="Search prompts..." autocomplete="off" spellcheck="false" />
        <button id="pv-close">✕</button>
      </div>
      <div id="pv-collections"></div>
      <div id="pv-list"></div>
    `;
    shadowRoot.appendChild(picker);
    picker.querySelector('#pv-close').addEventListener('click', e => { e.stopPropagation(); closePicker(); });
    picker.querySelector('#pv-search').addEventListener('input', e => {
      pickerSearch = e.target.value.trim().toLowerCase();
      renderPickerList();
    });
    picker.addEventListener('mousedown', e => e.stopPropagation());
  }

  // Position picker so it opens right where the FAB was
  function positionPickerAtFab() {
    const pw = 320, ph = 420;
    // Start at FAB position
    let left = fabLeft;
    let top = fabTop;

    // Clamp so picker stays in viewport
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
    if (top < 8) top = 8;

    picker.style.left = left + 'px';
    picker.style.top  = top  + 'px';
  }

  async function openPicker() {
    if (!picker) createPicker();
    hideSavePill();
    await loadData();

    pickerSearch = '';
    pickerCollection = 'all';
    picker.querySelector('#pv-search').value = '';

    // Hide FAB, show picker at same spot
    hideFab();
    positionPickerAtFab();
    picker.classList.remove('hidden');
    pickerOpen = true;

    renderPickerCollections();
    renderPickerList();
    setTimeout(() => picker.querySelector('#pv-search').focus(), 60);
  }

  function closePicker() {
    if (picker) picker.classList.add('hidden');
    pickerOpen = false;
    // Don't auto-show FAB — user needs to move mouse into field again
  }

  // Self-heal: keep state flags in sync with the actual UI so they can never
  // get "stuck" and silently disable insert until a page refresh.
  function syncInsertState() {
    if (pickerOpen && (!picker || picker.classList.contains('hidden'))) pickerOpen = false;
  }

  function renderPickerCollections() {
    const row = picker.querySelector('#pv-collections');
    row.innerHTML = '';
    [['all', 'All'], ['pinned', '📌 Pinned']].forEach(([id, label]) => {
      const chip = document.createElement('button');
      chip.className = 'pv-col-chip' + (pickerCollection === id ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { pickerCollection = id; renderPickerCollections(); renderPickerList(); });
      row.appendChild(chip);
    });
    allCollections.forEach(col => {
      const chip = document.createElement('button');
      chip.className = 'pv-col-chip' + (pickerCollection === col.id ? ' active' : '');
      chip.textContent = col.name;
      chip.addEventListener('click', () => { pickerCollection = col.id; renderPickerCollections(); renderPickerList(); });
      row.appendChild(chip);
    });
  }

  function renderPickerList() {
    const list = picker.querySelector('#pv-list');
    list.innerHTML = '';
    let filtered = [...allPrompts];
    if (pickerCollection === 'pinned') filtered = filtered.filter(p => p.pinned);
    else if (pickerCollection !== 'all') filtered = filtered.filter(p => (p.collections || []).includes(pickerCollection));
    if (pickerSearch) filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(pickerSearch) || p.text.toLowerCase().includes(pickerSearch)
    );
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div id="pv-empty"><div class="pv-empty-icon">✦</div><div>${pickerSearch ? 'No prompts match' : 'No prompts saved yet'}</div></div>`;
      return;
    }
    filtered.forEach(prompt => {
      const vars = extractVariables(prompt.text);
      const colls = (prompt.collections || []).map(id => allCollections.find(c => c.id === id)).filter(Boolean);
      const item = document.createElement('div');
      item.className = 'pv-item';
      item.innerHTML = `
        <div class="pv-item-title">${prompt.pinned ? '<span class="pv-pin">📌</span>' : ''}${esc(prompt.title || 'Untitled')}</div>
        <div class="pv-item-preview">${esc(prompt.text)}</div>
        <div class="pv-item-meta">
          ${prompt.category ? `<span class="pv-badge">${esc(prompt.category)}</span>` : ''}
          ${colls.map(c => `<span class="pv-badge" style="background:${c.color}22;color:${c.color}">${esc(c.name)}</span>`).join('')}
          ${vars.length ? `<span class="pv-var-badge">⬡ ${vars.length} var${vars.length > 1 ? 's' : ''}</span>` : ''}
        </div>
      `;
      item.addEventListener('click', () => handlePickerInsert(prompt));
      list.appendChild(item);
    });
  }

  // ── Insert Flow ───────────────────────────────────────

  function handlePickerInsert(prompt) {
    const vars = extractVariables(prompt.text);
    if (vars.length === 0) doInsert(prompt.text, prompt, {});
    else { closePicker(); showVarFill(prompt, vars); }
  }

  function doInsert(text, prompt, filledVars) {
    Object.entries(filledVars).forEach(([variable, value]) => {
      if (value) chrome.runtime.sendMessage({ type: 'UPDATE_VARIABLE_HISTORY', promptId: prompt.id, variable, value });
    });
    const success = insertText(text);
    closePicker();
    closeVarFill();
    if (success) showToast('Prompt inserted ✓');
    else navigator.clipboard.writeText(text).then(
      () => showToast('Copied — press Ctrl/Cmd+V to paste'),
      () => showToast('Could not insert here')
    );
  }

  // ── Variable Fill ─────────────────────────────────────

  function showVarFill(prompt, vars) {
    if (!varfill) {
      varfill = document.createElement('div');
      varfill.id = 'pv-varfill';
      varfill.classList.add('hidden');
      shadowRoot.appendChild(varfill);
      varfill.addEventListener('mousedown', e => e.stopPropagation());
    }
    const history = prompt.variableHistory || {};
    varfill.innerHTML = `
      <div id="pv-varfill-header">
        Fill Variables
        <button class="pv-btn-ghost" id="pv-vf-close" style="padding:3px 8px;font-size:11px">✕</button>
      </div>
      <div id="pv-varfill-body">
        ${vars.map(v => `
          <div>
            <div class="pv-var-label">{{${esc(v)}}}</div>
            <input class="pv-var-input" data-var="${esc(v)}" placeholder="${esc(v)}..." autocomplete="off" spellcheck="false" />
            ${(history[v] || []).length ? `<div class="pv-history-row">${(history[v] || []).slice(0, 5).map(h =>
              `<button class="pv-hist-chip" data-for="${esc(v)}" data-val="${esc(h)}">${esc(h)}</button>`
            ).join('')}</div>` : ''}
          </div>
        `).join('')}
      </div>
      <div id="pv-varfill-footer">
        <button class="pv-btn-ghost" id="pv-vf-cancel">Cancel</button>
        <button class="pv-btn-primary" id="pv-vf-insert">Insert ⌘↵</button>
      </div>
    `;

    // Same position as picker/FAB
    const pw = 300, ph = 360;
    let left = fabLeft;
    let top = fabTop;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
    if (top < 8) top = 8;
    varfill.style.left = left + 'px';
    varfill.style.top  = top  + 'px';
    varfill.classList.remove('hidden');

    varfill.querySelectorAll('.pv-hist-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const input = varfill.querySelector(`.pv-var-input[data-var="${chip.dataset.for}"]`);
        if (input) { input.value = chip.dataset.val; input.focus(); }
      });
    });
    varfill.querySelector('#pv-vf-close').onclick = closeVarFill;
    varfill.querySelector('#pv-vf-cancel').onclick = closeVarFill;
    varfill.querySelector('#pv-vf-insert').onclick = () => doVarInsert(prompt);
    varfill.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doVarInsert(prompt);
      if (e.key === 'Escape') closeVarFill();
    });
    setTimeout(() => varfill.querySelector('.pv-var-input')?.focus(), 60);
  }

  function doVarInsert(prompt) {
    const inputs = varfill.querySelectorAll('.pv-var-input');
    const filledVars = {};
    let text = prompt.text;
    inputs.forEach(input => {
      const varName = input.dataset.var;
      const value = input.value.trim();
      filledVars[varName] = value;
      text = text.replaceAll(`{{${varName}}}`, value || `{{${varName}}}`);
    });
    doInsert(text, prompt, filledVars);
  }

  function closeVarFill() {
    if (varfill) varfill.classList.add('hidden');
  }

  // ── Mouse tracking — FAB appears once near cursor, then stays still ──

  let lastField = null;
  let hideTimer = null;

  document.addEventListener('mousemove', (e) => {
    // If the picker flag is stuck true but the picker is actually hidden, recover
    if (pickerOpen && (!picker || picker.classList.contains('hidden'))) pickerOpen = false;
    if (pickerOpen) return;

    const inShadow = e.composedPath().some(n => n === shadowHost);
    if (inShadow) {
      // Hovering the FAB itself — keep it, cancel any pending hide
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const field = el ? findTextField(el) : null;

    if (field) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      activeField = field;
      if (lastField !== field) {
        // Entered a different field — allow re-placement near cursor
        lastField = field;
        fabShown = false;
      }
      // showFab places near cursor ONLY on first show; afterwards it just keeps position
      showFab(e.clientX, e.clientY, field);
    } else {
      // Left the field — hide after a short grace period (so user can reach the FAB)
      if (!hideTimer && fab.classList.contains('visible')) {
        hideTimer = setTimeout(() => {
          hideFab();
          lastField = null;
          hideTimer = null;
        }, 600);
      }
    }
  }, { passive: true });

  function findTextField(el) {
    let cur = el;
    for (let i = 0; i < 5; i++) {
      if (!cur) break;
      if (isTextField(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  document.addEventListener('focusin', (e) => {
    if (e.composedPath().some(n => n === shadowHost)) return;
    if (isTextField(e.target)) activeField = e.target;
  }, true);

  document.addEventListener('focusout', (e) => {
    if (e.composedPath().some(n => n === shadowHost)) return;
    setTimeout(() => {
      const f = document.activeElement;
      if (f && shadowHost.contains(f)) return;
      if (pickerOpen) return;
    }, 200);
  }, true);

  // Close on outside click
  document.addEventListener('mousedown', (e) => {
    if (e.composedPath().some(n => n === shadowHost)) return;
    if (pickerOpen) closePicker();
    if (varfill && !varfill.classList.contains('hidden')) closeVarFill();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePicker(); closeVarFill(); }
  });

  // ── One-click "Save selection" pill ───────────────────
  let savePill = null;
  let pendingSelectionText = '';

  function createSavePill() {
    savePill = document.createElement('button');
    savePill.id = 'pv-save-pill';
    savePill.classList.add('hidden');
    savePill.innerHTML = '<span class="pv-pill-icon">⚡</span><span>Save to Vault</span>';

    // Capture on mousedown so the page selection isn't lost before we read it
    savePill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    savePill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveSelection();
    });
    shadowRoot.appendChild(savePill);
  }

  function getSelectionText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return sel.toString().trim();
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
  }

  function showSavePill() {
    if (!savePill) createSavePill();
    const rect = getSelectionRect();
    if (!rect) return;

    // Position the pill just above the selection, centered
    const pillW = 130, pillH = 32, gap = 8;
    let left = rect.left + rect.width / 2 - pillW / 2;
    let top = rect.top - pillH - gap;

    // If no room above, place below
    if (top < 6) top = rect.bottom + gap;
    left = Math.max(6, Math.min(left, window.innerWidth - pillW - 6));

    savePill.style.left = left + 'px';
    savePill.style.top = top + 'px';
    savePill.classList.remove('hidden');
  }

  function hideSavePill() {
    if (savePill) savePill.classList.add('hidden');
    pendingSelectionText = '';
  }

  async function saveSelection() {
    const text = pendingSelectionText || getSelectionText();
    if (!text) { hideSavePill(); return; }
    hideSavePill();
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SAVE_SELECTION', text });
      showToast(res && res.success ? '✓ Saved to Prompt Vault' : 'Could not save');
    } catch (e) {
      showToast('Could not save');
    }
    // Dismiss the highlight WITHOUT destroying the caret (so a following insert
    // into the same field still has a place to land). collapseToEnd keeps a caret.
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) sel.collapseToEnd();
    } catch (e) { /* ignore */ }
    // Make sure saving never leaves insert state wedged
    syncInsertState();
  }

  // Show the pill after a selection is made
  document.addEventListener('mouseup', (e) => {
    // Never interfere with our own UI or the open picker
    if (pickerOpen) return;
    if (e.composedPath && e.composedPath().some(n => n === shadowHost)) return;
    setTimeout(() => {
      if (pickerOpen) return;
      const text = getSelectionText();
      if (text.length >= 3) {
        pendingSelectionText = text;
        showSavePill();
      } else {
        hideSavePill();
      }
    }, 10);
  }, true);

  // Hide the pill when the selection is cleared or user scrolls/clicks away
  document.addEventListener('selectionchange', () => {
    if (getSelectionText().length < 3) hideSavePill();
  });
  document.addEventListener('mousedown', (e) => {
    if (e.composedPath && e.composedPath().some(n => n === shadowHost)) return;
    hideSavePill();
  }, true);
  window.addEventListener('scroll', () => {
    // Keep it glued to the selection while scrolling, if still selected
    if (savePill && !savePill.classList.contains('hidden')) {
      if (getSelectionText().length >= 3) showSavePill();
      else hideSavePill();
    }
  }, { passive: true });

  // Position the pill at given screen coords (used by copy-to-save, where there's
  // no DOM selection rect — e.g. Google Docs). Falls back to bottom-right.
  function showSavePillAt(x, y) {
    if (!savePill) createSavePill();
    const pillW = 130, pillH = 32;
    let left = (typeof x === 'number') ? x + 12 : window.innerWidth - pillW - 16;
    let top  = (typeof y === 'number') ? y + 12 : window.innerHeight - pillH - 16;
    left = Math.max(6, Math.min(left, window.innerWidth - pillW - 6));
    top  = Math.max(6, Math.min(top, window.innerHeight - pillH - 6));
    savePill.style.left = left + 'px';
    savePill.style.top = top + 'px';
    savePill.classList.remove('hidden');
  }

  // Track cursor so the copy-pill can appear near it
  let pvLastMouseX = null, pvLastMouseY = null;
  document.addEventListener('mousemove', (e) => {
    pvLastMouseX = e.clientX; pvLastMouseY = e.clientY;
  }, { passive: true, capture: true });

  // Copy-to-save: works where DOM selection is invisible (Google Docs canvas, etc.)
  // Only kicks in when there's no normal selection (so it doesn't double up on
  // regular pages, which are already handled by the mouseup pill).
  async function handleCopyCapture(e) {
    if (pickerOpen) return;
    if (getSelectionText()) return;            // normal page → mouseup pill handles it
    let immediate = '';
    try { immediate = (e && e.clipboardData && e.clipboardData.getData('text/plain') || '').trim(); } catch (ev) {}
    setTimeout(async () => {
      let text = immediate;
      if (!text) { try { text = (await navigator.clipboard.readText()).trim(); } catch (ev) { /* no access */ } }
      if (text && text.length >= 3) {
        pendingSelectionText = text;
        showSavePillAt(pvLastMouseX, pvLastMouseY);
      }
    }, 30);
  }
  document.addEventListener('copy', handleCopyCapture, true);

  // Receive copied text relayed from sub-frames (e.g. the Google Docs input iframe)
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.__pvType === 'PV_COPY_TEXT' && typeof d.text === 'string') {
      const text = d.text.trim();
      if (text.length >= 3 && !pickerOpen) {
        pendingSelectionText = text;
        showSavePillAt(pvLastMouseX, pvLastMouseY);
      }
    }
  });

  // ── Boot ─────────────────────────────────────────────
  // Show a toast when the background saves a selection via the context menu
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'PV_TOAST') {
      if (!shadowRoot) initShadow();
      showToast(msg.text || 'Saved ✓');
    }
  });

  initShadow();
  createFab();

}
