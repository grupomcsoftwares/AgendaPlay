import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { WebhookHandlers } from "./webhookHandlers.js";

const app: Express = express();

app.set("trust proxy", 1);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        const rawPath = req.url?.split("?")[0] ?? "";
        const url = rawPath.replace(/\/appointments\/by-token\/[^/]+/, "/appointments/by-token/[REDACTED]");
        return { id: req.id, method: req.method, url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: unknown) {
      logger.error({ err: error }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

const replitDomains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => `https://${d.trim()}`).filter((d) => d.length > 8);
const allowedOrigins = new Set([...replitDomains, "http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || replitDomains.some((d) => origin.startsWith(d)) || origin.endsWith(".riker.replit.dev") || origin.endsWith(".expo.replit.dev")) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);

const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
sessionPool.on("error", (err: Error) => logger.error({ err }, "Session pool error"));

const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`;

sessionPool.query(SESSION_TABLE_SQL).catch((err: Error) => {
  logger.error({ err }, "Failed to create session table");
});

const SLUG_REDIRECTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "slug_redirects" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL,
  "old_slug" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_slug_redirects_user_id" ON "slug_redirects" ("user_id");
`;

sessionPool.query(SLUG_REDIRECTS_TABLE_SQL).catch((err: Error) => {
  logger.error({ err }, "Failed to create slug_redirects table");
});

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 90 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

export default app;
