import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import os from "os";
import { captureScreenshot, FORMATS } from "./capture.js";
import { normalizeTweetUrl } from "./cli.js";

const PORT = process.env.PORT || 3000;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        if (!body) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(body);
        const trimmed = {};
        for (const key of Object.keys(parsed)) {
          trimmed[key.trim()] = parsed[key];
        }
        resolve(trimmed);
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/capture") {
    let tempBgPath = null;
    let finalOutputPath = null;

    try {
      const body = await parseJsonBody(req);
      const { url, format = "story", scale = 1.5, hideStats = true, background } = body;

      if (!url) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required 'url' parameter" }));
        return;
      }

      let normalizedUrl;
      try {
        normalizedUrl = normalizeTweetUrl(url);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!FORMATS[format]) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Invalid format '${format}'. Use 'story' or 'post'.` }));
        return;
      }

      // Handle custom background base64 upload
      console.log(`[API] Raw background parameter - type: ${typeof background}, value preview: ${JSON.stringify(background)?.substring(0, 100)}`);
      if (background && String(background).trim() !== "") {
        console.log(`[API] Received background payload, length: ${background.length}`);
        let base64Data = background;
        let ext = "png";

        if (background.startsWith("data:")) {
          const semiColonIndex = background.indexOf(";");
          const commaIndex = background.indexOf(",");
          if (semiColonIndex !== -1 && commaIndex !== -1) {
            const typePart = background.substring(0, semiColonIndex);
            ext = typePart.split("/")[1] || "png";
            base64Data = background.substring(commaIndex + 1);
          }
        }

        // Clean up newlines or spaces
        base64Data = base64Data.replace(/\s/g, "");

        const buffer = Buffer.from(base64Data, "base64");
        tempBgPath = join(os.tmpdir(), `xshot-api-bg-${Date.now()}.${ext}`);
        writeFileSync(tempBgPath, buffer);
        console.log(`[API] Saved temp background file to: ${tempBgPath}`);
      } else {
        console.log(`[API] No background payload received or it was empty. Body keys: ${Object.keys(body).join(", ")}`);
      }

      const match = normalizedUrl.match(/\/status\/(\d+)/);
      const statusId = match ? match[1] : "tweet";
      const outDir = os.tmpdir();
      // Initially resolve to a png output path (captureScreenshot will rename to .mp4 if it detects a video)
      const outputPlaceholder = join(outDir, `xshot-api-out-${statusId}-${Date.now()}.png`);

      console.log(`[API] Triggering capture for ${normalizedUrl} (Format: ${format}, Scale: ${scale}x, Background: ${tempBgPath ? "yes" : "no"})`);

      const opts = {
        format,
        output: outputPlaceholder,
        html: join(process.cwd(), "assets", "preview.html"),
        background: tempBgPath,
        scale: parseFloat(scale),
        tweetUrl: normalizedUrl,
        hideStats: !!hideStats,
        ...FORMATS[format],
      };

      finalOutputPath = await captureScreenshot(opts);

      if (!existsSync(finalOutputPath)) {
        throw new Error("Rendered output file not found");
      }

      const isVideo = finalOutputPath.endsWith(".mp4");
      const contentType = isVideo ? "video/mp4" : "image/png";
      const fileBuffer = readFileSync(finalOutputPath);

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length,
        "Content-Disposition": `attachment; filename="${statusId}.${isVideo ? "mp4" : "png"}"`
      });
      res.end(fileBuffer);

    } catch (err) {
      console.error("[API Error]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    } finally {
      // Clean up temporary files
      try {
        if (tempBgPath && existsSync(tempBgPath)) {
          unlinkSync(tempBgPath);
        }
        if (finalOutputPath && existsSync(finalOutputPath)) {
          unlinkSync(finalOutputPath);
        }
      } catch (cleanupErr) {
        console.error("[Cleanup Error]", cleanupErr);
      }
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[API Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[API Endpoint] POST http://0.0.0.0:${PORT}/api/capture`);
});
