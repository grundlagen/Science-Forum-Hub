import { Router, type IRouter } from "express";
import healthRouter from "./health";
import papersRouter from "./papers";
import reviewsRouter from "./reviews";
import commentsRouter from "./comments";
import feedRouter from "./feed";
import usersRouter from "./users";
import focusRouter from "./focus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(papersRouter);
router.use(reviewsRouter);
router.use(commentsRouter);
router.use(feedRouter);
router.use(usersRouter);
router.use(focusRouter);

export default router;
