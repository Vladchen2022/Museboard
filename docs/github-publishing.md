# GitHub Publishing Guide

This guide assumes the target account is:

```text
https://github.com/Vladchen2022
```

Recommended repository name:

```text
Museboard
```

Final repository URL:

```text
https://github.com/Vladchen2022/Museboard
```

## 1. Create The Repository

Open GitHub and create a new repository:

```text
https://github.com/new
```

Use these settings:

- Owner: `Vladchen2022`
- Repository name: `Museboard`
- Description: `A macOS-first visual planning app for mind maps, reference boards, text models, and ComfyUI.`
- Visibility: Public, if you want others to see it
- Add README: off
- Add .gitignore: off
- Add license: off

Do not initialize the repository with files. This local project already has the files.

## 2. Push The Local Project

From the project folder:

```bash
git remote add origin https://github.com/Vladchen2022/Museboard.git
git push -u origin main
```

If the remote already exists:

```bash
git remote set-url origin https://github.com/Vladchen2022/Museboard.git
git push -u origin main
```

If Git asks for credentials, use a GitHub personal access token, not your GitHub password.

## 3. Enable GitHub Pages

After pushing:

1. Open `https://github.com/Vladchen2022/Museboard/settings/pages`.
2. Under `Build and deployment`, choose `Deploy from a branch`.
3. Branch: `main`.
4. Folder: `/docs`.
5. Save.

GitHub Pages will publish the project page from:

```text
docs/index.md
```

The public page will usually become:

```text
https://vladchen2022.github.io/Museboard/
```

## 4. Add Repository Metadata

In the repository right sidebar, set:

```text
Description:
A macOS-first visual planning app for mind maps, reference boards, text models, and ComfyUI.

Website:
https://vladchen2022.github.io/Museboard/

Topics:
tauri, react, typescript, comfyui, lm-studio, ollama, openai, deepseek, mind-map, reference-board, macos
```

## 5. First Public Release

Before publishing a downloadable release:

```bash
npm run check
npm run tauri -- build
```

Then create a GitHub release and upload:

```text
src-tauri/target/release/bundle/dmg/Museboard_0.1.0_aarch64.dmg
```

Important: this DMG is unsigned unless signing and notarization are configured. For real public distribution, finish Developer ID signing and macOS notarization first.

## 6. License

Museboard uses the MIT License.

This means people may use, copy, modify, publish, distribute, sublicense, and sell copies of the software, as long as they include the copyright notice and license text.

The license does not provide warranty or liability protection beyond the standard MIT terms in `LICENSE`.
