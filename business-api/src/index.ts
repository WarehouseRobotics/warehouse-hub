import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";
import { logger } from "./lib/logger.js";

initializeDatabase();

const app = createApp();
app.listen(config.PORT, () => {
  logger.info("Business API server started", {
    port: config.PORT,
    url: `http://localhost:${config.PORT}`,
  });
});
