import { invoke } from "@tauri-apps/api/core";
import type { AiSettings, AiTreeNode, CandidateNode, Language, MuseProject } from "../types";
import { isTauriRuntime } from "./storage";
import { getTemplateTree } from "./templates";
import { creationTypeLabel } from "./i18n";
import { getNodePath, getSiblingNodes, treeToText } from "./tree";

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function generateChildCandidates(
  project: MuseProject,
  nodeId: string,
  count: number,
  userRequest: string,
  language: Language,
): Promise<CandidateNode[]> {
  const node = project.nodes[nodeId];
  if (!node) throw new Error("当前节点不存在。");

  const path = getNodePath(project, nodeId)
    .map((item) => item.title)
    .join(" > ");
  const siblings = getSiblingNodes(project, nodeId).map((item) => item.title);
  const children = node.children.map((id) => project.nodes[id]?.title).filter(Boolean);

  const data = await chatJson<{ nodes: CandidateNode[] }>(
    project.aiSettings,
    `你是绘画创作辅助软件 Museboard 的视觉导图生成器。只输出 JSON，不输出解释。所有说明必须能直接转化为画面元素。${languageInstruction(language)}`,
    [
      `创作类型：${creationTypeLabel(project.creationType, language)}`,
      `当前节点路径：${path}`,
      `当前节点说明：${node.note || "无"}`,
      `已有同级节点：${siblings.length ? siblings.join("、") : "无"}`,
      `已有子节点：${children.length ? children.join("、") : "无"}`,
      `用户附加要求：${userRequest || "无"}`,
      `请生成 ${count} 个适合作为“${node.title}”下一级的候选节点。`,
      "要求：避免与已有子节点重名；每个节点只解决一个明确问题；标题短。",
      "说明必须具体、可画、带既视感：写清形状、材质、颜色、光线、姿态、空间关系、服装/道具/痕迹等视觉信息。",
      "禁止只写抽象词，例如神秘、孤独、压抑、宏大、温柔、危险；如果需要情绪，必须用可见物体现，例如冷白顶灯、湿掉的袖口、裂开的玻璃、警示灯反光。",
      languageInstruction(language),
      '输出格式：{"nodes":[{"title":"节点名","note":"节点说明"}]}',
    ].join("\n"),
  );

  return normalizeCandidates(data.nodes).slice(0, count);
}

export async function generateFullProject(
  project: MuseProject,
  depth: 1 | 2 | 3,
  language: Language,
): Promise<{ root: AiTreeNode; prose: string }> {
  const template = JSON.stringify(getTemplateTree(project.creationType, language), null, 2);
  const data = await chatJson<{ root: AiTreeNode; prose: string }>(
    project.aiSettings,
    `你是绘画创意生成器。只输出 JSON，不输出解释。输出必须服务于一张可绘制画面。${languageInstruction(language)}`,
    [
      `创作类型：${creationTypeLabel(project.creationType, language)}`,
      `请基于以下模板生成一个随机但自洽的绘画创意导图，最大深度为 ${depth} 层。`,
      "文案必须完全基于导图，不得加入导图没有的信息。",
      "导图节点说明必须以视觉信息为主：主体外形、服装道具、材质纹理、色彩、光源、构图、环境细节、动作瞬间。",
      "少写心理和抽象氛围，多写能被画出来的东西。不要用空泛形容词代替画面细节。",
      languageInstruction(language),
      `模板：${template}`,
      '输出格式：{"root":{"title":"...","note":"...","children":[...]},"prose":"一段画面描述文案"}',
    ].join("\n"),
  );

  if (!data.root?.title) throw new Error("AI 返回的导图缺少根节点标题。");
  return {
    root: clampTreeDepth(data.root, depth),
    prose: typeof data.prose === "string" ? data.prose.trim() : "",
  };
}

export async function completeEmptyNodes(
  project: MuseProject,
  language: Language,
): Promise<CandidateNode[]> {
  const emptyNodes = Object.values(project.nodes)
    .filter((node) => node.note.trim().length === 0)
    .slice(0, 12);

  if (emptyNodes.length === 0) return [];

  const data = await chatJson<{ nodes: CandidateNode[] }>(
    project.aiSettings,
    `你是绘画导图节点补全器。只输出 JSON，不输出解释。补全内容必须是可画出来的视觉信息。${languageInstruction(language)}`,
    [
      `创作类型：${creationTypeLabel(project.creationType, language)}`,
      `当前导图：\n${treeToText(project)}`,
      "请只为缺少说明的节点补全说明，不新增节点。",
      "每条说明写成具体画面提示：形状、材质、颜色、光线、动作、位置、纹理、道具、破损或使用痕迹。",
      "避免抽象概念堆叠；不要只写情绪词。",
      languageInstruction(language),
      `待补全节点标题：${emptyNodes.map((node) => node.title).join("、")}`,
      '输出格式：{"nodes":[{"title":"原节点标题","note":"补全后的节点说明"}]}',
    ].join("\n"),
  );

  return normalizeCandidates(data.nodes);
}

export async function generateNodeDescription(
  project: MuseProject,
  nodeId: string,
  language: Language,
): Promise<string> {
  const node = project.nodes[nodeId];
  if (!node) throw new Error("当前节点不存在。");
  if (!node.title.trim()) throw new Error("请先填写节点标题，再生成说明。");

  const path = getNodePath(project, nodeId)
    .map((item) => `${item.title}${item.note ? `：${item.note}` : ""}`)
    .join("\n");
  const worldNode = Object.values(project.nodes).find((item) => item.title.includes("世界观"));
  const siblings = getSiblingNodes(project, nodeId)
    .map((item) => `${item.title}${item.note ? `：${item.note}` : ""}`)
    .join("\n");

  const data = await chatJson<{ note: string }>(
    project.aiSettings,
    `你是绘画创作辅助软件 Museboard 的节点说明生成器。只输出 JSON，不输出解释。说明必须是可画出来的视觉信息。${languageInstruction(language)}`,
    [
      `创作类型：${creationTypeLabel(project.creationType, language)}`,
      `当前节点标题：${node.title}`,
      `当前节点已有说明：${node.note || "无"}`,
      `当前节点路径与上级信息：\n${path}`,
      `世界观信息：${worldNode?.note || worldNode?.title || "无"}`,
      `同级节点信息：\n${siblings || "无"}`,
      `完整导图：\n${treeToText(project)}`,
      "请为当前标题生成一段节点说明，只描述此节点本身，不新增节点，不改标题。",
      "说明必须具体、可画、带既视感：外形轮廓、材质纹理、颜色、光线、姿态、空间位置、服装/道具/磨损痕迹等。",
      "如果标题是人物，写清体型、脸部/发型、服装层次、携带工具、姿态和一两个识别性细节。",
      "如果标题是场景或物件，写清结构、尺度、材质、光源、使用痕迹和周围关系。",
      "避免抽象词堆叠。不要只写性格、气质、情绪；情绪必须通过可见细节表达。",
      language === "en" ? "Length: 35-75 English words." : "长度控制在 45-90 个中文字符。",
      languageInstruction(language),
      '输出格式：{"note":"节点说明"}',
    ].join("\n"),
  );

  const note = data.note?.trim();
  if (!note) throw new Error("AI 返回的说明为空。");
  return note;
}

export async function generateProse(project: MuseProject, language: Language): Promise<string> {
  const data = await chatJson<{ prose: string }>(
    project.aiSettings,
    `你是绘画创作文案生成器。只输出 JSON，不输出解释。你的目标是生成一段能让画师立刻看到画面的文案。${languageInstruction(language)}`,
    [
      `创作类型：${creationTypeLabel(project.creationType, language)}`,
      language === "en"
        ? "Create a concrete English image brief based only on the confirmed mind map below."
        : "请基于以下已确认导图生成一段具体、有既视感的中文画面描述。",
      "不得加入导图中没有的关键信息；不得与导图矛盾。",
      "文案必须写具体可见物：主体位置、动作瞬间、服装/道具、材质、光源、色彩、前景/中景/背景、环境痕迹。",
      "少写感性抽象词。允许表达气氛，但必须通过可见细节呈现，例如水渍、烟尘、屏幕冷光、金属刮痕、人物姿态。",
      language === "en"
        ? "Length: 80-140 English words. Write it like a visual brief for an artist, not a novel paragraph."
        : "长度控制在 120-220 个中文字符，像给画师的画面 brief，而不是小说段落。",
      languageInstruction(language),
      treeToText(project),
      '输出格式：{"prose":"..."}',
    ].join("\n"),
  );

  const prose = data.prose?.trim();
  if (!prose) throw new Error("AI 返回的文案为空。");
  return prose;
}

export async function generateImagePrompt(project: MuseProject, language: Language): Promise<string> {
  const source = project.prose.trim() || treeToText(project);
  const data = await chatJson<{ prompt: string }>(
    project.aiSettings,
    "You are an image-generation prompt adapter for Museboard. Output JSON only. Convert the source brief into an English positive prompt for a text-to-image model. Preserve the original visual meaning; do not add new subjects, events, or worldbuilding that change the image.",
    [
      `Creation type: ${creationTypeLabel(project.creationType, "en")}`,
      `Source UI language: ${language}`,
      "Rewrite the Museboard brief below as a ComfyUI positive prompt.",
      "The final prompt must be English, even when the source brief is Chinese.",
      "Keep the original intent and visible content. Do not invent unrelated characters, settings, or story events.",
      "Emphasize visible information: subject, action, composition, camera angle, spatial layers, clothing, props, material textures, lighting, color, environment details, damage marks, screen glow, reflections, and foreground/midground/background.",
      "Default style must be photorealistic cinematic live-action still, realistic production design, physically plausible lighting, real camera lens language.",
      "Do not use style labels such as illustration, drawing, sketch, anime, cartoon, concept art, storybook, painterly, or artist reference unless the source explicitly asks for them.",
      "Reduce novel-like narration and abstract emotion. If emotion matters, express it through visible details.",
      "Write one English positive prompt, 70-150 words. Comma-separated phrases are acceptable.",
      "Do not include Chinese text in the prompt.",
      `Source brief:\n${source}`,
      '输出格式：{"prompt":"..."}',
    ].join("\n"),
  );

  const prompt = data.prompt?.trim();
  if (!prompt) throw new Error("AI 返回的生图提示词为空。");
  if (containsCjk(prompt)) throw new Error("AI 返回的生图提示词不是英文。");
  return prompt;
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function languageInstruction(language: Language): string {
  return language === "en"
    ? " All generated titles, notes, and prose must be written in English. Keep JSON keys unchanged."
    : " 所有生成的标题、说明和文案必须使用简体中文。JSON 字段名保持不变。";
}

async function chatJson<T>(settings: AiSettings, system: string, user: string): Promise<T> {
  if (!settings.endpoint.trim()) {
    throw new Error("未配置 LM Studio endpoint。");
  }
  if (!settings.model.trim()) {
    throw new Error("未填写模型名。请在右上角 AI 设置中填写 LM Studio 当前加载的模型名。");
  }

  const endpoint = settings.endpoint.replace(/\/$/, "");
  let content: string;

  try {
    content = isTauriRuntime()
      ? await invoke<string>("lm_studio_chat", {
          endpoint,
          model: settings.model,
          temperature: settings.temperature,
          system,
          user,
        })
      : await browserChatContent(settings, endpoint, system, user);
  } catch (error) {
    throw new Error(
      `无法连接 LM Studio：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!content) throw new Error("LM Studio 返回内容为空。");

  try {
    return JSON.parse(extractJsonObject(content)) as T;
  } catch {
    throw new Error("LM Studio 返回的内容不是合法 JSON。");
  }
}

async function browserChatContent(
  settings: AiSettings,
  endpoint: string,
  system: string,
  user: string,
): Promise<string> {
  const response = await fetch(`${browserEndpoint(endpoint)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`LM Studio 请求失败：HTTP ${response.status}${body ? `，${body}` : ""}`);
  }

  const payload = (await response.json()) as ChatResponse;
  return payload.choices?.[0]?.message?.content ?? "";
}

function browserEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "1234"
    ) {
      return `/lm-studio-proxy${url.pathname.replace(/\/$/, "")}`;
    }
  } catch {
    return endpoint;
  }

  return endpoint;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normalizeCandidates(nodes: CandidateNode[] | undefined): CandidateNode[] {
  if (!Array.isArray(nodes)) return [];

  return nodes
    .map((node) => ({
      title: String(node.title ?? "").trim(),
      note: String(node.note ?? "").trim(),
    }))
    .filter((node) => node.title.length > 0);
}

function clampTreeDepth(node: AiTreeNode, maxDepth: number, depth = 1): AiTreeNode {
  return {
    title: String(node.title ?? "未命名节点").trim(),
    note: String(node.note ?? "").trim(),
    children:
      depth >= maxDepth
        ? []
        : (node.children ?? []).map((child) => clampTreeDepth(child, maxDepth, depth + 1)),
  };
}
