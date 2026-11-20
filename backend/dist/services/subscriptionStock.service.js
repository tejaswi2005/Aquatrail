export function getSubscriptionProductAvailabilityError(stockQuantity, quantityPerDelivery) {
    if (stockQuantity <= 0)
        return "PRODUCT_UNAVAILABLE";
    if (stockQuantity < quantityPerDelivery)
        return "INSUFFICIENT_STOCK";
    return null;
}
