import "dotenv/config";
import { buildApp } from "./app";

async function main() {
  const app = await buildApp();
  const port = Number(process.env.PORT) || 4000;

  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Schedule Intelligence API listening on :${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
