# X-Shot API Documentation

This document describes the API endpoints provided by the X-Shot server. The server runs by default on port `3000` (or `7001` if configured) and exposes endpoints for capturing tweets, managing configuration, and generating text animations.

---

## 1. POST `/api/capture`

Captures a tweet as a styled screenshot (image) or an animated video based on parameters.

* **URL:** `/api/capture`
* **Method:** `POST`
* **Headers:** `Content-Type: application/json`

### Request Body Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `url` | `string` | *Optional\** | The X/Twitter status link. (Either `url` or `textAnimation` is required). |
| `format` | `string` | `"story"` | `"story"` (1080×1920) or `"post"` (1080×1350). |
| `scale` | `number` | `1.5` / `2.3` | Zoom/scale multiplier of the tweet card content. Default is `2.3` in complete mode, otherwise `1.5`. |
| `hideStats` | `boolean` | `true` | Hide or show the tweet engagement statistics (likes, replies, etc.). |
| `background` | `string` | `null` | Base64 encoded image string, or a local file path to use as a background image. |
| `textAnimation` | `string` | `null` | Text content to generate as a kinetic animation (Story video). |
| `complex` | `boolean` | `false` | Apply complex FFmpeg processing filters (noise, eq, crop, scaling). |
| `complete` | `boolean` | `false` | Enable complete mode. Loads options from `complete.json` and concats an intro hook animation before the main video. |
| `videoOnly` | `boolean` | `false` | Output only the tweet video on the background, omitting the tweet card. |
| `endVideo` | `string` | `null` | Base64 encoded video or a local file path to append to the end of the final video. |

### Responses

* **`200 OK`**: Returns the rendered file as a binary stream.
  * **Content-Type**: `image/png` or `video/mp4`
  * **Content-Disposition**: `attachment; filename="[statusId].[png|mp4]"`
* **`400 Bad Request`**: Missing required parameters or invalid formatting.
* **`500 Internal Server Error`**: Server failed to process the request.

---

### Request Examples

#### curl
```bash
curl -X POST http://178.104.62.47:7001/api/capture \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://x.com/indypersian/status/2076461082479353894",
    "complete": true
  }' \
  --output output_video.mp4
```

#### JavaScript (`fetch`)
```javascript
const response = await fetch("http://178.104.62.47:7001/api/capture", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: "https://x.com/indypersian/status/2076461082479353894",
    complete: true
  })
});

if (response.ok) {
  const blob = await response.blob();
  // Download or process the file blob
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tweet.mp4";
  link.click();
} else {
  console.error("Failed to generate capture:", await response.text());
}
```

#### Python (`requests`)
```python
import requests

url = "http://178.104.62.47:7001/api/capture"
payload = {
    "url": "https://x.com/indypersian/status/2076461082479353894",
    "complete": True
}

response = requests.post(url, json=payload)

if response.status_code == 200:
    with open("output_video.mp4", "wb") as f:
        f.write(response.content)
    print("Saved as output_video.mp4")
else:
    print("Error:", response.json())
```

---

## 2. GET `/api/config`

Retrieves the current configurations stored in `complete.json`.

* **URL:** `/api/config`
* **Method:** `GET`

### Responses

* **`200 OK`**: Returns the `complete.json` configuration as JSON.
* **`500 Internal Server Error`**: Failed to parse or read configuration.

#### curl Example
```bash
curl http://178.104.62.47:7001/api/config
```

---

## 3. POST/PUT `/api/config`

Updates the configurations in `complete.json`. This endpoint merges your updates with the existing configuration (supporting partial updates, including nested merges for `complexConfig`).

* **URL:** `/api/config`
* **Method:** `POST` or `PUT`
* **Headers:** `Content-Type: application/json`

### Request Body (JSON)
You can send the full configuration object, or only the specific keys you wish to update (e.g., just the background picture).

```json
{
  "background": "./assets/ghooghnoos.jpeg",
  "endVideo": "./assets/End-Ghogh.mp4",
  "scale": 2.3,
  "hideStats": true,
  "complex": true,
  "complexConfig": {
    "setpts": "0.99*PTS",
    "crop": "iw*0.65:ih*0.65",
    "noise": "alls=2:allf=t",
    "eq": "gamma=1.04:saturation=1.05",
    "scale": "935:-2",
    "overlay": "(W-w)/2:(H-h)/2",
    "atempo": "1.01",
    "aresample": "48000"
  }
}
```

### Responses

* **`200 OK`**: Configuration updated successfully. Returns `{ "success": true, "config": ... }`.
* **`500 Internal Server Error`**: Server failed to write the configuration.

#### curl Example (Updating only the background picture)
```bash
curl -X POST http://178.104.62.47:7001/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "background": "./assets/virman.jpeg"
  }'
```

#### curl Example (Updating scale and stats setting)
```bash
curl -X POST http://178.104.62.47:7001/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "scale": 2.5,
    "hideStats": true
  }'
```



‍‍‍#### curl Example for comeplte mode 
```bash
curl -X POST http://178.104.62.47:7001/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "background": "./assets/virman.jpeg",
    "endVideo": "./assets/End-Ghogh.mp4",
    "scale": 2.3,
    "hideStats": true,
    "complex": true,
    "complexConfig": {
      "setpts": "0.99*PTS",
      "crop": "iw*0.65:ih*0.65",
      "noise": "alls=2:allf=t",
      "eq": "gamma=1.04:saturation=1.05",
      "scale": "935:-2",
      "overlay": "(W-w)/2:(H-h)/2",
      "atempo": "1.01",
      "aresample": "48000"
    }
  }'
```
‍‍‍### or simple one for comeplte mode 

``` bash

HTTP Request Details
Method: POST
URL: http://178.104.62.47:7001/api/capture
Headers: Content-Type: application/json
Body:
json
{
  "url": "https://x.com/indypersian/status/2076461082479353894",
  "complete": true
}

```
