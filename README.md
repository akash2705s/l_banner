# L-Banner Player - CDN-Ready Video Player

A single-file, CDN-ready video player with Shaka Player and L-Banner integration. Embed it anywhere with a simple script tag. The bundle automatically loads Shaka Player and Bootstrap dependencies.

## Installation

### Via GitHub Release (Recommended)

```html
<!-- CSS -->
<link rel="stylesheet" href="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.0/lbanner-player.min.css" />

<!-- JavaScript Bundle (includes Shaka Player, Bootstrap JS, VSAT Parser, Analytics) -->
<script src="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.0/lbanner-player.min.js"></script>
```

### Via jsDelivr CDN

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO@v1.0.0/dist/lbanner-player.min.css" />

<!-- JavaScript Bundle -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/YOUR_REPO@v1.0.0/dist/lbanner-player.min.js"></script>
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
<html>
<head>
  <title>L-Banner Player Example</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
  <link rel="stylesheet" href="./dist/lbanner-player.min.css" />
</head>
<body>
  <!-- Container for the player -->
  <div id="player-shell" class="shaka-player-container" data-shaka-player-container>
    <div id="video-area" data-role="video-area">
      <video id="video-element" class="shaka-video" data-shaka-player autoplay muted playsinline></video>
    </div>
    <div id="l-banner-host" aria-live="polite"></div>
  </div>

  <!-- Load L-Banner Bundle (includes Shaka Player, Bootstrap JS) -->
  <script src="./dist/lbanner-player.min.js"></script>
  
  <!-- Initialize -->
  <script>
    document.addEventListener("DOMContentLoaded", async () => {
      await window.LBannerPlayer.init({
        apiKey: "your-api-key-here",
        vastUrl: "https://your-server.com/vast.xml"
      });
    });
  </script>
</body>
</html>
```

## Configuration Options

```javascript
LBannerPlayer.init({
  // Required
  apiKey: "your-api-key-here",        // API key for banner ads
  vastUrl: "https://your-server.com/vast.xml",  // VAST XML URL (can be local or remote)
  
  // Optional - Video URL override
  // If not provided, will try to extract from VAST MediaFile or use data-video-src attribute
  videoUrl: "https://example.com/video.mpd",
  
  // Optional - Container ID (defaults to "player-shell")
  container_id: "player-shell",

  // Optional - Force banners to appear when playback is paused
  // Set to true to surface the active L-Banner segments on pause, false to keep default timing-only behavior
  showBannersOnPause: false,
});
```

## How to Call the Player

You can initialize the L-Banner player from any JavaScript context as long as `dist/lbanner-player.min.js` is loaded on the page. Common entry points in this repo:

1. **Inline script (see `index.html` lines 269-276)** – ideal for demos or simple embeds. It calls:
   ```javascript
   await window.LBannerPlayer.init({
     apiKey: "your-api-key-here",
     vastUrl: "./banners/left-bottom-image.xml",
     enableCookieTracking: ENABLE_COOKIE_TRACKING,
     showBannersOnPause: SHOW_BANNERS_ON_PAUSE,
   });
   ```

2. **Standalone initializer (`init-example.js`)** – demonstrates calling `window.initLBanner` directly when bundling yourself:
   ```javascript
   window.initLBanner({
     key: "your-api-key-here",
     url: "https://your-server.com/vast.xml",
   });
   ```

3. **Bundled loader (`build/lbanner-entry.js`)** – wraps dependency loading (Shaka, Bootstrap) and then forwards every option to `initLBanner`. Use this file as the entry when creating a CDN bundle so consumers only call `LBannerPlayer.init`.

Pick whichever pattern fits your integration; all of them ultimately call `window.initLBanner`, so any new JS file can do the same once the bundle is on the page.

**Note:** The player dynamically adapts to whatever VAST XML configuration is provided. Video URL, banner timing, positioning, content, and buttons are all extracted from the VAST XML automatically.

## Building

To build the minified bundle:

```bash
npm install
npm run build
```

This creates:
- `dist/lbanner-player.min.js` - Minified JavaScript bundle (includes Shaka Player loader, Bootstrap JS loader, VSAT Parser, Analytics, Main)
- `dist/lbanner-player.min.css` - Minified CSS bundle (includes styles.css)

### VAST Ads Configuration

```javascript
ShakePlayer.init({
  containerId: 'my-player',
  videoUrl: 'https://example.com/video.mpd',
  
  // VAST Ads (optional)
  vast: {
    preRollUrl: 'https://ad-server.com/vast.xml', // Pre-roll VAST URL
    midRollUrl: null, // Mid-roll VAST URL (uses preRollUrl if not provided)
    showPreRoll: true, // Enable pre-roll ads
    showMidRoll: true, // Enable mid-roll ads
    midRollTime: 30, // Time to trigger mid-roll (seconds)
    useMockVAST: false, // Use mock VAST for testing
    enableDebug: false // Show VAST debug console
  }
});
```

See **[VAST_README.md](./VAST_README.md)** for complete VAST integration guide.

## Features

✅ **Single File** - Everything bundled in one JavaScript file  
✅ **CDN Ready** - Load via script tag, no build step  
✅ **Shaka Player** - Adaptive streaming with DASH/HLS support  
✅ **VAST Ads** - Full VAST 3.0/4.0 support with pre-roll and mid-roll ads  
✅ **Brightline Integration** - Automatic Brightline overlay detection and rendering  
✅ **L-Banner Ads** - Time-based L-shaped banner overlays  
✅ **Poll Support** - Interactive polls in banners  
✅ **Ad Tracking** - Automatic tracking pixel firing (impression, quartiles, completion)  
✅ **Skippable Ads** - Support for skippable ads with skip buttons  
✅ **Auto-initialization** - Works automatically when loaded  
✅ **No Dependencies** - Loads Shaka Player automatically  

## API Reference

### `ShakePlayer.init(options)`

Initialize the player with configuration options.

**Returns:** Promise that resolves to the ShakePlayer instance

### `ShakePlayer.showBanner(bannerType)`

Manually show a banner.

**Parameters:**
- `bannerType` (string): One of `'leftImage'`, `'leftPoll'`, `'rightBottom'`

**Example:**
```javascript
ShakePlayer.showBanner('leftImage');
```

### `ShakePlayer.destroy()`

Destroy the player instance and clean up resources.

**Example:**
```javascript
ShakePlayer.destroy();
```

## Banner Types

The player supports three banner types:

1. **`leftImage`** - Left + Bottom L-banner with images
2. **`leftPoll`** - Left + Bottom L-banner with poll
3. **`rightBottom`** - Right + Bottom L-banner with images

Banners are automatically shown based on `bannerTimes` configuration.

## Embedding in iframe

You can embed the player in an iframe:

```html
<iframe 
  src="https://your-cdn.com/player-page.html" 
  width="1280" 
  height="720"
  frameborder="0"
  allowfullscreen>
</iframe>
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

Requires:
- ES6+ support
- Fetch API
- DOMParser

## File Structure

```
shake/
├── shake-player.js    # Single bundled file (CDN-ready)
├── example.html       # Usage example
├── README.md          # This file
└── ...                # Original source files (for development)
```

## Development

The bundled `shake-player.js` includes:
- L-Banner Analytics engine
- Shaka Player integration
- CSS styles (inlined)
- Mock banner data
- Auto-initialization logic

## License

MIT License

