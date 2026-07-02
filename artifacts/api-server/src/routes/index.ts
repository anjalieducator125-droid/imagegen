import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imagesRouter from "./images";
import googleTestRouter from "./googleTest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imagesRouter);
router.use(googleTestRouter);

export default router;
