(function () {
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
  };

  const POSITIONS = ["left", "right", "top", "bottom"];

  function assert(condition, message) {
    if (!condition) throw new Error(`[LBannerAnalytics] ${message}`);
  }

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

    console.log("[LBannerAnalytics] Elements found:", {
      playerShell: !!state.playerShell,
      bannerHost: !!state.bannerHost,
      videoArea: !!state.videoArea,
    });

    assert(state.playerShell, "playerShellId is invalid");
    assert(state.bannerHost, "bannerHostId is invalid");
    assert(state.videoArea, "videoAreaSelector is invalid");
    // Don't auto-fetch banner on init - wait for time triggers
    console.log("[LBannerAnalytics] init complete");
  }

  function normalizeOptions(options) {
    assert(options, "init requires options");
    const {
      apiKey,
      videoRef,
      adEndpoint,
      playerShellId,
      bannerHostId,
      videoAreaSelector,
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
    };
  }

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

  function handleResize() {
    if (state.currentBanner) {
      // Recalculate video offsets and reposition segments
      const { configuration } = state.currentBanner;
      if (configuration?.layout) {
        applyVideoOffsets(configuration.layout);
        // Reposition segments
        const segments = document.querySelectorAll(".lb-segment");
        segments.forEach((node) => {
          const segmentId = node.dataset.segmentId;
          const segment = configuration.layout.segments.find((s) => s.id === segmentId);
          if (segment) {
            positionSegment(node, segment);
          }
        });
      }
    }
  }

  function renderBanner(payload) {
    console.log("[LBannerAnalytics] renderBanner called", payload);
    
    // Clean up existing banner immediately before rendering new one
    cleanupExisting(true);
    
    const { configuration, meta } = payload ?? {};
    assert(configuration, "Payload missing configuration");
    const { layout, content, behavior } = configuration;
    assert(layout, "Missing layout");
    assert(content, "Missing content");

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
  }

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
        const isVertical = segment.type === "vertical" || height > width;
        const isHorizontal = segment.type === "horizontal" || width > height;
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
          } else {
            // Right side - video should shrink from right
            // Use width directly for consistent behavior
            offsets.right = Math.max(offsets.right, width);
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
    });
  }

  function buildSegmentNode(segment, element) {
    const root = document.createElement("section");
    root.className = "lb-segment";
    root.dataset.segmentId = segment.id;
    root.style.backgroundColor = element.backgroundColor ?? "#111";
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
      root.appendChild(buildPoll(element.poll));
    }

    // Support VSAT buttons array format
    if (Array.isArray(element.buttons) && element.buttons.length > 0) {
      element.buttons.forEach((buttonCfg) => {
        const button = buildVSATButton(buttonCfg, segment);
        root.appendChild(button);
      });
    } else if (element.button?.show) {
      // Legacy single button format
      root.appendChild(buildButton(element.button));
    }

    return root;
  }

  function getCSSVar(varName) {
    return parseInt(
      getComputedStyle(state.playerShell).getPropertyValue(varName),
      10
    );
  }

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
          node.style.left = `${segment.x}px`;
          node.style.bottom = "0px";
          node.style.width = `calc(100% - ${segment.x}px)`;
          node.style.height = `${segment.height}px`;
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

  function buildPoll(poll) {
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

  function buildButton(cfg) {
    const button = document.createElement("button");
    button.className = "lb-button";
    button.textContent = cfg.text ?? "Learn more";
    button.style.background = cfg.color ?? "#f97316";
    button.style.color = "#0f172a";
    button.onclick = () => {
      if (cfg.action === "redirect" && cfg.url) {
        window.open(cfg.url, "_blank", "noopener");
      }
    };
    return button;
  }

  function buildVSATButton(cfg, segment) {
    const button = document.createElement("button");
    button.id = cfg.id || `btn_${segment.id}`;
    button.className = `lb-button lb-button--vsat lb-button--${cfg.role || "primary"}`;
    button.textContent = cfg.label || "Learn More";

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

      // Track conversion
      const bannerId = state.currentBanner?.meta?.id;
      if (window.LBannerTracking && bannerId) {
        window.LBannerTracking.trackConversion(bannerId, cfg.id, {
          label: cfg.label,
          action: cfg.action?.clickThrough || cfg.action?.deepLink,
          segmentId: segment.id,
        });
      }

      // Fire click tracking
      if (cfg.tracking?.click) {
        fireTracking(cfg.tracking.click);
      }

      // Handle clickthrough
      if (cfg.action?.clickThrough) {
        window.open(cfg.action.clickThrough, "_blank", "noopener");
      } else if (cfg.action?.deepLink) {
        // Try deep link first, fallback to clickthrough
        try {
          window.location.href = cfg.action.deepLink;
        } catch (err) {
          if (cfg.action.clickThrough) {
            window.open(cfg.action.clickThrough, "_blank", "noopener");
          }
        }
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

  function attachCloseButton() {
    const button = document.createElement("button");
    button.className = "lb-close";
    button.setAttribute("aria-label", "Close banner");
    button.innerText = "×";
    button.addEventListener("click", hideBanner);
    state.closeButton = button;
    state.playerShell.appendChild(button);
  }

  function hideBanner() {
    cleanupExisting(false); // Use animation when manually hiding
  }

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

  function destroy() {
    hideBanner();
    state.currentBanner = null;
    state.controller?.abort();
    state.controller = null;
  }

  window.LBannerAnalytics = {
    init,
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
    setBanner: (bannerData) => {
      state.currentBanner = bannerData;
    },
    show: showBanner,
    hide: hideBanner,
    getCurrentBanner: () => state.currentBanner,
    destroy,
  };
})();

