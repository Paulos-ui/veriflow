import { register } from "node:module";

// Installs the `@/` alias resolver for the test run. Kept separate from
// resolver.mjs because a hook module must not import the thing registering it.
//
// `import.meta.url` is already a file:// URL — passing it through
// pathToFileURL() a second time yields file:///…/file:/… and resolves nowhere.
register("./resolver.mjs", import.meta.url);
