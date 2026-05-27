# Release Checklist

## Automated Checks

Run:

```bash
npm run check
npm run tauri -- build
```

Expected:

- TypeScript build passes.
- Vitest passes.
- Rust tests pass.
- macOS `.app` bundle is generated.
- macOS `.dmg` bundle is generated.

## App Metadata

Verify:

- `package.json` version matches `src-tauri/tauri.conf.json`.
- `productName` is `Museboard`.
- `identifier` is stable.
- app icon is configured in `src-tauri/tauri.conf.json`.

## macOS Distribution

Public release still requires:

- Apple Developer ID certificate.
- Tauri signing configuration.
- macOS notarization.
- Stapling notarization ticket to the app/DMG.
- Download/install test on another Mac.

Unsigned builds are internal-test only.

## Documentation

Include:

- README
- ComfyUI setup guide
- manual test plan
- known limitations

## Known Limitations Before Public Release

- ComfyUI compatibility depends on the user's installed nodes and model files.
- Browser preview cannot auto-start local ComfyUI.
- The app is macOS-first; Windows/Linux packaging has not been verified.
- Developer ID signing and notarization are not configured in this repository.
