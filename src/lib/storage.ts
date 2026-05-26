import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AiSettings,
  AppPreferences,
  Asset,
  ComfyGeneratedImage,
  ComfySettings,
  MuseProject,
} from "../types";
import { createId, nowIso } from "./id";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const LOCAL_PROJECT_KEY = "museboard.localProject.v1";
const LOCAL_PREFERENCES_KEY = "museboard.preferences.v1";
const ASSET_SRC_CACHE_LIMIT = 80;
const assetSrcCache = new Map<string, string>();

const defaultAiSettings: AiSettings = {
  endpoint: "http://localhost:1234/v1",
  model: "",
  temperature: 0.7,
};

const defaultComfySettings: ComfySettings = {
  endpoint: "http://127.0.0.1:8188",
  autoStart: true,
  launchWorkingDir: "~/ComfyUI",
  launchCommand: ".venv/bin/python main.py --listen 127.0.0.1 --port 8188",
  workflowJson: "",
  positivePromptNodeId: "",
  positivePromptInput: "text",
  negativePromptNodeId: "",
  negativePromptInput: "text",
  widthNodeId: "",
  widthInput: "width",
  heightNodeId: "",
  heightInput: "height",
  seedNodeId: "",
  seedInput: "seed",
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function pickProjectDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 Museboard 项目文件夹",
  });
  return typeof selected === "string" ? selected : null;
}

export async function saveProject(projectDir: string | null, project: MuseProject): Promise<MuseProject> {
  const projectToSave =
    isTauriRuntime() && projectDir ? await materializeEmbeddedAssets(projectDir, project) : project;
  const serializedProject = prepareProjectForStorage(projectToSave, {
    embedAssetData: !isTauriRuntime() || !projectDir,
    includeRuntimeSettings: false,
  });

  if (isTauriRuntime() && projectDir) {
    await invoke("save_project", {
      projectDir,
      projectJson: JSON.stringify(serializedProject, null, 2),
    });
    return projectToSave;
  }

  localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(serializedProject));
  return projectToSave;
}

export async function openProject(projectDir: string | null): Promise<MuseProject | null> {
  if (isTauriRuntime() && projectDir) {
    const raw = await invoke<string>("open_project", { projectDir });
    return normalizeProject(JSON.parse(raw) as Partial<MuseProject>);
  }

  const raw = localStorage.getItem(LOCAL_PROJECT_KEY);
  return raw ? normalizeProject(JSON.parse(raw) as Partial<MuseProject>) : null;
}

export function loadAppPreferences(): AppPreferences {
  const fallback: AppPreferences = {
    aiSettings: defaultAiSettings,
    comfySettings: defaultComfySettings,
    language: "zh",
  };

  try {
    const raw = localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      aiSettings: {
        endpoint: parsed.aiSettings?.endpoint || fallback.aiSettings.endpoint,
        model: parsed.aiSettings?.model || fallback.aiSettings.model,
        temperature:
          typeof parsed.aiSettings?.temperature === "number"
            ? parsed.aiSettings.temperature
            : fallback.aiSettings.temperature,
      },
      comfySettings: mergeComfySettings(parsed.comfySettings),
      language: parsed.language === "en" ? "en" : "zh",
    };
  } catch {
    return fallback;
  }
}

export function saveAppPreferences(preferences: AppPreferences): void {
  localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function mergeProjectPreferences(
  project: MuseProject,
  aiSettings: AiSettings,
  comfySettings: ComfySettings,
): MuseProject {
  return {
    ...normalizeProject(project),
    aiSettings,
    comfySettings,
  };
}

export function prepareProjectForStorage(
  project: MuseProject,
  options: { embedAssetData: boolean; includeRuntimeSettings: boolean },
): Partial<MuseProject> {
  const assets = Object.fromEntries(
    Object.entries(project.assets).map(([assetId, asset]) => {
      const shouldStripDataUrl =
        !options.embedAssetData && Boolean(asset.dataUrl) && Boolean(asset.relativePath || asset.absolutePath);
      return [
        assetId,
        shouldStripDataUrl
          ? {
              ...asset,
              dataUrl: undefined,
            }
          : asset,
      ];
    }),
  );

  const { aiSettings, comfySettings, ...projectBody } = project;
  if (options.includeRuntimeSettings) {
    return {
      ...projectBody,
      assets,
      aiSettings,
      comfySettings,
    };
  }

  return {
    ...projectBody,
    assets,
  };
}

export async function importAssetFile(
  projectDir: string | null,
  file: File,
): Promise<Asset> {
  const createdAt = nowIso();
  const id = createId("asset");
  const dataUrl = await fileToDataUrl(file);

  if (isTauriRuntime() && projectDir) {
    const imported = await invoke<{
      file_name: string;
      relative_path: string;
      absolute_path: string;
      mime_type: string;
    }>("import_asset", {
      projectDir,
      fileName: file.name,
      dataBase64: dataUrl.split(",")[1] ?? "",
    });

    return {
      id,
      originalName: file.name,
      fileName: imported.file_name,
      mimeType: file.type || "application/octet-stream",
      relativePath: imported.relative_path,
      absolutePath: imported.absolute_path,
      dataUrl,
      createdAt,
    };
  }

  return {
    id,
    originalName: file.name,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
    createdAt,
  };
}

export function assetDisplaySrc(asset: Asset): string {
  if (asset.dataUrl) return asset.dataUrl;
  return "";
}

export async function loadAssetDisplaySrc(
  projectDir: string | null,
  asset: Asset,
): Promise<string> {
  if (asset.dataUrl) return asset.dataUrl;
  if (!isTauriRuntime() || !projectDir || !asset.relativePath) return "";

  const cacheKey = assetDisplayCacheKey(projectDir, asset);
  const cached = getCachedAssetSrc(cacheKey);
  if (cached) return cached;

  const data = await invoke<{
    mime_type: string;
    data_base64: string;
  }>("read_project_asset", {
    projectDir,
    relativePath: asset.relativePath,
  });

  const src = `data:${data.mime_type || asset.mimeType};base64,${data.data_base64}`;
  setCachedAssetSrc(cacheKey, src);
  return src;
}

export async function importAssetUrl(
  projectDir: string | null,
  url: string,
): Promise<Asset> {
  const createdAt = nowIso();
  const id = createId("asset");
  const originalName = nameFromUrl(url);

  if (url.startsWith("data:")) {
    return {
      id,
      originalName,
      fileName: originalName,
      mimeType: url.slice(5, url.indexOf(";")) || "image/*",
      dataUrl: url,
      createdAt,
    };
  }

  if (isTauriRuntime() && projectDir) {
    const imported = await invoke<{
      file_name: string;
      relative_path: string;
      absolute_path: string;
      mime_type: string;
    }>("import_remote_asset", {
      projectDir,
      url,
    });

    return {
      id,
      originalName,
      fileName: imported.file_name,
      mimeType: imported.mime_type || "image/*",
      relativePath: imported.relative_path,
      absolutePath: imported.absolute_path,
      createdAt,
    };
  }

  if (isTauriRuntime()) {
    const downloaded = await invoke<{
      mime_type: string;
      data_base64: string;
    }>("download_remote_asset", { url });
    const mimeType = downloaded.mime_type || "image/*";
    return {
      id,
      originalName,
      fileName: originalName,
      mimeType,
      dataUrl: `data:${mimeType};base64,${downloaded.data_base64}`,
      createdAt,
    };
  }

  return {
    id,
    originalName,
    fileName: originalName,
    mimeType: "image/*",
    dataUrl: url,
    createdAt,
  };
}

export async function importGeneratedAsset(
  projectDir: string | null,
  generated: ComfyGeneratedImage,
): Promise<Asset> {
  const createdAt = nowIso();
  const id = createId("asset");

  if (isTauriRuntime() && projectDir) {
    const imported = await invoke<{
      file_name: string;
      relative_path: string;
      absolute_path: string;
      mime_type: string;
    }>("import_asset", {
      projectDir,
      fileName: generated.fileName,
      dataBase64: generated.dataBase64,
    });

    return {
      id,
      originalName: generated.fileName,
      fileName: imported.file_name,
      mimeType: generated.mimeType || imported.mime_type || "image/png",
      relativePath: imported.relative_path,
      absolutePath: imported.absolute_path,
      dataUrl: generated.dataUrl,
      createdAt,
    };
  }

  return {
    id,
    originalName: generated.fileName,
    fileName: generated.fileName,
    mimeType: generated.mimeType || "image/png",
    dataUrl: generated.dataUrl,
    createdAt,
  };
}

async function materializeEmbeddedAssets(
  projectDir: string,
  project: MuseProject,
): Promise<MuseProject> {
  const assets = { ...project.assets };
  let changed = false;

  for (const [assetId, asset] of Object.entries(project.assets)) {
    if (!asset.dataUrl?.startsWith("data:")) continue;
    if (asset.relativePath || asset.absolutePath) continue;

    const imported = await invoke<{
      file_name: string;
      relative_path: string;
      absolute_path: string;
      mime_type: string;
    }>("import_asset", {
      projectDir,
      fileName: asset.fileName || asset.originalName,
      dataBase64: asset.dataUrl.split(",")[1] ?? "",
    });

    assets[assetId] = {
      ...asset,
      fileName: imported.file_name,
      mimeType: asset.mimeType || imported.mime_type,
      relativePath: imported.relative_path,
      absolutePath: imported.absolute_path,
    };
    changed = true;
  }

  return changed ? { ...project, assets } : project;
}

function assetDisplayCacheKey(projectDir: string, asset: Asset): string {
  return `${projectDir}\n${asset.relativePath ?? asset.absolutePath ?? asset.id}`;
}

function getCachedAssetSrc(key: string): string | null {
  const value = assetSrcCache.get(key);
  if (!value) return null;
  assetSrcCache.delete(key);
  assetSrcCache.set(key, value);
  return value;
}

function setCachedAssetSrc(key: string, value: string): void {
  assetSrcCache.set(key, value);
  while (assetSrcCache.size > ASSET_SRC_CACHE_LIMIT) {
    const oldest = assetSrcCache.keys().next().value;
    if (!oldest) return;
    assetSrcCache.delete(oldest);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

function normalizeProject(project: Partial<MuseProject>): MuseProject {
  return {
    ...(project as MuseProject),
    aiSettings: {
      ...defaultAiSettings,
      ...(project.aiSettings ?? {}),
    },
    comfySettings: mergeComfySettings(project.comfySettings),
  };
}

function mergeComfySettings(settings: Partial<ComfySettings> | undefined): ComfySettings {
  return {
    ...defaultComfySettings,
    ...(settings ?? {}),
  };
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last || "remote-image";
  } catch {
    return "remote-image";
  }
}
