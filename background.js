/**
 * WPAudet - Background Service Worker v1.2.0
 * Manages site detection state and badge UI.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!sender.tab) return;
    const tabId = sender.tab.id;

    if (message.type === 'SITE_DATA') {
        const data = message.data;

        // Store in local storage for popup to access
        chrome.storage.local.set({ [`tab_${tabId}`]: data });

        if (data.isWP) {
            // WordPress site: show WP badge
            chrome.action.setBadgeText({ text: 'WP', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#21759b', tabId: tabId });
        } else {
            // Non-WordPress site: show audit badge
            chrome.action.setBadgeText({ text: '✓', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#2d8a4e', tabId: tabId });
        }
    }

    // Legacy support: older message types (graceful fallback)
    if (message.type === 'WP_DETECTED') {
        const data = { ...message.data, isWP: true };
        chrome.storage.local.set({ [`tab_${tabId}`]: data });
        chrome.action.setBadgeText({ text: 'WP', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#21759b', tabId: tabId });
    } else if (message.type === 'WP_NOT_DETECTED') {
        chrome.storage.local.remove(`tab_${tabId}`);
        chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(`tab_${tabId}`);
});
