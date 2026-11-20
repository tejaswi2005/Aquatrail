import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarDays, LoaderCircle, MapPin, Phone } from "lucide-react";
import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";

type DeliveryStatus = "PENDING" | "STARTED" | "COMPLETED" | "CANCELLED";
type Filter = "ALL" | "TODAY" | DeliveryStatus;

type OwnerOrder = {
  id: string;
  orderNumber: string;
  status: DeliveryStatus;
  createdAt: string;
  totalAmountPaise: number;
  customer: {
    user: { name: string; phone: string | null };
  };
  address: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  items: Array<{
    quantity: number;
    product: { name: string; bottleSizeLiters: number };
  }>;
  subscriptionOccurrence: { scheduledAt: string } | null;
  delivery: {
    status: DeliveryStatus;
    startedAt: string | null;
    completedAt: string | null;
    cancellationReason: string | null;
    driver: { user: { name: string; phone: string | null } } | null;
  } | null;
};

function getErrorMessage(error: unknown): string {
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
  return error instanceof Error ? error.message : "Unable to load deliveries.";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not scheduled"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function OwnerOrders() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api
      .get<{ success: boolean; data: OwnerOrder[] }>("/orders")
      .then((response) => {
        if (!Array.isArray(response.data.data)) {
          throw new Error("The order response was incomplete.");
        }
        if (active) setOrders(response.data.data);
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((order) => {
      const status = order.delivery?.status ?? order.status;
      if (filter === "ALL") return true;
      if (filter === "TODAY") {
        const scheduled = order.subscriptionOccurrence?.scheduledAt;
        return scheduled ? new Date(scheduled).toDateString() === today : false;
      }
      return status === filter;
    });
  }, [filter, orders]);

  return (
    <main className="at-page">
      <header className="at-page-heading">
        <div>
          <p className="at-eyebrow">Owner workspace</p>
          <h1>Daily deliveries</h1>
          <p>Generated subscription orders and their delivery history.</p>
        </div>
        <Link className="at-button-secondary" to="/owner/dashboard">
          Back to home
        </Link>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Filter deliveries">
        {(
          [
            ["ALL", "All"],
            ["TODAY", "Today"],
            ["PENDING", "Pending"],
            ["STARTED", "Started"],
            ["COMPLETED", "Completed"],
            ["CANCELLED", "Cancelled"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "at-button-primary" : "at-button-secondary"}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="at-alert at-alert-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="at-loading" role="status">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Loading deliveries…
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="at-empty-state">
          <CalendarDays size={28} aria-hidden="true" />
          <h2>No deliveries found</h2>
          <p>Generated subscription deliveries will appear here.</p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Delivery records">
          {visibleOrders.map((order) => {
            const deliveryStatus = order.delivery?.status ?? order.status;
            return (
              <article className="at-card space-y-4" key={order.id}>
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <p className="at-eyebrow">Order #{order.orderNumber}</p>
                    <h2 className="mt-1 text-lg font-bold">
                      {order.customer.user.name}
                    </h2>
                    {order.customer.user.phone && (
                      <a
                        className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700"
                        href={`tel:${order.customer.user.phone}`}
                      >
                        <Phone size={14} aria-hidden="true" />
                        {order.customer.user.phone}
                      </a>
                    )}
                  </div>
                  <StatusBadge status={deliveryStatus} size="compact" />
                </header>

                <p className="text-sm text-slate-600">
                  {formatDate(order.subscriptionOccurrence?.scheduledAt)}
                </p>

                <ul className="space-y-1 text-sm text-slate-700">
                  {order.items.map((item, index) => (
                    <li key={`${order.id}-${index}`}>
                      {item.product.name} · {item.product.bottleSizeLiters} L ×{" "}
                      {item.quantity}
                    </li>
                  ))}
                </ul>

                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="mt-0.5 shrink-0" size={16} aria-hidden />
                  <span>
                    {order.address.addressLine1}
                    {order.address.addressLine2
                      ? `, ${order.address.addressLine2}`
                      : ""}
                    , {order.address.city}, {order.address.state}{" "}
                    {order.address.postalCode}
                  </span>
                </p>

                <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <p>
                    Driver:{" "}
                    {order.delivery?.driver?.user.name ?? "Not assigned"}
                    {order.delivery?.driver?.user.phone
                      ? ` · ${order.delivery.driver.user.phone}`
                      : ""}
                  </p>
                  {order.delivery?.cancellationReason && (
                    <p className="mt-1 text-rose-700">
                      Cancellation reason: {order.delivery.cancellationReason}
                    </p>
                  )}
                  {order.delivery?.completedAt && (
                    <p className="mt-1">
                      Completed: {formatDate(order.delivery.completedAt)}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
