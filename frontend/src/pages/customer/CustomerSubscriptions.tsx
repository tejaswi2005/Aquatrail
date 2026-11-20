import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Droplets, PackagePlus, RefreshCw, Waves } from "lucide-react";
import { api } from "../../services/api";
import SubscriptionSummary, {
  type SubscriptionView,
} from "../../components/customer/SubscriptionSummary";
import {
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
} from "../../components/customer/OrderFormComponents";

type ManageableStatus = "ACTIVE" | "PAUSED" | "CANCELLED";

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

function extractSubscriptions(payload: unknown): SubscriptionView[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return [];
  const data = payload.data;
  return Array.isArray(data) ? (data as SubscriptionView[]) : [];
}

function getTargetMessage(status: ManageableStatus): string {
  if (status === "PAUSED") {
    return "Pause this subscription? New deliveries will stop. Pending generated deliveries that have no driver assigned will be cancelled and their inventory released. Driver-assigned or in-progress deliveries will continue.";
  }
  if (status === "ACTIVE") return "Resume this subscription? Its next delivery will be recalculated from the original schedule.";
  return "Cancel this subscription permanently? Pending generated deliveries without a driver will be cancelled and their inventory released. Driver-assigned, in-progress, and completed deliveries will remain unchanged.";
}

export default function CustomerSubscriptions() {
  const location = useLocation();
  const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [pendingAction, setPendingAction] = useState<{ id: string; status: ManageableStatus } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState(
    (location.state as { successMessage?: string } | null)?.successMessage ?? ""
  );

  useEffect(() => {
    let active = true;
    async function loadSubscriptions() {
      try {
        const response = await api.get("/subscriptions/my");
        if (active) setSubscriptions(extractSubscriptions(response.data));
      } catch (loadError: unknown) {
        if (active) setError(getErrorMessage(loadError, "Unable to load your subscriptions."));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSubscriptions();
    return () => {
      active = false;
    };
  }, []);

  async function retrySubscriptions() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/subscriptions/my");
      setSubscriptions(extractSubscriptions(response.data));
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, "Unable to load your subscriptions."));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus() {
    if (!pendingAction) return;
    const action = pendingAction;
    try {
      setBusyId(action.id);
      setActionError("");
      const response = await api.patch(`/subscriptions/${action.id}/status`, {
        status: action.status,
      });
      const updated = response.data?.data as SubscriptionView | undefined;
      if (!updated?.id) throw new Error("The subscription update response was incomplete.");
      setSubscriptions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotice(
        action.status === "PAUSED"
          ? "Subscription paused."
          : action.status === "ACTIVE"
            ? "Subscription resumed."
            : "Subscription cancelled."
      );
      setPendingAction(null);
    } catch (updateError: unknown) {
      setActionError(getErrorMessage(updateError, "Unable to update this subscription."));
      setPendingAction(null);
    } finally {
      setBusyId("");
    }
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
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/customer/order-types" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800">
              New order
            </Link>
            <Link to="/customer/orders" className="hidden rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-sky-50 sm:inline-flex">
              My orders
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <Link to="/customer/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700">
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <section className="relative mb-7 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0B1F3A] via-blue-900 to-cyan-700 px-6 py-8 text-white shadow-xl shadow-blue-900/15 sm:px-9">
          <span className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[30px] border-white/10" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-50">
              <Waves size={15} /> Your recurring deliveries
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Subscriptions</h1>
            <p className="mt-3 text-sm leading-6 text-blue-100 sm:text-base">
              View your package and real upcoming deliveries. Billing amounts are estimates only; AquaTrail does not collect recurring payments.
            </p>
          </div>
        </section>

        {notice && (
          <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="font-bold hover:text-emerald-950">×</button>
          </div>
        )}
        {error && (
          <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button type="button" onClick={retrySubscriptions} className="inline-flex items-center gap-2 self-start rounded-lg bg-white px-3 py-2 font-bold ring-1 ring-rose-200 hover:bg-rose-100">
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{actionError}</div>
        )}

        {loading ? (
          <LoadingSkeleton rows={2} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions yet"
            description="Choose a monthly or alternate-day package to keep water deliveries on a predictable schedule."
            icon={<PackagePlus size={27} />}
            action={
              <Link to="/customer/order-types" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800">
                Explore packages <ArrowRight size={16} />
              </Link>
            }
          />
        ) : (
          <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Your packages</p>
                <h2 className="mt-1 text-xl font-extrabold">{subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"}</h2>
              </div>
              <Link to="/customer/order-types" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">
                Add a package <ArrowRight size={16} />
              </Link>
            </div>
            {subscriptions.map((subscription) => (
              <SubscriptionSummary
                key={subscription.id}
                subscription={subscription}
                expanded={expandedId === subscription.id}
                onToggleDetails={() => setExpandedId((current) => current === subscription.id ? "" : subscription.id)}
                busy={busyId === subscription.id}
                onAction={(status) => {
                  setActionError("");
                  setPendingAction({ id: subscription.id, status });
                }}
              />
            ))}
          </section>
        )}
      </main>

      {pendingAction && (
        <ConfirmationDialog
          title={
            pendingAction.status === "PAUSED"
              ? "Pause subscription?"
              : pendingAction.status === "ACTIVE"
                ? "Resume subscription?"
                : "Cancel subscription?"
          }
          confirmLabel={
            pendingAction.status === "PAUSED"
              ? "Pause package"
              : pendingAction.status === "ACTIVE"
                ? "Resume package"
                : "Cancel package"
          }
          danger={pendingAction.status === "CANCELLED"}
          busy={busyId === pendingAction.id}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void updateStatus()}
        >
          <p>{getTargetMessage(pendingAction.status)}</p>
          {pendingAction.status === "CANCELLED" && (
            <p className="mt-3 font-semibold text-rose-700">Cancellation is permanent and cannot be reversed.</p>
          )}
        </ConfirmationDialog>
      )}
    </div>
  );
}
