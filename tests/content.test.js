// Import functions and cache from content.js
import {
  extractMainContent,
  translateText,
  formatContent,
  speakText,
  initVoices,
  translationCache
} from '../content.js';

// Mock chrome.storage and chrome.runtime
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock fetch
global.fetch = jest.fn();

// Mock SpeechSynthesis
global.window.speechSynthesis = {
  getVoices: jest.fn().mockReturnValue([]),
  speak: jest.fn(),
  cancel: jest.fn(),
  onvoiceschanged: null
};

// Mock SpeechSynthesisUtterance
global.SpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
  text,
  rate: 1,
  pitch: 1,
  volume: 1,
  voice: null,
  lang: '',
  onend: null,
  onerror: null
}));

describe('Content Script Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    document.body.innerHTML = '';
    
    // Mock storage to return API key
    chrome.storage.sync.get.mockImplementation((key, callback) => {
      return Promise.resolve({ apiKey: 'test-api-key' });
    });

    // Mock successful API response
    fetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Translated text' } }]
        })
      })
    );
  });

  describe('extractMainContent', () => {
    test('extracts content from TechCrunch article', () => {
      document.body.innerHTML = `
        <article class="article-content">
          <h1>Test Title</h1>
          <p>Test paragraph</p>
          <div class="advertisement">Ad content</div>
        </article>
      `;
      const content = extractMainContent();
      expect(content).toContain('Test Title');
      expect(content).toContain('Test paragraph');
      expect(content).not.toContain('Ad content');
    });

    test('extracts content from WSJ article', () => {
      document.body.innerHTML = `
        <div class="article-wrap">
          <article>
            <h1>WSJ Title</h1>
            <p>WSJ content</p>
            <div class="wsj-ad">Ad</div>
          </article>
        </div>
      `;
      const content = extractMainContent();
      expect(content).toContain('WSJ Title');
      expect(content).toContain('WSJ content');
      expect(content).not.toContain('wsj-ad');
    });

    test('extracts content from NYT article', () => {
      document.body.innerHTML = `
        <article id="story">
          <h1>NYT Title</h1>
          <p>NYT content</p>
          <div class="ad"></div>
        </article>
      `;
      const content = extractMainContent();
      expect(content).toContain('NYT Title');
      expect(content).toContain('NYT content');
      expect(content).not.toContain('class="ad"');
    });

    test('handles empty content gracefully', () => {
      document.body.innerHTML = '';
      const content = extractMainContent();
      expect(content).toBeDefined();
    });

    test('removes hidden elements', () => {
      document.body.innerHTML = `
        <article>
          <p>Visible content</p>
          <div style="display: none">Hidden content</div>
          <span hidden>Also hidden</span>
        </article>
      `;
      const content = extractMainContent();
      expect(content).toContain('Visible content');
      expect(content).not.toContain('Hidden content');
      expect(content).not.toContain('Also hidden');
    });

    test('cleans tracking parameters from links', () => {
      document.body.innerHTML = `
        <article>
          <a href="https://example.com?utm_source=test&ref=123">Link</a>
        </article>
      `;
      const content = extractMainContent();
      expect(content).toMatch(/href="https:\/\/example\.com\/?"/);
      expect(content).not.toContain('utm_source');
      expect(content).not.toContain('ref=123');
    });
  });

  describe('translateText', () => {
    beforeEach(() => {
      // Clear the translation cache before each test
      translationCache.clear();
      // Reset fetch mock
      fetch.mockClear();
    });

    test('translates text with beginner difficulty', async () => {
      const text = 'Hello world';
      const result = await translateText(text, 'beginner');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
      expect(result).toBe('Translated text');
    });

    test('uses translation cache', async () => {
      const text = 'Hello world';
      const firstResult = await translateText(text, 'beginner');
      expect(fetch).toHaveBeenCalledTimes(1);
      
      const secondResult = await translateText(text, 'beginner');
      expect(fetch).toHaveBeenCalledTimes(1); // Should not call fetch again
      expect(secondResult).toBe(firstResult);
    });

    test('handles API errors', async () => {
      fetch.mockImplementationOnce(() => 
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({
            error: { message: 'API Error' }
          })
        })
      );
      const text = 'Test error';
      const result = await translateText(text, 'beginner');
      expect(result).toBe(text);
    });

    test('handles missing API key', async () => {
      chrome.storage.sync.get.mockImplementationOnce(() => Promise.resolve({}));
      const text = 'Test text';
      const result = await translateText(text, 'beginner');
      expect(result).toBe(text);
    });

    test('translates text with different difficulty levels', async () => {
      const text = 'Test text';
      const difficulties = ['beginner', 'intermediate', 'advanced'];
      
      for (const difficulty of difficulties) {
        const result = await translateText(text, difficulty);
        expect(result).toBe('Translated text');
        expect(fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(difficulty)
          })
        );
      }
    });
  });

  describe('formatContent', () => {
    test('adds speech buttons to paragraphs', () => {
      const html = '<p>Test paragraph</p>';
      const formatted = formatContent(html);
      expect(formatted).toContain('🔊');
      expect(formatted).toContain('aria-label="Read text aloud"');
    });

    test('preserves paragraph text', () => {
      const html = '<p>Test paragraph</p>';
      const formatted = formatContent(html);
      expect(formatted).toContain('Test paragraph');
    });

    test('handles empty input', () => {
      const html = '';
      const formatted = formatContent(html);
      expect(formatted).toBeDefined();
      expect(formatted).toBe('');
    });

    test('adds proper styling to paragraphs', () => {
      const html = '<p>Test paragraph</p>';
      const formatted = formatContent(html);
      expect(formatted).toContain('style="');
      expect(formatted).toContain('margin: 0');
      expect(formatted).toContain('font-size: 1.1em');
    });

    test('handles multiple paragraphs', () => {
      const html = '<p>First</p><p>Second</p>';
      const formatted = formatContent(html);
      const buttonCount = (formatted.match(/🔊/g) || []).length;
      expect(buttonCount).toBe(2);
    });
  });

  describe('speakText', () => {
    test('uses Spanish voice when available', () => {
      const spanishVoice = { lang: 'es-ES', name: 'Spanish Voice' };
      window.speechSynthesis.getVoices.mockReturnValue([spanishVoice]);
      initVoices();
      speakText('Test text');
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });

    test('uses default Spanish settings when no voice available', () => {
      window.speechSynthesis.getVoices.mockReturnValue([]);
      speakText('Test text');
      expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test text',
          rate: 0.9,
          lang: 'es-ES'
        })
      );
    });

    test('cancels ongoing speech before starting new one', () => {
      speakText('Test text');
      expect(window.speechSynthesis.cancel).toHaveBeenCalled();
      expect(window.speechSynthesis.speak).toHaveBeenCalled();
    });
  });
}); 