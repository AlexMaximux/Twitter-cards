# xshot

Capture X/Twitter posts as Instagram-ready portrait screenshots from the command line.

## Install

```bash
npm install -g @saeedalone/x-shot
```

Or run without installing globally:

```bash
npx @saeedalone/x-shot "https://x.com/user/status/123456789"
```
'''New 
node bin/xshot.js "https://x.com/vakilipor/status/2073889656005878009" -b ./assets/1.jpeg -s 2.3x

## Usage

```bash
xshot "https://x.com/user/status/123456789"
xshot -u "https://x.com/user/status/123" -f post -o my-tweet.png
xshot "https://x.com/user/status/123" --stats
```

### Options

| Flag | Description |
|------|-------------|
| `-u, --url <url>` | Tweet URL (required if not passed as first argument or `-makevideo` is used) |
| `-makevideo, --animate-text <text>` | Text to animate into a 3-second Story/Post video |
| `-f, --format story\|post` | Output size: `story` (1080×1920) or `post` (1080×1350). Default: `story` |
| `-o, --output <path>` | Output path. Default: `<post-id>.<png\|mp4>` in current directory |
| `-b, --background <path>` | Custom background image path (replaces gradient, renders at 15% opacity) |
| `-s, --scale, --size <val>` | Scale multiplier of tweet card (e.g. `2x`, `2`, `0.8`). Default: `1.5` |
| `--complex, -complex` | Apply complex video/audio processing filters (configured in `complex.json`) |
| `--complete, -complete` | Generate an introductory kinetic typography video using the tweet text + Gemini TTS voice, and concatenate it with the main video tweet |
| `--end, -end <path>` | Append an outro video to the end of the generated video |
| `--video, -video` | Output only the video stream centered on the background, completely omitting tweet card details |
| `--no-stats` | Hide likes, replies, and action buttons (**default**) |
| `--stats` | Show engagement stats and action buttons |
| `--html <path>` | Custom HTML template |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

## Kinetic Typography (Text Animation)

You can generate a standalone 3-second animated word-by-word kinetic typography video (with RTL and Vazirmatn font support for Persian) directly from an input string:

```bash
xshot -makevideo "ترامپ عصبانیتر از همیشه… ماجرا از تنگه هرمز شروع شد" -o anim.mp4
```

This renders the text centered on top of the Instagram gradient background (or custom background image passed via `-b`). The rendering is processed frame-by-frame via Puppeteer to guarantee a perfect 30fps output, compiled into high-quality MP4 using FFmpeg.

### AI Voice-over (Gemini TTS)

If the `GEMINI_API_KEY` environment variable is set, the application will automatically generate a spoken voice-over for the kinetic typography text using the Gemini Text-to-Speech (`gemini-3.1-flash-tts-preview`) model, overlaying the generated audio onto the final MP4 output. If the key is not defined, it gracefully falls back to generating a silent video.

To enable the voice-over feature:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
xshot -makevideo "ترامپ عصبانیتر از همیشه"
```

## Complete Mode

You can compile a complete Instagram video package by passing the `--complete` (or `-complete`) flag with a video tweet URL:

```bash
xshot "https://x.com/IranIntl_En/status/2074159822283383058" -b ./assets/1.jpeg --complete
```

When enabled, the application will:
1. Extract the text content of the tweet.
2. Hide/remove the text of the tweet from the tweet card layout.
3. Automatically request a voice-over file of the text from the Gemini TTS API (if `GEMINI_API_KEY` is set).
4. Render a 3-second kinetic typography intro animation of the text.
5. Capture and compile the tweet video (using complex parameters from `complex.json` automatically).
6. Concatenate the 3-second typography intro video (with audio) and the main tweet video (with complex filters applied) sequentially into a single high-quality video file.

## Complex Mode

When capturing video tweets, you can apply custom, subtle video and audio filters by passing the `--complex` (or `-complex`) flag:

```bash
xshot "https://x.com/IranIntl_En/status/2074159822283383058" -b ./assets/1.jpeg --complex
```

This mode alters the video speed, audio tempo, sample rate, and color gamma to bypass platform duplicate content algorithms. The parameters are read from a `complex.json` file in the current working directory.

If `complex.json` is not found, the following defaults are used:

```json
{
  "setpts": "0.99*PTS",
  "eq": "gamma=1.03",
  "atempo": "1.01",
  "aresample": "48000"
}
```

### Configuration Parameters

- `setpts`: FFmpeg video filter to adjust presentation timestamps (e.g., `0.99*PTS` speeds up the video by 1%).
- `eq`: FFmpeg video filter to adjust color settings (e.g., `gamma=1.03` slightly alters the color gamma to force pixel re-rendering).
- `atempo`: FFmpeg audio filter to adjust playback speed (e.g., `1.01` speeds up audio by 1.01x to match the video speedup).
- `aresample`: FFmpeg audio filter to change the sample rate (e.g., `48000` resamples audio to 48000 Hz).

## Formats

- **story** — 1080×1920 (9:16) for Instagram Stories / Reels
- **post** — 1080×1350 (4:5) for Instagram portrait feed posts

## API Server

You can run `xshot` as a remote HTTP API server.

### Start the Server

```bash
# Start server on default port 3000
npm run server

# Start server on a custom port
PORT=8080 npm run server
```

### API Endpoint

**`POST /api/capture`**

Exposes a JSON rendering endpoint. Send options in the JSON body, and the server will stream back the compiled binary file (`image/png` or `video/mp4`).

**Payload format:**
```json
{
  "url": "https://x.com/mistergeezy/status/2073749321414000764",
  "format": "story",
  "scale": 1.5,
  "hideStats": true,
  "background": "data:image/png;base64,iVBORw0KGgoAAA...",
  "complex": false,
  "complete": false,
  "videoOnly": false,
  "endVideo": "./assets/end.mp4"
}
```

*Note: The `background` and `endVideo` parameters are optional. `background` accepts a Base64 data URL string for custom background overlays. `endVideo` accepts either a local file path relative to the server root (e.g. `./assets/end.mp4`) or a Base64-encoded video data URL.*

## Requirements

- Node.js 18+
- Internet connection (loads the tweet embed from X)

## Publish

```bash
npm login
npm publish --access public
```

Scoped packages (`@saeedalone/x-shot`) must be published with `--access public` to be installable by anyone.

## License

MIT


کاری که میکنم این هست که از این دستور استفاده میکنم

node bin/xshot "https://x.com/bookunt/status/2076053752583262674" -b ./assets/virman.jpeg -end ./assets/end.mp4
این دستور عکس یا فیل رو از این توییت برمیداره 
به همراه بک راندی که دادم میگذاره 
و آخرش ویدپو که آدرسش رو دادم به آخر ویدو میجسبتونه 

این دستور هم در مورد فیلم رو میگیره با مشخصات  توی 
complex.json
بازسازی ایش میکنه و به آخر اون ویدو مربوطه رو اضافه میکند
