import type { AiTreeNode, CreationType, Language, MuseNode, MuseProject } from "../types";
import { defaultAiSettings } from "./aiProviders";
import { createId, nowIso } from "./id";

export const creationTypeLabels: Record<CreationType, string> = {
  story: "故事性插画",
  scene: "场景设计（通用旧版）",
  sceneInterior: "场景设计：室内人文环境",
  sceneExterior: "场景设计：室外人文环境",
  sceneNatural: "场景设计：自然环境",
  character: "角色设计",
  object: "物件设计",
};

export const creationTypeOptions: CreationType[] = [
  "story",
  "sceneInterior",
  "sceneExterior",
  "sceneNatural",
  "character",
  "object",
];

const templateTrees: Record<CreationType, AiTreeNode> = {
  story: {
    title: "未命名故事性插画",
    note: "用一句话概括画面中的核心事件和情绪。",
    children: [
      { title: "世界观", note: "时代、技术水平、社会秩序或幻想规则。" },
      { title: "时间", note: "季节、昼夜、事件发生的具体时刻。" },
      { title: "地点", note: "场景位置、空间尺度、环境状态。" },
      {
        title: "人物",
        note: "参与事件的主要人物与次要人物。",
        children: [
          { title: "主角", note: "画面叙事的中心人物。" },
          { title: "次要角色", note: "推动关系或冲突的人物。" },
        ],
      },
      { title: "事件", note: "画面中正在发生的动作、冲突或转折。" },
      { title: "氛围", note: "情绪、光线、色彩倾向和观看感受。" },
      { title: "构图", note: "视角、主体位置、画面层次和视觉焦点。" },
    ],
  },
  scene: {
    title: "未命名场景设计",
    note: "概括场景的功能、气质和最重要的视觉特征。",
    children: [
      { title: "世界观", note: "场景所属时代、文明、技术或自然规则。" },
      { title: "地点类型", note: "城市、室内、荒野、遗迹、工坊等。" },
      { title: "空间结构", note: "入口、动线、层级、尺度和可见区域。" },
      { title: "功能区域", note: "场景中不同区域承担的使用目的。" },
      { title: "关键物件", note: "强化场景身份的装置、道具或建筑部件。" },
      { title: "光照天气", note: "时间、天气、光源方向和气氛。" },
      { title: "故事痕迹", note: "使用痕迹、破坏、修补、遗留物或人物活动线索。" },
    ],
  },
  sceneInterior: {
    title: "未命名室内人文环境",
    note: "概括室内空间的功能、使用者、时代痕迹和最强视觉记忆点。",
    children: [
      { title: "世界观", note: "空间所属时代、文明、职业系统、技术水平或宗教/权力结构。" },
      { title: "空间功能", note: "这里被谁使用，用来完成什么活动，公共、私人或半封闭属性。" },
      { title: "建筑与布局", note: "房间尺度、层高、入口、窗、隔断、楼梯、走廊和视线遮挡。" },
      { title: "动线与视角", note: "人物进入、停留、转身、观察的路径，以及画面主视角。" },
      { title: "陈设与道具", note: "家具、器械、容器、屏幕、工具、书册、餐具或工作台等可见物。" },
      { title: "材质表面", note: "墙面、地面、织物、木材、金属、玻璃、灰尘、油污、划痕和修补。" },
      { title: "灯光与色彩", note: "窗光、灯具、屏幕光、火光等实际光源，以及主色、辅助色和暗部颜色。" },
      { title: "生活痕迹", note: "刚离开的人、未完成的工作、翻倒物、脚印、水渍、张贴物或遗留衣物。" },
      { title: "构图焦点", note: "画面中心物、前中后景层次、遮挡关系、留白和引导线。" },
    ],
  },
  sceneExterior: {
    title: "未命名室外人文环境",
    note: "概括室外人工环境的地点类型、社会功能、建筑轮廓和街景叙事。",
    children: [
      { title: "世界观", note: "城市或聚落所属时代、制度、科技、能源、审美和生活方式。" },
      { title: "地点类型", note: "街道、广场、港口、市场、车站、工业区、边境、废墟或临时营地。" },
      { title: "地形与尺度", note: "道路宽度、高差、坡道、桥梁、台阶、建筑高度和远景边界。" },
      { title: "建筑群轮廓", note: "建筑风格、屋顶线、门窗节奏、立面材料、招牌和附加结构。" },
      { title: "交通与动线", note: "车辆、人流、货物流、门口排队、路障、轨道、停靠点和危险区域。" },
      { title: "公共设施", note: "路灯、管线、广告牌、摊位、监控、座椅、围栏、垃圾桶和维修口。" },
      { title: "人群活动痕迹", note: "摊贩摆放、排队路线、涂鸦、脚印、积水、临时遮棚和破损修补。" },
      { title: "天气与光照", note: "日照方向、阴影长度、雨雪雾尘、霓虹反光、傍晚天光或夜间灯源。" },
      { title: "构图焦点", note: "主建筑、交叉路口、远处地标、前景遮挡和视线引导线。" },
    ],
  },
  sceneNatural: {
    title: "未命名自然环境",
    note: "概括自然场景的地貌、生态、气候、尺度和画面中的路径或焦点。",
    children: [
      { title: "世界观", note: "自然环境是否现实、幻想、异星、灾后或被某种力量改变。" },
      { title: "地貌结构", note: "山体、峡谷、海岸、洞穴、森林、湿地、沙漠、冰原或火山的空间骨架。" },
      { title: "植被生态", note: "树冠形状、草丛密度、藤蔓、苔藓、花期、枯枝和植物分层。" },
      { title: "水体与气候", note: "河流、瀑布、潮汐、积雪、雾、雨、风向、云层和空气湿度。" },
      { title: "岩石土壤材质", note: "岩层纹理、泥土颜色、砂砾颗粒、湿滑表面、裂缝、冰面或火山灰。" },
      { title: "生命迹象", note: "动物足迹、巢穴、羽毛、骨骼、昆虫群、被啃咬植物或隐藏生物。" },
      { title: "尺度参照", note: "人物、树木、巨石、瀑布、远山、飞鸟或建筑残片用来显示巨大或狭小。" },
      { title: "时间与光照", note: "清晨、正午、黄昏、月夜、逆光、斑驳树影、云隙光或强烈反射。" },
      { title: "路径与危险", note: "可行走路线、断崖、沼泽、落石、隐藏入口、迷失区域或安全落脚点。" },
      { title: "构图焦点", note: "最高点、最亮区域、路径尽头、洞口、独特植物或异常自然现象。" },
    ],
  },
  character: {
    title: "未命名角色设计",
    note: "概括角色身份、所属世界、身体识别点和最强视觉记忆点。",
    children: [
      { title: "世界观", note: "角色所属时代、种族/文明、技术或魔法规则、社会阶层和环境压力。" },
      { title: "身份", note: "职业、阵营、社会位置、日常职责和画面中能看见的身份标记。" },
      { title: "身体结构", note: "身高比例、体型、骨架、肌肉/机械/异形结构、姿态重心和运动方式。" },
      { title: "头面部", note: "脸型、五官、发型、年龄感、表情、伤痕、妆容、义眼或其他识别点。" },
      { title: "穿戴", note: "服装剪裁、层次、材质、颜色、护具、鞋靴、磨损、污渍和文化来源。" },
      { title: "物件", note: "随身工具、武器、包袋、饰品、证件、维修痕迹或和身份绑定的特殊物。" },
    ],
  },
  object: {
    title: "未命名物件设计",
    note: "概括物件用途、所属世界和最强视觉识别点。",
    children: [
      { title: "世界观", note: "物件所属时代、技术体系、制造文化、使用环境和审美来源。" },
      { title: "使用者与用途", note: "谁使用它，解决什么问题，单手/双手/多人/固定安装的使用方式。" },
      { title: "整体轮廓", note: "第一眼的剪影、比例、重心、可握持位置、展开或收纳后的外形。" },
      { title: "结构拆解", note: "主体、接口、关节、开合件、按钮、管线、容器、能源仓和连接方式。" },
      { title: "材质工艺", note: "金属、塑料、木材、皮革、陶瓷、玻璃、织物、铸造、焊接或手工痕迹。" },
      { title: "交互细节", note: "屏幕、刻度、指示灯、拉环、旋钮、锁扣、磨砂握把和操作反馈。" },
      { title: "使用痕迹", note: "磨损、污渍、维修补丁、贴纸、铭牌、刮痕、掉漆、裂纹和临时改装。" },
      { title: "工作状态", note: "静止、启动、过热、损坏、展开、装填、放电、泄漏或被拆解的状态。" },
      { title: "展示尺度", note: "与手、人物、桌面、载具或建筑构件的比例关系。" },
    ],
  },
};

const englishTemplateTrees: Record<CreationType, AiTreeNode> = {
  story: {
    title: "Untitled Story Illustration",
    note: "Summarize the core event, visible tension, and emotional beat in one sentence.",
    children: [
      { title: "Worldbuilding", note: "Era, technology level, social order, or fantasy rules." },
      { title: "Time", note: "Season, day/night, weather, and the exact moment of the event." },
      { title: "Location", note: "Scene position, spatial scale, environmental condition, and key surfaces." },
      {
        title: "Characters",
        note: "Main and secondary figures involved in the image event.",
        children: [
          { title: "Protagonist", note: "The central figure carrying the visual story." },
          { title: "Secondary Characters", note: "Figures that support conflict, scale, or relationship." },
        ],
      },
      { title: "Event", note: "The visible action, conflict, accident, or turning point." },
      { title: "Mood", note: "Light, color, atmosphere, and visible details that express emotion." },
      { title: "Composition", note: "Camera angle, focal point, foreground/midground/background, and visual path." },
    ],
  },
  scene: {
    title: "Untitled Scene Design",
    note: "Summarize the scene function, tone, and strongest visual identity.",
    children: [
      { title: "Worldbuilding", note: "Era, civilization, technology, or natural rules." },
      { title: "Location Type", note: "City, interior, wilderness, ruin, workshop, transit hub, or settlement." },
      { title: "Spatial Structure", note: "Entrance, circulation, levels, scale, and visible zones." },
      { title: "Functional Zones", note: "Areas with different uses and activity patterns." },
      { title: "Key Objects", note: "Props, devices, architectural parts, or fixtures that define identity." },
      { title: "Light and Weather", note: "Time, weather, light direction, practical sources, and atmosphere." },
      { title: "Story Traces", note: "Wear, damage, repair, leftovers, or evidence of recent human activity." },
    ],
  },
  sceneInterior: {
    title: "Untitled Interior Human Environment",
    note: "Summarize the room function, users, period traces, and strongest visual hook.",
    children: [
      { title: "Worldbuilding", note: "Era, civilization, occupation system, technology, faith, or power structure." },
      { title: "Spatial Function", note: "Who uses the room, what they do there, and whether it is public or private." },
      { title: "Architecture and Layout", note: "Scale, ceiling height, entrances, windows, partitions, stairs, corridors, and occlusion." },
      { title: "Circulation and Viewpoint", note: "Paths for entering, pausing, turning, and looking; main camera position." },
      { title: "Set Dressing and Props", note: "Furniture, machines, containers, screens, tools, books, tableware, or workbenches." },
      { title: "Materials and Surfaces", note: "Walls, floors, fabric, wood, metal, glass, dust, oil, scratches, and repairs." },
      { title: "Lighting and Palette", note: "Window light, lamps, screens, fire, key color, secondary color, and shadow color." },
      { title: "Lived-in Traces", note: "Unfinished work, overturned objects, footprints, stains, posters, or abandoned clothing." },
      { title: "Composition Focus", note: "Main object, foreground/midground/background layers, silhouettes, negative space, and leading lines." },
    ],
  },
  sceneExterior: {
    title: "Untitled Exterior Human Environment",
    note: "Summarize the outdoor built location, social function, skyline, and street-level story.",
    children: [
      { title: "Worldbuilding", note: "City or settlement era, political system, technology, energy, aesthetics, and lifestyle." },
      { title: "Location Type", note: "Street, square, harbor, market, station, industrial zone, border, ruin, or temporary camp." },
      { title: "Terrain and Scale", note: "Road width, height changes, ramps, bridges, stairs, building height, and distant boundary." },
      { title: "Architectural Silhouette", note: "Building style, roofline, window rhythm, facade materials, signage, and add-on structures." },
      { title: "Traffic and Flow", note: "Vehicles, crowds, cargo movement, queues, barriers, rails, stops, and danger areas." },
      { title: "Public Fixtures", note: "Streetlights, pipes, billboards, stalls, cameras, benches, fences, trash bins, and access covers." },
      { title: "Human Activity Traces", note: "Vendor layouts, queue marks, graffiti, footprints, puddles, tarps, broken repairs." },
      { title: "Weather and Light", note: "Sun direction, shadow length, rain, snow, fog, dust, neon reflections, twilight, or night sources." },
      { title: "Composition Focus", note: "Main building, intersection, distant landmark, foreground occlusion, and visual guide lines." },
    ],
  },
  sceneNatural: {
    title: "Untitled Natural Environment",
    note: "Summarize landform, ecology, climate, scale, and the path or visual focus.",
    children: [
      { title: "Worldbuilding", note: "Whether the environment is realistic, fantasy, alien, post-disaster, or altered by a force." },
      { title: "Landform Structure", note: "Mountains, canyons, coast, cave, forest, wetland, desert, icefield, or volcanic skeleton." },
      { title: "Vegetation Ecology", note: "Canopy shape, grass density, vines, moss, bloom, dead branches, and plant layering." },
      { title: "Water and Climate", note: "Rivers, waterfalls, tide, snow, mist, rain, wind direction, clouds, and humidity." },
      { title: "Rock and Soil Material", note: "Rock strata, soil color, grit, wet surfaces, cracks, ice, or volcanic ash." },
      { title: "Life Signs", note: "Animal tracks, nests, feathers, bones, insect swarms, bitten plants, or hidden creatures." },
      { title: "Scale References", note: "People, trees, boulders, waterfalls, distant mountains, birds, or ruin fragments." },
      { title: "Time and Light", note: "Dawn, noon, dusk, moonlight, backlight, dappled shade, god rays, or strong reflections." },
      { title: "Path and Danger", note: "Walkable route, cliff, swamp, falling rocks, hidden entrance, lost area, or safe foothold." },
      { title: "Composition Focus", note: "Highest point, brightest area, path ending, cave mouth, unique plant, or abnormal phenomenon." },
    ],
  },
  character: {
    title: "Untitled Character Design",
    note: "Summarize identity, world, body signature, and strongest visual memory point.",
    children: [
      { title: "Worldbuilding", note: "Era, species/civilization, technology or magic rules, social class, and environmental pressure." },
      { title: "Identity", note: "Occupation, faction, social position, daily duty, and visible identity markers." },
      { title: "Body Structure", note: "Height, proportions, build, bone structure, muscle/mechanical/alien anatomy, posture, and movement." },
      { title: "Head and Face", note: "Face shape, features, hairstyle, age, expression, scars, makeup, prosthetics, or unique marks." },
      { title: "Wearables", note: "Clothing cut, layers, material, color, armor, footwear, wear, stains, and cultural source." },
      { title: "Objects", note: "Tools, weapons, bags, jewelry, documents, repair traces, or signature carried objects." },
    ],
  },
  object: {
    title: "Untitled Object Design",
    note: "Summarize function, world, and strongest silhouette or detail.",
    children: [
      { title: "Worldbuilding", note: "Era, technology system, manufacturing culture, use environment, and aesthetic source." },
      { title: "User and Function", note: "Who uses it, what problem it solves, and whether it is handheld, mounted, or multi-person." },
      { title: "Overall Silhouette", note: "First-read shape, proportion, weight balance, grip points, folded and unfolded form." },
      { title: "Structural Breakdown", note: "Main body, ports, joints, hinges, buttons, cables, containers, power cell, and connections." },
      { title: "Material and Craft", note: "Metal, plastic, wood, leather, ceramic, glass, fabric, casting, welding, or handmade traces." },
      { title: "Interaction Details", note: "Screen, gauge, indicator light, pull ring, knob, latch, textured grip, and operation feedback." },
      { title: "Use Traces", note: "Wear, stains, repair patches, stickers, labels, scratches, chipped paint, cracks, and modifications." },
      { title: "Working State", note: "Idle, active, overheated, damaged, expanded, loaded, discharging, leaking, or disassembled." },
      { title: "Scale Display", note: "Proportion relative to a hand, figure, tabletop, vehicle, or architectural component." },
    ],
  },
};

export function getTemplateTree(type: CreationType, language: Language = "zh"): AiTreeNode {
  return language === "en" ? englishTemplateTrees[type] : templateTrees[type];
}

export function createProject(
  type: CreationType,
  name = "Museboard 项目",
  language: Language = "zh",
): MuseProject {
  const now = nowIso();
  const nodes: Record<string, MuseNode> = {};
  const root = materializeTree(getTemplateTree(type, language), null, nodes);

  return {
    version: 1,
    name,
    creationType: type,
    prose: "",
    rootId: root,
    nodes,
    assets: {},
    assetLinks: [],
    layouts: {},
    aiSettings: { ...defaultAiSettings },
    comfySettings: {
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
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function materializeTree(
  source: AiTreeNode,
  parentId: string | null,
  nodes: Record<string, MuseNode>,
): string {
  const id = createId("node");
  const now = nowIso();

  nodes[id] = {
    id,
    parentId,
    title: cleanTitle(source.title),
    note: source.note?.trim() ?? "",
    children: [],
    createdAt: now,
    updatedAt: now,
  };

  for (const child of source.children ?? []) {
    const childId = materializeTree(child, id, nodes);
    nodes[id].children.push(childId);
  }

  return id;
}

function cleanTitle(value: string): string {
  const title = value.trim();
  return title.length > 0 ? title : "未命名节点";
}
