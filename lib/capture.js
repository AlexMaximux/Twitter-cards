import puppeteer from "puppeteer";
import { createServer } from "http";
import { readFileSync, existsSync, unlinkSync, writeFileSync, copyFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { join, resolve } from "path";
import os from "os";
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';

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

function parseMimeType(mimeType) {
  const mimeStr = mimeType || '';
  const [fileType, ...params] = mimeStr.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');

  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  };

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') {
      options.sampleRate = parseInt(value, 10);
    }
  }

  return options;
}

function createWavHeader(dataLength, options) {
  const { numChannels, sampleRate, bitsPerSample } = options;

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);                      // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
  buffer.write('WAVE', 8);                      // Format
  buffer.write('fmt ', 12);                     // Subchunk1ID
  buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);        // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
  buffer.writeUInt32LE(byteRate, 28);           // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
  buffer.write('data', 36);                     // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

  return buffer;
}

async function generateTtsAudio(text, outputPath) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("GEMINI_API_KEY environment variable is not set. Skipping voice generation.");
    return null;
  }

  console.log("Generating Gemini TTS audio for text...");
  const ai = new GoogleGenAI({ apiKey });

  const config = {
    temperature: 1,
    responseModalities: ['audio'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Achernar',
        }
      }
    },
  };

  const model = 'gemini-3.1-flash-tts-preview';
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `## Transcript:\n[matter-of-fact]${text}`,
        },
      ],
    },
  ];

  try {
    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    const chunks = [];
    let mimeType = '';

    for await (const chunk of response) {
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        if (inlineData.data) {
          chunks.push(Buffer.from(inlineData.data, 'base64'));
        }
        if (inlineData.mimeType) {
          mimeType = inlineData.mimeType;
        }
      }
    }

    if (chunks.length === 0) {
      console.warn("No audio chunks received from Gemini API.");
      return null;
    }

    const rawAudioBuffer = Buffer.concat(chunks);
    let finalBuffer;
    let fileExtension = mime.getExtension(mimeType || '');

    if (!fileExtension || fileExtension === 'wav') {
      // Convert to WAV with header
      const options = parseMimeType(mimeType);
      const wavHeader = createWavHeader(rawAudioBuffer.length, options);
      finalBuffer = Buffer.concat([wavHeader, rawAudioBuffer]);
      fileExtension = 'wav';
    } else {
      finalBuffer = rawAudioBuffer;
    }

    const audioFile = `${outputPath}.${fileExtension}`;
    writeFileSync(audioFile, finalBuffer);
    console.log(`Saved TTS voice-over audio to ${audioFile}`);
    return audioFile;

  } catch (err) {
    console.error("Gemini TTS generation failed:", err.message);
    return null;
  }
}

async function generateHookText(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("GEMINI_API_KEY environment variable is not set. Skipping hook generation, using original text.");
    return text;
  }

  console.log("Generating 3-second Instagram hook using Gemini LLM...");
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-flash';
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `
          تو یک متخصص تولید هوک‌های وایرال برای ویدیوهای خبری کوتاه (Reels/TikTok) هستی.

وظیفه:
از متن خبری که بهت میدم، 1 هوک بسیار کوتاه، شدیداً هیجانی و کنجکاوی‌برانگیز تولید کن.

قوانین:
- هر هوک حداکثر 3 تا 6 کلمه باشد (خیلی کوتاه و ضربه‌ای)
- لحن: دراماتیک، فوری، تنش‌زا
- مناسب 3 ثانیه اول ویدیو (Pattern Interrupt)
- حس تضاد، بحران، یا اتفاق بزرگ را منتقل کند

- اگر در خبر دو طرف یا تضاد وجود دارد، حتماً روی آن تاکید کن
- از علامت «…» یا «!» برای افزایش هیجان استفاده کن
- خروجی فقط هوک‌ها باشد، بدون توضیح اضافی
-تو مخالف جمهوری اسلامی هستی
-جمهوری اسلامی و حکومت اسلامی از مردم و کشور ایران جدا هستن 

فرمت خروجی:
 فقط متن یک هوک 
🔴  دبیرکل ناتو: حملهٔ دیشب آمریکا به ایران کاملاً ضروری بود

💢  فکر میکنم بسیار حیاتی است که آمریکا با قاطعیت و قدرت واکنش نشان دهد.
`,
        },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          text: `دبیرکل ناتو بالاخره سکوتش را شکست!`,
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          text: text,
        },
      ],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
    });

    const hookText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (hookText && hookText.trim()) {
      const cleaned = hookText.trim().replace(/^["']|["']$/g, '');
      console.log(`Generated hook: "${cleaned}"`);
      return cleaned;
    }
  } catch (err) {
    console.error("Failed to generate hook from Gemini:", err.message);
  }

  return text;
}

async function checkAudioTrack(videoPath) {
  try {
    const { stdout } = await execPromise(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${videoPath}"`);
    return stdout.trim().includes("audio");
  } catch {
    return false;
  }
}

async function ensureAudioTrack(videoPath, tempDir) {
  const hasAudio = await checkAudioTrack(videoPath);
  if (hasAudio) return videoPath;

  console.log(`No audio track found in ${videoPath}. Adding a silent audio track...`);
  const outPath = join(tempDir, `audio-fixed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`);
  const cmd = `ffmpeg -y -i "${videoPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v copy -c:a aac -shortest "${outPath}"`;
  await execPromise(cmd);
  return outPath;
}

async function getAudioDuration(audioPath) {
  try {
    const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    return parseFloat(stdout.trim());
  } catch {
    return null;
  }
}

function generateTextAnimationHtml(text, opts) {
  const words = text.trim().split(/\s+/);
  let bgStyle = `background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);`;

  if (opts.background) {
    const bgPath = resolve(opts.background);
    if (existsSync(bgPath)) {
      const bgMime = getMimeType(bgPath);
      const bgBase64 = readFileSync(bgPath, "base64");
      const bgDataUrl = `data:${bgMime};base64,${bgBase64}`;
      bgStyle = `background: #121212 url("${bgDataUrl}") no-repeat center center; background-size: cover;`;
    }
  }

  const wordSpans = words.map((w, idx) => `<span id="word-${idx}" class="word">${w}</span>`).join(" ");

  const totalFrames = opts.totalFrames || 90;
  const activeFrames = Math.ceil(totalFrames * 0.85);
  const framesPerWord = activeFrames / words.length;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@700;900&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: ${opts.width}px;
      height: ${opts.height}px;
      overflow: hidden;
      font-family: 'Vazirmatn', sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      ${bgStyle}
    }
    .text-container {
      width: 85%;
      max-width: 900px;
      text-align: center;
      line-height: 1.5;
      font-size: 64px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 4px 30px rgba(0,0,0,0.6);
      word-wrap: break-word;
    }
    .word {
      display: inline-block;
      opacity: 0;
      transform: scale(0.6);
      margin: 0 8px;
    }
  </style>
</head>
<body>
  <div class="text-container">
    ${wordSpans}
  </div>
  <script>
    const totalFrames = ${totalFrames};
    const wordsCount = ${words.length};
    const activeFrames = ${activeFrames};
    const framesPerWord = ${framesPerWord};

    window.renderFrame = function(frameIndex) {
      for (let idx = 0; idx < wordsCount; idx++) {
        const el = document.getElementById('word-' + idx);
        if (!el) continue;
        const startFrame = idx * framesPerWord;
        
        if (frameIndex >= startFrame) {
          // Calculate animated progress (smoothly transition over 6 frames)
          const progress = Math.min(1, (frameIndex - startFrame) / 6);
          el.style.opacity = progress;
          el.style.transform = 'scale(' + (0.7 + 0.3 * progress) + ')';
        } else {
          el.style.opacity = 0;
          el.style.transform = 'scale(0.7)';
        }
      }
    };
  </script>
</body>
</html>
  `;
}

async function renderTextAnimation(opts) {
  const ffmpegInstalled = await checkFfmpeg();
  if (!ffmpegInstalled) {
    throw new Error("FFmpeg is required to compile animations but was not found. Please install FFmpeg first.");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const tmpDir = os.tmpdir();
  const framePaths = [];
  let audioFile = null;
  let duration = 3.0;

  try {
    // Generate audio first to know the duration
    try {
      const audioOutPlaceholder = join(tmpDir, `xshot-anim-audio-${Date.now()}`);
      audioFile = await generateTtsAudio(opts.textAnimation, audioOutPlaceholder);

      if (audioFile) {
        const audioDur = await getAudioDuration(audioFile);
        if (audioDur && !isNaN(audioDur)) {
          duration = audioDur;
        }
      } else {
        const words = opts.textAnimation.trim().split(/\s+/);
        duration = Math.max(3.0, words.length * 0.45);
      }
    } catch (err) {
      console.error("Failed to generate TTS audio:", err.message);
    }

    const totalFrames = Math.ceil(duration * 30);
    const updatedOpts = { ...opts, totalFrames };

    const page = await browser.newPage();
    await page.setViewport({
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
    });

    const htmlContent = generateTextAnimationHtml(opts.textAnimation, updatedOpts);
    await page.setContent(htmlContent, { waitUntil: "networkidle2" });

    // Ensure fonts are fully loaded
    await page.evaluate(() => document.fonts.ready);

    console.log(`Rendering text animation frames (${totalFrames} frames for ${duration.toFixed(2)}s)...`);
    for (let i = 0; i < totalFrames; i++) {
      await page.evaluate((frame) => {
        if (window.renderFrame) window.renderFrame(frame);
      }, i);

      const framePath = join(tmpDir, `xshot-anim-frame-${String(i).padStart(4, '0')}.png`);
      framePaths.push(framePath);

      await page.screenshot({
        path: framePath,
        type: "png",
      });
    }

    if (opts.output.endsWith(".png")) {
      opts.output = opts.output.slice(0, -4) + ".mp4";
    } else if (!opts.output.endsWith(".mp4")) {
      opts.output = opts.output + ".mp4";
    }

    console.log("Compiling text animation video with FFmpeg...");

    let compileCmd;
    if (opts.complex) {
      let complexConfig = {
        setpts: "0.99*PTS",
        eq: "gamma=1.04:saturation=1.05",
      };
      const configPath = join(process.cwd(), "complex.json");
      if (existsSync(configPath)) {
        try {
          const configContent = JSON.parse(readFileSync(configPath, "utf-8"));
          complexConfig = { ...complexConfig, ...configContent };
          console.log("Loaded complex parameters from complex.json:", complexConfig);
        } catch (err) {
          console.error("Failed to parse complex.json, using defaults. Error:", err.message);
        }
      }

      if (audioFile) {
        compileCmd = `ffmpeg -y -framerate 30 -i "${tmpDir}/xshot-anim-frame-%04d.png" -i "${audioFile}" -vf "setpts=${complexConfig.setpts},eq=${complexConfig.eq}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${opts.output}"`;
      } else {
        compileCmd = `ffmpeg -y -framerate 30 -i "${tmpDir}/xshot-anim-frame-%04d.png" -vf "setpts=${complexConfig.setpts},eq=${complexConfig.eq}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${opts.output}"`;
      }
    } else {
      if (audioFile) {
        compileCmd = `ffmpeg -y -framerate 30 -i "${tmpDir}/xshot-anim-frame-%04d.png" -i "${audioFile}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${opts.output}"`;
      } else {
        compileCmd = `ffmpeg -y -framerate 30 -i "${tmpDir}/xshot-anim-frame-%04d.png" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${opts.output}"`;
      }
    }

    await execPromise(compileCmd);

    // Clean up temporary audio file after successful compilation
    if (audioFile && existsSync(audioFile)) {
      try {
        unlinkSync(audioFile);
      } catch { }
    }

    return opts.output;

  } finally {
    await browser.close();
    // Clean up temporary frames
    for (const framePath of framePaths) {
      try {
        if (existsSync(framePath)) unlinkSync(framePath);
      } catch { }
    }
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

async function conformVideo(videoPath, opts, tempDir) {
  const withAudio = await ensureAudioTrack(videoPath, tempDir);
  const conformedPath = join(tempDir, `conformed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`);

  const cmd = `ffmpeg -y -i "${withAudio}" -filter_complex "[0:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v];[0:a]aresample=48000,aformat=channel_layouts=stereo[a]" -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${conformedPath}"`;
  await execPromise(cmd);

  if (withAudio !== videoPath && existsSync(withAudio)) {
    try { unlinkSync(withAudio); } catch { }
  }
  return conformedPath;
}

async function appendEndVideo(mainVideo, endVideo, opts, tmpDir) {
  console.log(`Appending end video: ${endVideo}`);
  const ffmpegInstalled = await checkFfmpeg();
  if (!ffmpegInstalled) throw new Error("FFmpeg is required to append videos.");

  const fixedMain = await conformVideo(mainVideo, opts, tmpDir);
  const fixedEndVideo = await conformVideo(endVideo, opts, tmpDir);

  const concatOutput = join(tmpDir, `xshot-appended-${Date.now()}.mp4`);
  const concatCmd = `ffmpeg -y -i "${fixedMain}" -i "${fixedEndVideo}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${concatOutput}"`;
  await execPromise(concatCmd);

  copyFileSync(concatOutput, mainVideo);

  try {
    if (fixedMain !== mainVideo && existsSync(fixedMain)) unlinkSync(fixedMain);
    if (fixedEndVideo !== endVideo && existsSync(fixedEndVideo)) unlinkSync(fixedEndVideo);
    unlinkSync(concatOutput);
  } catch { }

  return mainVideo;
}

export async function captureScreenshot(opts) {
  if (opts.textAnimation) {
    let result = await renderTextAnimation(opts);
    if (opts.endVideo && existsSync(opts.endVideo)) {
      result = await appendEndVideo(result, opts.endVideo, opts, os.tmpdir());
    }
    return result;
  }
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
  let tempVideo = join(tmpDir, `xshot-video-${Date.now()}.mp4`);
  const bgPng = join(tmpDir, `xshot-bg-${Date.now()}.png`);

  let compiledIntro = null;
  let tempTweetVideoPath = null;
  let originalFinalOutput = null;

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

    if (opts.complete && tweetFrame) {
      const ffmpegInstalled = await checkFfmpeg();
      if (!ffmpegInstalled) {
        throw new Error("FFmpeg is required for complete mode but was not found. Please install FFmpeg first (e.g., 'brew install ffmpeg').");
      }

      let tweetText = "";
      try {
        tweetText = await tweetFrame.evaluate(() => {
          const textEl = document.querySelector('[data-testid="tweetText"]');
          return textEl ? textEl.innerText.trim() : "";
        });
        console.log(`Extracted tweet text for complete mode: "${tweetText}"`);

        await tweetFrame.evaluate(() => {
          const textEl = document.querySelector('[data-testid="tweetText"]');
          if (textEl) textEl.style.display = "none";
        });
      } catch (err) {
        console.error("Failed to extract or hide tweet text:", err.message);
      }

      if (tweetText) {
        let introText = tweetText;
        try {
          introText = await generateHookText(tweetText);
        } catch (err) {
          console.error("Failed to generate hook text:", err.message);
        }

        console.log("Generating introductory kinetic typography video...");
        const introOutPath = join(tmpDir, `xshot-complete-intro-${Date.now()}.mp4`);
        const introOpts = {
          ...opts,
          textAnimation: introText,
          output: introOutPath,
          complex: false,
        };
        compiledIntro = await renderTextAnimation(introOpts);

        originalFinalOutput = opts.output.endsWith(".png") ? opts.output.slice(0, -4) + ".mp4" : opts.output;
        tempTweetVideoPath = join(tmpDir, `xshot-complete-main-${Date.now()}.mp4`);
        opts.output = tempTweetVideoPath;
      }
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

      try {
        const durationQuery = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideo}"`);
        const originalDuration = parseFloat(durationQuery.stdout.trim());
        if (originalDuration > 4) {
          const trimmedDuration = originalDuration - 4;
          console.log(`Trimming downloaded video from ${originalDuration.toFixed(2)}s to ${trimmedDuration.toFixed(2)}s (cutting off the last 4 seconds)...`);
          const trimmedVideo = join(tmpDir, `trimmed-${Date.now()}.mp4`);
          const trimCmd = `ffmpeg -y -i "${tempVideo}" -t ${trimmedDuration} -c:v libx264 -preset ultrafast -c:a aac "${trimmedVideo}"`;
          await execPromise(trimCmd);
          try { unlinkSync(tempVideo); } catch { }
          tempVideo = trimmedVideo;
        } else {
          console.log(`Video duration is ${originalDuration.toFixed(2)}s (<= 4s). Skipping trimming.`);
        }
      } catch (err) {
        console.error("Failed to trim video duration:", err.message);
      }

      // Hide engagement stats if requested (hides bottom buttons, etc. and resizes iframe)
      if (opts.hideStats) await hideTweetStats(page);

      let w, h, x, y;

      if (opts.videoOnly || opts.complete) {
        // Hide the tweet wrapper on the page so it is omitted from the background screenshot
        await page.evaluate(() => {
          const wrapper = document.querySelector(".tweet-wrapper");
          if (wrapper) wrapper.style.display = "none";
        });

        // Determine video dimensions via ffprobe
        console.log("Analyzing video resolution...");
        const { stdout } = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${tempVideo}"`);
        const [origW, origH] = stdout.trim().split("x").map(Number);

        if (!origW || !origH) {
          throw new Error("Could not extract video dimensions from the downloaded file.");
        }

        const canvasW = opts.width;
        const canvasH = opts.height;
        const targetAspect = canvasW / canvasH;
        const videoAspect = origW / origH;

        if (videoAspect > targetAspect) {
          // Video is wider than canvas ratio -> fit to width
          w = canvasW;
          h = Math.round(w / videoAspect);
        } else {
          // Video is taller/narrower -> fit to height
          h = canvasH;
          w = Math.round(h * videoAspect);
        }

        if (w % 2 !== 0) w--;
        if (h % 2 !== 0) h--;

        x = Math.round((canvasW - w) / 2);
        y = Math.round((canvasH - h) / 2);
      } else {
        // Original layout calculation
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
        x = Math.round(rectInfo.iframeLeft + mediaRect.left * scale);
        y = Math.round(rectInfo.iframeTop + mediaRect.top * scale);
        w = Math.round(mediaRect.width * scale);
        h = Math.round(mediaRect.height * scale);
        if (w % 2 !== 0) w--;
        if (h % 2 !== 0) h--;
      }

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
      let compileCmd;
      const useComplex = opts.complex || opts.complete;
      if (useComplex) {
        let complexConfig = {
          setpts: "0.99*PTS",
          crop: "iw*0.94:ih*0.94",
          noise: "alls=2:allf=t",
          eq: "gamma=1.04:saturation=1.05",
          scale: "935:-2",
          overlay: "(W-w)/2:(H-h)/2",
          atempo: "1.01",
          aresample: "48000"
        };
        const completeJsonPath = join(process.cwd(), "complete.json");
        const complexJsonPath = join(process.cwd(), "complex.json");
        let loadedConfig = {};

        if (opts.complete && existsSync(completeJsonPath)) {
          try {
            const content = JSON.parse(readFileSync(completeJsonPath, "utf-8"));
            loadedConfig = content.complexConfig || {};
            console.log("Loaded complex parameters from complete.json");
          } catch (err) {
            console.error("Failed to parse complete.json:", err.message);
          }
        } else if (existsSync(complexJsonPath)) {
          try {
            loadedConfig = JSON.parse(readFileSync(complexJsonPath, "utf-8"));
            console.log("Loaded complex parameters from complex.json:", loadedConfig);
          } catch (err) {
            console.error("Failed to parse complex.json, using defaults. Error:", err.message);
          }
        } else {
          console.log("No custom complex configuration file found, using defaults.");
        }

        const validKeys = Object.keys(complexConfig);
        for (const key of validKeys) {
          if (loadedConfig[key] !== undefined) {
            complexConfig[key] = loadedConfig[key];
          }
        }

        compileCmd = `ffmpeg -y -f image2 -loop 1 -r 30 -i "${bgPng}" -i "${tempVideo}" -filter_complex "[1:v]crop=${complexConfig.crop},noise=${complexConfig.noise},eq=${complexConfig.eq},scale=${complexConfig.scale},setpts=${complexConfig.setpts}[scaled];[0:v][scaled]overlay=${complexConfig.overlay}:shortest=1[outv]" -map "[outv]" -map 1:a? -af "atempo=${complexConfig.atempo},aresample=${complexConfig.aresample}" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${opts.output}"`;
      } else {
        compileCmd = `ffmpeg -y -f image2 -loop 1 -r 30 -i "${bgPng}" -i "${tempVideo}" -filter_complex "[1:v]scale=935:-2[scaled];[0:v][scaled]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]" -map "[outv]" -map 1:a? -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${opts.output}"`;
      }
      await execPromise(compileCmd);

      if (opts.complete && compiledIntro && tempTweetVideoPath && existsSync(compiledIntro) && existsSync(tempTweetVideoPath)) {
        console.log("Merging intro animation and tweet video...");
        // Ensure both have audio tracks
        const fixedIntro = await ensureAudioTrack(compiledIntro, tmpDir);
        const fixedMain = await ensureAudioTrack(tempTweetVideoPath, tmpDir);

        // Concatenate them
        const concatCmd = `ffmpeg -y -i "${fixedIntro}" -i "${fixedMain}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${originalFinalOutput}"`;
        await execPromise(concatCmd);

        // Clean up temporary fixed and raw videos
        if (fixedIntro !== compiledIntro && existsSync(fixedIntro)) {
          try { unlinkSync(fixedIntro); } catch { }
        }
        if (fixedMain !== tempTweetVideoPath && existsSync(fixedMain)) {
          try { unlinkSync(fixedMain); } catch { }
        }
        try { unlinkSync(compiledIntro); } catch { }
        try { unlinkSync(tempTweetVideoPath); } catch { }

        opts.output = originalFinalOutput;
      }
    } else {
      if (opts.hideStats) await hideTweetStats(page);

      const screenshotPath = (opts.complete && tempTweetVideoPath) ? join(tmpDir, `xshot-complete-screenshot-${Date.now()}.png`) : opts.output;

      await page.screenshot({
        path: screenshotPath,
        type: "png",
        clip: { x: 0, y: 0, width: opts.width, height: opts.height },
      });

      if (opts.complete && compiledIntro && tempTweetVideoPath) {
        console.log("Converting image to 5-second video for complete mode...");
        const cmd = `ffmpeg -y -loop 1 -framerate 30 -i "${screenshotPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t 5 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${tempTweetVideoPath}"`;
        await execPromise(cmd);

        console.log("Merging intro animation and tweet image video...");
        // Ensure both have audio tracks
        const fixedIntro = await ensureAudioTrack(compiledIntro, tmpDir);
        const fixedMain = await ensureAudioTrack(tempTweetVideoPath, tmpDir);

        // Concatenate them
        const concatCmd = `ffmpeg -y -i "${fixedIntro}" -i "${fixedMain}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${originalFinalOutput}"`;
        await execPromise(concatCmd);

        // Clean up temporary fixed and raw videos
        if (fixedIntro !== compiledIntro && existsSync(fixedIntro)) {
          try { unlinkSync(fixedIntro); } catch { }
        }
        if (fixedMain !== tempTweetVideoPath && existsSync(fixedMain)) {
          try { unlinkSync(fixedMain); } catch { }
        }
        try { unlinkSync(compiledIntro); } catch { }
        try { unlinkSync(tempTweetVideoPath); } catch { }
        try { unlinkSync(screenshotPath); } catch { }

        opts.output = originalFinalOutput;
      } else if (opts.endVideo && existsSync(opts.endVideo)) {
        console.log("Image tweet detected with --end specified. Converting image to 5-second video...");
        const tempVideoOut = join(tmpDir, `xshot-pic-video-${Date.now()}.mp4`);
        const cmd = `ffmpeg -y -loop 1 -framerate 30 -i "${opts.output}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t 5 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k "${tempVideoOut}"`;
        await execPromise(cmd);

        try { unlinkSync(opts.output); } catch { }

        opts.output = opts.output.endsWith(".png") ? opts.output.slice(0, -4) + ".mp4" : opts.output + ".mp4";
        copyFileSync(tempVideoOut, opts.output);

        try { unlinkSync(tempVideoOut); } catch { }
      }
    }

    if (opts.output.endsWith(".mp4") && opts.endVideo && existsSync(opts.endVideo)) {
      opts.output = await appendEndVideo(opts.output, opts.endVideo, opts, tmpDir);
    }

    return opts.output;
  } finally {
    await browser.close();
    await server.close();
    try {
      if (existsSync(tempVideo)) unlinkSync(tempVideo);
      if (existsSync(bgPng)) unlinkSync(bgPng);
      if (compiledIntro && existsSync(compiledIntro)) unlinkSync(compiledIntro);
      if (tempTweetVideoPath && existsSync(tempTweetVideoPath)) unlinkSync(tempTweetVideoPath);
    } catch { }
  }
}
