import { Loader2, Save, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Asset, ComfyGeneratedImage, Language, MuseProject } from "../types";
import { generateImagePrompt } from "../lib/ai";
import {
  aspectRatioOptions,
  buildFallbackImagePrompt,
  buildRealisticStyleSuffix,
  createFluxComfyWorkflow,
  ensureComfyConnection,
  generateComfyImage,
  validateComfySettings,
} from "../lib/comfy";
import { createId, nowIso } from "../lib/id";
import { t } from "../lib/i18n";
import { touchProject, treeToText } from "../lib/tree";

interface ComfyImagePanelProps {
  project: MuseProject;
  projectDir: string | null;
  language: Language;
  importGeneratedAsset: (
    projectDir: string | null,
    generated: ComfyGeneratedImage,
  ) => Promise<Asset>;
  onClose: () => void;
  onProjectChange: (project: MuseProject) => void;
  onSelect: (nodeId: string) => void;
  onStatus: (message: string) => void;
}

export function ComfyImagePanel({
  project,
  projectDir,
  language,
  importGeneratedAsset,
  onClose,
  onProjectChange,
  onSelect,
  onStatus,
}: ComfyImagePanelProps) {
  const sourceBrief = useMemo(
    () => (project.prose.trim() || treeToText(project)).trim(),
    [project.prose, project.rootId, project.nodes],
  );
  const styleSuffix = useMemo(
    () => buildRealisticStyleSuffix(project.creationType),
    [project.creationType],
  );
  const [prompt, setPrompt] = useState(() => buildFallbackImagePrompt(project, language));
  const [ratioId, setRatioId] = useState("1:1");
  const [connectionStatus, setConnectionStatus] = useState(t(language, "checkingComfy"));
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<ComfyGeneratedImage | null>(null);
  const [error, setError] = useState("");
  const selectedRatio = useMemo(
    () => aspectRatioOptions.find((option) => option.id === ratioId) ?? aspectRatioOptions[0],
    [ratioId],
  );

  useEffect(() => {
    let canceled = false;

    async function prepare() {
      setConnectionStatus(t(language, "checkingComfy"));
      try {
        await ensureComfyConnection(project.comfySettings, setConnectionStatus, language);
        if (!canceled) setConnectionStatus(t(language, "comfyConnected"));
      } catch (error) {
        if (!canceled) {
          setConnectionStatus(error instanceof Error ? error.message : String(error));
        }
      }

      try {
        const nextPrompt = await generateImagePrompt(project, language);
        if (!canceled) setPrompt(nextPrompt);
      } catch (error) {
        if (!canceled) {
          setPrompt(buildFallbackImagePrompt(project, language));
          const message = error instanceof Error ? error.message : String(error);
          setError(`${t(language, "imagePromptFallback")} ${message}`);
        }
      }
    }

    prepare();
    return () => {
      canceled = true;
    };
  }, [sourceBrief, project.creationType, project.aiSettings, language]);

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError(t(language, "promptRequired"));
      return;
    }

    setWorking(true);
    setError("");
    setGenerated(null);
    setConnectionStatus(t(language, "generatingImageStatus"));
    try {
      await ensureComfyConnection(project.comfySettings, setConnectionStatus, language);
      let comfySettings = project.comfySettings;
      if (!comfySettings.workflowJson.trim()) {
        setConnectionStatus(t(language, "autoConfiguringFluxWorkflow"));
        const settingsPatch = await createFluxComfyWorkflow(comfySettings);
        comfySettings = {
          ...comfySettings,
          ...settingsPatch,
        };
        onProjectChange(touchProject({ ...project, comfySettings }));
      }

      const validation = validateComfySettings(comfySettings, language);
      if (validation) {
        setError(validation);
        setConnectionStatus(validation);
        onStatus(validation);
        return;
      }

      const result = await generateComfyImage(comfySettings, prompt.trim(), selectedRatio);
      setGenerated(result);
      setConnectionStatus(t(language, "imageGenerated"));
      onStatus(t(language, "imageGenerated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      setConnectionStatus(message);
      onStatus(message);
    } finally {
      setWorking(false);
    }
  }

  async function handleSaveToRoot() {
    if (!generated) return;

    setSaving(true);
    setError("");
    try {
      const asset = await importGeneratedAsset(projectDir, generated);
      const next = touchProject({
        ...project,
        assets: {
          ...project.assets,
          [asset.id]: asset,
        },
        assetLinks: [
          ...project.assetLinks,
          {
            id: createId("link"),
            assetId: asset.id,
            nodeId: project.rootId,
            createdAt: nowIso(),
          },
        ],
      });
      onProjectChange(next);
      onSelect(project.rootId);
      onStatus(t(language, "savedGeneratedToRoot"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      onStatus(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modalShade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working && !saving) onClose();
      }}
    >
      <section className="imagePanel" role="dialog" aria-modal="true" aria-labelledby="imagePanelTitle">
        <div className="modalHeader">
          <div>
            <h2 id="imagePanelTitle">{t(language, "generateImage")}</h2>
            <p>{connectionStatus}</p>
          </div>
          <button
            className="iconButton"
            type="button"
            title={t(language, "close")}
            disabled={working || saving}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="imagePanelGrid">
          <label className="field">
            <span>{t(language, "sourceBrief")}</span>
            <textarea className="sourcePromptTextarea" value={sourceBrief} readOnly />
          </label>

          <label className="field">
            <span>{t(language, "realisticStyleGuide")}</span>
            <textarea className="stylePromptTextarea" value={styleSuffix} readOnly />
          </label>

          <label className="field">
            <span>{t(language, "imagePrompt")}</span>
            <textarea
              className="imagePromptTextarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <label className="field">
            <span>{t(language, "aspectRatio")}</span>
            <select value={ratioId} onChange={(event) => setRatioId(event.target.value)}>
              {aspectRatioOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="iconTextButton primary wideButton"
            type="button"
            disabled={working || saving}
            onClick={handleGenerate}
          >
            {working ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {working ? t(language, "generatingImage") : t(language, "generateImage")}
          </button>

          {error && <div className="panelError">{error}</div>}

          {working && (
            <div className="imageWaiting">
              <Loader2 className="spin" size={22} />
              <span>{t(language, "waitingComfy")}</span>
            </div>
          )}

          {generated && (
            <div className="generatedPreview">
              <img src={generated.dataUrl} alt={t(language, "generatedPreview")} />
              <div className="generatedMeta">
                <span>
                  {generated.width}x{generated.height}
                </span>
                <button
                  className="iconTextButton primary"
                  type="button"
                  disabled={saving}
                  onClick={handleSaveToRoot}
                >
                  {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                  {saving ? t(language, "saving") : t(language, "saveToRoot")}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
