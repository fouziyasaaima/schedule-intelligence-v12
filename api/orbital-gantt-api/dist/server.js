"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
async function main() {
    const app = await (0, app_1.buildApp)();
    const port = Number(process.env.PORT) || 4000;
    try {
        await app.listen({ port, host: "0.0.0.0" });
        app.log.info(`Schedule Intelligence API listening on :${port}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=server.js.map