import { CalendarDays, MapPin, Package, Pause, Play, X } from "lucide-react";
import type { ReactNode } from "react";
import DeliverySchedule, {
  type ScheduledOccurrenceView,
} from "./DeliverySchedule";
import { formatPrice } from "./formatPrice";

export interface SubscriptionView {
  id: string;
  packageType: "DAILY" | "ALTERNATE_DAY";
  quantityPerDelivery: number;
  startDate: string;
  endDate: string | null;
  nextDeliveryDate: string;
  deliveryTimePreference: "MORNING" | "AFTERNOON" | "EVENING";
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  unitPricePaise: number;
  occurrences: ScheduledOccurrenceView[];
  product: { name: string; bottleSizeLiters: number };
  address: {
    label?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
}

function displayDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const statusClass: Record<SubscriptionView["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-slate-100 text-slate-600",
  EXPIRED: "bg-slate-100 text-slate-600",
};

const timeLabels = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};

export default function SubscriptionSummary({
  subscription,
  onAction,
  expanded,
  onToggleDetails,
  busy,
}: {
  subscription: SubscriptionView;
  onAction: (status: "ACTIVE" | "PAUSED" | "CANCELLED") => void;
  expanded: boolean;
  onToggleDetails: () => void;
  busy: boolean;
}) {
  const isActive = subscription.status === "ACTIVE";
  const canManage = subscription.status === "ACTIVE" || subscription.status === "PAUSED";
  const isDaily = subscription.packageType === "DAILY";
  const deliveriesPerMonth = isDaily ? 30 : 15;
  const packageName = isDaily
    ? "Monthly Daily Delivery"
    : "Monthly Alternate-Day Delivery";
  const deliveryFrequency = isDaily ? "Every day" : "Every two days";
  const perDeliveryAmountPaise =
    subscription.unitPricePaise * subscription.quantityPerDelivery;
  const estimatedMonthlyAmountPaise =
    perDeliveryAmountPaise * deliveriesPerMonth;
  const nextOccurrence = subscription.occurrences[0];
  const nextOccurrenceStatus = nextOccurrence?.status;
  const nextDriver = nextOccurrence?.order?.delivery?.driver;

  const actions: Array<{
    label: string;
    status: "ACTIVE" | "PAUSED" | "CANCELLED";
    icon: ReactNode;
    style: string;
  }> = [];
  if (subscription.status === "ACTIVE") {
    actions.push({
      label: "Pause",
      status: "PAUSED",
      icon: <Pause size={16} />,
      style: "border-slate-200 text-slate-700 hover:bg-slate-50",
    });
  }
  if (subscription.status === "PAUSED") {
    actions.push({
      label: "Resume",
      status: "ACTIVE",
      icon: <Play size={16} />,
      style: "border-blue-200 text-blue-700 hover:bg-blue-50",
    });
  }
  if (canManage) {
    actions.push({
      label: "Cancel",
      status: "CANCELLED",
      icon: <X size={16} />,
      style: "border-rose-200 text-rose-700 hover:bg-rose-50",
    });
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="bg-gradient-to-r from-[#0B1F3A] via-blue-800 to-cyan-600 p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
              <Package size={23} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">
                {packageName}
              </p>
              <h2 className="mt-1 text-xl font-extrabold">{subscription.product.name}</h2>
              <p className="mt-1 text-sm text-blue-100">
                {subscription.quantityPerDelivery} × {subscription.product.bottleSizeLiters} L per delivery
              </p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${statusClass[subscription.status]}`}>
            {subscription.status}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold text-blue-100">Next schedule entry</p>
            <p className="mt-1 flex items-center gap-2 text-base font-extrabold">
              <CalendarDays size={17} />
              {isActive && nextOccurrence
                ? new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(nextOccurrence.scheduledAt))
                : isActive
                  ? "No generated delivery in the next 7 days"
                  : "Not scheduled"}
            </p>
            {isActive && nextOccurrenceStatus === "FAILED" && (
              <p className="mt-1 text-xs font-bold text-rose-100">
                Scheduling issue — see details below
              </p>
            )}
            {isActive && nextOccurrenceStatus === "PENDING" && (
              <p className="mt-1 text-xs font-semibold text-blue-100">
                Not confirmed until its order and delivery are created
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-xs font-semibold text-blue-100">Estimated monthly cost</p>
            <p className="mt-1 text-base font-extrabold">
              {formatPrice(estimatedMonthlyAmountPaise)}
              <span className="ml-1 text-xs font-semibold text-blue-100">/ 30 days</span>
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="mt-0.5 shrink-0 text-blue-700" />
            <div>
              <p className="font-bold text-slate-800">{subscription.address.label || "Delivery address"}</p>
              <p className="mt-1 leading-5 text-slate-500">
                {subscription.address.addressLine1}
                {subscription.address.addressLine2 ? `, ${subscription.address.addressLine2}` : ""}
                {`, ${subscription.address.city}, ${subscription.address.state} ${subscription.address.postalCode}`}
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing estimate</p>
            <p className="mt-1 font-bold text-slate-800">
              {formatPrice(perDeliveryAmountPaise)} per delivery
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {deliveriesPerMonth} estimated deliveries per 30 days · {timeLabels[subscription.deliveryTimePreference]} preference
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={expanded}
          className="mt-5 text-sm font-bold text-blue-700 transition hover:text-blue-900"
        >
          {expanded ? "Hide details" : "View subscription details"}
        </button>

        {expanded && (
          <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
            <div className="space-y-3 text-sm">
              <Detail label="Start date" value={displayDate(subscription.startDate)} />
              <Detail label="Subscription period ends" value={subscription.endDate ? displayDate(subscription.endDate) : "Not set"} />
              <Detail label="Delivery frequency" value={deliveryFrequency} />
              <Detail label="Bottle unit price" value={formatPrice(subscription.unitPricePaise)} />
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Estimates use the product price recorded when this subscription was created. No recurring payment is collected by AquaTrail yet.
              </p>
            </div>
            <DeliverySchedule
              occurrences={subscription.occurrences}
              active={isActive}
            />
            {isActive && (
              <p className="rounded-xl bg-sky-50 p-3 text-sm text-slate-700 lg:col-span-2">
                {nextDriver
                  ? `Assigned driver: ${nextDriver.user.name}${nextDriver.user.phone ? ` · ${nextDriver.user.phone}` : ""}`
                  : "Driver assignment is pending until the owner assigns a driver."}
              </p>
            )}
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {actions.map((action) => (
              <button
                key={action.status}
                type="button"
                disabled={busy}
                onClick={() => onAction(action.status)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${action.style}`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}
