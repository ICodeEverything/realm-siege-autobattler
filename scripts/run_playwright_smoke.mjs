import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const clientScript = path.join(
  codexHome,
  "skills",
  "develop-web-game",
  "scripts",
  "web_game_playwright_client.js"
);

if (!fs.existsSync(clientScript)) {
  console.error(`Playwright client not found at: ${clientScript}`);
  process.exit(1);
}

const tempClientPath = path.join(process.cwd(), "output", "web-game-client-temp.mjs");
fs.mkdirSync(path.dirname(tempClientPath), { recursive: true });
fs.copyFileSync(clientScript, tempClientPath);

const child = spawn(process.execPath, [tempClientPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  try {
    fs.unlinkSync(tempClientPath);
  } catch {
    // Ignore cleanup errors.
  }
  process.exit(code ?? 1);
});
