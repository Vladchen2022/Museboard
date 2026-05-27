# Manual Test Plan

These tests require the user's real machine, at least one configured text model provider, and installed ComfyUI environment.

## First Launch

1. Install/open the packaged `Museboard.app`.
2. Confirm the app opens without terminal.
3. Confirm no browser demo text appears in the desktop app.
4. Switch language to English, close settings, reopen settings.
5. Confirm language setting persists after app restart.

## Text Model Providers

1. Choose `LM Studio`, enter endpoint `http://localhost:1234/v1`, and enter a loaded model name.
2. Click `随机导图`.
3. Select a node and click `生成说明`.
4. Select a node and click `生成下一级`.
5. Confirm generated text is visual, concrete, and in the selected UI language.
6. Switch to `Ollama`, enter endpoint `http://localhost:11434`, and enter a pulled model name.
7. Generate one node description.
8. If OpenAI or DeepSeek keys are available, switch to that provider, enter endpoint, API key, and model name, then generate one brief.
9. Close and reopen Museboard. Confirm provider, endpoint, model, API key, temperature, and language persist.

## ComfyUI

1. Ensure ComfyUI is not running.
2. Open `设置 -> ComfyUI 连接向导`.
3. Set ComfyUI folder and launch command.
4. Click `启动并连接`.
5. Confirm ComfyUI starts automatically.
6. Click `Flux 推荐预设`.
7. Click `生成测试图`.
8. Confirm a test image appears.
9. Close settings.
10. Click main `生成图片`.
11. Confirm the prompt is related to the current brief.
12. Generate an image and save it to the root node.

## Project Save/Restore

1. Create a project.
2. Add at least 20 images across several child nodes.
3. Add rectangle, arrow, text, and freehand annotations.
4. Use parent node view to rearrange child images.
5. Save the project to a new folder.
6. Quit the app.
7. Reopen the project folder.
8. Confirm nodes, images, layouts, annotations, settings, and generated images remain correct.

## Canvas

1. Drag local images from Finder into a child node.
2. Drag an image link from a browser into a node.
3. Use selection box to move several images and annotations together.
4. Enter clean canvas mode.
5. Confirm only canvas and tools remain visible.
6. Exit clean canvas mode.

## Failure Cases

1. Stop ComfyUI and click `测试连接`.
2. Confirm the error tells the user what to do.
3. Import non-API workflow JSON.
4. Confirm the workflow error is understandable.
5. Temporarily use a wrong model name in the selected text model provider.
6. Confirm Museboard does not crash.
