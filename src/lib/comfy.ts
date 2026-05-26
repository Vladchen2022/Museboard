import { invoke } from "@tauri-apps/api/core";
import type {
  ComfyGeneratedImage,
  ComfySettings,
  Language,
  MuseProject,
} from "../types";
import { isTauriRuntime } from "./storage";
import { treeToText } from "./tree";

export interface AspectRatioOption {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const aspectRatioOptions: AspectRatioOption[] = [
  { id: "1:1", label: "1:1 1024x1024", width: 1024, height: 1024 },
  { id: "4:3", label: "4:3 1152x896", width: 1152, height: 896 },
  { id: "3:4", label: "3:4 896x1152", width: 896, height: 1152 },
  { id: "16:9", label: "16:9 1344x768", width: 1344, height: 768 },
  { id: "9:16", label: "9:16 768x1344", width: 768, height: 1344 },
  { id: "3:2", label: "3:2 1216x832", width: 1216, height: 832 },
  { id: "2:3", label: "2:3 832x1216", width: 832, height: 1216 },
];

const defaultNegativePrompt =
  "low quality, blurry, distorted, extra limbs, bad anatomy, watermark, text";

interface BrowserPromptResponse {
  prompt_id?: string;
}

interface BrowserHistoryImage {
  filename?: string;
  subfolder?: string;
  type?: string;
}

interface BrowserHistoryOutput {
  images?: BrowserHistoryImage[];
}

export async function testComfyConnection(settings: ComfySettings): Promise<void> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (isTauriRuntime()) {
    await invoke("comfyui_check", { endpoint });
    return;
  }

  const response = await fetch(`${browserEndpoint(endpoint)}/system_stats`);
  if (!response.ok) {
    throw new Error(`ComfyUI HTTP ${response.status}`);
  }
}

export async function ensureComfyConnection(
  settings: ComfySettings,
  onStatus?: (message: string) => void,
  language: Language = "zh",
): Promise<void> {
  try {
    await testComfyConnection(settings);
    return;
  } catch (firstError) {
    if (!settings.autoStart) throw firstError;
    if (!isTauriRuntime()) {
      throw new Error(
        language === "en"
          ? "ComfyUI is not connected. Auto start only works in the desktop app."
          : "ComfyUI 未连接。自动启动只在桌面 App 中生效，浏览器预览不能启动本机进程。",
      );
    }
  }

  if (!settings.launchWorkingDir.trim() || !settings.launchCommand.trim()) {
    throw new Error(
      language === "en"
        ? "ComfyUI auto start needs a working directory and launch command."
        : "ComfyUI 自动启动需要配置工作目录和启动命令。",
    );
  }

  onStatus?.(language === "en" ? "Starting ComfyUI..." : "正在启动 ComfyUI...");
  await invoke("comfyui_start", {
    workingDir: settings.launchWorkingDir,
    launchCommand: settings.launchCommand,
  });

  for (let index = 0; index < 90; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await testComfyConnection(settings);
      return;
    } catch {
      if (index === 10 || index === 30 || index === 60) {
        onStatus?.(language === "en" ? "Waiting for ComfyUI..." : "正在等待 ComfyUI 启动...");
      }
    }
  }

  throw new Error(
    language === "en"
      ? "ComfyUI did not become reachable after auto start."
      : "已经尝试自动启动 ComfyUI，但等待后仍无法连接。",
  );
}

export async function createDefaultComfyWorkflow(
  settings: ComfySettings,
): Promise<Partial<ComfySettings> & { checkpointName?: string }> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (isTauriRuntime()) {
    const preset = await invoke<{
      workflow_json: string;
      positive_prompt_node_id: string;
      positive_prompt_input: string;
      negative_prompt_node_id: string;
      negative_prompt_input: string;
      width_node_id: string;
      width_input: string;
      height_node_id: string;
      height_input: string;
      seed_node_id: string;
      seed_input: string;
      checkpoint_name: string;
    }>("comfyui_default_workflow", { endpoint });

    return {
      workflowJson: preset.workflow_json,
      positivePromptNodeId: preset.positive_prompt_node_id,
      positivePromptInput: preset.positive_prompt_input,
      negativePromptNodeId: preset.negative_prompt_node_id,
      negativePromptInput: preset.negative_prompt_input,
      widthNodeId: preset.width_node_id,
      widthInput: preset.width_input,
      heightNodeId: preset.height_node_id,
      heightInput: preset.height_input,
      seedNodeId: preset.seed_node_id,
      seedInput: preset.seed_input,
      checkpointName: preset.checkpoint_name,
    };
  }

  const response = await fetch(`${browserEndpoint(endpoint)}/object_info/CheckpointLoaderSimple`);
  if (!response.ok) throw new Error(`ComfyUI HTTP ${response.status}`);
  const payload = (await response.json()) as {
    CheckpointLoaderSimple?: {
      input?: {
        required?: {
          ckpt_name?: [string[]];
        };
      };
    };
  };
  const checkpoints = payload.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  const checkpoint =
    checkpoints.find((name) => name.toLowerCase().includes("xl")) ?? checkpoints[0];
  if (!checkpoint) throw new Error("No ComfyUI checkpoint was found.");

  return standardWorkflowPreset(checkpoint);
}

export async function createFluxComfyWorkflow(
  settings: ComfySettings,
): Promise<Partial<ComfySettings> & { checkpointName?: string }> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (isTauriRuntime()) {
    const preset = await invoke<{
      workflow_json: string;
      positive_prompt_node_id: string;
      positive_prompt_input: string;
      negative_prompt_node_id: string;
      negative_prompt_input: string;
      width_node_id: string;
      width_input: string;
      height_node_id: string;
      height_input: string;
      seed_node_id: string;
      seed_input: string;
      checkpoint_name: string;
    }>("comfyui_flux_workflow", { endpoint });

    return fromTauriPreset(preset);
  }

  const [unetInfo, clipInfo, vaeInfo] = await Promise.all([
    fetchComfyObjectInfo(endpoint, "UNETLoader"),
    fetchComfyObjectInfo(endpoint, "CLIPLoader"),
    fetchComfyObjectInfo(endpoint, "VAELoader"),
    fetchComfyObjectInfo(endpoint, "Flux2Scheduler"),
    fetchComfyObjectInfo(endpoint, "EmptyFlux2LatentImage"),
    fetchComfyObjectInfo(endpoint, "CFGGuider"),
    fetchComfyObjectInfo(endpoint, "ConditioningZeroOut"),
  ]).then(([unet, clip, vae]) => [unet, clip, vae]);

  const unet = pickNamedModel(comboValues(unetInfo, "UNETLoader", "unet_name"), [
    "flux-2",
    "flux2",
    "flux",
  ]);
  const clipTypes = comboValues(clipInfo, "CLIPLoader", "type");
  if (!clipTypes.includes("flux2")) throw new Error("CLIPLoader does not support flux2.");
  const clip = pickNamedModel(comboValues(clipInfo, "CLIPLoader", "clip_name"), [
    "qwen",
    "flux",
    "t5",
  ]);
  const vae = pickNamedModel(comboValues(vaeInfo, "VAELoader", "vae_name"), [
    "flux2",
    "flux",
    "ae",
  ]);
  if (!unet || !clip || !vae) throw new Error("No usable Flux2 model set was found.");

  return flux2WorkflowPreset(unet, clip, vae);
}

export async function generateComfyImage(
  settings: ComfySettings,
  prompt: string,
  option: AspectRatioOption,
): Promise<ComfyGeneratedImage> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (isTauriRuntime()) {
    const generated = await invoke<{
      file_name: string;
      mime_type: string;
      data_base64: string;
    }>("comfyui_generate", {
      endpoint,
      workflowJson: settings.workflowJson,
      positivePromptNodeId: settings.positivePromptNodeId,
      positivePromptInput: settings.positivePromptInput,
      negativePromptNodeId: settings.negativePromptNodeId,
      negativePromptInput: settings.negativePromptInput,
      widthNodeId: settings.widthNodeId,
      widthInput: settings.widthInput,
      heightNodeId: settings.heightNodeId,
      heightInput: settings.heightInput,
      seedNodeId: settings.seedNodeId,
      seedInput: settings.seedInput,
      prompt,
      width: option.width,
      height: option.height,
    });

    return {
      fileName: generated.file_name,
      mimeType: generated.mime_type || "image/png",
      dataBase64: generated.data_base64,
      dataUrl: `data:${generated.mime_type || "image/png"};base64,${generated.data_base64}`,
      prompt,
      width: option.width,
      height: option.height,
    };
  }

  return browserGenerateComfyImage(endpoint, settings, prompt, option);
}

function fromTauriPreset(preset: {
  workflow_json: string;
  positive_prompt_node_id: string;
  positive_prompt_input: string;
  negative_prompt_node_id: string;
  negative_prompt_input: string;
  width_node_id: string;
  width_input: string;
  height_node_id: string;
  height_input: string;
  seed_node_id: string;
  seed_input: string;
  checkpoint_name: string;
}): Partial<ComfySettings> & { checkpointName?: string } {
  return {
    workflowJson: preset.workflow_json,
    positivePromptNodeId: preset.positive_prompt_node_id,
    positivePromptInput: preset.positive_prompt_input,
    negativePromptNodeId: preset.negative_prompt_node_id,
    negativePromptInput: preset.negative_prompt_input,
    widthNodeId: preset.width_node_id,
    widthInput: preset.width_input,
    heightNodeId: preset.height_node_id,
    heightInput: preset.height_input,
    seedNodeId: preset.seed_node_id,
    seedInput: preset.seed_input,
    checkpointName: preset.checkpoint_name,
  };
}

function standardWorkflowPreset(
  checkpoint: string,
): Partial<ComfySettings> & { checkpointName: string } {
  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: "Museboard positive prompt", clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: defaultNegativePrompt,
        clip: ["1", 1],
      },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: 1,
        steps: 8,
        cfg: 2.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "Museboard" },
    },
  };

  return {
    workflowJson: JSON.stringify(workflow, null, 2),
    positivePromptNodeId: "2",
    positivePromptInput: "text",
    negativePromptNodeId: "3",
    negativePromptInput: "text",
    widthNodeId: "4",
    widthInput: "width",
    heightNodeId: "4",
    heightInput: "height",
    seedNodeId: "5",
    seedInput: "seed",
    checkpointName: checkpoint,
  };
}

function flux2WorkflowPreset(
  unet: string,
  clip: string,
  vae: string,
): Partial<ComfySettings> & { checkpointName: string } {
  const workflow = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: unet, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: clip, type: "flux2", device: "default" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: vae },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "Museboard Flux2 prompt", clip: ["2", 0] },
    },
    "5": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    "6": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], cfg: 1.0 },
    },
    "7": {
      class_type: "RandomNoise",
      inputs: { noise_seed: 1 },
    },
    "8": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "9": {
      class_type: "Flux2Scheduler",
      inputs: { steps: 4, width: 1024, height: 1024 },
    },
    "10": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["7", 0],
        guider: ["6", 0],
        sampler: ["8", 0],
        sigmas: ["9", 0],
        latent_image: ["10", 0],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "SaveImage",
      inputs: { images: ["12", 0], filename_prefix: "Museboard_flux2" },
    },
  };

  return {
    workflowJson: JSON.stringify(workflow, null, 2),
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
    checkpointName: `${unet} / ${clip} / ${vae}`,
  };
}

export function validateComfySettings(
  settings: ComfySettings,
  language: Language = "zh",
): string | null {
  const messages =
    language === "en"
      ? {
          endpoint: "ComfyUI endpoint is empty.",
          workflow: "ComfyUI workflow JSON is missing.",
          positiveNode: "Positive prompt node ID is missing.",
          positiveInput: "Positive prompt input field is missing.",
          widthNode: "Width node ID is missing.",
          widthInput: "Width input field is missing.",
          heightNode: "Height node ID is missing.",
          heightInput: "Height input field is missing.",
          invalidJson: "ComfyUI workflow JSON is invalid.",
        }
      : {
          endpoint: "ComfyUI 地址为空。",
          workflow: "未导入 ComfyUI workflow JSON。",
          positiveNode: "未填写正向提示词节点 ID。",
          positiveInput: "未填写正向提示词字段名。",
          widthNode: "未填写宽度节点 ID。",
          widthInput: "未填写宽度字段名。",
          heightNode: "未填写高度节点 ID。",
          heightInput: "未填写高度字段名。",
          invalidJson: "ComfyUI workflow JSON 不合法。",
        };

  if (!settings.endpoint.trim()) return messages.endpoint;
  if (!settings.workflowJson.trim()) return messages.workflow;
  if (!settings.positivePromptNodeId.trim()) return messages.positiveNode;
  if (!settings.positivePromptInput.trim()) return messages.positiveInput;
  if (!settings.widthNodeId.trim()) return messages.widthNode;
  if (!settings.widthInput.trim()) return messages.widthInput;
  if (!settings.heightNodeId.trim()) return messages.heightNode;
  if (!settings.heightInput.trim()) return messages.heightInput;
  try {
    JSON.parse(settings.workflowJson) as unknown;
  } catch {
    return messages.invalidJson;
  }
  return null;
}

export function buildFallbackImagePrompt(project: MuseProject, _language: Language): string {
  const source = (project.prose.trim() || treeToText(project)).replace(/\s+/g, " ").trim();
  if (!source) {
    return [
      "clear subject",
      "readable composition",
      buildRealisticStyleSuffix(project.creationType),
    ].join(", ");
  }

  return [
    source,
    buildRealisticStyleSuffix(project.creationType),
  ].join(", ");
}

export function buildRealisticStyleSuffix(type: MuseProject["creationType"]): string {
  return [
    englishRealismTypeHint(type),
    "coherent visual composition",
    "clear focal subject",
    "photorealistic cinematic live-action still",
    "real camera lens language",
    "physically plausible lighting",
    "visible materials and textures",
    "foreground, midground, background",
    "high-end film production design",
  ].join(", ");
}

function englishRealismTypeHint(type: MuseProject["creationType"]): string {
  switch (type) {
    case "character":
      return "realistic costume and character production design";
    case "object":
      return "realistic hero prop product photography";
    case "scene":
    case "sceneInterior":
    case "sceneExterior":
    case "sceneNatural":
      return "photorealistic location design for a film scene";
    case "story":
    default:
      return "cinematic narrative film still";
  }
}

async function browserGenerateComfyImage(
  endpoint: string,
  settings: ComfySettings,
  prompt: string,
  option: AspectRatioOption,
): Promise<ComfyGeneratedImage> {
  const workflow = buildWorkflowForBrowser(settings, prompt, option);
  const clientId = `museboard-${Date.now()}`;
  const response = await fetch(`${browserEndpoint(endpoint)}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      prompt: workflow,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ComfyUI HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }

  const payload = (await response.json()) as BrowserPromptResponse;
  if (!payload.prompt_id) throw new Error("ComfyUI did not return prompt_id.");

  const imageRef = await pollBrowserImage(endpoint, payload.prompt_id);
  const imageResponse = await fetch(
    `${browserEndpoint(endpoint)}/view?${new URLSearchParams({
      filename: imageRef.filename ?? "",
      subfolder: imageRef.subfolder ?? "",
      type: imageRef.type ?? "output",
    })}`,
  );

  if (!imageResponse.ok) throw new Error(`ComfyUI image HTTP ${imageResponse.status}`);

  const blob = await imageResponse.blob();
  const dataUrl = await blobToDataUrl(blob);
  const dataBase64 = dataUrl.split(",")[1] ?? "";
  return {
    fileName: imageRef.filename || `museboard-comfy-${Date.now()}.png`,
    mimeType: blob.type || "image/png",
    dataBase64,
    dataUrl,
    prompt,
    width: option.width,
    height: option.height,
  };
}

function buildWorkflowForBrowser(
  settings: ComfySettings,
  prompt: string,
  option: AspectRatioOption,
): unknown {
  if (!settings.workflowJson.trim()) throw new Error("ComfyUI workflow JSON is missing.");
  const workflow = JSON.parse(settings.workflowJson) as Record<
    string,
    { inputs?: Record<string, unknown> }
  >;

  setBrowserInput(
    workflow,
    settings.positivePromptNodeId,
    settings.positivePromptInput,
    prompt,
    "positive prompt",
  );
  if (settings.negativePromptNodeId.trim() && settings.negativePromptInput.trim()) {
    setBrowserInput(
      workflow,
      settings.negativePromptNodeId,
      settings.negativePromptInput,
      defaultNegativePrompt,
      "negative prompt",
    );
  }
  setBrowserInput(workflow, settings.widthNodeId, settings.widthInput, option.width, "width");
  setBrowserInput(workflow, settings.heightNodeId, settings.heightInput, option.height, "height");
  if (settings.seedNodeId.trim() && settings.seedInput.trim()) {
    setBrowserInput(
      workflow,
      settings.seedNodeId,
      settings.seedInput,
      Math.floor(Math.random() * 9_000_000_000),
      "seed",
    );
  }

  return workflow;
}

function setBrowserInput(
  workflow: Record<string, { inputs?: Record<string, unknown> }>,
  nodeId: string,
  input: string,
  value: unknown,
  label: string,
) {
  const nodeIds = nodeId
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!nodeIds.length) throw new Error(`Workflow node for ${label} was not configured.`);
  for (const id of nodeIds) {
    const node = workflow[id];
    if (!node?.inputs) throw new Error(`Workflow node for ${label} was not found.`);
    node.inputs[input.trim()] = value;
  }
}

async function pollBrowserImage(
  endpoint: string,
  promptId: string,
): Promise<BrowserHistoryImage> {
  for (let index = 0; index < 180; index += 1) {
    const response = await fetch(`${browserEndpoint(endpoint)}/history/${promptId}`);
    if (response.ok) {
      const history = (await response.json()) as Record<
        string,
        { outputs?: Record<string, BrowserHistoryOutput>; status?: unknown }
      >;
      const outputs = history[promptId]?.outputs ?? {};
      const status = history[promptId]?.status as { status_str?: string } | undefined;
      if (status?.status_str === "error") {
        throw new Error(extractBrowserComfyError(status) ?? "ComfyUI generation failed.");
      }
      for (const output of Object.values(outputs)) {
        const image = output.images?.[0];
        if (image?.filename) return image;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("ComfyUI generation timed out.");
}

async function fetchComfyObjectInfo(endpoint: string, nodeType: string): Promise<unknown> {
  const response = await fetch(`${browserEndpoint(endpoint)}/object_info/${nodeType}`);
  if (!response.ok) throw new Error(`ComfyUI ${nodeType} HTTP ${response.status}`);
  return response.json();
}

function comboValues(payload: unknown, nodeType: string, inputName: string): string[] {
  const value = payload as Record<
    string,
    { input?: { required?: Record<string, [string[]]> } }
  >;
  return value[nodeType]?.input?.required?.[inputName]?.[0] ?? [];
}

function pickNamedModel(values: string[], priorities: string[]): string | undefined {
  for (const priority of priorities) {
    const found = values.find((value) => value.toLowerCase().includes(priority));
    if (found) return found;
  }
  return values[0];
}

function extractBrowserComfyError(status: unknown): string | null {
  const value = status as { messages?: unknown[] };
  for (const message of value.messages ?? []) {
    if (!Array.isArray(message)) continue;
    if (message[0] !== "execution_error") continue;
    const detail = message[1] as { exception_message?: string; node_id?: string; node_type?: string };
    const where = [detail.node_type, detail.node_id].filter(Boolean).join(" ");
    const body = detail.exception_message?.trim();
    return [where, body].filter(Boolean).join(": ");
  }
  return null;
}

function normalizedEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/$/, "");
  if (!trimmed) throw new Error("ComfyUI endpoint is empty.");
  return trimmed;
}

function browserEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "8188"
    ) {
      return "/comfyui-proxy";
    }
  } catch {
    return endpoint;
  }

  return endpoint;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed."));
    reader.readAsDataURL(blob);
  });
}
