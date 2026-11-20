import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Droplets,
    Package,
    RefreshCw,
    ShoppingBag,
    Truck,
    XCircle,
} from "lucide-react";

import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";

interface Delivery {
    id: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    cancellationReason?: string | null;
    driver?: { user: { name: string; phone: string | null } } | null;
}

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountPaise: number;
    createdAt: string;
    subscriptionOccurrence?: { scheduledAt: string } | null;
    delivery?: Delivery | null;
}

const ORDER_STATUSES = [
    "PENDING",
    "STARTED",
    "COMPLETED",
    "CANCELLED",
] as const;

const ACTIVE_ORDER_STATUSES = new Set<string>([
    "PENDING",
    "STARTED",
]);

const formatPrice = (amountPaise: number) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(amountPaise / 100);

const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

function getStatusLabel(status: string) {
    return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) =>
        char.toUpperCase()
    );
}

export default function CustomerOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("ALL");

    const loadOrders = useCallback(async () => {
        try {
            const response = await api.get("/orders/my");

            const result = response.data?.data;
            setOrders(Array.isArray(result) ? result : []);
        } catch (err: unknown) {
            const message =
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

            setError(message || "Unable to load your orders. Please try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;

        async function fetchOrders() {
            try {
                const response = await api.get("/orders/my");

                if (!active) return;

                const result = response.data?.data;
                setOrders(Array.isArray(result) ? result : []);
            } catch (err: unknown) {
                if (!active) return;

                const message =
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

                setError(message || "Unable to load your orders. Please try again.");
            } finally {
                if (active) setLoading(false);
            }
        }

        void fetchOrders();

        return () => {
            active = false;
        };
    }, []);

    function refreshOrders() {
        setLoading(true);
        setError("");
        void loadOrders();
    }

    const filteredOrders =
        filter === "ALL"
            ? orders
            : orders.filter(
                (order) =>
                    (order.delivery?.status ?? order.status).toUpperCase() === filter
            );

    const activeCount = orders.filter((order) =>
        ACTIVE_ORDER_STATUSES.has(
            (order.delivery?.status ?? order.status).toUpperCase()
        )
    ).length;

    const deliveredCount = orders.filter(
        (order) =>
            (order.delivery?.status ?? order.status).toUpperCase() === "COMPLETED"
    ).length;

    const cancelledCount = orders.filter(
        (order) =>
            (order.delivery?.status ?? order.status).toUpperCase() === "CANCELLED"
    ).length;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                    <Link to="/customer/dashboard" className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/20">
                            <Droplets size={23} />
                        </span>

                        <span>
                            <span className="block text-lg font-extrabold tracking-tight">
                                Aqua<span className="text-blue-600">Trail</span>
                            </span>
                            <span className="block text-xs text-slate-500">
                                Water delivery made simple
                            </span>
                        </span>
                    </Link>

                    <div className="flex items-center gap-2">
                        <Link
                            to="/customer/subscriptions"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
                        >
                            Subscriptions
                        </Link>
                        <Link
                            to="/customer/profile"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
                        >
                            My Profile
                        </Link>

                        <button
                            onClick={refreshOrders}
                            disabled={loading}
                            aria-label="Refresh orders"
                            className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-sky-50 disabled:opacity-50"
                        >
                            <RefreshCw
                                size={18}
                                className={loading ? "animate-spin" : ""}
                            />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <Link
                    to="/customer/dashboard"
                    className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
                >
                    <ArrowLeft size={16} />
                    Back to Dashboard
                </Link>

                {/* Page heading */}
                <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
                            <ShoppingBag size={14} />
                            Order Management
                        </div>

                        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                            My Orders
                        </h1>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                            View your water orders, check delivery progress, and review your
                            order history in one place.
                        </p>
                    </div>

                    <Link
                        to="/customer/order-types"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:shadow-xl"
                    >
                        <ShoppingBag size={18} />
                        Start a subscription
                        <ArrowRight size={17} />
                    </Link>
                </section>

                {/* Summary cards */}
                <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        title="Total Orders"
                        value={orders.length}
                        icon={<Package size={21} />}
                        iconStyle="bg-blue-50 text-blue-600"
                    />

                    <SummaryCard
                        title="Active Orders"
                        value={activeCount}
                        icon={<Clock3 size={21} />}
                        iconStyle="bg-amber-50 text-amber-600"
                    />

                    <SummaryCard
                        title="Delivered"
                        value={deliveredCount}
                        icon={<CheckCircle2 size={21} />}
                        iconStyle="bg-emerald-50 text-emerald-600"
                    />

                    <SummaryCard
                        title="Cancelled"
                        value={cancelledCount}
                        icon={<XCircle size={21} />}
                        iconStyle="bg-red-50 text-red-600"
                    />
                </section>

                {/* Orders list */}
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold">Order History</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {filteredOrders.length} order
                                    {filteredOrders.length === 1 ? "" : "s"} found
                                </p>
                            </div>

                            <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
                                {["ALL", ...ORDER_STATUSES].map(
                                    (status) => (
                                        <button
                                            key={status}
                                            onClick={() => setFilter(status)}
                                            className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition ${filter === status
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-sky-50"
                                                }`}
                                        >
                                            {status === "ALL" ? "All Orders" : getStatusLabel(status)}
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center px-6 py-20">
                            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                            <p className="text-sm font-medium text-slate-500">
                                Loading your orders...
                            </p>
                        </div>
                    ) : error ? (
                        <div className="px-6 py-16 text-center">
                            <p className="font-semibold text-red-600">{error}</p>
                            <button
                                onClick={refreshOrders}
                                className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-blue-600">
                                <Package size={30} />
                            </span>

                            <h3 className="text-lg font-bold">
                                {orders.length === 0 ? "No orders yet" : "No matching orders"}
                            </h3>

                            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                                {orders.length === 0
                                    ? "Your orders will appear here when you place your first water delivery order."
                                    : "Try selecting a different order status."}
                            </p>

                            {orders.length === 0 && (
                                <Link
                                    to="/customer/order-types"
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                                >
                                    Browse Products
                                    <ArrowRight size={17} />
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredOrders.map((order) => (
                                <article
                                    key={order.id}
                                    className="p-5 transition hover:bg-slate-50/70 sm:p-6"
                                >
                                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="flex items-start gap-4">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600">
                                                <Package size={23} />
                                            </span>

                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-bold">
                                                        Order #{order.orderNumber}
                                                    </h3>

                                                    <StatusBadge status={order.status} size="compact" />
                                                </div>

                                                <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                                                    <CalendarDays size={15} />
                                                    {order.subscriptionOccurrence
                                                        ? `Scheduled ${formatDate(order.subscriptionOccurrence.scheduledAt)}`
                                                        : `Placed ${formatDate(order.createdAt)}`}
                                                </p>
                                                {order.delivery?.driver && (
                                                    <p className="mt-2 text-sm text-slate-600">
                                                        Driver: {order.delivery.driver.user.name}
                                                        {order.delivery.driver.user.phone ? ` · ${order.delivery.driver.user.phone}` : ""}
                                                    </p>
                                                )}
                                                {order.delivery?.completedAt && (
                                                    <p className="mt-1 text-xs text-emerald-700">
                                                        Completed {formatDate(order.delivery.completedAt)}
                                                    </p>
                                                )}
                                                {order.delivery?.status === "CANCELLED" && order.delivery.cancellationReason && (
                                                    <p className="mt-1 text-xs text-rose-700">
                                                        Cancellation reason: {order.delivery.cancellationReason}
                                                    </p>
                                                )}

                                                <p className="mt-2 text-lg font-extrabold text-slate-900">
                                                    {formatPrice(order.totalAmountPaise)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-3 lg:justify-end">
                                            {order.delivery?.id &&
                                                !["COMPLETED", "CANCELLED"].includes(
                                                    (order.delivery?.status ?? order.status).toUpperCase()
                                                ) && (
                                                    <Link
                                                        to={`/customer/track/${order.delivery.id}`}
                                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                                                    >
                                                        <Truck size={17} />
                                                        Track Delivery
                                                    </Link>
                                                )}

                                            <Link
                                                to={`/customer/orders/${order.id}`}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-sky-50"
                                            >
                                                View Order Details 
                                                <ArrowRight size={16} />
                                            </Link>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                {/* Help banner */}
                <section className="mt-8 flex flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-8 text-center text-white shadow-xl shadow-blue-900/10 sm:p-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                        <Droplets size={30} />
                    </div>

                    <div className="max-w-2xl">
                        <h2 className="text-xl font-extrabold sm:text-2xl">
                            Your Water Delivery, Made Simple
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-blue-50 sm:text-base">
                            Track your deliveries in real time, monitor order status, and stay
                            updated!
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}

interface SummaryCardProps {
    title: string;
    value: number;
    icon: React.ReactNode;
    iconStyle: string;
}

function SummaryCard({
    title,
    value,
    icon,
    iconStyle,
}: SummaryCardProps) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">{title}</p>
                <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconStyle}`}
                >
                    {icon}
                </span>
            </div>

            <p className="mt-4 text-3xl font-extrabold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-slate-400">Updated from your orders</p>
        </div>
    );
}