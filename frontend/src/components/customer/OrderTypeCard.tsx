import type { ReactNode } from "react";

interface OrderTypeCardProps {
  title: string;
  description: string;
  benefits: string[];
  icon: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

export default function OrderTypeCard({
  title,
  description,
  benefits,
  icon,
  selected,
  onSelect,
}: OrderTypeCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group flex h-full flex-col rounded-3xl border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg sm:p-6 ${
        selected
          ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-200"
          : "border-slate-200 bg-white hover:border-blue-200"
      }`}
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${
          selected
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-700 group-hover:from-blue-100 group-hover:to-cyan-100"
        }`}
      >
        {icon}
      </span>
      <span className="mt-5 flex items-start justify-between gap-3">
        <span className="text-xl font-extrabold tracking-tight text-slate-900">
          {title}
        </span>
        <span
          className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${
            selected ? "border-blue-600 bg-blue-600 ring-2 ring-blue-100" : "border-slate-300"
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="mt-2 text-sm leading-6 text-slate-600">{description}</span>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
            {benefit}
          </li>
        ))}
      </ul>
      <span
        className={`mt-6 inline-flex items-center gap-2 text-sm font-bold ${
          selected ? "text-blue-700" : "text-slate-700 group-hover:text-blue-700"
        }`}
      >
        {selected ? "Selected" : "Choose this option"}
        <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}
