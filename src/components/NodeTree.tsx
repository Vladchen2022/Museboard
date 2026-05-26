import { ChevronDown, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Language, MuseProject } from "../types";
import { addManualChild, deleteNode, updateNode } from "../lib/tree";
import { t } from "../lib/i18n";

interface NodeTreeProps {
  project: MuseProject;
  language: Language;
  selectedNodeId: string;
  onSelect: (nodeId: string) => void;
  onProjectChange: (project: MuseProject) => void;
  onGenerateChildren: (nodeId: string) => void;
  onGenerateDescription: (nodeId: string) => void;
  generatingDescription: boolean;
}

export function NodeTree({
  project,
  language,
  selectedNodeId,
  onSelect,
  onProjectChange,
  onGenerateChildren,
  onGenerateDescription,
  generatingDescription,
}: NodeTreeProps) {
  const selectedNode = project.nodes[selectedNodeId];

  return (
    <div className="treePanel">
      {selectedNode && (
        <div className="nodeEditor">
          <div className="sectionHeader">
            <span>{t(language, "nodeEditor")}</span>
            <div className="sectionActions">
              <button
                className="iconTextButton subtle"
                type="button"
                title={
                  selectedNode.title.trim()
                    ? t(language, "generateDescriptionTitle")
                    : t(language, "fillTitleFirst")
                }
                disabled={generatingDescription || selectedNode.title.trim().length === 0}
                onClick={() => onGenerateDescription(selectedNodeId)}
              >
                {generatingDescription ? (
                  <Loader2 className="spin" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {generatingDescription
                  ? t(language, "generatingDescriptionShort")
                  : t(language, "generateDescription")}
              </button>
              <button
                className="iconTextButton subtle"
                type="button"
                onClick={() => onGenerateChildren(selectedNodeId)}
              >
                <Sparkles size={14} />
                {t(language, "generateNext")}
              </button>
            </div>
          </div>
          <label className="field">
            <span>{t(language, "title")}</span>
            <input
              value={selectedNode.title}
              onChange={(event) =>
                onProjectChange(updateNode(project, selectedNodeId, { title: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>{t(language, "description")}</span>
            <textarea
              rows={4}
              value={selectedNode.note}
              onChange={(event) =>
                onProjectChange(updateNode(project, selectedNodeId, { note: event.target.value }))
              }
            />
          </label>
        </div>
      )}

      <div className="sectionHeader">
        <span>{t(language, "mindMap")}</span>
        <button
          className="iconButton"
          type="button"
          title={t(language, "addChild")}
          onClick={() => {
            const result = addManualChild(project, selectedNodeId);
            onProjectChange(result.project);
            onSelect(result.nodeId);
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="treeList">
        <TreeNode
          project={project}
          language={language}
          nodeId={project.rootId}
          depth={0}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onProjectChange={onProjectChange}
          onGenerateChildren={onGenerateChildren}
        />
      </div>
    </div>
  );
}

interface TreeNodeProps
  extends Omit<NodeTreeProps, "onGenerateDescription" | "generatingDescription"> {
  nodeId: string;
  depth: number;
}

function TreeNode({
  project,
  language,
  nodeId,
  depth,
  selectedNodeId,
  onSelect,
  onProjectChange,
  onGenerateChildren,
}: TreeNodeProps) {
  const node = project.nodes[nodeId];
  if (!node) return null;

  const isSelected = nodeId === selectedNodeId;

  return (
    <div className="treeNodeWrap">
      <div
        className={`treeNode ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: 12 + depth * 18 }}
        onClick={() => onSelect(nodeId)}
      >
        <ChevronDown size={14} className={node.children.length ? "" : "mutedIcon"} />
        <div className="nodeText">
          <div className="nodeTitle">{node.title || t(language, "untitledNode")}</div>
          {node.note && <div className="nodeNote">{node.note}</div>}
        </div>
        <button
          className="smallIconButton"
          type="button"
          title={t(language, "generateNext")}
          onClick={(event) => {
            event.stopPropagation();
            onGenerateChildren(nodeId);
          }}
        >
          <Sparkles size={13} />
        </button>
        {nodeId !== project.rootId && (
          <button
            className="smallIconButton danger"
            type="button"
            title={t(language, "deleteNode")}
            onClick={(event) => {
              event.stopPropagation();
              const next = deleteNode(project, nodeId);
              onProjectChange(next);
              onSelect(node.parentId ?? next.rootId);
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {node.children.map((childId) => (
        <TreeNode
          key={childId}
          project={project}
          language={language}
          nodeId={childId}
          depth={depth + 1}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onProjectChange={onProjectChange}
          onGenerateChildren={onGenerateChildren}
        />
      ))}
    </div>
  );
}
