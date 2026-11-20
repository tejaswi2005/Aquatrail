import assert from "node:assert/strict";
import test from "node:test";
import { getSubscriptionProductAvailabilityError } from "./subscriptionStock.service.js";
test("subscription product availability requires stock for one delivery", () => {
    assert.equal(getSubscriptionProductAvailabilityError(0, 1), "PRODUCT_UNAVAILABLE");
    assert.equal(getSubscriptionProductAvailabilityError(1, 2), "INSUFFICIENT_STOCK");
    assert.equal(getSubscriptionProductAvailabilityError(2, 2), null);
    assert.equal(getSubscriptionProductAvailabilityError(5, 2), null);
});
