export function canPublishDeliveryLocation(input) {
    return (input.role === "DRIVER" &&
        input.userId === input.assignedDriverUserId &&
        input.deliveryStatus === "STARTED");
}
const locations = new Map();
const expiryTimers = new Map();
const LOCATION_TTL_MS = 90_000;
let broadcastLocationCleared;
export function setLocationClearBroadcaster(broadcaster) {
    broadcastLocationCleared = broadcaster;
}
export function setLiveLocation(location) {
    const previousTimer = expiryTimers.get(location.deliveryId);
    if (previousTimer)
        clearTimeout(previousTimer);
    locations.set(location.deliveryId, location);
    const timer = setTimeout(() => {
        locations.delete(location.deliveryId);
        expiryTimers.delete(location.deliveryId);
    }, LOCATION_TTL_MS);
    timer.unref?.();
    expiryTimers.set(location.deliveryId, timer);
}
export function getLiveLocation(deliveryId) {
    const location = locations.get(deliveryId);
    if (!location)
        return undefined;
    if (Date.now() - Date.parse(location.timestamp) > LOCATION_TTL_MS) {
        locations.delete(deliveryId);
        const timer = expiryTimers.get(deliveryId);
        if (timer)
            clearTimeout(timer);
        expiryTimers.delete(deliveryId);
        return undefined;
    }
    return location;
}
export function clearLiveLocation(deliveryId) {
    locations.delete(deliveryId);
    const timer = expiryTimers.get(deliveryId);
    if (timer)
        clearTimeout(timer);
    expiryTimers.delete(deliveryId);
    broadcastLocationCleared?.(deliveryId);
}
export function isLiveLocationActive(location) {
    return Date.now() - Date.parse(location.timestamp) <= LOCATION_TTL_MS;
}
