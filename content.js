// Cache for storing translations
const translationCache = new Map();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translatePage(request.difficulty);
  }
});

async function translatePage(difficulty) {
  // Show loading indicator
  const loadingIndicator = createLoadingIndicator();
  document.body.appendChild(loadingIndicator);

  try {
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
    const mainContent = extractMainContent();
    
    // Set up the clean document
    cleanDoc.body.style.cssText = `
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      min-height: 100vh;
      width: 100%;
      display: block;
    `;
    
    // Format and add content to the reader container
    const formattedContent = formatContent(mainContent);
    readerContainer.innerHTML = formattedContent;
    cleanDoc.body.appendChild(readerContainer);

    // Replace the current document's content
    document.documentElement.innerHTML = cleanDoc.documentElement.innerHTML;

    // Get all text nodes in the reader mode
    const walker = document.createTreeWalker(
      document.getElementById('spanishify-reader'),
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      },
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Batch text nodes into groups of 5
    const batchSize = 5;
    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      const batchText = batch.map(node => node.textContent).join('\n---\n');
      
      try {
        const translatedText = await translateText(batchText, difficulty);
        const translatedParts = translatedText.split('\n---\n');
        
        // Update each node in the batch
        batch.forEach((node, index) => {
          if (translatedParts[index]) {
            node.textContent = translatedParts[index];
          }
        });
      } catch (error) {
        console.error('Translation error for batch:', error);
      }
    }
  } finally {
    // Remove loading indicator
    loadingIndicator.remove();
  }
}

function extractMainContent() {
  // Get the current document content
  const content = document.body.innerHTML;
  
  // Create a temporary container
  const temp = document.createElement('div');
  temp.innerHTML = content;
  
  // Remove unwanted elements
  const unwantedSelectors = [
    'script',
    'style',
    'iframe',
    'form',
    'noscript',
    'link',
    'meta',
    '[class*="advertisement"]',
    '[class*="social-share"]',
    '[class*="comment"]',
    '[class*="header-nav"]',
    '[class*="footer"]',
    '[class*="nav-bar"]',
    '[class*="menu-"]',
    '[class*="sidebar"]',
    '[class*="related"]',
    '[class*="newsletter"]',
    '[class*="popup"]',
    '[class*="modal"]',
    '[class*="cookie"]',
    '[class*="banner"]',
    '[class*="tracking"]',
    '[class*="analytics"]',
    'header nav',
    'footer',
    'nav:not([aria-label="article"])',
    'aside'
  ];
  
  unwantedSelectors.forEach(selector => {
    const elements = temp.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // Find the main content
  const mainSelectors = [
    'article',
    '.article-content',
    '.article__content',
    'main[role="main"]',
    '[role="article"]',
    '.post-content',
    '.entry-content',
    '#content-loop',
    '.content',
    '.article'
  ];

  let mainContent = null;
  for (const selector of mainSelectors) {
    mainContent = temp.querySelector(selector);
    if (mainContent) break;
  }

  // If no main content found, use the cleaned temp container
  mainContent = mainContent || temp;

  // Preserve important links but remove tracking parameters
  const links = mainContent.getElementsByTagName('a');
  for (const link of links) {
    if (link.href) {
      try {
        const url = new URL(link.href);
        // Remove tracking parameters
        url.search = '';
        link.href = url.toString();
      } catch (e) {
        // Invalid URL, leave as is
      }
    }
  }

  // Remove empty elements
  const removeEmpty = (element) => {
    const isEmpty = (el) => {
      const text = el.textContent.trim();
      const hasImages = el.querySelector('img');
      const hasLinks = el.querySelector('a');
      return !text && !hasImages && !hasLinks;
    };

    Array.from(element.getElementsByTagName('*')).forEach(el => {
      if (isEmpty(el) && !el.querySelector('img, video, iframe')) {
        el.remove();
      }
    });
  };

  removeEmpty(mainContent);

  return mainContent.innerHTML;
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
    return translationCache.get(cacheKey);
  }

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
    translationCache.set(cacheKey, translatedText);
    
    return translatedText;
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Show error to user
    alert(`Translation failed: ${error.message}`);
    return text; // Return original text if translation fails
  }
}

function getPromptForDifficulty(text, difficulty) {
  switch (difficulty) {
    case 'beginner':
      return `Translate the following text(s) to Spanish at a 1A level (beginner Spanish). Use only:
- Present tense verbs
- Basic vocabulary (A1 level)
- Simple sentence structures
- Common nouns and adjectives
- Basic pronouns (yo, tú, él, ella, nosotros, vosotros, ellos)
- No subjunctive or complex tenses
- No idiomatic expressions
Keep sentences short and clear. If there are multiple texts separated by '---', translate each one separately.

Text(s) to translate: "${text}"`;
    
    case 'intermediate':
      return `Translate the following text(s) to Spanish at a 1B level (intermediate Spanish). Use:
- Present, past (pretérito perfecto and pretérito indefinido), and future tenses
- Intermediate vocabulary (A2 level)
- More complex sentence structures
- Common expressions and phrases
- Direct and indirect object pronouns
- Basic subjunctive in common expressions
- Some idiomatic expressions
Maintain natural flow while keeping it accessible. If there are multiple texts separated by '---', translate each one separately.

Text(s) to translate: "${text}"`;
    
    case 'advanced':
      return `Translate the following text(s) to Spanish at a 2A level (advanced Spanish). Use:
- All verb tenses (including subjunctive and conditional)
- Advanced vocabulary (B1 level)
- Complex sentence structures
- Idiomatic expressions
- Advanced grammar concepts
- Cultural references where appropriate
- Sophisticated language patterns
Maintain the original meaning while using appropriate advanced language. If there are multiple texts separated by '---', translate each one separately.

Text(s) to translate: "${text}"`;
    
    default:
      return `Translate the following text(s) to Spanish: "${text}"`;
  }
}

function formatContent(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Normalize the content structure
  const content = document.createElement('div');
  content.style.cssText = `
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    font-size: 16px;
  `;

  // Preserve and style links
  const links = temp.getElementsByTagName('a');
  for (const link of links) {
    link.style.cssText = `
      color: #0066cc;
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
    `;
    link.addEventListener('mouseover', () => {
      link.style.borderBottomColor = '#0066cc';
    });
    link.addEventListener('mouseout', () => {
      link.style.borderBottomColor = 'transparent';
    });
  }

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
    speechButton.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.2em;
      padding: 5px;
      margin-right: 15px;
      color: #4285F4;
      transition: transform 0.2s;
      flex: 0 0 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
    `;

    speechButton.addEventListener('mouseover', () => {
      speechButton.style.transform = 'scale(1.1)';
      speechButton.style.opacity = '1';
    });
    speechButton.addEventListener('mouseout', () => {
      speechButton.style.transform = 'scale(1)';
      speechButton.style.opacity = '0.7';
    });

    speechButton.addEventListener('click', () => {
      const text = p.textContent;
      speakText(text);
    });

    const pClone = p.cloneNode(true);
    pClone.style.cssText = `
      margin: 0;
      font-size: 1.1em;
      line-height: 1.8;
      flex: 1;
      color: #333;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    `;

    container.appendChild(speechButton);
    container.appendChild(pClone);
    p.replaceWith(container);
  });

  return temp.innerHTML;
}

function speakText(text) {
  // Create a new SpeechSynthesisUtterance
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set Spanish voice if available
  const voices = speechSynthesis.getVoices();
  const spanishVoice = voices.find(voice => 
    voice.lang.includes('es') || 
    voice.name.includes('Spanish') ||
    voice.name.includes('Español')
  );
  
  if (spanishVoice) {
    utterance.voice = spanishVoice;
  } else {
    // Fallback to default voice
    utterance.lang = 'es-ES';
  }

  // Configure speech settings
  utterance.rate = 0.9; // Slightly slower than normal
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Speak the text
  speechSynthesis.speak(utterance);
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