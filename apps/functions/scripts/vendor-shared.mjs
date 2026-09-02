import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const functionsDirectory = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const destination = resolve(functionsDirectory, "vendor/shared");
const aiDestination = resolve(functionsDirectory, "vendor/ai-core");
const integrationsDestination = resolve(
  functionsDirectory,
  "vendor/integrations",
);
await rm(destination, { recursive: true, force: true });
await rm(aiDestination, { recursive: true, force: true });
await rm(integrationsDestination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await mkdir(aiDestination, { recursive: true });
await mkdir(integrationsDestination, { recursive: true });
await cp(
  resolve(functionsDirectory, "../../packages/shared/dist"),
  resolve(destination, "dist"),
  { recursive: true },
);
await cp(
  resolve(functionsDirectory, "../../packages/ai-core/dist"),
  resolve(aiDestination, "dist"),
  { recursive: true },
);
await cp(
  resolve(functionsDirectory, "../../packages/integrations/dist"),
  resolve(integrationsDestination, "dist"),
  { recursive: true },
);
await writeFile(
  resolve(destination, "package.json"),
  JSON.stringify(
    {
      name: "@tlc/shared",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
      dependencies: { zod: "^4.1.5" },
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(aiDestination, "package.json"),
  JSON.stringify(
    {
      name: "@tlc/ai-core",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(integrationsDestination, "package.json"),
  JSON.stringify(
    {
      name: "@tlc/integrations",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    },
    null,
    2,
  ),
);
