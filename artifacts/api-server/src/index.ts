import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);
const host = "0.0.0.0";

const server = app.listen(port, host, () => {
  logger.info({ port, host }, `Server listening on http://${host}:${port}`);
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
