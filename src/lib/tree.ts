import type {
  AiTreeNode,
  CandidateNode,
  CanvasLayout,
  MuseNode,
  MuseProject,
} from "../types";
import { createId, nowIso } from "./id";
import { materializeTree } from "./templates";

export function touchProject(project: MuseProject): MuseProject {
  return { ...project, updatedAt: nowIso() };
}

export function getNodePath(project: MuseProject, nodeId: string): MuseNode[] {
  const path: MuseNode[] = [];
  let current: MuseNode | undefined = project.nodes[nodeId];

  while (current) {
    path.unshift(current);
    current = current.parentId ? project.nodes[current.parentId] : undefined;
  }

  return path;
}

export function getDescendantIds(
  project: MuseProject,
  nodeId: string,
  includeSelf = true,
): string[] {
  const result: string[] = includeSelf ? [nodeId] : [];
  const node = project.nodes[nodeId];
  if (!node) return result;

  for (const childId of node.children) {
    result.push(...getDescendantIds(project, childId, true));
  }

  return result;
}

export function getSiblingNodes(project: MuseProject, nodeId: string): MuseNode[] {
  const node = project.nodes[nodeId];
  if (!node?.parentId) return [];
  const parent = project.nodes[node.parentId];
  if (!parent) return [];
  return parent.children
    .filter((id) => id !== nodeId)
    .map((id) => project.nodes[id])
    .filter(Boolean);
}

export function ensureLayout(project: MuseProject, nodeId: string): CanvasLayout {
  return (
    project.layouts[nodeId] ?? {
      nodeId,
      items: {},
      annotations: [],
    }
  );
}

export function updateNode(
  project: MuseProject,
  nodeId: string,
  patch: Partial<Pick<MuseNode, "title" | "note">>,
): MuseProject {
  const node = project.nodes[nodeId];
  if (!node) return project;

  return touchProject({
    ...project,
    nodes: {
      ...project.nodes,
      [nodeId]: {
        ...node,
        ...patch,
        title: patch.title !== undefined ? patch.title : node.title,
        updatedAt: nowIso(),
      },
    },
  });
}

export function addManualChild(
  project: MuseProject,
  parentId: string,
  title = "新节点",
  note = "",
): { project: MuseProject; nodeId: string } {
  const parent = project.nodes[parentId];
  if (!parent) return { project, nodeId: parentId };

  const now = nowIso();
  const nodeId = createId("node");
  const node: MuseNode = {
    id: nodeId,
    parentId,
    title: normalizeTitle(title),
    note,
    children: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    project: touchProject({
      ...project,
      nodes: {
        ...project.nodes,
        [parentId]: {
          ...parent,
          children: [...parent.children, nodeId],
          updatedAt: now,
        },
        [nodeId]: node,
      },
    }),
    nodeId,
  };
}

export function appendCandidateNodes(
  project: MuseProject,
  parentId: string,
  candidates: CandidateNode[],
): { project: MuseProject; addedIds: string[] } {
  const parent = project.nodes[parentId];
  if (!parent) return { project, addedIds: [] };

  const existingTitles = new Set(
    parent.children.map((id) => project.nodes[id]?.title.trim()).filter(Boolean),
  );
  const now = nowIso();
  const nodes = { ...project.nodes };
  const addedIds: string[] = [];

  for (const candidate of candidates) {
    const title = normalizeTitle(candidate.title);
    if (existingTitles.has(title)) continue;
    existingTitles.add(title);

    const nodeId = createId("node");
    nodes[nodeId] = {
      id: nodeId,
      parentId,
      title,
      note: candidate.note.trim(),
      children: [],
      createdAt: now,
      updatedAt: now,
    };
    addedIds.push(nodeId);
  }

  if (addedIds.length === 0) return { project, addedIds };

  nodes[parentId] = {
    ...parent,
    children: [...parent.children, ...addedIds],
    updatedAt: now,
  };

  return {
    project: touchProject({
      ...project,
      nodes,
    }),
    addedIds,
  };
}

export function replaceTreeFromAi(
  project: MuseProject,
  root: AiTreeNode,
  prose: string,
): MuseProject {
  const nodes: Record<string, MuseNode> = {};
  const rootId = materializeTree(root, null, nodes);
  return touchProject({
    ...project,
    prose,
    rootId,
    nodes,
    assets: {},
    assetLinks: [],
    layouts: {},
  });
}

export function deleteNode(project: MuseProject, nodeId: string): MuseProject {
  if (nodeId === project.rootId) return project;
  const node = project.nodes[nodeId];
  if (!node?.parentId) return project;

  const toDelete = new Set(getDescendantIds(project, nodeId, true));
  const nodes = { ...project.nodes };
  for (const id of toDelete) delete nodes[id];

  const parent = project.nodes[node.parentId];
  nodes[node.parentId] = {
    ...parent,
    children: parent.children.filter((id) => id !== nodeId),
    updatedAt: nowIso(),
  };

  const layouts = { ...project.layouts };
  for (const id of toDelete) delete layouts[id];

  const assetLinks = project.assetLinks.filter((link) => !toDelete.has(link.nodeId));
  const linkedAssetIds = new Set(assetLinks.map((link) => link.assetId));
  const assets = Object.fromEntries(
    Object.entries(project.assets).filter(([assetId]) => linkedAssetIds.has(assetId)),
  );

  return touchProject({ ...project, nodes, layouts, assetLinks, assets });
}

export function removeVisibleAssets(
  project: MuseProject,
  nodeId: string,
  assetIds: string[],
): { project: MuseProject; removedLinks: number; removedAssets: number } {
  const assetIdSet = new Set(assetIds);
  if (assetIdSet.size === 0) {
    return { project, removedLinks: 0, removedAssets: 0 };
  }

  const visibleNodeIds = new Set(getDescendantIds(project, nodeId, true));
  const remainingLinks = project.assetLinks.filter(
    (link) => !(assetIdSet.has(link.assetId) && visibleNodeIds.has(link.nodeId)),
  );
  const removedLinks = project.assetLinks.length - remainingLinks.length;
  if (removedLinks === 0) {
    return { project, removedLinks: 0, removedAssets: 0 };
  }

  const linkedAssetIds = new Set(remainingLinks.map((link) => link.assetId));
  const assets = { ...project.assets };
  let removedAssets = 0;
  for (const assetId of assetIdSet) {
    if (!linkedAssetIds.has(assetId)) {
      delete assets[assetId];
      removedAssets += 1;
    }
  }

  const layouts = Object.fromEntries(
    Object.entries(project.layouts).map(([layoutNodeId, layout]) => [
      layoutNodeId,
      {
        ...layout,
        items: Object.fromEntries(
          Object.entries(layout.items).filter(([assetId]) => !assetIdSet.has(assetId)),
        ),
      },
    ]),
  );

  return {
    project: touchProject({
      ...project,
      assets,
      assetLinks: remainingLinks,
      layouts,
    }),
    removedLinks,
    removedAssets,
  };
}

export function treeToText(project: MuseProject): string {
  const lines: string[] = [];

  function walk(nodeId: string, depth: number): void {
    const node = project.nodes[nodeId];
    if (!node) return;
    const indent = "  ".repeat(depth);
    lines.push(`${indent}- ${node.title}${node.note ? `：${node.note}` : ""}`);
    for (const childId of node.children) walk(childId, depth + 1);
  }

  walk(project.rootId, 0);
  return lines.join("\n");
}

export function getVisibleAssetIds(project: MuseProject, nodeId: string): string[] {
  const visibleNodeIds = new Set(getDescendantIds(project, nodeId, true));
  const layout = ensureLayout(project, nodeId);
  const result: string[] = [];

  for (const link of project.assetLinks) {
    if (!visibleNodeIds.has(link.nodeId)) continue;
    if (layout.items[link.assetId]?.hidden) continue;
    if (!project.assets[link.assetId]) continue;
    if (!result.includes(link.assetId)) result.push(link.assetId);
  }

  return result;
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  return title.length > 0 ? title : "未命名节点";
}
