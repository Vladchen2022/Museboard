import { describe, expect, it } from "vitest";
import {
  buildComfyDiagnosticReport,
  diagnoseComfyError,
  inferComfyWorkflowSettings,
} from "../lib/comfy";
import type { ComfySettings } from "../types";

describe("ComfyUI setup helpers", () => {
  it("infers prompt, size, seed, and save nodes from API workflow JSON", () => {
    const workflow = {
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: "positive prompt", clip: ["2", 0] },
      },
      "5": {
        class_type: "CLIPTextEncode",
        inputs: { text: "low quality, blurry, watermark", clip: ["2", 0] },
      },
      "7": {
        class_type: "RandomNoise",
        inputs: { noise_seed: 1 },
      },
      "9": {
        class_type: "Flux2Scheduler",
        inputs: { steps: 4, width: 1024, height: 1024 },
      },
      "10": {
        class_type: "EmptyFlux2LatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "13": {
        class_type: "SaveImage",
        inputs: { images: ["12", 0], filename_prefix: "Museboard" },
      },
    };

    const result = inferComfyWorkflowSettings(JSON.stringify(workflow), "zh");

    expect(result.patch.positivePromptNodeId).toBe("4");
    expect(result.patch.negativePromptNodeId).toBe("5");
    expect(result.patch.widthNodeId).toBe("10,9");
    expect(result.patch.heightNodeId).toBe("10,9");
    expect(result.patch.seedNodeId).toBe("7");
    expect(result.patch.seedInput).toBe("noise_seed");
    expect(result.warnings).toHaveLength(0);
  });

  it("returns actionable diagnostics for common ComfyUI failures", () => {
    expect(diagnoseComfyError(new Error("ComfyUI workflow JSON is missing."), "en")).toContain(
      "Flux preset",
    );
    expect(diagnoseComfyError(new Error("CUDA out of memory"), "zh")).toContain("更小尺寸");
  });

  it("builds a redacted diagnostic report for support", () => {
    const settings: ComfySettings = {
      endpoint: "http://127.0.0.1:8188",
      autoStart: true,
      launchWorkingDir: "/Users/alice/ComfyUI",
      launchCommand: ".venv/bin/python main.py --listen 127.0.0.1 --port 8188",
      workflowJson: JSON.stringify({
        "1": { class_type: "SaveImage", inputs: { filename_prefix: "Museboard" } },
      }),
      positivePromptNodeId: "4",
      positivePromptInput: "text",
      negativePromptNodeId: "",
      negativePromptInput: "",
      widthNodeId: "9,10",
      widthInput: "width",
      heightNodeId: "9,10",
      heightInput: "height",
      seedNodeId: "7",
      seedInput: "noise_seed",
    };

    const report = buildComfyDiagnosticReport(settings, "en");

    expect(report).toContain("Museboard ComfyUI Diagnostic Report");
    expect(report).toContain("/Users/<user>/ComfyUI");
    expect(report).not.toContain("/Users/alice");
    expect(report).toContain("Workflow classes: SaveImage");
  });
});
