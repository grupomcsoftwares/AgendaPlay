import app from "./app.js";
import { logger } from "./lib/logger.js";
import { pool } from "@workspace/db";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient.js";
import { getUncachableStripeClient } from "./stripeClient.js";
import { runPushScheduler } from "./routes/push.js";
import { startAppointmentScheduler } from "./routes/appointments.js";
import { cleanupWaitlist } from "./waitlistService.js";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const LIVE_PLANS = [
  { name: "BarberApp — 1 Profissional", amount: 2490, maxBarbers: 1, description: "Para barbearias com 1 profissional." },
  { name: "BarberApp — 2 Profissionais", amount: 4990, maxBarbers: 2, description: "Para barbearias com até 2 profissionais." },
  { name: "BarberApp — 3 Profissionais", amount: 7490, maxBarbers: 3, description: "Para barbearias com até 3 profissionais." },
  { name: "BarberApp — Ilimitado", amount: 9990, maxBarbers: 0, description: "Para barbearias com 4 ou mais profissionais. Sem limites." },
] as const;

async function ensureApplicationSchema() {
  await pool.query(`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "stripe_payment_failing" boolean NOT NULL DEFAULT false;
  `);
  logger.info("Application schema ready");
}

async function ensureLiveSubscriptionPlans() {
  if (process.env.NODE_ENV !== "production") return;

  const stripe = await getUncachableStripeClient();
  for (const plan of LIVE_PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });
    const product = existing.data[0] ?? await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { maxBarbers: String(plan.maxBarbers) },
    });

    if (product.metadata?.maxBarbers !== String(plan.maxBarbers)) {
      await stripe.products.update(product.id, {
        metadata: { ...product.metadata, maxBarbers: String(plan.maxBarbers) },
      });
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "recurring",
      limit: 100,
    });
    const hasExpectedPrice = prices.data.some((price) =>
      price.unit_amount === plan.amount
      && price.currency === "brl"
      && price.recurring?.interval === "month"
      && price.recurring.interval_count === 1
    );

    if (!hasExpectedPrice) {
      await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: "brl",
        recurring: { interval: "month" },
      });
    }
  }
  logger.info("Stripe live subscription plans verified");
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();
    await ensureLiveSubscriptionPlans();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      logger.info({ webhookUrl }, "Stripe webhook configured");
    }

    stripeSync.syncBackfill().then(() => {
      logger.info("Stripe data synced");
    }).catch((err: unknown) => {
      logger.error({ err }, "Stripe backfill error");
    });
  } catch (err) {
    logger.warn({ err }, "Stripe init failed — continuing without Stripe");
  }
}

await ensureApplicationSchema();
await initStripe();
runPushScheduler();
startAppointmentScheduler();
setInterval(() => cleanupWaitlist().catch(() => {}), 60_000);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
