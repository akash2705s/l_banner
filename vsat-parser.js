/**
 * VSAT XML Parser Module
 * 
 * Parses VSAT (Video Ad Serving Template) XML format with L-Banner Extensions.
 * Extracts banner configurations including:
 * - Layout segments (Horizontal and Vertical)
 * - Content elements (images, polls, buttons)
 * - Display timing (start/end offsets)
 * - Media metadata (video URLs, duration, tracking)
 * - Button configurations with actions and tracking
 * 
 * The parser converts VSAT XML into an internal banner configuration format
 * that can be consumed by the analytics and rendering modules.
 */

const VSATParser = {
    /**
     * Parse VSAT XML string and extract L-Banner configuration
     * 
     * Main entry point for parsing. Finds L-Banner extension in VAST XML,
     * extracts banner configuration, and merges with media details.
     * 
     * @param {string} xmlText - Raw VSAT XML string to parse
     * @returns {Object|null} Parsed L-Banner configuration object or null if not found/invalid
     */
    parseVSAT(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            // Check for parsing errors
            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                console.error("[VSATParser] Invalid XML format:", parserError.textContent);
                return null;
            }

            // Find Extension with type="l-banner"
            const lbannerExt = xmlDoc.querySelector('Extension[type="l-banner"]');
            if (!lbannerExt) {
                console.warn("[VSATParser] No L-Banner extension found");
                return null;
            }

            const lbanner = lbannerExt.querySelector("LBanner");
            if (!lbanner) {
                console.warn("[VSATParser] No LBanner element found");
                return null;
            }

            const banner = this.parseLBanner(lbanner);
            const media = this.parseMediaDetails(xmlDoc);
            if (banner && media) {
                banner.media = media;
            }
            return banner;
        } catch (error) {
            console.error("[VSATParser] Parse error:", error);
            return null;
        }
    },

    /**
     * Parse LBanner element into internal banner format
     * 
     * Extracts horizontal/vertical segments, display timing, and builds
     * complete banner configuration with metadata, layout, content, and behavior.
     * 
     * @param {Element} lbannerElement - LBanner XML element from VSAT
     * @returns {Object} Complete banner configuration object with meta, configuration, timing
     */
    parseLBanner(lbannerElement) {
        const horizontal = lbannerElement.querySelector("Horizontal");
        const vertical = lbannerElement.querySelector("Vertical");
        const display = lbannerElement.querySelector("Display");

        const segments = [];
        const elements = [];

        // Parse Horizontal segment
        if (horizontal) {
            const hSegment = this.parseSegment(horizontal, "horizontal");
            const hElement = this.parseSegmentContent(horizontal, hSegment.id);
            segments.push(hSegment);
            elements.push(hElement);
        }

        // Parse Vertical segment
        if (vertical) {
            const vSegment = this.parseSegment(vertical, "vertical");
            const vElement = this.parseSegmentContent(vertical, vSegment.id);
            segments.push(vSegment);
            elements.push(vElement);
        }

        // Parse Display timing
        let startOffset = null;
        let endOffset = null;
        if (display) {
            const startEl = display.querySelector("StartOffset");
            const endEl = display.querySelector("EndOffset");
            if (startEl) startOffset = this.timeToSeconds(startEl.textContent.trim());
            if (endEl) endOffset = this.timeToSeconds(endEl.textContent.trim());
        }

        return {
            meta: {
                id: `vsat_lbanner_${Date.now()}`,
                type: "l-banner",
                status: "live",
                createdAt: new Date().toISOString(),
            },
            configuration: {
                layout: {
                    position: this.determinePosition(segments),
                    mode: "standard",
                    segments: segments,
                },
                content: {
                    type: "multi-segment",
                    elements: elements,
                },
                behavior: {
                    display: {
                        showCloseButton: true,
                    },
                },
                timing: {
                    startOffset: startOffset,
                    endOffset: endOffset,
                },
            },
        };
    },

    /**
     * Parse segment (Horizontal or Vertical) from XML
     * 
     * Extracts segment dimensions (width, height) and position (x, y).
     * Determines position hint (left/right/top/bottom) based on coordinates.
     * 
     * @param {Element} segmentEl - Horizontal or Vertical XML element
     * @param {string} type - "horizontal" or "vertical"
     * @returns {Object} Segment configuration with id, dimensions, position, coordinates, type
     */
    parseSegment(segmentEl, type) {
        const width = parseInt(segmentEl.querySelector("Width")?.textContent?.trim() || "0", 10);
        const height = parseInt(segmentEl.querySelector("Height")?.textContent?.trim() || "0", 10);
        const x = parseInt(segmentEl.querySelector("X")?.textContent?.trim() || "0", 10);
        const y = parseInt(segmentEl.querySelector("Y")?.textContent?.trim() || "0", 10);

        // Determine position based on X, Y coordinates
        let position;
        if (type === "horizontal") {
            position = y > 500 ? "bottom" : "top";
        } else {
            position = x < 200 ? "left" : "right";
        }

        return {
            id: `segment_${type}`,
            width: width,
            height: height,
            position: position,
            x: x,
            y: y,
            type: type,
        };
    },

    /**
     * Parse segment content (image, buttons, polls, etc.)
     * 
     * Extracts content elements from segment XML including:
     * - Image URLs or poll configurations
     * - Background colors
     * - Button configurations
     * 
     * @param {Element} segmentEl - Segment XML element containing content
     * @param {string} segmentId - Segment ID to associate with content
     * @returns {Object} Element configuration with type, media, buttons, poll, backgroundColor
     */
    parseSegmentContent(segmentEl, segmentId) {
        const imageUrlEl = segmentEl.querySelector("ImageURL");
        const pollEl = segmentEl.querySelector("Poll");
        const backgroundColorEl = segmentEl.querySelector("BackgroundColor");
        const backgroundColor = backgroundColorEl?.textContent?.trim() || "#1a1f2e";

        // Check if this is a poll segment
        if (pollEl) {
            const element = {
                id: `content_${segmentId}`,
                segmentId: segmentId,
                type: "poll",
                backgroundColor: backgroundColor,
                poll: this.parsePoll(pollEl),
                buttons: [],
            };

            // Parse buttons for poll
            const buttons = segmentEl.querySelectorAll("Button");
            buttons.forEach((buttonEl, index) => {
                const button = this.parseButton(buttonEl, segmentId, index);
                element.buttons.push(button);
            });

            return element;
        }

        // Image segment
        let imageUrl = "";
        if (imageUrlEl) {
            // Try textContent first (works for CDATA)
            imageUrl = imageUrlEl.textContent?.trim() || "";
            // If empty, try innerHTML as fallback
            if (!imageUrl && imageUrlEl.innerHTML) {
                imageUrl = imageUrlEl.innerHTML.trim();
            }
        }

        console.log(`[VSATParser] Parsed image URL for ${segmentId}:`, imageUrl);

        const buttons = segmentEl.querySelectorAll("Button");

        const element = {
            id: `content_${segmentId}`,
            segmentId: segmentId,
            type: "image",
            backgroundColor: backgroundColor,
            media: {
                url: imageUrl,
            },
            buttons: [],
        };

        // Parse buttons
        buttons.forEach((buttonEl, index) => {
            const button = this.parseButton(buttonEl, segmentId, index);
            element.buttons.push(button);
        });

        return element;
    },

    /**
     * Parse Poll element from XML
     * 
     * Extracts poll question, heading, tagline, and option choices.
     * 
     * @param {Element} pollEl - Poll XML element
     * @returns {Object} Poll configuration with heading, question, tagline, options array
     */
    parsePoll(pollEl) {
        const heading = pollEl.querySelector("Heading")?.textContent?.trim() || "";
        const question = pollEl.querySelector("Question")?.textContent?.trim() || "";
        const tagline = pollEl.querySelector("Tagline")?.textContent?.trim() || "";
        const options = [];

        // Parse poll options
        pollEl.querySelectorAll("Option").forEach((optionEl) => {
            const optionText = optionEl.textContent?.trim();
            if (optionText) {
                options.push(optionText);
            }
        });

        return {
            heading: heading,
            question: question,
            tagline: tagline,
            options: options,
        };
    },

    /**
     * Parse Button element from XML
     * 
     * Extracts button configuration including:
     * - Label text and role (primary/secondary)
     * - Absolute position (x, y, width, height)
     * - Action configuration (clickThrough, deepLink, customAction)
     * - Tracking events (click, viewable)
     * 
     * @param {Element} buttonEl - Button XML element
     * @param {string} segmentId - Parent segment ID for button ID generation
     * @param {number} index - Button index for ID generation
     * @returns {Object} Button configuration with id, label, role, position, action, tracking
     */
    parseButton(buttonEl, segmentId, index) {
        const buttonId = buttonEl.getAttribute("id") || `btn_${segmentId}_${index}`;
        const role = buttonEl.getAttribute("role") || "primary";
        const defaultFocus = buttonEl.getAttribute("defaultFocus") === "true";

        const labelEl = buttonEl.querySelector("Label");
        const label = labelEl?.textContent?.trim() || "Learn More";

        const positionEl = buttonEl.querySelector("Position");
        const position = {
            x: parseInt(positionEl?.querySelector("X")?.textContent?.trim() || "0", 10),
            y: parseInt(positionEl?.querySelector("Y")?.textContent?.trim() || "0", 10),
            width: parseInt(positionEl?.querySelector("Width")?.textContent?.trim() || "140", 10),
            height: parseInt(positionEl?.querySelector("Height")?.textContent?.trim() || "60", 10),
        };

        // Parse action - match corner banner approach
        const actionEl = buttonEl.querySelector("Action");
        const actionType = actionEl?.getAttribute("type") || "clickthrough";
        const clickThrough = actionEl?.querySelector("ClickThrough")?.textContent?.trim() || "";
        const deepLink = actionEl?.querySelector("DeepLink")?.textContent?.trim() || "";
        const customAction = actionEl?.querySelector("CustomAction")?.textContent?.trim() || "";

        const trackingEventsEl = buttonEl.querySelector("TrackingEvents");
        const tracking = {};
        if (trackingEventsEl) {
            trackingEventsEl.querySelectorAll("Tracking").forEach((trackEl) => {
                const event = trackEl.getAttribute("event");
                const url = trackEl.textContent?.trim();
                if (event && url) {
                    if (!tracking[event]) tracking[event] = [];
                    tracking[event].push(url);
                }
            });
        }

        return {
            id: buttonId,
            label: label,
            role: role,
            defaultFocus: defaultFocus,
            position: position,
            action: {
                type: actionType,
                clickThrough: clickThrough,
                deepLink: deepLink,
                customAction: customAction,
            },
            tracking: tracking,
        };
    },

    /**
     * Determine overall banner position from segments
     * 
     * Analyzes segment positions to determine combined banner position:
     * - left-bottom: left + bottom segments
     * - right-bottom: right + bottom segments
     * - left-top: left + top segments
     * - right-top: right + top segments
     * Defaults to "left-bottom" if no match.
     * 
     * @param {Array} segments - Array of segment objects with position property
     * @returns {string} Combined position string (e.g., "left-bottom", "right-bottom")
     */
    determinePosition(segments) {
        const positions = segments.map((s) => s.position);
        if (positions.includes("left") && positions.includes("bottom")) {
            return "left-bottom";
        }
        if (positions.includes("right") && positions.includes("bottom")) {
            return "right-bottom";
        }
        if (positions.includes("left") && positions.includes("top")) {
            return "left-top";
        }
        if (positions.includes("right") && positions.includes("top")) {
            return "right-top";
        }
        return "left-bottom";
    },

    /**
     * Convert time string to seconds
     * 
     * Supports multiple formats:
     * - HH:MM:SS (hours:minutes:seconds)
     * - MM:SS (minutes:seconds)
     * - Numeric string (parsed as float)
     * 
     * @param {string} timeStr - Time string in HH:MM:SS, MM:SS, or numeric format
     * @returns {number} Time in seconds
     */
    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(":").map(Number);
        if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            // MM:SS
            return parts[0] * 60 + parts[1];
        }
        return parseFloat(timeStr) || 0;
    },

    /**
     * Parse linear media metadata from VAST document
     * 
     * Extracts video media information from Linear element:
     * - Duration
     * - Media file URLs and metadata
     * - Click-through and deep link URLs
     * - Tracking events
     * 
     * @param {Document} xmlDoc - Parsed VAST XML document
     * @returns {Object|null} Media details object with duration, files, clickThrough, deepLink, tracking, or null
     */
    parseMediaDetails(xmlDoc) {
        if (!xmlDoc) return null;
        const linear = xmlDoc.querySelector("Linear");
        if (!linear) return null;

        const durationStr = linear.querySelector("Duration")?.textContent?.trim() || null;
        const duration = durationStr ? this.timeToSeconds(durationStr) : null;
        const files = this.parseMediaFiles(linear.querySelectorAll("MediaFile"));
        if (!files.length) return null;

        const videoClicks = linear.querySelector("VideoClicks");
        const clickThrough = videoClicks?.querySelector("ClickThrough")?.textContent?.trim() || "";
        const deepLink = videoClicks?.querySelector("DeepLink")?.textContent?.trim() || "";

        const tracking = this.parseTrackingEvents(linear.querySelector("TrackingEvents"));

        return {
            duration,
            clickThrough,
            deepLink,
            tracking,
            files,
            primaryUrl: files.find((file) => !!file.url)?.url || null,
        };
    },

    /**
     * Parse MediaFile nodes into simplified objects
     * 
     * Extracts media file information including URL, delivery method, type, dimensions, and bitrate.
     * 
     * @param {NodeList} mediaNodes - NodeList of MediaFile XML elements
     * @returns {Array<Object>} Array of media file objects with url, delivery, type, width, height, bitrate
     */
    parseMediaFiles(mediaNodes) {
        if (!mediaNodes || mediaNodes.length === 0) return [];
        const files = [];
        mediaNodes.forEach((mediaEl) => {
            const url = mediaEl.textContent?.trim();
            if (!url) return;
            files.push({
                url,
                delivery: mediaEl.getAttribute("delivery") || "progressive",
                type: mediaEl.getAttribute("type") || "video/mp4",
                width: parseInt(mediaEl.getAttribute("width") || "0", 10),
                height: parseInt(mediaEl.getAttribute("height") || "0", 10),
                bitrate: parseInt(mediaEl.getAttribute("bitrate") || "0", 10),
            });
        });
        return files;
    },

    /**
     * Parse TrackingEvents into a map of event -> url[]
     * 
     * Extracts tracking URLs grouped by event type (impression, click, viewable, etc.)
     * 
     * @param {Element|null} trackingEl - TrackingEvents XML element or null
     * @returns {Object} Map of event names to arrays of tracking URLs
     */
    parseTrackingEvents(trackingEl) {
        const tracking = {};
        if (!trackingEl) return tracking;
        trackingEl.querySelectorAll("Tracking").forEach((trackEl) => {
            const event = trackEl.getAttribute("event");
            const url = trackEl.textContent?.trim();
            if (event && url) {
                if (!tracking[event]) tracking[event] = [];
                tracking[event].push(url);
            }
        });
        return tracking;
    },

    /**
     * Fetch VSAT XML from URL and parse it
     * 
     * Convenience method that combines fetching and parsing.
     * Fetches XML from URL, then calls parseVSAT on the result.
     * 
     * @param {string} url - VSAT XML URL to fetch
     * @returns {Promise<Object|null>} Parsed L-Banner configuration or null if fetch/parse fails
     */
    async fetchAndParse(url) {
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    Accept: "application/xml, text/xml",
                },
            });

            if (!response.ok) {
                throw new Error(`VSAT fetch failed: ${response.status}`);
            }

            const xmlText = await response.text();
            return this.parseVSAT(xmlText);
        } catch (error) {
            console.error("[VSATParser] Fetch error:", error);
            return null;
        }
    },
};

/**
 * Export VSATParser globally for use in other modules
 * Makes parser available on window object for main.js and other files
 */
if (typeof window !== "undefined") {
    window.VSATParser = VSATParser;
}

