#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Load .env file relative to the project root if it exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "../.env");

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[0].split("=")[0].trim();
      const val = trimmed.substring(trimmed.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  }
}

import { run } from "../lib/cli.js";

run();
