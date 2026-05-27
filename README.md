# Museboard

<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" alt="Museboard icon" />
</p>

Museboard is a macOS-first desktop app for visual creation planning. It connects a structured mind map, an image reference canvas, local LLM text generation, and local ComfyUI image generation into one workflow.

Museboard 是一个面向绘画、插画、角色设计和场景设计的桌面工具。它把“创作文案、思维导图、参考图管理、AI 深化节点、本地 ComfyUI 生图”放在同一个工作区里。

## Current Status

Museboard is an MVP. It is usable for local testing, but public distribution is not fully finished yet.

- Platform priority: macOS
- Desktop framework: Tauri 2
- Frontend: React + TypeScript + Vite
- Text model integration: LM Studio, OpenAI API, DeepSeek API, Ollama, and custom OpenAI-compatible endpoints
- Image generation integration: local ComfyUI, with Flux-oriented preset support
- Distribution status: local unsigned macOS app/DMG only

Public macOS release still requires Developer ID signing and notarization.

## Main Features

- Node-driven mind map for visual ideation
- Creation templates for story illustration, character design, object design, and scene design
- AI-assisted node expansion: select any node and generate the next level of child nodes
- AI-generated node descriptions and final briefs
- Canvas reference management linked to mind-map nodes
- Parent nodes aggregate images from all descendant nodes
- Per-node canvas layout, so the same image can have different position, scale, rotation, mirror, and black-and-white display states in different views
- Drag-and-drop local images or image links
- Multi-select box for moving images and annotations together
- Annotation tools: rectangle, arrow, text, and freehand line
- Clean canvas mode for reference-only viewing
- Always-on-top mode for drawing alongside other apps
- Local ComfyUI image generation, including Flux preset setup and generated-image import back into the root node
- Chinese and English UI/text-generation language switching

## Typical Workflow

1. Create or open a Museboard project.
2. Choose a creation type, such as story illustration or character design.
3. Build the mind map manually, or use AI to generate and deepen nodes.
4. Generate a brief from confirmed nodes.
5. Click any node and drag reference images into its canvas.
6. Use parent nodes to review all images from child nodes together.
7. Add simple annotations, mirror images, or switch images to black and white when comparing values and silhouettes.
8. Optionally send the brief to ComfyUI, generate an image, and save the result back into the top-level node.

## User Setup

### Install From Source

Requirements:

- macOS
- Node.js 20+
- Rust toolchain
- Xcode command line tools

Install dependencies:

```bash
npm install --cache .npm-cache
```

Run the browser preview:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Run the desktop app in development:

```bash
npm run tauri -- dev
```

Build the macOS app and DMG:

```bash
npm run tauri -- build
```

Generated local release artifacts:

- `src-tauri/target/release/bundle/macos/Museboard.app`
- `src-tauri/target/release/bundle/dmg/Museboard_0.1.0_aarch64.dmg`

## Text Model Setup

Use `Settings -> Text Model`.

Supported providers:

- `LM Studio`: local OpenAI-compatible endpoint, default `http://localhost:1234/v1`
- `OpenAI API`: default `https://api.openai.com/v1`, requires an API key
- `DeepSeek API`: default `https://api.deepseek.com`, requires an API key
- `Ollama`: native local endpoint, default `http://localhost:11434`
- `OpenAI-compatible`: custom endpoint for other compatible servers

API keys are saved only in local app preferences. They are not written into `project.museboard.json`.

### LM Studio

```text
http://localhost:1234/v1
```

In LM Studio:

1. Load a chat model.
2. Start the local server.
3. Copy the exact model name.
4. Open Museboard settings.
5. Paste the endpoint and model name into the Text Model section.

### OpenAI API

1. Create an API key in your OpenAI account.
2. In Museboard settings, choose `OpenAI API`.
3. Keep endpoint as `https://api.openai.com/v1`.
4. Paste the API key.
5. Enter the model name you want to use.

### DeepSeek API

1. Create a DeepSeek API key.
2. In Museboard settings, choose `DeepSeek API`.
3. Keep endpoint as `https://api.deepseek.com`.
4. Paste the API key.
5. Use a current DeepSeek chat model name, such as `deepseek-v4-flash`, unless DeepSeek changes its model list.

### Ollama

1. Install Ollama and pull a chat model.
2. Start Ollama.
3. In Museboard settings, choose `Ollama`.
4. Keep endpoint as `http://localhost:11434`.
5. Enter the local model name, for example `qwen3:8b`.

The selected text model powers:

- random mind-map generation
- missing-node completion
- node-description generation
- child-node generation
- brief generation
- prompt rewriting for image generation

## ComfyUI Setup

Use `Settings -> ComfyUI Setup Wizard`.

Recommended flow:

1. Keep the endpoint as `http://127.0.0.1:8188`.
2. Click `Test Connection`.
3. If ComfyUI is not running, set the ComfyUI folder and launch command.
4. Click `Start and Connect`.
5. Click `Flux Recommended Preset`.
6. Click `Generate Test Image`.
7. If the test image appears, the main `Generate Image` button can use ComfyUI.

Detailed guide: [docs/comfyui-setup.md](docs/comfyui-setup.md)

## Project Files

Museboard saves each project as a folder:

```text
project.museboard.json
assets/
```

`project.museboard.json` stores:

- mind-map nodes
- generated or edited brief text
- canvas layouts
- annotations
- image links
- project metadata needed to reopen the board

Runtime text-model and ComfyUI settings are stored in local app preferences, not in project files. Imported images are copied into `assets/`. Desktop projects load canvas images through generated previews so large boards do not keep full base64 images in memory.

## Development

Run checks:

```bash
npm run check
```

Build a local release after checks:

```bash
npm run release:local
```

Known local toolchain limitation: `cargo fmt` and `cargo clippy` require Rust components that may not be installed. Install them with:

```bash
rustup component add rustfmt clippy
```

## Documentation

- [GitHub publishing guide](docs/github-publishing.md)
- [Text model setup guide](docs/ai-provider-setup.md)
- [ComfyUI setup guide](docs/comfyui-setup.md)
- [Manual test plan](docs/manual-test-plan.md)
- [Release checklist](docs/release-checklist.md)

## Known Limitations

- macOS public distribution is not signed or notarized yet.
- Windows and Linux packaging have not been verified.
- ComfyUI compatibility depends on the user's installed models and custom nodes.
- Browser preview cannot auto-start local ComfyUI.
- The app currently stores project data in a local folder format, not in a cloud sync format.

## License

Museboard is open source under the [MIT License](LICENSE).
