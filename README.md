# Museboard

Museboard is a Tauri + React prototype for node-driven reference image boards.

## Run the web preview

```bash
npm install --cache .npm-cache
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Run checks

```bash
npm test
npm run build
```

## Desktop app

The Tauri source is in `src-tauri/`. Building the desktop app requires Rust:

```bash
npm run tauri -- dev
```

Build a macOS app and DMG:

```bash
npm run tauri -- build
```

The verified macOS bundle paths are:

- `src-tauri/target/release/bundle/macos/Museboard.app`
- `src-tauri/target/release/bundle/dmg/Museboard_0.1.0_aarch64.dmg`

## AI setup

The app defaults to an LM Studio OpenAI-compatible endpoint:

```text
http://localhost:1234/v1
```

Load a model in LM Studio, copy its model name into the `Model` field, then use:

- `随机导图`
- `补全说明`
- `生成文案`
- `生成下一级`

AI-generated child nodes are candidates first. They enter the tree only after confirmation.

In the desktop app, LM Studio requests are proxied through the Tauri backend. This avoids WebView CORS failures when connecting to `localhost`.

If drag-and-drop image import does not respond, use the latest packaged app. The Tauri window is configured with `dragDropEnabled: false` so HTML5 drop events can reach the canvas. Local image files and direct image URLs are both handled; remote image URLs are copied into `assets/` after a project folder has been selected.
