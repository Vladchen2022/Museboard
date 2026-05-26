import {
  ArrowUpRight,
  Eye,
  ImagePlus,
  MousePointer2,
  PanelTopClose,
  PanelTopOpen,
  PencilLine,
  Pin,
  PinOff,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Annotation,
  AnnotationTool,
  CanvasLayout,
  Language,
  LayoutItem,
  MuseProject,
} from "../types";
import {
  annotationBounds,
  boxesIntersect,
  createAnnotation,
  expandedViewportBox,
  getDroppedImageFiles,
  getDroppedImageUrls,
  isItemNearViewport,
  moveAnnotations,
  moveLayoutItems,
  normalizedBox,
  resizeAnnotation,
  updateDrawnAnnotation,
} from "../lib/canvas";
import { AnnotationView } from "./canvas/AnnotationView";
import { AssetView } from "./canvas/AssetView";
import { t } from "../lib/i18n";
import { ensureLayout, getVisibleAssetIds, touchProject } from "../lib/tree";

const IMAGE_LOAD_MARGIN = 520;

interface CanvasProps {
  project: MuseProject;
  projectDir: string | null;
  language: Language;
  selectedNodeId: string;
  tool: AnnotationTool;
  alwaysOnTop: boolean;
  cleanCanvasMode: boolean;
  onToolChange: (tool: AnnotationTool) => void;
  onProjectChange: (project: MuseProject) => void;
  onImportFiles: (files: File[], nodeId: string) => void;
  onImportUrls: (urls: string[], nodeId: string) => void;
  onStatus: (message: string) => void;
  onToggleAlwaysOnTop: () => void;
  onToggleCleanCanvasMode: () => void;
}

type DragState =
  | {
      kind: "resize-item";
      assetId: string;
      startX: number;
      startY: number;
      initial: LayoutItem;
    }
  | {
      kind: "move-items";
      assetIds: string[];
      annotationIds: string[];
      startX: number;
      startY: number;
      initials: Record<string, LayoutItem>;
      annotationInitials: Record<string, Annotation>;
    }
  | {
      kind: "move-annotation";
      annotationId: string;
      startX: number;
      startY: number;
      initial: Annotation;
    }
  | {
      kind: "resize-annotation";
      annotationId: string;
      startX: number;
      startY: number;
      initial: Annotation;
    }
  | {
      kind: "draw-annotation";
      annotationId: string;
      tool: Exclude<AnnotationTool, "select">;
      startX: number;
      startY: number;
    }
  | {
      kind: "marquee";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

const toolOptions: Array<{ tool: AnnotationTool; label: string; icon: ReactNode }> = [
  { tool: "select", label: "选择", icon: <MousePointer2 size={16} /> },
  { tool: "rect", label: "矩形", icon: <Square size={16} /> },
  { tool: "arrow", label: "箭头", icon: <ArrowUpRight size={16} /> },
  { tool: "text", label: "文字", icon: <Type size={16} /> },
  { tool: "pen", label: "手绘线条", icon: <PencilLine size={16} /> },
];

export function Canvas({
  project,
  projectDir,
  language,
  selectedNodeId,
  tool,
  alwaysOnTop,
  cleanCanvasMode,
  onToolChange,
  onProjectChange,
  onImportFiles,
  onImportUrls,
  onStatus,
  onToggleAlwaysOnTop,
  onToggleCleanCanvasMode,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const draftLayoutRef = useRef<CanvasLayout | null>(null);
  const [emptyPromptCenter, setEmptyPromptCenter] = useState({ x: 0, y: 0 });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftLayout, setDraftLayout] = useState<CanvasLayout | null>(null);
  const [viewportBox, setViewportBox] = useState(() =>
    expandedViewportBox({ scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0 }, IMAGE_LOAD_MARGIN),
  );
  const node = project.nodes[selectedNodeId];
  const committedLayout = ensureLayout(project, selectedNodeId);
  const layout = draftLayout ?? committedLayout;
  const selectedAssetId =
    selectedAssetIds.length > 0 ? selectedAssetIds[selectedAssetIds.length - 1] : null;
  const selectedAnnotationId =
    selectedAnnotationIds.length > 0 ? selectedAnnotationIds[selectedAnnotationIds.length - 1] : null;
  const visibleAssetIds = useMemo(
    () => getVisibleAssetIds(project, selectedNodeId),
    [project, selectedNodeId],
  );

  useEffect(() => {
    const viewport = canvasRef.current;
    if (!viewport) return;
    const activeViewport = viewport;

    function updateEmptyPromptCenter() {
      const rect = activeViewport.getBoundingClientRect();
      setEmptyPromptCenter({
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      });
      setViewportBox(
        expandedViewportBox(
          {
            scrollLeft: activeViewport.scrollLeft,
            scrollTop: activeViewport.scrollTop,
            clientWidth: activeViewport.clientWidth,
            clientHeight: activeViewport.clientHeight,
          },
          IMAGE_LOAD_MARGIN,
        ),
      );
    }

    updateEmptyPromptCenter();
    activeViewport.addEventListener("scroll", updateEmptyPromptCenter, { passive: true });
    window.addEventListener("resize", updateEmptyPromptCenter);
    const observer = new ResizeObserver(updateEmptyPromptCenter);
    observer.observe(activeViewport);

    return () => {
      activeViewport.removeEventListener("scroll", updateEmptyPromptCenter);
      window.removeEventListener("resize", updateEmptyPromptCenter);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    draftLayoutRef.current = null;
    setDraftLayout(null);
  }, [selectedNodeId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;

      if (selectedAssetIds.length || selectedAnnotationIds.length) {
        event.preventDefault();
        removeSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAssetIds, selectedAnnotationIds, project, selectedNodeId]);

  useEffect(() => {
    if (dragState === null) return;
    const activeDrag: NonNullable<DragState> = dragState;

    function handleMove(event: PointerEvent) {
      const dx = event.clientX - activeDrag.startX;
      const dy = event.clientY - activeDrag.startY;

      if (activeDrag.kind === "move-items") {
        updateDraftLayout((current) => ({
          ...current,
          items: moveLayoutItems(current.items, activeDrag.initials, dx, dy),
          annotations: moveAnnotations(
            current.annotations,
            activeDrag.annotationInitials,
            dx,
            dy,
          ),
        }));
      }

      if (activeDrag.kind === "resize-item") {
        updateDraftLayout((current) => ({
          ...current,
          items: {
            ...current.items,
            [activeDrag.assetId]: {
              ...activeDrag.initial,
              width: Math.max(80, Math.round(activeDrag.initial.width + dx)),
              height: Math.max(80, Math.round(activeDrag.initial.height + dy)),
            },
          },
        }));
      }

      if (activeDrag.kind === "move-annotation") {
        updateDraftLayout((current) => ({
          ...current,
          annotations: current.annotations.map((annotation) =>
            annotation.id === activeDrag.annotationId
              ? {
                  ...annotation,
                  x: Math.round(activeDrag.initial.x + dx),
                  y: Math.round(activeDrag.initial.y + dy),
                }
              : annotation,
          ),
        }));
      }

      if (activeDrag.kind === "resize-annotation") {
        updateDraftLayout((current) => ({
          ...current,
          annotations: current.annotations.map((annotation) =>
            annotation.id === activeDrag.annotationId
              ? resizeAnnotation(activeDrag.initial, dx, dy)
              : annotation,
          ),
        }));
      }

      if (activeDrag.kind === "draw-annotation") {
        const point = getCanvasPoint(event.clientX, event.clientY);
        if (!point) return;
        updateDraftLayout((current) => ({
          ...current,
          annotations: current.annotations.map((annotation) =>
            annotation.id === activeDrag.annotationId
              ? updateDrawnAnnotation(annotation, activeDrag, point.x, point.y)
              : annotation,
          ),
        }));
      }

      if (activeDrag.kind === "marquee") {
        const point = getCanvasPoint(event.clientX, event.clientY);
        if (!point) return;
        setDragState({
          ...activeDrag,
          currentX: point.x,
          currentY: point.y,
        });
      }
    }

    function handleUp() {
      if (activeDrag.kind === "marquee") {
        const box = normalizedBox(
          activeDrag.startX,
          activeDrag.startY,
          activeDrag.currentX,
          activeDrag.currentY,
        );
        const picked = visibleAssetIds.filter((assetId, index) =>
          boxesIntersect(box, defaultLayoutItem(assetId, index)),
        );
        const pickedAnnotations = layout.annotations
          .filter((annotation) => boxesIntersect(box, annotationBounds(annotation)))
          .map((annotation) => annotation.id);
        setSelectedAssetIds(picked);
        setSelectedAnnotationIds(pickedAnnotations);
        if (picked.length || pickedAnnotations.length) {
          onStatus(
            `${t(language, "selectedImages")} (${picked.length}) / ${t(language, "moveAnnotation")} (${pickedAnnotations.length})`,
          );
        }
      }
      if (activeDrag.kind === "draw-annotation") {
        onToolChange("select");
      }
      if (activeDrag.kind !== "marquee") {
        commitDraftLayout();
      }
      setDragState(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState, project, selectedNodeId, visibleAssetIds, layout.annotations]);

  function updateLayout(updater: (layout: CanvasLayout) => CanvasLayout) {
    const current = ensureLayout(project, selectedNodeId);
    const nextLayout = updater(current);
    commitLayout(nextLayout);
  }

  function updateDraftLayout(updater: (layout: CanvasLayout) => CanvasLayout) {
    const current = draftLayoutRef.current ?? ensureLayout(project, selectedNodeId);
    const nextLayout = updater(current);
    draftLayoutRef.current = nextLayout;
    setDraftLayout(nextLayout);
  }

  function commitLayout(nextLayout: CanvasLayout) {
    draftLayoutRef.current = null;
    setDraftLayout(null);
    onProjectChange(
      touchProject({
        ...project,
        layouts: {
          ...project.layouts,
          [selectedNodeId]: nextLayout,
        },
      }),
    );
  }

  function commitDraftLayout() {
    const nextLayout = draftLayoutRef.current;
    if (!nextLayout) return;
    commitLayout(nextLayout);
  }

  function defaultLayoutItem(assetId: string, index: number): LayoutItem {
    const existing = layout.items[assetId];
    if (existing) return existing;

    return {
      assetId,
      x: 80 + (index % 4) * 260,
      y: 90 + Math.floor(index / 4) * 230,
      width: 220,
      height: 160,
      rotation: 0,
      z: index + 1,
    };
  }

  function removeOrHideAsset(assetId: string) {
    removeOrHideAssets([assetId]);
  }

  function removeSelected() {
    if (selectedAssetIds.length) {
      removeOrHideAssets(selectedAssetIds, selectedAnnotationIds);
      return;
    }

    if (selectedAnnotationIds.length) {
      updateLayout((current) => ({
        ...current,
        annotations: current.annotations.filter(
          (annotation) => !selectedAnnotationIds.includes(annotation.id),
        ),
      }));
      setSelectedAnnotationIds([]);
    }
  }

  function removeOrHideAssets(assetIds: string[], annotationIdsToRemove: string[] = []) {
    if (!assetIds.length) return;

    let next = project;
    let removed = 0;
    let hidden = 0;

    for (const assetId of assetIds) {
      const directLink = next.assetLinks.find(
        (link) => link.assetId === assetId && link.nodeId === selectedNodeId,
      );

      if (directLink) {
        const remainingLinks = next.assetLinks.filter((link) => link.id !== directLink.id);
        const stillUsed = remainingLinks.some((link) => link.assetId === assetId);
        const assets = { ...next.assets };
        if (!stillUsed) delete assets[assetId];
        next = touchProject({
          ...next,
          assets,
          assetLinks: remainingLinks,
        });
        removed += 1;
      } else {
        const currentLayout = ensureLayout(next, selectedNodeId);
        next = touchProject({
          ...next,
          layouts: {
            ...next.layouts,
            [selectedNodeId]: {
              ...currentLayout,
              items: {
                ...currentLayout.items,
                [assetId]: {
                  ...currentLayout.items[assetId],
                  ...defaultLayoutItem(assetId, visibleAssetIds.indexOf(assetId)),
                  hidden: true,
                },
              },
            },
          },
        });
        hidden += 1;
      }
    }

    if (annotationIdsToRemove.length) {
      const currentLayout = ensureLayout(next, selectedNodeId);
      next = touchProject({
        ...next,
        layouts: {
          ...next.layouts,
          [selectedNodeId]: {
            ...currentLayout,
            annotations: currentLayout.annotations.filter(
              (annotation) => !annotationIdsToRemove.includes(annotation.id),
            ),
          },
        },
      });
    }

    onProjectChange(next);
    if (removed && hidden) {
      onStatus(`${t(language, "removedImages")} (${removed}) ${t(language, "hiddenImages")} (${hidden})`);
    } else if (removed) {
      onStatus(`${t(language, "removedImages")} (${removed})`);
    } else {
      onStatus(`${t(language, "hiddenImages")} (${hidden})`);
    }
    setSelectedAssetIds([]);
    setSelectedAnnotationIds([]);
  }

  function restoreHidden() {
    updateLayout((current) => ({
      ...current,
      items: Object.fromEntries(
        Object.entries(current.items).map(([assetId, item]) => [
          assetId,
          { ...item, hidden: false },
        ]),
      ),
    }));
    onStatus(t(language, "restoredImages"));
  }

  function getCanvasPoint(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top),
    };
  }

  function handleBoardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.currentTarget !== event.target) return;

    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;

    if (tool === "select") {
      setSelectedAssetIds([]);
      setSelectedAnnotationIds([]);
      setDragState({
        kind: "marquee",
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      });
      return;
    }

    const annotation = createAnnotation(tool, point.x, point.y);

    updateLayout((current) => ({
      ...current,
      annotations: [...current.annotations, annotation],
    }));
    setSelectedAnnotationIds([annotation.id]);
    setSelectedAssetIds([]);

    if (tool === "text") {
      onToolChange("select");
      return;
    }

    setDragState({
      kind: "draw-annotation",
      annotationId: annotation.id,
      tool,
      startX: point.x,
      startY: point.y,
    });
  }

  return (
    <main
      className={`canvasShell ${cleanCanvasMode ? "cleanCanvasMode" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const files = getDroppedImageFiles(event.dataTransfer);
        if (files.length) {
          onImportFiles(files, selectedNodeId);
        } else {
          const urls = getDroppedImageUrls(event.dataTransfer);
          if (urls.length) {
            onImportUrls(urls, selectedNodeId);
          } else {
            onStatus(t(language, "dropMissing"));
          }
        }
      }}
    >
      <div className="canvasToolbar">
        <div className="canvasTitle">
          <strong>{node?.title ?? t(language, "untitledNode")}</strong>
          <span>{t(language, "canvasSubtitle")}</span>
        </div>
        <div className="canvasUtilityButtons">
          <button
            className={`iconButton ${alwaysOnTop ? "active" : ""}`}
            type="button"
            title={t(language, alwaysOnTop ? "unpinWindow" : "pinWindow")}
            aria-pressed={alwaysOnTop}
            onClick={onToggleAlwaysOnTop}
          >
            {alwaysOnTop ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <button
            className={`iconButton ${cleanCanvasMode ? "active" : ""}`}
            type="button"
            title={t(language, cleanCanvasMode ? "exitCleanCanvas" : "cleanCanvas")}
            aria-pressed={cleanCanvasMode}
            onClick={onToggleCleanCanvasMode}
          >
            {cleanCanvasMode ? <PanelTopOpen size={16} /> : <PanelTopClose size={16} />}
          </button>
        </div>
        <div className="segmented">
          {toolOptions.map((option) => (
            <button
              key={option.tool}
              className={tool === option.tool ? "active" : ""}
              type="button"
              title={toolLabel(option.tool, language)}
              onClick={() => onToolChange(option.tool)}
            >
              {option.icon}
            </button>
          ))}
        </div>
        <button className="iconTextButton" type="button" onClick={() => document.getElementById("imageImport")?.click()}>
          <ImagePlus size={16} />
          {t(language, "importImages")}
        </button>
        <button className="iconTextButton" type="button" onClick={restoreHidden}>
          <Eye size={16} />
          {t(language, "showAll")}
        </button>
        {(selectedAssetId || selectedAnnotationId) && (
          <button
            className="iconTextButton danger"
            type="button"
            onClick={() => {
              removeSelected();
            }}
          >
            <Trash2 size={16} />
            {t(language, "delete")}
          </button>
        )}
        <input
          id="imageImport"
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) onImportFiles(files, selectedNodeId);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <div ref={canvasRef} className="canvasViewport">
        {visibleAssetIds.length === 0 && (
          <div
            className="emptyCanvas"
            style={{ left: emptyPromptCenter.x, top: emptyPromptCenter.y }}
          >
            <ImagePlus size={32} />
            <span>{t(language, "emptyCanvas")}</span>
          </div>
        )}
        <div
          ref={boardRef}
          className={`canvasBoard ${tool !== "select" ? "annotationMode" : ""}`}
          onPointerDown={handleBoardPointerDown}
        >
          {visibleAssetIds.map((assetId, index) => {
            const asset = project.assets[assetId];
            if (!asset) return null;
            const item = defaultLayoutItem(assetId, index);
            const shouldLoad = isItemNearViewport(item, viewportBox);
            return (
              <AssetView
                key={assetId}
                asset={asset}
                projectDir={projectDir}
                shouldLoad={shouldLoad}
                language={language}
                item={item}
                selected={selectedAssetIds.includes(assetId)}
                onMoveStart={(event) => {
                  event.stopPropagation();
                  const movingAssetIds = selectedAssetIds.includes(assetId)
                    ? selectedAssetIds
                    : [assetId];
                  const movingAnnotationIds = selectedAssetIds.includes(assetId)
                    ? selectedAnnotationIds
                    : [];
                  setSelectedAssetIds(movingAssetIds);
                  setDragState({
                    kind: "move-items",
                    assetIds: movingAssetIds,
                    annotationIds: movingAnnotationIds,
                    startX: event.clientX,
                    startY: event.clientY,
                    initials: Object.fromEntries(
                      movingAssetIds.map((id) => [
                        id,
                        defaultLayoutItem(id, visibleAssetIds.indexOf(id)),
                      ]),
                    ),
                    annotationInitials: Object.fromEntries(
                      movingAnnotationIds
                        .map((id) => layout.annotations.find((annotation) => annotation.id === id))
                        .filter((annotation): annotation is Annotation => Boolean(annotation))
                        .map((annotation) => [annotation.id, annotation]),
                    ),
                  });
                }}
                onResizeStart={(event) => {
                  event.stopPropagation();
                  setDragState({
                    kind: "resize-item",
                    assetId,
                    startX: event.clientX,
                    startY: event.clientY,
                    initial: item,
                  });
                }}
              />
            );
          })}
          {layout.annotations.map((annotation) => (
            <AnnotationView
              key={annotation.id}
              annotation={annotation}
              language={language}
              selected={selectedAnnotationIds.includes(annotation.id)}
              onSelect={() => {
                setSelectedAnnotationIds([annotation.id]);
                setSelectedAssetIds([]);
              }}
              onMoveStart={(event) => {
                event.stopPropagation();
                const movingAnnotationIds = selectedAnnotationIds.includes(annotation.id)
                  ? selectedAnnotationIds
                  : [annotation.id];
                const movingAssetIds = selectedAnnotationIds.includes(annotation.id)
                  ? selectedAssetIds
                  : [];
                setSelectedAnnotationIds(movingAnnotationIds);
                setDragState({
                  kind: "move-items",
                  assetIds: movingAssetIds,
                  annotationIds: movingAnnotationIds,
                  startX: event.clientX,
                  startY: event.clientY,
                  initials: Object.fromEntries(
                    movingAssetIds.map((id) => [
                      id,
                      defaultLayoutItem(id, visibleAssetIds.indexOf(id)),
                    ]),
                  ),
                  annotationInitials: Object.fromEntries(
                    movingAnnotationIds
                      .map((id) => layout.annotations.find((item) => item.id === id))
                      .filter((item): item is Annotation => Boolean(item))
                      .map((item) => [item.id, item]),
                  ),
                });
              }}
              onResizeStart={(event) => {
                event.stopPropagation();
                setSelectedAnnotationIds([annotation.id]);
                setSelectedAssetIds([]);
                setDragState({
                  kind: "resize-annotation",
                  annotationId: annotation.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  initial: annotation,
                });
              }}
              onTextChange={(text) => {
                updateLayout((current) => ({
                  ...current,
                  annotations: current.annotations.map((item) =>
                    item.id === annotation.id ? { ...item, text } : item,
                  ),
                }));
              }}
            />
          ))}
          {dragState?.kind === "marquee" && (
            <div
              className="selectionMarquee"
              style={normalizedBox(
                dragState.startX,
                dragState.startY,
                dragState.currentX,
                dragState.currentY,
              )}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function toolLabel(tool: AnnotationTool, language: Language): string {
  const keys: Record<AnnotationTool, "select" | "rect" | "arrow" | "text" | "pen"> = {
    select: "select",
    rect: "rect",
    arrow: "arrow",
    text: "text",
    pen: "pen",
  };
  return t(language, keys[tool]);
}
