import assert from "node:assert/strict";
import test from "node:test";
import { canPublishDeliveryLocation } from "./liveLocation.service.js";
test("only the assigned driver can publish while delivery is started", () => {
    const allowed = canPublishDeliveryLocation({
        role: "DRIVER",
        userId: "driver-user",
        assignedDriverUserId: "driver-user",
        deliveryStatus: "STARTED",
    });
    const unassignedDriver = canPublishDeliveryLocation({
        role: "DRIVER",
        userId: "other-driver",
        assignedDriverUserId: "driver-user",
        deliveryStatus: "STARTED",
    });
    const customer = canPublishDeliveryLocation({
        role: "CUSTOMER",
        userId: "driver-user",
        assignedDriverUserId: "driver-user",
        deliveryStatus: "STARTED",
    });
    const pendingDelivery = canPublishDeliveryLocation({
        role: "DRIVER",
        userId: "driver-user",
        assignedDriverUserId: "driver-user",
        deliveryStatus: "PENDING",
    });
    assert.equal(allowed, true);
    assert.equal(unassignedDriver, false);
    assert.equal(customer, false);
    assert.equal(pendingDelivery, false);
});
