import { describe, expect, it } from "vitest";
import { buildFallbackImagePrompt } from "../lib/comfy";
import { createProject, creationTypeOptions } from "../lib/templates";
import {
  addManualChild,
  appendCandidateNodes,
  getDescendantIds,
  getVisibleAssetIds,
  removeVisibleAssets,
} from "../lib/tree";
import type { MuseProject } from "../types";

describe("tree operations", () => {
  it("appends candidate children without replacing existing children", () => {
    let project = createProject("story");
    const parentId = project.nodes[project.rootId].children.find(
      (id) => project.nodes[id].title === "人物",
    )!;
    const before = project.nodes[parentId].children.map((id) => project.nodes[id].title);

    const result = appendCandidateNodes(project, parentId, [
      { title: "主角", note: "重复节点" },
      { title: "背景人物", note: "衬托场景规模的人物。" },
    ]);
    project = result.project;

    const after = project.nodes[parentId].children.map((id) => project.nodes[id].title);
    expect(after).toEqual([...before, "背景人物"]);
    expect(result.addedIds).toHaveLength(1);
  });

  it("keeps nested tree structure through repeated child additions", () => {
    let project = createProject("story");
    const peopleId = project.nodes[project.rootId].children.find(
      (id) => project.nodes[id].title === "人物",
    )!;

    let result = addManualChild(project, peopleId, "主角 A");
    project = result.project;
    result = addManualChild(project, result.nodeId, "服装");
    project = result.project;

    const descendantTitles = getDescendantIds(project, peopleId, false).map(
      (id) => project.nodes[id].title,
    );
    expect(descendantTitles).toContain("主角 A");
    expect(descendantTitles).toContain("服装");
  });

  it("aggregates child assets in parent node views", () => {
    const project = createProject("story");
    const peopleId = project.nodes[project.rootId].children.find(
      (id) => project.nodes[id].title === "人物",
    )!;
    const heroId = project.nodes[peopleId].children[0];
    const withAsset: MuseProject = {
      ...project,
      assets: {
        asset_1: {
          id: "asset_1",
          originalName: "hero.jpg",
          fileName: "hero.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,",
          createdAt: new Date().toISOString(),
        },
      },
      assetLinks: [
        {
          id: "link_1",
          assetId: "asset_1",
          nodeId: heroId,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    expect(getVisibleAssetIds(withAsset, heroId)).toEqual(["asset_1"]);
    expect(getVisibleAssetIds(withAsset, peopleId)).toEqual(["asset_1"]);
  });

  it("removes visible child asset links from a parent aggregate view", () => {
    const project = createProject("story");
    const peopleId = project.nodes[project.rootId].children.find(
      (id) => project.nodes[id].title === "人物",
    )!;
    const heroId = project.nodes[peopleId].children[0];
    const withAsset: MuseProject = {
      ...project,
      assets: {
        asset_1: {
          id: "asset_1",
          originalName: "hero.jpg",
          fileName: "hero.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,",
          createdAt: new Date().toISOString(),
        },
      },
      assetLinks: [
        {
          id: "link_1",
          assetId: "asset_1",
          nodeId: heroId,
          createdAt: new Date().toISOString(),
        },
      ],
      layouts: {
        [peopleId]: {
          nodeId: peopleId,
          annotations: [],
          items: {
            asset_1: {
              assetId: "asset_1",
              x: 100,
              y: 100,
              width: 220,
              height: 160,
              rotation: 0,
              z: 1,
            },
          },
        },
      },
    };

    const result = removeVisibleAssets(withAsset, peopleId, ["asset_1"]);

    expect(result.removedLinks).toBe(1);
    expect(result.removedAssets).toBe(1);
    expect(result.project.assetLinks).toHaveLength(0);
    expect(result.project.assets.asset_1).toBeUndefined();
    expect(result.project.layouts[peopleId].items.asset_1).toBeUndefined();
    expect(getVisibleAssetIds(result.project, peopleId)).toEqual([]);
    expect(getVisibleAssetIds(result.project, heroId)).toEqual([]);
  });

  it("creates specialized scene templates and the revised character template", () => {
    expect(creationTypeOptions).toEqual([
      "story",
      "sceneInterior",
      "sceneExterior",
      "sceneNatural",
      "character",
      "object",
    ]);

    const character = createProject("character");
    expect(character.nodes[character.rootId].children.map((id) => character.nodes[id].title)).toEqual(
      ["世界观", "身份", "身体结构", "头面部", "穿戴", "物件"],
    );

    const interior = createProject("sceneInterior");
    const exterior = createProject("sceneExterior");
    const natural = createProject("sceneNatural");
    const childTitles = (project: MuseProject) =>
      project.nodes[project.rootId].children.map((id) => project.nodes[id].title);

    expect(childTitles(interior)).toContain("陈设与道具");
    expect(childTitles(exterior)).toContain("交通与动线");
    expect(childTitles(natural)).toContain("地貌结构");
  });

  it("preserves Chinese source content when prompt translation falls back", () => {
    const project = {
      ...createProject("story"),
      prose: "维修机师在霓虹夜色的出租屋里改造新款机器人，旧机器人在角落安静看着。",
    };
    const prompt = buildFallbackImagePrompt(project, "zh");

    expect(prompt).toContain(project.prose);
    expect(prompt).toContain("cinematic narrative film still");
    expect(prompt).toContain("photorealistic cinematic live-action still");
    expect(prompt).not.toMatch(/illustration|drawing|sketch|anime|cartoon|concept art|storybook|painterly/i);
  });
});
