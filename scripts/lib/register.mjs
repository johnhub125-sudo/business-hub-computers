// Lets CLI scripts import server modules: resolves "server-only" to an empty module
// (for both ESM imports and CommonJS requires, which tsx uses for .ts files).
// Usage: node --import tsx --import ./scripts/lib/register.mjs scripts/<file>.tsx
import Module, { register } from "node:module";
import { fileURLToPath } from "node:url";

const empty = fileURLToPath(new URL("./empty.cjs", import.meta.url));

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return empty;
  return original.call(this, request, ...rest);
};

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
