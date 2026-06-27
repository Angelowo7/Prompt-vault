// Prompt Vault — popup.js

let allPrompts = [];
let allCollections = [];
let activeCollection = 'all';
let searchQuery = '';
let editingPromptId = null;
let selectedColor = '#6366f1';

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindEvents();
});

async function loadData() {
  const data = await chrome.runtime.sendMessage({ type: 'GET_PROMPTS' });
  allPrompts = data.prompts || [];
  allCollections = data.collections || [];
  renderCollections();
  renderPrompts();
}

// ── Event Bindings ────────────────────────────────────
function bindEvents() {
  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    document.getElementById('clearSearch').style.display = searchQuery ? 'block' : 'none';
    renderPrompts();
  });
  document.getElementById('clearSearch').addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    document.getElementById('clearSearch').style.display = 'none';
    renderPrompts();
  });

  // New prompt
  document.getElementById('newPromptBtn').addEventListener('click', () => openPromptModal());
  document.getElementById('closePromptModal').addEventListener('click', closePromptModal);
  document.getElementById('cancelPromptModal').addEventListener('click', closePromptModal);
  document.getElementById('savePromptBtn').addEventListener('click', savePrompt);

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  // API key save
  document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
  bindProviderSelect();

  // AI step flow
  document.getElementById('aiStepBack').addEventListener('click', stepBack);
  document.getElementById('aiDetailsBack').addEventListener('click', () => { currentStepIndex = getSteps().length - 1; renderStep(); });
  document.getElementById('aiGenerateBtn').addEventListener('click', generatePrompt);
  document.getElementById('aiUseBtn').addEventListener('click', useAiResult);
  document.getElementById('aiRegenerateBtn').addEventListener('click', generatePrompt);
  document.getElementById('aiRestartBtn').addEventListener('click', () => { resetAiFlow(); renderCategoryGrid(); showAiScreen('category'); });
  document.getElementById('aiErrorRetry').addEventListener('click', generatePrompt);

  // Complexity segmented toggle (Concise default / Full)
  document.querySelectorAll('.gen-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      promptComplexity = btn.dataset.complexity;
      document.querySelectorAll('.gen-opt').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  // Deep thinking switch
  document.getElementById('deepThinkingToggle').addEventListener('change', e => {
    deepThinking = e.target.checked;
  });

  // Gemini model toggle (Flash vs Flash-Lite)
  document.querySelectorAll('.model-opt').forEach(btn => {
    btn.addEventListener('click', async () => {
      geminiModel = btn.dataset.model;
      syncModelToggle();
      await chrome.runtime.sendMessage({ type: 'SET_GEMINI_MODEL', model: geminiModel });
      chipsCache = {}; // different model may suggest differently
      showToast(geminiModel.includes('lite') ? 'Flash-Lite — more free use' : 'Flash — best quality');
    });
  });

  // Prompt text live variable detection
  document.getElementById('promptText').addEventListener('input', detectVariables);

  // Auto classify on title/text change
  let classifyTimer;
  const classifyFields = ['promptTitle', 'promptText'];
  classifyFields.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(classifyTimer);
      classifyTimer = setTimeout(runAutoClassify, 600);
    });
  });

  // Collections
  document.getElementById('addCollectionBtn').addEventListener('click', () => {
    document.getElementById('collectionModal').style.display = 'flex';
    document.getElementById('collectionName').focus();
  });
  document.getElementById('closeCollectionModal').addEventListener('click', closeCollectionModal);
  document.getElementById('cancelCollectionModal').addEventListener('click', closeCollectionModal);
  document.getElementById('saveCollectionBtn').addEventListener('click', saveCollection);

  // Color picker
  document.getElementById('colorRow').addEventListener('click', e => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    selectedColor = dot.dataset.color;
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportLibrary);

  // Close modals on overlay click
  document.getElementById('promptModal').addEventListener('click', e => {
    if (e.target === document.getElementById('promptModal')) closePromptModal();
  });
  document.getElementById('collectionModal').addEventListener('click', e => {
    if (e.target === document.getElementById('collectionModal')) closeCollectionModal();
  });
}

// ── Render ────────────────────────────────────────────
function renderCollections() {
  const scroll = document.getElementById('collectionsScroll');
  // Remove old dynamic chips (keep All, Pinned, and Add button)
  const chips = scroll.querySelectorAll('.collection-chip:not([data-id="all"]):not([data-id="pinned"]):not(.add-collection)');
  chips.forEach(c => c.remove());

  // Insert before add button
  const addBtn = document.getElementById('addCollectionBtn');
  allCollections.forEach(col => {
    const chip = document.createElement('button');
    chip.className = 'collection-chip';
    chip.dataset.id = col.id;
    chip.textContent = col.name;
    chip.style.setProperty('--col-color', col.color);
    if (activeCollection === col.id) chip.classList.add('active');
    chip.addEventListener('click', () => setCollection(col.id));

    // Right-click to delete
    chip.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (confirm(`Delete collection "${col.name}"?`)) {
        chrome.runtime.sendMessage({ type: 'DELETE_COLLECTION', id: col.id }).then(() => {
          allCollections = allCollections.filter(c => c.id !== col.id);
          if (activeCollection === col.id) activeCollection = 'all';
          renderCollections();
          renderPrompts();
        });
      }
    });

    scroll.insertBefore(chip, addBtn);
  });

  // Update active state of All/Pinned
  scroll.querySelector('[data-id="all"]').classList.toggle('active', activeCollection === 'all');
  scroll.querySelector('[data-id="pinned"]').classList.toggle('active', activeCollection === 'pinned');

  // Bind static chips
  scroll.querySelector('[data-id="all"]').onclick = () => setCollection('all');
  scroll.querySelector('[data-id="pinned"]').onclick = () => setCollection('pinned');

  // Populate collection select in modal
  populateCollectionSelect();
}

function setCollection(id) {
  activeCollection = id;
  renderCollections();
  renderPrompts();
}

function renderPrompts() {
  const list = document.getElementById('promptsList');
  const empty = document.getElementById('emptyState');

  let filtered = [...allPrompts];

  // Filter by collection
  if (activeCollection === 'pinned') {
    filtered = filtered.filter(p => p.pinned);
  } else if (activeCollection !== 'all') {
    filtered = filtered.filter(p => (p.collections || []).includes(activeCollection));
  }

  // Filter by search
  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(searchQuery) ||
      p.text.toLowerCase().includes(searchQuery) ||
      (p.category || '').toLowerCase().includes(searchQuery)
    );
  }

  // Sort: pinned first, then by updatedAt
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  // Clear cards (keep empty state)
  list.querySelectorAll('.prompt-card').forEach(c => c.remove());

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(prompt => {
    const card = buildPromptCard(prompt);
    list.appendChild(card);
  });
}

function buildPromptCard(prompt) {
  const vars = extractVariables(prompt.text);
  const colls = (prompt.collections || [])
    .map(id => allCollections.find(c => c.id === id))
    .filter(Boolean);

  const card = document.createElement('div');
  card.className = 'prompt-card' + (prompt.pinned ? ' pinned' : '');
  card.dataset.id = prompt.id;

  card.innerHTML = `
    <div class="prompt-card-top">
      <div class="prompt-title">${escHtml(prompt.title || 'Untitled')}</div>
      <div class="prompt-card-actions">
        <button class="card-btn pin-btn ${prompt.pinned ? 'active' : ''}" title="${prompt.pinned ? 'Unpin' : 'Pin'}">📌</button>
        <button class="card-btn copy-btn" title="Copy text (paste anywhere with Ctrl/Cmd+V)">📋</button>
        <button class="card-btn edit-btn" title="Edit">✎</button>
        <button class="card-btn delete-btn" title="Delete">🗑</button>
      </div>
    </div>
    <div class="prompt-preview">${escHtml(prompt.text)}</div>
    <div class="prompt-meta">
      ${prompt.category ? `<span class="category-badge">${escHtml(prompt.category)}</span>` : ''}
      ${colls.map(c => `<span class="collection-badge" style="background:${c.color}22;color:${c.color}">${escHtml(c.name)}</span>`).join('')}
      ${vars.length ? `<span class="var-indicator">⬡ ${vars.length} var${vars.length > 1 ? 's' : ''}</span>` : ''}
      ${prompt.pinned ? `<span class="pin-indicator">📌</span>` : ''}
    </div>
  `;

  // Click card to insert
  card.addEventListener('click', e => {
    if (e.target.closest('.prompt-card-actions')) return;
    handleInsert(prompt);
  });

  // Pin
  card.querySelector('.pin-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: 'UPDATE_PROMPT', prompt: { ...prompt, pinned: !prompt.pinned } });
    const idx = allPrompts.findIndex(p => p.id === prompt.id);
    if (idx !== -1) allPrompts[idx].pinned = !prompt.pinned;
    renderPrompts();
  });

  // Copy to clipboard — for pasting into Google Docs / Word / anywhere
  card.querySelector('.copy-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const vars = extractVariables(prompt.text);
    if (vars.length > 0) {
      // Fill variables first, then copy the result
      showVariableFillModal(prompt, vars, 'copy');
    } else {
      await copyTextToClipboard(prompt.text);
    }
  });

  // Edit
  card.querySelector('.edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openPromptModal(prompt);
  });

  // Delete
  card.querySelector('.delete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('Delete this prompt?')) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_PROMPT', id: prompt.id });
    allPrompts = allPrompts.filter(p => p.id !== prompt.id);
    renderPrompts();
    showToast('Prompt deleted');
  });

  return card;
}

// ── Insert Prompt ─────────────────────────────────────
async function handleInsert(prompt) {
  const vars = extractVariables(prompt.text);
  if (vars.length === 0) {
    // Direct insert
    await insertIntoPage(prompt.text, prompt);
  } else {
    // Show variable fill modal inline
    showVariableFillModal(prompt, vars);
  }
}

function showVariableFillModal(prompt, vars, mode = 'insert') {
  // Build a quick modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';

  const history = prompt.variableHistory || {};
  const actionLabel = mode === 'copy' ? 'Copy Prompt' : 'Insert Prompt';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Fill in Variables</h2>
        <button class="icon-btn close-btn" id="closeVarModal">✕</button>
      </div>
      <div class="modal-body" id="varModalBody">
        ${vars.map(v => `
          <label class="field-label">${escHtml(v)}</label>
          <input type="text" class="text-input var-input" data-var="${escHtml(v)}" 
            placeholder="Enter ${escHtml(v)}..." autocomplete="off" list="hist-${escHtml(v)}" />
          <datalist id="hist-${escHtml(v)}">
            ${(history[v] || []).map(h => `<option value="${escHtml(h)}">`).join('')}
          </datalist>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" id="cancelVarModal">Cancel</button>
        <button class="btn-primary" id="insertVarBtn">${actionLabel}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('.var-input')?.focus();

  overlay.querySelector('#closeVarModal').onclick = () => overlay.remove();
  overlay.querySelector('#cancelVarModal').onclick = () => overlay.remove();
  overlay.querySelector('#insertVarBtn').onclick = async () => {
    const inputs = overlay.querySelectorAll('.var-input');
    let text = prompt.text;
    for (const input of inputs) {
      const varName = input.dataset.var;
      const value = input.value.trim();
      text = text.replaceAll(`{{${varName}}}`, value);
      if (value) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_VARIABLE_HISTORY',
          promptId: prompt.id,
          variable: varName,
          value
        });
      }
    }
    overlay.remove();
    if (mode === 'copy') await copyTextToClipboard(text);
    else await insertIntoPage(text, prompt);
  };
}

// Copy text to clipboard from the popup (works for pasting into Docs/Word/anywhere)
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied — paste with Ctrl/Cmd+V');
  } catch (e) {
    // Fallback for contexts where the async API is blocked
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied — paste with Ctrl/Cmd+V');
    } catch (e2) {
      showToast('Could not copy');
    }
  }
}

async function insertIntoPage(text, prompt) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
          if (el.isContentEditable) {
            el.focus();
            const ok = document.execCommand('insertText', false, text);
            if (!ok) return false;
          } else {
            const start = el.selectionStart != null ? el.selectionStart : el.value.length;
            const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
            const current = el.value;
            el.value = current.slice(0, start) + text + current.slice(end);
            el.selectionStart = el.selectionEnd = start + text.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return true;
        }
        return false;
      },
      args: [text]
    });
    const inserted = Array.isArray(results) && results[0] && results[0].result === true;
    if (inserted) {
      showToast('Prompt inserted ✓');
      window.close();
    } else {
      // No editable field focused (e.g. Google Docs / Word) → copy so the user
      // can paste it anywhere with Ctrl/Cmd+V
      await copyTextToClipboard(text);
    }
  } catch (e) {
    // Page can't be scripted (restricted page, etc.) → copy to clipboard
    await copyTextToClipboard(text);
  }
}

// ── Prompt Modal ──────────────────────────────────────
function openPromptModal(prompt = null) {
  editingPromptId = prompt ? prompt.id : null;
  document.getElementById('modalTitle').textContent = prompt ? 'Edit Prompt' : 'New Prompt';
  document.getElementById('promptTitle').value = prompt ? prompt.title : '';
  document.getElementById('promptText').value = prompt ? prompt.text : '';

  // Set collection select
  populateCollectionSelect(prompt?.collections?.[0] || '');

  document.getElementById('promptModal').style.display = 'flex';

  // Always start in Write mode; show AI tab only for new prompts
  document.getElementById('modeTabs').style.display = prompt ? 'none' : 'flex';
  switchMode('write');

  document.getElementById('promptTitle').focus();

  detectVariables();
  runAutoClassify();
}

function closePromptModal() {
  document.getElementById('promptModal').style.display = 'none';
  editingPromptId = null;
  document.getElementById('autoClassifyBadge').style.display = 'none';
  resetAiFlow();
}

async function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const text = document.getElementById('promptText').value.trim();
  const collectionId = document.getElementById('promptCollection').value;

  if (!title) { showToast('Please enter a title'); return; }
  if (!text) { showToast('Please enter prompt text'); return; }

  const badge = document.getElementById('autoClassifyBadge');
  const category = badge.style.display !== 'none' ? badge.textContent : '';

  const promptData = {
    title,
    text,
    collections: collectionId ? [collectionId] : [],
    category
  };

  if (editingPromptId) {
    promptData.id = editingPromptId;
    const res = await chrome.runtime.sendMessage({ type: 'UPDATE_PROMPT', prompt: promptData });
    const idx = allPrompts.findIndex(p => p.id === editingPromptId);
    if (idx !== -1) allPrompts[idx] = res.prompt;
    showToast('Prompt updated');
  } else {
    const res = await chrome.runtime.sendMessage({ type: 'SAVE_PROMPT', prompt: promptData });
    allPrompts.unshift(res.prompt);
    showToast('Prompt saved');
  }

  closePromptModal();
  renderPrompts();
}

function detectVariables() {
  const text = document.getElementById('promptText').value;
  const vars = extractVariables(text);
  const preview = document.getElementById('variablePreview');
  const chips = document.getElementById('variableChips');

  if (vars.length === 0) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = 'block';
  chips.innerHTML = vars.map(v => `<span class="var-chip">{{${escHtml(v)}}}</span>`).join('');
}

async function runAutoClassify() {
  const title = document.getElementById('promptTitle').value;
  const text = document.getElementById('promptText').value;
  if (!title && !text) return;

  const res = await chrome.runtime.sendMessage({
    type: 'AUTO_CLASSIFY',
    prompt: { title, text }
  });

  const badge = document.getElementById('autoClassifyBadge');
  if (res && res.category && res.score > 0) {
    badge.textContent = res.category;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Collection Modal ──────────────────────────────────
function closeCollectionModal() {
  document.getElementById('collectionModal').style.display = 'none';
  document.getElementById('collectionName').value = '';
}

async function saveCollection() {
  const name = document.getElementById('collectionName').value.trim();
  if (!name) { showToast('Enter a collection name'); return; }

  const collection = { name, color: selectedColor };
  await chrome.runtime.sendMessage({ type: 'SAVE_COLLECTION', collection });

  const data = await chrome.storage.local.get('collections');
  allCollections = data.collections || [];

  closeCollectionModal();
  renderCollections();
  showToast(`Collection "${name}" created`);
}

function populateCollectionSelect(selectedId = '') {
  const sel = document.getElementById('promptCollection');
  sel.innerHTML = '<option value="">— None —</option>';
  allCollections.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.id;
    opt.textContent = col.name;
    if (col.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Export ────────────────────────────────────────────
async function exportLibrary() {
  const data = await chrome.runtime.sendMessage({ type: 'EXPORT_PROMPTS' });
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompt-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Library exported ✓');
}

// ── Helpers ───────────────────────────────────────────
function extractVariables(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}


// ══════════════════════════════════════════════════════
//  AI PROMPT GENERATION  (click-through steps, no Q&A)
// ══════════════════════════════════════════════════════

let aiBusy = false;

// Provider metadata for the key notice
const PROVIDER_INFO = {
  gemini: {
    label: '⚡ Gemini',
    placeholder: 'AIza...',
    sub: "Paste your free Google Gemini API key. It's stored locally on your device only.",
    linkHtml: 'Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" class="link-like">aistudio.google.com/apikey</a> — no credit card needed'
  },
  claude: {
    label: '✦ Claude',
    placeholder: 'sk-ant-...',
    sub: "Paste your Anthropic API key. It's stored locally on your device only.",
    linkHtml: 'Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" class="link-like">console.anthropic.com</a> (paid usage)'
  }
};

let selectedProvider = 'gemini';
let activeProvider = 'gemini';
let geminiModel = 'gemini-2.5-flash';

// ── Category → smart step sets ────────────────────────
// Each category has its own ordered list of click-through steps.
const CATEGORY_STEPS = {
  Writing: {
    icon: '✍️', subjectHint: "what's it about?",
    steps: [
      { key: 'Type',     title: 'What are you writing?', options: ['Email / Message', 'Article / Blog post', 'Summary / TL;DR', 'Rewrite / Polish', 'Social post', 'Something else'] },
      { key: 'Tone',     title: 'What tone?',            options: ['Professional', 'Casual / Friendly', 'Persuasive', 'Formal', 'Playful'] },
      { key: 'Length',   title: 'How long?',             options: ['Short & punchy', 'Medium', 'Long / detailed', 'Flexible'] },
      { key: 'Audience', title: 'Who is it for?',        options: ['General', 'Colleagues', 'Customers', 'Executives', 'Friends'] }
    ]
  },
  Coding: {
    icon: '💻', subjectHint: 'what should it do?',
    steps: [
      { key: 'Task',     title: 'What do you need?',     options: ['Debug / Fix an error', 'Write new code', 'Explain code', 'Refactor / Optimize', 'Write tests', 'Something else'] },
      { key: 'Language', title: 'Which language?',       options: ['Python', 'JavaScript / TS', 'Java', 'C / C++', 'SQL', 'Any / Other'] },
      { key: 'Output',   title: 'How much explanation?', options: ['Just the code', 'Code + brief comments', 'Code + full explanation'] },
      { key: 'Level',    title: 'Pitch it for…',         options: ['Beginner-friendly', 'Intermediate', 'Expert / concise'] }
    ]
  },
  Creative: {
    icon: '🎨', subjectHint: "what's the theme?",
    steps: [
      { key: 'Type',   title: 'What are you making?', options: ['Story / Fiction', 'Brainstorm ideas', 'Poem / Lyrics', 'Characters / Worldbuilding', 'Script / Dialogue', 'Something else'] },
      { key: 'Mood',   title: 'What mood?',           options: ['Lighthearted', 'Dramatic', 'Dark', 'Whimsical', 'Inspirational'] },
      { key: 'Length', title: 'How long?',            options: ['Short', 'Medium', 'Long', 'Flexible'] }
    ]
  },
  Planning: {
    icon: '🗂️', subjectHint: 'what are you planning?',
    steps: [
      { key: 'Type',   title: 'What are you planning?', options: ['Project plan', 'Schedule / Timeline', 'Strategy / Approach', 'Task breakdown', 'Decision / Comparison', 'Something else'] },
      { key: 'Format', title: 'Output format?',         options: ['Step-by-step list', 'Table', 'Timeline', 'Outline', 'Prose'] },
      { key: 'Depth',  title: 'How detailed?',          options: ['High-level overview', 'Detailed', 'Exhaustive'] }
    ]
  },
  Data: {
    icon: '📊', subjectHint: "what's the data or goal?",
    steps: [
      { key: 'Task',   title: 'What do you need?',  options: ['Analyze data', 'Visualize / Chart', 'Spreadsheet formula', 'Extract / Structure info', 'Clean / Transform', 'Something else'] },
      { key: 'Format', title: 'Output format?',     options: ['Plain explanation', 'Table', 'Code (Python / pandas)', 'Spreadsheet formula', 'JSON'] },
      { key: 'Depth',  title: 'How much detail?',   options: ['Quick answer', 'Step-by-step', 'Detailed w/ reasoning'] }
    ]
  }
};

let chosenCategory = null;
let selections = {};        // { stepKey: chosenOption }
let currentStepIndex = 0;
let extraDetails = '';
let subjectValue = '';      // the fill-in-blank subject
let promptComplexity = 'concise';  // 'concise' (default) | 'full'
let deepThinking = false;

function getSteps() {
  return chosenCategory ? CATEGORY_STEPS[chosenCategory].steps : [];
}

// ── Mode switching ────────────────────────────────────
function switchMode(mode) {
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  const isWrite = mode === 'write';
  document.getElementById('writeMode').style.display = isWrite ? 'flex' : 'none';
  document.getElementById('aiMode').style.display = isWrite ? 'none' : 'flex';
  document.getElementById('writeFooter').style.display = isWrite ? 'flex' : 'none';
  if (mode === 'ai') initAiMode();
}

function applyProviderUI(provider) {
  const info = PROVIDER_INFO[provider];
  document.getElementById('providerSub').textContent = info.sub;
  document.getElementById('apiKeyInput').placeholder = info.placeholder;
  document.getElementById('providerLink').innerHTML = info.linkHtml;
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

// Show exactly one AI screen
function showAiScreen(which) {
  const map = {
    key:      'aiKeyNotice',
    category: 'aiCategoryScreen',
    step:     'aiStepScreen',
    details:  'aiDetailsScreen',
    result:   'aiResultScreen'
  };
  Object.entries(map).forEach(([k, id]) => {
    document.getElementById(id).style.display = k === which ? 'block' : 'none';
  });
}

async function initAiMode() {
  const cfg = await chrome.runtime.sendMessage({ type: 'GET_AI_CONFIG' });
  activeProvider = cfg.provider || 'gemini';
  selectedProvider = activeProvider;
  geminiModel = cfg.geminiModel || 'gemini-2.5-flash';
  const hasKey = activeProvider === 'claude' ? cfg.hasClaude : cfg.hasGemini;

  applyProviderUI(selectedProvider);
  document.getElementById('aiProviderCurrent2').textContent = PROVIDER_INFO[activeProvider].label;

  // Model toggle only applies to Gemini
  const toggle = document.getElementById('modelToggle');
  toggle.style.display = activeProvider === 'gemini' ? 'flex' : 'none';
  syncModelToggle();

  if (!hasKey) { showAiScreen('key'); return; }

  renderCategoryGrid();
  showAiScreen('category');
}

function syncModelToggle() {
  document.querySelectorAll('.model-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.model === geminiModel);
  });
}

// ── Category grid ─────────────────────────────────────
function renderCategoryGrid() {
  const grid = document.getElementById('catGrid');
  grid.innerHTML = '';
  const cats = Object.keys(CATEGORY_STEPS);
  cats.forEach((cat, i) => {
    const card = document.createElement('button');
    card.className = 'cat-card';
    if (i === cats.length - 1 && cats.length % 2 === 1) card.classList.add('full');
    card.innerHTML = `
      <span class="cat-card-icon">${CATEGORY_STEPS[cat].icon}</span>
      <span class="cat-card-name">${cat}</span>`;
    card.addEventListener('click', () => selectCategory(cat));
    grid.appendChild(card);
  });
}

function selectCategory(cat) {
  chosenCategory = cat;
  selections = {};
  currentStepIndex = 0;
  extraDetails = '';
  renderStep();
}

// ── Step screens ──────────────────────────────────────
function contextLabel() {
  const parts = [chosenCategory, ...Object.values(selections)];
  return parts.join(' › ');
}

function renderStep() {
  const steps = getSteps();
  const step = steps[currentStepIndex];
  if (!step) { showDetailsScreen(); return; }

  document.getElementById('aiProgress').textContent = `Step ${currentStepIndex + 1} of ${steps.length}`;
  document.getElementById('aiStepTitle').textContent = step.title;
  document.getElementById('aiContextChip').textContent = contextLabel();

  const list = document.getElementById('aiStepOptions');
  list.innerHTML = '';
  step.options.forEach(opt => {
    const item = document.createElement('button');
    item.className = 'sub-item';
    if (selections[step.key] === opt) item.style.borderColor = 'var(--accent)';
    item.innerHTML = `<span>${opt}</span><span class="arrow">→</span>`;
    item.addEventListener('click', () => {
      selections[step.key] = opt;
      currentStepIndex++;
      if (currentStepIndex < steps.length) renderStep();
      else showDetailsScreen();
    });
    list.appendChild(item);
  });

  showAiScreen('step');
}

function stepBack() {
  if (currentStepIndex === 0) {
    showAiScreen('category');
  } else {
    currentStepIndex--;
    renderStep();
  }
}

function showDetailsScreen() {
  document.getElementById('aiContextChip2').textContent = contextLabel();
  document.getElementById('aiExtraDetails').value = extraDetails;
  subjectValue = '';

  // Sync generation-option toggles to current state
  document.querySelectorAll('.gen-opt').forEach(b => b.classList.toggle('active', b.dataset.complexity === promptComplexity));
  document.getElementById('deepThinkingToggle').checked = deepThinking;

  buildFillSentence();
  showAiScreen('details');
  loadChips();
}

// Build "Email / Message — about [____]" with an inline editable blank
function buildFillSentence() {
  const cat = CATEGORY_STEPS[chosenCategory];
  const firstSel = Object.values(selections)[0] || chosenCategory;
  const hint = cat.subjectHint || 'what specifically?';

  const wrap = document.getElementById('fillSentence');
  wrap.innerHTML = `
    <span class="fs-pick">${escHtml(firstSel)}</span>
    <span class="fs-text"> — about </span>
    <input class="fs-blank" id="subjectInput" placeholder="${escHtml(hint)}" autocomplete="off" spellcheck="false" />
  `;
  const input = document.getElementById('subjectInput');
  input.addEventListener('input', () => {
    subjectValue = input.value.trim();
    input.classList.toggle('filled', !!subjectValue);
    syncChipSelection();
  });
}

// Fetch AI-generated quick-pick chips for the current selections (cached per selection set)
let chipsCache = {};

async function loadChips(forceRefresh) {
  const row = document.getElementById('chipsRow');
  const sig = `${chosenCategory}|${Object.values(selections).join('|')}`;

  // Serve from cache unless refreshing — saves API calls on back/forward
  if (!forceRefresh && chipsCache[sig]) {
    renderChips(chipsCache[sig]);
    return;
  }

  row.innerHTML = `<div class="chips-loading" id="chipsLoading"><div class="ai-dots"><span></span><span></span><span></span></div><span>Finding ideas…</span></div>`;

  const spec = [
    `Category: ${chosenCategory}`,
    ...Object.entries(selections).map(([k, v]) => `${k}: ${v}`)
  ].join('\n');

  const res = await chrome.runtime.sendMessage({ type: 'AI_SUGGEST_CHIPS', spec });

  if (!res || res.error || !res.chips || res.chips.length === 0) {
    row.innerHTML = `<span style="font-size:11.5px;color:var(--text-mute)">Type above, or add details below</span>`;
    return;
  }
  chipsCache[sig] = res.chips;
  renderChips(res.chips);
}

function renderChips(chips) {
  const row = document.getElementById('chipsRow');
  row.innerHTML = '';
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'chip-pick';
    btn.textContent = chip;
    btn.addEventListener('click', () => {
      const input = document.getElementById('subjectInput');
      if (input) {
        input.value = chip;
        subjectValue = chip;
        input.classList.add('filled');
      }
      syncChipSelection();
    });
    row.appendChild(btn);
  });
  // Refresh option
  const refresh = document.createElement('button');
  refresh.className = 'chips-refresh';
  refresh.textContent = '↻ more';
  refresh.addEventListener('click', () => loadChips(true));
  row.appendChild(refresh);
}

function syncChipSelection() {
  document.querySelectorAll('.chip-pick').forEach(b => {
    b.classList.toggle('active', b.textContent === subjectValue);
  });
}

// ── Generation (single API call) ──────────────────────
async function generatePrompt() {
  if (aiBusy) return;
  const subjInput = document.getElementById('subjectInput');
  if (subjInput) subjectValue = subjInput.value.trim();
  extraDetails = document.getElementById('aiExtraDetails').value.trim();

  showAiScreen('result');
  document.getElementById('aiLoading').style.display = 'flex';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('aiError').style.display = 'none';

  aiBusy = true;

  const specLines = [
    `Category: ${chosenCategory}`,
    ...Object.entries(selections).map(([k, v]) => `${k}: ${v}`),
    `About / subject: ${subjectValue || '(make it general & reusable)'}`,
    `Extra details: ${extraDetails || '(none)'}`,
    `Output mode: ${promptComplexity === 'full' ? 'FULL' : 'CONCISE'}`,
    `Deep thinking: ${deepThinking ? 'ON' : 'OFF'}`
  ].join('\n');

  const userMsg =
    `Create a single high-quality, reusable AI prompt based on these specifications:\n\n${specLines}\n\n` +
    `Generate the final prompt now (do not ask any questions). Use {{variable_name}} placeholders for the parts the user will fill in each time. Respond with the final JSON only.`;

  const res = await chrome.runtime.sendMessage({
    type: 'AI_TURN',
    messages: [{ role: 'user', content: userMsg }]
  });

  aiBusy = false;
  document.getElementById('aiLoading').style.display = 'none';

  if (res.error) { showAiError(res); return; }

  const data = res.data || {};
  // Accept either {type:'final',...} or a bare {title,prompt}
  const title = data.title || '';
  const prompt = data.prompt || data.text || '';

  if (!prompt) { showAiError({ error: 'API_ERROR', detail: 'No prompt returned.' }); return; }

  document.getElementById('aiContextChip3').textContent = contextLabel();
  document.getElementById('aiResultTitle').value = title;
  document.getElementById('aiResultText').value = prompt;
  document.getElementById('aiResult').style.display = 'block';
}

function showAiError(res) {
  if (res.error === 'NO_KEY') { showAiScreen('key'); return; }
  let msg;
  if (res.error === 'RATE_LIMIT') {
    if (res.detail === 'daily') {
      msg = "⏳ You've hit today's free Gemini limit. It resets at midnight Pacific time. Tip: switch the model to Flash-Lite for 4× more daily free use (on the first AI screen).";
    } else {
      msg = '⏳ Too many requests in a short time (free tier allows ~10/min). Wait a few seconds and tap Try again.';
    }
  } else if (res.error === 'API_ERROR') {
    msg = '⚠️ Something went wrong. ' + (res.detail || 'API error.');
  } else if (res.error === 'NETWORK') {
    msg = '⚠️ Check your connection and try again.';
  } else {
    msg = '⚠️ Something went wrong.';
  }
  document.getElementById('aiErrorText').textContent = msg;
  document.getElementById('aiError').style.display = 'block';
}

function useAiResult() {
  const title = document.getElementById('aiResultTitle').value.trim();
  const text = document.getElementById('aiResultText').value.trim();
  document.getElementById('promptTitle').value = title;
  document.getElementById('promptText').value = text;
  // Pre-select the matching collection if one exists with the category name
  switchMode('write');
  detectVariables();
  runAutoClassify();
  showToast('Prompt ready — review & save');
}

// ── Provider selection ────────────────────────────────
function bindProviderSelect() {
  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      selectedProvider = btn.dataset.provider;
      applyProviderUI(selectedProvider);
      const cfg = await chrome.runtime.sendMessage({ type: 'GET_AI_CONFIG' });
      const hasKey = selectedProvider === 'claude' ? cfg.hasClaude : cfg.hasGemini;
      if (hasKey) {
        await chrome.runtime.sendMessage({ type: 'SET_PROVIDER', provider: selectedProvider });
        activeProvider = selectedProvider;
        resetAiFlow();
        initAiMode();
      }
    });
  });

  ['aiSwitchProvider2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => {
      resetAiFlow();
      applyProviderUI(selectedProvider);
      showAiScreen('key');
    });
  });
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) { showToast('Please paste your API key'); return; }
  await chrome.runtime.sendMessage({ type: 'SET_API_KEY', apiKey: key, provider: selectedProvider });
  document.getElementById('apiKeyInput').value = '';
  activeProvider = selectedProvider;
  showToast(`${selectedProvider === 'claude' ? 'Claude' : 'Gemini'} key saved ✓`);
  resetAiFlow();
  initAiMode();
}

function resetAiFlow() {
  aiBusy = false;
  chosenCategory = null;
  selections = {};
  currentStepIndex = 0;
  extraDetails = '';
  subjectValue = '';
  promptComplexity = 'concise';
  deepThinking = false;
  const ed = document.getElementById('aiExtraDetails');
  if (ed) ed.value = '';
}
