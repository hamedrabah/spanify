import '@testing-library/jest-dom';

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