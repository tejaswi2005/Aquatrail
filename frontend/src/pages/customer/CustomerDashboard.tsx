import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Droplets,
  LogOut,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Truck,
  UserRound,
  Waves,
} from "lucide-react";

import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";
import { clearSession, getSessionUser } from "../../services/auth";
import type { SubscriptionView } from "../../components/customer/SubscriptionSummary";

// --------------------------------------------------
// Types
// --------------------------------------------------

interface Product {
  id: string;
  name: string;
  description: string | null;
  bottleSizeLiters: number;
  pricePaise: number;
  stockQuantity: number;
  imageUrl?: string | null;
  isActive?: boolean;
}

interface Delivery {
  id: string;
  status: string;
  driver?: { user: { name: string; phone: string | null } } | null;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmountPaise: number;
  createdAt: string;
  delivery: Delivery | null;
  subscriptionOccurrence?: { scheduledAt: string } | null;
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function formatPrice(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatDate(date: string): string {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isActiveOrder(status: string): boolean {
  return ["PENDING", "STARTED"].includes(status.toUpperCase());
}

function canTrackDelivery(delivery: Delivery | null): delivery is Delivery {
  return Boolean(delivery && delivery.status === "STARTED");
}

async function fetchDashboardData() {
  const [productResponse, orderResponse, subscriptionResponse] = await Promise.all([
    api.get("/products"),
    api.get("/orders/my"),
    api.get("/subscriptions/my"),
  ]);
  return {
    products: extractArray<Product>(productResponse.data, "products"),
    orders: extractArray<CustomerOrder>(orderResponse.data, "orders"),
    subscriptions: extractArray<SubscriptionView>(subscriptionResponse.data, "subscriptions"),
  };
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const apiError = error as {
      response?: {
        data?: {
          message?: string;
        };
      };
    };

    if (apiError.response?.data?.message) {
      return apiError.response.data.message;
    }
  }

  return "We couldn't load your dashboard. Please try again.";
}

function extractArray<T>(
  responseData: unknown,
  nestedKey: string
): T[] {
  if (Array.isArray(responseData)) {
    return responseData as T[];
  }

  if (typeof responseData !== "object" || responseData === null) {
    return [];
  }

  const data = responseData as Record<string, unknown>;

  // Standard API response: { success: true, data: [...] }
  if (Array.isArray(data.data)) {
    return data.data as T[];
  }

  // Alternative response: { data: { products: [...] } }
  if (
    typeof data.data === "object" &&
    data.data !== null &&
    !Array.isArray(data.data)
  ) {
    const nestedData = data.data as Record<string, unknown>;

    if (Array.isArray(nestedData[nestedKey])) {
      return nestedData[nestedKey] as T[];
    }
  }

  // Alternative response: { products: [...] }
  if (Array.isArray(data[nestedKey])) {
    return data[nestedKey] as T[];
  }

  return [];
}

// --------------------------------------------------
// Customer Dashboard
// --------------------------------------------------

export default function CustomerDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const data = await fetchDashboardData();
      setProducts(data.products);
      setOrders(data.orders);
      setSubscriptions(data.subscriptions);
      setError("");
    } catch (err: unknown) {
      console.error("Failed to load customer dashboard:", err);

      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchInitialDashboard() {
      try {
        const data = await fetchDashboardData();
        if (!active) return;
        setProducts(data.products);
        setOrders(data.orders);
        setSubscriptions(data.subscriptions);
        setError("");
      } catch (err: unknown) {
        if (active) {
          console.error("Failed to load customer dashboard:", err);
          setError(getErrorMessage(err));
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void fetchInitialDashboard();
    return () => {
      active = false;
    };
  }, []);

  function refreshDashboard() {
    setError("");
    setRefreshing(true);
    void loadDashboard();
  }

  // --------------------------------------------------
  // Dashboard data
  // --------------------------------------------------

  const activeOrders = orders.filter((order) =>
    isActiveOrder(order.status)
  );

  const activeDeliveries = activeOrders.filter(
    (order) => order.delivery !== null
  );
  const activeSubscription = subscriptions.find(
    (subscription) => subscription.status === "ACTIVE"
  );
  const firstName = getSessionUser()?.name.trim().split(/\s+/)[0] || "there";

  const availableProducts = products.filter(
    (product) =>
      product.stockQuantity > 0 &&
      product.isActive !== false
  );

  const latestOrders = [...orders]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    )
    .slice(0, 4);

  function handleLogout() {
    clearSession();
    window.location.assign("/login");
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            to="/customer/dashboard"
            className="flex items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-200">
              <Droplets size={25} />
            </span>

            <span>
              <span className="block text-xl font-extrabold tracking-tight">
                Aqua<span className="text-blue-600">Trail</span>
              </span>

              <span className="hidden text-xs text-slate-400 sm:block">
                Water delivery, simplified
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={refreshing || loading}
              aria-label="Refresh dashboard"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
            >
              <RefreshCw
                size={18}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>

            <Link
              to="/customer/profile"
              aria-label="View your profile"
              title="My Profile"
              className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 transition hover:border-blue-200 hover:bg-sky-50 sm:px-3 sm:py-2"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm transition group-hover:scale-105">
                <UserRound size={19} />
              </span>

              <span className="hidden text-sm font-semibold text-slate-700 sm:block">
                My Profile
              </span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-sky-50 hover:text-blue-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Welcome */}
        <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600">
              <Waves size={17} />
              YOUR WATER, YOUR WAY
            </p>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Welcome, {firstName}
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
              Manage your subscription, deliveries, and driver tracking
              from one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/customer/subscriptions"
              className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              Manage subscriptions
            </Link>
            <Link
              to="/customer/order-types"
              className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              <Plus size={18} />
              Choose a subscription
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3 text-sm text-red-700">
              <AlertCircle size={20} className="shrink-0" />
              {error}
            </div>

            <button
              type="button"
              onClick={refreshDashboard}
              className="w-fit rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        {/* Hero banner */}
        <section className="relative mb-7 overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-xl shadow-blue-200/50 sm:p-9 lg:p-10">
          <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border-[35px] border-white/10" />

          <div className="pointer-events-none absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />

          <div className="relative z-10 grid items-center gap-7 md:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold">
                <Droplets size={15} />
                PURE WATER. RELIABLE DELIVERY.
              </span>

              <h2 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
                Pure water.
                <br className="hidden sm:block" />
                Closer to you.
              </h2>

              <p className="mt-4 max-w-lg text-sm leading-6 text-blue-50 sm:text-base">
                Your next water delivery is just a few clicks away.
                Browse available bottles and let us bring them to your
                doorstep.
              </p>
            </div>

            <div className="hidden h-36 w-36 items-center justify-center rounded-[2rem] border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm md:flex lg:h-44 lg:w-44">
              <Droplets
                size={100}
                strokeWidth={1.1}
                className="text-white drop-shadow-lg"
              />
            </div>
          </div>
        </section>

        {/* Statistics */}
        <section className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<ShoppingBag size={22} />}
            label="Total orders"
            value={loading ? "—" : String(orders.length)}
            description="Your order history"
            iconClass="bg-blue-50 text-blue-600"
          />

          <StatCard
            icon={<Truck size={22} />}
            label="Active deliveries"
            value={loading ? "—" : String(activeDeliveries.length)}
            description="Orders being delivered"
            iconClass="bg-cyan-50 text-cyan-600"
          />

          <StatCard
            icon={<CalendarDays size={22} />}
            label="Active subscriptions"
            value={loading ? "—" : String(subscriptions.filter((subscription) => subscription.status === "ACTIVE").length)}
            description="Manage your delivery plans"
            iconClass="bg-emerald-50 text-emerald-600"
          />
        </section>

        <section className="mb-9">
          <SectionHeading
            title="Your subscription"
            subtitle="Plan details and the next scheduled delivery."
            action={
              <Link to="/customer/subscriptions" className="text-sm font-bold text-blue-700 hover:text-blue-900">
                View subscriptions
              </Link>
            }
          />
          {loading ? (
            <LoadingCard />
          ) : activeSubscription ? (
            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    {activeSubscription.packageType === "DAILY" ? "Monthly Daily Delivery" : "Monthly Alternate-Day Delivery"}
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-900">
                    {activeSubscription.product.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeSubscription.quantityPerDelivery} bottles per delivery · {activeSubscription.packageType === "DAILY" ? "Every day" : "Every two days"}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-slate-500">Estimated 30-day subscription price</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-900">
                    {formatPrice(
                      activeSubscription.unitPricePaise *
                        activeSubscription.quantityPerDelivery *
                        (activeSubscription.packageType === "DAILY" ? 30 : 15)
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Estimate only; no payment collected</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-600">
                  Next scheduled delivery:{" "}
                  <strong className="text-slate-900">
                    {activeSubscription.occurrences[0]
                      ? formatDate(activeSubscription.occurrences[0].scheduledAt)
                      : formatDate(activeSubscription.nextDeliveryDate)}
                  </strong>
                </p>
                <Link to="/customer/order-types" className="inline-flex items-center gap-2 font-bold text-blue-700 hover:text-blue-900">
                  Change or add plan <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
              <p className="font-bold text-slate-800">No active subscription</p>
              <p className="mt-1 text-sm text-slate-500">Choose daily or alternate-day deliveries to get started.</p>
              <Link to="/customer/order-types" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
                Choose a plan <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>

        {/* Active deliveries */}
        <section className="mb-9">
          <SectionHeading
            title="Your active deliveries"
            subtitle="Follow your orders from preparation to delivery."
          />

          {loading ? (
            <LoadingCard />
          ) : activeOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-blue-600">
                <Truck size={27} />
              </div>

              <h3 className="mt-4 font-bold text-slate-800">
                No active deliveries
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Scheduled subscription deliveries will appear here.
              </p>

              <Link
                to="/customer/order-types"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Choose a subscription
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {activeOrders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-blue-600">
                        <Package size={23} />
                      </div>

                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">Order #{order.orderNumber}</p>

                        <p className="mt-1 text-xs text-slate-500">
                          {order.subscriptionOccurrence
                            ? `Scheduled ${formatDate(order.subscriptionOccurrence.scheduledAt)}`
                            : `Placed ${formatDate(order.createdAt)}`}
                        </p>
                        {order.delivery?.driver && (
                          <p className="mt-1 text-xs text-slate-600">
                            {order.delivery.driver.user.name}
                            {order.delivery.driver.user.phone ? ` · ${order.delivery.driver.user.phone}` : ""}
                          </p>
                        )}
                      </div>
                    </div>

                    <StatusBadge status={order.status} size="compact" />
                  </div>

                  <div className="my-5 flex items-center justify-between border-y border-slate-100 py-4">
                    <div>
                      <p className="text-xs text-slate-500">Order total</p>

                      <p className="mt-1 text-lg font-extrabold text-slate-900">
                        {formatPrice(order.totalAmountPaise)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        Delivery status
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {order.delivery
                          ? statusLabel(order.delivery.status)
                          : "Awaiting assignment"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      to="/customer/orders"
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-sky-50"
                    >
                      View Orders
                      <ArrowRight size={16} />
                    </Link>

                    {canTrackDelivery(order.delivery) && (
                        <Link
                          to={`/customer/track/${order.delivery.id}`}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                        >
                          <MapPin size={17} />
                          Track delivery
                        </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Available products */}
        <section id="available-products" className="mb-9 scroll-mt-24">
          <SectionHeading
            title="Available water"
            subtitle="Choose from the products available at your water shop."
            action={
              <span className="text-xs font-semibold text-slate-400">
                {availableProducts.length} products
              </span>
            }
          />

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : availableProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center">
              <Package size={35} className="mx-auto text-slate-300" />

              <h3 className="mt-3 font-bold text-slate-800">
                No products available
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Please check again later.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableProducts.map((product) => (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-sky-100/70"
                >
                  <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-100">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white/80 text-blue-500 shadow-sm">
                        <Droplets size={62} strokeWidth={1.4} />
                      </div>
                    )}

                    <span className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm">
                      {product.bottleSizeLiters} L bottle
                    </span>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">
                          {product.name}
                        </h3>

                        <p className="mt-1 text-xs text-slate-500">
                          {product.stockQuantity} in stock
                        </p>
                      </div>

                      <span className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-extrabold text-emerald-700">
                        {formatPrice(product.pricePaise)}
                      </span>
                    </div>

                    {product.description && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <CheckCircle2 size={15} />
                        In stock
                      </span>

                      <Link
                        to="/customer/order-types"
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                      >
                        Order
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Recent orders */}
        <section id="recent-orders" className="scroll-mt-24">
          <SectionHeading
            title="Recent orders"
            subtitle="A quick look at your latest orders."
            action={
              <Link
                to="/customer/orders"
                className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                All orders
                <ArrowRight size={16} />
              </Link>
            }
          />

          {loading ? (
            <LoadingCard />
          ) : latestOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-8 text-center">
              <ClipboardList
                size={34}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold text-slate-700">
                Your orders will appear here.
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Place your first order to get started.
              </p>

        
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              {latestOrders.map((order, index) => (
                <div
                  key={order.id}
                  className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
                    index !== 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-blue-600">
                      <ShoppingBag size={20} />
                    </div>

                    <div>
                      <p className="font-bold text-slate-900">
                        Order Created at
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="font-extrabold text-slate-900">
                        {formatPrice(order.totalAmountPaise)}
                      </p>

                      <div className="mt-1">
                        <StatusBadge status={order.status} size="compact" />
                      </div>
                    </div>

                    {canTrackDelivery(order.delivery) && (
                        <Link
                          to={`/customer/track/${order.delivery.id}`}
                          aria-label={`Track order ${order.orderNumber}`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <MapPin size={18} />
                        </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          <p className="flex items-center justify-center gap-2">
            <Droplets size={15} className="text-blue-500" />
            AquaTrail — Water delivery, made simple.
          </p>
        </footer>
      </main>

    </div>
  );
}

// --------------------------------------------------
// Reusable components
// --------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  iconClass: string;
}

function StatCard({
  icon,
  label,
  value,
  description,
  iconClass,
}: StatCardProps) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
            {value}
          </p>

          <p className="mt-2 text-xs text-slate-400">
            {description}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </article>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

function SectionHeading({
  title,
  subtitle,
  action,
}: SectionHeadingProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {subtitle}
        </p>
      </div>

      {action}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-6">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-4 h-3 w-full rounded bg-slate-100" />
      <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
      <div className="mt-5 h-10 rounded-xl bg-slate-100" />
    </div>
  );
}
