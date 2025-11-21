# L-Banner Player

A CDN-ready video player with L-Banner integration for displaying time-based banner advertisements around video content. The bundle automatically loads Shaka Player and Bootstrap dependencies.

## Installation

### Via CDN (jsDelivr)

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO@v1.0.0/dist/lbanner-player.min.css" />

<!-- JavaScript Bundle -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO@v1.0.0/dist/lbanner-player.min.js"></script>
```

### Via GitHub Release

```html
<!-- CSS -->
<link rel="stylesheet" href="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.0/lbanner-player.min.css" />

<!-- JavaScript Bundle -->
<script src="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.0/lbanner-player.min.js"></script>
```

### Local Installation

```html
<link rel="stylesheet" href="./dist/lbanner-player.min.css" />
<script src="./dist/lbanner-player.min.js"></script>
```

## Quick Start

### Basic Usage

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>L-Banner Player</title>
    <link rel="stylesheet" href="./dist/lbanner-player.min.css" />
  </head>
  <body>
    <!-- Player Container -->
    <div id="player-shell" class="shaka-player-container">
      <div id="video-area" data-role="video-area">
        <video
          id="video-element"
          class="shaka-video"
          data-video-src="https://example.com/video.mpd"
          autoplay
          muted
          playsinline
        ></video>
      </div>
      <div id="l-banner-host" aria-live="polite"></div>
    </div>

    <!-- Load L-Banner Bundle -->
    <script src="./dist/lbanner-player.min.js"></script>
    <script>
      // Analytics Configuration - MUST be set before initialization
      // IMPORTANT: ENABLE_ANALYTICS must ALWAYS be true for banners to display
      window.ENABLE_ANALYTICS = true; // MUST ALWAYS BE TRUE - Required for banners to work
      window.LBannerAnalyticsConfig = {
        showStatusPanel: false, // Set to true/false to show/hide the status panel
      };

      // Initialize L-Banner Player
      document.addEventListener("DOMContentLoaded", async () => {
        try {
          await window.LBannerPlayer.init({
            apiKey: "your-api-key-here",
            vastUrl: "./banners/left-bottom-image.xml",
            enableCookieTracking: true, // Set to true/false to enable/disable cookie tracking
            showBannersOnPause: false, // Set to true/false to show/hide banners on pause
          });
        } catch (error) {
          console.error("Failed to initialize L-Banner:", error);
        }
      });
    </script>
  </body>
</html>
```

## Configuration Options

### `LBannerPlayer.init(options)`

Initialize the L-Banner player with configuration options.

#### Required Parameters

- **`apiKey`** (string): API key for ad server authentication
- **`vastUrl`** (string): URL to fetch VAST XML from (can be local or remote)

#### Optional Parameters

- **`videoUrl`** (string): Optional video URL override. If not provided, will try to extract from:
  1. VAST XML MediaFile elements
  2. `data-video-src` or `data-src` attributes on `#video-element`
  3. `src` attribute on `#video-element`

- **`container_id`** (string): Container ID for the player (defaults to `"player-shell"`)

- **`adEndpoint`** (string): Ad server endpoint URL for analytics (defaults to `vastUrl`)

- **`enableCookieTracking`** (boolean): Enable/disable cookie-based banner tracking (default: `true`)
  - Set to `false` to disable cookie tracking while still showing banners
  - Note: `ENABLE_ANALYTICS` must still be `true` for banners to display

- **`showBannersOnPause`** (boolean): Show banners when video playback is paused (default: `false`)
  - Set to `true` to display banners during pause
  - Set to `false` to only show banners based on VSAT timing configuration

#### Example

```javascript
await window.LBannerPlayer.init({
  apiKey: "your-api-key-here",
  vastUrl: "https://your-server.com/vast.xml",
  videoUrl: "https://example.com/video.mpd", // Optional
  enableCookieTracking: true,
  showBannersOnPause: false,
});
```

## Analytics Configuration

### Global Configuration

Set these variables **before** the bundle script loads:

```javascript
// MUST be true for banners to display
// Setting to false disables ALL banner functionality
window.ENABLE_ANALYTICS = true;

// Status panel configuration
window.LBannerAnalyticsConfig = {
  showStatusPanel: false, // Set to true/false to show/hide the debug status panel
};
```

### Important Notes

- **`ENABLE_ANALYTICS`** must **ALWAYS** be `true` for banners to work. Setting it to `false` disables the entire banner rendering system, not just tracking.
- To disable cookie tracking while keeping banners, set `enableCookieTracking: false` in `init()` options, but keep `ENABLE_ANALYTICS = true`.

## VAST XML Format

L-Banner uses VSAT (Video Ad Serving Template) XML format with L-Banner extensions. The VAST XML should contain:

- **Display Timing**: `StartOffset` and `EndOffset` elements to control when banners appear
- **Segments**: `Horizontal` and `Vertical` segments defining banner layout
- **Content**: Images, polls, buttons, and media files
- **Positioning**: Absolute positioning (x, y coordinates) or relative positioning (left, right, top, bottom)

The player automatically parses the VAST XML and displays banners based on the timing configuration.

## Features

✅ **Time-Based Banners** - Display banners at specific video timestamps  
✅ **L-Shaped Layouts** - Support for left-bottom, right-bottom, and other corner configurations  
✅ **Interactive Elements** - Polls, buttons, and clickable content  
✅ **Cookie Tracking** - Optional cookie-based interaction tracking  
✅ **Pause Display** - Optional banner display when video is paused  
✅ **Shaka Player Integration** - Automatic Shaka Player loading and initialization  
✅ **CDN Ready** - Single bundle file, no build step required  
✅ **Auto-Dependency Loading** - Automatically loads Shaka Player and Bootstrap from CDN  

## Building

To build the minified bundle from source:

```bash
npm install
npm run build
```

This creates:
- `dist/lbanner-player.min.js` - Minified JavaScript bundle
- `dist/lbanner-player.min.css` - CSS stylesheet

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

**Requirements:**
- ES6+ support
- Fetch API
- DOMParser

