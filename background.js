// Background script for handling any background tasks
chrome.runtime.onInstalled.addListener(() => {
  console.log('Spanishify extension installed');
}); 