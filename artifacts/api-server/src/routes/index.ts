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
import waitlistRouter from "./waitlist.js";
import { requireActiveAccount } from "../middleware/accountActive.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

const router: IRouter = Router();

router.use(authRouter);
router.use(usersRouter);
router.use(pushRouter);
router.use(waitlistRouter);
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
adminRouter.use(requireActiveAccount);
adminRouter.use(clientsRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(financialRouter);

router.use(adminRouter);

// Queue access is separately guarded because the TV app consumes these
// endpoints directly and must stop working as soon as billing expires.
const activeQueueRouter = Router();
activeQueueRouter.use(requireActiveAccount);
activeQueueRouter.use(queueRouter);
router.use(activeQueueRouter);

export default router;
