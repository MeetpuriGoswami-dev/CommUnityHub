import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import organizationsRouter from "./organizations.ts";
import needsRouter from "./needs.ts";
import volunteersRouter from "./volunteers.ts";
import surveysRouter from "./surveys.ts";
import dashboardRouter from "./dashboard.ts";
import chatRouter from "./chat.ts";
import authRouter from "./auth.ts";
import smartDriveRouter from "./smart-drive.ts";
import attachmentsRouter from "./attachments.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(organizationsRouter);
router.use(needsRouter);
router.use(volunteersRouter);
router.use(surveysRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(smartDriveRouter);
router.use(attachmentsRouter);

export default router;
