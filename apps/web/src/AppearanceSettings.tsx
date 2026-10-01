import { useEffect, useId, useRef, useState } from "react";

export type AppearanceColors = { up: string; down: string };

export const DEFAULT_COLORS: AppearanceColors = {
  up: "#f16975",
  down: "#36c99b",
};

const STORAGE_KEY = "big-a.appearance.v1";
const HEX_COLOR = /^#[\da-f]{6}$/i;

function isAppearanceColors(value: unknown): value is AppearanceColors {
  return (
    typeof value === "object" &&
    value !== null &&
    "up" in value &&
    "down" in value &&
    typeof value.up === "string" &&
    typeof value.down === "string" &&
    HEX_COLOR.test(value.up) &&
    HEX_COLOR.test(value.down)
  );
}

function readAppearance(): {
  colors: AppearanceColors;
  storageError: string | null;
} {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isAppearanceColors(parsed)) {
        return {
          colors: {
            up: parsed.up.toLowerCase(),
            down: parsed.down.toLowerCase(),
          },
          storageError: null,
        };
      }
    }
    return { colors: DEFAULT_COLORS, storageError: null };
  } catch {
    return {
      colors: DEFAULT_COLORS,
      storageError:
        "无法读取本地配色，已使用默认颜色。你仍可调整当前页面的配色。",
    };
  }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(readAppearance);

  function setColors(next: AppearanceColors) {
    if (!isAppearanceColors(next)) return;
    const colors = { up: next.up.toLowerCase(), down: next.down.toLowerCase() };
    let storageError: string | null = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    } catch {
      storageError =
        "配色已应用，但无法保存在此浏览器中。刷新后可能恢复默认颜色。";
    }
    setAppearance({ colors, storageError });
  }

  return { ...appearance, setColors };
}

type AppearanceSettingsProps = {
  colors: AppearanceColors;
  onChange: (colors: AppearanceColors) => void;
  onClose: () => void;
  storageError: string | null;
};

export function AppearanceSettings({
  colors,
  onChange,
  onClose,
  storageError,
}: AppearanceSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const noteId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const presets = [
    { label: "红涨绿跌", colors: DEFAULT_COLORS },
    {
      label: "绿涨红跌",
      colors: { up: DEFAULT_COLORS.down, down: DEFAULT_COLORS.up },
    },
  ];

  return (
    <dialog
      ref={dialogRef}
      className="appearance-dialog"
      aria-labelledby={headingId}
      aria-describedby={noteId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="settings-note">PERSONALIZE</span>
          <h2 id={headingId}>涨跌配色</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭配色设置"
          onClick={onClose}
          autoFocus
        >
          ×
        </button>
      </div>

      <div className="dialog-body">
        <p id={noteId} className="settings-note">
          选择你习惯的行情颜色，更改会立即应用并保存在此浏览器。
        </p>
        <div className="appearance-presets" aria-label="常用配色">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="preset-option"
              aria-pressed={
                colors.up === preset.colors.up &&
                colors.down === preset.colors.down
              }
              onClick={() => onChange(preset.colors)}
            >
              <span>
                <span style={{ color: preset.colors.up }}>↗ 涨</span>
                {" / "}
                <span style={{ color: preset.colors.down }}>↘ 跌</span>
              </span>
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>

        <div className="color-fields">
          <label className="color-field">
            <span>上涨颜色</span>
            <input
              type="color"
              aria-label="上涨颜色"
              value={colors.up}
              onInput={(event) =>
                onChange({ ...colors, up: event.currentTarget.value })
              }
            />
            <code>{colors.up.toUpperCase()}</code>
          </label>
          <label className="color-field">
            <span>下跌颜色</span>
            <input
              type="color"
              aria-label="下跌颜色"
              value={colors.down}
              onInput={(event) =>
                onChange({ ...colors, down: event.currentTarget.value })
              }
            />
            <code>{colors.down.toUpperCase()}</code>
          </label>
        </div>

        <div className="color-preview" aria-label="配色预览">
          <span className="settings-note">效果预览</span>
          <strong style={{ color: colors.up }}>↗ +3.48%</strong>
          <strong style={{ color: colors.down }}>↘ -1.26%</strong>
        </div>
        {storageError && (
          <p className="storage-warning" role="status">
            {storageError}
          </p>
        )}
      </div>

      <div className="dialog-footer">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onChange(DEFAULT_COLORS)}
        >
          恢复默认
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onClose}
        >
          完成
        </button>
      </div>
    </dialog>
  );
}
