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
| `-u, --url <url>` | Tweet URL (required if not passed as first argument) |
| `-f, --format story\|post` | Output size: `story` (1080×1920) or `post` (1080×1350). Default: `story` |
| `-o, --output <path>` | Output path. Default: `<post-id>.<png\|mp4>` in current directory |
| `-b, --background <path>` | Custom background image path (replaces gradient, renders at 15% opacity) |
| `-s, --scale, --size <val>` | Scale multiplier of tweet card (e.g. `2x`, `2`, `0.8`). Default: `1.5` |
| `--no-stats` | Hide likes, replies, and action buttons (**default**) |
| `--stats` | Show engagement stats and action buttons |
| `--html <path>` | Custom HTML template |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

## Formats

- **story** — 1080×1920 (9:16) for Instagram Stories / Reels
- **post** — 1080×1350 (4:5) for Instagram portrait feed posts

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
