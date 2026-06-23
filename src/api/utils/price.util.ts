export type SubscriptionType = "basic" | "pro";

export const calculateDiscount = (days: number): number => {
  const discountMap: Record<number, number> = {
    1: 0,
    2: 0.05,
    3: 0.07,
    5: 0.1,
    7: 0.15,
    14: 0.2,
    30: 0.25
  };

  return discountMap[days] ?? 0.3;
};

export const calculateSubscriptionPrice = (slots: number, days: number, type: SubscriptionType) => {
  let price = 0;

  let pricePerSlot = type === "basic" ? 15 : 20;

  price = pricePerSlot * slots * days * calculateDiscount(days);

  return price;
};
