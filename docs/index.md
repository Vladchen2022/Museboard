# Museboard

Museboard is a desktop workspace for artists who plan images through text, structure, references, and local AI tools.

It is designed around a simple idea: every creative decision can start as a node, and every node can own a reference canvas.

## What It Does

Museboard combines four parts:

- **Brief area**: a generated or manually edited description of the image.
- **Mind map**: a structured tree for world, time, place, character, event, mood, composition, and other design decisions.
- **Canvas**: a PureRef-like reference board linked to the selected node.
- **Local AI bridge**: LM Studio for text generation and ComfyUI for image generation.

## Why It Exists

Many visual projects fail before drawing begins because references, story logic, character details, and composition ideas are scattered across notes, folders, browser tabs, and image boards.

Museboard keeps them connected:

- Click a node to see the images attached to that node and its descendants.
- Generate deeper child nodes when an idea is too vague.
- Turn confirmed nodes into a visual brief.
- Send the brief to ComfyUI when an image generation pass is useful.

## Core Workflow

1. Create a project.
2. Choose a creation type.
3. Build or generate a mind map.
4. Select a node.
5. Drop reference images onto the canvas.
6. Arrange, annotate, mirror, or switch images to black and white.
7. Generate or edit the final brief.
8. Optionally generate an image through local ComfyUI.

## Current Version

Museboard is currently an MVP for local macOS testing.

It is not yet a polished public installer. Public macOS distribution still needs signing and notarization.

## Links

- [Repository README](https://github.com/Vladchen2022/Museboard#readme)
- [ComfyUI setup](comfyui-setup.md)
- [Manual test plan](manual-test-plan.md)
- [Release checklist](release-checklist.md)
