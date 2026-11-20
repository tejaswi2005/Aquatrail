import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Droplets,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  Waves,
} from "lucide-react";
import { api } from "../../services/api";
import OrderTypeCard from "../../components/customer/OrderTypeCard";
import {
  AddressSelector,
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
  PackageSelection,
  PriceSummary,
  type OrderAddress,
  type OrderProduct,
} from "../../components/customer/OrderFormComponents";
import { formatPrice } from "../../components/customer/formatPrice";

type OrderType = "DAILY" | "ALTERNATE_DAY";
type DeliveryTime = "MORNING" | "AFTERNOON" | "EVENING";

interface RouteState {
  productId?: string;
  quantity?: number;
}

interface SubscriptionEstimate {
  unitPricePaise: number;
  perDeliveryAmountPaise: number;
  estimatedDeliveriesPerBillingCycle: number;
  estimatedMonthlyAmountPaise: number;
  billingIntervalDays: number;
}

type SubscriptionEstimateState =
  | { key: string; status: "loading" }
  | { key: string; status: "success"; value: SubscriptionEstimate }
  | { key: string; status: "error"; message: string };

interface SubscriptionConfirmation {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
}

function extractList<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as { data?: unknown; products?: unknown; addresses?: unknown };
  if (Array.isArray(response.data)) return response.data as T[];
  if (response.data && typeof response.data === "object") {
    const data = response.data as { products?: unknown; addresses?: unknown };
    if (Array.isArray(data.products)) return data.products as T[];
    if (Array.isArray(data.addresses)) return data.addresses as T[];
  }
  if (Array.isArray(response.products)) return response.products as T[];
  if (Array.isArray(response.addresses)) return response.addresses as T[];
  return [];
}

function getLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response
  ) {
    const data = error.response.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export default function CustomerOrderTypeSelection() {
  const location = useLocation();
  const routeState = location.state as RouteState | null;
  const minimumDate = getLocalDate();

  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [addresses, setAddresses] = useState<OrderAddress[]>([]);
  const [productId, setProductId] = useState(routeState?.productId ?? "");
  const [quantity, setQuantity] = useState(
    Number.isSafeInteger(routeState?.quantity) && Number(routeState?.quantity) > 0
      ? Number(routeState?.quantity)
      : 1
  );
  const [addressId, setAddressId] = useState("");
  const [startDate, setStartDate] = useState(minimumDate);
  const [deliveryTime, setDeliveryTime] = useState<DeliveryTime>("MORNING");
  const [selectedType, setSelectedType] = useState<OrderType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [createdSubscription, setCreatedSubscription] =
    useState<SubscriptionConfirmation | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [estimateState, setEstimateState] =
    useState<SubscriptionEstimateState | null>(null);

  const selectedProduct = products.find((product) => product.id === productId);
  const estimateKey =
    selectedType && productId && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100
      ? JSON.stringify([selectedType, productId, quantity])
      : "";
  const currentEstimateState =
    estimateState?.key === estimateKey ? estimateState : null;
  const estimate =
    currentEstimateState?.status === "success"
      ? currentEstimateState.value
      : null;
  const estimateLoading =
    Boolean(estimateKey) &&
    (!currentEstimateState || currentEstimateState.status === "loading");
  const estimateError =
    currentEstimateState?.status === "error"
      ? currentEstimateState.message
      : "";

  const isSelectionValid = useMemo(
    () =>
      Boolean(
        selectedProduct &&
        addressId &&
        Number.isSafeInteger(quantity) &&
        quantity >= 1 &&
        quantity <= 100 &&
        startDate >= minimumDate
      ),
    [addressId, minimumDate, quantity, selectedProduct, startDate]
  );

  useEffect(() => {
    if (!selectedType || !estimateKey) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setEstimateState({ key: estimateKey, status: "loading" });
      void api.post("/subscriptions/estimate", {
        packageType: selectedType,
        productId,
        quantityPerDelivery: quantity,
      }).then((response) => {
        const value = response.data?.data as SubscriptionEstimate | undefined;
        if (!value || !Number.isSafeInteger(value.estimatedMonthlyAmountPaise)) {
          throw new Error("The subscription estimate response was incomplete.");
        }
        if (active) setEstimateState({ key: estimateKey, status: "success", value });
      }).catch((error: unknown) => {
        if (active) {
          setEstimateState({
            key: estimateKey,
            status: "error",
            message: getErrorMessage(error, "Unable to calculate the subscription estimate."),
          });
        }
      });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [estimateKey, productId, quantity, selectedType]);

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      try {
        const [productsResponse, addressesResponse] = await Promise.all([
          api.get("/products"),
          api.get("/addresses"),
        ]);
        if (!active) return;
        const availableProducts = extractList<OrderProduct>(productsResponse.data).filter(
          (product) =>
            product.isActive !== false &&
            Number.isSafeInteger(product.pricePaise) &&
            product.pricePaise >= 0 &&
            Number(product.stockQuantity) > 0
        );
        const customerAddresses = extractList<OrderAddress>(addressesResponse.data);
        setProducts(availableProducts);
        setAddresses(customerAddresses);
        setProductId((current) =>
          availableProducts.some((product) => product.id === current)
            ? current
            : availableProducts[0]?.id ?? ""
        );
        setAddressId((current) =>
          customerAddresses.some((address) => address.id === current)
            ? current
            : customerAddresses.find((address) => address.isDefault)?.id ??
              customerAddresses[0]?.id ??
              ""
        );
      } catch (error: unknown) {
        if (active) {
          setLoadError(getErrorMessage(error, "Unable to load products and addresses."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOptions();
    return () => {
      active = false;
    };
  }, []);

  async function retryOptions() {
    setLoading(true);
    setLoadError("");
    try {
      const [productsResponse, addressesResponse] = await Promise.all([
        api.get("/products"),
        api.get("/addresses"),
      ]);
      const availableProducts = extractList<OrderProduct>(productsResponse.data).filter(
        (product) =>
          product.isActive !== false &&
          Number.isSafeInteger(product.pricePaise) &&
          product.pricePaise >= 0 &&
          Number(product.stockQuantity) > 0
      );
      const customerAddresses = extractList<OrderAddress>(addressesResponse.data);
      setProducts(availableProducts);
      setAddresses(customerAddresses);
      setProductId((current) =>
        availableProducts.some((product) => product.id === current)
          ? current
          : availableProducts[0]?.id ?? ""
      );
      setAddressId((current) =>
        customerAddresses.some((address) => address.id === current)
          ? current
          : customerAddresses.find((address) => address.isDefault)?.id ??
            customerAddresses[0]?.id ??
            ""
      );
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error, "Unable to load products and addresses."));
    } finally {
      setLoading(false);
    }
  }

  async function createSubscription() {
    if (!selectedType || !selectedProduct || !isSelectionValid) {
      setActionError("Complete all package details before continuing.");
      setShowConfirmation(false);
      return;
    }

    try {
      setCreating(true);
      setActionError("");
      const response = await api.post("/subscriptions", {
        packageType: selectedType,
        productId: selectedProduct.id,
        idempotencyKey,
        quantityPerDelivery: quantity,
        startDate,
        deliveryTimePreference: deliveryTime,
        addressId,
      });
      const subscription = response.data?.data as SubscriptionConfirmation | undefined;
      if (!subscription?.id) {
        throw new Error("The subscription was created, but its confirmation details could not be loaded.");
      }
      setCreatedSubscription(subscription);
      setShowConfirmation(false);
      setSuccessMessage("Your subscription is active. Driver assignment is pending until the owner assigns a driver.");
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, "Unable to create your subscription."));
      setShowConfirmation(false);
    } finally {
      setCreating(false);
    }
  }

  const address = addresses.find((item) => item.id === addressId);
  const endDate = new Date(`${startDate}T00:00:00`);
  endDate.setDate(endDate.getDate() + 29);
  const endDateString = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  function resetConfirmation() {
    setCreatedSubscription(null);
    setSuccessMessage("");
    setIdempotencyKey(createIdempotencyKey());
  }

  return (
    <div className="min-h-screen bg-[#F5FAFD] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/customer/dashboard" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-white shadow-lg shadow-blue-700/20">
              <Droplets size={23} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              Aqua<span className="text-blue-600">Trail</span>
              <span className="ml-2 hidden text-xs font-medium text-slate-500 sm:inline">Water, made dependable</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/customer/subscriptions" className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-sky-50 hover:text-blue-700">
              Subscriptions
            </Link>
            <Link to="/customer/orders" className="hidden rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-sky-50 hover:text-blue-700 sm:inline-flex">
              My orders
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <Link to="/customer/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700">
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <section className="relative mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0B1F3A] via-blue-900 to-cyan-700 px-6 py-8 text-white shadow-xl shadow-blue-900/15 sm:px-9 sm:py-10">
          <span className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[35px] border-white/10" />
          <span className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-50">
              <Waves size={15} /> Choose your delivery rhythm
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Water your way</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
              Choose a delivery plan and we'll schedule your water deliveries automatically.
            </p>
          </div>
        </section>

        {loadError && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button type="button" onClick={retryOptions} className="inline-flex items-center gap-2 self-start rounded-lg bg-white px-3 py-2 font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {actionError}
          </div>
        )}
        {successMessage && (
          <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div>
                <p>{successMessage}</p>
                {createdSubscription && (
                  <p className="mt-1 text-xs">
                    Status: {createdSubscription.status}
                    {estimate && ` · 30-day estimate: ${formatPrice(estimate.estimatedMonthlyAmountPaise)}`}
                    {createdSubscription.endDate && ` · Ends ${formatLongDate(createdSubscription.endDate)}`}
                  </p>
                )}
              </div>
            </div>
            <Link to="/customer/subscriptions" className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-800">
              Manage subscription <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Droplets size={28} />}
            title="Water bottles are temporarily unavailable"
            description="There are no active 20-litre products in stock right now. Please try again later."
            action={<button type="button" onClick={retryOptions} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">Refresh products</button>}
          />
        ) : (
          <>
            <section className="mb-7">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Delivery options</p>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight">How would you like your water?</h2>
                </div>
                <Link to="/customer/subscriptions" className="text-sm font-bold text-blue-700 hover:text-blue-900">Manage subscriptions</Link>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <OrderTypeCard
                  title="Monthly Daily Delivery"
                  description="One delivery every day throughout the month."
                  benefits={["One delivery every day", "Choose bottles and start date", "Pause or cancel any time"]}
                  icon={<CalendarDays size={27} />}
                  selected={selectedType === "DAILY"}
                  onSelect={() => { setSelectedType("DAILY"); setActionError(""); resetConfirmation(); }}
                />
                <OrderTypeCard
                  title="Monthly Alternate-Day Delivery"
                  description="Keep a steady supply with one delivery every two days."
                  benefits={["About 15 deliveries per 30 days", "Set a preferred delivery time", "Pause or cancel any time"]}
                  icon={<RefreshCw size={26} />}
                  selected={selectedType === "ALTERNATE_DAY"}
                  onSelect={() => { setSelectedType("ALTERNATE_DAY"); setActionError(""); resetConfirmation(); }}
                />
              </div>
            </section>

            {selectedType && (
              <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-6 flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Sparkles size={21} />
                    </span>
                    <div>
                      <h2 className="text-xl font-extrabold">
                        {selectedType === "DAILY" ? "Set up Monthly Daily Delivery" : "Set up alternate-day delivery"}
                      </h2>
                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        {selectedType === "DAILY" ? "One delivery is planned every day for 30 days. The monthly amount is an estimate, not a payment." : "One delivery is planned every two days for 30 days. The monthly amount is an estimate, not a payment."}
                      </p>
                    </div>
                  </div>

                  <PackageSelection
                    products={products}
                    productId={productId}
                    onProductChange={(value) => { setProductId(value); resetConfirmation(); }}
                    quantity={quantity}
                    onQuantityChange={(value) => { setQuantity(value); resetConfirmation(); }}
                    startDate={startDate}
                    onStartDateChange={(value) => { setStartDate(value); resetConfirmation(); }}
                    deliveryTime={deliveryTime}
                    onDeliveryTimeChange={(value) => { setDeliveryTime(value as DeliveryTime); resetConfirmation(); }}
                    minimumDate={minimumDate}
                  />
                  <div className="mt-5 flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-slate-600">
                    <Clock3 size={18} className="mt-0.5 shrink-0 text-blue-700" />
                    {selectedType === "DAILY"
                      ? "Monthly Daily Delivery: one delivery every day (30 deliveries per 30-day cycle)."
                      : "Alternate-day delivery: one delivery every two days (about 15 deliveries per 30-day cycle)."}
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <AddressSelector addresses={addresses} value={addressId} onChange={(value) => { setAddressId(value); resetConfirmation(); }} />
                    {addresses.length === 0 && (
                      <Link to="/customer/profile" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">
                        Add a delivery address in your profile <ArrowRight size={16} />
                      </Link>
                    )}
                  </div>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-24">
                  {selectedProduct && estimate && (
                    <PriceSummary
                      title="Subscription estimate"
                      rows={[
                        { label: "Per delivery", value: formatPrice(estimate.perDeliveryAmountPaise) },
                        { label: "Estimated deliveries / 30 days", value: String(estimate.estimatedDeliveriesPerBillingCycle) },
                        { label: "Estimated 30-day total", value: formatPrice(estimate.estimatedMonthlyAmountPaise), emphasis: true },
                      ]}
                      disclaimer="Estimate calculated by AquaTrail using the current product price. No payment has been collected."
                    />
                  )}
                  {estimateLoading && <p role="status" className="rounded-2xl bg-white p-4 text-sm text-slate-500">Calculating current subscription estimate…</p>}
                  {estimateError && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{estimateError}</p>}

                  {address && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Delivering to</p>
                      <p className="mt-2 font-bold text-slate-900">{address.label || "Saved address"}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">{address.addressLine1}, {address.city}, {address.state}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!isSelectionValid || !estimate || estimateLoading || Boolean(estimateError) || Boolean(createdSubscription)}
                    onClick={() => setShowConfirmation(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 px-5 py-4 text-sm font-extrabold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    <ShieldCheck size={18} />
                    Review package
                    <ArrowRight size={17} />
                  </button>
                  <p className="text-center text-xs leading-5 text-slate-500">
                    You can pause or cancel an active package from Subscriptions.
                  </p>
                </aside>
              </section>
            )}

            {!selectedType && (
              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Truck size={17} className="text-blue-700" />
                Select an option to choose your product, delivery details, and price.
              </div>
            )}
          </>
        )}
      </main>

      {showConfirmation && selectedProduct && selectedType && estimate && (
        <ConfirmationDialog
          title="Confirm your delivery package"
          confirmLabel="Activate subscription"
          busy={creating}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={() => void createSubscription()}
        >
          <div className="space-y-3">
            <p>
              <strong className="text-slate-900">{selectedType === "DAILY" ? "Monthly Daily Delivery" : "Monthly Alternate-Day Delivery"}</strong>
              {" "}of {quantity} × {selectedProduct.name} per delivery.
            </p>
            <p>
              Frequency: <strong className="text-slate-900">{selectedType === "DAILY" ? "Every day" : "Every two days"}</strong> for 30 days.
            </p>
            <p>First delivery planned for <strong className="text-slate-900">{formatLongDate(startDate)}</strong>, preferably in the {deliveryTime.toLowerCase()}.</p>
            <p>Subscription period ends <strong className="text-slate-900">{formatLongDate(endDateString)}</strong>.</p>
            {address && <p>Delivery address: <strong className="text-slate-900">{address.label || address.addressLine1}, {address.city}</strong>.</p>}
            <div className="rounded-xl bg-sky-50 p-4">
              <p className="font-bold text-slate-800">{formatPrice(estimate.perDeliveryAmountPaise)} per delivery</p>
              <p className="mt-1 text-sm">Estimated {formatPrice(estimate.estimatedMonthlyAmountPaise)} per 30 days · {estimate.estimatedDeliveriesPerBillingCycle} deliveries</p>
            </div>
            <p className="text-xs leading-5 text-slate-500">This is a subscription estimate, not a payment already collected. Driver assignment is pending until the owner assigns a driver.</p>
          </div>
        </ConfirmationDialog>
      )}
    </div>
  );
}
