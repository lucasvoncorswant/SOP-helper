import { createSlackApp } from "./slackApp.js";

const app = createSlackApp();

const port = parseInt(process.env.PORT ?? "3000", 10);

(async () => {
  await app.start(port);
  console.log(`SOP helper Slack app is running (port ${port}).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
