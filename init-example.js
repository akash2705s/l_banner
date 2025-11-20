/**
 * L-Banner Dynamic Initialization Example
 * 
 * This script demonstrates how to initialize L-Banner with just a key and URL.
 * The system will dynamically fetch and adapt to whatever VAST XML configuration
 * is provided at the URL.
 */

// Minimal initialization - only requires key and url
// Everything else is dynamically configured from the VAST XML
window.initLBanner({
  key: "your-api-key-here",
  url: "https://your-server.com/vast.xml", // VAST XML URL - can be local or remote
});

