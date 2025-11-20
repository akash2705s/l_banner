// Global configuration - set by init script
let CONFIG = {
  API_KEY: null,
  VAST_URL: null,
  VIDEO_URL: null,
  AD_ENDPOINT: null,
  CONTAINER_ID: "player-shell",
};

// Store parsed VSAT banners (dynamically loaded from VAST URL)
const parsedBanners = {};

/**
 * Resolve the effective video source for playback.
 * Priority:
 *   1. Explicit argument passed to initLBanner
 *   2. data-video-src / data-src attributes on #video-element
 *   3. src attribute on #video-element
 * @param {string|null|undefined} explicitUrl
 * @returns {string|null}
 */
function resolveInitialVideoSource(explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const video = document.getElementById("video-element");
  if (!video) return null;
  return (
    video.dataset.videoSrc ||
    video.dataset.src ||
    video.getAttribute("data-video-src") ||
    video.getAttribute("data-src") ||
    video.getAttribute("src") ||
    null
  );
}

/**
 * Find the first media URL declared in parsed banners
 * @param {Object} banners
 * @returns {string|null}
 */
function getFirstMediaUrl(banners) {
  if (!banners) return null;
  for (const key of Object.keys(banners)) {
    const media = banners[key]?.media;
    if (!media) continue;
    if (media.primaryUrl) return media.primaryUrl;
    if (Array.isArray(media.files)) {
      const fallback = media.files.find((file) => !!file.url);
      if (fallback?.url) return fallback.url;
    }
  }
  return null;
}

/**
 * Fetch VAST XML from URL and parse all ads
 * @param {string} vastUrl - URL to fetch VAST XML from
 * @returns {Promise<Object>} Object with parsed banners keyed by ad ID
 */
async function fetchAndParseVAST(vastUrl) {
  if (!window.VSATParser) {
    console.error("[Main] VSATParser not available");
    return {};
  }

  try {
    console.log(`[Main] Fetching VAST XML from: ${vastUrl}`);
    const response = await fetch(vastUrl, {
      method: "GET",
      headers: {
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log("[Main] VAST XML fetched, parsing...");

    // Parse VAST XML - handle both single ad and multiple ads
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for parsing errors
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      console.error("[Main] Invalid VAST XML format:", parserError.textContent);
      return {};
    }

    // Find all Ad elements in VAST
    const adElements = xmlDoc.querySelectorAll("Ad");
    console.log(`[Main] Found ${adElements.length} ad(s) in VAST`);

    const banners = {};

    adElements.forEach((adEl, index) => {
      // Extract Ad ID if available
      const adId = adEl.getAttribute("id") ||
        adEl.querySelector("AdSystem")?.textContent?.trim() ||
        `ad_${index}`;

      // Serialize the Ad element to XML string
      const serializer = new XMLSerializer();
      const adXml = serializer.serializeToString(adEl);

      // Get VAST version from root element
      const vastVersion = xmlDoc.documentElement.getAttribute("version") || "4.0";

      // Create a complete VAST XML document for this ad
      const fullVastXml = `<?xml version="1.0" encoding="UTF-8"?><VAST version="${vastVersion}">${adXml}</VAST>`;

      // Parse using VSATParser
      const parsed = window.VSATParser.parseVSAT(fullVastXml);

      if (parsed) {
        banners[adId] = parsed;
        const timing = parsed?.configuration?.timing;
        console.log(`[Main] ✓ Parsed ad '${adId}'`);
        console.log(`  └─ Timing: ${timing?.startOffset}s - ${timing?.endOffset}s`);
        console.log(`  └─ Position: ${parsed?.configuration?.layout?.position}`);
      } else {
        console.warn(`[Main] ✗ Failed to parse ad '${adId}'`);
      }
    });

    console.log(`[Main] Total banners parsed: ${Object.keys(banners).length}`);
    return banners;
  } catch (error) {
    console.error("[Main] Failed to fetch/parse VAST:", error);
    return {};
  }
}

/**
 * Get banner data by key or return first available
 * @param {string} bannerKey - Optional banner key
 * @returns {Object|null} Banner data
 */
function getBannerData(bannerKey = null) {
  if (bannerKey && parsedBanners[bannerKey]) {
    return parsedBanners[bannerKey];
  }
  // Return first available banner
  return Object.values(parsedBanners)[0] || null;
}

/**
 * Initialize Shaka Player
 * @param {string} videoUrl - Video URL to load
 * @returns {Promise<Object>} Shaka player instance
 */
async function initShaka(videoUrl) {
  if (!window.shaka) throw new Error("Shaka Player failed to load");
  const video = document.getElementById("video-element");
  const container = document.getElementById(CONFIG.CONTAINER_ID || "player-shell");
  const player = new shaka.Player(video);
  const ui = new shaka.ui.Overlay(player, container, video);
  ui.configure({
    controlPanelElements: [
      "play_pause",
      "time_and_duration",
      "mute",
      "spacer",
      "volume",
      "captions",
      "fullscreen",
    ],
  });
  try {
    if (videoUrl) {
      await player.load(videoUrl);
    }
  } catch (err) {
    console.error("[Main] Shaka load error", err);
  }
  return player;
}

/**
 * Setup time-based banner display using VSAT Display timing
 * Dynamically adapts to all banners loaded from VAST
 * @param {HTMLVideoElement} video - Video element
 */
function setupBannerTiming(video) {
  let currentBannerKey = null;
  let lastCheckTime = -1;

  video.addEventListener("timeupdate", () => {
    const currentTime = video.currentTime;

    // Throttle checks to every 0.1s for performance
    if (Math.abs(currentTime - lastCheckTime) < 0.1) return;
    lastCheckTime = currentTime;

    // Find which banner should be shown at current time
    // Priority: first banner that matches timing
    let targetBannerKey = null;
    let targetBanner = null;

    for (const [key, banner] of Object.entries(parsedBanners)) {
      const startOffset = banner?.configuration?.timing?.startOffset;
      const endOffset = banner?.configuration?.timing?.endOffset;

      // Check if timing is defined (startOffset can be 0, so check !== null/undefined)
      if (startOffset !== null && startOffset !== undefined &&
        endOffset !== null && endOffset !== undefined) {
        // Check if current time is in this banner's range
        if (currentTime >= startOffset && currentTime < endOffset) {
          targetBannerKey = key;
          targetBanner = banner;
          break; // Use first matching banner
        }
      }
    }

    // Handle banner changes
    if (targetBannerKey !== currentBannerKey) {
      // Show new banner if there is one (will automatically cleanup old banner immediately)
      if (targetBannerKey !== null && targetBanner) {
        showBanner(targetBanner);
      } else if (currentBannerKey !== null) {
        // Only explicitly hide if transitioning to no banner (not banner-to-banner)
        window.LBannerAnalytics.hide();
      }

      currentBannerKey = targetBannerKey;
    }
  });
}

/**
 * Show banner with given data
 * @param {Object} bannerData - Parsed banner configuration
 */
function showBanner(bannerData) {
  if (!bannerData) {
    console.warn("[Main] No banner data provided");
    return;
  }
  console.log("[Main] Showing banner:", bannerData.meta?.id);
  window.LBannerAnalytics.setBanner(bannerData);
  window.LBannerAnalytics.show();
}

/**
 * Initialize L-Banner system
 * @param {Object} options - Initialization options
 * @param {string} options.key - API key
 * @param {string} options.url - VAST XML URL
 * @param {string} [options.videoUrl] - Optional video URL override (falls back to DOM attributes)
 * @param {string} [options.adEndpoint] - Optional ad endpoint URL (for analytics)
 * @param {string} [options.container_id] - Optional container id for analytics
 */
async function initLBanner(options) {
  const { key, url, videoUrl, adEndpoint, container_id } = options;

  if (!key || !url) {
    throw new Error("[Main] initLBanner requires 'key' and 'url' parameters");
  }

  console.log("[Main] Initializing L-Banner system...");
  console.log(`[Main] API Key: ${key.substring(0, 4)}...`);
  console.log(`[Main] VAST URL: ${url}`);

  // Set global config
  CONFIG.API_KEY = key;
  CONFIG.VAST_URL = url;
  CONFIG.VIDEO_URL = resolveInitialVideoSource(videoUrl);
  CONFIG.AD_ENDPOINT = adEndpoint || url; // Default to VAST URL if not provided
  CONFIG.CONTAINER_ID = container_id || CONFIG.CONTAINER_ID || "player-shell";
  const resolvedContainerId = CONFIG.CONTAINER_ID;
  let resolvedVideoUrl = CONFIG.VIDEO_URL;

  // Initialize tracking system
  if (window.LBannerTracking) {
    window.LBannerTracking.init();
  }

  // Fetch and parse VAST XML from URL
  const banners = await fetchAndParseVAST(url);
  Object.assign(parsedBanners, banners);

  if (!resolvedVideoUrl) {
    const derivedVideo = getFirstMediaUrl(parsedBanners);
    if (derivedVideo) {
      resolvedVideoUrl = derivedVideo;
      CONFIG.VIDEO_URL = derivedVideo;
      console.log(`[Main] Using video from VAST media: ${derivedVideo}`);
    }
  }

  if (Object.keys(parsedBanners).length === 0) {
    console.error("[Main] No banners were parsed from VAST XML!");
    throw new Error("No valid banners found in VAST XML");
  }

  // Initialize Shaka Player if video URL provided
  let shakaPlayer = null;
  if (resolvedVideoUrl) {
    console.log("[Main] Initializing Shaka Player...");
    shakaPlayer = await initShaka(resolvedVideoUrl);
    console.log("[Main] Shaka Player initialized");
  } else {
    // Try to get existing player instance
    const video = document.getElementById("video-element");
    if (video && video.getAttribute("data-shaka-player")) {
      // Player might already be initialized
      console.log("[Main] Using existing video player");
    } else {
      console.warn(
        "[Main] No video source provided via init options, DOM attributes, or VAST media."
      );
    }
  }

  // Initialize banner analytics
  console.log("[Main] Initializing LBannerAnalytics...");
  const video = document.getElementById("video-element");

  window.LBannerAnalytics.init({
    apiKey: CONFIG.API_KEY,
    videoRef: {
      container_id: resolvedContainerId,
      playerInstance: shakaPlayer,
    },
    playerShellId: resolvedContainerId,
    videoAreaSelector: "#video-area",
    bannerHostId: "l-banner-host",
    adEndpoint: CONFIG.AD_ENDPOINT,
  });
  console.log("[Main] LBannerAnalytics initialized");

  // Setup time-based banner display using VSAT Display timing
  setupBannerTiming(video);
  console.log("[Main] Banner timing setup complete");
  console.log("[Main] ✓ L-Banner system initialized successfully!");
  console.log(`[Main] Loaded ${Object.keys(parsedBanners).length} banner(s) from VAST`);

  return {
    banners: parsedBanners,
    player: shakaPlayer,
  };
}

// Auto-initialize on DOM ready if config is available
document.addEventListener("DOMContentLoaded", async () => {
  // Check if initLBanner was called manually
  if (CONFIG.API_KEY && CONFIG.VAST_URL) {
    try {
      await initLBanner({
        key: CONFIG.API_KEY,
        url: CONFIG.VAST_URL,
        videoUrl: CONFIG.VIDEO_URL,
        adEndpoint: CONFIG.AD_ENDPOINT,
      });
    } catch (error) {
      console.error("[Main] Auto-initialization failed:", error);
    }
  } else {
    console.log("[Main] Waiting for manual initialization via initLBanner()");
  }
});

// Export init function globally
if (typeof window !== "undefined") {
  window.initLBanner = initLBanner;
}
