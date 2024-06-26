/**
 * Add browser actions, for WebExtension
 * (e.g. to open SUMARiS in a tab, when integrated as a Firefox extension).
 *
 **/
var browser, chrome;

browser = browser || chrome;

var action = browser.browserAction || (chrome && chrome.action);

var browserExtensionRequirements = browser.tabs && action && action.onClicked;

// If integrated as a browser extension
if (browserExtensionRequirements) {
  console.debug("[extension] Initializing...");

  /**
   * Open Cesium in a new browser's tab
   */
  function openInTab() {
    console.debug("[extension] Opening SUMARiS...")
    browser.tabs.create({
      url: "index.html"
    });
  }

  // Adding browser action
  action.onClicked.addListener(openInTab);

  // FIXME: finish this code
  function checkNotifications() {
    console.debug("[extension] Checking for notifications...");

    action.setBadgeText({
      text: '0'
    });
    action.setBadgeBackgroundColor({
      color: '#144391' // = $positive color - see the SCSS theme
    });

    // Loop, after a delay
    setTimeout(function() {
      checkNotifications();
    }, 60 * 1000 /*1min*/);
  }
  //checkNotifications();
}
else {
  console.error("[extension] Cannot init extension: missing some API requirements (action or tabs");
}
