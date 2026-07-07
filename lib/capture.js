import puppeteer from "puppeteer";
import { createServer } from "http";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { join, resolve } from "path";
import os from "os";

function getMimeType(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

const execPromise = promisify(exec);

async function checkFfmpeg() {
  try {
    await execPromise("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}


export const FORMATS = {
  story: { width: 1080, height: 1920, label: "Instagram Story (9:16)" },
  post: { width: 1080, height: 1350, label: "Instagram Post (4:5)" },
};

function startServer(htmlPath) {
  const html = readFileSync(htmlPath, "utf-8");

  return new Promise((resolvePromise, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });

    server.on("error", reject);
  });
}

async function waitForTweet(page) {
  await page.waitForFunction(
    () => {
      const iframe = document.querySelector('iframe[id^="twitter-widget"]');
      if (!iframe) return false;
      const rect = iframe.getBoundingClientRect();
      return rect.height > 50 && rect.width > 200;
    },
    { timeout: 60000 }
  );

  await new Promise((r) => setTimeout(r, 2000));
}

async function hideTweetStats(page) {
  const tweetFrame = page
    .frames()
    .find((f) => f.url().includes("embed/Tweet.html"));
  if (!tweetFrame) return;

  const cardHeight = await tweetFrame.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      a[href*="intent/like"],
      a[href*="intent/tweet"],
      a[href*="intent/retweet"],
      a[href*="/explore"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const hideRow = (anchor) => {
      if (!anchor) return;
      let row = anchor.parentElement;
      for (let i = 0; i < 6 && row; i++) {
        if (row.querySelector('[data-testid="tweetText"]')) break;
        const actions = row.querySelectorAll(
          'a[href*="intent/like"], a[href*="intent/tweet"], a[href*="intent/retweet"], a[href*="/explore"]'
        );
        if (actions.length > 0) {
          row.style.setProperty("display", "none", "important");
          row.style.setProperty("height", "0", "important");
          row.style.setProperty("margin", "0", "important");
          row.style.setProperty("padding", "0", "important");
          break;
        }
        row = row.parentElement;
      }
    };

    hideRow(document.querySelector('a[href*="intent/like"]'));
    hideRow(document.querySelector('a[href*="/explore"]'));

    const card =
      document.querySelector('[data-testid="tweetText"]')?.closest(".r-126aqm3") ??
      document.body.querySelector("div[class*='r-126aqm3']");

    return Math.ceil(
      card?.getBoundingClientRect().height ?? document.body.scrollHeight
    );
  });

  await page.evaluate((height) => {
    const iframe = document.querySelector('iframe[id^="twitter-widget"]');
    if (iframe) iframe.style.height = `${height}px`;
  }, cardHeight + 4);

  await new Promise((r) => setTimeout(r, 300));
}

export async function captureScreenshot(opts) {
  const server = await startServer(opts.html);
  const query = new URLSearchParams();
  if (opts.tweetUrl) query.set("url", opts.tweetUrl);
  if (opts.hideStats) query.set("no-stats", "1");
  const qs = query.toString();
  const pageUrl = qs ? `${server.url}?${qs}` : server.url;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const tmpDir = os.tmpdir();
  const tempVideo = join(tmpDir, `xshot-video-${Date.now()}.mp4`);
  const bgPng = join(tmpDir, `xshot-bg-${Date.now()}.png`);

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
    });

    let m3u8Url = null;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".m3u8") && !m3u8Url) {
        m3u8Url = url;
      }
    });

    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await waitForTweet(page);

    if (opts.background) {
      const bgPath = resolve(opts.background);
      if (existsSync(bgPath)) {
        const bgMime = getMimeType(bgPath);
        const bgBase64 = readFileSync(bgPath, "base64");
        const bgDataUrl = `data:${bgMime};base64,${bgBase64}`;
        await page.evaluate((dataUrl) => {
          document.body.style.background = "#121212";
          const bgDiv = document.createElement("div");
          bgDiv.style.position = "absolute";
          bgDiv.style.top = "0";
          bgDiv.style.left = "0";
          bgDiv.style.width = "100%";
          bgDiv.style.height = "100%";
          bgDiv.style.zIndex = "0";
          bgDiv.style.background = `url("${dataUrl}") no-repeat center center`;
          bgDiv.style.backgroundSize = "cover";
          bgDiv.style.opacity = "0.15";
          document.body.appendChild(bgDiv);
          
          // Ensure tweet wrapper stays on top of the background overlay
          const wrapper = document.querySelector(".tweet-wrapper");
          if (wrapper) {
            wrapper.style.position = "relative";
            wrapper.style.zIndex = "1";
          }
        }, bgDataUrl);
      } else {
        throw new Error(`Background file not found: ${opts.background}`);
      }
    }
    // Apply dynamic scaling factor
    const scaleFactor = opts.scale ?? 1.5;
    await page.evaluate((s) => {
      const wrapper = document.querySelector(".tweet-wrapper");
      if (wrapper) {
        wrapper.style.transform = `scale(${s})`;
        wrapper.style.transformOrigin = "center";
      }
    }, scaleFactor);
    const tweetFrame = page.frames().find((f) => f.url().includes("embed/Tweet.html"));
    let hasVideo = false;
    if (tweetFrame) {
      hasVideo = await tweetFrame.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a")).map(a => a.href);
        const hasVideoLink = links.some(l => l.includes("/video/"));
        const playButton = document.querySelector('[data-testid="playButton"]') || 
                           document.querySelector('[aria-label*="Play"]') ||
                           document.querySelector('video');
        return hasVideoLink || !!playButton;
      });
    }

    if (hasVideo) {
      console.log("Video detected in Tweet. Switching to video capture mode...");
      
      const ffmpegInstalled = await checkFfmpeg();
      if (!ffmpegInstalled) {
        throw new Error("FFmpeg is required to capture video tweets but was not found. Please install FFmpeg first (e.g., 'brew install ffmpeg').");
      }

      // Find and click the play button or media card to trigger video loading
      const playButton = await tweetFrame.$('[data-testid="playButton"]') || 
                         await tweetFrame.$('[aria-label*="Play"]') ||
                         await tweetFrame.$('div._2U8_T._19m30');
      if (playButton) {
        await playButton.click();
      } else {
        const mediaCard = await tweetFrame.$('[data-testid="card"]') || 
                           await tweetFrame.$('a[href*="/video/"]') ||
                           await tweetFrame.$('div[class*="media"]') ||
                           await tweetFrame.$('div._3rK4h');
        if (mediaCard) {
          await mediaCard.click();
        }
      }

      // Wait to capture m3u8Url
      for (let i = 0; i < 40; i++) {
        if (m3u8Url) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!m3u8Url) {
        throw new Error("Failed to extract video stream (.m3u8 URL) from Tweet.");
      }

      // Download HLS video stream
      console.log("Downloading video track...");
      const dlCmd = `ffmpeg -y -headers "Referer: https://platform.twitter.com/\r\nUser-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36\r\n" -i "${m3u8Url}" -c copy "${tempVideo}"`;
      await execPromise(dlCmd);

      // Hide engagement stats if requested (hides bottom buttons, etc. and resizes iframe)
      if (opts.hideStats) await hideTweetStats(page);

      // Get video player layout coordinates inside iframe
      const rectInfo = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[id^="twitter-widget"]');
        if (!iframe) return null;
        const iframeRect = iframe.getBoundingClientRect();
        const scale = iframe.offsetWidth ? (iframeRect.width / iframe.offsetWidth) : 1;
        return {
          iframeLeft: iframeRect.left,
          iframeTop: iframeRect.top,
          scale: scale,
        };
      });

      if (!rectInfo) throw new Error("Tweet iframe container not found");

      const mediaRect = await tweetFrame.evaluate(() => {
        const card = document.querySelector('[data-testid="videoComponent"]') ||
                     document.querySelector('[data-testid="card"]') || 
                     document.querySelector('a[href*="/video/"]') ||
                     document.querySelector('div[class*="media"]') ||
                     document.querySelector('div._3rK4h');
        
        if (!card) return null;
        const r = card.getBoundingClientRect();
        
        card.style.backgroundColor = "#000000";
        card.style.border = "none";
        Array.from(card.children).forEach(child => {
          child.style.opacity = "0";
        });

        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });

      if (!mediaRect) {
        throw new Error("Could not compute video player dimensions in iframe.");
      }

      const scale = rectInfo.scale || 1;
      const x = Math.round(rectInfo.iframeLeft + mediaRect.left * scale);
      const y = Math.round(rectInfo.iframeTop + mediaRect.top * scale);
      let w = Math.round(mediaRect.width * scale);
      let h = Math.round(mediaRect.height * scale);
      if (w % 2 !== 0) w--;
      if (h % 2 !== 0) h--;

      // Take background screenshot
      await page.screenshot({
        path: bgPng,
        type: "png",
        clip: { x: 0, y: 0, width: opts.width, height: opts.height },
      });

      // Update output extension to mp4
      if (opts.output.endsWith(".png")) {
        opts.output = opts.output.slice(0, -4) + ".mp4";
      } else if (!opts.output.endsWith(".mp4")) {
        opts.output = opts.output + ".mp4";
      }

      console.log("Compiling final video output with FFmpeg...");
      const compileCmd = `ffmpeg -y -f image2 -loop 1 -r 30 -i "${bgPng}" -i "${tempVideo}" -filter_complex "[1:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2[scaled];[0:v][scaled]overlay=${x}:${y}:shortest=1[outv]" -map "[outv]" -map 1:a? -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${opts.output}"`;
      await execPromise(compileCmd);
    } else {
      if (opts.hideStats) await hideTweetStats(page);
      await page.screenshot({
        path: opts.output,
        type: "png",
        clip: { x: 0, y: 0, width: opts.width, height: opts.height },
      });
    }

    return opts.output;
  } finally {
    await browser.close();
    await server.close();
    try {
      if (existsSync(tempVideo)) unlinkSync(tempVideo);
      if (existsSync(bgPng)) unlinkSync(bgPng);
    } catch {}
  }
}
