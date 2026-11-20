import { AlertCircle, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";

export interface ScheduledOccurrenceView {
  id: string;
  scheduledAt: string;
  status: "PENDING" | "GENERATED" | "FAILED" | "CANCELLED";
  failureReason?: string | null;
  order?: {
    orderNumber: string;
    status: string;
    delivery?: {
      status: string;
      driverId: string | null;
      driver?: { user: { name: string; phone: string | null } } | null;
    } | null;
  } | null;
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

const occurrenceStatus = {
  GENERATED: {
    label: "Delivery created",
    className: "bg-emerald-100 text-emerald-800",
  },
  PENDING: {
    label: "Scheduling",
    className: "bg-blue-100 text-blue-800",
  },
  FAILED: {
    label: "Needs attention",
    className: "bg-rose-100 text-rose-800",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-slate-100 text-slate-600",
  },
} satisfies Record<
  ScheduledOccurrenceView["status"],
  { label: string; className: string }
>;

export default function DeliverySchedule({
  occurrences,
  active,
}: {
  occurrences: ScheduledOccurrenceView[];
  active: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-2 text-slate-900">
        <CalendarDays size={18} className="text-blue-700" />
        <h3 className="font-bold">Upcoming deliveries</h3>
      </div>
      {!active ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">
          <Clock3 size={16} className="mt-1 shrink-0 text-slate-500" />
          No new deliveries are generated while this subscription is paused or inactive.
        </p>
      ) : occurrences.length === 0 ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">
          <Clock3 size={16} className="mt-1 shrink-0 text-slate-500" />
          No deliveries have been generated in the current scheduling window yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {occurrences.map((occurrence) => {
            const status = occurrenceStatus[occurrence.status];
            const generated =
              occurrence.status === "GENERATED" && Boolean(occurrence.order);

            return (
              <li
                key={occurrence.id}
                className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200/70"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  {occurrence.status === "FAILED" ? (
                    <AlertCircle size={16} />
                  ) : generated ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Clock3 size={16} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">
                    {formatDateTime(occurrence.scheduledAt)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                    {generated && occurrence.order && (
                      <span className="text-xs text-slate-500">
                        Order {occurrence.order.orderNumber}
                        {occurrence.order.delivery?.status
                          ? ` · ${occurrence.order.delivery.status.replaceAll("_", " ").toLowerCase()}`
                          : ""}
                      </span>
                    )}
                  </div>
                  {generated && occurrence.order?.delivery && (
                    <p className="mt-2 text-xs text-slate-600">
                      {occurrence.order.delivery.driverId && occurrence.order.delivery.driver
                        ? `Driver: ${occurrence.order.delivery.driver.user.name}${occurrence.order.delivery.driver.user.phone ? ` · ${occurrence.order.delivery.driver.user.phone}` : ""}`
                        : "Driver assignment pending"}
                    </p>
                  )}
                  {occurrence.status === "FAILED" && occurrence.failureReason && (
                    <p className="mt-2 text-xs leading-5 text-rose-700">
                      {occurrence.failureReason}
                    </p>
                  )}
                  {occurrence.status === "PENDING" && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      The order and delivery have not been confirmed yet.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Only generated orders with a delivery record are confirmed. Future occurrences are maintained within a rolling schedule.
      </p>
    </section>
  );
}
