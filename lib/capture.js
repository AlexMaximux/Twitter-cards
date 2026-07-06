import puppeteer from "puppeteer";
import { createServer } from "http";
import { readFileSync } from "fs";

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
      return rect.height > 80 && rect.width > 200;
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

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
    });

    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await waitForTweet(page);
    if (opts.hideStats) await hideTweetStats(page);

    await page.screenshot({
      path: opts.output,
      type: "png",
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    });
  } finally {
    await browser.close();
    await server.close();
  }
}
