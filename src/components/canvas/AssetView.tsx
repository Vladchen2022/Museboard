import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Asset, Language, LayoutItem } from "../../types";
import { t } from "../../lib/i18n";
import { assetDisplaySrc, loadAssetDisplaySrc } from "../../lib/storage";

interface AssetViewProps {
  asset: Asset;
  projectDir: string | null;
  shouldLoad: boolean;
  language: Language;
  item: LayoutItem;
  selected: boolean;
  onToggleThumbnail: () => void;
  onMoveStart: (event: React.PointerEvent<HTMLElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLElement>) => void;
}

export function AssetView({
  asset,
  projectDir,
  shouldLoad,
  language,
  item,
  selected,
  onToggleThumbnail,
  onMoveStart,
  onResizeStart,
}: AssetViewProps) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [src, setSrc] = useState(() => assetDisplaySrc(asset));
  const assetSourceVersion = asset.relativePath ?? asset.absolutePath ?? asset.createdAt;

  useEffect(() => {
    let canceled = false;
    setFailed(false);
    setSrc(assetDisplaySrc(asset));
    setLoading(false);

    if (!shouldLoad) {
      return () => {
        canceled = true;
      };
    }

    setLoading(true);
    const previewSize = Math.ceil(Math.max(item.width, item.height) * window.devicePixelRatio * 1.25);
    loadAssetDisplaySrc(projectDir, asset, previewSize)
      .then((nextSrc) => {
        if (!canceled) {
          setSrc(nextSrc);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!canceled) {
          setSrc("");
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [projectDir, shouldLoad, asset.id, assetSourceVersion, item.width, item.height]);

  return (
    <div
      className={`assetItem ${selected ? "selected" : ""}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.z,
        transform: `rotate(${item.rotation}deg)`,
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onToggleThumbnail();
      }}
      onPointerDown={onMoveStart}
    >
      {!shouldLoad && !src ? (
        <AssetPlaceholder asset={asset} language={language} labelKey="imageDeferred" />
      ) : loading && !src ? (
        <AssetPlaceholder asset={asset} language={language} labelKey="imageLoading" />
      ) : failed || !src ? (
        <div className="assetError">
          <ImagePlus size={22} />
          <span>{t(language, "imageReadFail")}</span>
          <small>{asset.absolutePath ?? asset.relativePath ?? asset.originalName}</small>
        </div>
      ) : (
        <img
          src={src}
          alt={asset.originalName}
          draggable={false}
          style={{
            filter: item.grayscale ? "grayscale(1)" : undefined,
            transform: item.flippedX ? "scaleX(-1)" : undefined,
          }}
          onError={() => setFailed(true)}
          onLoad={() => setFailed(false)}
        />
      )}
      <div className="assetLabel">{asset.originalName}</div>
      <button
        className="resizeHandle"
        type="button"
        title={t(language, "resize")}
        onPointerDown={onResizeStart}
      />
    </div>
  );
}

function AssetPlaceholder({
  asset,
  language,
  labelKey,
}: {
  asset: Asset;
  language: Language;
  labelKey: "imageDeferred" | "imageLoading";
}) {
  return (
    <div className="assetPlaceholder">
      <ImagePlus size={22} />
      <span>{t(language, labelKey)}</span>
      <small>{asset.originalName}</small>
    </div>
  );
}
