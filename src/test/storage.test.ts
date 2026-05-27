import { describe, expect, it } from "vitest";
import { normalizeAiSettings } from "../lib/aiProviders";
import { prepareProjectForStorage } from "../lib/storage";
import { createProject } from "../lib/templates";
import type { MuseProject } from "../types";

describe("project persistence", () => {
  it("omits runtime AI and ComfyUI settings from saved project data", () => {
    const project = createProject("story");
    const stored = prepareProjectForStorage(project, {
      embedAssetData: true,
      includeRuntimeSettings: false,
    });

    expect(stored.aiSettings).toBeUndefined();
    expect(stored.comfySettings).toBeUndefined();
  });

  it("strips embedded image data for desktop assets that already have file paths", () => {
    const project: MuseProject = {
      ...createProject("story"),
      assets: {
        asset_1: {
          id: "asset_1",
          originalName: "robot.png",
          fileName: "robot.png",
          mimeType: "image/png",
          relativePath: "assets/robot.png",
          absolutePath: "/tmp/robot.png",
          dataUrl: "data:image/png;base64,abc",
          createdAt: new Date().toISOString(),
        },
        asset_2: {
          id: "asset_2",
          originalName: "browser-only.png",
          fileName: "browser-only.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,def",
          createdAt: new Date().toISOString(),
        },
      },
    };

    const stored = prepareProjectForStorage(project, {
      embedAssetData: false,
      includeRuntimeSettings: false,
    });

    expect(stored.assets?.asset_1.dataUrl).toBeUndefined();
    expect(stored.assets?.asset_2.dataUrl).toBe("data:image/png;base64,def");
  });
});

describe("AI provider settings", () => {
  it("migrates legacy LM Studio settings without a provider field", () => {
    const settings = normalizeAiSettings({
      endpoint: "http://localhost:1234/v1",
      model: "local-model",
      temperature: 0.4,
    });

    expect(settings.provider).toBe("lmStudio");
    expect(settings.endpoint).toBe("http://localhost:1234/v1");
    expect(settings.model).toBe("local-model");
    expect(settings.apiKey).toBe("");
    expect(settings.temperature).toBe(0.4);
  });
});
