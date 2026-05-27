import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import servicesRouter from "./services";
import appointmentsRouter from "./appointments";
import queueRouter from "./queue";
import dashboardRouter from "./dashboard";
import financialRouter from "./financial";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(servicesRouter);
router.use(appointmentsRouter);
router.use(queueRouter);
router.use(dashboardRouter);
router.use(financialRouter);
router.use(settingsRouter);

export default router;
