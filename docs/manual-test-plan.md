# Manual Test Plan

These tests require the user's real machine, installed LM Studio models, and installed ComfyUI environment.

## First Launch

1. Install/open the packaged `Museboard.app`.
2. Confirm the app opens without terminal.
3. Confirm no browser demo text appears in the desktop app.
4. Switch language to English, close settings, reopen settings.
5. Confirm language setting persists after app restart.

## LM Studio

1. Start LM Studio local server.
2. Enter endpoint and model name.
3. Click `随机导图`.
4. Select a node and click `生成说明`.
5. Select a node and click `生成下一级`.
6. Confirm generated text is visual, concrete, and in the selected UI language.

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
5. Temporarily use a wrong model name in LM Studio.
6. Confirm Museboard does not crash.
