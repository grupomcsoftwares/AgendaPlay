import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  // First try direct env var (fastest path)
  if (process.env.STRIPE_SECRET_KEY) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  // Fall back to Replit connector proxy
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", "X-REPLIT-TOKEN": xReplitToken },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (resp.ok) {
      const data = await resp.json() as { items?: Array<{ settings?: { secret_key?: string; webhook_secret?: string } }> };
      const settings = data.items?.[0]?.settings;
      if (settings?.secret_key) {
        return {
          secretKey: settings.secret_key,
          webhookSecret: settings.webhook_secret,
        };
      }
    }
  }

  throw new Error(
    'Stripe secret key not found. ' +
    'Set STRIPE_SECRET_KEY in Secrets or connect Stripe via the Integrations tab.'
  );
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? '',
  });
}
