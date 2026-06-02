import { useState } from "react";
import { useCalibration, type CalibrationParam } from "@/hooks/useCalibration";

// Editor inline de referência de calibração — vive embaixo do trend no card
// de pH/Cloro/Alcalinidade. Não modal: clique em "editar" abre input, ENTER
// salva, ESC cancela. Drift opcional (sensor − referência) com cor escalada.

interface Props {
  param: CalibrationParam;
  unit: string;
  /** Valor instantâneo do sensor. NaN/-99 esconde o drift. */
  current: number;
}

export function CalibrationField({ param, unit, current }: Props) {
  const { value, update, isCustom } = useCalibration(param);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => String(value));

  const decimals = param === "alkalinity" ? 0 : param === "ph" ? 2 : 2;
  // Drift = leitura − referência. Só mostra se ambos válidos.
  const driftValid = Number.isFinite(current) && current > -50 && value > 0;
  const drift = driftValid ? current - value : NaN;
  const driftPct = driftValid ? Math.abs(drift / value) * 100 : 0;
  const driftColor =
    driftPct < 5
      ? "var(--aqua-text-muted)"
      : driftPct < 15
        ? "var(--status-warn)"
        : "var(--status-crit)";

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) update(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <span className="text-aqua-text-muted">Referência:</span>
        <input
          type="number"
          step="0.01"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(String(value));
              setEditing(false);
            }
          }}
          aria-label={`Valor de referência de ${param}`}
          className="w-20 rounded border border-aqua-border bg-aqua-surface-2 px-1.5 py-0.5 font-tabular text-[11px] text-aqua-text focus:border-aqua-accent focus:outline-none"
        />
        <span className="text-aqua-text-muted">{unit}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
      <span className="text-aqua-text-muted">
        {isCustom && <span className="mr-0.5 text-aqua-accent">·</span>}
        Referência: <span className="font-tabular">{value.toFixed(decimals)}</span>
        {unit && <span> {unit}</span>}
      </span>
      {driftValid && (
        <span className="font-tabular" style={{ color: driftColor }}>
          · drift {drift >= 0 ? "+" : ""}
          {drift.toFixed(decimals)}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        aria-label={`Editar referência de ${param}`}
        className="text-aqua-accent transition-colors hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-aqua-accent"
      >
        editar
      </button>
    </div>
  );
}
