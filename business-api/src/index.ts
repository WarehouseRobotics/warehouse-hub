import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";

initializeDatabase();

const app = createApp();
app.listen(config.PORT, () => {
  console.log(`Business API listening on http://localhost:${config.PORT}`);
});
