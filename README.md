# ⚡ Prompt Vault — Chrome Extension
<img width="1400" height="560" alt="promo-tile-1400x560" src="https://github.com/user-attachments/assets/6e5d417b-0e5c-48e1-b8bc-86f4ea2a7b68" />

Store, organize, AI-generate, and insert your AI prompts anywhere on the web. You can also use this as a text vault to copy, store, and paste multiple texts at once.

**Version 0.0.1** · Manifest V3 · Works on any site

<img width="49%" alt="screenshot-1-library" src="https://github.com/user-attachments/assets/913243db-c030-4358-96f6-79bd850fff24" />
<img width="49%" alt="screenshot-2-ai-generate" src="https://github.com/user-attachments/assets/1a7b5a5c-9173-45d4-936f-936590e154c9" />

<img width="49%" alt="screenshot-3-insert" src="https://github.com/user-attachments/assets/8420750c-791d-44d7-a3bb-b909be46bbf6" />
<img width="49%" alt="screenshot-4-capture" src="https://github.com/user-attachments/assets/5d1c4bb0-ac9f-4a46-ab87-5bbd5051d4a0" />


---

## Features at a glance

- **Save & organize** prompts with titles, color-coded collections, auto-detected categories, pinning, and full-text search
- **Capture from anywhere** — highlight text and save it in one click, right-click to save, or copy-to-save inside Google Docs / Word Online
- **Insert anywhere** — a floating ⚡ button drops saved prompts straight into any text field (ChatGPT, Claude, Gmail, Notion, etc.)
- **Variables** — `{{variable_name}}` placeholders you fill in at insert/copy time, with history suggestions
- **AI prompt generator** — build high-quality, reusable prompts through a guided flow, using your own free Google Gemini key or an Anthropic Claude key
- **Export** your whole library as JSON
- **Local & private** — everything lives in your browser; no account

---

## Capturing prompts (saving)

Three ways to save text into your vault. All of them auto-generate a title, convert `[bracket placeholders]` into `{{variables}}`, and auto-categorize — instantly, with no API call.

1. **Highlight → one click.** Select text on any normal web page and a small **⚡ Save to Vault** pill appears next to it. Click it.
2. **Copy-to-save (Google Docs / Word Online / canvas editors).** These editors render text on a canvas, so highlighting is invisible to extensions. Instead, **select and copy** (`Ctrl/Cmd+C`) — the Save pill then appears so you can save the copied text.

You can also save manually: open the popup → **+ New** → enter a title and prompt text.

---

## Using prompts (inserting & pasting)

### Direct insert (normal text fields)
1. Click into any text field (chat box, search box, form, etc.)
2. The ⚡ button appears near your cursor — **click it once** (it's a click-only button)
3. Pick a prompt; if it has variables you'll be asked to fill them in
4. The prompt is inserted at your cursor

### Paste anywhere (Google Docs, Word Online, restricted pages)
Some editors don't accept programmatic insertion. In those cases Prompt Vault **copies the prompt to your clipboard** instead, and you paste it with **`Ctrl/Cmd+V`**. To copy:

- In the popup, click the **📋** button on any prompt (fills variables first, if any)

---

## AI prompt generator

Open the popup → **✨ Generate with AI**.

1. **Choose a provider** (stored locally, switchable any time):
   - **Google Gemini** — free, no credit card. Get a key at https://aistudio.google.com/apikey
   - **Anthropic Claude** — paid API. Get a key at https://console.anthropic.com
3. **Pick a category** (Writing / Coding / Creative / Planning / Data) and click through a few quick choices.
4. **Describe the subject** — fill in the blank, tap an AI-suggested quick-pick chip, or add optional details.
5. **Choose options:**
   - **Prompt style:** **Concise** (default — short and lean) or **Full structure** (XML-sectioned, with success criteria and an example)
   - **🧠 Deep thinking:** when on, the generated prompt tells the target AI to reason step-by-step before answering
6. Generate, edit the result if you like, and click **Use this prompt** to drop it into the editor (or save it).

Generated prompts follow a built-in prompt-engineering standard: clear and unambiguous wording, a fitting role, concrete success criteria, `{{variables}}` for personal/changeable details, instructions to **search** for publicly knowable facts (rather than over-using variables), XML structure for complex tasks, and examples where useful.

> **About "thinking mode":** prompt length does **not** directly turn on an AI's thinking/reasoning mode. That's controlled by the app's own thinking toggle / reasoning-model selection. The Deep-thinking option makes the generated prompt *encourage* step-by-step reasoning, which works best alongside the AI app's own thinking setting.

---

## Prompt variables

Add `{{variable_name}}` anywhere in a prompt:

```
Write a {{tone}} email to {{recipient}} about {{topic}}.
```

When you insert or copy the prompt, you'll be asked to fill in each variable. Your past inputs are remembered and suggested next time. When capturing text, `[bracket placeholders]` are auto-converted to `{{snake_case}}` variables.

---

## Privacy

Everything is stored locally in your browser — no account, no server. Your API keys are stored locally and used only to call your chosen provider directly. Captured/copied text is only saved when you confirm it.

Note: Google's **free** Gemini tier may use your prompts to improve their models (the paid tier does not). Avoid sending confidential text through the free tier.

---

## Permissions used

- `storage` — save your prompts and settings locally
- `activeTab`, `scripting` — insert prompts into the current page
- `contextMenus` — the right-click "Save selection" item
- `clipboardRead` — capture copied text in Docs/Word and similar editors
- `clipboardWrite` — copy prompts so you can paste them anywhere
