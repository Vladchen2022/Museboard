import type { Annotation, AnnotationTool, LayoutItem } from "../types";
import { createId } from "./id";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportMetrics {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
}

export interface DrawAnnotationDrag {
  tool: Exclude<AnnotationTool, "select">;
  startX: number;
  startY: number;
}

export function getDroppedImageFiles(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files).filter(isImageFile);
  if (files.length) return files;

  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && isImageFile(file)));
}

export function getDroppedImageUrls(dataTransfer: DataTransfer): string[] {
  const rawValues = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
    extractImageSrcFromHtml(dataTransfer.getData("text/html")),
  ];

  return Array.from(
    new Set(
      rawValues
        .flatMap((value) => value.split(/\r?\n/))
        .map((value) => value.trim())
        .filter((value) => value && !value.startsWith("#"))
        .filter(isImageUrl),
    ),
  );
}

export function normalizedBox(startX: number, startY: number, currentX: number, currentY: number): Box {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

export function boxesIntersect(
  box: Box,
  item: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    box.left < item.x + item.width &&
    box.left + box.width > item.x &&
    box.top < item.y + item.height &&
    box.top + box.height > item.y
  );
}

export function expandedViewportBox(metrics: ViewportMetrics, margin: number): Box {
  return {
    left: Math.max(0, metrics.scrollLeft - margin),
    top: Math.max(0, metrics.scrollTop - margin),
    width: metrics.clientWidth + margin * 2,
    height: metrics.clientHeight + margin * 2,
  };
}

export function isItemNearViewport(
  item: { x: number; y: number; width: number; height: number },
  viewport: Box,
): boolean {
  return boxesIntersect(viewport, item);
}

export function scaledViewportBox(
  metrics: ViewportMetrics,
  zoom: number,
  margin: number,
): Box {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return expandedViewportBox(
    {
      scrollLeft: metrics.scrollLeft / scale,
      scrollTop: metrics.scrollTop / scale,
      clientWidth: metrics.clientWidth / scale,
      clientHeight: metrics.clientHeight / scale,
    },
    margin,
  );
}

export function layoutItemsBounds(
  items: Array<{ x: number; y: number; width: number; height: number }>,
): Box | null {
  if (!items.length) return null;

  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function fitBoxIntoViewport(
  box: Box,
  viewport: { width: number; height: number },
  options: { minZoom: number; maxZoom: number; padding: number },
): { zoom: number; scrollLeft: number; scrollTop: number } {
  const availableWidth = Math.max(1, viewport.width - options.padding * 2);
  const availableHeight = Math.max(1, viewport.height - options.padding * 2);
  const unclampedZoom = Math.min(availableWidth / box.width, availableHeight / box.height);
  const zoom = Math.min(options.maxZoom, Math.max(options.minZoom, unclampedZoom));
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;

  return {
    zoom,
    scrollLeft: Math.max(0, Math.round(centerX * zoom - viewport.width / 2)),
    scrollTop: Math.max(0, Math.round(centerY * zoom - viewport.height / 2)),
  };
}

export function moveLayoutItems(
  currentItems: Record<string, LayoutItem>,
  initials: Record<string, LayoutItem>,
  dx: number,
  dy: number,
): Record<string, LayoutItem> {
  const next = { ...currentItems };
  for (const [assetId, item] of Object.entries(initials)) {
    next[assetId] = {
      ...item,
      x: Math.round(item.x + dx),
      y: Math.round(item.y + dy),
    };
  }
  return next;
}

export function moveAnnotations(
  annotations: Annotation[],
  initials: Record<string, Annotation>,
  dx: number,
  dy: number,
): Annotation[] {
  return annotations.map((annotation) => {
    const initial = initials[annotation.id];
    if (!initial) return annotation;
    return {
      ...initial,
      x: Math.round(initial.x + dx),
      y: Math.round(initial.y + dy),
    };
  });
}

export function annotationBounds(annotation: Annotation): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: annotation.x,
    y: annotation.y,
    width: Math.max(1, annotation.width),
    height: Math.max(1, annotation.height),
  };
}

export function resizeAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.kind === "arrow") {
    const angle = (annotation.rotation * Math.PI) / 180;
    const endX = annotation.width * Math.cos(angle) + dx;
    const endY = annotation.width * Math.sin(angle) + dy;
    return {
      ...annotation,
      width: Math.max(12, Math.round(Math.hypot(endX, endY))),
      height: 2,
      rotation: Math.round((Math.atan2(endY, endX) * 180) / Math.PI),
    };
  }

  return {
    ...annotation,
    width: Math.max(24, Math.round(annotation.width + dx)),
    height: Math.max(24, Math.round(annotation.height + dy)),
  };
}

export function updateDrawnAnnotation(
  annotation: Annotation,
  drag: DrawAnnotationDrag,
  x: number,
  y: number,
): Annotation {
  if (drag.tool === "rect") {
    const box = normalizedBox(drag.startX, drag.startY, x, y);
    return {
      ...annotation,
      x: box.left,
      y: box.top,
      width: Math.max(8, box.width),
      height: Math.max(8, box.height),
    };
  }

  if (drag.tool === "arrow") {
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    return {
      ...annotation,
      x: drag.startX,
      y: drag.startY,
      width: Math.max(12, Math.round(Math.hypot(dx, dy))),
      height: 2,
      rotation: Math.round((Math.atan2(dy, dx) * 180) / Math.PI),
    };
  }

  if (drag.tool === "pen") {
    const absolutePoints =
      annotation.points?.map((point) => ({
        x: point.x + annotation.x,
        y: point.y + annotation.y,
      })) ?? [];
    absolutePoints.push({ x, y });

    const minX = Math.min(...absolutePoints.map((point) => point.x));
    const minY = Math.min(...absolutePoints.map((point) => point.y));
    const maxX = Math.max(...absolutePoints.map((point) => point.x));
    const maxY = Math.max(...absolutePoints.map((point) => point.y));

    return {
      ...annotation,
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      points: absolutePoints.map((point) => ({
        x: point.x - minX,
        y: point.y - minY,
      })),
    };
  }

  return annotation;
}

export function createAnnotation(tool: Exclude<AnnotationTool, "select">, x: number, y: number): Annotation {
  return {
    id: createId("annotation"),
    kind: tool,
    x,
    y,
    width: tool === "text" ? 180 : tool === "pen" ? 1 : 20,
    height: tool === "arrow" ? 2 : tool === "text" ? 64 : tool === "pen" ? 1 : 20,
    rotation: 0,
    z: 1000,
    color: "#e24a3b",
    text: tool === "text" ? "" : undefined,
    points: tool === "pen" ? [{ x: 0, y: 0 }] : undefined,
  };
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i.test(file.name)
  );
}

function extractImageSrcFromHtml(html: string): string {
  if (!html.trim()) return "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}

function isImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:", "data:"].includes(url.protocol) &&
      (url.protocol === "data:" ||
        /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)(\?.*)?$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}
