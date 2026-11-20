
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Droplets,
  MapPin,
  Package,
  Truck,
} from "lucide-react";
import { api } from "../../services/api";

interface OrderItem {
  id: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
  product: {
    name: string;
    bottleSizeLiters?: number;
  };
}

interface OrderDetails {
  id: string;
  orderNumber: string;
  status: string;
  totalAmountPaise: number;
  createdAt: string;
  subscriptionOccurrence?: { scheduledAt: string } | null;
  notes?: string | null;
  address?: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode: string;
  } | null;
  items: OrderItem[];
  delivery?: {
    id: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    cancellationReason?: string | null;
    driver?: { user: { name: string; phone: string | null } } | null;
  } | null;
}

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

export default function CustomerOrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrder() {
      if (!orderId) {
        setError("Order ID is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await api.get(
          `/orders/${encodeURIComponent(orderId)}`
        );

        if (!active) return;

        const details = response.data?.data as
          | OrderDetails
          | undefined;

        if (!details) {
          throw new Error("Order details were not returned.");
        }

        setOrder(details);
      } catch (err: unknown) {
        if (!active) return;

        const responseMessage =
          typeof err === "object" &&
          err !== null &&
          "response" in err
            ? (
                err as {
                  response?: {
                    data?: { message?: string };
                  };
                }
              ).response?.data?.message
            : undefined;

        setError(
          responseMessage ||
            (err instanceof Error
              ? err.message
              : "Unable to load order details.")
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOrder();

    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/customer/dashboard"
            className="flex items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
              <Droplets size={23} />
            </span>
            <span className="text-lg font-extrabold">
              Aqua<span className="text-blue-600">Trail</span>
            </span>
          </Link>

          <Link
            to="/customer/orders"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-sky-50"
          >
            <ArrowLeft size={17} />
            Back to orders
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            Loading order details...
          </section>
        ) : error || !order ? (
          <section className="rounded-2xl border border-red-200 bg-white p-6">
            <h1 className="text-xl font-bold">
              Unable to load order
            </h1>
            <p className="mt-2 text-red-600">
              {error || "Order not found."}
            </p>
            <Link
              to="/customer/orders"
              className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
            >
              Back to my orders
            </Link>
          </section>
        ) : (
          <>
            <section className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                Order details
              </p>
              <h1 className="mt-2 text-3xl font-extrabold">
                Order #{order.orderNumber}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays size={16} />
                  {new Date(order.createdAt).toLocaleDateString(
                    "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </span>
                {order.subscriptionOccurrence && (
                  <span>
                    Scheduled{" "}
                    {new Date(order.subscriptionOccurrence.scheduledAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
                <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-blue-700">
                  {order.status.replaceAll("_", " ")}
                </span>
              </div>
            </section>

            <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Package size={20} className="text-blue-600" />
                Items ordered
              </h2>

              {order.items?.length ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {item.product.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Quantity: {item.quantity}
                        </p>
                        <p className="text-sm text-slate-500">
                          Unit price: {formatPrice(item.unitPricePaise)}
                        </p>
                      </div>
                      <p className="font-bold">
                        {formatPrice(item.subtotalPaise)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  No item details were returned for this order.
                </p>
              )}

              <div className="mt-4 flex justify-between border-t border-slate-200 pt-4">
                <span className="font-semibold">Order total</span>
                <span className="text-xl font-extrabold">
                  {formatPrice(order.totalAmountPaise)}
                </span>
              </div>

              {order.notes && (
                <p className="mt-4 text-sm text-slate-600">
                  <strong>Order notes:</strong> {order.notes}
                </p>
              )}
            </section>

            {order.address && (
              <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="flex items-center gap-2 font-bold">
                  <MapPin size={20} className="text-blue-600" />
                  Delivery address
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {[
                    order.address.addressLine1,
                    order.address.addressLine2,
                    order.address.city,
                    order.address.state,
                    order.address.postalCode,
                  ].filter(Boolean).join(", ")}
                </p>
              </section>
            )}

            {order.delivery && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="flex items-center gap-2 font-bold">
                  <Truck size={20} className="text-blue-600" />
                  Delivery
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Status: {order.delivery.status.replaceAll("_", " ")}
                </p>
                {order.delivery.driver && (
                  <p className="mt-2 text-sm text-slate-700">
                    Driver: {order.delivery.driver.user.name}
                    {order.delivery.driver.user.phone ? ` · ${order.delivery.driver.user.phone}` : ""}
                  </p>
                )}
                {order.delivery.completedAt && (
                  <p className="mt-2 text-sm text-emerald-700">
                    Completed {new Date(order.delivery.completedAt).toLocaleString("en-IN")}
                  </p>
                )}
                {order.delivery.cancellationReason && (
                  <p className="mt-2 text-sm text-rose-700">
                    Cancellation reason: {order.delivery.cancellationReason}
                  </p>
                )}

                {order.delivery.status === "STARTED" && (
                  <Link
                    to={`/customer/track/${order.delivery.id}`}
                    className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 font-bold text-white"
                  >
                    Track delivery
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
