/**
 * WP Detector - Background Service Worker
 * Manages detection state and UI updates (badge).
 */

let tabData = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab.id;

    if (message.type === 'WP_DETECTED') {
        tabData[tabId] = message.data;

        // Update badge
        chrome.action.setBadgeText({
            text: 'WP',
            tabId: tabId
        });
        chrome.action.setBadgeBackgroundColor({
            color: '#21759b', // Official WordPress Blue
            tabId: tabId
        });

        // Store in local storage for popup to access
        chrome.storage.local.set({ [`tab_${tabId}`]: message.data });
    } else if (message.type === 'WP_NOT_DETECTED') {
        delete tabData[tabId];
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        });
        chrome.storage.local.remove(`tab_${tabId}`);
    }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabData[tabId];
    chrome.storage.local.remove(`tab_${tabId}`);
});
