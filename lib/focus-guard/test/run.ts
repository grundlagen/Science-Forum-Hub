/**
 * Focus Guard self-check runner.
 *
 * The assertions live in ../src/selfCheck.ts as a pure function so they are
 * typechecked with the package. This runner just prints them and sets the exit
 * code. The repo is authored for a bundler (extensionless, "workspace"
 * conditions), so run it through esbuild:
 *
 *   pnpm --filter @workspace/focus-guard run verify
 *
 * which expands to: esbuild test/run.ts --bundle --platform=node --format=esm
 * | node -
 */
import { selfCheck } from "../src/selfCheck";

const result = selfCheck();

for (const f of result.failures) {
  console.error(`FAIL: ${f.name}\n      ${f.detail}`);
}
console.log(`\nFocus Guard self-check: ${result.passed} passed, ${result.failed} failed`);

process.exit(result.failed === 0 ? 0 : 1);
