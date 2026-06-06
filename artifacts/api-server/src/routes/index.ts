import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(authRouter);
router.use(stripeRouter);
router.use(healthRouter);
router.use(clientsRouter);
router.use(servicesRouter);
router.use(appointmentsRouter);
router.use(queueRouter);
router.use(dashboardRouter);
router.use(financialRouter);
router.use(settingsRouter);
router.use(barbersRouter);

export default router;
