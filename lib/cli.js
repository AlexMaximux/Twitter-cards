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
  if (host === "x.com") {
    parsed.hostname = "twitter.com";
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
  -b, --background <path> Custom background image path (replaces gradient)
  -s, --scale <value>   Scale multiplier of tweet card (e.g. 2x, 0.8) (default: 1.5)
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
  xshot "https://x.com/user/status/123" -b ./assets/1.jpeg -s 2x
`);
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  let format = "story";
  let output = null;
  let html = defaultPreviewHtml;
  let tweetUrl = null;
  let hideStats = true;
  let background = null;
  let scale = 1.5;

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
    } else if (arg === "--background" || arg === "-b") {
      background = args[++i];
    } else if (arg === "--scale" || arg === "-s" || arg === "--size") {
      const val = args[++i];
      scale = parseFloat(val.replace("x", ""));
      if (isNaN(scale)) {
        throw new Error(`Invalid scale value: ${val}`);
      }
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

  const normalizedUrl = tweetUrl ? normalizeTweetUrl(tweetUrl) : null;
  let statusId = "tweet";
  if (normalizedUrl) {
    const match = normalizedUrl.match(/\/status\/(\d+)/);
    if (match) statusId = match[1];
  }

  return {
    format,
    output: output ?? join(process.cwd(), `${statusId}.png`),
    html,
    background,
    scale,
    tweetUrl: normalizedUrl,
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
  console.log(`Scale:  ${opts.scale}x`);
  if (opts.background) console.log(`Background: ${opts.background}`);
  console.log(`Output: ${opts.output}`);

  try {
    const finalOutput = await captureScreenshot(opts);
    console.log(`Saved ${finalOutput}`);
  } catch (err) {
    console.error(`Screenshot failed:`, err.stack);
    process.exit(1);
  }
}
