import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createAuthenticatedSocket } from "../../services/socket";

interface DriverLocationShareProps {
  deliveryId: string;
}

export default function DriverLocationShare({
  deliveryId,
}: DriverLocationShareProps) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("Location sharing is off");

  const watchId = useRef<number | null>(null);
  const locationSocket = useRef<Socket | null>(null);
  const stopPending = useRef(false);
  const lastReportedLocation = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }

      const activeSocket = locationSocket.current;

      if (activeSocket) {
        activeSocket.removeAllListeners();
        const disconnectTimer = window.setTimeout(
          () => activeSocket.disconnect(),
          5000
        );
        activeSocket.emit("delivery:location:stop", { deliveryId }, () => {
          window.clearTimeout(disconnectTimer);
          activeSocket.disconnect();
        });
      }
    };
  }, [deliveryId]);

  const startSharing = useCallback(() => {
    if (locationSocket.current) {
      return;
    }

    if (!navigator.geolocation) {
      setMessage("This browser does not support GPS location.");
      return;
    }

    if (!window.isSecureContext) {
      setMessage(
        "Location sharing requires HTTPS, or localhost during development."
      );
      return;
    }

    const activeSocket = createAuthenticatedSocket();
    locationSocket.current = activeSocket;
    setSharing(true);
    setMessage("Connecting to live tracking...");

    const watchLocation = () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }

      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const now = Date.now();
          const previous = lastReportedLocation.current;
          if (previous) {
            const radians = (degrees: number) => (degrees * Math.PI) / 180;
            const earthRadiusMeters = 6_371_000;
            const latitudeDelta = radians(latitude - previous.latitude);
            const longitudeDelta = radians(longitude - previous.longitude);
            const haversine =
              Math.sin(latitudeDelta / 2) ** 2 +
              Math.cos(radians(previous.latitude)) *
                Math.cos(radians(latitude)) *
                Math.sin(longitudeDelta / 2) ** 2;
            const distanceMeters =
              2 *
              earthRadiusMeters *
              Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

            if (distanceMeters < 25 && now - previous.timestamp < 15_000) {
              return;
            }
          }

          lastReportedLocation.current = { latitude, longitude, timestamp: now };

          activeSocket.emit(
            "delivery:location:update",
            {
              deliveryId,
              latitude,
              longitude,
              accuracy,
            },
            (result: { success: boolean; message?: string }) => {
              if (!result.success) {
                setMessage(
                  result.message || "Unable to update delivery location."
                );
                return;
              }

              setMessage(
                `GPS updated: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
              );
            }
          );
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            if (watchId.current !== null) {
              navigator.geolocation.clearWatch(watchId.current);
              watchId.current = null;
            }

            setSharing(false);
            setMessage(
              "Location permission was denied. Live tracking is unavailable; you can continue the delivery."
            );
            activeSocket.emit("delivery:location:stop", { deliveryId }, () => {
              activeSocket.removeAllListeners();
              activeSocket.disconnect();
              if (locationSocket.current === activeSocket) {
                locationSocket.current = null;
              }
            });
            return;
          }

          setMessage(`Unable to access GPS: ${error.message}`);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 15000,
        }
      );
    };

    activeSocket.on("connect", () => {
      if (stopPending.current) {
        return;
      }

      setMessage("Requesting GPS location...");
      watchLocation();
    });

    activeSocket.on("connect_error", (error: Error) => {
      setMessage(`Unable to connect: ${error.message}`);
    });

    activeSocket.on("disconnect", () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }

      if (!stopPending.current) {
        setMessage("Connection interrupted. Reconnecting...");
      }
    });

    activeSocket.connect();
  }, [deliveryId]);

  useEffect(() => {
    const timer = window.setTimeout(startSharing, 0);

    return () => window.clearTimeout(timer);
  }, [startSharing]);

  const stopSharing = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    const activeSocket = locationSocket.current;

    if (!activeSocket) {
      setSharing(false);
      setMessage("Location sharing stopped");
      return;
    }

    stopPending.current = true;
    setMessage("Stopping location sharing...");
    const disconnectTimer = window.setTimeout(() => {
      stopPending.current = false;
      setMessage("Could not confirm stop request. Try again.");
    }, 5000);

    activeSocket.emit(
      "delivery:location:stop",
      { deliveryId },
      (result: { success: boolean; message?: string }) => {
        window.clearTimeout(disconnectTimer);
        stopPending.current = false;

        if (!result.success) {
          setMessage(result.message || "Unable to stop location sharing.");
          return;
        }

        locationSocket.current = null;
        setSharing(false);
        setMessage("Location sharing stopped");
        activeSocket.removeAllListeners("disconnect");
        activeSocket.removeAllListeners();
        activeSocket.disconnect();
      }
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">
        Delivery GPS
      </h2>

      <p className="mt-2 text-sm text-slate-500">{message}</p>

      {!sharing ? (
        <button
          onClick={startSharing}
          className="mt-5 rounded-xl bg-cyan-700 px-5 py-3 font-semibold text-white hover:bg-cyan-800"
        >
          Start sharing location
        </button>
      ) : (
        <button
          onClick={stopSharing}
          className="mt-5 rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700"
        >
          Stop sharing location
        </button>
      )}
    </section>
  );
}