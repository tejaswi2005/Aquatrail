
export interface LiveLocation {
  deliveryId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export function canPublishDeliveryLocation(input: {
  role: string;
  userId: string;
  assignedDriverUserId: string | null;
  deliveryStatus: string;
}): boolean {
  return (
    input.role === "DRIVER" &&
    input.userId === input.assignedDriverUserId &&
    input.deliveryStatus === "STARTED"
  );
}

const locations = new Map<string, LiveLocation>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const LOCATION_TTL_MS = 90_000;
let broadcastLocationCleared: ((deliveryId: string) => void) | undefined;

export function setLocationClearBroadcaster(
  broadcaster: (deliveryId: string) => void
): void {
  broadcastLocationCleared = broadcaster;
}

export function setLiveLocation(location: LiveLocation): void {
  const previousTimer = expiryTimers.get(location.deliveryId);
  if (previousTimer) clearTimeout(previousTimer);
  locations.set(location.deliveryId, location);
  const timer = setTimeout(() => {
    locations.delete(location.deliveryId);
    expiryTimers.delete(location.deliveryId);
  }, LOCATION_TTL_MS);
  timer.unref?.();
  expiryTimers.set(location.deliveryId, timer);
}

export function getLiveLocation(
  deliveryId: string
): LiveLocation | undefined {
  const location = locations.get(deliveryId);
  if (!location) return undefined;

  if (Date.now() - Date.parse(location.timestamp) > LOCATION_TTL_MS) {
    locations.delete(deliveryId);
    const timer = expiryTimers.get(deliveryId);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(deliveryId);
    return undefined;
  }

  return location;
}

export function clearLiveLocation(deliveryId: string): void {
  locations.delete(deliveryId);
  const timer = expiryTimers.get(deliveryId);
  if (timer) clearTimeout(timer);
  expiryTimers.delete(deliveryId);
  broadcastLocationCleared?.(deliveryId);
}

export function isLiveLocationActive(location: LiveLocation): boolean {
  return Date.now() - Date.parse(location.timestamp) <= LOCATION_TTL_MS;
}
