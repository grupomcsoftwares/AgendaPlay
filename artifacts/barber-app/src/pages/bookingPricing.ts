export type DayPricing = {
  dayOfWeek: number;
  price: number | string;
};

export type PricedService = {
  price: number | string;
  dayPricing?: DayPricing[] | null;
};

export type ServiceCardPriceDisplay = {
  regularPrice: number;
  currentPrice: number;
  isPromotional: boolean;
};

export function getEffectiveServicePrice(service: PricedService, date: Date): number {
  const regularPrice = Number(service.price);
  const dayPrice = service.dayPricing?.find(item => item.dayOfWeek === date.getDay());
  const selectedPrice = dayPrice ? Number(dayPrice.price) : regularPrice;
  return Number.isFinite(selectedPrice) ? selectedPrice : regularPrice;
}

export function getTotalServicePrice(services: PricedService[], date: Date): number {
  return services.reduce((total, service) => total + getEffectiveServicePrice(service, date), 0);
}

export function getPromotionalServicePrice(service: PricedService, date: Date): number | null {
  const regularPrice = Number(service.price);
  if (!Number.isFinite(regularPrice)) return null;

  const dayPrice = service.dayPricing?.find(item => item.dayOfWeek === date.getDay());
  if (!dayPrice) return null;

  const promotionalPrice = Number(dayPrice.price);
  return Number.isFinite(promotionalPrice) && promotionalPrice < regularPrice
    ? promotionalPrice
    : null;
}

export function getServiceCardPriceDisplay(
  service: PricedService,
  date: Date,
  showPrices: boolean,
): ServiceCardPriceDisplay | null {
  if (!showPrices) return null;

  const regularPrice = Number(service.price);
  const promotionalPrice = getPromotionalServicePrice(service, date);
  return {
    regularPrice,
    currentPrice: promotionalPrice ?? getEffectiveServicePrice(service, date),
    isPromotional: promotionalPrice !== null,
  };
}
