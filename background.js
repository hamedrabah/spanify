// Basic background script
console.log('Spanishify background script loaded');

// Initialize extension
chrome.runtime.onInstalled.addListener(function() {
  console.log('Spanishify extension installed');
  
  // Initialize storage with default settings if not already set
  chrome.storage.sync.get(['apiKey'], function(result) {
    if (!result.apiKey) {
      chrome.runtime.openOptionsPage();
    }
  });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'error') {
    console.error('Content script error:', request.error);
  }
  return false; // Don't keep the message channel open
}); 