import { DEFAULT_PORT } from "@broken-ash/shared";
import { startServer } from "./startServer.js";

const port = Number(process.env.PORT) || DEFAULT_PORT;
await startServer(port);
console.log(`[broken-ash] server listening on ws://localhost:${port}`);
