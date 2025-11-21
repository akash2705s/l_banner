/**
 * L-Banner Entry Point
 * 
 * This is the main entry point for the bundled L-Banner player.
 * It:
 * 1. Imports all required modules (VSAT parser, analytics, main, styles)
 * 2. Loads external dependencies (Shaka Player, Bootstrap) from CDN
 * 3. Creates the public LBannerPlayer API wrapper
 * 
 * The LBannerPlayer.init() method ensures proper initialization order:
 * - Loads dependencies first
 * - Waits for modules to be available
 * - Calls the underlying initLBanner function
 */

import "../vsat-parser";
import "../analytics";
import "../main";
import "../styles.css";

/**
 * Load Shaka Player library from CDN
 * 
 * Dynamically loads Shaka Player core, UI, and CSS in sequence.
 * Returns immediately if Shaka Player is already loaded.
 * 
 * @returns {Promise<void>} Resolves when Shaka Player is fully loaded
 * @throws {Error} If script loading fails
 */
function loadShakaPlayer() {
    return new Promise((resolve, reject) => {
        if (window.shaka) {
            resolve();
            return;
        }

        // Load Shaka Player core
        const coreScript = document.createElement("script");
        coreScript.src = "https://cdn.jsdelivr.net/npm/shaka-player@4.9.6/dist/shaka-player.compiled.js";
        coreScript.onload = () => {
            // Load Shaka Player UI
            const uiScript = document.createElement("script");
            uiScript.src = "https://cdn.jsdelivr.net/npm/shaka-player@4.9.6/dist/shaka-player.ui.js";
            uiScript.onload = () => {
                // Load Shaka Player CSS
                const cssLink = document.createElement("link");
                cssLink.rel = "stylesheet";
                cssLink.href = "https://cdn.jsdelivr.net/npm/shaka-player@4.9.6/dist/controls.min.css";
                document.head.appendChild(cssLink);
                resolve();
            };
            uiScript.onerror = reject;
            document.head.appendChild(uiScript);
        };
        coreScript.onerror = reject;
        document.head.appendChild(coreScript);
    });
}

/**
 * Load Bootstrap JavaScript library from CDN
 * 
 * Dynamically loads Bootstrap bundle with integrity check for security.
 * Returns immediately if Bootstrap is already loaded.
 * 
 * @returns {Promise<void>} Resolves when Bootstrap is loaded
 * @throws {Error} If script loading fails
 */
function loadBootstrap() {
    return new Promise((resolve, reject) => {
        if (window.bootstrap) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";
        script.integrity = "sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz";
        script.crossOrigin = "anonymous";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Create LBannerPlayer API wrapper
 * 
 * Creates the public API object immediately so it's available before modules load.
 * The init() method ensures proper initialization order by:
 * 1. Loading external dependencies (Shaka Player, Bootstrap)
 * 2. Waiting for internal modules (initLBanner) to be available
 * 3. Calling the underlying initialization function
 * 
 * This wrapper provides a clean public API while handling async module loading.
 */
(function (global) {
    /**
     * Public API object exposed as window.LBannerPlayer
     * Provides init() method for initializing the L-Banner system
     */
    global.LBannerPlayer = {
        /**
         * Initialize L-Banner Player system
         * 
         * Main public API method. Loads dependencies, waits for modules,
         * and initializes the entire L-Banner system.
         * 
         * @param {Object} [options={}] - Initialization options
         * @param {string} options.apiKey - API key for ad server (required)
         * @param {string} options.vastUrl - VAST XML URL to fetch banners from (required)
         * @param {string} [options.videoUrl] - Optional video URL override
         * @param {string} [options.adEndpoint] - Optional ad endpoint for analytics
         * @param {string} [options.container_id] - Optional container ID
         * @param {boolean} [options.enableCookieTracking] - Enable/disable cookie tracking
         * @param {boolean} [options.showBannersOnPause] - Show banners when paused
         * @returns {Promise<Object>} Object with banners and player instance
         * @throws {Error} If apiKey/vastUrl missing or initialization fails
         */
        async init(options = {}) {
            const { apiKey, vastUrl, ...rest } = options;
            if (!apiKey || !vastUrl) {
                throw new Error("apiKey and vastUrl are required");
            }

            console.log("[LBannerPlayer] Initializing with apiKey and vastUrl");

            /**
             * Load external dependencies first
             * Shaka Player and Bootstrap are loaded in parallel for efficiency
             */
            await Promise.all([
                loadShakaPlayer(),
                loadBootstrap(),
            ]);

            /**
             * Wait for initLBanner to be available (from main.js)
             * Modules are loaded asynchronously, so we poll until initLBanner is ready
             * Maximum 100 attempts (5 seconds) to prevent infinite waiting
             */
            let attempts = 0;
            while (!global.initLBanner && attempts < 100) {
                await new Promise(resolve => setTimeout(resolve, 50));
                attempts++;
            }

            if (!global.initLBanner) {
                throw new Error("initLBanner not available. The bundle may not have loaded correctly.");
            }

            /**
             * Call the underlying initLBanner function
             * Video URL will be extracted from VAST if not provided
             * All other options are passed through to initLBanner
             */
            return global.initLBanner({
                key: apiKey,
                url: vastUrl,
                ...rest,
            });
        }
    };

    /**
     * Log that API wrapper has been created
     * This confirms the public API is available even before dependencies load
     */
    console.log("[LBannerPlayer] API wrapper created");
})(window);