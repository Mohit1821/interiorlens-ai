import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import interiorlensRouter from "./interiorlens";
import storageRouter from "./storage";
import vendorCheckRouter from "./vendor-check";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(interiorlensRouter);
router.use(vendorCheckRouter);

export default router;
