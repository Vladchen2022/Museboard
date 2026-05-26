import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { CandidateNode, Language, MuseProject } from "../types";
import { generateChildCandidates } from "../lib/ai";
import { t } from "../lib/i18n";
import { appendCandidateNodes, getNodePath } from "../lib/tree";

interface GeneratePanelProps {
  project: MuseProject;
  language: Language;
  nodeId: string;
  onClose: () => void;
  onProjectChange: (project: MuseProject) => void;
  onSelect: (nodeId: string) => void;
  onStatus: (message: string) => void;
}

export function GeneratePanel({
  project,
  language,
  nodeId,
  onClose,
  onProjectChange,
  onSelect,
  onStatus,
}: GeneratePanelProps) {
  const [count, setCount] = useState(3);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<CandidateNode[]>([]);
  const node = project.nodes[nodeId];
  const path = getNodePath(project, nodeId)
    .map((item) => item.title)
    .join(" > ");

  async function handleGenerate() {
    setBusy(true);
    onStatus(t(language, "generatingCandidates"));
    try {
      const nodes = await generateChildCandidates(project, nodeId, count, request, language);
      setCandidates(nodes);
      onStatus(nodes.length ? `${t(language, "generateCandidates")} (${nodes.length})` : t(language, "noCandidates"));
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function handleConfirm() {
    const result = appendCandidateNodes(project, nodeId, candidates.slice(0, count));
    onProjectChange(result.project);
    if (result.addedIds[0]) onSelect(result.addedIds[0]);
    onStatus(
      result.addedIds.length
        ? `${t(language, "confirmAppend")} (${result.addedIds.length})`
        : t(language, "appendDuplicate"),
    );
    onClose();
  }

  if (!node) return null;

  return (
    <div className="modalShade" onMouseDown={onClose}>
      <section className="generatePanel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>{t(language, "generateChildTitle")}</h2>
            <p>{path}</p>
          </div>
          <button className="iconButton" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="generateGrid">
          <label className="field">
            <span>{t(language, "count")}</span>
            <input
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(event) =>
                setCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))
              }
            />
          </label>
          <label className="field wide">
            <span>{t(language, "userRequest")}</span>
            <input
              placeholder={t(language, "userRequestPlaceholder")}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
          </label>
        </div>

        <button className="iconTextButton primary wideButton" type="button" disabled={busy} onClick={handleGenerate}>
          {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {t(language, "generateCandidates")}
        </button>

        <div className="candidateList">
          {candidates.map((candidate, index) => (
            <div className="candidateCard" key={`${candidate.title}-${index}`}>
              <label className="field">
                <span>{t(language, "candidateTitle")}</span>
                <input
                  value={candidate.title}
                  onChange={(event) =>
                    setCandidates((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>{t(language, "candidateDescription")}</span>
                <textarea
                  rows={3}
                  value={candidate.note}
                  onChange={(event) =>
                    setCandidates((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, note: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="textButton danger"
                type="button"
                onClick={() =>
                  setCandidates((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                {t(language, "removeCandidate")}
              </button>
            </div>
          ))}
        </div>

        <div className="modalActions">
          <button className="iconTextButton" type="button" onClick={onClose}>
            <X size={16} />
            {t(language, "cancel")}
          </button>
          <button
            className="iconTextButton primary"
            type="button"
            disabled={candidates.length === 0}
            onClick={handleConfirm}
          >
            <Check size={16} />
            {t(language, "confirmAppend")}
          </button>
        </div>
      </section>
    </div>
  );
}
