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
import authRouter from "./auth.js";
import stripeRouter from "./stripe.js";

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

const router: IRouter = Router();

router.use(authRouter);
router.use(stripeRouter);
router.use(healthRouter);

const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(clientsRouter);
adminRouter.use(servicesRouter);
adminRouter.use(appointmentsRouter);
adminRouter.use(queueRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(financialRouter);
adminRouter.use(settingsRouter);
adminRouter.use(barbersRouter);

router.use(adminRouter);

export default router;
