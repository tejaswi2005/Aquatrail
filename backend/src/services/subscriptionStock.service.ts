export function getSubscriptionProductAvailabilityError(
  stockQuantity: number,
  quantityPerDelivery: number
): "PRODUCT_UNAVAILABLE" | "INSUFFICIENT_STOCK" | null {
  if (stockQuantity <= 0) return "PRODUCT_UNAVAILABLE";
  if (stockQuantity < quantityPerDelivery) return "INSUFFICIENT_STOCK";
  return null;
}
