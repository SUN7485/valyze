// Read-only building blocks for the Extractor's result preview. Module scope on purpose:
// components defined inside another component remount on every render.
/* eslint-disable react-refresh/only-export-components -- colorClass is a helper shared with the page */

export const colorClass = (color) => {
  const key = String(color || "").toLowerCase();
  const colors = {
    "#10b981": "bg-emerald-500",
    "#22c55e": "bg-emerald-500",
    green: "bg-emerald-500",
    "#f59e0b": "bg-amber-500",
    yellow: "bg-amber-500",
    "#ef4444": "bg-rose-500",
    red: "bg-rose-500",
    "#7c3aed": "bg-violet-500",
    purple: "bg-violet-500",
    "#3b82f6": "bg-blue-500",
    blue: "bg-blue-500",
  };
  return colors[key];
};

export const Badge = ({ v, color }) => {
  const c = { Low: "bg-emerald-500", Medium: "bg-amber-500", High: "bg-rose-500", Critical: "bg-violet-500", green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500" };
  const bg = colorClass(color) || c[v] || "bg-slate-500";
  return v ? <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold text-white ${bg}`}>{v}</span>
    : <span className="text-[var(--color-text-muted)]">—</span>;
};
export const Bar = ({ label, val, color, invert }) => {
  const w = Math.max(0, Math.min(100, invert ? 100 - (+val || 0) : (+val || 0)));
  const widthSteps = ["w-0", "w-5", "w-10", "w-15", "w-20", "w-25", "w-30", "w-35", "w-40", "w-45", "w-50", "w-55", "w-60", "w-65", "w-70", "w-75", "w-80", "w-85", "w-90", "w-95", "w-100"];
  const widthClass = widthSteps[Math.round(w / 5)];
  const defaultBg = w > 70 ? "bg-emerald-500" : w > 40 ? "bg-amber-500" : "bg-rose-500";
  const bg = colorClass(color) || defaultBg;
  return <div className="mb-2.5"><div className="mb-0.5 flex items-center justify-between text-xs"><span className="text-[var(--color-text-secondary)]">{label}</span><span className="font-semibold text-[var(--color-text)]">{val ??"—"}</span></div><div className="h-1.5 overflow-hidden rounded bg-[var(--color-border-soft)]"><div className={`h-full rounded ${bg} ${widthClass} transition-all duration-700`} /></div></div>;
};

/* Read-only presentational helpers for the extraction preview. Defined at module
   scope so React keeps their identity stable across renders. */
export const Sec = ({ title, ch }) => (
  <div className="mb-3.5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-4">
    <div className="mb-3 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{title}</div>
    {ch}
  </div>
);
export const F = ({ l, v }) => (
  <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-soft)] py-1 text-xs">
    <span className="flex-shrink-0 text-[var(--color-text-muted)]">{l}</span>
    <span className="max-w-[65%] break-words text-right font-medium text-[var(--color-text)]">{v ??"—"}</span>
  </div>
);
export const THead = ({ cols }) => <thead><tr>{cols.map(h=><th key={h} className="border-b-2 border-[var(--color-border)] bg-blue-500/10 px-2 py-1.5 text-left text-[11px] font-bold text-blue-500">{h}</th>)}</tr></thead>;
export const TRow  = ({ row }) => <tr>{row.map((c,i)=><td key={i} className={`border-b border-[var(--color-border-soft)] px-2 py-1 text-xs ${i === 0 ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text)]"}`}>{c||"—"}</td>)}</tr>;
export const Table = ({ cols, rows }) => <table className="w-full border-collapse"><THead cols={cols}/><tbody>{rows.map((r,i)=><TRow key={i} row={r}/>)}</tbody></table>;
