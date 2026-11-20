import assert from "node:assert/strict";
import test from "node:test";
import { clearLiveLocation, getLiveLocation, setLiveLocation, setLocationClearBroadcaster, } from "./liveLocation.service.js";
test("live location expires and is cleared from temporary storage", () => {
    const deliveryId = "delivery-ttl-test";
    setLiveLocation({
        deliveryId,
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: new Date(Date.now() - 91_000).toISOString(),
    });
    assert.equal(getLiveLocation(deliveryId), undefined);
});
test("clearing location broadcasts a clear event without retaining coordinates", () => {
    const deliveryId = "delivery-clear-test";
    let clearedId = "";
    setLocationClearBroadcaster((id) => {
        clearedId = id;
    });
    setLiveLocation({
        deliveryId,
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: new Date().toISOString(),
    });
    clearLiveLocation(deliveryId);
    assert.equal(clearedId, deliveryId);
    assert.equal(getLiveLocation(deliveryId), undefined);
    setLocationClearBroadcaster(() => { });
});
