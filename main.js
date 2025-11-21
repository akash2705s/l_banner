/**
 * L-Banner Main Module
 * 
 * This is the main entry point for the L-Banner system. It:
 * - Fetches and parses VAST XML to extract banner configurations
 * - Initializes Shaka Player for video playback
 * - Sets up time-based banner display triggers
 * - Coordinates between video player, banner analytics, and VSAT parser
 * - Handles pause/play banner display logic
 * 
 * The module provides the initLBanner() function which initializes the entire system.
 */

/**
 * Global configuration object - set by init script
 * Stores API keys, URLs, and feature flags for the L-Banner system
 */
let CONFIG = {
  API_KEY: null, // API key for ad server authentication
  VAST_URL: null, // URL to fetch VAST XML from
  VIDEO_URL: null, // Optional video URL override
  AD_ENDPOINT: null, // Ad server endpoint for analytics
  CONTAINER_ID: "player-shell", // DOM ID of player container
  ENABLE_COOKIE_TRACKING: true, // Enable/disable cookie-based banner tracking
  SHOW_BANNERS_ON_PAUSE: false, // Show banners when video is paused
};

/**
 * Store parsed VSAT banners (dynamically loaded from VAST URL)
 * Keyed by ad ID, contains parsed banner configuration objects
 */
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
 * 
 * Downloads VAST XML, parses each Ad element, and extracts L-Banner configurations.
 * Handles multiple ads in a single VAST response by parsing each Ad separately.
 * 
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
      credentials: CONFIG.ENABLE_COOKIE_TRACKING ? "include" : "omit",
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
 * Get banner data by key or return first available banner
 * 
 * If bannerKey is provided and exists, returns that banner.
 * Otherwise returns the first available banner from parsedBanners.
 * 
 * @param {string} [bannerKey=null] - Optional banner key to retrieve specific banner
 * @returns {Object|null} Banner data object or null if no banners available
 */
function getBannerData(bannerKey = null) {
  if (bannerKey && parsedBanners[bannerKey]) {
    return parsedBanners[bannerKey];
  }
  // Return first available banner
  return Object.values(parsedBanners)[0] || null;
}

/**
 * Initialize Shaka Player for video playback
 * 
 * Creates Shaka Player instance with UI overlay and loads video URL.
 * Configures control panel with standard playback controls.
 * 
 * @param {string} videoUrl - Video URL to load into player
 * @returns {Promise<Object>} Shaka player instance
 * @throws {Error} If Shaka Player library is not loaded
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
 * Find which banner should be displayed at a given video time
 * 
 * Checks all parsed banners to find one whose timing range includes the current time.
 * Uses startOffset and endOffset from VSAT Display timing configuration.
 * 
 * @param {number} timeInSeconds - Current video playback time in seconds
 * @returns {Object} Object with 'key' (banner ID) and 'banner' (banner data), or null values
 */
function findBannerForTime(timeInSeconds) {
  for (const [key, banner] of Object.entries(parsedBanners)) {
    const startOffset = banner?.configuration?.timing?.startOffset;
    const endOffset = banner?.configuration?.timing?.endOffset;

    if (
      startOffset !== null &&
      startOffset !== undefined &&
      endOffset !== null &&
      endOffset !== undefined &&
      timeInSeconds >= startOffset &&
      timeInSeconds < endOffset
    ) {
      return { key, banner };
    }
  }

  return { key: null, banner: null };
}

/**
 * Setup time-based banner display using VSAT Display timing
 * 
 * Dynamically adapts to all banners loaded from VAST XML.
 * Listens to video timeupdate events and shows/hides banners based on timing configuration.
 * Also handles pause/play banner display if SHOW_BANNERS_ON_PAUSE is enabled.
 * 
 * @param {HTMLVideoElement} video - Video element to monitor for time updates
 */
function setupBannerTiming(video) {
  let currentBannerKey = null;
  let lastCheckTime = -1;
  let forcedPauseBannerActive = false;
  let lastVisibleBanner = null;

    /**
     * Update which banner is currently displayed
     * 
     * Shows new banner if targetKey changes, hides current banner if target becomes null.
     * Tracks last visible banner for pause fallback logic.
     * 
     * @param {string|null} targetKey - Banner key to show, or null to hide
     * @param {Object|null} targetBanner - Banner data object to display
     */
    function updateBannerTarget(targetKey, targetBanner) {
    if (targetKey === currentBannerKey) return;

    if (targetKey !== null && targetBanner) {
      showBanner(targetBanner);
      // Always update lastVisibleBanner when showing a banner
      lastVisibleBanner = targetBanner;
    } else if (currentBannerKey !== null && currentBannerKey !== '_pause_banner') {
      // Hide banner only if it's not a pause banner
      callAnalytics('hide');
    }

    // Update currentBannerKey (pause banner sets it separately)
    if (targetKey !== '_pause_banner') {
      currentBannerKey = targetKey;
    }
  }

    /**
     * Evaluate which banner should be shown at current video time
     * 
     * Checks video currentTime and finds matching banner based on timing configuration.
     * Only updates if time has changed significantly (0.1s threshold) unless forced.
     * 
     * @param {boolean} [force=false] - Force evaluation even if time hasn't changed
     */
    function evaluateBannerForCurrentTime(force = false) {
    const currentTime = video.currentTime;
    if (!force && Math.abs(currentTime - lastCheckTime) < 0.1) return;

    lastCheckTime = currentTime;
    const { key, banner } = findBannerForTime(currentTime);
    updateBannerTarget(key, banner);
  }

  video.addEventListener("timeupdate", () => {
    evaluateBannerForCurrentTime();
  });

  if (CONFIG.SHOW_BANNERS_ON_PAUSE) {
    video.addEventListener("pause", () => {
      // First, evaluate what banner should be shown at current time
      const currentTime = video.currentTime;
      const { key: timeBasedKey, banner: timeBasedBanner } = findBannerForTime(currentTime);
      
      // If there's a time-based banner, show it and update tracking
      if (timeBasedKey !== null && timeBasedBanner) {
        updateBannerTarget(timeBasedKey, timeBasedBanner);
        lastVisibleBanner = timeBasedBanner;
      } else {
        // No time-based banner, show fallback banner
        const fallbackBanner = lastVisibleBanner || getBannerData();
        if (fallbackBanner) {
          forcedPauseBannerActive = true;
          lastVisibleBanner = fallbackBanner;
          callAnalytics('setBanner', fallbackBanner);
          callAnalytics('show');
          // Mark that we're showing a pause banner
          currentBannerKey = '_pause_banner';
        }
      }
    });

    video.addEventListener("play", () => {
      // Clear pause banner flag
      const wasPauseBanner = forcedPauseBannerActive || currentBannerKey === '_pause_banner';
      forcedPauseBannerActive = false;
      
      // Reset currentBannerKey if it was a pause banner
      if (currentBannerKey === '_pause_banner') {
        currentBannerKey = null;
      }
      
      // Force re-evaluation to show correct banner for current time
      evaluateBannerForCurrentTime(true);
      
      // If no banner should be shown and we had a pause banner, hide it
      if (currentBannerKey === null && wasPauseBanner) {
        callAnalytics('hide');
      }
    });
  }
}

/**
 * Helper to safely call analytics methods (handles disabled analytics)
 * 
 * Wraps analytics calls to prevent errors if analytics module is disabled.
 * Returns null if analytics is not available.
 * 
 * @param {string} method - Analytics method name to call
 * @param {...any} args - Arguments to pass to analytics method
 * @returns {any|null} Return value from analytics method or null if unavailable
 */
function callAnalytics(method, ...args) {
  if (window.LBannerAnalytics && typeof window.LBannerAnalytics[method] === 'function') {
    return window.LBannerAnalytics[method](...args);
  }
  return null;
}

/**
 * Show banner with given data
 * 
 * Sets banner data in analytics module and triggers banner display.
 * 
 * @param {Object} bannerData - Parsed banner configuration object
 */
function showBanner(bannerData) {
  if (!bannerData) {
    console.warn("[Main] No banner data provided");
    return;
  }
  console.log("[Main] Showing banner:", bannerData.meta?.id);
  callAnalytics('setBanner', bannerData);
  callAnalytics('show');
}

/**
 * Initialize L-Banner system
 * 
 * Main initialization function that sets up the entire L-Banner system:
 * 1. Fetches and parses VAST XML to extract banner configurations
 * 2. Initializes Shaka Player for video playback (if video URL provided)
 * 3. Initializes banner analytics module
 * 4. Sets up time-based banner display triggers
 * 
 * @param {Object} options - Initialization options
 * @param {string} options.key - API key for ad server authentication
 * @param {string} options.url - VAST XML URL to fetch banner configurations from
 * @param {string} [options.videoUrl] - Optional video URL override (falls back to DOM attributes or VAST media)
 * @param {string} [options.adEndpoint] - Optional ad endpoint URL (for analytics, defaults to VAST URL)
 * @param {string} [options.container_id] - Optional container id for analytics (defaults to "player-shell")
 * @param {boolean} [options.enableCookieTracking=true] - Enable/disable cookie-based banner tracking
 * @param {boolean} [options.showBannersOnPause=false] - Show banners when video is paused
 * @returns {Promise<Object>} Object with 'banners' (parsed banners) and 'player' (Shaka instance)
 * @throws {Error} If required parameters are missing or VAST parsing fails
 */
async function initLBanner(options) {
  const {
    key,
    url,
    videoUrl,
    adEndpoint,
    container_id,
    enableCookieTracking,
    showBannersOnPause,
  } = options;

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
  CONFIG.ENABLE_COOKIE_TRACKING =
    enableCookieTracking !== undefined ? enableCookieTracking : CONFIG.ENABLE_COOKIE_TRACKING;
  CONFIG.SHOW_BANNERS_ON_PAUSE =
    showBannersOnPause !== undefined ? showBannersOnPause : CONFIG.SHOW_BANNERS_ON_PAUSE;
  
  console.log(`[Main] Cookie tracking: ${CONFIG.ENABLE_COOKIE_TRACKING ? 'ENABLED' : 'DISABLED'}`);
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

  // Initialize banner analytics (if enabled)
  const video = document.getElementById("video-element");
  
  if (window.LBannerAnalytics && typeof window.LBannerAnalytics.init === 'function') {
    console.log("[Main] Initializing LBannerAnalytics...");
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
      enableCookieTracking: CONFIG.ENABLE_COOKIE_TRACKING,
    });
    console.log("[Main] LBannerAnalytics initialized");
  } else {
    console.log("[Main] Analytics disabled - skipping LBannerAnalytics initialization");
  }

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

/**
 * Auto-initialize on DOM ready if config is available
 * 
 * If CONFIG.API_KEY and CONFIG.VAST_URL are set before DOMContentLoaded,
 * automatically initializes the L-Banner system. Otherwise waits for manual initLBanner() call.
 */
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

/**
 * Export init function globally
 * Makes initLBanner available on window object for external use
 */
if (typeof window !== "undefined") {
  window.initLBanner = initLBanner;
}
