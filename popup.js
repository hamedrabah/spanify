document.addEventListener('DOMContentLoaded', function() {
  const buttons = document.querySelectorAll('.difficulty-btn');
  
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const difficulty = button.id;
      
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script with the selected difficulty
      chrome.tabs.sendMessage(tab.id, { action: 'translate', difficulty: difficulty });
      
      // Close the popup
      window.close();
    });
  });
}); 