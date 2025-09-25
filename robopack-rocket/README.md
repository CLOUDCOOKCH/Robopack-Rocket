# Robopack Rocket

Robopack Rocket is a Firefox Manifest V3 extension that upgrades the custom PowerShell settings editor on [robopack.com](https://robopack.com) with a fully featured coding experience. It transparently keeps the original `<textarea>` as the source of truth so site forms continue to work while you enjoy syntax highlighting, code-editor ergonomics, and persistent sizing.

## Features

- **Monaco + Prism highlighting** – Loads the Monaco editor from a CDN when allowed. If RoboPack’s CSP blocks it, the extension automatically falls back to a Prism.js powered editor and shows a gentle toast explaining the fallback.
- **Two-way syncing** – The original `<textarea>` stays in place (hidden when the editor is active) and stays in sync with every keystroke so native site behaviour keeps working.
- **Resizable workspace** – Drag the corner grip or use the keyboard to adjust editor height. The chosen size is remembered per RoboPack path.
- **Toggle friendly** – Switch between the stock textarea and the enhanced editor at any time without losing content.
- **Options page** – Customise selectors, fonts, tab stops, wrapping, theme override, and your preferred highlighter (Monaco, Prism, or automatic).
- **Per-site persistence** – Editor dimensions and preferences are stored per origin + path so different RoboPack sections can have different layouts.
- **Accessible toasts & controls** – Keyboard focus, labelled buttons, and polite toasts keep the experience inclusive.

## Installation

1. Clone or download this repository.
2. Open Firefox and visit `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the `manifest.json` file inside the `robopack-rocket` directory.
4. Open a RoboPack page containing a large PowerShell textarea (e.g. custom settings). The extension enhances it automatically.

## Usage

- Click **Enhance PS Editor** to switch to the Monaco/Prism editor. Click again to revert to the stock textarea.
- Drag the resize grip at the bottom of the editor or use <kbd>Arrow Up/Down</kbd> (with <kbd>Shift</kbd> for larger steps) while the grip is focused to change height.
- Open the Options page from the Add-ons Manager or the extension’s context menu to tweak selectors and editor behaviour. Use **Test selectors on current tab** to flash outlines around matching textareas.

## Privacy

All processing happens locally in your browser. No code, telemetry, or personal data leaves the page.

## Troubleshooting

- **Monaco fails to load** – RoboPack’s Content Security Policy might block the CDN. The extension will fall back to Prism automatically and show a toast describing the reason. You can force Prism as the preferred highlighter from Options.
- **Textarea not detected** – Adjust the selector list in Options or use the built-in heuristic (clear the selector field).
- **Styling conflicts** – The editor inherits container width and sits inside the existing form markup, so layout changes should be minimal. If custom CSS on the site interferes, try reducing the editor height or toggling back to the native textarea.

## Monaco vs. Prism

| Feature | Monaco | Prism |
| --- | --- | --- |
| Syntax highlighting | Full language server level | Token-based highlight |
| Editing experience | Rich IDE-like (multi-cursor, IntelliSense-ready) | Lightweight, contenteditable overlay |
| CSP friendliness | May be blocked by strict CSP | Works almost everywhere |
| Bundle size | Larger (lazy loaded) | Minimal |

Choose **Auto** to enjoy Monaco whenever possible with transparent fallback to Prism.
