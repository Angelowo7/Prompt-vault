# Privacy Policy for Prompt Vault

**Effective date:** 2026/06

This Privacy Policy explains how the **Prompt Vault** Chrome extension ("the extension," "we," "our") handles your information. Prompt Vault is a personal tool for saving, organizing, inserting, and generating AI prompts.

## Summary

Prompt Vault is **local-first**. Your prompts, collections, settings, and API keys are stored on your own device and are never sent to us. We do not operate any servers that receive your data, we do not run analytics, and we do not track your browsing. The only time data leaves your device is when **you** choose to use the optional AI prompt-generation feature, and even then it is sent directly to the AI provider you selected — not to us.

## Information the extension stores on your device

The following data is stored locally in your browser using `chrome.storage.local` and remains on your device:

- **Prompts and collections** you create, including titles, prompt text, categories, and tags.
- **Variable-fill history** — values you previously entered for prompt variables, kept to suggest them next time.
- **Settings** — such as your selected AI provider and model preferences.
- **Your AI provider API key** (if you choose to use the AI features). It is stored locally and is used only to authenticate requests to the provider you selected.

We do not have access to any of this data.

## Information transmitted off your device

Prompt Vault transmits data off your device only in the following user-initiated cases:

1. **AI prompt generation (optional).** When you use the "Generate with AI" feature, the prompt specifications you enter and your API key are sent over HTTPS directly to the AI provider you chose — **Google (Gemini)** or **Anthropic (Claude)** — to generate a prompt. This data is sent to the provider, not to us.
2. **Clipboard capture (optional).** When you copy text in editors such as Google Docs or Microsoft Word for the web, the extension reads the text you copied so you can save it as a prompt. This happens only in response to your own copy action, and the text is stored locally.
3. **Clipboard paste (optional).** When you choose to copy a saved prompt, the extension writes that prompt to your system clipboard so you can paste it where you want.

We do not transmit your data to any of our own servers, because we do not operate any.

## Information we do NOT collect

Prompt Vault does **not** collect, store, or transmit:

- Personally identifiable information (name, email, address, ID numbers)
- Your browsing history or the content of pages you visit
- Analytics, telemetry, usage tracking, keystrokes, or behavioral data
- Health, financial, or payment information
- Location data

## Third-party AI providers

If you use the AI features, your data is handled by the provider you select, under their own privacy policies:

- **Google Gemini API** — https://policies.google.com/privacy
- **Anthropic (Claude) API** — https://www.anthropic.com/legal/privacy

Please note: Google's **free** Gemini API tier may use submitted prompts to improve their models. Avoid sending confidential information through the free tier. We have no control over how these providers handle data once it is sent to them.

## Permissions

The extension requests the following browser permissions solely to provide its features:

- **storage** — to save your prompts, settings, and (locally) your API key on your device.
- **activeTab / scripting** — to insert a selected prompt into the focused text field on the current page, only when you ask it to.
- **contextMenus** — to add the right-click "Save selection to Prompt Vault" option.
- **clipboardRead** — to capture text you copy in canvas-based editors (e.g. Google Docs) so you can save it.
- **clipboardWrite** — to copy a saved prompt so you can paste it.
- **Host access to websites** — so the extension can show its insert button and capture/insert prompts on the sites where you choose to use it. It does not read, collect, or transmit page content or browsing history.

## Data retention and deletion

Because your data is stored locally, you are in control of it:

- Delete individual prompts or collections at any time within the extension.
- Use your browser's extension data controls to clear all stored data.
- **Uninstalling the extension removes all locally stored data.**

We retain nothing, because we never receive your data.

## Children

Prompt Vault is a general-purpose productivity tool and is not directed to children under 13.

## Changes to this policy

We may update this Privacy Policy from time to time. Changes will be reflected on this page with an updated effective date.

## Contact

If you have questions about this Privacy Policy, contact: **Angeloz.personal@outlook.com**

---

*Prompt Vault is published by Angela Z. This policy applies to the Prompt Vault browser extension.*
