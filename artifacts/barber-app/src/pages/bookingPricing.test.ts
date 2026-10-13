import assert from "node:assert/strict";
import test from "node:test";
import {
  getEffectiveServicePrice,
  getServiceCardPriceDisplay,
  getTotalServicePrice,
} from "./bookingPricing.ts";

const serviceWithDailyPrices = {
  price: 70,
  dayPricing: [
    { dayOfWeek: 0, price: 40 },
    { dayOfWeek: 1, price: 55 },
  ],
};

test("public booking shows the initial day's discount on the service card", () => {
  const sunday = new Date(2026, 9, 11);
  const cardPrice = getServiceCardPriceDisplay(serviceWithDailyPrices, sunday, true);

  assert.deepEqual(cardPrice, {
    regularPrice: 70,
    currentPrice: 40,
    isPromotional: true,
  });
});

test("changing the booking date updates the summary price and total", () => {
  const monday = new Date(2026, 9, 12);
  const servicePrice = getEffectiveServicePrice(serviceWithDailyPrices, monday);

  assert.equal(servicePrice, 55);
  assert.equal(getTotalServicePrice([serviceWithDailyPrices], monday), 55);
});

test("a service without a daily price keeps its base price", () => {
  const monday = new Date(2026, 9, 12);
  assert.equal(getEffectiveServicePrice({ price: 35 }, monday), 35);
});

test("the initial service card omits all price data when prices are hidden", () => {
  const sunday = new Date(2026, 9, 11);
  assert.equal(getServiceCardPriceDisplay(serviceWithDailyPrices, sunday, false), null);
});
