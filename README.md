# ⚡ Prompt Vault — Chrome Extension

Store, organize, AI-generate, and insert your AI prompts anywhere on the web — including capturing prompts from pages you're reading and pasting them into editors like Google Docs.

**Version 0.0.1** · Manifest V3 · Works on any site

---

## Features at a glance

- **Save & organize** prompts with titles, color-coded collections, auto-detected categories, pinning, and full-text search
- **Capture from anywhere** — highlight text and save it in one click, right-click to save, or copy-to-save inside Google Docs / Word Online
- **Insert anywhere** — a floating ⚡ button drops saved prompts straight into any text field (ChatGPT, Claude, Gmail, Notion, etc.)
- **Paste anywhere** — copy any prompt to your clipboard and paste it into editors that don't accept direct insertion
- **Variables** — `{{variable_name}}` placeholders you fill in at insert/copy time, with history suggestions
- **AI prompt generator** — build high-quality, reusable prompts through a guided flow, using your own free Google Gemini key or an Anthropic Claude key
- **Concise / Full** output styles and a **🧠 Deep-thinking** toggle
- **Export** your whole library as JSON
- **Local & private** — everything lives in your browser; no account

---

## Installation (Developer Mode)

1. Download and unzip this folder
2. Open Chrome → `chrome://extensions/`
3. Turn on **Developer mode** (top-right)
4. Click **Load unpacked** and select the `prompt-vault` folder
5. The ⚡ icon appears in your toolbar
6. (Optional, for local PDFs/files) open the extension's details page and enable **Allow access to file URLs**

To update: remove the old version first, then Load unpacked the new folder, and hard-reload any open pages (`Cmd/Ctrl+Shift+R`).

---

## Capturing prompts (saving)

Three ways to save text into your vault. All of them auto-generate a title, convert `[bracket placeholders]` into `{{variables}}`, and auto-categorize — instantly, with no API call.

1. **Highlight → one click.** Select text on any normal web page and a small **⚡ Save to Vault** pill appears next to it. Click it.
2. **Right-click.** Select text → right-click → **Save selection to Prompt Vault**.
3. **Copy-to-save (Google Docs / Word Online / canvas editors).** These editors render text on a canvas, so highlighting is invisible to extensions. Instead, **select and copy** (`Ctrl/Cmd+C`) — the Save pill then appears so you can save the copied text.

You can also save manually: open the popup → **+ New** → enter a title and prompt text.

---

## Using prompts (inserting & pasting)

### Direct insert (normal text fields)
1. Click into any text field (chat box, search box, form, etc.)
2. The ⚡ button appears near your cursor — **click it once** (it's a click-only button)
3. Pick a prompt; if it has variables you'll be asked to fill them in
4. The prompt is inserted at your cursor

### Paste anywhere (Google Docs, Word Online, restricted pages)
Some editors don't accept programmatic insertion. In those cases Prompt Vault **copies the prompt to your clipboard** instead, and you paste it with **`Ctrl/Cmd+V`**. Two ways to copy:

- In the popup, click the **📋** button on any prompt (fills variables first, if any)
- Or just trigger an insert as usual — if the page can't accept it, it automatically falls back to copying and tells you to paste

This means you can take **any** prompt from your vault into Docs/Word, not just something you copied a moment ago.

---

## AI prompt generator

Open the popup → **✨ Generate with AI**.

1. **Choose a provider** (stored locally, switchable any time):
   - **Google Gemini** — free, no credit card. Get a key at https://aistudio.google.com/apikey
   - **Anthropic Claude** — paid API. Get a key at https://console.anthropic.com
2. **(Gemini) Pick a model:** **Flash** for best quality, or **Flash-Lite** for ~4× more free daily usage.
3. **Pick a category** (Writing / Coding / Creative / Planning / Data) and click through a few quick choices.
4. **Describe the subject** — fill in the blank, tap an AI-suggested quick-pick chip, or add optional details.
5. **Choose options:**
   - **Prompt style:** **Concise** (default — short and lean) or **Full structure** (XML-sectioned, with success criteria and an example)
   - **🧠 Deep thinking:** when on, the generated prompt tells the target AI to reason step-by-step before answering
6. Generate, edit the result if you like, and click **Use this prompt** to drop it into the editor (or save it).

Generated prompts follow a built-in prompt-engineering standard: clear and unambiguous wording, a fitting role, concrete success criteria, `{{variables}}` for personal/changeable details, instructions to **search** for publicly knowable facts (rather than over-using variables), XML structure for complex tasks, and examples where useful.

> **About "thinking mode":** prompt length does **not** turn on an AI's thinking/reasoning mode. That's controlled by the app's own thinking toggle / reasoning-model selection. The Deep-thinking option makes the generated prompt *encourage* step-by-step reasoning, which works best alongside the AI app's own thinking setting.

---

## Prompt variables

Add `{{variable_name}}` anywhere in a prompt:

```
Write a {{tone}} email to {{recipient}} about {{topic}}.
```

When you insert or copy the prompt, you'll be asked to fill in each variable. Your past inputs are remembered and suggested next time. When capturing text, `[bracket placeholders]` are auto-converted to `{{snake_case}}` variables.

---

## Organizing

- **Collections** — click **+ Collection** to create a color-coded group; **right-click** a collection chip to delete it
- **Pin** — click 📌 on any card to keep favorites at the top
- **Search** — type in the search bar to filter instantly
- **Categories** — prompts are auto-tagged by topic as you save them
- **Export** — click **↑** in the header to download your whole library (prompts, collections, variables, history) as JSON

---

## Privacy

Everything is stored locally in your browser — no account, no server. Your API keys are stored locally and used only to call your chosen provider directly. Captured/copied text is only saved when you confirm it.

Note: Google's **free** Gemini tier may use your prompts to improve their models (the paid tier does not). Avoid sending confidential text through the free tier.

---

## Known limitations

- **Inserting into Google Docs / Word Online isn't possible.** They don't use standard text fields and they reject simulated input events, which is a browser security rule no extension can bypass. Prompt Vault works there as a **capture** tool (save text out) and a **copy/paste** tool (copy a prompt, then `Ctrl/Cmd+V`).
- **Chrome's built-in PDF viewer is sandboxed.** Extensions cannot inject any UI or read selections inside it, so the Save pill won't appear over Chrome-rendered PDFs.

---

## Permissions used

- `storage` — save your prompts and settings locally
- `activeTab`, `scripting` — insert prompts into the current page
- `contextMenus` — the right-click "Save selection" item
- `clipboardRead` — capture copied text in Docs/Word and similar editors
- `clipboardWrite` — copy prompts so you can paste them anywhere

---

## Tips

- The ⚡ button is **click-only** — it appears near your cursor when you enter a text field and opens the picker on a single click
- In Google Docs/Word: **copy to save**, and **copy → paste** to use a prompt
- Use **Flash-Lite** (Gemini) if you hit the free daily limit; it offers far more requests
- Quick-pick chips and generated prompts use your free quota — the daily limit resets at midnight Pacific time
