
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Droplets,
  Home,
  IdCard,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Truck,
  UserRound,
} from "lucide-react";
import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";
import DriverLocationShare from "./DriverLocationShare";

type DeliveryStatus = "PENDING" | "STARTED" | "COMPLETED" | "CANCELLED";
type Tab = "dashboard" | "deliveries" | "tracking" | "profile";
type CancellationReason =
  | "CUSTOMER_UNAVAILABLE"
  | "CUSTOMER_REQUESTED"
  | "ADDRESS_INCORRECT"
  | "PHONE_UNREACHABLE"
  | "OTHER";

type DriverProfile = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: "DRIVER";
  licenseNumber?: string | null;
  isActive: boolean;
  createdAt: string;
};

type DeliveryItem = {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    bottleSizeLiters: number;
  };
};

type Delivery = {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountPaise: number;
    notes?: string | null;
    scheduledAt?: string | null;
    customer: {
      name: string;
      phone?: string | null;
      email?: string | null;
    };
    address: {
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      latitude?: number | null;
      longitude?: number | null;
    };
    items: DeliveryItem[];
  };
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

type UpdateStatus = "STARTED" | "COMPLETED" | "CANCELLED";

const activeStatuses: DeliveryStatus[] = [
  "PENDING",
  "STARTED",
];

function nextAction(status: DeliveryStatus) {
  return status === "PENDING"
    ? { target: "STARTED" as const, label: "Start delivery", icon: Truck }
    : null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (
      error as { response?: { data?: { message?: string } } }
    ).response;

    if (response?.data?.message) {
      return response.data.message;
    }
  }

  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

function getInitials(name?: string) {
  if (!name?.trim()) return "D";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export default function DriverDashboard() {
  const navigate = useNavigate();

  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCancellationFor, setShowCancellationFor] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] =
    useState<CancellationReason | "">("");
  const [otherCancellationReason, setOtherCancellationReason] = useState("");

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [previousTab, setPreviousTab] = useState<Tab>("dashboard");
  const [deliveryFilter, setDeliveryFilter] = useState<
    "ACTIVE" | "TODAY_COMPLETED" | "TODAY_CANCELLED" | "HISTORY"
  >("ACTIVE");

  const loadDashboard = useCallback(async () => {
    try {
      const [deliveryResponse, profileResponse] = await Promise.all([
        api.get<ApiResponse<Delivery[]>>("/drivers/my"),
        api.get<ApiResponse<DriverProfile>>("/drivers/me"),
      ]);

      if (!Array.isArray(deliveryResponse.data.data)) {
        throw new Error("Unexpected deliveries response.");
      }

      setDeliveries(deliveryResponse.data.data);
      setDriver(profileResponse.data.data);
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          "Unable to load your dashboard. Please try again."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchDashboard() {
      try {
        const [deliveryResponse, profileResponse] = await Promise.all([
          api.get<ApiResponse<Delivery[]>>("/drivers/my"),
          api.get<ApiResponse<DriverProfile>>("/drivers/me"),
        ]);

        if (!Array.isArray(deliveryResponse.data.data)) {
          throw new Error("Unexpected deliveries response.");
        }

        if (!active) return;

        setDeliveries(deliveryResponse.data.data);
        setDriver(profileResponse.data.data);
      } catch (err: unknown) {
        if (!active) return;

        setError(
          getErrorMessage(
            err,
            "Unable to load your dashboard. Please try again."
          )
        );
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void fetchDashboard();

    return () => {
      active = false;
    };
  }, []);

  async function refreshDashboard() {
    setError("");
    setRefreshing(true);
    await loadDashboard();
  }

  const updateStatus = async (
    deliveryId: string,
    status: UpdateStatus,
    cancelReason?: CancellationReason
  ) => {
    setUpdatingId(deliveryId);
    setError("");
    setNotice("");

    try {
      const response = await api.patch<
        ApiResponse<{ id: string; status: DeliveryStatus }>
      >(`/drivers/${deliveryId}/status`, {
        status,
        ...(cancelReason ? { cancellationReason: cancelReason } : {}),
        ...(cancelReason === "OTHER"
          ? { otherCancellationReason: otherCancellationReason.trim() }
          : {}),
      });

      setNotice(response.data.message || "Delivery updated successfully.");
      setShowCancellationFor(null);
      setCancellationReason("");
      setOtherCancellationReason("");

      await refreshDashboard();
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "Could not update delivery status.")
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLogout = () => {
    [
      "accessToken",
      "refreshToken",
      "token",
      "user",
      "authUser",
    ].forEach((key) => localStorage.removeItem(key));

    sessionStorage.clear();
    navigate("/login", { replace: true });
  };

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    setProfileMenuOpen(false);
    setProfileDetailsOpen(false);
    setError("");
    setNotice("");
  };

  const openProfileDetails = () => {
    setPreviousTab(activeTab === "profile" ? "dashboard" : activeTab);
    setActiveTab("profile");
    setProfileDetailsOpen(true);
    setProfileMenuOpen(false);
    setError("");
    setNotice("");
  };

  const goBackFromProfile = () => {
    setActiveTab(previousTab);
    setProfileDetailsOpen(false);
    setProfileMenuOpen(false);
  };

  const activeDeliveries = deliveries.filter((delivery) =>
    activeStatuses.includes(delivery.status)
  );

  const today = new Date();
  const todayKey = today.toLocaleDateString();
  const scheduledToday = deliveries.filter(
    (delivery) =>
      new Date(delivery.order.scheduledAt ?? delivery.createdAt).toLocaleDateString() ===
      todayKey
  );
  const upcomingDeliveries = activeDeliveries.filter((delivery) => {
    if (!delivery.order.scheduledAt) return false;
    const scheduledAt = new Date(delivery.order.scheduledAt);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    scheduledAt.setHours(0, 0, 0, 0);
    const daysAhead = (scheduledAt.getTime() - todayStart.getTime()) / 86_400_000;
    return daysAhead > 0 && daysAhead <= 7;
  });
  const completedToday = deliveries.filter(
    (delivery) =>
      delivery.status === "COMPLETED" &&
      delivery.completedAt &&
      new Date(delivery.completedAt).toLocaleDateString() === todayKey
  );
  const cancelledToday = deliveries.filter(
    (delivery) =>
      delivery.status === "CANCELLED" &&
      delivery.cancelledAt &&
      new Date(delivery.cancelledAt).toLocaleDateString() === todayKey
  );
  const visibleDeliveries =
    deliveryFilter === "ACTIVE"
      ? activeDeliveries
      : deliveryFilter === "TODAY_COMPLETED"
        ? completedToday
        : deliveryFilter === "TODAY_CANCELLED"
          ? cancelledToday
          : deliveries.filter((delivery) =>
              ["COMPLETED", "CANCELLED"].includes(delivery.status)
            );

  const navigationItems: {
    id: Tab;
    label: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "deliveries", label: "Deliveries", icon: Truck },
    { id: "tracking", label: "Tracking", icon: MapPin },
    { id: "profile", label: "Profile", icon: UserRound },
  ];
  const deliveryFilters = [
    ["ACTIVE", "Assigned"],
    ["TODAY_COMPLETED", "Completed today"],
    ["TODAY_CANCELLED", "Cancelled today"],
    ["HISTORY", "Past records"],
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(5rem+env(safe-area-inset-bottom))] text-slate-800 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => selectTab("dashboard")}
            className="flex shrink-0 items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white">
              <Droplets size={24} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                AquaTrail
              </h1>
              <p className="text-xs text-slate-500">Driver workspace</p>
            </div>
          </button>

          <nav
            aria-label="Driver primary navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {navigationItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  aria-current={activeTab === item.id ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                    activeTab === item.id
                      ? "bg-sky-50 text-sky-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={loading || refreshing}
              aria-label="Refresh dashboard"
              className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>

            <div className="relative">
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 pr-2.5 hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sm font-extrabold text-sky-700">
                  {getInitials(driver?.name)}
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${
                    profileMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-slate-100 px-3 py-3">
                    <p className="truncate font-bold text-slate-900">
                      {driver?.name || "Driver"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {driver?.email || "Driver account"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openProfileDetails}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700"
                  >
                    <UserRound size={18} />
                    My Profile
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <AlertCircle size={19} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto font-bold"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="ml-auto font-bold"
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        <section
          aria-label="Live delivery tracking"
          className={activeTab === "tracking" ? "space-y-4" : "hidden"}
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-sky-700">
              Live location
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
              Tracking
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Location sharing is available only while a delivery is in progress.
            </p>
          </div>
          {activeDeliveries.filter((delivery) => delivery.status === "STARTED").length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              No active deliveries to track.
            </div>
          ) : (
            activeDeliveries
              .filter((delivery) => delivery.status === "STARTED")
              .map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <h3 className="mb-3 font-bold text-slate-900">
                    {delivery.order.customer.name} · Order #
                    {delivery.order.orderNumber}
                  </h3>
                  <DriverLocationShare deliveryId={delivery.id} />
                </div>
              ))
          )}
        </section>

        {activeTab === "dashboard" && (
          <>
            <section className="rounded-3xl bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-500 p-6 text-white sm:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-bold tracking-widest text-sky-100">
                    DRIVER WORKSPACE
                  </p>
                  <h2 className="mt-2 text-3xl font-extrabold">
                    Welcome{driver?.name ? `, ${driver.name}` : ""}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-sky-50">
                    Manage your assigned water orders and delivery progress.
                  </p>
                </div>

                {driver && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-lg font-extrabold">
                      {getInitials(driver.name)}
                    </span>
                    <div>
                      <p className="font-bold">{driver.name}</p>
                      <p className="text-xs text-sky-100">Driver account</p>
                      <span
                        className="mt-1 inline-flex rounded-full bg-white/20 px-2 py-1 text-xs font-bold"
                      >
                        {driver.isActive ? "ACTIVE ACCOUNT" : "INACTIVE ACCOUNT"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Today's scheduled"
                value={loading ? "—" : scheduledToday.length}
                icon={<Truck size={21} />}
              />
              <SummaryCard
                title="Upcoming · 7 days"
                value={loading ? "—" : upcomingDeliveries.length}
                icon={<CalendarDays size={21} />}
              />
              <SummaryCard
                title="Completed today"
                value={loading ? "—" : completedToday.length}
                icon={<CheckCircle2 size={21} />}
              />
              <SummaryCard
                title="Cancelled today"
                value={loading ? "—" : cancelledToday.length}
                icon={<AlertCircle size={21} />}
              />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Today's deliveries
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Review today's scheduled customer stops.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectTab("deliveries")}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-100"
                >
                  View all <ArrowRight size={16} />
                </button>
              </div>

              {loading ? (
                <LoadingState />
              ) : scheduledToday.length === 0 ? (
                <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                  No deliveries scheduled for today.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {scheduledToday.slice(0, 5).map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4"
                    >
                      <div>
                        <p className="font-bold text-slate-900">
                          {delivery.order.customer.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {delivery.order.items.map((item) =>
                            `${item.product.name} × ${item.quantity}`
                          ).join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {delivery.order.scheduledAt
                            ? formatDate(delivery.order.scheduledAt)
                            : "Time not specified"}
                        </p>
                      </div>
                      <StatusBadge status={delivery.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "deliveries" && (
          <section>
            <div className="mb-5">
              <p className="text-sm font-bold uppercase tracking-widest text-sky-700">
                Delivery management
              </p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                My Deliveries
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Review assigned deliveries and their daily completion history.
              </p>
            </div>

            <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
              {deliveryFilters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setDeliveryFilter(value)
                  }
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold ${
                    deliveryFilter === value
                      ? "bg-blue-700 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <LoadingState />
            ) : visibleDeliveries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No deliveries in this view.
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {visibleDeliveries.map((delivery) => {
                  const action = nextAction(delivery.status);
                  const ActionIcon = action?.icon;
                  const address = delivery.order.address;
                  const isUpdating = updatingId === delivery.id;

                  return (
                    <article
                      key={delivery.id}
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Order
                          </p>
                          <h3 className="mt-1 text-lg font-extrabold text-slate-900">
                            #{delivery.order.orderNumber}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Scheduled{" "}
                            {formatDate(
                              delivery.order.scheduledAt ?? delivery.createdAt
                            )}
                          </p>
                        </div>
                        <StatusBadge status={delivery.status} />
                      </div>

                      <div className="space-y-5 p-5">
                        <div>
                          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Package size={17} className="text-sky-600" />
                            Bottles ordered
                          </p>
                          <div className="space-y-2">
                            {delivery.order.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
                              >
                                <span>
                                  {item.product.name} (
                                  {item.product.bottleSizeLiters} L)
                                </span>
                                <span className="font-bold">
                                  × {item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-sm font-bold text-slate-900">
                            Customer
                          </p>
                          <p className="font-semibold">
                            {delivery.order.customer.name}
                          </p>
                          {delivery.order.customer.phone && (
                            <a
                              href={`tel:${delivery.order.customer.phone}`}
                              className="mt-2 inline-flex items-center gap-2 text-sm text-sky-700 hover:underline"
                            >
                              <Phone size={15} />
                              {delivery.order.customer.phone}
                            </a>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-100 p-4">
                          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                            <MapPin size={17} className="text-sky-600" />
                            Delivery address
                          </p>
                          <p className="text-sm leading-6 text-slate-600">
                            {address.addressLine1}
                            {address.addressLine2
                              ? `, ${address.addressLine2}`
                              : ""}
                            <br />
                            {address.city}, {address.state}{" "}
                            {address.postalCode}
                          </p>

                          {address.latitude != null &&
                            address.longitude != null && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${address.latitude},${address.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline"
                              >
                                Open directions <ArrowRight size={15} />
                              </a>
                            )}
                        </div>

                        {delivery.order.notes && (
                          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                            <strong>Order notes:</strong>{" "}
                            {delivery.order.notes}
                          </div>
                        )}

                        <div className="flex items-start gap-2 text-xs text-slate-500">
                          <Clock size={15} className="mt-0.5 shrink-0" />
                          <div>
                            <p>Started: {formatDate(delivery.startedAt)}</p>
                            <p>Completed: {formatDate(delivery.completedAt)}</p>
                            <p>Cancelled: {formatDate(delivery.cancelledAt)}</p>
                          </div>
                        </div>

                        {delivery.order.scheduledAt && (
                          <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
                            Scheduled: {formatDate(delivery.order.scheduledAt)}
                          </p>
                        )}

                        {action && (
                          <div className="border-t border-slate-100 pt-4">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() =>
                                void updateStatus(delivery.id, action.target)
                              }
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                              {isUpdating ? (
                                <LoaderCircle
                                  size={18}
                                  className="animate-spin"
                                />
                              ) : ActionIcon ? (
                                <ActionIcon size={18} />
                              ) : null}
                              {isUpdating ? "Updating..." : action.label}
                            </button>
                          </div>
                        )}

                        {delivery.status === "STARTED" && (
                          <div className="space-y-3 border-t border-slate-100 pt-4">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Confirm that this delivery has been completed?"
                                  )
                                ) {
                                  void updateStatus(delivery.id, "COMPLETED");
                                }
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {isUpdating ? (
                                <LoaderCircle
                                  size={18}
                                  className="animate-spin"
                                />
                              ) : (
                                <CheckCircle2 size={18} />
                              )}
                              {isUpdating ? "Updating..." : "Mark delivered"}
                            </button>
                          </div>
                        )}

                        {activeStatuses.includes(delivery.status) && (
                          <div className="border-t border-slate-100 pt-4">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => {
                                setShowCancellationFor(
                                  showCancellationFor === delivery.id
                                    ? null
                                    : delivery.id
                                );
                                setCancellationReason("");
                                setOtherCancellationReason("");
                              }}
                              className="w-full rounded-xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              {showCancellationFor === delivery.id
                                ? "Close cancellation"
                                : "Cancel delivery"}
                            </button>
                            {showCancellationFor === delivery.id && (
                              <div className="mt-3 space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                                <label
                                  htmlFor={`cancel-reason-${delivery.id}`}
                                  className="block text-sm font-semibold text-slate-700"
                                >
                                  Cancellation reason
                                </label>
                                <select
                                  id={`cancel-reason-${delivery.id}`}
                                  value={cancellationReason}
                                  onChange={(event) =>
                                    setCancellationReason(
                                      event.target.value as CancellationReason | ""
                                    )
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
                                >
                                  <option value="">Select a reason</option>
                                  <option value="CUSTOMER_UNAVAILABLE">
                                    Customer not available
                                  </option>
                                  <option value="CUSTOMER_REQUESTED">
                                    Customer requested cancellation
                                  </option>
                                  <option value="ADDRESS_INCORRECT">
                                    Address incorrect or not found
                                  </option>
                                  <option value="PHONE_UNREACHABLE">
                                    Customer phone unreachable
                                  </option>
                                  <option value="OTHER">Other</option>
                                </select>
                                {cancellationReason === "OTHER" && (
                                  <label className="block text-sm font-semibold text-slate-700">
                                    Explanation
                                    <textarea
                                      value={otherCancellationReason}
                                      onChange={(event) =>
                                        setOtherCancellationReason(
                                          event.target.value
                                        )
                                      }
                                      maxLength={200}
                                      rows={2}
                                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal"
                                      placeholder="Briefly explain the reason"
                                    />
                                  </label>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    isUpdating ||
                                    !cancellationReason ||
                                    (cancellationReason === "OTHER" &&
                                      otherCancellationReason.trim().length < 3)
                                  }
                                  onClick={() =>
                                    void updateStatus(
                                      delivery.id,
                                      "CANCELLED",
                                      cancellationReason || undefined
                                    )
                                  }
                                  className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {isUpdating
                                    ? "Cancelling..."
                                    : "Confirm cancellation"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {delivery.status === "COMPLETED" && (
                          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 size={18} />
                            Delivery completed successfully.
                          </div>
                        )}

                        {delivery.status === "CANCELLED" && (
                          <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                            This delivery was cancelled{" "}
                            {delivery.cancellationReason
                              ? `— ${delivery.cancellationReason}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "profile" && (
          <section className="mx-auto max-w-3xl">
            <button
              type="button"
              onClick={goBackFromProfile}
              className="mb-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft size={18} />
              Back
            </button>

            {!profileDetailsOpen ? (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-gradient-to-r from-sky-700 to-cyan-500 p-6 text-white">
                  <h2 className="text-2xl font-extrabold">My Profile</h2>
                  <p className="mt-1 text-sm text-sky-100">
                    Manage your account options.
                  </p>
                </div>

                <div className="space-y-2 p-4">
                  <button
                    type="button"
                    onClick={() => setProfileDetailsOpen(true)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-100 p-4 text-left hover:bg-sky-50"
                  >
                    <span className="flex items-center gap-3">
                      <span className="rounded-xl bg-sky-100 p-3 text-sky-700">
                        <UserRound size={20} />
                      </span>
                      <span>
                        <span className="block font-bold text-slate-900">
                          Personal details
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          Name, contact and license
                        </span>
                      </span>
                    </span>
                    <ArrowRight size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 p-4 text-left text-rose-700 hover:bg-rose-50"
                  >
                    <span className="rounded-xl bg-rose-100 p-3">
                      <LogOut size={20} />
                    </span>
                    <span>
                      <span className="block font-bold">Logout</span>
                      <span className="mt-1 block text-sm">
                        Sign out of AquaTrail
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-gradient-to-r from-sky-700 to-cyan-500 p-6 text-white sm:p-8">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/20 text-2xl font-extrabold ring-1 ring-white/30">
                      {getInitials(driver?.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="break-words text-2xl font-extrabold">
                        {driver?.name || "Driver profile"}
                      </h2>
                      <p className="mt-1 text-sm text-sky-100">
                        AquaTrail delivery driver
                      </p>
                      {driver && (
                        <span className="mt-3 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                          {driver.isActive
                            ? "ACTIVE ACCOUNT"
                            : "INACTIVE ACCOUNT"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <LoadingState />
                ) : !driver ? (
                  <div className="p-5 text-sm text-amber-800">
                    Profile details could not be loaded. Check the{" "}
                    <code>/drivers/me</code> endpoint and refresh.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
                      <ProfileField
                        icon={<UserRound size={19} />}
                        label="Full name"
                        value={driver.name}
                      />
                      <ProfileField
                        icon={<Mail size={19} />}
                        label="Email address"
                        value={driver.email}
                      />
                      <ProfileField
                        icon={<Phone size={19} />}
                        label="Phone number"
                        value={driver.phone || "Not provided"}
                      />
                      <ProfileField
                        icon={<IdCard size={19} />}
                        label="License number"
                        value={driver.licenseNumber || "Not provided"}
                      />
                      <ProfileField
                        icon={<CalendarDays size={19} />}
                        label="Account created"
                        value={formatDate(driver.createdAt)}
                      />
                      <ProfileField
                        icon={<IdCard size={19} />}
                        label="Driver profile ID"
                        value={driver.id}
                      />
                      <ProfileField
                        icon={<UserRound size={19} />}
                        label="Account role"
                        value={driver.role}
                      />
                    </div>

                    <div className="border-t border-slate-100 p-5 sm:p-7">
                      <p className="mt-4 text-sm leading-6 text-slate-500">
                        Contact the shop owner to change your registered
                        account details.
                      </p>

                      <button
                        type="button"
                        onClick={handleLogout}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700"
                      >
                        <LogOut size={17} />
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Persistent bottom navigation for mobile */}
      <nav
        aria-label="Driver primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          <BottomNavButton
            label="Home"
            icon={<Home size={21} />}
            active={activeTab === "dashboard"}
            onClick={() => selectTab("dashboard")}
          />
          <BottomNavButton
            label="Deliveries"
            icon={<Truck size={21} />}
            active={activeTab === "deliveries"}
            onClick={() => selectTab("deliveries")}
          />
          <BottomNavButton
            label="Tracking"
            icon={<MapPin size={21} />}
            active={activeTab === "tracking"}
            onClick={() => selectTab("tracking")}
          />
          <BottomNavButton
            label="Profile"
            icon={<UserRound size={21} />}
            active={activeTab === "profile"}
            onClick={() => {
              setActiveTab("profile");
              setProfileMenuOpen(false);
              setProfileDetailsOpen(false);
              setError("");
              setNotice("");
            }}
          />
        </div>
      </nav>
    </div>
  );
}

function BottomNavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${
        active ? "text-sky-700" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && (
        <span className="absolute bottom-0 h-0.5 w-10 rounded-full bg-sky-600" />
      )}
    </button>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{title}</span>
        <span className="rounded-xl bg-sky-50 p-3 text-sky-600">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function ProfileField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-100 p-4">
      <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-800">
          {value}
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
      <LoaderCircle size={22} className="animate-spin text-sky-600" />
      Loading...
    </div>
  );
}
