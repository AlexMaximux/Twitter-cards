import { readFileSync } from "fs";
import { join, resolve } from "path";
import { captureScreenshot, FORMATS } from "./capture.js";
import { defaultPreviewHtml, packageRoot } from "./paths.js";

const VERSION = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf-8")
).version;

export function normalizeTweetUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid tweet URL: ${url}`);
  }

  const host = parsed.hostname.replace(/^www\./, "");
  if (!["x.com", "twitter.com"].includes(host)) {
    throw new Error("Tweet URL must be on x.com or twitter.com.");
  }

  if (!parsed.pathname.includes("/status/")) {
    throw new Error("Tweet URL must be a status link (contain /status/).");
  }

  return parsed.toString();
}

export function printHelp() {
  console.log(`xshot — capture X posts as Instagram-ready portrait screenshots

Usage:
  xshot <tweet-url> [options]
  xshot --url <tweet-url> [options]

Options:
  -u, --url <url>       Tweet URL (x.com or twitter.com status link)
  -f, --format <type>   story | post (default: story)
  -o, --output <path>   Output PNG path (default: tweet-<format>.png)
      --html <path>     Custom HTML template (default: bundled preview.html)
      --no-stats        Hide likes, replies, and action buttons (default)
      --stats           Show engagement stats and action buttons
  -h, --help            Show help
  -V, --version         Show version

Formats:
  story  1080×1920  Instagram Stories / Reels
  post   1080×1350  Instagram portrait feed post

Examples:
  xshot "https://x.com/user/status/123456789"
  xshot -u "https://x.com/user/status/123" -f post -o my-tweet.png
  xshot "https://x.com/user/status/123" --stats
`);
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  let format = "story";
  let output = null;
  let html = defaultPreviewHtml;
  let tweetUrl = null;
  let hideStats = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--format" || arg === "-f") {
      format = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      output = args[++i];
    } else if (arg === "--html") {
      html = resolve(args[++i]);
    } else if (arg === "--url" || arg === "-u") {
      tweetUrl = args[++i];
    } else if (arg === "--no-stats") {
      hideStats = true;
    } else if (arg === "--stats") {
      hideStats = false;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else if (arg === "--version" || arg === "-V") {
      return { version: true };
    } else if (!arg.startsWith("-") && !tweetUrl) {
      tweetUrl = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!FORMATS[format]) {
    throw new Error(`Unknown format "${format}". Use story or post.`);
  }

  return {
    format,
    output: output ?? join(process.cwd(), `tweet-${format}.png`),
    html,
    tweetUrl: tweetUrl ? normalizeTweetUrl(tweetUrl) : null,
    hideStats,
    ...FORMATS[format],
  };
}

export async function run(argv = process.argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.version) {
    console.log(VERSION);
    return;
  }

  if (!opts.tweetUrl) {
    console.error("Error: Tweet URL is required.\n");
    printHelp();
    process.exit(1);
  }

  console.log(`Format: ${opts.label} (${opts.width}×${opts.height})`);
  console.log(`Tweet:  ${opts.tweetUrl}`);
  console.log(`Stats:  ${opts.hideStats ? "hidden" : "shown"}`);
  console.log(`Output: ${opts.output}`);

  try {
    await captureScreenshot(opts);
    console.log(`Saved ${opts.output}`);
  } catch (err) {
    console.error(`Screenshot failed: ${err.message}`);
    process.exit(1);
  }
}
