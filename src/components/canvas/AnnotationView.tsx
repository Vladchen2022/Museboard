import type { Annotation, Language } from "../../types";
import { t } from "../../lib/i18n";

interface AnnotationViewProps {
  annotation: Annotation;
  language: Language;
  selected: boolean;
  onSelect: () => void;
  onMoveStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTextChange: (text: string) => void;
}

export function AnnotationView({
  annotation,
  language,
  selected,
  onSelect,
  onMoveStart,
  onResizeStart,
  onTextChange,
}: AnnotationViewProps) {
  const isArrow = annotation.kind === "arrow";
  const commonStyle: React.CSSProperties = {
    left: annotation.x,
    top: annotation.y,
    width: isArrow ? Math.max(12, annotation.width) : annotation.width,
    height: isArrow ? 2 : annotation.height,
    zIndex: annotation.z,
    color: annotation.color,
    transform: `rotate(${annotation.rotation}deg)`,
  };

  return (
    <div
      className={`annotation ${annotation.kind} ${selected ? "selected" : ""}`}
      style={commonStyle}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={onMoveStart}
    >
      {annotation.kind === "text" ? (
        <textarea
          className="annotationTextInput"
          value={annotation.text ?? ""}
          placeholder={t(language, "annotationTextPlaceholder")}
          onChange={(event) => onTextChange(event.target.value)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : null}
      {annotation.kind === "arrow" ? <span className="arrowHead" /> : null}
      {annotation.kind === "pen" ? (
        <svg className="penStroke" viewBox={`0 0 ${annotation.width} ${annotation.height}`}>
          <polyline
            points={(annotation.points ?? []).map((point) => `${point.x},${point.y}`).join(" ")}
          />
        </svg>
      ) : null}
      {selected && (
        <>
          <span className="annotationDragHandle" title={t(language, "moveAnnotation")} />
          {annotation.kind !== "pen" && (
            <button
              className="annotationResizeHandle"
              type="button"
              title={
                annotation.kind === "arrow"
                  ? t(language, "changeArrow")
                  : t(language, "resizeAnnotation")
              }
              onPointerDown={onResizeStart}
            />
          )}
        </>
      )}
    </div>
  );
}
