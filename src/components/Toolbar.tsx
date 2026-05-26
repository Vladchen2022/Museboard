import {
  FileDown,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Loader2,
  RefreshCcw,
  Save,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import type { BusyAction, CreationType, Language, MuseProject } from "../types";
import { createDefaultComfyWorkflow, createFluxComfyWorkflow, testComfyConnection } from "../lib/comfy";
import { creationTypeOptions } from "../lib/templates";
import { creationTypeLabel, t } from "../lib/i18n";

interface ToolbarProps {
  project: MuseProject;
  language: Language;
  busy: boolean;
  busyAction: BusyAction | null;
  status: string;
  onNewProject: (type: CreationType) => void;
  onOpen: () => void;
  onSave: () => void;
  onGenerateFull: () => void;
  onCompleteEmpty: () => void;
  onGenerateProse: () => void;
  onGenerateImage: () => void;
  onProjectChange: (project: MuseProject) => void;
  onLanguageChange: (language: Language) => void;
}

export function Toolbar({
  project,
  language,
  busy,
  busyAction,
  status,
  onNewProject,
  onOpen,
  onSave,
  onGenerateFull,
  onCompleteEmpty,
  onGenerateProse,
  onGenerateImage,
  onProjectChange,
  onLanguageChange,
}: ToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [comfyStatus, setComfyStatus] = useState("");

  function updateComfySettings(patch: Partial<MuseProject["comfySettings"]>) {
    onProjectChange({
      ...project,
      comfySettings: {
        ...project.comfySettings,
        ...patch,
      },
    });
  }

  async function handleComfyConnectionTest() {
    setComfyStatus(t(language, "testingConnection"));
    try {
      await testComfyConnection(project.comfySettings);
      setComfyStatus(t(language, "comfyConnected"));
    } catch (error) {
      setComfyStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleAutoConfigureComfy() {
    setComfyStatus(t(language, "autoConfiguringWorkflow"));
    try {
      const preset = await createDefaultComfyWorkflow(project.comfySettings);
      updateComfySettings(preset);
      setComfyStatus(
        preset.checkpointName
          ? `${t(language, "autoConfiguredWorkflow")} ${preset.checkpointName}`
          : t(language, "autoConfiguredWorkflow"),
      );
    } catch (error) {
      setComfyStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleFluxConfigureComfy() {
    setComfyStatus(t(language, "autoConfiguringFluxWorkflow"));
    try {
      const preset = await createFluxComfyWorkflow(project.comfySettings);
      updateComfySettings(preset);
      setComfyStatus(
        preset.checkpointName
          ? `${t(language, "autoConfiguredFluxWorkflow")} ${preset.checkpointName}`
          : t(language, "autoConfiguredFluxWorkflow"),
      );
    } catch (error) {
      setComfyStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
      <header className="toolbar">
        <div className="brand">
          <div className="brandMark">M</div>
          <div className="brandName">{t(language, "appName")}</div>
        </div>

        <div className="toolbarGroup">
          <button
            className="iconTextButton"
            type="button"
            disabled={busy}
            onClick={() => onNewProject(project.creationType)}
          >
            {busyAction === "new" ? <Loader2 className="spin" size={16} /> : <FilePlus2 size={16} />}
            {busyAction === "new" ? t(language, "creating") : t(language, "new")}
          </button>
          <button className="iconTextButton" type="button" onClick={onOpen}>
            <FolderOpen size={16} />
            {t(language, "open")}
          </button>
          <button className="iconTextButton primary" type="button" onClick={onSave}>
            <Save size={16} />
            {t(language, "save")}
          </button>
        </div>

        <div className="toolbarGroup mainActions">
          <label className="field compact">
            <span>{t(language, "type")}</span>
            <select
              value={project.creationType}
              onChange={(event) => onNewProject(event.target.value as CreationType)}
            >
              {creationTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {creationTypeLabel(type, language)}
                </option>
              ))}
            </select>
          </label>
          <button className="iconTextButton" type="button" disabled={busy} onClick={onGenerateFull}>
            {busyAction === "full" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {busyAction === "full" ? t(language, "generating") : t(language, "randomMap")}
          </button>
          <button className="iconTextButton" type="button" disabled={busy} onClick={onCompleteEmpty}>
            {busyAction === "complete" ? (
              <Loader2 className="spin" size={16} />
            ) : (
                <RefreshCcw size={16} />
              )}
            {busyAction === "complete" ? t(language, "completing") : t(language, "completeNotes")}
          </button>
          <button className="iconTextButton" type="button" disabled={busy} onClick={onGenerateProse}>
            {busyAction === "prose" ? (
              <Loader2 className="spin" size={16} />
            ) : (
                <FileDown size={16} />
              )}
            {busyAction === "prose" ? t(language, "generating") : t(language, "generateBrief")}
          </button>
          <button className="iconTextButton" type="button" disabled={busy} onClick={onGenerateImage}>
            <ImagePlus size={16} />
            {t(language, "generateImage")}
          </button>
        </div>

        <button className="iconTextButton" type="button" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} />
          {t(language, "settings")}
        </button>

        <div className={`status ${busy ? "busy" : ""}`}>{status}</div>
      </header>

      {settingsOpen && (
        <div
          className="modalShade"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section className="settingsPanel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
            <div className="modalHeader">
              <div>
                <h2 id="settingsTitle">{t(language, "settings")}</h2>
                <p>{t(language, "settingsSubtitle")}</p>
              </div>
              <button
                className="iconButton"
                type="button"
                title={t(language, "close")}
                onClick={() => setSettingsOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="settingsGrid">
              <div className="settingsSectionTitle">{t(language, "generalSettings")}</div>
              <label className="field">
                <span>{t(language, "language")}</span>
                <select
                  value={language}
                  onChange={(event) => onLanguageChange(event.target.value as Language)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>

              <div className="settingsSectionTitle">{t(language, "lmStudioSettings")}</div>
              <label className="field">
                <span>{t(language, "endpoint")}</span>
                <input
                  value={project.aiSettings.endpoint}
                  onChange={(event) =>
                    onProjectChange({
                      ...project,
                      aiSettings: { ...project.aiSettings, endpoint: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field">
                <span>{t(language, "model")}</span>
                <input
                  placeholder={t(language, "modelPlaceholder")}
                  value={project.aiSettings.model}
                  onChange={(event) =>
                    onProjectChange({
                      ...project,
                      aiSettings: { ...project.aiSettings, model: event.target.value },
                    })
                  }
                />
              </label>

              <label className="field temperatureField">
                <span>{t(language, "temperature")}</span>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={project.aiSettings.temperature}
                  onChange={(event) =>
                    onProjectChange({
                      ...project,
                      aiSettings: {
                        ...project.aiSettings,
                        temperature: clampTemperature(Number(event.target.value)),
                      },
                    })
                  }
                />
              </label>

              <div className="settingsSectionTitle">{t(language, "comfySettings")}</div>
              <div className="settingsInline">
                <label className="field">
                  <span>{t(language, "comfyEndpoint")}</span>
                  <input
                    value={project.comfySettings.endpoint}
                    onChange={(event) => updateComfySettings({ endpoint: event.target.value })}
                  />
                </label>
                <button className="iconTextButton" type="button" onClick={handleComfyConnectionTest}>
                  {t(language, "testConnection")}
                </button>
              </div>
              <label className="checkboxField">
                <input
                  type="checkbox"
                  checked={project.comfySettings.autoStart}
                  onChange={(event) => updateComfySettings({ autoStart: event.target.checked })}
                />
                <span>{t(language, "autoStartComfy")}</span>
              </label>
              <div className="settingsInline">
                <label className="field">
                  <span>{t(language, "comfyLaunchDir")}</span>
                  <input
                    value={project.comfySettings.launchWorkingDir}
                    onChange={(event) => updateComfySettings({ launchWorkingDir: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "comfyLaunchCommand")}</span>
                  <input
                    value={project.comfySettings.launchCommand}
                    onChange={(event) => updateComfySettings({ launchCommand: event.target.value })}
                  />
                </label>
              </div>
              {comfyStatus && <div className="settingsHint">{comfyStatus}</div>}

              <div className="settingsInline">
                <button
                  className="iconTextButton"
                  type="button"
                  onClick={() => document.getElementById("comfyWorkflowFile")?.click()}
                >
                  <FileDown size={16} />
                  {t(language, "importWorkflow")}
                </button>
                <button className="iconTextButton" type="button" onClick={handleAutoConfigureComfy}>
                  <Sparkles size={16} />
                  {t(language, "autoConfigureWorkflow")}
                </button>
                <button className="iconTextButton" type="button" onClick={handleFluxConfigureComfy}>
                  <Sparkles size={16} />
                  {t(language, "autoConfigureFluxWorkflow")}
                </button>
                <span className="settingsHint">
                  {project.comfySettings.workflowJson
                    ? t(language, "workflowLoaded")
                    : t(language, "workflowMissing")}
                </span>
                <input
                  id="comfyWorkflowFile"
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      updateComfySettings({ workflowJson: String(reader.result ?? "") });
                      setComfyStatus(t(language, "workflowLoaded"));
                    };
                    reader.onerror = () => setComfyStatus(t(language, "workflowReadFailed"));
                    reader.readAsText(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <label className="field">
                <span>{t(language, "workflowJson")}</span>
                <textarea
                  className="workflowTextarea"
                  value={project.comfySettings.workflowJson}
                  placeholder={t(language, "workflowPlaceholder")}
                  onChange={(event) => updateComfySettings({ workflowJson: event.target.value })}
                />
              </label>

              <div className="nodeMappingGrid">
                <label className="field">
                  <span>{t(language, "positivePromptNode")}</span>
                  <input
                    value={project.comfySettings.positivePromptNodeId}
                    onChange={(event) =>
                      updateComfySettings({ positivePromptNodeId: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t(language, "inputField")}</span>
                  <input
                    value={project.comfySettings.positivePromptInput}
                    onChange={(event) =>
                      updateComfySettings({ positivePromptInput: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t(language, "negativePromptNode")}</span>
                  <input
                    value={project.comfySettings.negativePromptNodeId}
                    onChange={(event) =>
                      updateComfySettings({ negativePromptNodeId: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t(language, "inputField")}</span>
                  <input
                    value={project.comfySettings.negativePromptInput}
                    onChange={(event) =>
                      updateComfySettings({ negativePromptInput: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t(language, "widthNode")}</span>
                  <input
                    value={project.comfySettings.widthNodeId}
                    onChange={(event) => updateComfySettings({ widthNodeId: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "inputField")}</span>
                  <input
                    value={project.comfySettings.widthInput}
                    onChange={(event) => updateComfySettings({ widthInput: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "heightNode")}</span>
                  <input
                    value={project.comfySettings.heightNodeId}
                    onChange={(event) => updateComfySettings({ heightNodeId: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "inputField")}</span>
                  <input
                    value={project.comfySettings.heightInput}
                    onChange={(event) => updateComfySettings({ heightInput: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "seedNode")}</span>
                  <input
                    value={project.comfySettings.seedNodeId}
                    onChange={(event) => updateComfySettings({ seedNodeId: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{t(language, "inputField")}</span>
                  <input
                    value={project.comfySettings.seedInput}
                    onChange={(event) => updateComfySettings({ seedInput: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="modalActions">
              <button className="iconTextButton primary" type="button" onClick={() => setSettingsOpen(false)}>
                {t(language, "close")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value));
}
