const statusColors: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  STARTED: "bg-sky-50 text-sky-800 ring-sky-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-200",
  EXPIRED: "bg-slate-100 text-slate-700 ring-slate-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  GENERATED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FAILED: "bg-rose-50 text-rose-800 ring-rose-200",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-200",
};

interface StatusBadgeProps {
  status: string | null | undefined;
  size?: "compact" | "regular";
}

export default function StatusBadge({
  status,
  size = "regular",
}: StatusBadgeProps) {
  const normalized = status?.trim().toUpperCase() || "UNKNOWN";
  const label = normalized
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const sizeClass =
    size === "compact" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs";

  return (
    <span
      className={`inline-flex shrink-0 rounded-full font-bold ring-1 ring-inset ${sizeClass} ${
        statusColors[normalized] ?? "bg-slate-100 text-slate-700 ring-slate-200"
      }`}
    >
      {label}
    </span>
  );
}
