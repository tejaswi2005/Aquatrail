import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Droplets,
  RefreshCw,
  Truck,
  XCircle,
} from "lucide-react";
import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";

type OccurrenceFilter =
  | "today"
  | "upcoming"
  | "active"
  | "failed"
  | "pending_assignment"
  | "completed"
  | "cancelled";

interface ScheduledOccurrence {
  id: string;
  scheduledAt: string;
  status: "PENDING" | "GENERATED" | "FAILED" | "CANCELLED";
  failureReason?: string | null;
  subscription: {
    packageType: "DAILY" | "ALTERNATE_DAY";
    quantityPerDelivery: number;
    customer: { user: { name: string } };
    product: { name: string; bottleSizeLiters: number };
    address: {
      label?: string | null;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
      postalCode: string;
    };
  };
  order?: {
    orderNumber: string;
    status: string;
    delivery?: { status: string; driverId: string | null } | null;
  } | null;
}

interface SubscriptionOverview {
  activeSubscriptions: number;
  pausedSubscriptions: number;
  deliveriesGeneratedToday: number;
  upcomingDeliveries: number;
  schedulingFailures: number;
  subscriptionsNeedingAttention: number;
  activeDriverAssignments: number;
  unassignedDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  stockExceptions: number;
}

const filters: Array<{ value: OccurrenceFilter; label: string }> = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming 7 days" },
  { value: "pending_assignment", label: "Unassigned" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "active", label: "Active subscriptions" },
  { value: "failed", label: "Failed scheduling" },
];

function extractData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return null;
  }
  return payload.data as T;
}

function responseMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return error instanceof Error ? error.message : "Unable to load scheduled deliveries.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OwnerScheduledDeliveries() {
  const [filter, setFilter] = useState<OccurrenceFilter>("upcoming");
  const [occurrences, setOccurrences] = useState<ScheduledOccurrence[]>([]);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [occurrenceResponse, overviewResponse] = await Promise.all([
        api.get(`/owner/subscriptions/occurrences?filter=${filter}`),
        api.get("/owner/subscriptions/overview"),
      ]);
      const occurrenceData = extractData<ScheduledOccurrence[]>(occurrenceResponse.data);
      const overviewData = extractData<SubscriptionOverview>(overviewResponse.data);
      if (!occurrenceData || !overviewData) {
        throw new Error("The scheduling response was incomplete.");
      }
      setOccurrences(occurrenceData);
      setOverview(overviewData);
    } catch (loadError: unknown) {
      setError(responseMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function runScheduler() {
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post("/owner/subscriptions/scheduler/run");
      const summary = extractData<{
        generatedDeliveries: number;
        failedOccurrences: number;
      }>(response.data);
      if (!summary) throw new Error("The scheduler response was incomplete.");
      setNotice(
        `Scheduler finished: ${summary.generatedDeliveries} deliveries generated, ${summary.failedOccurrences} scheduling failures.`
      );
      await loadData();
    } catch (runError: unknown) {
      setError(responseMessage(runError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5FAFD] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/owner/dashboard" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-white shadow-lg shadow-blue-700/20">
              <Droplets size={23} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              Aqua<span className="text-blue-600">Trail</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/owner/customers" className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">Customers & drivers</Link>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <Link
          to="/owner/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft size={16} /> Owner dashboard
        </Link>

        <section className="mb-7 flex flex-col justify-between gap-5 rounded-3xl bg-gradient-to-br from-[#0B1F3A] via-blue-900 to-cyan-700 p-6 text-white shadow-xl shadow-blue-900/15 sm:flex-row sm:items-end sm:p-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-50">
              <CalendarDays size={15} /> Subscription operations
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Scheduled deliveries
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Review generated subscription orders, resolve scheduling issues, and assign unassigned deliveries using the existing order workflow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runScheduler()}
            disabled={running}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-blue-900 shadow-sm transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={17} className={running ? "animate-spin" : ""} />
            {running ? "Running scheduler..." : "Run scheduler now"}
          </button>
        </section>

        {overview && (
          <section className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <OverviewCard label="Active subscriptions" value={overview.activeSubscriptions} icon={<CheckCircle2 size={19} />} />
            <OverviewCard label="Paused subscriptions" value={overview.pausedSubscriptions} icon={<Clock3 size={19} />} />
            <OverviewCard label="Scheduled today" value={overview.deliveriesGeneratedToday} icon={<Truck size={19} />} />
            <OverviewCard label="Upcoming, next 7 days" value={overview.upcomingDeliveries} icon={<CalendarDays size={19} />} />
            <OverviewCard label="Active monthly assignments" value={overview.activeDriverAssignments} icon={<Truck size={19} />} />
            <OverviewCard label="Unassigned deliveries" value={overview.unassignedDeliveries} icon={<Clock3 size={19} />} alert={overview.unassignedDeliveries > 0} />
            <OverviewCard label="Completed deliveries" value={overview.completedDeliveries} icon={<CheckCircle2 size={19} />} />
            <OverviewCard label="Cancelled deliveries" value={overview.cancelledDeliveries} icon={<XCircle size={19} />} />
            <OverviewCard label="Stock exceptions" value={overview.stockExceptions} icon={<XCircle size={19} />} alert={overview.stockExceptions > 0} />
            <OverviewCard label="Scheduling failures" value={overview.schedulingFailures} icon={<XCircle size={19} />} alert={overview.schedulingFailures > 0} />
            <OverviewCard label="Subscriptions needing attention" value={overview.subscriptionsNeedingAttention} icon={<Clock3 size={19} />} alert={overview.subscriptionsNeedingAttention > 0} />
          </section>
        )}

        {notice && (
          <div role="status" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => void loadData()} className="rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-rose-200 hover:bg-rose-100">
              Try again
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-lg font-extrabold">Occurrence records</h2>
              <p className="mt-1 text-sm text-slate-500">
                Failed entries remain visible and retry on the next scheduler run.
              </p>
            </div>
            <label className="text-sm font-semibold text-slate-600">
              Filter
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as OccurrenceFilter)}
                className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {filters.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <RefreshCw size={18} className="animate-spin" /> Loading scheduling records...
            </div>
          ) : occurrences.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-bold text-slate-800">No occurrences in this view</p>
              <p className="mt-1 text-sm text-slate-500">Try another filter or run the scheduler again.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">Scheduled</th>
                    <th className="px-5 py-3 font-bold">Customer / package</th>
                    <th className="px-5 py-3 font-bold">Product</th>
                    <th className="px-5 py-3 font-bold">Delivery address</th>
                    <th className="px-5 py-3 font-bold">Order / delivery</th>
                    <th className="px-5 py-3 font-bold">Scheduling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {occurrences.map((occurrence) => {
                    const address = occurrence.subscription.address;
                    return (
                      <tr key={occurrence.id} className="align-top transition hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-800">
                          {formatDateTime(occurrence.scheduledAt)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-800">{occurrence.subscription.customer.user.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {occurrence.subscription.packageType === "DAILY" ? "Daily" : "Alternate-day"} · {occurrence.subscription.quantityPerDelivery} bottles
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-800">{occurrence.subscription.product.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{occurrence.subscription.product.bottleSizeLiters} L bottle</p>
                        </td>
                        <td className="max-w-[240px] px-5 py-4 text-xs leading-5 text-slate-600">
                          {address.label && <span className="font-bold">{address.label}: </span>}
                          {address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.city}, {address.state} {address.postalCode}
                        </td>
                        <td className="px-5 py-4">
                          {occurrence.order ? (
                            <>
                              <p className="text-sm font-bold text-slate-800">#{occurrence.order.orderNumber}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <StatusBadge status={occurrence.order.status} size="compact" />
                                {occurrence.order.delivery && (
                                  <StatusBadge status={occurrence.order.delivery.status} size="compact" />
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">No order generated</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={occurrence.status} size="compact" />
                          {occurrence.failureReason && (
                            <p className="mt-2 max-w-[220px] text-xs leading-5 text-rose-700">{occurrence.failureReason}</p>
                          )}
                          {occurrence.status === "PENDING" && (
                            <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">No delivery is confirmed until the order is generated.</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${alert ? "border-rose-200" : "border-slate-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <span className={`rounded-xl p-2 ${alert ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-700"}`}>{icon}</span>
      </div>
      <p className={`mt-3 text-2xl font-extrabold ${alert ? "text-rose-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
