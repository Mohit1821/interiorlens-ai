import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

const candidatePaths = [
  path.resolve(process.cwd(), "artifacts/interiorlens/dist/public"),
  path.resolve(__dirname, "../../interiorlens/dist/public"),
  path.resolve(__dirname, "../interiorlens/dist/public"),
];

const publicPath = candidatePaths.find((p) => fs.existsSync(p));

if (publicPath) {
  app.use(express.static(publicPath));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(publicPath, "index.html"));
    }
    next();
  });
}

export default app;
