import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health.js";
import clientsRouter from "./clients.js";
import servicesRouter from "./services.js";
import appointmentsRouter from "./appointments.js";
import queueRouter from "./queue.js";
import dashboardRouter from "./dashboard.js";
import financialRouter from "./financial.js";
import settingsRouter from "./settings.js";
import barbersRouter from "./barbers.js";
import comboDiscountsRouter from "./combo-discounts.js";
import loyaltyRouter from "./loyalty.js";
import subscriptionsRouter from "./subscriptions.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import stripeRouter from "./stripe.js";
import shopRouter from "./shop.js";
import pushRouter from "./push.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { accountCanAccess } from "./accountStatus.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

async function requireActiveAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const [user] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      stripeCurrentPeriodEnd: usersTable.stripeCurrentPeriodEnd,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
      maxBarbers: usersTable.maxBarbers,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !accountCanAccess(user)) {
    res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      error: "A assinatura ou o período de teste expirou.",
    });
    return;
  }
  next();
}

const router: IRouter = Router();

router.use(authRouter);
router.use(usersRouter);
router.use(pushRouter);
router.use(stripeRouter);
router.use(healthRouter);
router.use(shopRouter);

// services and appointments contain both public and admin routes;
// requireAuth is applied at individual route level inside those files.
router.use(servicesRouter);
router.use(appointmentsRouter);

// Mixed public/admin routers — requireAuth applied at route level inside each file
router.use(settingsRouter);
router.use(barbersRouter);
router.use(comboDiscountsRouter);
router.use(loyaltyRouter);
router.use(subscriptionsRouter);

// Purely admin routers — always require auth
const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(clientsRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(financialRouter);

router.use(adminRouter);

// Queue access is separately guarded because the TV app consumes these
// endpoints directly and must stop working as soon as billing expires.
const activeQueueRouter = Router();
activeQueueRouter.use(requireAuth);
activeQueueRouter.use(requireActiveAccount);
activeQueueRouter.use(queueRouter);
router.use(activeQueueRouter);

export default router;
