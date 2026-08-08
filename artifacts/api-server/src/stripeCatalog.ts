import Stripe from "stripe";

export const AUTHORIZED_STRIPE_PLANS = [
  { name: "BarberApp — 1 Profissional", amount: 2490, maxBarbers: 1 },
  { name: "BarberApp — 2 Profissionais", amount: 4990, maxBarbers: 2 },
  { name: "BarberApp — 3 Profissionais", amount: 7490, maxBarbers: 3 },
  { name: "BarberApp — Ilimitado", amount: 9990, maxBarbers: 0 },
] as const;

export function isAuthorizedStripeCatalogEntry(
  product: Stripe.Product,
  price: Stripe.Price,
): boolean {
  const plan = AUTHORIZED_STRIPE_PLANS.find((candidate) =>
    candidate.name === product.name &&
    candidate.amount === price.unit_amount &&
    String(candidate.maxBarbers) === product.metadata?.maxBarbers,
  );
  return Boolean(
    plan &&
    product.active &&
    price.active &&
    price.type === "recurring" &&
    price.currency.toLowerCase() === "brl" &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1,
  );
}

export async function getAuthorizedStripePrice(
  stripe: Stripe,
  priceId: string,
): Promise<Stripe.Price | null> {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = typeof price.product === "string"
      ? await stripe.products.retrieve(price.product)
      : price.product;
    if (!product || "deleted" in product || !product.active) return null;

    if (!isAuthorizedStripeCatalogEntry(product, price)) {
      return null;
    }
    return price;
  } catch {
    return null;
  }
}