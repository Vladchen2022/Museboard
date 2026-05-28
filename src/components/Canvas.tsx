import {
  ArrowUpRight,
  Contrast,
  Eye,
  FlipHorizontal2,
  ImagePlus,
  Maximize2,
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
  getDroppedImageFiles,
  getDroppedImageUrls,
  fitBoxIntoViewport,
  isItemNearViewport,
  layoutItemsBounds,
  moveAnnotations,
  moveLayoutItems,
  normalizedBox,
  resizeAnnotation,
  scaledViewportBox,
  updateDrawnAnnotation,
} from "../lib/canvas";
import { AnnotationView } from "./canvas/AnnotationView";
import { AssetView } from "./canvas/AssetView";
import { t } from "../lib/i18n";
import { ensureLayout, getVisibleAssetIds, removeVisibleAssets, touchProject } from "../lib/tree";

const IMAGE_LOAD_MARGIN = 520;
const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1700;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const FIT_PADDING = 72;
const THUMBNAIL_SIZE = 75;

interface CanvasViewState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

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
    }
  | {
      kind: "pan-viewport";
      startX: number;
      startY: number;
      startScrollLeft: number;
      startScrollTop: number;
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
  const zoomRef = useRef(1);
  const focusReturnViewRef = useRef<CanvasViewState | null>(null);
  const spacePanRef = useRef({ active: false, moved: false });
  const [emptyPromptCenter, setEmptyPromptCenter] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftLayout, setDraftLayout] = useState<CanvasLayout | null>(null);
  const [viewportBox, setViewportBox] = useState(() =>
    scaledViewportBox(
      { scrollLeft: 0, scrollTop: 0, clientWidth: 0, clientHeight: 0 },
      1,
      IMAGE_LOAD_MARGIN,
    ),
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
  const grayscaleTargetIds = selectedAssetIds.length ? selectedAssetIds : visibleAssetIds;
  const mirrorButtonActive =
    selectedAssetIds.length > 0 &&
    selectedAssetIds.every((assetId) => {
      const item = defaultLayoutItemFrom(layout, assetId, visibleAssetIds.indexOf(assetId));
      return item.flippedX;
    });
  const grayscaleButtonActive =
    visibleAssetIds.length > 0 &&
    grayscaleTargetIds.every((assetId) => {
      const item = defaultLayoutItemFrom(layout, assetId, visibleAssetIds.indexOf(assetId));
      return item.grayscale;
    });

  zoomRef.current = zoom;

  function updateViewportState(viewport = canvasRef.current, activeZoom = zoomRef.current) {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setEmptyPromptCenter({
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });
    setViewportBox(
      scaledViewportBox(
        {
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
          clientWidth: viewport.clientWidth,
          clientHeight: viewport.clientHeight,
        },
        activeZoom,
        IMAGE_LOAD_MARGIN,
      ),
    );
  }

  useEffect(() => {
    const viewport = canvasRef.current;
    if (!viewport) return;
    const activeViewport = viewport;

    function handleViewportChange() {
      updateViewportState(activeViewport);
    }

    handleViewportChange();
    activeViewport.addEventListener("scroll", handleViewportChange, { passive: true });
    window.addEventListener("resize", handleViewportChange);
    const observer = new ResizeObserver(handleViewportChange);
    observer.observe(activeViewport);

    return () => {
      activeViewport.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    updateViewportState();
  }, [zoom]);

  useEffect(() => {
    draftLayoutRef.current = null;
    setDraftLayout(null);
    focusReturnViewRef.current = null;
  }, [selectedNodeId]);

  useEffect(() => {
    setSelectedAssetIds((current) => current.filter((assetId) => visibleAssetIds.includes(assetId)));
    focusReturnViewRef.current = null;
  }, [visibleAssetIds]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, button, select")) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          spacePanRef.current = { active: true, moved: false };
          setSpacePanActive(true);
        }
        return;
      }

      if (event.metaKey) {
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          zoomViewportBy(1.2);
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          zoomViewportBy(1 / 1.2);
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          resetCanvasView();
          return;
        }
      }

      if (event.key === "Escape") {
        if (selectedAssetIds.length || selectedAnnotationIds.length) {
          event.preventDefault();
          setSelectedAssetIds([]);
          setSelectedAnnotationIds([]);
        }
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;

      if (selectedAssetIds.length || selectedAnnotationIds.length) {
        event.preventDefault();
        removeSelected();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.code !== "Space") return;
      if (!spacePanRef.current.active && target?.closest("input, textarea, button, select")) return;

      event.preventDefault();
      const shouldFocus = spacePanRef.current.active && !spacePanRef.current.moved;
      spacePanRef.current = { active: false, moved: false };
      setSpacePanActive(false);
      if (shouldFocus) toggleSpaceFocusView();
    }

    function handleWindowBlur() {
      spacePanRef.current = { active: false, moved: false };
      setSpacePanActive(false);
      setDragState((current) => (current?.kind === "pan-viewport" ? null : current));
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [selectedAssetIds, selectedAnnotationIds, project, selectedNodeId, layout, visibleAssetIds]);

  useEffect(() => {
    if (dragState === null) return;
    const activeDrag: NonNullable<DragState> = dragState;

    function handleMove(event: PointerEvent) {
      if (activeDrag.kind === "pan-viewport") {
        const viewport = canvasRef.current;
        if (!viewport) return;
        const dx = event.clientX - activeDrag.startX;
        const dy = event.clientY - activeDrag.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          spacePanRef.current.moved = true;
        }
        viewport.scrollLeft = activeDrag.startScrollLeft - dx;
        viewport.scrollTop = activeDrag.startScrollTop - dy;
        focusReturnViewRef.current = null;
        updateViewportState(viewport);
        return;
      }

      const scale = zoomRef.current || 1;
      const dx = (event.clientX - activeDrag.startX) / scale;
      const dy = (event.clientY - activeDrag.startY) / scale;

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
      if (activeDrag.kind !== "marquee" && activeDrag.kind !== "pan-viewport") {
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

  function defaultLayoutItemFrom(
    sourceLayout: CanvasLayout,
    assetId: string,
    index: number,
  ): LayoutItem {
    return (
      sourceLayout.items[assetId] ?? {
        assetId,
        x: 80 + (index % 4) * 260,
        y: 90 + Math.floor(index / 4) * 230,
        width: 220,
        height: 160,
        rotation: 0,
        z: index + 1,
      }
    );
  }

  function toggleMirrorSelected() {
    if (!selectedAssetIds.length) {
      onStatus(t(language, "selectImageFirst"));
      return;
    }

    updateLayout((current) => ({
      ...current,
      items: {
        ...current.items,
        ...Object.fromEntries(
          selectedAssetIds.map((assetId) => {
            const item = defaultLayoutItemFrom(current, assetId, visibleAssetIds.indexOf(assetId));
            return [assetId, { ...item, flippedX: !item.flippedX }];
          }),
        ),
      },
    }));
    onStatus(t(language, "mirroredImages"));
  }

  function toggleGrayscale() {
    const targetAssetIds = grayscaleTargetIds;
    if (!targetAssetIds.length) {
      onStatus(t(language, "selectImageFirst"));
      return;
    }

    const shouldRestoreColor = targetAssetIds.every(
      (assetId) => defaultLayoutItemFrom(layout, assetId, visibleAssetIds.indexOf(assetId)).grayscale,
    );
    const nextGrayscale = !shouldRestoreColor;

    updateLayout((current) => ({
      ...current,
      items: {
        ...current.items,
        ...Object.fromEntries(
          targetAssetIds.map((assetId) => {
            const item = defaultLayoutItemFrom(current, assetId, visibleAssetIds.indexOf(assetId));
            return [assetId, { ...item, grayscale: nextGrayscale }];
          }),
        ),
      },
    }));
    onStatus(t(language, nextGrayscale ? "grayscaleImages" : "colorImages"));
  }

  function removeSelected() {
    if (selectedAssetIds.length) {
      removeAssets(selectedAssetIds, selectedAnnotationIds);
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

  function removeAssets(assetIds: string[], annotationIdsToRemove: string[] = []) {
    if (!assetIds.length) return;

    let { project: next, removedLinks, removedAssets } = removeVisibleAssets(
      project,
      selectedNodeId,
      assetIds,
    );

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
    onStatus(`${t(language, "removedImages")} (${removedAssets || removedLinks})`);
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

  function handleViewportWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!canvasRef.current) return;

    focusReturnViewRef.current = null;
    if (!event.metaKey && !event.ctrlKey) return;

    event.preventDefault();
    const delta = Math.max(-160, Math.min(160, normalizeWheelDelta(event)));
    const multiplier = Math.exp(-delta * 0.0028);
    zoomViewportBy(multiplier, { clientX: event.clientX, clientY: event.clientY });
  }

  function normalizeWheelDelta(event: React.WheelEvent<HTMLDivElement>): number {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * 480;
    return event.deltaY;
  }

  function zoomViewportBy(multiplier: number, anchor?: { clientX: number; clientY: number }) {
    const viewport = canvasRef.current;
    if (!viewport || !Number.isFinite(multiplier) || multiplier <= 0) return;

    const rect = viewport.getBoundingClientRect();
    const cursorX = anchor ? anchor.clientX - rect.left : viewport.clientWidth / 2;
    const cursorY = anchor ? anchor.clientY - rect.top : viewport.clientHeight / 2;
    const currentZoom = zoomRef.current;
    const boardX = (viewport.scrollLeft + cursorX) / currentZoom;
    const boardY = (viewport.scrollTop + cursorY) / currentZoom;
    const nextZoom = clampZoom(currentZoom * multiplier);
    if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

    setZoom(nextZoom);
    focusReturnViewRef.current = null;
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, Math.round(boardX * nextZoom - cursorX));
      viewport.scrollTop = Math.max(0, Math.round(boardY * nextZoom - cursorY));
      updateViewportState(viewport, nextZoom);
    });
  }

  function resetCanvasView() {
    focusReturnViewRef.current = null;
    applyCanvasViewState({ zoom: 1, scrollLeft: 0, scrollTop: 0 });
  }

  function applyCanvasViewState(viewState: CanvasViewState) {
    const viewport = canvasRef.current;
    if (!viewport) return;

    setZoom(viewState.zoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = viewState.scrollLeft;
      viewport.scrollTop = viewState.scrollTop;
      updateViewportState(viewport, viewState.zoom);
    });
  }

  function fitAssetIdsToViewport(assetIds: string[], options: { preserveReturnView: boolean }) {
    const viewport = canvasRef.current;
    if (!viewport || !assetIds.length) return;

    const box = layoutItemsBounds(
      assetIds.map((assetId) =>
        defaultLayoutItem(assetId, visibleAssetIds.indexOf(assetId)),
      ),
    );
    if (!box) return;

    const fit = fitBoxIntoViewport(
      box,
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, padding: FIT_PADDING },
    );

    if (!options.preserveReturnView) focusReturnViewRef.current = null;
    applyCanvasViewState(fit);
  }

  function toggleSpaceFocusView() {
    const viewport = canvasRef.current;
    if (!viewport) return;

    const returnView = focusReturnViewRef.current;
    if (returnView) {
      focusReturnViewRef.current = null;
      applyCanvasViewState(returnView);
      return;
    }

    const targetAssetIds = selectedAssetIds.length ? selectedAssetIds : visibleAssetIds;
    if (!targetAssetIds.length) {
      onStatus(t(language, "selectImageFirst"));
      return;
    }

    focusReturnViewRef.current = {
      zoom: zoomRef.current,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    fitAssetIdsToViewport(targetAssetIds, { preserveReturnView: true });
  }

  function fitAllImagesToViewport() {
    if (!visibleAssetIds.length) {
      onStatus(t(language, "selectImageFirst"));
      return;
    }

    fitAssetIdsToViewport(visibleAssetIds, { preserveReturnView: false });
    onStatus(t(language, "fitAllImagesDone"));
  }

  function toggleThumbnail(assetId: string) {
    updateLayout((current) => {
      const item = defaultLayoutItemFrom(current, assetId, visibleAssetIds.indexOf(assetId));
      const nextItem = item.thumbnail
        ? {
            ...item,
            width: Math.max(1, item.thumbnailOriginalWidth ?? 220),
            height: Math.max(1, item.thumbnailOriginalHeight ?? 160),
            thumbnail: false,
            thumbnailOriginalWidth: undefined,
            thumbnailOriginalHeight: undefined,
          }
        : {
            ...item,
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
            thumbnail: true,
            thumbnailOriginalWidth: item.width,
            thumbnailOriginalHeight: item.height,
          };

      return {
        ...current,
        items: {
          ...current.items,
          [assetId]: nextItem,
        },
      };
    });
  }

  function getCanvasPoint(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scale = zoomRef.current || 1;
    return {
      x: Math.round((clientX - rect.left) / scale),
      y: Math.round((clientY - rect.top) / scale),
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

  function handleViewportPointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !spacePanRef.current.active) return;
    const viewport = canvasRef.current;
    if (!viewport) return;

    event.preventDefault();
    event.stopPropagation();
    setDragState({
      kind: "pan-viewport",
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
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
        <div className="segmented">
          <button
            type="button"
            title={t(language, "fitAllImages")}
            onClick={fitAllImagesToViewport}
            disabled={!visibleAssetIds.length}
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            title={t(language, "mirrorImage")}
            onClick={toggleMirrorSelected}
            disabled={!selectedAssetId}
            className={mirrorButtonActive ? "active" : ""}
          >
            <FlipHorizontal2 size={16} />
          </button>
          <button
            type="button"
            title={t(language, "toggleGrayscale")}
            onClick={toggleGrayscale}
            className={grayscaleButtonActive ? "active" : ""}
          >
            <Contrast size={16} />
          </button>
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

      <div
        ref={canvasRef}
        className={`canvasViewport ${spacePanActive ? "spacePanMode" : ""} ${dragState?.kind === "pan-viewport" ? "panning" : ""}`}
        onWheel={handleViewportWheel}
        onPointerDownCapture={handleViewportPointerDownCapture}
      >
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
          className="canvasBoardSpace"
          style={{
            width: Math.round(BOARD_WIDTH * zoom),
            height: Math.round(BOARD_HEIGHT * zoom),
          }}
        >
          <div
            ref={boardRef}
            className={`canvasBoard ${tool !== "select" ? "annotationMode" : ""}`}
            style={{ transform: `scale(${zoom})` }}
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
                  onToggleThumbnail={() => toggleThumbnail(assetId)}
                  onMoveStart={(event) => {
                    event.stopPropagation();
                    const movingAssetIds = selectedAssetIds.includes(assetId)
                      ? selectedAssetIds
                      : [assetId];
                    const movingAnnotationIds = selectedAssetIds.includes(assetId)
                      ? selectedAnnotationIds
                      : [];
                    setSelectedAssetIds(movingAssetIds);
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

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
