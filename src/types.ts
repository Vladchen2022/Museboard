export type CreationType =
  | "story"
  | "scene"
  | "sceneInterior"
  | "sceneExterior"
  | "sceneNatural"
  | "character"
  | "object";

export type Language = "zh" | "en";

export type AnnotationTool = "select" | "rect" | "arrow" | "text" | "pen";

export type BusyAction =
  | "new"
  | "open"
  | "save"
  | "full"
  | "complete"
  | "prose"
  | "import"
  | "description";

export interface MuseNode {
  id: string;
  parentId: string | null;
  title: string;
  note: string;
  children: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  relativePath?: string;
  absolutePath?: string;
  dataUrl?: string;
  createdAt: string;
}

export interface AssetLink {
  id: string;
  assetId: string;
  nodeId: string;
  createdAt: string;
}

export interface LayoutItem {
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  hidden?: boolean;
  flippedX?: boolean;
  grayscale?: boolean;
  thumbnail?: boolean;
  thumbnailOriginalWidth?: number;
  thumbnailOriginalHeight?: number;
}

export interface Annotation {
  id: string;
  kind: "rect" | "arrow" | "text" | "pen";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  color: string;
  text?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface CanvasLayout {
  nodeId: string;
  items: Record<string, LayoutItem>;
  annotations: Annotation[];
}

export type AiProvider = "lmStudio" | "openai" | "deepseek" | "ollama" | "customOpenAi";

export interface AiSettings {
  provider: AiProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface ComfySettings {
  endpoint: string;
  autoStart: boolean;
  launchWorkingDir: string;
  launchCommand: string;
  workflowJson: string;
  positivePromptNodeId: string;
  positivePromptInput: string;
  negativePromptNodeId: string;
  negativePromptInput: string;
  widthNodeId: string;
  widthInput: string;
  heightNodeId: string;
  heightInput: string;
  seedNodeId: string;
  seedInput: string;
}

export interface AppPreferences {
  aiSettings: AiSettings;
  comfySettings: ComfySettings;
  language: Language;
}

export interface MuseProject {
  version: 1;
  name: string;
  creationType: CreationType;
  prose: string;
  rootId: string;
  nodes: Record<string, MuseNode>;
  assets: Record<string, Asset>;
  assetLinks: AssetLink[];
  layouts: Record<string, CanvasLayout>;
  aiSettings: AiSettings;
  comfySettings: ComfySettings;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateNode {
  title: string;
  note: string;
}

export interface AiTreeNode {
  title: string;
  note?: string;
  children?: AiTreeNode[];
}

export interface ComfyGeneratedImage {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  dataUrl: string;
  prompt: string;
  width: number;
  height: number;
}
