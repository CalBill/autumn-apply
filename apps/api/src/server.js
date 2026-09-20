import { createLocalApiServer, DEFAULT_HOST, DEFAULT_PORT, listen } from "./http.js";

const port = Number(process.env.AUTUMN_APPLY_PORT) || DEFAULT_PORT;
const server = createLocalApiServer();
const address = await listen(server, { host: DEFAULT_HOST, port });

console.log(`AutumnApply local API listening on http://${address.address}:${address.port}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
