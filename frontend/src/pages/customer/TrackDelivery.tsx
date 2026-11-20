
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Droplets,
  Clock3,
  MapPin,
  Phone,
  Radio,
  Truck,
  UserRound,
} from "lucide-react";

import DeliveryMap from "../../components/maps/DeliveryMap";
import { socket } from "../../services/socket";
import { api } from "../../services/api";

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface LocationUpdate extends Coordinates {
  deliveryId: string;
  timestamp: string;
  accuracy?: number;
}

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

interface DeliveryDetails {
  id: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  orderNumber?: string;
  driver?: { name: string; phone: string | null } | null;
  order?: {
    orderNumber?: string;
    address?: DeliveryAddress | null;
  } | null;
  address?: DeliveryAddress | null;
}

interface TrackingPageProps {
  deliveryId: string;
}

function isValidCoordinates(
  latitude: unknown,
  longitude: unknown
): latitude is number {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function getStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default function TrackDelivery({
  deliveryId,
}: TrackingPageProps) {
  const navigate = useNavigate();

  const [delivery, setDelivery] =
    useState<DeliveryDetails | null>(null);

  const [driverLocation, setDriverLocation] =
    useState<LocationUpdate | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState("Waiting for delivery to start");
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadDelivery(initial: boolean) {
      try {
        const response = await api.get(
          `/deliveries/${encodeURIComponent(deliveryId)}`
        );

        if (!active) return;

        const details = response.data?.data as
          | DeliveryDetails
          | undefined;

        if (!details) {
          throw new Error(
            "Delivery details were not returned."
          );
        }

        setDelivery(details);
        if (details.status !== "STARTED") {
          setDriverLocation(null);
          setConnectionStatus(
            ["COMPLETED", "CANCELLED"].includes(details.status)
              ? "Delivery has ended; live tracking is no longer active."
              : "Live tracking begins when the delivery starts."
          );
        }
      } catch (err: unknown) {
        if (!active || !initial) return;

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
            : "Unable to load delivery information.")
        );
      } finally {
        if (active && initial) {
          setLoading(false);
        }
      }
    }

    void loadDelivery(true);
    const refreshTimer = window.setInterval(() => {
      void loadDelivery(false);
    }, 15_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [deliveryId]);

  useEffect(() => {
    if (delivery?.status !== "STARTED") return;
    let active = true;

    const subscribeToDelivery = () => {
      if (!active) return;
      setConnectionStatus("Connecting to live tracking...");
      socket.emit(
        "delivery:subscribe",
        { deliveryId },
        (result: { success: boolean; message?: string }) => {
          if (!active) return;
          setConnectionStatus(
            result?.success
              ? "Connected; waiting for the driver's GPS"
              : result?.message || "Live tracking is unavailable."
          );
        }
      );
    };
    const handleDisconnect = () => {
      if (active) setConnectionStatus("Connection interrupted. Reconnecting...");
    };
    const handleConnectError = () => {
      if (active) setConnectionStatus("Unable to connect. Retrying...");
    };
    const handleLocation = (update: LocationUpdate) => {
      if (
        !active ||
        update?.deliveryId !== deliveryId ||
        !isValidCoordinates(update.latitude, update.longitude) ||
        !Number.isFinite(Date.parse(update.timestamp)) ||
        Date.now() - Date.parse(update.timestamp) > 90_000
      ) {
        return;
      }
      setDriverLocation(update);
      setCurrentTime(Date.now());
      setConnectionStatus("Live location updated");
    };
    const handleLocationCleared = (clearedDeliveryId: string) => {
      if (active && clearedDeliveryId === deliveryId) {
        setDriverLocation(null);
        setConnectionStatus("Live location is currently unavailable.");
      }
    };

    socket.on("connect", subscribeToDelivery);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("delivery:location", handleLocation);
    socket.on("delivery:location:cleared", handleLocationCleared);
    socket.connect();
    if (socket.connected) subscribeToDelivery();

    return () => {
      active = false;
      socket.off("connect", subscribeToDelivery);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("delivery:location", handleLocation);
      socket.off("delivery:location:cleared", handleLocationCleared);
      socket.emit("delivery:unsubscribe", { deliveryId });
    };
  }, [delivery?.status, deliveryId]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/customer/orders");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={goBack}
            className="mb-8 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-blue-600">
              <Truck size={28} />
            </div>

            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

            <h1 className="text-lg font-bold text-slate-900">
              Loading delivery details
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Please wait while we retrieve your delivery information.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !delivery) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={goBack}
            className="mb-8 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle size={25} />
            </div>

            <h1 className="mt-4 text-xl font-extrabold text-slate-900">
              Unable to load delivery
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {error || "Delivery information is unavailable."}
            </p>

            <button
              type="button"
              onClick={() => navigate("/customer/orders")}
              className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Back to my orders
            </button>
          </section>
        </div>
      </main>
    );
  }


  const address: DeliveryAddress | null =
    delivery.address ?? delivery.order?.address ?? null;

  let destination: Coordinates | null = null;

  if (
    address &&
    typeof address.latitude === "number" &&
    Number.isFinite(address.latitude) &&
    address.latitude >= -90 &&
    address.latitude <= 90 &&
    typeof address.longitude === "number" &&
    Number.isFinite(address.longitude) &&
    address.longitude >= -180 &&
    address.longitude <= 180
  ) {
    destination = {
      latitude: address.latitude,
      longitude: address.longitude,
    };
  }

  const addressText = address
    ? [
      address.addressLine1,
      address.addressLine2,
      address.city,
      address.state,
      address.postalCode,
    ]
      .filter(Boolean)
      .join(", ")
    : "Delivery address unavailable";

  const terminalStatuses = ["COMPLETED", "CANCELLED"];

  const isTerminal = terminalStatuses.includes(
    delivery.status.toUpperCase()
  );

  const orderNumber =
    delivery.orderNumber ??
    delivery.order?.orderNumber ??
    delivery.id;

  const isLocationFresh = Boolean(
    driverLocation &&
      currentTime > 0 &&
      currentTime - Date.parse(driverLocation.timestamp) <= 90_000
  );
  const hasDriverLocation = Boolean(isLocationFresh && !isTerminal);

  return (
    <main className="min-h-screen bg-slate-50 pb-10 text-slate-900">
      {/* AquaTrail header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/customer/dashboard")}
            className="flex items-center gap-3 text-left"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/20">
              <Droplets size={23} />
            </span>

            <span>
              <span className="block text-lg font-extrabold tracking-tight">
                Aqua<span className="text-blue-600">Trail</span>
              </span>
              <span className="hidden text-xs text-slate-500 sm:block">
                Water delivery made simple
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={goBack}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-sky-50 hover:text-blue-700 sm:px-4"
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">
            Live delivery tracking
          </p>

          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Track your water delivery
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Order #{orderNumber}
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <section className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
            <div className="px-3 py-3 sm:px-4">
              <h2 className="font-bold text-slate-900">Live delivery map</h2>
              <p className="mt-1 text-sm text-slate-500">
                {hasDriverLocation
                  ? "The driver's latest reported location is available."
                  : "The map will update when the driver sends a GPS location."}
              </p>
            </div>

            {destination ? (
              <DeliveryMap
                driverLocation={hasDriverLocation ? driverLocation : null}
                customerLocation={destination}
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div className="max-w-md">
                  <MapPin
                    size={30}
                    className="mx-auto mb-3 text-slate-400"
                  />
                  <p className="font-semibold text-slate-700">
                    Map coordinates unavailable
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Your delivery address is shown beside the map. Valid
                    latitude and longitude are required to display the destination.
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="space-y-5">
        {/* Status cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-sky-50 p-3 text-blue-600">
                <Truck size={21} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Delivery status
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {getStatusLabel(delivery.status)}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-xl p-3 ${hasDriverLocation
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-amber-50 text-amber-600"
                  }`}
              >
                <Radio size={21} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">
                  Tracking connection
                </p>

                <span
                  className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${hasDriverLocation
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                    }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${hasDriverLocation
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                      }`}
                  />

                  {hasDriverLocation
                    ? "Driver location available"
                    : driverLocation && !isLocationFresh
                      ? "Driver location is stale"
                      : connectionStatus}
                </span>
              </div>
            </div>

            {!hasDriverLocation && !isTerminal && (
              <p className="mt-3 text-sm leading-5 text-amber-700">
                {delivery.status === "STARTED"
                  ? "Live location is currently unavailable. The driver may have denied GPS permission or is waiting for a location update."
                  : "Live tracking is unavailable until the driver starts this delivery."}
              </p>
            )}

            {isTerminal && (
              <p className="mt-3 text-sm leading-5 text-slate-500">
                This delivery is {delivery.status.toLowerCase()}.
                Live tracking is no longer active.
              </p>
            )}
          </article>
        </section>

        {/* Destination card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-50 p-3 text-blue-600">
              <MapPin size={21} />
            </span>

            <div className="min-w-0">
              <h2 className="font-bold text-slate-900">
                Delivery destination
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {addressText}
              </p>

              {!destination && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-800">
                  This address has no valid map coordinates. The
                  address is available, but the destination cannot
                  be displayed on the map yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-2xl bg-sky-50 p-3 text-blue-700">
                <UserRound size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="font-extrabold text-slate-900">Your delivery driver</h2>
                {delivery.driver ? (
                  <>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {delivery.driver.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {delivery.driver.phone || "Phone number unavailable"}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">
                    A driver has not been assigned yet.
                  </p>
                )}
              </div>
            </div>

            {delivery.driver?.phone && !isTerminal && (
              <a
                href={`tel:${delivery.driver.phone}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800"
              >
                <Phone size={18} />
                Call driver
              </a>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-600">
              <Clock3 size={16} className="text-cyan-700" />
              Last location update:{" "}
              {hasDriverLocation && driverLocation
                ? new Date(driverLocation.timestamp).toLocaleString()
                : "Unavailable"}
            </span>
            {isTerminal && (
              <span className="font-semibold text-slate-700">
                Final status: {getStatusLabel(delivery.status)}
              </span>
            )}
          </div>
          {delivery.status === "CANCELLED" && delivery.cancellationReason && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Cancellation reason: {delivery.cancellationReason}
            </p>
          )}
        </section>
          </div>
        </div>

        {/* Bottom navigation */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-sky-50"
          >
            <ArrowLeft size={17} />
            Go back
          </button>

          <button
            type="button"
            onClick={() => navigate("/customer/orders")}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            View my orders
          </button>
        </div>
      </div>
    </main>
  );
}
