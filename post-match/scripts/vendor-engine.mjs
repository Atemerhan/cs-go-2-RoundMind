import { execSync } from "node:child_process";
import { mkdirSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const dest = path.resolve(here, "../vendor/engine");
const ref = "origin/cursor/evaluate-buy-options-8c16";

try {
  execSync(`git rev-parse --verify ${ref}`, { cwd: repoRoot, stdio: "ignore" });
} catch {
  execSync("git fetch origin cursor/evaluate-buy-options-8c16", { cwd: repoRoot, stdio: "inherit" });
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
execSync(`git archive ${ref} packages/engine | tar -x --strip-components=2 -C "${dest}"`, {
  cwd: repoRoot,
  stdio: "inherit",
});
unlinkSync(path.join(dest, "tsconfig.json"));
