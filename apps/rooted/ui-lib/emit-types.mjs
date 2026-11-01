// Writes dist-ui/index.d.ts after `tsc -p ui-lib/tsconfig.json`, so the design-system sync can read
// the components' types. Run by the sync's buildCmd, not by the app build.
import { writeFileSync } from 'node:fs';
writeFileSync(
  new URL('../dist-ui/index.d.ts', import.meta.url),
  "export * from './_types/ui-lib/index';\n"
);
