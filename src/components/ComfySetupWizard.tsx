import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  ClipboardCopy,
  FileDown,
  FolderOpen,
  ImagePlus,
  Loader2,
  Play,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import type { Language, MuseProject } from "../types";
import {
  aspectRatioOptions,
  buildComfyDiagnosticReport,
  createDefaultComfyWorkflow,
  createFluxComfyWorkflow,
  diagnoseComfyError,
  ensureComfyConnection,
  generateComfyImage,
  inferComfyWorkflowSettings,
  testComfyConnection,
  validateComfySettings,
} from "../lib/comfy";
import { t } from "../lib/i18n";
import { isTauriRuntime } from "../lib/storage";

interface ComfySetupWizardProps {
  project: MuseProject;
  language: Language;
  onProjectChange: (project: MuseProject) => void;
}

type WizardAction = "test" | "start" | "flux" | "standard" | "generate" | "map" | null;

export function ComfySetupWizard({
  project,
  language,
  onProjectChange,
}: ComfySetupWizardProps) {
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<WizardAction>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testPreview, setTestPreview] = useState<string | null>(null);

  const settings = project.comfySettings;
  const hasWorkflow = settings.workflowJson.trim().length > 0;
  const hasMapping = Boolean(
    settings.positivePromptNodeId.trim() &&
      settings.widthNodeId.trim() &&
      settings.heightNodeId.trim(),
  );

  function updateComfySettings(patch: Partial<MuseProject["comfySettings"]>) {
    onProjectChange({
      ...project,
      comfySettings: {
        ...project.comfySettings,
        ...patch,
      },
    });
  }

  async function run(action: Exclude<WizardAction, null>, task: () => Promise<void>) {
    setBusyAction(action);
    setTestPreview(null);
    try {
      await task();
    } catch (error) {
      setStatus(diagnoseComfyError(error, language));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTestConnection() {
    await run("test", async () => {
      setStatus(t(language, "testingConnection"));
      await testComfyConnection(settings);
      setStatus(t(language, "comfyConnected"));
    });
  }

  async function handleStartAndConnect() {
    await run("start", async () => {
      await ensureComfyConnection(settings, setStatus, language);
      setStatus(t(language, "comfyConnected"));
    });
  }

  async function handleChooseComfyFolder() {
    if (!isTauriRuntime()) {
      setStatus(t(language, "desktopOnlyFolderPick"));
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: t(language, "chooseComfyFolder"),
    });
    if (typeof selected === "string") {
      updateComfySettings({ launchWorkingDir: selected });
      setStatus(t(language, "comfyFolderSelected"));
    }
  }

  async function handleFluxPreset() {
    await run("flux", async () => {
      setStatus(t(language, "autoConfiguringFluxWorkflow"));
      await ensureComfyConnection(settings, setStatus, language);
      const preset = await createFluxComfyWorkflow(settings);
      updateComfySettings(preset);
      setStatus(
        preset.checkpointName
          ? `${t(language, "autoConfiguredFluxWorkflow")} ${preset.checkpointName}`
          : t(language, "autoConfiguredFluxWorkflow"),
      );
    });
  }

  async function handleStandardPreset() {
    await run("standard", async () => {
      setStatus(t(language, "autoConfiguringWorkflow"));
      await ensureComfyConnection(settings, setStatus, language);
      const preset = await createDefaultComfyWorkflow(settings);
      updateComfySettings(preset);
      setStatus(
        preset.checkpointName
          ? `${t(language, "autoConfiguredWorkflow")} ${preset.checkpointName}`
          : t(language, "autoConfiguredWorkflow"),
      );
    });
  }

  async function handleTestGeneration() {
    await run("generate", async () => {
      setStatus(t(language, "checkingComfy"));
      await ensureComfyConnection(settings, setStatus, language);
      let comfySettings = settings;

      if (!comfySettings.workflowJson.trim()) {
        setStatus(t(language, "autoConfiguringFluxWorkflow"));
        const preset = await createFluxComfyWorkflow(comfySettings);
        comfySettings = { ...comfySettings, ...preset };
        updateComfySettings(preset);
      }

      const validation = validateComfySettings(comfySettings, language);
      if (validation) throw new Error(validation);

      setStatus(t(language, "comfyTestGenerating"));
      const result = await generateComfyImage(
        comfySettings,
        t(language, "comfyTestPrompt"),
        aspectRatioOptions[0],
      );
      setTestPreview(result.dataUrl);
      setStatus(t(language, "comfyTestGenerated"));
    });
  }

  function handleWorkflowText(workflowJson: string) {
    try {
      const inspection = inferComfyWorkflowSettings(workflowJson, language);
      updateComfySettings(inspection.patch);
      setStatus([inspection.summary, ...inspection.warnings].join(" "));
    } catch (error) {
      updateComfySettings({ workflowJson });
      setStatus(diagnoseComfyError(error, language));
    }
  }

  function handleMapCurrentWorkflow() {
    run("map", async () => {
      const inspection = inferComfyWorkflowSettings(settings.workflowJson, language);
      updateComfySettings(inspection.patch);
      setStatus([inspection.summary, ...inspection.warnings].join(" "));
    });
  }

  async function handleCopyDiagnostics() {
    const report = buildComfyDiagnosticReport(settings, language);
    try {
      await navigator.clipboard.writeText(report);
      setStatus(t(language, "diagnosticsCopied"));
    } catch {
      setStatus(`${t(language, "diagnosticsCopyFailed")}\n${report}`);
    }
  }

  return (
    <section className="comfyWizard" aria-label={t(language, "comfyWizard")}>
      <div className="comfyWizardHeader">
        <div>
          <div className="settingsSectionTitle">{t(language, "comfyWizard")}</div>
          <p>{t(language, "comfyWizardIntro")}</p>
        </div>
        <div className="comfyReadiness">
          <ReadinessItem ready={Boolean(settings.endpoint.trim())} label={t(language, "endpointReady")} />
          <ReadinessItem ready={hasWorkflow} label={t(language, "workflowReady")} />
          <ReadinessItem ready={hasMapping} label={t(language, "mappingReady")} />
        </div>
      </div>

      <div className="comfyWizardSteps">
        <div className="comfyStep">
          <div className="comfyStepHeader">
            <span>1</span>
            <strong>{t(language, "connectComfy")}</strong>
          </div>
          <div className="settingsInline">
            <label className="field">
              <span>{t(language, "comfyEndpoint")}</span>
              <input
                value={settings.endpoint}
                onChange={(event) => updateComfySettings({ endpoint: event.target.value })}
              />
            </label>
            <button className="iconTextButton" type="button" onClick={handleTestConnection}>
              {busyAction === "test" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              {t(language, "testConnection")}
            </button>
          </div>
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(event) => updateComfySettings({ autoStart: event.target.checked })}
            />
            <span>{t(language, "autoStartComfy")}</span>
          </label>
          <div className="settingsInline">
            <label className="field">
              <span>{t(language, "comfyLaunchDir")}</span>
              <input
                value={settings.launchWorkingDir}
                onChange={(event) => updateComfySettings({ launchWorkingDir: event.target.value })}
              />
            </label>
            <button className="iconTextButton" type="button" onClick={handleChooseComfyFolder}>
              <FolderOpen size={16} />
              {t(language, "chooseFolder")}
            </button>
          </div>
          <label className="field">
            <span>{t(language, "comfyLaunchCommand")}</span>
            <input
              value={settings.launchCommand}
              onChange={(event) => updateComfySettings({ launchCommand: event.target.value })}
            />
          </label>
          <div className="settingsHint">{t(language, "comfyLaunchCommandHint")}</div>
          <button className="iconTextButton" type="button" onClick={handleStartAndConnect}>
            {busyAction === "start" ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {t(language, "startAndConnectComfy")}
          </button>
        </div>

        <div className="comfyStep">
          <div className="comfyStepHeader">
            <span>2</span>
            <strong>{t(language, "chooseGenerationSetup")}</strong>
          </div>
          <div className="comfyPresetGrid">
            <button className="comfyPresetButton" type="button" onClick={handleFluxPreset}>
              {busyAction === "flux" ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              <span>{t(language, "fluxRecommended")}</span>
              <small>{t(language, "fluxRecommendedHint")}</small>
            </button>
            <button className="comfyPresetButton" type="button" onClick={handleStandardPreset}>
              {busyAction === "standard" ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              <span>{t(language, "standardRecommended")}</span>
              <small>{t(language, "standardRecommendedHint")}</small>
            </button>
          </div>
          <div className="settingsInline">
            <button
              className="iconTextButton"
              type="button"
              onClick={() => document.getElementById("comfyWorkflowFile")?.click()}
            >
              <FileDown size={16} />
              {t(language, "importWorkflow")}
            </button>
            <button
              className="iconTextButton"
              type="button"
              disabled={!settings.workflowJson.trim()}
              onClick={handleMapCurrentWorkflow}
            >
              {busyAction === "map" ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
              {t(language, "autoMapWorkflow")}
            </button>
            <span className="settingsHint">
              {settings.workflowJson ? t(language, "workflowLoaded") : t(language, "workflowMissing")}
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
                reader.onload = () => handleWorkflowText(String(reader.result ?? ""));
                reader.onerror = () => setStatus(t(language, "workflowReadFailed"));
                reader.readAsText(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="comfyStep">
          <div className="comfyStepHeader">
            <span>3</span>
            <strong>{t(language, "testGeneration")}</strong>
          </div>
          <p className="settingsHint">{t(language, "testGenerationHint")}</p>
          <button className="iconTextButton primary" type="button" onClick={handleTestGeneration}>
            {busyAction === "generate" ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />}
            {busyAction === "generate" ? t(language, "generatingImage") : t(language, "testGenerateImage")}
          </button>
          {testPreview && (
            <div className="comfyTestPreview">
              <img src={testPreview} alt={t(language, "generatedPreview")} />
            </div>
          )}
        </div>
      </div>

      {status && <div className="settingsStatus">{status}</div>}

      <button className="iconTextButton" type="button" onClick={handleCopyDiagnostics}>
        <ClipboardCopy size={16} />
        {t(language, "copyDiagnostics")}
      </button>

      <details
        className="advancedComfySettings"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>{t(language, "advancedComfySettings")}</summary>
        <label className="field">
          <span>{t(language, "workflowJson")}</span>
          <textarea
            className="workflowTextarea"
            value={settings.workflowJson}
            placeholder={t(language, "workflowPlaceholder")}
            onChange={(event) => handleWorkflowText(event.target.value)}
          />
        </label>
        <div className="nodeMappingGrid">
          <MappingField
            label={t(language, "positivePromptNode")}
            value={settings.positivePromptNodeId}
            onChange={(value) => updateComfySettings({ positivePromptNodeId: value })}
          />
          <MappingField
            label={t(language, "inputField")}
            value={settings.positivePromptInput}
            onChange={(value) => updateComfySettings({ positivePromptInput: value })}
          />
          <MappingField
            label={t(language, "negativePromptNode")}
            value={settings.negativePromptNodeId}
            onChange={(value) => updateComfySettings({ negativePromptNodeId: value })}
          />
          <MappingField
            label={t(language, "inputField")}
            value={settings.negativePromptInput}
            onChange={(value) => updateComfySettings({ negativePromptInput: value })}
          />
          <MappingField
            label={t(language, "widthNode")}
            value={settings.widthNodeId}
            onChange={(value) => updateComfySettings({ widthNodeId: value })}
          />
          <MappingField
            label={t(language, "inputField")}
            value={settings.widthInput}
            onChange={(value) => updateComfySettings({ widthInput: value })}
          />
          <MappingField
            label={t(language, "heightNode")}
            value={settings.heightNodeId}
            onChange={(value) => updateComfySettings({ heightNodeId: value })}
          />
          <MappingField
            label={t(language, "inputField")}
            value={settings.heightInput}
            onChange={(value) => updateComfySettings({ heightInput: value })}
          />
          <MappingField
            label={t(language, "seedNode")}
            value={settings.seedNodeId}
            onChange={(value) => updateComfySettings({ seedNodeId: value })}
          />
          <MappingField
            label={t(language, "inputField")}
            value={settings.seedInput}
            onChange={(value) => updateComfySettings({ seedInput: value })}
          />
        </div>
      </details>
    </section>
  );
}

function ReadinessItem({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`readinessItem ${ready ? "ready" : ""}`}>
      <CheckCircle2 size={14} />
      {label}
    </span>
  );
}

function MappingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
