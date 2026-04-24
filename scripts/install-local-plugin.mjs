#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const pluginName = "codex-stats";

const pluginsDir = path.join(os.homedir(), "plugins");
const linkedPluginPath = path.join(pluginsDir, pluginName);
const marketplaceDir = path.join(os.homedir(), ".agents", "plugins");
const marketplacePath = path.join(marketplaceDir, "marketplace.json");
const pluginCachePath = path.join(
  os.homedir(),
  ".codex",
  "plugins",
  "cache",
  "local",
  pluginName,
);

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeSymlink() {
  await ensureDir(pluginsDir);
  try {
    const existing = await fs.readlink(linkedPluginPath);
    if (existing === pluginRoot) {
      return;
    }
    await fs.unlink(linkedPluginPath);
  } catch {
    try {
      await fs.rm(linkedPluginPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  await fs.symlink(pluginRoot, linkedPluginPath);
}

async function readMarketplace() {
  try {
    const raw = await fs.readFile(marketplacePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      name: "local",
      interface: {
        displayName: "Local Plugins",
      },
      plugins: [],
    };
  }
}

function upsertPluginEntry(marketplace) {
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = {
    name: pluginName,
    source: {
      source: "local",
      path: `./plugins/${pluginName}`,
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };

  const existingIndex = plugins.findIndex((plugin) => plugin?.name === pluginName);
  if (existingIndex >= 0) {
    plugins[existingIndex] = entry;
  } else {
    plugins.push(entry);
  }

  return {
    name: typeof marketplace.name === "string" && marketplace.name ? marketplace.name : "local",
    interface:
      marketplace.interface && typeof marketplace.interface === "object"
        ? {
            displayName:
              typeof marketplace.interface.displayName === "string" &&
              marketplace.interface.displayName
                ? marketplace.interface.displayName
                : "Local Plugins",
          }
        : { displayName: "Local Plugins" },
    plugins,
  };
}

async function writeMarketplace() {
  await ensureDir(marketplaceDir);
  const marketplace = upsertPluginEntry(await readMarketplace());
  await fs.writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
}

async function clearCachedPlugin() {
  await fs.rm(pluginCachePath, { recursive: true, force: true });
}

async function main() {
  await writeSymlink();
  await writeMarketplace();
  await clearCachedPlugin();

  process.stdout.write(
    [
      `Installed local plugin: ${pluginName}`,
      `Symlink: ${linkedPluginPath} -> ${pluginRoot}`,
      `Marketplace: ${marketplacePath}`,
      `Cleared cache: ${pluginCachePath}`,
      "Restart Codex to reload local plugins.",
      "",
      "Suggested usage after restart:",
      "  $codex-stats:stats",
      "",
      "Experimental command definitions are packaged but may not be discoverable:",
      "  /codex-stats:stats",
      "  /codex-stats:models",
    ].join("\n"),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
