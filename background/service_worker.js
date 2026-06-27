// Background service worker for Prompt Vault

// Initialize storage with defaults + context menu
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['prompts', 'collections']);
  if (!data.prompts) {
    await chrome.storage.local.set({ prompts: [], collections: [] });
  }
  // Right-click "Save selection to Prompt Vault"
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pv-save-selection',
      title: 'Save selection to Prompt Vault',
      contexts: ['selection']
    });
  });
});

// Context-menu capture: auto-title + normalize variables, save instantly (no API)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'pv-save-selection' || !info.selectionText) return;
  const text = normalizeVariables(info.selectionText.trim());
  const title = autoTitleFromText(text);
  const cls = await autoClassifyPrompt({ title, text });
  await savePrompt({ title, text, collections: [], category: cls.category });
  // Tab may not have a content script (e.g. chrome:// pages) — ignore quietly
  chrome.tabs.sendMessage(tab.id, { type: 'PV_TOAST', text: '✓ Saved to Prompt Vault' })
    .catch(() => {});
});

// ── Quick-capture helpers (no API) ─────────────────────
function autoTitleFromText(text) {
  let t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Saved prompt';
  // Strip common lead-ins so the title is about the actual task
  t = t.replace(/^(please\s+|can you\s+|could you\s+|would you\s+|i want you to\s+|i need you to\s+|i'd like you to\s+|write me\s+|write\s+|create\s+|generate\s+|make me\s+|make\s+|help me\s+|give me\s+|act as\s+|you are\s+|your task is to\s+)/i, '');
  // First sentence / line, capped at ~8 words
  const firstSeg = t.split(/[.!?\n]/)[0].trim() || t;
  let title = firstSeg.split(' ').slice(0, 8).join(' ');
  if (!title) title = t.slice(0, 50);
  title = title.charAt(0).toUpperCase() + title.slice(1);
  if (title.length > 60) title = title.slice(0, 57).trim() + '…';
  return title || 'Saved prompt';
}

// Convert [placeholder] style fill-ins (common on prompt sites) to {{placeholder}}.
// Conservative: only square brackets with placeholder-like contents.
function normalizeVariables(text) {
  if (!text) return text;
  return text.replace(/\[([a-zA-Z][a-zA-Z0-9 _/-]{0,40})\]/g, (m, inner) => {
    const v = inner.trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/_+/g, '_');
    return `{{${v}}}`;
  });
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PROMPTS') {
    chrome.storage.local.get(['prompts', 'collections']).then(sendResponse);
    return true;
  }
  if (message.type === 'SAVE_PROMPT') {
    savePrompt(message.prompt).then(sendResponse);
    return true;
  }
  if (message.type === 'UPDATE_PROMPT') {
    updatePrompt(message.prompt).then(sendResponse);
    return true;
  }
  if (message.type === 'DELETE_PROMPT') {
    deletePrompt(message.id).then(sendResponse);
    return true;
  }
  if (message.type === 'SAVE_COLLECTION') {
    saveCollection(message.collection).then(sendResponse);
    return true;
  }
  if (message.type === 'DELETE_COLLECTION') {
    deleteCollection(message.id).then(sendResponse);
    return true;
  }
  if (message.type === 'EXPORT_PROMPTS') {
    exportPrompts().then(sendResponse);
    return true;
  }
  if (message.type === 'UPDATE_VARIABLE_HISTORY') {
    updateVariableHistory(message.promptId, message.variable, message.value).then(sendResponse);
    return true;
  }
  if (message.type === 'AUTO_CLASSIFY') {
    autoClassifyPrompt(message.prompt).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_AI_CONFIG') {
    chrome.storage.local.get(['aiProvider', 'apiKey_gemini', 'apiKey_claude', 'geminiModel']).then(d => {
      sendResponse({
        provider: d.aiProvider || 'gemini',
        hasGemini: !!d.apiKey_gemini,
        hasClaude: !!d.apiKey_claude,
        geminiModel: d.geminiModel || 'gemini-2.5-flash'
      });
    });
    return true;
  }
  if (message.type === 'SET_GEMINI_MODEL') {
    chrome.storage.local.set({ geminiModel: message.model }).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'SET_PROVIDER') {
    chrome.storage.local.set({ aiProvider: message.provider }).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'SET_API_KEY') {
    const field = message.provider === 'claude' ? 'apiKey_claude' : 'apiKey_gemini';
    chrome.storage.local.set({ [field]: message.apiKey, aiProvider: message.provider }).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'AI_TURN') {
    aiTurn(message.messages).then(sendResponse);
    return true;
  }
  if (message.type === 'AI_SUGGEST_CHIPS') {
    suggestChips(message.spec).then(sendResponse);
    return true;
  }
  if (message.type === 'SAVE_SELECTION') {
    (async () => {
      try {
        const text = normalizeVariables((message.text || '').trim());
        if (!text) { sendResponse({ success: false }); return; }
        const title = autoTitleFromText(text);
        const cls = await autoClassifyPrompt({ title, text });
        await savePrompt({ title, text, collections: [], category: cls.category });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false });
      }
    })();
    return true;
  }
});

// ── AI prompt-generation interview ─────────────────────
const AI_SYSTEM_PROMPT = `Standard of prompt generating

Role: You are a professional prompt engineer. You generate prompts following the set of rules and procedures below.

The prompt that you generate should be:
1. Clear and direct — Think of it like giving instructions to a brilliant new hire who has zero context on the project. The clearer you are, the better they perform. Do not use ambiguous words; if an ambiguous word is unavoidable, explain it so it can be interpreted only one way.
2. Specific and detailed — concrete beats vague ("summarize in 3 bullets, each under 15 words" not "summarize briefly"); spell out scope, steps, and what success looks like. For example: "success means generation of 3 bullet points that accurately refer to the topic sentences of the three given paragraphs."
3. Give it a role — Setting a role focuses the AI's behavior and tone for the use case. For instance, if the user asks for help with math homework, give it the role of "a professional middle school math tutor that guides students through each step."
4. Provide context — supply needed background, surfaced as {{variables}} for very specific information that could be changed to be reused in another context. For instance: "set an alarm clock at {{time}} for me to meet {{name}}." If the specific information is given, still use it, but make it a variable that can be changed next time.
5. Specify output format — state structure, length, and sections; phrase as what to do. For instance, is the output a table or a graph?
6. Structure with XML tags — XML tags help the AI parse complex prompts unambiguously, especially when the prompt mixes instructions, context, examples, and variable inputs. Use descriptive tags like <instructions>, <context>, <example>, <output_format>; use consistent, descriptive tag names. Nest tags when content has a natural hierarchy. Simple prompts stay plain.
7. Provide examples (multishot) — Wrap examples in <example> tags (multiple examples in <examples> tags) so the AI can distinguish them from instructions. Include 3–5 examples for best results when examples help.
8. Step-by-step reasoning — For complex tasks, giving the AI space to reason step-by-step dramatically improves accuracy. Use it for analysis / math / multi-factor decisions; skip it for simple lookups.
9. VERY IMPORTANT — make the model SEARCH whenever the answer depends on external or current facts, instead of turning everything into variables. Decide per task: if the needed information is personal or user-defined (e.g. character creation, an alarm time, a name), ask the user via {{variables}}. But if the information is publicly knowable (e.g. comparing two colleges), only take the minimal identifying inputs as variables (the two college names) and instruct the model to research the rest itself rather than asking the user to supply every detail.
10. Use necessary directions, but not excessive ones — include the guidance the task genuinely needs, and nothing more. Do not over-engineer a simple task.

Meta-point: before diving into techniques, define what success looks like, a way to test against those criteria, and a first draft to improve.

Given those rules, when you generate a prompt for the user, produce an output following the template below. Fill in every {{...}} guidance marker with content tailored to the user's specifications, and keep genuine reuse variables as {{snake_case}} placeholders.

<instructions>
You are a professional {{fill in the role best suited to handle this task}}. This task is essential to the user's {{the importance this task relates to}}. You are assisting the user to create {{the form of output the user wants}} for the sake of {{the aim of the task}}. Your output should strictly follow {{the user's requirements for length, tone, style, and other utility requirements}}. It should avoid {{anything the user said to avoid}} and include {{any special requirements the user gave}}.

<criterion_of_success>
Think through the task the user is trying to complete and what success looks like.
1. Briefly break down which characteristics or adjectives would be useful for the user's specific aim. For example: simplicity if it is an urgent email; deep, thorough, careful research of the net if the user is asking for a brainstorm or a big-picture overview. Apply those adjectives to the creation of the prompt.
2. Give numerical restrictions or requirements that operationalize what success looks like. For example: if the user asks for an urgent email, how many sentences are appropriate; if the user asks for a thorough summary of a stock, how many indicators are appropriate? Apply those restrictions to the creation of the prompt.
</criterion_of_success>

<example>
Based on all of the above, create a short example that shows what a good case of success looks like. Otherwise, if the task is more procedural, provide a step-by-step breakdown of the tasks instead.
</example>
</instructions>

Scale the structure to the task: a simple request can stay a clean sentence or two without heavy XML; a complex request should use the full XML-sectioned structure above. Never add commentary or explanation around the prompt itself.

<generation_modes>
The user's request will specify an Output mode and a Deep-thinking setting. Honor them strictly:

- Output mode = CONCISE (default): produce a short, clean, ready-to-paste prompt — usually a few sentences to a short paragraph. Skip heavy XML scaffolding and skip the <criterion_of_success> and <example> sections. Still apply clarity, specificity, an appropriate role when useful, {{variables}}, and the search-vs-variable judgment from rule 9.
- Output mode = FULL: use the complete XML-structured template above, including <instructions>, the success-criterion reasoning, and a worked <example> (or a step-by-step breakdown for procedural tasks).

- Deep thinking = ON: embed reasoning triggers INTO the generated prompt so the target AI reasons before answering. Specifically: instruct the AI to think step by step inside <thinking></thinking> tags before giving its final answer, use open-ended phrasing like "think thoroughly" or "analyze all relevant factors/edge cases", and add a self-check line such as "Before finishing, verify your answer against the requirements." Place the final answer after the thinking.
- Deep thinking = OFF: do not add any reasoning scaffolding or <thinking> tags.

Note: the Deep-thinking setting shapes the GENERATED prompt's wording; it does not change your own JSON output format.
</generation_modes>

<title_rules>
- Maximum 8 words. A short, human label like "Professional Email to Professor".
- Never repeat words or phrases, and never restate the full spec.
</title_rules>

<output_format>
Respond with ONLY a valid JSON object — no markdown, no backticks, no extra text:
{"title":"<= 8 words", "prompt":"<the full generated prompt, with {{variables}} and XML tags where the task is complex>"}
</output_format>`;

async function aiTurn(messages) {
  const cfg = await chrome.storage.local.get(['aiProvider', 'apiKey_gemini', 'apiKey_claude', 'geminiModel']);
  const provider = cfg.aiProvider || 'gemini';

  if (provider === 'claude') {
    return aiTurnClaude(messages, cfg.apiKey_claude);
  }
  return aiTurnGemini(messages, cfg.apiKey_gemini, cfg.geminiModel || 'gemini-2.5-flash');
}

// ── Quick-pick chip suggestions ────────────────────────
const CHIPS_SYSTEM_PROMPT = `You suggest quick, tappable options for what a user's prompt will be ABOUT (its subject or intent).
Given a short specification, return 6 short suggestions, each 2-5 words, concrete and varied — the kinds of specific things this prompt could be about.
No numbering, no punctuation at the ends, no explanations.
Respond with ONLY a JSON array of strings. Example: ["ask for an extension","request a meeting","question about a grade","ask for a recommendation letter","follow up on feedback","clarify an assignment"]`;

async function suggestChips(spec) {
  const cfg = await chrome.storage.local.get(['aiProvider', 'apiKey_gemini', 'apiKey_claude']);
  const provider = cfg.aiProvider || 'gemini';
  const userMsg = `Specification:\n${spec}\n\nSuggest 6 subjects this prompt could be about.`;
  if (provider === 'claude') return chipsClaude(userMsg, cfg.apiKey_claude);
  return chipsGemini(userMsg, cfg.apiKey_gemini);
}

async function chipsGemini(userMsg, apiKey) {
  if (!apiKey) return { error: 'NO_KEY' };
  // Use Flash-Lite for chips: lighter task, and it has its OWN separate quota
  // pool (1,000/day) so it never eats into the generation model's quota.
  const MODEL = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CHIPS_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: { type: 'array', items: { type: 'string' } }
        }
      })
    });
    if (!response.ok) return { error: 'API_ERROR', detail: String(response.status) };
    const result = await response.json();
    const text = (result.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    return { success: true, chips: parseChips(text) };
  } catch (e) {
    return { error: 'NETWORK', detail: String(e) };
  }
}

async function chipsClaude(userMsg, apiKey) {
  if (!apiKey) return { error: 'NO_KEY' };
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: CHIPS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    if (!response.ok) return { error: 'API_ERROR', detail: String(response.status) };
    const result = await response.json();
    const text = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return { success: true, chips: parseChips(text) };
  } catch (e) {
    return { error: 'NETWORK', detail: String(e) };
  }
}

function parseChips(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(clean);
    if (Array.isArray(arr)) {
      return arr.map(s => String(s).trim()).filter(Boolean).slice(0, 8);
    }
  } catch (e) { /* fall through */ }
  return [];
}

// ── Google Gemini (free tier) ──────────────────────────
async function aiTurnGemini(messages, apiKey, model, systemPrompt) {
  if (!apiKey) return { error: 'NO_KEY' };
  const sysPrompt = systemPrompt || AI_SYSTEM_PROMPT;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const MODEL = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const baseConfig = {
    maxOutputTokens: 1024,
    temperature: 0.6,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        title:  { type: 'string', maxLength: 80 },
        prompt: { type: 'string' }
      },
      required: ['title', 'prompt'],
      propertyOrdering: ['title', 'prompt']
    }
  };

  async function call(withPenalty) {
    const generationConfig = withPenalty
      ? { ...baseConfig, frequencyPenalty: 1.0 }
      : baseConfig;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents,
        generationConfig
      })
    });
  }

  try {
    let response = await call(true);
    if (response.status === 400) {
      response = await call(false);  // retry without penalty param
    }

    // Rate limited (429): wait briefly and retry once (handles per-minute bursts)
    if (response.status === 429) {
      await sleep(4000);
      response = await call(false);
      if (response.status === 429) {
        return { error: 'RATE_LIMIT', detail: classifyRateLimit(await safeText(response)) };
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      return { error: 'API_ERROR', detail: `${response.status}: ${errText.slice(0, 200)}` };
    }

    const result = await response.json();
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('\n')
      .trim();

    if (!text) return { error: 'API_ERROR', detail: 'Empty response from model.' };
    return { success: true, data: parseAiJson(text) };
  } catch (e) {
    return { error: 'NETWORK', detail: String(e) };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function safeText(res) { try { return await res.text(); } catch (e) { return ''; } }
function classifyRateLimit(body) {
  // Daily quota exhausted vs per-minute burst
  if (/per day|daily|RPD|quota/i.test(body)) return 'daily';
  return 'minute';
}

// ── Anthropic Claude ───────────────────────────────────
async function aiTurnClaude(messages, apiKey, systemPrompt) {
  if (!apiKey) return { error: 'NO_KEY' };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt || AI_SYSTEM_PROMPT,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: 'API_ERROR', detail: `${response.status}: ${errText.slice(0, 200)}` };
    }

    const result = await response.json();
    const text = (result.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!text) return { error: 'API_ERROR', detail: 'Empty response from model.' };
    return { success: true, data: parseAiJson(text) };
  } catch (e) {
    return { error: 'NETWORK', detail: String(e) };
  }
}

function parseAiJson(text) {
  let parsed;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    return { type: 'question', text: text };
  }
  return sanitizeResult(parsed);
}

// Guard against degenerate model output (e.g. a title that repeats forever).
function sanitizeResult(data) {
  if (!data || typeof data !== 'object') return data;

  if (typeof data.title === 'string') {
    data.title = cleanTitle(data.title);
  }
  if (typeof data.prompt === 'string') {
    data.prompt = collapseRepeats(data.prompt).trim();
  }
  return data;
}

function cleanTitle(title) {
  let t = collapseRepeats(title).trim();
  // Take only the first line/segment
  t = t.split(/[\n\r]/)[0].trim();
  // Cap to 10 words
  const words = t.split(/\s+/);
  if (words.length > 10) t = words.slice(0, 10).join(' ');
  // Hard char cap
  if (t.length > 90) t = t.slice(0, 90).trim();
  return t;
}

// Detect a phrase that repeats back-to-back and keep just one copy.
function collapseRepeats(str) {
  if (!str) return str;
  // Collapse an immediately repeated phrase (>= 6 chars) repeated 2+ times
  let out = str.replace(/(.{6,}?)(?:\s*-?\s*\1){1,}/g, '$1');
  // Collapse repeated single words ("word word word")
  out = out.replace(/\b(\w[\w'-]*)(\s+\1\b){2,}/gi, '$1');
  return out;
}

async function savePrompt(prompt) {
  const data = await chrome.storage.local.get('prompts');
  const prompts = data.prompts || [];
  const newPrompt = {
    ...prompt,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    variableHistory: {},
    usageCount: 0
  };
  prompts.unshift(newPrompt);
  await chrome.storage.local.set({ prompts });
  return { success: true, prompt: newPrompt };
}

async function updatePrompt(updatedPrompt) {
  const data = await chrome.storage.local.get('prompts');
  const prompts = data.prompts || [];
  const idx = prompts.findIndex(p => p.id === updatedPrompt.id);
  if (idx !== -1) {
    prompts[idx] = { ...prompts[idx], ...updatedPrompt, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ prompts });
    return { success: true, prompt: prompts[idx] };
  }
  return { success: false };
}

async function deletePrompt(id) {
  const data = await chrome.storage.local.get('prompts');
  const prompts = (data.prompts || []).filter(p => p.id !== id);
  await chrome.storage.local.set({ prompts });
  return { success: true };
}

async function saveCollection(collection) {
  const data = await chrome.storage.local.get('collections');
  const collections = data.collections || [];
  if (collection.id) {
    const idx = collections.findIndex(c => c.id === collection.id);
    if (idx !== -1) collections[idx] = collection;
    else collections.push(collection);
  } else {
    collections.push({ ...collection, id: Date.now().toString(), createdAt: new Date().toISOString() });
  }
  await chrome.storage.local.set({ collections });
  return { success: true };
}

async function deleteCollection(id) {
  const data = await chrome.storage.local.get(['collections', 'prompts']);
  const collections = (data.collections || []).filter(c => c.id !== id);
  // Remove collection from prompts
  const prompts = (data.prompts || []).map(p => ({
    ...p,
    collections: (p.collections || []).filter(cid => cid !== id)
  }));
  await chrome.storage.local.set({ collections, prompts });
  return { success: true };
}

async function updateVariableHistory(promptId, variable, value) {
  const data = await chrome.storage.local.get('prompts');
  const prompts = data.prompts || [];
  const idx = prompts.findIndex(p => p.id === promptId);
  if (idx !== -1) {
    if (!prompts[idx].variableHistory) prompts[idx].variableHistory = {};
    if (!prompts[idx].variableHistory[variable]) prompts[idx].variableHistory[variable] = [];
    const history = prompts[idx].variableHistory[variable];
    // Add to front, keep unique, max 10
    const filtered = history.filter(h => h !== value);
    prompts[idx].variableHistory[variable] = [value, ...filtered].slice(0, 10);
    prompts[idx].usageCount = (prompts[idx].usageCount || 0) + 1;
    await chrome.storage.local.set({ prompts });
  }
  return { success: true };
}

async function exportPrompts() {
  const data = await chrome.storage.local.get(['prompts', 'collections']);
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    prompts: data.prompts || [],
    collections: data.collections || []
  };
}

// AI auto-classification using keyword analysis
async function autoClassifyPrompt(prompt) {
  const text = (prompt.title + ' ' + prompt.text).toLowerCase();
  
  const categories = {
    'Writing & Editing': ['write', 'edit', 'proofread', 'essay', 'article', 'blog', 'story', 'draft', 'paragraph', 'rewrite', 'summarize', 'summary'],
    'Coding & Dev': ['code', 'debug', 'function', 'script', 'api', 'bug', 'refactor', 'javascript', 'python', 'html', 'css', 'sql', 'error', 'implement'],
    'Analysis & Research': ['analyze', 'analysis', 'research', 'compare', 'evaluate', 'explain', 'pros and cons', 'review', 'assess', 'investigate'],
    'Creative': ['creative', 'imagine', 'brainstorm', 'idea', 'poem', 'story', 'fiction', 'character', 'invent', 'design', 'concept'],
    'Business & Work': ['business', 'email', 'meeting', 'report', 'strategy', 'plan', 'proposal', 'marketing', 'sales', 'project', 'professional'],
    'Learning & Explanations': ['explain', 'teach', 'how does', 'what is', 'learn', 'understand', 'definition', 'example', 'tutorial', 'beginner'],
    'Data & Math': ['data', 'calculate', 'math', 'formula', 'statistics', 'chart', 'graph', 'number', 'percentage', 'dataset']
  };

  let bestMatch = null;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(categories)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return { category: bestScore > 0 ? bestMatch : 'General', score: bestScore };
}
