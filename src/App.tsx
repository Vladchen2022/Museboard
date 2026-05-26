import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Canvas } from "./components/Canvas";
import { ComfyImagePanel } from "./components/ComfyImagePanel";
import { GeneratePanel } from "./components/GeneratePanel";
import { NodeTree } from "./components/NodeTree";
import { Toolbar } from "./components/Toolbar";
import type { AnnotationTool, BusyAction, CreationType, Language, MuseProject } from "./types";
import {
  completeEmptyNodes,
  generateFullProject,
  generateNodeDescription,
  generateProse,
} from "./lib/ai";
import { createId, nowIso } from "./lib/id";
import {
  importAssetFile,
  importGeneratedAsset,
  importAssetUrl,
  openProject,
  pickProjectDirectory,
  saveProject,
  isTauriRuntime,
  loadAppPreferences,
  mergeProjectPreferences,
  saveAppPreferences,
} from "./lib/storage";
import { createProject } from "./lib/templates";
import { replaceTreeFromAi, touchProject, updateNode } from "./lib/tree";
import { t } from "./lib/i18n";

export default function App() {
  const [initialState] = useState(() => {
    const preferences = loadAppPreferences();
    const project = mergeProjectPreferences(
      createProject("story", typeProjectName("story", preferences.language), preferences.language),
      preferences.aiSettings,
      preferences.comfySettings,
    );
    return { preferences, project };
  });
  const [language, setLanguage] = useState<Language>(initialState.preferences.language);
  const [project, setProject] = useState<MuseProject>(initialState.project);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(project.rootId);
  const [collapsedBrief, setCollapsedBrief] = useState(false);
  const [generateNodeId, setGenerateNodeId] = useState<string | null>(null);
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [status, setStatus] = useState(() => t(initialState.preferences.language, "notSaved"));
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [cleanCanvasMode, setCleanCanvasMode] = useState(false);
  const busy = busyAction !== null;

  const selectedNode = useMemo(
    () => project.nodes[selectedNodeId] ?? project.nodes[project.rootId],
    [project, selectedNodeId],
  );

  function commitProject(next: MuseProject) {
    setProject(next);
    if (!next.nodes[selectedNodeId]) setSelectedNodeId(next.rootId);
    setStatus(t(language, "unsaved"));
  }

  useEffect(() => {
    saveAppPreferences({
      aiSettings: project.aiSettings,
      comfySettings: project.comfySettings,
      language,
    });
  }, [project.aiSettings, project.comfySettings, language]);

  async function handleNewProject(type: CreationType) {
    setBusyAction("new");
    setStatus(t(language, "creatingProject"));
    await waitForPaint();
    try {
      const next = mergeProjectPreferences(
        createProject(type, typeProjectName(type, language), language),
        project.aiSettings,
        project.comfySettings,
      );
      setProject(next);
      setSelectedNodeId(next.rootId);
      setProjectDir(null);
      setStatus(t(language, "newUnsaved"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOpen() {
    setBusyAction("open");
    try {
      const dir = isTauriRuntime() ? await pickProjectDirectory() : null;
      const next = await openProject(dir);
      if (!next) {
        setStatus(t(language, "openingNotFound"));
        return;
      }
      const nextWithPreferences = mergeProjectPreferences(
        next,
        project.aiSettings,
        project.comfySettings,
      );
      setProject(nextWithPreferences);
      setSelectedNodeId(nextWithPreferences.rootId);
      setProjectDir(dir);
      setStatus(t(language, "opened"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSave() {
    setBusyAction("save");
    try {
      let dir = projectDir;
      if (isTauriRuntime() && !dir) {
        dir = await pickProjectDirectory();
        if (!dir) {
          setStatus(t(language, "saveCanceled"));
          return;
        }
        setProjectDir(dir);
      }
      await saveProject(dir, project);
      setStatus(t(language, "saved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateFull() {
    setBusyAction("full");
    setStatus(t(language, "generatingMap"));
    try {
      await waitForPaint();
      const depth = 2;
      const result = await generateFullProject(project, depth as 1 | 2 | 3, language);
      const next = replaceTreeFromAi(project, result.root, result.prose);
      setProject(next);
      setSelectedNodeId(next.rootId);
      setStatus(t(language, "generatedMap"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompleteEmpty() {
    setBusyAction("complete");
    setStatus(t(language, "completingEmpty"));
    try {
      const updates = await completeEmptyNodes(project, language);
      let next = project;
      for (const update of updates) {
        const target = Object.values(next.nodes).find((node) => node.title === update.title);
        if (target && target.note.trim().length === 0) {
          next = updateNode(next, target.id, { note: update.note });
        }
      }
      setProject(next);
      setStatus(updates.length ? t(language, "completedEmpty") : t(language, "noEmptyNodes"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateProse() {
    setBusyAction("prose");
    setStatus(t(language, "generatingProse"));
    try {
      const prose = await generateProse(project, language);
      commitProject(touchProject({ ...project, prose }));
      setStatus(t(language, "proseDone"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateNodeDescription(nodeId: string) {
    setBusyAction("description");
    setStatus(t(language, "generatingNodeDescription"));
    try {
      const note = await generateNodeDescription(project, nodeId, language);
      commitProject(updateNode(project, nodeId, { note }));
      setStatus(t(language, "nodeDescriptionDone"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportFiles(files: File[], nodeId: string) {
    if (!files.length) return;

    setBusyAction("import");
    setStatus(`${t(language, "importingImages")} (${files.length})`);
    try {
      let next = project;
      for (const file of files) {
        const asset = await importAssetFile(projectDir, file);
        const linkId = createId("link");
        next = touchProject({
          ...next,
          assets: {
            ...next.assets,
            [asset.id]: asset,
          },
          assetLinks: [
            ...next.assetLinks,
            {
              id: linkId,
              assetId: asset.id,
              nodeId,
              createdAt: nowIso(),
            },
          ],
        });
      }
      commitProject(next);
      setStatus(`${t(language, "importedImages")} (${files.length})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportUrls(urls: string[], nodeId: string) {
    if (!urls.length) return;

    setBusyAction("import");
    setStatus(`${t(language, "importingUrls")} (${urls.length})`);
    try {
      let next = project;
      for (const url of urls) {
        const asset = await importAssetUrl(projectDir, url);
        next = touchProject({
          ...next,
          assets: {
            ...next.assets,
            [asset.id]: asset,
          },
          assetLinks: [
            ...next.assetLinks,
            {
              id: createId("link"),
              assetId: asset.id,
              nodeId,
              createdAt: nowIso(),
            },
          ],
        });
      }
      commitProject(next);
      setStatus(`${t(language, "importedUrls")} (${urls.length})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleAlwaysOnTop() {
    if (!isTauriRuntime()) {
      setStatus(t(language, "topDesktopOnly"));
      return;
    }

    const next = !alwaysOnTop;
    try {
      await invoke("set_window_always_on_top", { alwaysOnTop: next });
      setAlwaysOnTop(next);
      setStatus(t(language, next ? "topEnabled" : "topDisabled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className={`app ${cleanCanvasMode ? "cleanCanvasMode" : ""}`}>
      <Toolbar
        project={project}
        language={language}
        busy={busy}
        busyAction={busyAction}
        status={status}
        onNewProject={handleNewProject}
        onOpen={handleOpen}
        onSave={handleSave}
        onGenerateFull={handleGenerateFull}
        onCompleteEmpty={handleCompleteEmpty}
        onGenerateProse={handleGenerateProse}
        onGenerateImage={() => setImagePanelOpen(true)}
        onProjectChange={commitProject}
        onLanguageChange={(nextLanguage) => {
          setLanguage(nextLanguage);
          setStatus(t(nextLanguage, "languageChanged"));
        }}
      />

      <div
        className={`workspace ${collapsedBrief ? "briefCollapsed" : ""} ${
          cleanCanvasMode ? "cleanCanvasMode" : ""
        }`}
      >
        <aside className="briefPane">
          <button
            className={`collapseButton ${collapsedBrief ? "isCollapsed" : ""}`}
            type="button"
            title={collapsedBrief ? t(language, "expandBrief") : t(language, "collapseBrief")}
            onClick={() => setCollapsedBrief((current) => !current)}
          >
            {collapsedBrief ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>{collapsedBrief ? t(language, "expandBrief") : t(language, "collapseBrief")}</span>
          </button>

          {!collapsedBrief && (
            <>
              <section className="prosePanel">
                <div className="sectionHeader">
                  <span>{t(language, "proseArea")}</span>
                  <span className="nodeCrumb">{selectedNode?.title}</span>
                </div>
                <div className="proseWrap">
                  <textarea
                    className="proseTextarea"
                    placeholder={t(language, "prosePlaceholder")}
                    value={project.prose}
                    disabled={busyAction === "prose"}
                    onChange={(event) =>
                      commitProject(touchProject({ ...project, prose: event.target.value }))
                    }
                  />
                  {busyAction === "prose" && (
                    <div className="proseLoading" aria-live="polite">
                      <Loader2 className="spin" size={18} />
                      <span>{t(language, "generatingProseShort")}</span>
                    </div>
                  )}
                </div>
              </section>

              <NodeTree
                project={project}
                language={language}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
                onProjectChange={commitProject}
                onGenerateChildren={setGenerateNodeId}
                onGenerateDescription={handleGenerateNodeDescription}
                generatingDescription={busyAction === "description"}
              />
            </>
          )}
        </aside>

        <Canvas
          project={project}
          language={language}
          selectedNodeId={selectedNodeId}
          tool={tool}
          alwaysOnTop={alwaysOnTop}
          cleanCanvasMode={cleanCanvasMode}
          onToolChange={setTool}
          onProjectChange={commitProject}
          onImportFiles={handleImportFiles}
          onImportUrls={handleImportUrls}
          onStatus={setStatus}
          onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
          onToggleCleanCanvasMode={() => setCleanCanvasMode((current) => !current)}
        />
      </div>

      {generateNodeId && (
        <GeneratePanel
          project={project}
          language={language}
          nodeId={generateNodeId}
          onClose={() => setGenerateNodeId(null)}
          onProjectChange={commitProject}
          onSelect={setSelectedNodeId}
          onStatus={setStatus}
        />
      )}

      {imagePanelOpen && (
        <ComfyImagePanel
          project={project}
          projectDir={projectDir}
          language={language}
          importGeneratedAsset={importGeneratedAsset}
          onClose={() => setImagePanelOpen(false)}
          onProjectChange={commitProject}
          onSelect={setSelectedNodeId}
          onStatus={setStatus}
        />
      )}
    </div>
  );
}

function typeProjectName(type: CreationType, language: Language): string {
  const names: Record<CreationType, string> = {
    story: t(language, "storyProject"),
    scene: t(language, "sceneProject"),
    sceneInterior: t(language, "sceneInteriorProject"),
    sceneExterior: t(language, "sceneExteriorProject"),
    sceneNatural: t(language, "sceneNaturalProject"),
    character: t(language, "characterProject"),
    object: t(language, "objectProject"),
  };
  return names[type];
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
