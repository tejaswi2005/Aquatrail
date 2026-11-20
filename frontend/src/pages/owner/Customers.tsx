import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  Phone,
  Search,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../../services/api";
import StatusBadge from "../../components/ui/StatusBadge";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
}

interface Assignment {
  id: string;
  driverId: string;
  startDate: string;
  endDate: string;
  driver: { user: { name: string; phone: string | null; isActive: boolean } };
}

interface CustomerAddress {
  id: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

interface CustomerOccurrence {
  id: string;
  scheduledAt: string;
  status: string;
  failureReason: string | null;
  order: {
    orderNumber: string;
    status: string;
    delivery: {
      status: string;
      driver: { user: { name: string; phone: string | null } } | null;
    } | null;
  } | null;
}

interface CustomerSubscription {
  id: string;
  packageType: "DAILY" | "ALTERNATE_DAY";
  quantityPerDelivery: number;
  startDate: string;
  endDate: string | null;
  status: string;
  product: { name: string; bottleSizeLiters: number };
  address: CustomerAddress;
  driverAssignments: Assignment[];
  occurrences: CustomerOccurrence[];
}

interface Customer {
  id: string;
  user: { name: string; phone: string | null; email: string };
  addresses: CustomerAddress[];
  subscriptions: CustomerSubscription[];
}

function extractData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return null;
  return payload.data as T;
}

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
  return error instanceof Error ? error.message : "Unable to load customer records.";
}

function dateValue(value: string): string {
  return value.slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue(value)}T00:00:00`));
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CustomerSubscription | null>(null);
  const [driverId, setDriverId] = useState("");
  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async (query: string) => {
    const [customerResponse, driverResponse] = await Promise.all([
      api.get(`/owner/customers${query ? `?search=${encodeURIComponent(query)}` : ""}`),
      api.get("/drivers"),
    ]);
    const customerData = extractData<Customer[]>(customerResponse.data);
    const driverData = extractData<Driver[]>(driverResponse.data);
    if (!customerData || !driverData) throw new Error("Customer or driver response was incomplete.");
    setCustomers(customerData);
    setDrivers(driverData.filter((driver) => driver.isActive));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void loadData(search.trim()).catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError));
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadData, search]);

  function openAssignment(subscription: CustomerSubscription) {
    const today = todayString();
    const activeAssignment = subscription.driverAssignments.find(
      (item) =>
        dateValue(item.startDate) <= today && dateValue(item.endDate) >= today
    ) ?? subscription.driverAssignments.find(
      (item) => dateValue(item.startDate) >= today
    );
    const subscriptionEnd = dateValue(subscription.endDate ?? subscription.startDate);
    setSelected(subscription);
    setDriverId(activeAssignment?.driverId ?? "");
    setStartDate(today > dateValue(subscription.startDate) ? today : dateValue(subscription.startDate));
    setEndDate(subscriptionEnd);
    setNotice("");
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/owner/subscriptions/${encodeURIComponent(selected.id)}/assignments`, {
        driverId,
        startDate,
        endDate,
      });
      setSelected(null);
      setNotice("Monthly driver assignment saved. Eligible future deliveries have been updated.");
      await loadData(search.trim());
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5FAFD] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/owner/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-700">
            <ArrowLeft size={17} /> Owner dashboard
          </Link>
          <Link to="/owner/scheduled-deliveries" className="text-sm font-bold text-blue-700 hover:text-blue-900">Scheduled deliveries</Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <section className="mb-7 rounded-3xl bg-gradient-to-br from-[#0B1F3A] via-blue-900 to-cyan-700 p-6 text-white shadow-xl shadow-blue-900/15 sm:p-8">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-100"><UserRound size={15} /> Customer operations</span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Customers & subscriptions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Review customer plans, delivery history, and monthly driver assignment periods.</p>
        </section>

        <label className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Search size={19} className="text-slate-400" />
          <span className="sr-only">Search customer name or mobile</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer name or mobile number"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </label>

        {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

        {loading ? (
          <div className="rounded-2xl bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" />Loading customers…</div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <UserRound className="mx-auto text-slate-300" size={34} />
            <p className="mt-3 font-bold">{search ? "No matching customers" : "No customers yet"}</p>
            <p className="mt-1 text-sm text-slate-500">Customers and their subscriptions will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {customers.map((customer) => (
              <article key={customer.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <h2 className="text-lg font-extrabold">{customer.user.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {customer.user.phone && <a className="inline-flex items-center gap-1.5 hover:text-blue-700" href={`tel:${customer.user.phone}`}><Phone size={14} />{customer.user.phone}</a>}
                      <span>{customer.user.email}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{customer.subscriptions.length} subscription{customer.subscriptions.length === 1 ? "" : "s"}</span>
                </header>

                {customer.subscriptions.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500 sm:px-6">No subscriptions. Saved addresses: {customer.addresses.length}.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {customer.subscriptions.map((subscription) => {
                      const today = todayString();
                      const assignment = subscription.driverAssignments.find(
                        (item) =>
                          dateValue(item.startDate) <= today &&
                          dateValue(item.endDate) >= today
                      );
                      const assignmentHistory = subscription.driverAssignments.filter(
                        (item) => dateValue(item.endDate) < today
                      );
                      const intervalDays =
                        subscription.packageType === "DAILY" ? 1 : 2;
                      const address = subscription.address;
                      return (
                        <section key={subscription.id} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:p-6">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-extrabold">{subscription.packageType === "DAILY" ? "Monthly Daily Delivery" : "Monthly Alternate-Day Delivery"}</h3>
                              <StatusBadge status={subscription.status} size="compact" />
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{subscription.product.name} · {subscription.quantityPerDelivery} × {subscription.product.bottleSizeLiters} L · every {intervalDays} day{intervalDays === 1 ? "" : "s"}</p>
                            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500"><MapPin size={14} className="mt-0.5 shrink-0" />{address.label ? `${address.label}: ` : ""}{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.city}, {address.state} {address.postalCode}</p>
                            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><CalendarDays size={14} />{formatDate(subscription.startDate)} – {subscription.endDate ? formatDate(subscription.endDate) : "No end date"}</p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => openAssignment(subscription)} disabled={!["ACTIVE", "PAUSED"].includes(subscription.status)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
                                <Truck size={15} />{assignment ? "Change driver" : "Assign driver"}
                              </button>
                              {assignment && <span className="text-xs font-semibold text-slate-600">Current: {assignment.driver.user.name}</span>}
                            </div>
                            {(assignment || subscription.driverAssignments.find((item) => dateValue(item.startDate) >= today)) && (
                              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                                {(() => {
                                  const displayedAssignment =
                                    assignment ?? subscription.driverAssignments.find(
                                      (item) => dateValue(item.startDate) >= today
                                    );
                                  if (!displayedAssignment) return null;
                                  return (
                                    <>
                                      <p className="text-sm font-bold text-slate-800">{displayedAssignment.driver.user.name}</p>
                                      {displayedAssignment.driver.user.phone && <p className="mt-1 text-xs text-slate-600">{displayedAssignment.driver.user.phone}</p>}
                                      <p className="mt-1 text-xs text-slate-500">{formatDate(displayedAssignment.startDate)} – {formatDate(displayedAssignment.endDate)}</p>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                            {assignmentHistory.length > 0 && (
                              <details className="mt-3 text-xs text-slate-500">
                                <summary className="cursor-pointer font-bold">Assignment history ({assignmentHistory.length})</summary>
                                <ul className="mt-2 space-y-1">
                                  {assignmentHistory.map((item) => <li key={item.id}>{item.driver.user.name}: {formatDate(item.startDate)} – {formatDate(item.endDate)}</li>)}
                                </ul>
                              </details>
                            )}
                          </div>

                          <div>
                            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Clock3 size={14} /> Recent delivery history</p>
                            {subscription.occurrences.length === 0 ? (
                              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No delivery history available.</p>
                            ) : (
                              <ol className="max-h-64 space-y-2 overflow-y-auto">
                                {subscription.occurrences.map((occurrence) => (
                                  <li key={occurrence.id} className="flex flex-col gap-1 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{formatDate(occurrence.scheduledAt)}</p>
                                      <p className="text-xs text-slate-500">{occurrence.order ? `Order #${occurrence.order.orderNumber}` : occurrence.failureReason || "No order generated"}</p>
                                    </div>
                                    <StatusBadge
                                      status={occurrence.order?.delivery?.status ?? occurrence.order?.status ?? occurrence.status}
                                      size="compact"
                                    />
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="assignment-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Monthly driver plan</p>
                <h2 id="assignment-title" className="mt-1 text-xl font-extrabold">Assign a driver</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={(event) => void saveAssignment(event)} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Active driver
                <select required value={driverId} onChange={(event) => setDriverId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                  <option value="">Select a driver</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}{driver.phone ? ` · ${driver.phone}` : ""}</option>)}
                </select>
                {drivers.length === 0 && <span className="mt-1 block text-xs text-rose-700">No active drivers are available for assignment.</span>}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">Assignment starts
                  <input required type="date" min={todayString()} max={dateValue(selected.endDate ?? endDate)} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block text-sm font-semibold text-slate-700">Assignment ends
                  <input required type="date" min={startDate} max={dateValue(selected.endDate ?? endDate)} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                </label>
              </div>
              <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-slate-600"><CheckCircle2 size={14} className="mr-1 inline text-blue-700" />Changing the driver preserves prior assignment history and changes only generated deliveries that have not started.</p>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving || !drivers.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{saving && <LoaderCircle size={16} className="animate-spin" />}{saving ? "Saving…" : "Save assignment"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
