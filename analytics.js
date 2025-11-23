/**
 * L-Banner Analytics Module
 * 
 * This module handles all banner analytics, rendering, and cookie-based tracking.
 * It provides functionality to:
 * - Fetch and render banner advertisements from an ad server
 * - Track banner impressions and user interactions via cookies
 * - Position banners around video players (L-shaped, corner banners)
 * - Handle banner display timing and animations
 * - Manage cookie-based state tracking for banner interactions
 * 
 * The module can be completely disabled by setting window.ENABLE_ANALYTICS = false
 * before this script loads, which will provide stub functions to prevent errors.
 */
(function () {
  /**
   * Immediately hide status panel if showStatusPanel is false
   * This runs before any other code to ensure panel is hidden as early as possible
   */
  if (typeof document !== 'undefined') {
    const hidePanelIfDisabled = () => {
      const analyticsConfig = window.LBannerAnalyticsConfig || {};
      if (analyticsConfig.showStatusPanel === false) {
        const panelEl = document.getElementById("cookie-status-panel");
        if (panelEl) {
          panelEl.style.display = "none";
          console.log('[LBannerAnalytics] Status panel hidden (showStatusPanel=false)');
        }
      }
    };
    
    // Try immediately
    hidePanelIfDisabled();
    
    // Try when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hidePanelIfDisabled);
    } else {
      hidePanelIfDisabled();
    }
    
    // Also try after delays to catch late DOM updates
    setTimeout(hidePanelIfDisabled, 50);
    setTimeout(hidePanelIfDisabled, 100);
    setTimeout(hidePanelIfDisabled, 500);
    setTimeout(hidePanelIfDisabled, 1000);
  }
  
  /**
   * Check if analytics is enabled via global flag
   * Set window.ENABLE_ANALYTICS = false before loading to completely disable analytics
   */
  const ANALYTICS_ENABLED = typeof window !== 'undefined' && window.ENABLE_ANALYTICS !== false;

  if (!ANALYTICS_ENABLED) {
    console.log('[LBannerAnalytics] Analytics disabled via ENABLE_ANALYTICS flag');
    
    // Hide status panel if it exists and showStatusPanel is false
    if (typeof document !== 'undefined') {
      const analyticsConfig = window.LBannerAnalyticsConfig || {};
      if (analyticsConfig.showStatusPanel === false) {
        // Use setTimeout to ensure DOM is ready
        const hidePanel = () => {
          const panelEl = document.getElementById("cookie-status-panel");
          if (panelEl) {
            panelEl.style.display = "none";
            console.log('[LBannerAnalytics] Status panel hidden (analytics disabled + showStatusPanel=false)');
          }
        };
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', hidePanel);
        } else {
          hidePanel();
        }
        
        // Also try after a short delay to catch late DOM updates
        setTimeout(hidePanel, 100);
        setTimeout(hidePanel, 500);
      }
    }
    
    // Provide minimal stub API to prevent errors
    window.LBannerAnalytics = {
      init: () => console.warn('[LBannerAnalytics] Analytics is disabled'),
      refresh: () => { },
      setBanner: () => { },
      show: () => { },
      hide: () => { },
      getCurrentBanner: () => null,
      checkCookieStatus: () => ({}),
      updateCookieStatusDisplay: () => { },
      destroy: () => { },
    };
    return; // Exit early if analytics is disabled
  }

  /**
   * Internal state object storing all analytics module state
   * - apiKey: API key for ad server authentication
   * - adEndpoint: URL endpoint for fetching banner ads
   * - videoRef: Reference to video player instance and container
   * - playerShell: DOM element containing the video player
   * - bannerHost: DOM element where banners are rendered
   * - videoArea: DOM element representing the video area
   * - videoAreaSelector: CSS selector for video area
   * - closeButton: DOM element for banner close button
   * - currentBanner: Currently displayed banner data object
   * - controller: AbortController for canceling fetch requests
   * - enableCookieTracking: Whether cookie-based tracking is enabled
   */
  const state = {
    apiKey: null,
    adEndpoint: null,
    videoRef: null,
    playerShell: null,
    bannerHost: null,
    videoArea: null,
    videoAreaSelector: null,
    closeButton: null,
    currentBanner: null,
    controller: null,
    enableCookieTracking: true, // Default: enabled
  };

  /**
   * Cookie configuration for storing banner interaction state
   * - NAME: Cookie name for banner element tracking
   * - MAX_AGE_SECONDS: Cookie expiration time (30 days)
   */
  const ELEMENT_COOKIE = {
    NAME: "lbanner_elements",
    MAX_AGE_SECONDS: 60 * 60 * 24 * 30, // 30 days
  };

  /**
   * Cookie Store Manager
   * Handles reading/writing banner interaction state to browser cookies.
   * Stores banner-level tracking data including:
   * - lastShown: Timestamp when banner was last displayed
   * - state: "clicked" or "notclicked" interaction state
   * - interactionId: Unique ID for this banner display instance
   * - interactedAt: Timestamp when user interacted with banner
   */
  const ElementCookieStore = {
    /**
     * Read banner tracking data from browser cookie
     * Automatically migrates old segment-based data to banner-level format
     * @returns {Object} Parsed cookie data object, or empty object if no cookie exists
     */
    read() {
      if (typeof document === "undefined") return {};
      try {
        const cookies = document.cookie ? document.cookie.split(";") : [];
        const entry = cookies
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith(`${ELEMENT_COOKIE.NAME}=`));
        if (!entry) return {};
        const value = entry.split("=")[1] ?? "";
        if (!value) return {};
        const cookieData = JSON.parse(decodeURIComponent(value));

        // Clean up old segment-based data (migrate to banner-level only)
        const cleanedData = {};
        const segmentPattern = /^content_segment_/;
        for (const [key, value] of Object.entries(cookieData)) {
          // Skip old segment-based entries
          if (!segmentPattern.test(key)) {
            cleanedData[key] = value;
          }
        }

        // If we removed segment data, write back the cleaned version
        if (Object.keys(cleanedData).length !== Object.keys(cookieData).length) {
          console.log("[LBannerAnalytics] Removed old segment-based cookie data, keeping only banner-level data");
          this.write(cleanedData);
          return cleanedData;
        }

        return cookieData;
      } catch (error) {
        console.warn("[LBannerAnalytics] Failed to read element cookie", error);
        return {};
      }
    },
    /**
     * Write banner tracking data to browser cookie
     * Dispatches 'lbanner-cookie-updated' event after successful write
     * @param {Object} data - Banner tracking data object to store
     */
    write(data) {
      if (typeof document === "undefined") return;
      try {
        const serialized = encodeURIComponent(JSON.stringify(data));
        const cookieString = `${ELEMENT_COOKIE.NAME}=${serialized}; path=/; max-age=${ELEMENT_COOKIE.MAX_AGE_SECONDS}`;
        document.cookie = cookieString;
        console.log("[LBannerAnalytics] Updated cookie", ELEMENT_COOKIE.NAME, data);
        // Verify cookie was written
        const verify = document.cookie.includes(ELEMENT_COOKIE.NAME);
        if (!verify) {
          console.warn("[LBannerAnalytics] Cookie write may have failed - cookie not found in document.cookie");
          console.warn("[LBannerAnalytics] Current document.cookie:", document.cookie);
        } else {
          // Dispatch custom event for dynamic cookie tracking updates
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("lbanner-cookie-updated", { detail: data }));
          }
        }
      } catch (error) {
        console.error("[LBannerAnalytics] Failed to write element cookie", error);
      }
    },
    /**
     * Record that a banner was shown to the user
     * Creates/updates cookie entry with banner ID, timestamp, and generates interaction ID
     * @param {string} bannerId - Unique identifier for the banner
     */
    recordBannerShown(bannerId) {
      if (!state.enableCookieTracking) {
        console.log("[LBannerAnalytics] Cookie tracking disabled - skipping recordBannerShown");
        return;
      }
      if (!bannerId) {
        console.warn("[LBannerAnalytics] recordBannerShown called without bannerId");
        return;
      }
      console.log("[LBannerAnalytics] recordBannerShown called for banner:", bannerId);
      let cookieData = this.read();

      // Clean up any old segment-based data before writing
      const cleanedData = {};
      const segmentPattern = /^content_segment_/;
      for (const [key, value] of Object.entries(cookieData)) {
        if (!segmentPattern.test(key)) {
          cleanedData[key] = value;
        }
      }
      cookieData = cleanedData;

      const timestamp = Date.now();

      // Generate unique interaction ID for this banner display (short format)
      // Format: {bannerId}_{timestamp_base36}_{random}
      const timestampShort = timestamp.toString(36); // Convert to base36 for shorter format
      const randomShort = Math.random().toString(36).substring(2, 6); // 4 char random
      const bannerIdShort = bannerId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10); // Clean and limit banner ID
      const interactionId = `${bannerIdShort}_${timestampShort}_${randomShort}`;

      const existing = cookieData[bannerId] || { state: "notclicked" };
      existing.lastShown = timestamp;
      existing.interactionId = interactionId;
      // Don't reset state if already clicked
      if (!existing.state) {
        existing.state = "notclicked";
      }

      cookieData[bannerId] = existing;
      console.log("[LBannerAnalytics] Writing cookie for banner:", bannerId, "interactionId:", interactionId);
      this.write(cookieData);

      // Trigger status panel update after writing cookie
      if (typeof window.updateCookieStatusDisplay === 'function') {
        setTimeout(() => {
          window.updateCookieStatusDisplay();
        }, 100);
      }
    },
    /**
     * Legacy method for backward compatibility (now tracks banner instead of elements)
     * This is a no-op - use recordBannerShown instead
     * @param {Array} elements - Deprecated parameter (ignored)
     */
    recordShown(elements = []) {
      // This is now a no-op - we track banners, not elements
      console.log("[LBannerAnalytics] recordShown (legacy) called - use recordBannerShown instead");
    },
    /**
     * Mark a banner as interacted (clicked) by the user
     * Updates cookie state from "notclicked" to "clicked" and records interaction timestamp
     * @param {string} bannerId - Unique identifier for the banner
     */
    markBannerInteracted(bannerId) {
      if (!state.enableCookieTracking) {
        console.log("[LBannerAnalytics] Cookie tracking disabled - skipping markBannerInteracted");
        return;
      }
      if (!bannerId) {
        console.warn("[LBannerAnalytics] markBannerInteracted called without bannerId");
        return;
      }
      console.log("[LBannerAnalytics] markBannerInteracted called for banner:", bannerId);
      const cookieData = this.read();
      const existing = cookieData[bannerId] || { state: "notclicked" };
      const wasInteracted = existing.state === "clicked";
      const timestamp = Date.now();

      existing.lastShown = timestamp;
      if (!wasInteracted) {
        existing.state = "clicked";
        existing.interactedAt = timestamp;
        console.log("[LBannerAnalytics] Banner state changed from 'notclicked' to 'clicked'");
      } else {
        console.log("[LBannerAnalytics] Banner already interacted, updating lastShown timestamp");
      }

      cookieData[bannerId] = existing;
      console.log("[LBannerAnalytics] Updated cookie data for banner:", bannerId, cookieData[bannerId]);
      this.write(cookieData);

      // Trigger status panel update after writing cookie
      if (typeof window.updateCookieStatusDisplay === 'function') {
        setTimeout(() => {
          window.updateCookieStatusDisplay();
        }, 100);
      }
    },
    /**
     * Legacy method for backward compatibility - marks current banner as interacted
     * Always marks the current banner as interacted, regardless of which element was clicked
     * @param {string} elementId - Deprecated element ID (ignored, uses current banner instead)
     */
    markClicked(elementId) {
      // Always mark the current banner as interacted, regardless of which element was clicked
      if (state.currentBanner?.meta?.id) {
        console.log("[LBannerAnalytics] markClicked called for element:", elementId, "marking banner:", state.currentBanner.meta.id);
        this.markBannerInteracted(state.currentBanner.meta.id);
      } else {
        console.warn("[LBannerAnalytics] markClicked (legacy) called but no current banner found");
      }
    },
  };

  /**
   * Valid banner position values
   */
  const POSITIONS = ["left", "right", "top", "bottom"];

  /**
   * Assertion helper - throws error if condition is false
   * @param {boolean} condition - Condition to check
   * @param {string} message - Error message to throw if condition fails
   * @throws {Error} If condition is false
   */
  function assert(condition, message) {
    if (!condition) throw new Error(`[LBannerAnalytics] ${message}`);
  }

  /**
   * Initialize the analytics module with configuration
   * Sets up DOM element references, validates configuration, and initializes cookie status panel
   * @param {Object} options - Initialization options
   * @param {string} options.apiKey - API key for ad server authentication
   * @param {string} options.adEndpoint - URL endpoint for fetching banner ads
   * @param {Object} options.videoRef - Video player reference object
   * @param {string} options.playerShellId - DOM ID of player container element
   * @param {string} options.bannerHostId - DOM ID of banner container element
   * @param {string} options.videoAreaSelector - CSS selector for video area element
   * @param {boolean} [options.enableCookieTracking=true] - Enable/disable cookie tracking
   */
  function init(options) {
    console.log("[LBannerAnalytics] init called with options:", options);
    const config = normalizeOptions(options);
    state.apiKey = config.apiKey;
    state.adEndpoint = config.adEndpoint;
    state.videoRef = config.videoRef;
    state.playerShell = document.getElementById(config.playerShellId);
    state.bannerHost = document.getElementById(config.bannerHostId);
    state.videoAreaSelector = config.videoAreaSelector;
    state.videoArea = document.querySelector(state.videoAreaSelector);
    state.enableCookieTracking = config.enableCookieTracking;

    console.log(`[LBannerAnalytics] Cookie tracking: ${state.enableCookieTracking ? 'ENABLED' : 'DISABLED'}`);

    console.log("[LBannerAnalytics] Elements found:", {
      playerShell: !!state.playerShell,
      bannerHost: !!state.bannerHost,
      videoArea: !!state.videoArea,
    });

    assert(state.playerShell, "playerShellId is invalid");
    assert(state.bannerHost, "bannerHostId is invalid");
    assert(state.videoArea, "videoAreaSelector is invalid");

    // Initialize cookie status panel if enabled
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCookieStatusPanel);
    } else {
      initCookieStatusPanel();
    }

    // Don't auto-fetch banner on init - wait for time triggers
    console.log("[LBannerAnalytics] init complete");
  }

  /**
   * Normalize and validate initialization options
   * Ensures all required options are present and have correct types
   * @param {Object} options - Raw options object
   * @returns {Object} Normalized options object
   * @throws {Error} If required options are missing or invalid
   */
  function normalizeOptions(options) {
    assert(options, "init requires options");
    const {
      apiKey,
      videoRef,
      adEndpoint,
      playerShellId,
      bannerHostId,
      videoAreaSelector,
      enableCookieTracking,
    } = options;
    assert(typeof apiKey === "string", "apiKey is required");
    assert(videoRef && typeof videoRef === "object", "videoRef is required");
    assert(typeof adEndpoint === "string", "adEndpoint is required");
    assert(typeof playerShellId === "string", "playerShellId is required");
    assert(typeof bannerHostId === "string", "bannerHostId is required");
    assert(typeof videoAreaSelector === "string", "videoAreaSelector is required");
    return {
      apiKey,
      videoRef,
      adEndpoint,
      playerShellId,
      bannerHostId,
      videoAreaSelector,
      enableCookieTracking: enableCookieTracking !== undefined ? enableCookieTracking : true,
    };
  }

  /**
   * Fetch banner data from ad server and render it
   * Aborts any in-flight requests before starting new fetch
   * @param {Object} config - Fetch configuration
   * @param {string} config.apiKey - API key for authentication
   * @param {string} config.adEndpoint - Ad server endpoint URL
   * @param {Object} config.videoRef - Video player reference
   */
  async function fetchAndRender(config) {
    cleanupExisting(true); // Immediate cleanup for banner transitions
    state.controller?.abort();
    state.controller = new AbortController();
    try {
      const url = new URL(config.adEndpoint);
      url.searchParams.set("playbackRef", config.videoRef.container_id ?? "");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        credentials: state.enableCookieTracking ? "include" : "omit",
        signal: state.controller.signal,
      });
      assert(response.ok, `Ad server responded with ${response.status}`);
      const payload = await response.json();
      state.currentBanner = payload;
      renderBanner(payload);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("[LBannerAnalytics] failed to fetch ad", error);
      }
    }
  }

  /**
   * Clean up existing banner from DOM and reset video offsets
   * Removes event listeners, banner elements, and CSS variables
   * @param {boolean} [immediate=false] - If true, skip animation and remove immediately
   */
  function cleanupExisting(immediate = false) {
    // Remove resize listeners
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("fullscreenchange", handleResize);
    document.removeEventListener("webkitfullscreenchange", handleResize);
    document.removeEventListener("mozfullscreenchange", handleResize);
    document.removeEventListener("MSFullscreenChange", handleResize);

    // If immediate cleanup (banner transition), skip animation to prevent button overlap
    if (immediate) {
      state.bannerHost?.replaceChildren();
      state.bannerHost?.classList.remove("lb-animating-out", "lb-animating-in", "lb-visible");
    } else {
      // Add animation out class before removing
      if (state.bannerHost && state.bannerHost.children.length > 0) {
        state.bannerHost.classList.remove("lb-visible");
        state.bannerHost.classList.add("lb-animating-out");

        // Wait for animation to complete before cleaning up
        setTimeout(() => {
          state.bannerHost?.replaceChildren();
          state.bannerHost?.classList.remove("lb-animating-out");
          state.bannerHost?.classList.remove("lb-animating-in");
        }, 1000); // 1s animation out
      } else {
        state.bannerHost?.replaceChildren();
        state.bannerHost?.classList.remove("lb-animating-out", "lb-animating-in", "lb-visible");
      }
    }

    // Reset video offsets
    state.playerShell?.style.setProperty("--lb-left-width", "0px");
    state.playerShell?.style.setProperty("--lb-right-width", "0px");
    state.playerShell?.style.setProperty("--lb-top-height", "0px");
    state.playerShell?.style.setProperty("--lb-bottom-height", "0px");

    if (state.closeButton) {
      state.closeButton.remove();
      state.closeButton = null;
    }
  }

  /**
   * Handle window resize and fullscreen change events
   * Recalculates banner positions and video offsets when viewport changes
   */
  function handleResize() {
    if (state.currentBanner) {
      // Small delay to ensure fullscreen transition completes
      setTimeout(() => {
        const { configuration } = state.currentBanner;
        if (configuration?.layout) {
          // Recalculate video offsets first
          applyVideoOffsets(configuration.layout);
          // Then reposition segments (this ensures offsets are available for positioning)
          const segments = document.querySelectorAll(".lb-segment");
          segments.forEach((node) => {
            const segmentId = node.dataset.segmentId;
            const segment = configuration.layout.segments.find((s) => s.id === segmentId);
            if (segment) {
              positionSegment(node, segment);
            }
          });
        }
      }, 50); // Small delay to ensure fullscreen dimensions are stable
    }
  }

  /**
   * Render a banner from payload data
   * Creates DOM elements, positions segments, applies video offsets, and tracks impression
   * @param {Object} payload - Banner payload from ad server
   * @param {Object} payload.configuration - Banner configuration (layout, content, behavior)
   * @param {Object} payload.meta - Banner metadata (id, title, type)
   */
  function renderBanner(payload) {
    console.log("[LBannerAnalytics] renderBanner called", payload);

    // Clean up existing banner immediately before rendering new one
    cleanupExisting(true);

    const { configuration, meta } = payload ?? {};
    assert(configuration, "Payload missing configuration");
    const { layout, content, behavior } = configuration;
    assert(layout, "Missing layout");
    assert(content, "Missing content");

    // Record banner shown in cookie if tracking is enabled
    const bannerId = meta?.id;
    if (bannerId) {
      console.log("[LBannerAnalytics] Recording banner shown:", bannerId);
      ElementCookieStore.recordBannerShown(bannerId);
      console.log("[LBannerAnalytics] Banner recorded, triggering status update");
      // Force immediate status update
      if (typeof window.updateCookieStatusDisplay === 'function') {
        setTimeout(() => {
          window.updateCookieStatusDisplay();
        }, 200);
      }
    } else {
      console.warn("[LBannerAnalytics] No banner ID found in meta:", meta);
    }

    console.log("[LBannerAnalytics] Rendering:", {
      segments: layout.segments.length,
      elements: content.elements.length,
    });

    // Track impression for this banner
    if (window.LBannerTracking && meta?.id) {
      window.LBannerTracking.trackImpression(meta.id, {
        title: meta.title,
        type: meta.type,
        position: layout.position,
        segmentCount: layout.segments.length,
        elementCount: content.elements.length,
      });
    }

    // Apply video offsets first (before rendering segments)
    applyVideoOffsets(layout);

    const segmentsById = layout.segments.reduce((acc, segment) => {
      acc[segment.id] = segment;
      return acc;
    }, {});

    // Add animation classes for squeeze-back effect
    state.bannerHost.classList.add("lb-animating-in");
    setTimeout(() => {
      state.bannerHost.classList.remove("lb-animating-in");
      state.bannerHost.classList.add("lb-visible");
    }, 1000); // 1s animation in

    let segmentsRendered = 0;
    (content.elements ?? []).forEach((element) => {
      const segment = segmentsById[element.segmentId];
      if (!segment) {
        console.warn(`[LBannerAnalytics] No segment found for element ${element.id}`);
        return;
      }
      const node = buildSegmentNode(segment, element);
      state.bannerHost.appendChild(node);
      segmentsRendered++;
    });

    console.log(`[LBannerAnalytics] Segments rendered: ${segmentsRendered}`);

    if (behavior?.display?.showCloseButton) {
      attachCloseButton();
    }

    // Add resize listener to recalculate positions on fullscreen/resize
    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleResize);
    document.addEventListener("webkitfullscreenchange", handleResize);
    document.addEventListener("mozfullscreenchange", handleResize);
    document.addEventListener("MSFullscreenChange", handleResize);

    // Update status panel after banner is rendered and cookies are written
    if (typeof window.updateCookieStatusDisplay === 'function') {
      setTimeout(() => {
        window.updateCookieStatusDisplay();
      }, 500);
    }
  }

  /**
   * Calculate and apply CSS variables for video player offsets
   * Shrinks video area to make room for banners on left/right/top/bottom
   * Supports both VSAT absolute positioning and legacy relative positioning
   * @param {Object} layout - Layout configuration with segments array
   */
  function applyVideoOffsets(layout) {
    const offsets = { left: 0, right: 0, top: 0, bottom: 0 };
    const playerShellRect = state.playerShell.getBoundingClientRect();
    const shellWidth = playerShellRect.width;
    const shellHeight = playerShellRect.height;

    layout.segments.forEach((segment) => {
      // Handle VSAT absolute positioning - calculate which side banner occupies
      if (segment.x !== undefined && segment.y !== undefined) {
        const x = segment.x;
        const y = segment.y;
        const width = segment.width;
        const height = segment.height;
        const segmentRight = x + width;
        const segmentBottom = y + height;

        // Determine segment type and position
        // Prioritize explicit type from parser over dimension ratio
        const isVertical = segment.type === "vertical" || (segment.type !== "horizontal" && height > width);
        const isHorizontal = segment.type === "horizontal" || (segment.type !== "vertical" && width > height);
        const positionHint = segment.position;
        const isLeftEdge = positionHint === "left" || x === 0;
        const isRightEdge =
          positionHint === "right" ||
          (!isLeftEdge && x + width >= shellWidth - 1);
        // For horizontal segments, determine if it's bottom based on hint or Y position
        const isBottomSegment =
          positionHint === "bottom" || (isHorizontal && y > shellHeight * 0.5);

        if (isVertical) {
          // Vertical segment (left or right side)
          if (isLeftEdge) {
            // Left side - video should shrink from left
            // For left-edge segments, use width directly (like relative positioning)
            offsets.left = Math.max(offsets.left, width);
            console.log(`[LBannerAnalytics] Vertical left segment: width=${width}px, offset.left=${offsets.left}px`);
          } else {
            // Right side - video should shrink from right
            // Use width directly for consistent behavior
            offsets.right = Math.max(offsets.right, width);
            console.log(`[LBannerAnalytics] Vertical right segment: width=${width}px, offset.right=${offsets.right}px`);
          }
        }

        if (isHorizontal) {
          // Horizontal segment (top or bottom side)
          if (isBottomSegment) {
            // Bottom side - video should shrink from bottom
            // Always use height directly for bottom segments (like relative positioning)
            offsets.bottom = Math.max(offsets.bottom, height);
          } else {
            // Top side - video should shrink from top
            offsets.top = Math.max(offsets.top, segmentBottom);
          }
        }
        return;
      }

      // Legacy relative positioning
      if (!POSITIONS.includes(segment.position)) return;
      const isVertical = segment.position === "top" || segment.position === "bottom";
      const dimension = isVertical ? segment.height : segment.width;
      offsets[segment.position] = Math.max(offsets[segment.position], dimension);
    });

    const varMap = {
      left: "--lb-left-width",
      right: "--lb-right-width",
      top: "--lb-top-height",
      bottom: "--lb-bottom-height",
    };

    Object.entries(offsets).forEach(([position, value]) => {
      state.playerShell.style.setProperty(varMap[position], `${value}px`);
      if (value > 0) {
        console.log(`[LBannerAnalytics] Applied video offset: ${varMap[position]} = ${value}px`);
      }
    });

    // Calculate player shell width adjustment based on vertical banner width
    // When vertical banner is wider than default (200px), increase player shell width
    // This ensures the video area remains appropriately sized
    const defaultVerticalWidth = 200;
    const leftOffset = offsets.left;
    const rightOffset = offsets.right;
    const shellWidthAdjust = Math.max(0, (leftOffset - defaultVerticalWidth) + (rightOffset - defaultVerticalWidth));
    
    state.playerShell.style.setProperty("--lb-shell-width-adjust", `${shellWidthAdjust}px`);
    if (shellWidthAdjust > 0) {
      console.log(`[LBannerAnalytics] Adjusted player shell width by ${shellWidthAdjust}px to accommodate larger banner`);
    }
  }

  /**
   * Build DOM node for a banner segment
   * Creates section element with positioning, media, buttons, and poll widgets
   * @param {Object} segment - Segment configuration (position, size, type)
   * @param {Object} element - Element configuration (type, media, buttons, poll)
   * @returns {HTMLElement} Created segment DOM node
   */
  function buildSegmentNode(segment, element) {
    const root = document.createElement("section");
    root.className = "lb-segment";
    root.dataset.segmentId = segment.id;
    root.style.backgroundColor = element.backgroundColor ?? "#111";
    root.style.zIndex = "100"; // Ensure segment is above video
    root.style.pointerEvents = "auto"; // Explicitly enable pointer events
    // Prevent all events from propagating to video
    root.addEventListener("click", (e) => e.stopPropagation());
    root.addEventListener("mousedown", (e) => e.stopPropagation());
    root.addEventListener("mouseup", (e) => e.stopPropagation());
    root.addEventListener("touchstart", (e) => e.stopPropagation());
    root.addEventListener("touchend", (e) => e.stopPropagation());

    positionSegment(root, segment);

    if (element.type === "image" || element.type === "video") {
      const media = buildMedia(element);
      if (media) {
        root.appendChild(media);
        console.log(`[LBannerAnalytics] Added media to segment ${segment.id}:`, element.media?.url);
      } else {
        console.warn(`[LBannerAnalytics] No media created for element:`, element);
      }
    } else {
      console.log(`[LBannerAnalytics] Element type ${element.type} for segment ${segment.id}, no media`);
    }

    if (element.type === "poll" && element.poll) {
      root.appendChild(buildPoll(element));
    }

    // Support VSAT buttons array format
    if (Array.isArray(element.buttons) && element.buttons.length > 0) {
      element.buttons.forEach((buttonCfg) => {
        const button = buildVSATButton(buttonCfg, segment, element.id);
        root.appendChild(button);
      });
    } else if (element.button?.show) {
      // Legacy single button format
      root.appendChild(buildButton(element.button, element.id));
    }

    return root;
  }

  /**
   * Get CSS variable value as integer from player shell
   * @param {string} varName - CSS variable name (e.g., "--lb-left-width")
   * @returns {number} Parsed integer value, or 0 if not found
   */
  function getCSSVar(varName) {
    return parseInt(
      getComputedStyle(state.playerShell).getPropertyValue(varName),
      10
    );
  }

  /**
   * Position a segment DOM node based on segment configuration
   * Supports VSAT absolute positioning (x, y coordinates) and legacy relative positioning
   * Handles edge cases for fullscreen compatibility
   * @param {HTMLElement} node - Segment DOM node to position
   * @param {Object} segment - Segment configuration with position/size data
   */
  function positionSegment(node, segment) {
    // Support VSAT absolute positioning (X, Y coordinates)
    if (segment.x !== undefined && segment.y !== undefined) {
      const shellRect = state.playerShell.getBoundingClientRect();
      const shellWidth = shellRect.width;
      const shellHeight = shellRect.height;

      // For left-bottom L-banner: use relative positioning like right-bottom for fullscreen compatibility
      // Convert absolute positions to relative when segments are at edges
      const positionHint = segment.position;
      const isLeftEdge = segment.x === 0 || positionHint === "left";
      const isRightEdge =
        positionHint === "right" ||
        (!isLeftEdge && segment.x + segment.width >= shellWidth - 1);
      const isVertical = segment.type === "vertical" || segment.height > segment.width;
      const isHorizontal = segment.type === "horizontal" || segment.width > segment.height;

      // Determine if segment is at bottom based on original Y position
      // For horizontal segments, if Y > 400px (reasonable threshold), treat as bottom segment
      // This ensures it stays at bottom even in fullscreen
      const originalY = segment.y;
      const isBottomSegment =
        positionHint === "bottom" || (isHorizontal && originalY > 400);

      node.style.position = "absolute";

      // Vertical segment on left edge - use relative positioning
      if (isVertical && isLeftEdge) {
        node.style.left = "0px";
        node.style.top = "0px";
        node.style.width = `${segment.width}px`;
        node.style.height = "100%"; // Full height
      }
      // Vertical segment on right edge - use relative positioning
      else if (isVertical && isRightEdge) {
        node.style.right = "0px";
        node.style.top = "0px";
        node.style.width = `${segment.width}px`;
        node.style.height = "100%"; // Full height
      }
      // Horizontal segment at bottom - always use bottom positioning for fullscreen compatibility
      else if (isHorizontal && isBottomSegment) {
        if (isLeftEdge) {
          // Left-bottom: start from left, extend full width, always at bottom
          node.style.left = "0px";
          node.style.bottom = "0px";
          node.style.width = "100%"; // Full width
          node.style.height = `${segment.height}px`;
          node.style.top = "auto"; // Override any top positioning
        } else {
          // Right-bottom: start from X position, extend to right, always at bottom
          // Use fixed reference width (1280px from CSS) for consistent percentage calculation
          // This ensures proper scaling in both normal and fullscreen modes
          const referenceWidth = 1280; // Default shell width from CSS (min(90vw, 1280px))
          const xPercent = Math.min(100, Math.max(0, (segment.x / referenceWidth) * 100));
          const leftOffset = getCSSVar("--lb-left-width");
          
          // If horizontal starts at or after the vertical segment edge, align to video offset
          // This ensures the horizontal segment aligns with the video area in fullscreen
          if (leftOffset > 0 && segment.x >= leftOffset - 10) { // 10px tolerance for rounding
            // Start at video offset to maintain perfect alignment with video area
            node.style.left = `var(--lb-left-width)`;
            node.style.bottom = "0px";
            node.style.width = `calc(100% - var(--lb-left-width) - var(--lb-right-width))`;
            node.style.height = `${segment.height}px`;
          } else {
            // Use percentage-based positioning for proper fullscreen scaling
            node.style.left = `${xPercent}%`;
            node.style.bottom = "0px";
            node.style.width = `calc(100% - ${xPercent}% - var(--lb-right-width))`;
            node.style.height = `${segment.height}px`;
          }
          node.style.top = "auto"; // Override any top positioning
        }
      }
      // Fallback to absolute positioning for other cases
      else {
        node.style.left = `${segment.x}px`;
        node.style.top = `${segment.y}px`;
        node.style.width = `${segment.width}px`;
        node.style.height = `${segment.height}px`;
      }

      return;
    }

    // Fallback to relative positioning
    switch (segment.position) {
      case "left":
        node.style.left = "0px";
        node.style.top = "0px";
        node.style.width = `${segment.width}px`;
        node.style.height = "100%";
        break;
      case "right":
        node.style.right = "0px";
        node.style.top = "0px";
        node.style.width = `${segment.width}px`;
        node.style.height = "100%";
        break;
      case "top":
        node.style.top = "0px";
        node.style.left = "0px";
        node.style.width = "100%";
        node.style.height = `${segment.height}px`;
        break;
      case "bottom":
        node.style.bottom = "0px";
        node.style.left = "0px";
        node.style.width = "100%";
        node.style.height = `${segment.height}px`;
        break;
    }
  }

  /**
   * Build media element (image or video) for banner segment
   * @param {Object} element - Element configuration
   * @param {string} element.type - "image" or "video"
   * @param {Object} element.media - Media configuration with URL
   * @returns {HTMLElement|null} Image or video element, or null if invalid
   */
  function buildMedia(element) {
    if (element.type === "image") {
      const img = document.createElement("img");
      img.className = "lb-media";
      const imageUrl = element.media?.url ?? "";
      img.src = imageUrl;
      img.alt = element.alt ?? "Sponsored content";

      // Log for debugging
      if (!imageUrl) {
        console.warn("[LBannerAnalytics] Empty image URL for element:", element.id);
      } else {
        console.log("[LBannerAnalytics] Loading image:", imageUrl);
      }

      // Handle image load errors
      img.onerror = () => {
        console.error("[LBannerAnalytics] Failed to load image:", imageUrl);
        // Set a fallback background color if image fails
        img.style.display = "none";
      };

      img.onload = () => {
        console.log("[LBannerAnalytics] Image loaded successfully:", imageUrl);
      };

      return img;
    }

    const video = document.createElement("video");
    video.className = "lb-media";
    video.src = element.media?.url ?? "";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    return video;
  }

  /**
   * Build poll widget DOM element
   * Creates interactive poll with question and options, or question-only display
   * @param {Object} element - Element configuration with poll data
   * @param {Object} element.poll - Poll configuration (heading, question, tagline, options)
   * @returns {HTMLElement} Poll container DOM element
   */
  function buildPoll(element) {
    const poll = element.poll;
    const hasOptions = Array.isArray(poll.options) && poll.options.length > 0;
    const container = document.createElement("div");
    container.className = `lb-poll ${hasOptions ? "lb-poll--options" : "lb-poll--question"
      }`;
    // Prevent clicks from propagating to video
    container.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    container.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    container.addEventListener("mouseup", (e) => {
      e.stopPropagation();
    });

    if (hasOptions) {
      if (poll.heading) {
        const heading = document.createElement("p");
        heading.className = "lb-poll__eyebrow";
        heading.textContent = poll.heading;
        container.appendChild(heading);
      }

      if (poll.question) {
        const question = document.createElement("h3");
        question.className = "lb-poll__question";
        question.textContent = poll.question;
        container.appendChild(question);
      }

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "lb-poll__options";

      poll.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lb-poll__option";
        button.textContent = option;
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          button.classList.add("lb-poll__option--selected");
          button.textContent = "Thanks for voting!";
          ElementCookieStore.markClicked(element.id);
        });
        optionsWrap.appendChild(button);
      });

      container.appendChild(optionsWrap);
      return container;
    }

    const eyebrow = document.createElement("p");
    eyebrow.className = "lb-poll__eyebrow";
    eyebrow.textContent = poll.tagline ?? "Question";
    container.appendChild(eyebrow);

    const questionBlock = document.createElement("h3");
    questionBlock.className = "lb-poll__question";
    questionBlock.textContent = poll.question ?? "";
    container.appendChild(questionBlock);

    return container;
  }

  /**
   * Build legacy single button element
   * Creates button with click handler for redirect actions
   * @param {Object} cfg - Button configuration
   * @param {string} cfg.text - Button label text
   * @param {string} cfg.color - Button background color
   * @param {string} cfg.action - Action type ("redirect")
   * @param {string} cfg.url - Redirect URL
   * @param {string} elementId - Element ID for tracking
   * @returns {HTMLElement} Button DOM element
   */
  function buildButton(cfg, elementId) {
    const button = document.createElement("button");
    button.className = "lb-button";
    button.textContent = cfg.text ?? "Learn more";
    button.style.background = cfg.color ?? "#f97316";
    button.style.color = "#0f172a";
    button.type = "button"; // Ensure it's a button, not submit
    button.style.cursor = "pointer"; // Ensure cursor shows it's clickable
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[LBannerAnalytics] Legacy button clicked:", {
        elementId: elementId,
        text: cfg.text
      });
      if (elementId) {
        console.log("[LBannerAnalytics] Marking element as clicked:", elementId);
        ElementCookieStore.markClicked(elementId);
      }
      if (cfg.action === "redirect" && cfg.url) {
        window.open(cfg.url, "_blank", "noopener");
      }
    };
    return button;
  }

  /**
   * Build VSAT-format button element with advanced positioning and tracking
   * Supports absolute positioning, custom actions, deep links, and tracking events
   * @param {Object} cfg - Button configuration
   * @param {string} cfg.id - Button ID
   * @param {string} cfg.label - Button label text
   * @param {string} cfg.role - Button role ("primary", "secondary", etc.)
   * @param {boolean} cfg.defaultFocus - Whether to auto-focus button
   * @param {Object} cfg.position - Absolute position (x, y, width, height)
   * @param {Object} cfg.action - Action configuration (type, clickThrough, deepLink, customAction)
   * @param {Object} cfg.tracking - Tracking URLs (click, viewable)
   * @param {Object} segment - Parent segment configuration
   * @param {string} elementId - Element ID for cookie tracking
   * @returns {HTMLElement} Button DOM element
   */
  function buildVSATButton(cfg, segment, elementId) {
    const button = document.createElement("button");
    button.id = cfg.id || `btn_${segment.id}`;
    button.className = `lb-button lb-button--vsat lb-button--${cfg.role || "primary"}`;
    button.textContent = cfg.label || "Learn More";
    button.type = "button"; // Ensure it's a button, not submit
    // Apply absolute positioning relative to the segment if provided
    if (cfg.position) {
      const segmentX = segment.x ?? 0;
      const segmentY = segment.y ?? 0;
      const relativeX = cfg.position.x - segmentX;
      const relativeY = cfg.position.y - segmentY;

      button.style.position = "absolute";
      button.style.left = `${relativeX}px`;
      button.style.top = `${relativeY}px`;
      button.style.width = `${cfg.position.width}px`;
      button.style.height = `${cfg.position.height}px`;
    } else {
      // Fallback to relative positioning
      button.className += " lb-button--relative";
    }

    // Set focus if defaultFocus is true
    if (cfg.defaultFocus) {
      setTimeout(() => button.focus(), 100);
    }

    // Handle click action
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (elementId) {
        ElementCookieStore.markClicked(elementId);
        // Trigger cookie status display update if function exists
        if (typeof window.updateCookieStatusDisplay === 'function') {
          setTimeout(() => {
            window.updateCookieStatusDisplay();
          }, 100);
        }
      }

      // Track conversion - match corner banner approach
      const bannerId = state.currentBanner?.meta?.id;
      if (window.LBannerTracking && bannerId) {
        const actionDetail =
          cfg.action?.clickThrough ||
          cfg.action?.deepLink ||
          cfg.action?.customAction ||
          cfg.action?.type;

        window.LBannerTracking.trackConversion(bannerId, cfg.id, {
          label: cfg.label,
          action: actionDetail,
          segmentId: segment.id,
        });
      }

      // Fire click tracking
      if (cfg.tracking?.click) {
        fireTracking(cfg.tracking.click);
      }

      // Handle action based on type - match corner banner logic
      const actionType = cfg.action?.type || "clickthrough";
      if (actionType === "custom" && cfg.action?.customAction) {
        const customEvent = new CustomEvent("LBannerCustomAction", {
          detail: {
            action: cfg.action.customAction,
            buttonId: cfg.id,
            label: cfg.label,
            elementId: elementId,
            segmentId: segment.id,
          },
        });
        window.dispatchEvent(customEvent);
        console.log("[LBannerAnalytics] Custom action triggered:", cfg.action.customAction);
        return;
      }

      const deepLink = cfg.action?.deepLink;
      const clickThrough = cfg.action?.clickThrough;

      if (deepLink) {
        try {
          window.location.href = deepLink;
          return;
        } catch (err) {
          console.warn("[LBannerAnalytics] Deep link failed, falling back to clickthrough");
        }
      }

      if (clickThrough) {
        window.open(clickThrough, "_blank", "noopener");
      }
    };

    // Fire viewable tracking when button becomes visible
    if (cfg.tracking?.viewable) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              fireTracking(cfg.tracking.viewable);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.5 }
      );
      observer.observe(button);
    }

    return button;
  }

  /**
   * Fire tracking pixel requests (impression/click tracking)
   * Uses Image pixel method for maximum reliability
   * @param {string|Array<string>} urls - Tracking URL(s) to fire
   */
  function fireTracking(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    urls.forEach((url) => {
      if (url && typeof url === "string") {
        try {
          // Use Image pixel for tracking (most reliable)
          const img = new Image();
          img.src = url;
          console.log("[LBannerAnalytics] Tracking fired:", url);
        } catch (err) {
          console.error("[LBannerAnalytics] Tracking error:", err);
        }
      }
    });
  }

  /**
   * Attach close button to player shell
   * Creates and positions close button that calls hideBanner on click
   */
  function attachCloseButton() {
    const button = document.createElement("button");
    button.className = "lb-close";
    button.setAttribute("aria-label", "Close banner");
    button.innerText = "×";
    button.addEventListener("click", hideBanner);
    state.closeButton = button;
    state.playerShell.appendChild(button);
  }

  /**
   * Hide currently displayed banner with animation
   * Calls cleanupExisting with animation enabled
   */
  function hideBanner() {
    cleanupExisting(false); // Use animation when manually hiding
  }

  /**
   * Show currently stored banner
   * Re-renders the banner if banner data exists in state
   */
  function showBanner() {
    console.log("[LBannerAnalytics] showBanner called", {
      hasBanner: !!state.currentBanner,
      hasHost: !!state.bannerHost,
      hasPlayerShell: !!state.playerShell,
    });
    if (state.currentBanner) {
      renderBanner(state.currentBanner);
    } else {
      console.warn("[LBannerAnalytics] No banner data to show");
    }
  }

  /**
   * Destroy analytics module and clean up resources
   * Hides banner, clears state, and aborts any pending requests
   */
  function destroy() {
    hideBanner();
    state.currentBanner = null;
    state.controller?.abort();
    state.controller = null;
  }

  /**
   * Check and log cookie tracking status for debugging
   * Tests cookie read/write capability and displays current cookie data
   * @returns {Object} Current cookie data object
   */
  function checkCookieStatus() {
    console.log("=== L-Banner Cookie Status ===");
    console.log("Cookie tracking enabled:", state.enableCookieTracking);

    if (!state.enableCookieTracking) {
      console.log("Cookie tracking is DISABLED");
      console.log("=============================");
      return {};
    }

    console.log("All cookies:", document.cookie || "(empty)");

    const cookieData = ElementCookieStore.read();
    console.log("Parsed cookie data:", cookieData);
    console.log("Element count:", Object.keys(cookieData).length);

    // Test cookie write capability
    try {
      const testCookie = "lbanner_test=" + Date.now() + "; path=/; max-age=60";
      document.cookie = testCookie;
      const canWrite = document.cookie.includes("lbanner_test");
      console.log("Cookie write test:", canWrite ? "✓ SUCCESS" : "✗ FAILED");
      if (canWrite) {
        // Clean up test cookie
        document.cookie = "lbanner_test=; path=/; max-age=0";
      }
    } catch (error) {
      console.error("Cookie write test error:", error);
    }

    console.log("=============================");
    return cookieData;
  }

  /**
   * Update cookie status display panel UI
   * Updates status indicator, banner count, and cookie data display
   * Only updates if status panel exists and is enabled via config
   */
  function updateCookieStatusDisplay() {
    console.log("[LBannerAnalytics] updateCookieStatusDisplay called");

    // Check if status panel exists and analytics status panel is enabled
    const statusEl = document.getElementById("cookie-enabled-status");
    const countEl = document.getElementById("cookie-element-count");
    const dataEl = document.getElementById("cookie-data-display");

    if (!statusEl || !countEl || !dataEl) {
      console.log("[LBannerAnalytics] Status panel elements not found", {
        statusEl: !!statusEl,
        countEl: !!countEl,
        dataEl: !!dataEl
      });
      return; // Status panel not present, silently return
    }

    // Check if analytics status panel is enabled via config
    const analyticsConfig = window.LBannerAnalyticsConfig || {};
    if (analyticsConfig.showStatusPanel === false) {
      console.log("[LBannerAnalytics] Status panel disabled via config");
      // Hide the panel element if it exists
      const panelEl = document.getElementById("cookie-status-panel");
      if (panelEl) {
        panelEl.style.display = "none";
      }
      return; // Status panel disabled
    }

    // Check if analytics is enabled (might be disabled via ENABLE_ANALYTICS)
    if (!ANALYTICS_ENABLED) {
      console.log("[LBannerAnalytics] Analytics disabled");
      statusEl.textContent = "DISABLED";
      statusEl.style.color = "#F44336";
      countEl.textContent = "N/A";
      dataEl.textContent = "Analytics is disabled";
      dataEl.style.color = "#E0E0E0";
      return;
    }

    // Check cookie tracking state (default to true if not initialized yet)
    const cookieTrackingEnabled = state.enableCookieTracking !== false;
    console.log("[LBannerAnalytics] Cookie tracking enabled:", cookieTrackingEnabled, "state:", state.enableCookieTracking);

    if (cookieTrackingEnabled) {
      statusEl.textContent = "ENABLED";
      statusEl.style.color = "#4CAF50";

      // Read cookie data directly (more reliable than checkCookieStatus)
      let cookieData = {};
      try {
        cookieData = ElementCookieStore.read();
        console.log("[LBannerAnalytics] Cookie data read:", cookieData);
      } catch (error) {
        console.warn("[LBannerAnalytics] Error reading cookie data:", error);
        cookieData = {};
      }

      const bannerIds = Object.keys(cookieData);
      countEl.textContent = bannerIds.length;
      console.log("[LBannerAnalytics] Banners tracked:", bannerIds.length, bannerIds);

      if (bannerIds.length > 0) {
        const formatted = bannerIds
          .map((id) => {
            const banner = cookieData[id];
            const lastShown = banner.lastShown
              ? new Date(banner.lastShown).toLocaleString()
              : "N/A";
            const interactedAt = banner.interactedAt
              ? `interactedAt: ${new Date(banner.interactedAt).toLocaleString()}`
              : "";
            const interactionId = banner.interactionId
              ? `interactionId: "${banner.interactionId}"`
              : "";
            return `  "${id}": {
    state: "${banner.state || "notclicked"}",
    lastShown: ${lastShown}${interactedAt ? ",\n    " + interactedAt : ""}${interactionId ? ",\n    " + interactionId : ""}
  }`;
          })
          .join(",\n");
        dataEl.textContent = `{\n${formatted}\n}`;
        dataEl.style.color = "#E0E0E0";
      } else {
        dataEl.textContent = "{}";
        dataEl.style.color = "#E0E0E0";
      }
    } else {
      statusEl.textContent = "DISABLED";
      statusEl.style.color = "#F44336";
      countEl.textContent = "N/A";
      dataEl.textContent = "Cookie tracking is disabled";
      dataEl.style.color = "#E0E0E0";
    }
  }

  /**
   * Initialize cookie status display panel
   * Sets up event listeners and polling for status updates
   * Only initializes if panel exists in DOM and is enabled via config
   */
  function initCookieStatusPanel() {
    const analyticsConfig = window.LBannerAnalyticsConfig || {};
    if (analyticsConfig.showStatusPanel === false) {
      console.log("[LBannerAnalytics] Status panel disabled via config");
      // Hide the panel element if it exists
      const panelEl = document.getElementById("cookie-status-panel");
      if (panelEl) {
        panelEl.style.display = "none";
      }
      return; // Status panel disabled
    }

    // Check if status panel elements exist
    const statusEl = document.getElementById("cookie-enabled-status");
    if (!statusEl) {
      console.log("[LBannerAnalytics] Status panel elements not found in DOM");
      return; // Status panel not in DOM
    }

    console.log("[LBannerAnalytics] Initializing cookie status panel");

    // Initial display update
    updateCookieStatusDisplay();

    // Setup refresh button handler
    const refreshBtn = document.getElementById("refresh-cookie-status");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        console.log("[LBannerAnalytics] Manual refresh triggered");
        updateCookieStatusDisplay();
      });
    }

    // Listen for cookie update events
    window.addEventListener("lbanner-cookie-updated", () => {
      console.log("[LBannerAnalytics] Cookie updated event received");
      updateCookieStatusDisplay();
    });

    // Poll for updates every second
    setInterval(() => {
      updateCookieStatusDisplay();
    }, 1000);

    console.log("[LBannerAnalytics] Cookie status panel initialized");
  }

  // Expose updateCookieStatusDisplay globally for external calls (do this early)
  window.updateCookieStatusDisplay = updateCookieStatusDisplay;

  /**
   * Force immediate status panel update
   * Helper function to ensure status panel updates even if DOM isn't ready
   * Also hides panel if showStatusPanel is false
   */
  function forceStatusUpdate() {
    if (typeof document !== 'undefined') {
      const analyticsConfig = window.LBannerAnalyticsConfig || {};
      if (analyticsConfig.showStatusPanel === false) {
        // Hide the panel element if it exists
        const panelEl = document.getElementById("cookie-status-panel");
        if (panelEl) {
          panelEl.style.display = "none";
        }
        return;
      }
      
      if (document.getElementById('cookie-enabled-status')) {
        console.log("[LBannerAnalytics] Force updating status panel");
        updateCookieStatusDisplay();
      }
    }
  }

  // Try to update status panel immediately if DOM is ready
  // Also check if panel should be hidden
  if (typeof document !== 'undefined') {
    // Try immediately
    forceStatusUpdate();

    // Try after delays to catch different load states
    setTimeout(forceStatusUpdate, 100);
    setTimeout(forceStatusUpdate, 500);
    setTimeout(forceStatusUpdate, 1000);

    // Also listen for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(forceStatusUpdate, 100);
        setTimeout(forceStatusUpdate, 500);
      });
    }
  }

  /**
   * Public API exposed on window.LBannerAnalytics
   * Provides methods for banner management and analytics
   */
  window.LBannerAnalytics = {
    init,
    /**
     * Refresh banner display - re-renders current banner or fetches new one
     */
    refresh: () => {
      if (state.currentBanner) {
        renderBanner(state.currentBanner);
      } else if (state.apiKey) {
        fetchAndRender({
          apiKey: state.apiKey,
          videoRef: state.videoRef,
          adEndpoint: state.adEndpoint,
          playerShellId: state.playerShell?.id,
          bannerHostId: state.bannerHost?.id,
          videoAreaSelector: state.videoAreaSelector,
        });
      }
    },
    /**
     * Set banner data without rendering
     * @param {Object} bannerData - Banner payload object
     */
    setBanner: (bannerData) => {
      state.currentBanner = bannerData;
    },
    show: showBanner,
    hide: hideBanner,
    /**
     * Get currently stored banner data
     * @returns {Object|null} Current banner object or null
     */
    getCurrentBanner: () => state.currentBanner,
    checkCookieStatus,
    updateCookieStatusDisplay,
    destroy,
  };
})();