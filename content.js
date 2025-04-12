// Cache for storing translations
const translationCache = new Map();

// Initialize speech synthesis and voices
let spanishVoice = null;
let voicesLoaded = false;

// Add global variable for current difficulty
let currentDifficulty = 5;

// Simple console logging for debugging
console.log('Spanishify content script loaded');

// Error reporting function
function reportError(error, context) {
  console.error(`Spanishify error (${context}):`, error);
  try {
    chrome.runtime.sendMessage({
      type: 'error',
      error: {
        message: error.message || 'Unknown error',
        context: context,
        stack: error.stack || ''
      }
    });
  } catch (e) {
    console.error('Failed to send error message:', e);
  }
}

// Initialize speech synthesis voices
function initVoices() {
  return new Promise((resolve) => {
    console.log('Initializing voice support...');
    
    // Check if speech synthesis is available
    if (!window.speechSynthesis) {
      console.error('Speech synthesis not available in this browser');
      resolve();
      return;
    }
    
    // Function to load voices
    const loadVoices = () => {
      try {
        // Get all available voices
        const voices = window.speechSynthesis.getVoices();
        console.log(`Found ${voices.length} voices`);
        
        if (voices && voices.length > 0) {
          // Look for Spanish voices
          const spanishVoices = voices.filter(voice => 
            voice.lang.includes('es') || 
            voice.name.includes('Spanish') ||
            voice.name.includes('Español')
          );
          
          console.log(`Found ${spanishVoices.length} Spanish voices`);
          
          if (spanishVoices.length > 0) {
            // Use the first Spanish voice found
            spanishVoice = spanishVoices[0];
            console.log('Selected Spanish voice:', spanishVoice.name, spanishVoice.lang);
          } else {
            console.log('No Spanish voices found among available voices');
          }
          
          voicesLoaded = true;
          resolve();
        } else if (voices && voices.length === 0) {
          console.warn('Voice list is empty, waiting for voices to load...');
          // In Chrome, voices might not be available immediately
          setTimeout(loadVoices, 200);
        } else {
          console.warn('No voices available at this time');
          resolve();
        }
      } catch (error) {
        console.error('Error loading voices:', error);
        resolve();
      }
    };

    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      console.log('Browser supports onvoiceschanged event, waiting for voices...');
      window.speechSynthesis.onvoiceschanged = loadVoices;
      
      // Sometimes onvoiceschanged doesn't fire, add a fallback
      setTimeout(() => {
        if (!voicesLoaded) {
          console.log('Voice change event timeout, trying direct load...');
          loadVoices();
        }
      }, 1000);
    } else {
      // For browsers that load voices synchronously
      console.log('Browser does not support onvoiceschanged, loading voices directly...');
      loadVoices();
    }
  });
}

// Initialize the extension
function initialize() {
  console.log('Initializing Spanishify extension...');
  
  // Try to initialize speech synthesis
  if (window.speechSynthesis) {
    initVoices()
      .then(() => {
        console.log('Speech synthesis initialized. Spanish voice available:', !!spanishVoice);
        
        // Test speech synthesis after a delay to ensure voices are loaded
        setTimeout(() => {
          try {
            testSpeechSynthesis();
          } catch (e) {
            console.error('Speech test failed:', e);
          }
        }, 2000);
      })
      .catch(err => console.error('Failed to initialize voices:', err));
  } else {
    console.warn('Speech synthesis not available in this browser');
  }
}

// Test function for speech synthesis
function testSpeechSynthesis() {
  console.log('Testing speech synthesis...');
  
  // Check if speech synthesis is available
  if (!window.speechSynthesis) {
    console.error('Speech synthesis not available!');
    return;
  }
  
  // List available voices
  const allVoices = window.speechSynthesis.getVoices();
  console.log(`Available voices: ${allVoices.length}`);
  
  // Check if Spanish voice was found
  if (spanishVoice) {
    console.log('Using Spanish voice:', spanishVoice.name, spanishVoice.lang);
  } else {
    console.warn('No Spanish voice configured, will use default');
  }
  
  // Silent test - don't actually speak but verify the API works
  const testUtterance = new SpeechSynthesisUtterance('');
  testUtterance.volume = 0; // Silent
  testUtterance.onend = () => console.log('Speech synthesis test successful');
  testUtterance.onerror = (e) => console.error('Speech synthesis test failed:', e);
  
  try {
    window.speechSynthesis.speak(testUtterance);
    console.log('Speech test utterance created successfully');
  } catch (e) {
    console.error('Failed to create test utterance:', e);
  }
}

// Set up message listener for translation requests
try {
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Message received:', request.action);
    
    if (request.action === 'translate') {
      translatePage(request.difficulty).catch(error => {
        reportError(error, 'translatePage');
        showNotification('Translation failed. Please try again.', 'error');
      });
    }
    return false; // Don't keep the message channel open
  });
  console.log('Message listener registered successfully');
} catch (error) {
  console.error('Failed to register message listener:', error);
}

// Call initialize when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function translatePage(difficulty = currentDifficulty) {
  // Update current difficulty
  currentDifficulty = parseInt(difficulty) || 5;
  
  // Show loading indicator
  const loadingIndicator = createLoadingIndicator();
  document.body.appendChild(loadingIndicator);

  try {
    // Check for API key first
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    if (!apiKey) {
      showNotification('Please configure your OpenAI API key in the extension options first.', 'error');
      return;
    }

    console.log('Starting translation process...');
    
    // Create a new clean document structure
    const cleanDoc = document.implementation.createHTMLDocument('Reader Mode');
    const readerContainer = cleanDoc.createElement('div');
    readerContainer.id = 'spanishify-reader';
    readerContainer.style.cssText = `
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      font-family: Arial, sans-serif;
      line-height: 1.8;
      color: #333;
      background: #fff;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: normal;
    `;

    // Extract main content before modifying the original document
    console.log('Extracting main content...');
    const mainContent = extractMainContent();
    
    if (!mainContent || mainContent.trim() === '') {
      throw new Error('No content found to translate');
    }
    
    console.log('Content extracted successfully');
    
    // Set up the clean document
    cleanDoc.body.style.cssText = `
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      min-height: 100vh;
      width: 100%;
      display: block;
    `;
    
    // Add difficulty controls first
    const difficultyControls = createDifficultyControls();
    cleanDoc.body.appendChild(difficultyControls);
    
    // Format and add content to the reader container
    console.log('Formatting content...');
    const formattedContent = formatContent(mainContent);
    readerContainer.innerHTML = formattedContent;
    cleanDoc.body.appendChild(readerContainer);

    // Replace the current document's content
    document.documentElement.innerHTML = cleanDoc.documentElement.innerHTML;

    // Initialize the difficulty slider with current value
    const slider = document.querySelector('input[type="range"]');
    const difficultyValue = document.querySelector('.difficulty-value');
    if (slider && difficultyValue) {
      slider.value = currentDifficulty;
      difficultyValue.textContent = currentDifficulty;
      updateLevelDescription(currentDifficulty);
    }

    // Get all text nodes in the reader mode
    const walker = document.createTreeWalker(
      document.getElementById('spanishify-reader'),
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const text = node.textContent.trim();
          return text && text.length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      },
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    console.log(`Found ${textNodes.length} text nodes to translate`);
    if (textNodes.length === 0) {
      throw new Error('No text found to translate');
    }

    // Batch text nodes into groups of 5
    const batchSize = 5;
    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      const batchText = batch.map(node => node.textContent.trim()).join('\n---\n');
      
      console.log(`Translating batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(textNodes.length/batchSize)}`);
      
      try {
        const translatedText = await translateText(batchText, currentDifficulty);
        const translatedParts = translatedText.split('\n---\n');
        
        // Update each node in the batch
        batch.forEach((node, index) => {
          if (translatedParts[index]) {
            node.textContent = translatedParts[index];
          }
        });
      } catch (error) {
        console.error('Translation error for batch:', error);
        showNotification(`Translation error: ${error.message}`, 'error');
        return;
      }
    }

    console.log('Translation completed successfully');
  } catch (error) {
    console.error('Translation process failed:', error);
    showNotification(`Translation failed: ${error.message}`, 'error');
  } finally {
    // Remove loading indicator
    loadingIndicator.remove();
  }
}

function extractMainContent() {
  // Get the current document content
  const content = document.body.cloneNode(true);
  
  // Create a temporary container
  const temp = document.createElement('div');
  temp.appendChild(content);
  
  // Remove unwanted elements but be more selective
  const unwantedSelectors = [
    'script', 'style', 'iframe', 'noscript', 'link', 'meta',
    '[class*="ad-"]', '[id*="ad-"]',
    '[class*="advertisement"]',
    'header', 'footer',
    '.navigation', '.nav',
    '.sidebar',
    '.cookie-banner',
    '.newsletter-signup',
    '.social-share',
    '.comments'
  ];

  // Remove unwanted elements
  unwantedSelectors.forEach(selector => {
    const elements = temp.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // Try to find main content using common selectors
  const mainSelectors = [
    'article',
    'main',
    '[role="main"]',
    '[role="article"]',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.content',
    '#content',
    '.main-content'
  ];

  let mainContent = null;
  for (const selector of mainSelectors) {
    mainContent = temp.querySelector(selector);
    if (mainContent && mainContent.textContent.trim().length > 100) {
      break;
    }
  }

  // If no main content found with sufficient text, use the body content
  if (!mainContent || mainContent.textContent.trim().length < 100) {
    console.log('No main content found with selectors or content too short, preserving more body content');
    mainContent = temp;
  }

  // Clean up the content
  const cleanContent = mainContent.cloneNode(true);
  
  // Remove empty elements
  const removeEmpty = (element) => {
    Array.from(element.getElementsByTagName('*')).forEach(el => {
      if (el.textContent.trim() === '' && !el.querySelector('img')) {
        el.remove();
      }
    });
  };
  
  removeEmpty(cleanContent);

  // Remove hidden elements
  const removeHidden = (element) => {
    const hiddenElements = element.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [hidden]');
    hiddenElements.forEach(el => el.remove());
  };
  
  removeHidden(cleanContent);

  // Clean links
  const links = cleanContent.getElementsByTagName('a');
  Array.from(links).forEach(link => {
    if (link.href) {
      try {
        const url = new URL(link.href);
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
        paramsToRemove.forEach(param => url.searchParams.delete(param));
        link.href = url.toString();
      } catch (e) {
        // Invalid URL, leave as is
      }
    }
  });

  return cleanContent.innerHTML;
}

function createLoadingIndicator() {
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 9999;
    font-family: Arial, sans-serif;
  `;
  indicator.textContent = 'Translating...';
  return indicator;
}

async function translateText(text, difficulty) {
  // Check cache first
  const cacheKey = `${difficulty}:${text}`;
  if (translationCache.has(cacheKey)) {
    console.log('Cache hit for:', cacheKey);
    return translationCache.get(cacheKey);
  }

  console.log('Cache miss for:', cacheKey);
  const prompt = getPromptForDifficulty(text, difficulty);
  
  try {
    // Get API key from extension storage
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please set it in the extension options.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful translator that translates English to Spanish with different difficulty levels. When translating multiple texts separated by '---', maintain the same separation in your response."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Translation failed');
    }
    
    const translatedText = data.choices[0].message.content.trim();
    
    // Cache the translation
    console.log('Caching translation for:', cacheKey);
    translationCache.set(cacheKey, translatedText);
    
    return translatedText;
  } catch (error) {
    console.error('OpenAI API error:', error);
    showNotification(`Translation failed: ${error.message}`, 'error');
    return text; // Return original text if translation fails
  }
}

function getPromptForDifficulty(text, difficulty) {
  // Convert numeric difficulty (1-10) to specific instructions
  const level = parseInt(difficulty) || 5; // Default to middle level if invalid
  
  // Define CEFR levels and their corresponding features
  const features = {
    vocabulary: level <= 3 ? 'A1 (basic)' : level <= 6 ? 'A2-B1 (intermediate)' : 'B2-C1 (advanced)',
    grammar: level <= 3 ? 'present tense only' : level <= 6 ? 'present, past, and future' : 'all tenses including subjunctive',
    complexity: level <= 3 ? 'simple sentences' : level <= 6 ? 'compound sentences' : 'complex sentences',
    idioms: level <= 3 ? 'no idioms' : level <= 6 ? 'common idioms' : 'sophisticated idioms',
  };

  // Build a detailed prompt based on the numeric level
  return `Translate the following text(s) to Spanish at ${features.vocabulary} level. Use:

- Vocabulary: ${features.vocabulary}
- Grammar: ${features.grammar}
- Sentence structure: ${features.complexity}
- Idiomatic expressions: ${features.idioms}
- Difficulty level: ${level}/10

Maintain natural flow while keeping it at the appropriate level. If there are multiple texts separated by '---', translate each one separately.

Text(s) to translate: "${text}"`;
}

function createDifficultyControls() {
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    max-width: 800px;
    margin: 20px auto;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;

  const label = document.createElement('label');
  label.textContent = 'Nivel de dificultad en español: ';
  label.style.cssText = `
    display: block;
    margin-bottom: 10px;
    font-weight: bold;
    color: #333;
  `;

  const value = document.createElement('span');
  value.className = 'difficulty-value';
  value.textContent = currentDifficulty;
  value.style.marginLeft = '10px';
  label.appendChild(value);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = '10';
  slider.value = currentDifficulty;
  slider.style.cssText = `
    width: 100%;
    margin: 10px 0;
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    background: #ddd;
    border-radius: 4px;
    outline: none;
  `;

  // Add description element
  const description = document.createElement('div');
  description.className = 'level-description';
  description.style.cssText = `
    margin-top: 10px;
    font-size: 0.9em;
    color: #666;
  `;

  // Add slider styles
  const style = document.createElement('style');
  style.textContent = `
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      background: #4285F4;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.1);
      background: #2b6cd4;
    }
    input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      background: #4285F4;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    input[type="range"]::-moz-range-thumb:hover {
      transform: scale(1.1);
      background: #2b6cd4;
    }
  `;
  document.head.appendChild(style);

  // Add debounced event listener
  let timeout;
  slider.addEventListener('input', () => {
    value.textContent = slider.value;
    updateLevelDescription(slider.value);
  });

  slider.addEventListener('change', () => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const newDifficulty = parseInt(slider.value);
      if (newDifficulty !== currentDifficulty) {
        await translatePage(newDifficulty);
      }
    }, 500);
  });

  container.appendChild(label);
  container.appendChild(slider);
  container.appendChild(description);

  return container;
}

function updateLevelDescription(value) {
  const description = document.querySelector('.level-description');
  if (!description) return;

  const level = parseInt(value);
  let text = '';
  if (level <= 3) {
    text = 'Principiante (A1) - Vocabulario básico y solo tiempo presente';
  } else if (level <= 6) {
    text = 'Intermedio (A2-B1) - Vocabulario ampliado y tiempos verbales comunes';
  } else {
    text = 'Avanzado (B2-C1) - Vocabulario rico y gramática compleja';
  }
  description.textContent = text;
}

function formatContent(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Create main container
  const mainContainer = document.createElement('div');
  mainContainer.style.cssText = `
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    font-size: 16px;
  `;

  // Format paragraphs
  const paragraphs = temp.querySelectorAll('p');
  paragraphs.forEach(p => {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      align-items: flex-start;
      margin-bottom: 1.5em;
      width: 100%;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    const speechButton = document.createElement('button');
    speechButton.innerHTML = '🔊';
    speechButton.setAttribute('aria-label', 'Read text aloud');
    speechButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.2em;
      padding: 5px;
      margin-right: 15px;
      color: #4285F4;
      transition: all 0.2s;
      flex: 0 0 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      border-radius: 50%;
    `;

    speechButton.addEventListener('mouseover', () => {
      speechButton.style.transform = 'scale(1.1)';
      speechButton.style.opacity = '1';
      speechButton.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
    });

    speechButton.addEventListener('mouseout', () => {
      speechButton.style.transform = 'scale(1)';
      speechButton.style.opacity = '0.7';
      speechButton.style.backgroundColor = 'transparent';
    });

    const pText = p.textContent.trim();
    
    speechButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      console.log('Speech button clicked for:', pText.substring(0, 50) + '...');
      
      speechButton.style.transform = 'scale(0.95)';
      setTimeout(() => {
        speechButton.style.transform = 'scale(1)';
      }, 100);

      if (!voicesLoaded) {
        console.log('Voices not loaded yet, loading now...');
        try {
          await initVoices();
        } catch (e) {
          console.error('Failed to initialize voices:', e);
        }
      }

      speakText(pText);
    });

    container.appendChild(speechButton);

    const pClone = p.cloneNode(true);
    pClone.style.cssText = `
      margin: 0;
      font-size: 1.1em;
      line-height: 1.8;
      flex: 1;
      color: #333;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    `;

    container.appendChild(pClone);
    mainContainer.appendChild(container);
  });

  return mainContainer.innerHTML;
}

function speakText(text) {
  console.log('Speaking text:', text);

  // Safety check
  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.error('Invalid text provided to speakText:', text);
    return;
  }
  
  // Check if speech synthesis is available
  if (!window.speechSynthesis) {
    console.error('Speech synthesis not supported in this browser');
    showNotification('Text-to-speech is not supported in this browser', 'error');
    return;
  }
  
  // Cancel any ongoing speech
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.error('Error canceling previous speech:', e);
  }

  // Create a new utterance
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Configure speech settings
  utterance.rate = 0.9; // Slightly slower than normal
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = 'es-ES'; // Always set Spanish language

  // Debug voice availability
  try {
    const allVoices = window.speechSynthesis.getVoices();
    console.log('Available voices:', allVoices.length);
    allVoices.forEach(v => {
      if (v.lang.includes('es')) {
        console.log(`Spanish voice: ${v.name}, ${v.lang}`);
      }
    });
  } catch (e) {
    console.error('Error listing voices:', e);
  }

  // Set Spanish voice if available
  try {
    if (spanishVoice) {
      console.log('Using cached Spanish voice:', spanishVoice.name);
      utterance.voice = spanishVoice;
    } else {
      console.log('Looking for Spanish voice...');
      const voices = window.speechSynthesis.getVoices();
      
      // Try to find a Spanish voice
      const spanish = voices.find(voice => 
        voice.lang.includes('es') || 
        voice.name.includes('Spanish') ||
        voice.name.includes('Español')
      );
      
      if (spanish) {
        console.log('Found Spanish voice:', spanish.name);
        utterance.voice = spanish;
        spanishVoice = spanish; // Cache for future use
      } else {
        console.warn('No Spanish voice found, using default voice');
      }
    }
  } catch (e) {
    console.error('Error setting voice:', e);
  }

  // Add event handlers
  utterance.onstart = () => console.log('Speech started');
  utterance.onend = () => console.log('Speech ended');
  utterance.onerror = (event) => {
    console.error('Speech synthesis error:', event);
    showNotification('Lo siento, there was an error with text-to-speech. Please try again.', 'error');
  };

  // Speak the text with error handling
  try {
    console.log('Attempting to speak...');
    window.speechSynthesis.speak(utterance);
    
    // Workaround for Chrome issue where speech doesn't start
    setTimeout(() => {
      if (window.speechSynthesis.paused) {
        console.log('Speech synthesis was paused, resuming...');
        window.speechSynthesis.resume();
      }
    }, 100);
    
    console.log('Speech synthesis initiated');
  } catch (error) {
    console.error('Failed to start speech synthesis:', error);
    showNotification('Error with text-to-speech. Please try again.', 'error');
    
    // Try fallback approach
    try {
      console.log('Trying fallback speech approach...');
      const newUtterance = new SpeechSynthesisUtterance(text);
      newUtterance.lang = 'es-ES';
      window.speechSynthesis.speak(newUtterance);
    } catch (fallbackError) {
      console.error('Fallback speech approach also failed:', fallbackError);
    }
  }
}

function isInBlockElement(node) {
  const blockElements = ['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
  let parent = node.parentElement;
  while (parent) {
    if (blockElements.includes(parent.tagName)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
    cursor: pointer;
  `;

  if (type === 'error') {
    notification.style.backgroundColor = '#f44336';
    notification.style.color = 'white';
  } else {
    notification.style.backgroundColor = '#4caf50';
    notification.style.color = 'white';
  }

  notification.textContent = message;

  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 5000);

  // Click to dismiss
  notification.addEventListener('click', () => {
    notification.remove();
  });

  document.body.appendChild(notification);
}

// Update exports at the end of the file
// The functions will be available in the global scope 