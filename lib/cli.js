import { readFileSync, existsSync } from "fs";
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
  xshot -makevideo "text to animate" [options]

Options:
  -u, --url <url>       Tweet URL (x.com or twitter.com status link)
  -makevideo, --animate-text <text> Text to animate into a 3-second Story video
  -f, --format <type>   story | post (default: story)
  -o, --output <path>   Output PNG path (default: tweet-<format>.png)
  -b, --background <path> Custom background image path (replaces gradient)
  -s, --scale <value>   Scale multiplier of tweet card (e.g. 2x, 0.8) (default: 1.5)
      --complex         Apply complex video/audio processing filters
      --complete        Generate a complete intro kinetic text animation and join it with the video tweet
      --end <path>      Add an outro video to the end of the generated video
      --video           Output only the video on background, omitting tweet info
      --html <path>     Custom HTML template (default: bundled preview.html)
      --no-stats        Hide likes, replies, and action buttons (default)
      --stats           Show engagement stats and action buttons
      --no-tts          Do not generate TTS audio for the hook/text animation
      --textColor <color> Text color (default: #ffffff)
      --bgColor <color>   Background color for text animation (e.g. #000000)
      --textBgColor <color> Text box background color (e.g. rgba(0,0,0,0.5))
      --hookTextColor <color> Text color for hook/intro video
      --hookBgColor <color> Page background color for hook/intro video
      --hookTextBgColor <color> Text box background color for hook/intro video
  -h, --help            Show help
  -V, --version         Show version

Formats:
  story  1080×1920  Instagram Stories / Reels
  post   1080×1350  Instagram portrait feed post

Examples:
  xshot "https://x.com/user/status/123456789"
  xshot -makevideo "ترامپ عصبانیتر از همیشه" -b ./assets/1.jpeg
  xshot -u "https://x.com/user/status/123" -f post -o my-tweet.png
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
  let scale = null;
  let complex = false;
  let videoOnly = false;
  let textAnimation = null;
  let complete = false;
  let endVideo = null;
  let noTts = false;
  let openrouterApiKey = null;
  let textColor = null;
  let bgColor = null;
  let textBgColor = null;
  let hookTextColor = null;
  let hookBgColor = null;
  let hookTextBgColor = null;

  let formatSpecified = false;
  let backgroundSpecified = false;
  let scaleSpecified = false;
  let hideStatsSpecified = false;
  let complexSpecified = false;
  let videoOnlySpecified = false;
  let endVideoSpecified = false;
  let noTtsSpecified = false;
  let textColorSpecified = false;
  let bgColorSpecified = false;
  let textBgColorSpecified = false;
  let hookTextColorSpecified = false;
  let hookBgColorSpecified = false;
  let hookTextBgColorSpecified = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--format" || arg === "-f") {
      format = args[++i];
      formatSpecified = true;
    } else if (arg === "--output" || arg === "-o") {
      output = args[++i];
    } else if (arg === "--html") {
      html = resolve(args[++i]);
    } else if (arg === "--url" || arg === "-u") {
      tweetUrl = args[++i];
    } else if (arg === "--background" || arg === "-b") {
      background = args[++i];
      backgroundSpecified = true;
    } else if (arg === "--scale" || arg === "-s" || arg === "--size") {
      const val = args[++i];
      scale = parseFloat(val.replace("x", ""));
      if (isNaN(scale)) {
        throw new Error(`Invalid scale value: ${val}`);
      }
      scaleSpecified = true;
    } else if (arg === "--no-stats") {
      hideStats = true;
      hideStatsSpecified = true;
    } else if (arg === "--stats") {
      hideStats = false;
      hideStatsSpecified = true;
    } else if (arg === "--complex" || arg === "-complex") {
      complex = true;
      complexSpecified = true;
    } else if (arg === "--video" || arg === "-video") {
      videoOnly = true;
      videoOnlySpecified = true;
    } else if (arg === "--animate-text" || arg === "-makevideo") {
      textAnimation = args[++i];
    } else if (arg === "--complete" || arg === "-complete") {
      complete = true;
    } else if (arg === "--end" || arg === "-end") {
      endVideo = resolve(args[++i]);
      endVideoSpecified = true;
    } else if (arg === "--no-tts" || arg === "-no-tts") {
      noTts = true;
      noTtsSpecified = true;
    } else if (arg === "--textColor") {
      textColor = args[++i];
      textColorSpecified = true;
    } else if (arg === "--bgColor") {
      bgColor = args[++i];
      bgColorSpecified = true;
    } else if (arg === "--textBgColor") {
      textBgColor = args[++i];
      textBgColorSpecified = true;
    } else if (arg === "--hookTextColor") {
      hookTextColor = args[++i];
      hookTextColorSpecified = true;
    } else if (arg === "--hookBgColor") {
      hookBgColor = args[++i];
      hookBgColorSpecified = true;
    } else if (arg === "--hookTextBgColor") {
      hookTextBgColor = args[++i];
      hookTextBgColorSpecified = true;
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

  if (complete) {
    const completeJsonPath = join(process.cwd(), "complete.json");
    if (existsSync(completeJsonPath)) {
      try {
        const config = JSON.parse(readFileSync(completeJsonPath, "utf-8"));
        console.log("Loading complete mode options from complete.json...");
        
        if (!backgroundSpecified && config.background !== undefined) {
          background = resolve(process.cwd(), config.background);
        }
        if (!endVideoSpecified && config.endVideo !== undefined) {
          endVideo = resolve(process.cwd(), config.endVideo);
        }
        if (!scaleSpecified && config.scale !== undefined) {
          scale = parseFloat(config.scale);
        }
        if (!formatSpecified && config.format !== undefined) {
          format = config.format;
        }
        if (!hideStatsSpecified && config.hideStats !== undefined) {
          hideStats = !!config.hideStats;
        }
        if (!complexSpecified && config.complex !== undefined) {
          complex = !!config.complex;
        }
        if (!videoOnlySpecified && config.videoOnly !== undefined) {
          videoOnly = !!config.videoOnly;
        }
        if (!noTtsSpecified && config.noTts !== undefined) {
          noTts = !!config.noTts;
        }
        if (!textColorSpecified) {
          textColor = config.textColor !== undefined ? config.textColor : config.fontColor;
        }
        if (!bgColorSpecified) {
          bgColor = config.bgColor !== undefined ? config.bgColor : config.backgroundColor;
        }
        if (!textBgColorSpecified) {
          textBgColor = config.textBgColor !== undefined ? config.textBgColor : config.textBackgroundColor;
        }
        if (!hookTextColorSpecified) {
          hookTextColor = config.hookTextColor !== undefined ? config.hookTextColor : config.hookFontColor;
        }
        if (!hookBgColorSpecified) {
          hookBgColor = config.hookBgColor !== undefined ? config.hookBgColor : config.hookBackgroundColor;
        }
        if (!hookTextBgColorSpecified) {
          hookTextBgColor = config.hookTextBgColor !== undefined ? config.hookTextBgColor : config.hookTextBackgroundColor;
        }
        if (config.openrouterApiKey || config.openRouterApiKey || config.OPENROUTER_API_KEY) {
          openrouterApiKey = config.openrouterApiKey || config.openRouterApiKey || config.OPENROUTER_API_KEY;
        }
      } catch (err) {
        console.error("Failed to parse complete.json:", err.message);
      }
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
  } else if (textAnimation) {
    statusId = "text-anim";
  }

  if (scale === null) {
    scale = complete ? 2.3 : 1.5;
  }

  return {
    format,
    output: output ?? join(process.cwd(), `${statusId}.png`),
    html,
    background,
    scale,
    tweetUrl: normalizedUrl,
    hideStats,
    complex,
    videoOnly,
    textAnimation,
    complete,
    endVideo,
    noTts,
    openrouterApiKey,
    textColor,
    bgColor,
    textBgColor,
    hookTextColor,
    hookBgColor,
    hookTextBgColor,
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

  if (!opts.tweetUrl && !opts.textAnimation) {
    console.error("Error: Tweet URL or -makevideo/--animate-text parameter is required.\n");
    printHelp();
    process.exit(1);
  }

  console.log(`Format: ${opts.label} (${opts.width}×${opts.height})`);
  if (opts.tweetUrl) console.log(`Tweet:  ${opts.tweetUrl}`);
  if (opts.textAnimation) console.log(`Text Animation: "${opts.textAnimation}"`);
  console.log(`Stats:  ${opts.hideStats ? "hidden" : "shown"}`);
  console.log(`Scale:  ${opts.scale}x`);
  console.log(`Complex: ${opts.complex ? "enabled" : "disabled"}`);
  console.log(`Complete: ${opts.complete ? "enabled" : "disabled"}`);
  console.log(`Video Only: ${opts.videoOnly ? "enabled" : "disabled"}`);
  console.log(`No TTS:   ${opts.noTts ? "enabled" : "disabled"}`);
  if (opts.endVideo) console.log(`End Video: ${opts.endVideo}`);
  if (opts.background) console.log(`Background: ${opts.background}`);
  if (opts.textColor) console.log(`Text Color: ${opts.textColor}`);
  if (opts.bgColor) console.log(`Bg Color:   ${opts.bgColor}`);
  if (opts.textBgColor) console.log(`Text Bg Color: ${opts.textBgColor}`);
  if (opts.hookTextColor) console.log(`Hook Text Color: ${opts.hookTextColor}`);
  if (opts.hookBgColor) console.log(`Hook Bg Color:   ${opts.hookBgColor}`);
  if (opts.hookTextBgColor) console.log(`Hook Text Bg Color: ${opts.hookTextBgColor}`);
  console.log(`Output: ${opts.output}`);

  try {
    const finalOutput = await captureScreenshot(opts);
    console.log(`Saved ${finalOutput}`);
  } catch (err) {
    console.error(`Screenshot failed:`, err.stack);
    process.exit(1);
  }
}
