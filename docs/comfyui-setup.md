# ComfyUI Setup Guide

This guide is for users who already have ComfyUI installed locally.

## Recommended Path

1. Start Museboard.
2. Open `设置`.
3. Find `ComfyUI 连接向导`.
4. Leave the endpoint as:

```text
http://127.0.0.1:8188
```

5. Click `测试连接`.
6. If connection fails, enable auto start and set:
   - ComfyUI working directory
   - ComfyUI launch command
7. Click `启动并连接`.
8. Click `Flux 推荐预设`.
9. Click `生成测试图`.

If the test image appears, ComfyUI is ready.

## Auto Start Settings

Default working directory:

```text
~/ComfyUI
```

Default launch command:

```text
.venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

Museboard intentionally blocks shell syntax such as `;`, `|`, `&`, `$`, and redirection. The launch command must be a program plus arguments only.

## Flux Preset

The Flux preset asks ComfyUI for available node and model information, then builds a workflow automatically.

It expects ComfyUI to expose compatible node types such as:

- `UNETLoader`
- `CLIPLoader`
- `VAELoader`
- `Flux2Scheduler`
- `EmptyFlux2LatentImage`
- `CFGGuider`
- `ConditioningZeroOut`
- `SaveImage`

If one of these is missing, Museboard will report which part failed. The fix is usually installing the matching ComfyUI custom nodes or using a workflow imported from your own ComfyUI setup.

## Importing Your Own Workflow

Use ComfyUI's API workflow export, not the normal UI workflow export.

After importing JSON, Museboard tries to identify:

- positive prompt node
- negative prompt node
- width node
- height node
- seed node
- SaveImage node

If auto-mapping is wrong, open `高级 workflow 与节点映射` and correct the fields manually.

## Common Failures

### Cannot connect

Likely causes:

- ComfyUI is not running.
- The endpoint is not `http://127.0.0.1:8188`.
- ComfyUI launched on a different port.
- Browser preview cannot auto-start local processes. Use the desktop app.

### Flux preset fails

Likely causes:

- Flux model files are missing.
- Required custom nodes are missing.
- The installed ComfyUI version exposes different node names.

Use `复制诊断信息` in the ComfyUI setup wizard and inspect the node classes listed in the report.

### Workflow JSON fails

Likely causes:

- The file is not API workflow JSON.
- Node IDs changed after editing the workflow.
- The positive prompt, width, or height nodes were not mapped.

Open `高级 workflow 与节点映射` and verify node IDs.

### Generation starts but fails

Likely causes:

- VRAM/RAM is insufficient.
- The selected image size is too large.
- A model referenced by the workflow is missing.
- A custom node raised an error.

Reduce image size first. If that fails, copy diagnostics and check the ComfyUI terminal log.
