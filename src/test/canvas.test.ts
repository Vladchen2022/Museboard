import { describe, expect, it } from "vitest";
import type { Annotation, LayoutItem } from "../types";
import {
  boxesIntersect,
  createAnnotation,
  expandedViewportBox,
  isItemNearViewport,
  moveAnnotations,
  moveLayoutItems,
  normalizedBox,
  resizeAnnotation,
  updateDrawnAnnotation,
} from "../lib/canvas";

describe("canvas geometry", () => {
  it("normalizes marquee boxes and detects intersections", () => {
    const box = normalizedBox(120, 80, 20, 10);

    expect(box).toEqual({ left: 20, top: 10, width: 100, height: 70 });
    expect(boxesIntersect(box, { x: 110, y: 70, width: 40, height: 40 })).toBe(true);
    expect(boxesIntersect(box, { x: 140, y: 90, width: 20, height: 20 })).toBe(false);
  });

  it("expands viewport bounds for lazy image loading", () => {
    const viewport = expandedViewportBox(
      { scrollLeft: 500, scrollTop: 300, clientWidth: 800, clientHeight: 600 },
      200,
    );

    expect(viewport).toEqual({ left: 300, top: 100, width: 1200, height: 1000 });
    expect(isItemNearViewport({ x: 1400, y: 900, width: 100, height: 100 }, viewport)).toBe(true);
    expect(isItemNearViewport({ x: 1600, y: 1200, width: 100, height: 100 }, viewport)).toBe(false);
  });

  it("moves selected images and annotations from their initial positions", () => {
    const item: LayoutItem = {
      assetId: "asset_1",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      rotation: 0,
      z: 1,
      flippedX: true,
      grayscale: true,
    };
    const annotation = makeAnnotation({ id: "annotation_1", x: 5, y: 6 });

    expect(moveLayoutItems({ asset_1: item }, { asset_1: item }, 12.4, -3.2).asset_1).toMatchObject({
      x: 22,
      y: 17,
      flippedX: true,
      grayscale: true,
    });
    expect(moveAnnotations([annotation], { annotation_1: annotation }, 12.4, -3.2)[0]).toMatchObject({
      x: 17,
      y: 3,
    });
  });

  it("resizes and draws annotations predictably", () => {
    const rect = makeAnnotation({ kind: "rect", x: 10, y: 10, width: 20, height: 20 });
    const arrow = makeAnnotation({ kind: "arrow", x: 0, y: 0, width: 20, height: 2 });
    const pen = createAnnotation("pen", 10, 10);

    expect(resizeAnnotation(rect, 10, 5)).toMatchObject({ width: 30, height: 25 });
    expect(updateDrawnAnnotation(arrow, { tool: "arrow", startX: 0, startY: 0 }, 0, 20)).toMatchObject({
      width: 20,
      rotation: 90,
    });
    expect(updateDrawnAnnotation(pen, { tool: "pen", startX: 10, startY: 10 }, 15, 20)).toMatchObject({
      x: 10,
      y: 10,
      width: 5,
      height: 10,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 10 },
      ],
    });
  });
});

function makeAnnotation(patch: Partial<Annotation>): Annotation {
  return {
    id: "annotation",
    kind: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    z: 1,
    color: "#e24a3b",
    ...patch,
  };
}
