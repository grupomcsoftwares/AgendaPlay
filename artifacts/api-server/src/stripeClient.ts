import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const isProduction = process.env.NODE_ENV === "production";
  const envSecret = process.env.STRIPE_SECRET_KEY;

  // Development keeps using the explicit test secret when present. Production
  // must prefer the environment-aware Replit Stripe connection so a shared
  // sk_test_* secret cannot override the live connection.
  if (!isProduction && envSecret) {
    return {
      secretKey: envSecret,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  // Resolve the Replit connection for the current runtime environment.
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
      const data = await resp.json() as {
        items?: Array<{
          environment?: string;
          settings?: {
            secret?: string;
            secret_key?: string;
            webhook_secret?: string;
            webhookSecret?: string;
          };
        }>;
      };
      const desiredEnvironment = isProduction ? "production" : "development";
      const item = data.items?.find((candidate) => candidate.environment === desiredEnvironment)
        ?? data.items?.[0];
      const settings = item?.settings;
      const secretKey = settings?.secret_key ?? settings?.secret;
      if (secretKey) {
        return {
          secretKey,
          webhookSecret: settings?.webhook_secret ?? settings?.webhookSecret,
        };
      }
    }
  }

  if (envSecret && (!isProduction || !envSecret.startsWith("sk_test_"))) {
    return {
      secretKey: envSecret,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
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
