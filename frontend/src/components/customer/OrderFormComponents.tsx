import type { ReactNode } from "react";
import { AlertCircle, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { formatPrice } from "./formatPrice";

export interface OrderProduct {
  id: string;
  name: string;
  description?: string | null;
  bottleSizeLiters: number;
  pricePaise: number;
  stockQuantity: number;
  isActive?: boolean;
}

export interface OrderAddress {
  id: string;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault?: boolean;
}

interface PackageSelectionProps {
  products: OrderProduct[];
  productId: string;
  onProductChange: (productId: string) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  deliveryTime: string;
  onDeliveryTimeChange: (value: string) => void;
  minimumDate: string;
}

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

export function PackageSelection({
  products,
  productId,
  onProductChange,
  quantity,
  onQuantityChange,
  startDate,
  onStartDateChange,
  deliveryTime,
  onDeliveryTimeChange,
  minimumDate,
}: PackageSelectionProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
        Water product
        <select
          className={fieldClass}
          value={productId}
          onChange={(event) => onProductChange(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose an available product
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.bottleSizeLiters} L · {formatPrice(product.pricePaise)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Bottles per delivery
        <input
          className={fieldClass}
          type="number"
          min={1}
          max={100}
          step={1}
          value={quantity}
          onChange={(event) => onQuantityChange(Number(event.target.value))}
          required
        />
      </label>

      <label className="text-sm font-semibold text-slate-700">
        Start date
        <input
          className={fieldClass}
          type="date"
          min={minimumDate}
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          required
        />
      </label>

      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
        Preferred delivery time
        <select
          className={fieldClass}
          value={deliveryTime}
          onChange={(event) => onDeliveryTimeChange(event.target.value)}
          required
        >
          <option value="MORNING">Morning</option>
          <option value="AFTERNOON">Afternoon</option>
          <option value="EVENING">Evening</option>
        </select>
      </label>
    </div>
  );
}

interface AddressSelectorProps {
  addresses: OrderAddress[];
  value: string;
  onChange: (addressId: string) => void;
}

export function AddressSelector({
  addresses,
  value,
  onChange,
}: AddressSelectorProps) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      Delivery address
      <span className="relative block">
        <MapPin
          size={17}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-600"
        />
        <select
          className={`${fieldClass} pl-11`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          disabled={addresses.length === 0}
        >
          <option value="" disabled>
            {addresses.length === 0 ? "Add an address to continue" : "Choose an address"}
          </option>
          {addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {address.label || "Saved address"} — {address.addressLine1}, {address.city}
              {address.isDefault ? " (Default)" : ""}
            </option>
          ))}
        </select>
      </span>
      {addresses.length === 0 && (
        <span className="mt-2 block text-xs font-medium text-amber-700">
          Add a saved address from your profile before continuing.
        </span>
      )}
    </label>
  );
}

export interface PriceRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

export function PriceSummary({
  title = "Price summary",
  rows,
  disclaimer,
}: {
  title?: string;
  rows: PriceRow[];
  disclaimer?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-blue-700">
          <PackageCheck size={20} />
        </span>
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      <dl className="mt-5 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-3 text-sm ${
              row.emphasis ? "border-t border-slate-100 pt-3" : ""
            }`}
          >
            <dt className={row.emphasis ? "font-bold text-slate-800" : "text-slate-500"}>
              {row.label}
            </dt>
            <dd className={row.emphasis ? "font-extrabold text-blue-700" : "font-semibold text-slate-800"}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {disclaimer && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-slate-600">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-700" />
          {disclaimer}
        </p>
      )}
    </section>
  );
}

export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <h2 id="confirmation-title" className="text-xl font-extrabold text-slate-900">
          {title}
        </h2>
        <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:opacity-60 ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-label="Loading content" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6"
        >
          <div className="h-5 w-1/3 rounded bg-slate-200" />
          <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-blue-700">
        {icon ?? <AlertCircle size={25} />}
      </span>
      <h2 className="mt-4 text-lg font-extrabold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
