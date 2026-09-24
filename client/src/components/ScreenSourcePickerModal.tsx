import { Check, MonitorUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ScreenSource } from "../types";

type ScreenSourcePickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (source: ScreenSource) => void;
  sources?: ScreenSource[];
  title?: string;
};

const emptySources: ScreenSource[] = [];

export function ScreenSourcePickerModal({
  open,
  onClose,
  onSelect,
  sources = emptySources,
  title = "Selecionar tela ou janela"
}: ScreenSourcePickerModalProps) {
  const [internalSources, setInternalSources] = useState<ScreenSource[]>(sources);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setInternalSources(sources);
    setSelectedId(current => current && sources.some(source => source.id === current) ? current : null);
    setError("");

    const desktopCapturer = typeof window !== "undefined" ? (window as typeof window & { desktopCapturer?: { getSources: (options: { types: string[]; fetchWindowIcons: boolean; fetchScreenIcons: boolean }) => Promise<ScreenSource[]> } }).desktopCapturer : undefined;
    if (!desktopCapturer?.getSources) return;

    let active = true;
    setLoading(true);
    void desktopCapturer.getSources({ types: ["screen", "window"], fetchWindowIcons: true, fetchScreenIcons: true })
      .then(result => {
        if (!active) return;
        const safeSources = result.length ? result : sources;
        setInternalSources(safeSources);
        setSelectedId(current => current && safeSources.some(source => source.id === current) ? current : safeSources[0]?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar as janelas disponíveis.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, sources]);

  if (!open) return null;

  const selectedSource = internalSources.find(source => source.id === selectedId) ?? null;

  return (
    <div className="screen-source-modal" role="dialog" aria-modal="true" aria-labelledby="screen-source-title">
      <div className="screen-source-panel" aria-live="polite">
        <button type="button" className="screen-source-close" aria-label="Fechar seletor de tela" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="screen-source-header">
          <span className="screen-source-kicker">Compartilhar</span>
          <h2 id="screen-source-title">{title}</h2>
          <p>Escolha a janela ou ecrã que deseja transmitir.</p>
        </div>

        {loading && (
          <div className="screen-source-state">
            <div className="screen-source-spinner" aria-hidden="true" />
            <span>A procurar janelas disponíveis…</span>
          </div>
        )}

        {!loading && error && (
          <div className="screen-source-state screen-source-state-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && internalSources.length === 0 && (
          <div className="screen-source-empty">
            <div className="screen-source-empty-icon"><MonitorUp size={24} /></div>
            <p>Nenhuma janela ou ecrã foi detectada.</p>
          </div>
        )}

        {!loading && internalSources.length > 0 && (
          <div className="screen-source-grid">
            {internalSources.map(source => {
              const selected = source.id === selectedId;
              return (
                <button
                  type="button"
                  key={source.id}
                  className={`screen-source-card ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedId(source.id);
                    setError("");
                  }}
                >
                  <div className="screen-source-thumb" aria-hidden="true">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} />
                    ) : (
                      <div className="screen-source-thumb-fallback"><MonitorUp size={18} /></div>
                    )}
                  </div>
                  <div className="screen-source-meta">
                    <strong>{source.name}</strong>
                    <small>{source.type === "screen" ? "Ecrã" : "Janela"}</small>
                  </div>
                  {selected && (
                    <span className="screen-source-check" aria-label="Selecionado">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="screen-source-actions">
          <button type="button" className="screen-source-button screen-source-cancel" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="screen-source-button screen-source-confirm"
            disabled={!selectedSource}
            onClick={() => {
              if (!selectedSource) return;
              onSelect(selectedSource);
              onClose();
            }}
          >
            Usar seleção
          </button>
        </div>
      </div>
    </div>
  );
}
