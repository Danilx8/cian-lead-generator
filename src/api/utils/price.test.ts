import { calculateDiscount, calculateSubscriptionPrice, SubscriptionType } from "./price.util";

describe("calculateDiscount", () => {
  it("должна возвращать корректное значение для указанных дней", () => {
    expect(calculateDiscount(1)).toBe(0);
    expect(calculateDiscount(2)).toBe(0.05);
    expect(calculateDiscount(3)).toBe(0.07);
    expect(calculateDiscount(5)).toBe(0.1);
    expect(calculateDiscount(7)).toBe(0.15);
    expect(calculateDiscount(14)).toBe(0.2);
    expect(calculateDiscount(30)).toBe(0.25);
  });

  it("должна возвращать значение по умолчанию, если дней нет в мапе", () => {
    expect(calculateDiscount(4)).toBe(0.3);
    expect(calculateDiscount(10)).toBe(0.3);
  });
});

describe("calculateSubscriptionPrice", () => {
  it("должна корректно вычислять цену для базового типа подписки (basic)", () => {
    const slots = 2;
    const days = 2;
    const type = "basic" as SubscriptionType;
    const expectedPrice = 15 * slots * days * 0.05;
    expect(calculateSubscriptionPrice(slots, days, type)).toBeCloseTo(expectedPrice);
  });

  it("должна корректно вычислять цену для подписки другого типа (например, premium)", () => {
    const slots = 3;
    const days = 5;
    const type = "pro" as SubscriptionType;
    const expectedPrice = 20 * slots * days * 0.1;
    expect(calculateSubscriptionPrice(slots, days, type)).toBeCloseTo(expectedPrice);
  });

  it("должна использовать discount по умолчанию, если дней нет в мапе", () => {
    const slots = 2;
    const days = 4;
    const type = "basic" as SubscriptionType;
    const expectedPrice = 15 * slots * days * 0.3;
    expect(calculateSubscriptionPrice(slots, days, type)).toBeCloseTo(expectedPrice);
  });

  it("должна возвращать 0, если slots или days равны 0", () => {
    expect(calculateSubscriptionPrice(0, 5, "basic" as SubscriptionType)).toBe(0);
    expect(calculateSubscriptionPrice(2, 0, "pro" as SubscriptionType)).toBe(0);
  });
});
