import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import os from "os";
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
    let isTempBg = false;
    let tempEndVideoPath = null;
    let isTempEndVideo = false;
    let finalOutputPath = null;

    try {
      const body = await parseJsonBody(req);
      let {
        url,
        format,
        scale,
        hideStats,
        background,
        textAnimation,
        complex,
        complete = false,
        videoOnly,
        endVideo,
        noTts,
        openrouterApiKey,
        openRouterApiKey,
        OPENROUTER_API_KEY,
        textColor,
        fontColor,
        bgColor,
        backgroundColor,
        textBgColor,
        textBackgroundColor,
        hookTextColor,
        hookFontColor,
        hookBgColor,
        hookBackgroundColor,
        hookTextBgColor,
        hookTextBackgroundColor
      } = body;

      // Normalize incoming payload parameters
      openrouterApiKey = openrouterApiKey || openRouterApiKey || OPENROUTER_API_KEY;
      textColor = textColor || fontColor;
      bgColor = bgColor || backgroundColor;
      textBgColor = textBgColor || textBackgroundColor;
      hookTextColor = hookTextColor || hookFontColor;
      hookBgColor = hookBgColor || hookBackgroundColor;
      hookTextBgColor = hookTextBgColor || hookTextBackgroundColor;

      let noTtsSpecified = noTts !== undefined;

      if (complete) {
        const completeJsonPath = join(process.cwd(), "complete.json");
        if (existsSync(completeJsonPath)) {
          try {
            const config = JSON.parse(readFileSync(completeJsonPath, "utf-8"));
            console.log("[API] Loading complete mode options from complete.json...");
            if (background === undefined && config.background !== undefined) {
              background = config.background;
            }
            if (endVideo === undefined && config.endVideo !== undefined) {
              endVideo = config.endVideo;
            }
            if (scale === undefined && config.scale !== undefined) {
              scale = parseFloat(config.scale);
            }
            if (format === undefined && config.format !== undefined) {
              format = config.format;
            }
            if (hideStats === undefined && config.hideStats !== undefined) {
              hideStats = !!config.hideStats;
            }
            if (complex === undefined && config.complex !== undefined) {
              complex = !!config.complex;
            }
            if (videoOnly === undefined && config.videoOnly !== undefined) {
              videoOnly = !!config.videoOnly;
            }
            if (!noTtsSpecified && config.noTts !== undefined) {
              noTts = !!config.noTts;
            }
            if (textColor === undefined) {
              textColor = config.textColor !== undefined ? config.textColor : config.fontColor;
            }
            if (bgColor === undefined) {
              bgColor = config.bgColor !== undefined ? config.bgColor : config.backgroundColor;
            }
            if (textBgColor === undefined) {
              textBgColor = config.textBgColor !== undefined ? config.textBgColor : config.textBackgroundColor;
            }
            if (hookTextColor === undefined) {
              hookTextColor = config.hookTextColor !== undefined ? config.hookTextColor : config.hookFontColor;
            }
            if (hookBgColor === undefined) {
              hookBgColor = config.hookBgColor !== undefined ? config.hookBgColor : config.hookBackgroundColor;
            }
            if (hookTextBgColor === undefined) {
              hookTextBgColor = config.hookTextBgColor !== undefined ? config.hookTextBgColor : config.hookTextBackgroundColor;
            }
            if (config.openrouterApiKey || config.openRouterApiKey || config.OPENROUTER_API_KEY) {
              openrouterApiKey = config.openrouterApiKey || config.openRouterApiKey || config.OPENROUTER_API_KEY;
            }
          } catch (err) {
            console.error("[API] Failed to parse complete.json:", err.message);
          }
        }
      }

      if (format === undefined) format = "story";
      if (scale === undefined) scale = complete ? 2.3 : 1.5;
      if (hideStats === undefined) hideStats = true;
      if (complex === undefined) complex = false;
      if (videoOnly === undefined) videoOnly = false;
      if (noTts === undefined) noTts = false;

      if (!url && !textAnimation) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required 'url' or 'textAnimation' parameter" }));
        return;
      }

      let normalizedUrl = null;
      if (url) {
        try {
          normalizedUrl = normalizeTweetUrl(url);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }

      if (!FORMATS[format]) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Invalid format '${format}'. Use 'story' or 'post'.` }));
        return;
      }

      // Handle custom background base64 upload or local path
      if (background && String(background).trim() !== "") {
        const resolvedPath = join(process.cwd(), background);
        if (existsSync(resolvedPath)) {
          tempBgPath = resolvedPath;
          console.log(`[API] Using local background: ${tempBgPath}`);
        } else if (existsSync(background)) {
          tempBgPath = background;
          console.log(`[API] Using local background: ${tempBgPath}`);
        } else {
          console.log(`[API] Received background base64 payload, length: ${background.length}`);
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
          isTempBg = true;
          console.log(`[API] Saved temp background file to: ${tempBgPath}`);
        }
      } else {
        console.log(`[API] No background payload received or it was empty. Body keys: ${Object.keys(body).join(", ")}`);
      }

      // Handle custom end video upload or path
      if (endVideo && String(endVideo).trim() !== "") {
        const resolvedPath = join(process.cwd(), endVideo);
        if (existsSync(resolvedPath)) {
          tempEndVideoPath = resolvedPath;
          console.log(`[API] Using local end video: ${tempEndVideoPath}`);
        } else if (existsSync(endVideo)) {
          tempEndVideoPath = endVideo;
          console.log(`[API] Using local end video: ${tempEndVideoPath}`);
        } else {
          // Parse base64
          console.log(`[API] Received endVideo payload, length: ${endVideo.length}`);
          let base64Data = endVideo;
          let ext = "mp4";

          if (endVideo.startsWith("data:")) {
            const semiColonIndex = endVideo.indexOf(";");
            const commaIndex = endVideo.indexOf(",");
            if (semiColonIndex !== -1 && commaIndex !== -1) {
              const typePart = endVideo.substring(0, semiColonIndex);
              ext = typePart.split("/")[1] || "mp4";
              base64Data = endVideo.substring(commaIndex + 1);
            }
          }

          base64Data = base64Data.replace(/\s/g, "");

          try {
            const buffer = Buffer.from(base64Data, "base64");
            if (buffer.length > 0) {
              tempEndVideoPath = join(os.tmpdir(), `xshot-api-end-${Date.now()}.${ext}`);
              writeFileSync(tempEndVideoPath, buffer);
              isTempEndVideo = true;
              console.log(`[API] Saved temp end video file to: ${tempEndVideoPath}`);
            }
          } catch (e) {
            console.error("[API] Failed to parse endVideo as Base64", e.message);
          }
        }
      }

      let statusId = "tweet";
      if (normalizedUrl) {
        const match = normalizedUrl.match(/\/status\/(\d+)/);
        if (match) statusId = match[1];
      } else if (textAnimation) {
        statusId = "text-anim";
      }

      const outDir = os.tmpdir();
      // Initially resolve to a png output path (captureScreenshot will rename to .mp4 if it detects a video)
      const outputPlaceholder = join(outDir, `xshot-api-out-${statusId}-${Date.now()}.png`);

      if (textAnimation) {
        console.log(`[API] Triggering text animation render (Format: ${format}, Background: ${tempBgPath ? "yes" : "no"})`);
      } else {
        console.log(`[API] Triggering capture for ${normalizedUrl} (Format: ${format}, Scale: ${scale}x, Background: ${tempBgPath ? "yes" : "no"})`);
      }

      const opts = {
        format,
        output: outputPlaceholder,
        html: join(process.cwd(), "assets", "preview.html"),
        background: tempBgPath,
        scale: parseFloat(scale),
        tweetUrl: normalizedUrl,
        hideStats: !!hideStats,
        textAnimation,
        complex: !!complex,
        complete: !!complete,
        videoOnly: !!videoOnly,
        endVideo: tempEndVideoPath,
        noTts: !!noTts,
        openrouterApiKey,
        textColor,
        bgColor,
        textBgColor,
        hookTextColor,
        hookBgColor,
        hookTextBgColor,
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
        if (isTempBg && tempBgPath && existsSync(tempBgPath)) {
          unlinkSync(tempBgPath);
        }
        if (isTempEndVideo && tempEndVideoPath && existsSync(tempEndVideoPath)) {
          unlinkSync(tempEndVideoPath);
        }
        if (finalOutputPath && existsSync(finalOutputPath)) {
          unlinkSync(finalOutputPath);
        }
      } catch (cleanupErr) {
        console.error("[Cleanup Error]", cleanupErr);
      }
    }
  } else if (req.method === "GET" && req.url === "/api/config") {
    const configPath = join(process.cwd(), "complete.json");
    let configContent = {};
    if (existsSync(configPath)) {
      try {
        configContent = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Failed to parse complete.json: ${err.message}` }));
        return;
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(configContent));
  } else if ((req.method === "POST" || req.method === "PUT") && req.url === "/api/config") {
    try {
      const bodyConfig = await parseJsonBody(req);
      const configPath = join(process.cwd(), "complete.json");
      let currentConfig = {};
      if (existsSync(configPath)) {
        try {
          currentConfig = JSON.parse(readFileSync(configPath, "utf-8"));
        } catch (err) {
          console.warn("[API] Warning: complete.json could not be parsed, overwriting.");
        }
      }
      
      const newConfig = { ...currentConfig, ...bodyConfig };
      if (bodyConfig.complexConfig && currentConfig.complexConfig) {
        newConfig.complexConfig = { ...currentConfig.complexConfig, ...bodyConfig.complexConfig };
      }
      
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, config: newConfig }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Failed to update configuration: ${err.message}` }));
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
