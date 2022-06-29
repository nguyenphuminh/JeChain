const { startServer } = require("./src/node/server");
const config = require("./config.json");

(async () => {
    await startServer(config);
})();
