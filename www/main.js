import localforage from 'localforage';
import JSZip from 'jszip';

// Constants
const CONFIG = {
  // Speed reading settings
  DEFAULT_WPM: 300,
  MIN_WPM: 120,
  MAX_WPM: 900,
  RAMP_TO_SPEED_START_WPM: 120,
  RAMP_TO_SPEED_DURATION_WORDS: 100,

  // Font size settings
  DEFAULT_FONT_SIZE: 16,
  MIN_FONT_SIZE: 12,
  MAX_FONT_SIZE: 32,
  FONT_SIZE_STEP: 2,
  DEFAULT_SPEED_FONT_SIZE: 48,
  MIN_SPEED_FONT_SIZE: 24,
  MAX_SPEED_FONT_SIZE: 72,
  SPEED_FONT_SIZE_STEP: 4,

  // Timing (milliseconds)
  DEBOUNCE_DELAY: 150,
  SPEED_SLIDER_DEBOUNCE: 100,
  PAGE_SWIPE_THROTTLE: 150,
  WORD_SWIPE_THROTTLE: 100,
  TAP_TIME_THRESHOLD: 300,

  // Gesture thresholds (pixels)
  SWIPE_THRESHOLD: 50,
  TAP_THRESHOLD: 10,

  // File limits
  MAX_FILE_SIZE_MB: 50,

  // Layout calculations
  CONTAINER_PADDING: 40,
  AVG_WORD_LENGTH: 6,
  CHAR_WIDTH_RATIO: 0.6,
  DEFAULT_WORDS_PER_PAGE: 50
};

// Global state
let currentView = 'library';
let documents = [];
let currentDocument = null;
let readingState = {
  documentId: null,
  currentWordIndex: 0,
  words: [],
  isPlaying: false,
  speedWPM: CONFIG.DEFAULT_WPM,
  targetSpeedWPM: CONFIG.DEFAULT_WPM,
  rampToSpeedEnabled: false,
  rampToSpeedStartWPM: CONFIG.RAMP_TO_SPEED_START_WPM,
  rampToSpeedDurationWords: CONFIG.RAMP_TO_SPEED_DURATION_WORDS,
  rampToSpeedStartWordIndex: 0
};

// UI state
let isNightMode = false;
let fontSize = CONFIG.DEFAULT_FONT_SIZE;
let speedFontSize = CONFIG.DEFAULT_SPEED_FONT_SIZE;

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function debounce(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function throttle(func, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func.apply(this, args);
    }
  };
}

function mergeTrailingPunctuation(words) {
  const result = [];
  for (const word of words) {
    if (word.length === 1 && /[-\u2013\u2014,.!?;:]/.test(word)) {
      // Single punctuation character, append to previous word
      if (result.length > 0) {
        result[result.length - 1] += word;
      } else {
        // If no previous, just add it (though unlikely)
        result.push(word);
      }
    } else {
      result.push(word);
    }
  }
  return result;
}

// Block-level elements that should have spacing around them
const BLOCK_ELEMENTS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TR', 'TD', 'TH', 'BR', 'HR',
  'BLOCKQUOTE', 'PRE', 'ARTICLE', 'SECTION', 'HEADER', 'FOOTER',
  'NAV', 'ASIDE', 'FIGCAPTION', 'FIGURE', 'DT', 'DD'
]);

function extractTextWithSpacing(element) {
  if (!element) return '';

  let result = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Add space before block elements
      if (BLOCK_ELEMENTS.has(node.tagName)) {
        result += ' ';
      }

      // Recursively extract text from child elements
      result += extractTextWithSpacing(node);

      // Add space after block elements
      if (BLOCK_ELEMENTS.has(node.tagName)) {
        result += ' ';
      }
    }
  }

  return result;
}

// Page-based rendering for normal reading
let renderedStartIndex = 0;
let renderedEndIndex = 0;
let wordsPerPage = CONFIG.DEFAULT_WORDS_PER_PAGE; // Initial estimate, will be calculated dynamically

// Initialize localforage
const db = localforage.createInstance({
  name: 'StabilityReads',
  storeName: 'documents'
});

// DOM elements
const app = document.getElementById('app');
const libraryView = document.getElementById('library-view');
const normalView = document.getElementById('normal-view');
const speedView = document.getElementById('speed-view');
const documentList = document.getElementById('document-list');
const importBtn = document.getElementById('import-btn');
const fileInput = document.getElementById('file-input');

// Cached speed reading display elements (for performance)
const wordBeforeSpan = document.getElementById('word-before');
const wordRedSpan = document.getElementById('word-red');
const wordAfterSpan = document.getElementById('word-after');

// Initialize app
async function init() {
  // Load UI preferences
  isNightMode = localStorage.getItem('nightMode') === 'true';
  fontSize = parseInt(localStorage.getItem('fontSize')) || 16;
  speedFontSize = parseInt(localStorage.getItem('speedFontSize')) || 48;
  applyUIState();

  // Ensure TOC modal is hidden on load
  document.getElementById('toc-modal').classList.add('hidden');

  await loadDocuments();
  renderLibrary();
  setupEventListeners();
}

function applyUIState() {
  document.body.classList.toggle('night', isNightMode);
  updateFontSize();
  updateSpeedFontSize();
}

function updateFontSize() {
  document.documentElement.style.setProperty('--font-size', fontSize + 'px');
  localStorage.setItem('fontSize', fontSize);
  // Re-render normal view if currently active to adjust word count
  if (currentView === 'normal') {
    renderNormalReading();
  }
}

function updateSpeedFontSize() {
  document.getElementById('word-display').style.fontSize = speedFontSize + 'px';
  localStorage.setItem('speedFontSize', speedFontSize);
}

function setupEventListeners() {
  if (!importBtn) {
    return;
  }
  importBtn.addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', handleFileSelect);

  // Event delegation for document list (avoids creating listeners per item)
  documentList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const docItem = deleteBtn.closest('.document-item');
      if (docItem) {
        deleteDocument(docItem.getAttribute('data-doc-id'));
      }
      return;
    }
    const docItem = e.target.closest('.document-item');
    if (docItem) {
      const docId = docItem.getAttribute('data-doc-id');
      const doc = documents.find(d => d.id === docId);
      if (doc) {
        openDocument(doc);
      }
    }
  });

  // Normal view
  document.getElementById('to-library').addEventListener('click', async () => {
    await saveReadingState();
    switchView('library');
  });
  document.getElementById('to-speed').addEventListener('click', () => {
    switchView('speed');
    renderSpeedReading();
  });
  document.getElementById('night-mode-btn').addEventListener('click', toggleNightMode);
  document.getElementById('speed-night-mode-btn').addEventListener('click', toggleNightMode);
  document.getElementById('menu-btn').addEventListener('click', (e) => {
    e.preventDefault();
    openTOC();
  });
  document.getElementById('speed-menu-btn').addEventListener('click', (e) => {
    e.preventDefault();
    openTOC();
  });
  document.getElementById('close-toc').addEventListener('click', (e) => {
    e.preventDefault();
    closeTOC();
  });

  // Close TOC when clicking outside modal content
  document.getElementById('toc-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('toc-modal')) {
      closeTOC();
    }
  });

  // Close TOC with escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('toc-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeTOC();
      }
    }
  });
  // Debounced font size handlers
  const handleFontSizeDown = debounce(() => {
    fontSize = Math.max(CONFIG.MIN_FONT_SIZE, fontSize - CONFIG.FONT_SIZE_STEP);
    updateFontSize();
  }, CONFIG.DEBOUNCE_DELAY);
  const handleFontSizeUp = debounce(() => {
    fontSize = Math.min(CONFIG.MAX_FONT_SIZE, fontSize + CONFIG.FONT_SIZE_STEP);
    updateFontSize();
  }, CONFIG.DEBOUNCE_DELAY);
  const handleSpeedFontSizeDown = debounce(() => {
    speedFontSize = Math.max(CONFIG.MIN_SPEED_FONT_SIZE, speedFontSize - CONFIG.SPEED_FONT_SIZE_STEP);
    updateSpeedFontSize();
  }, CONFIG.DEBOUNCE_DELAY);
  const handleSpeedFontSizeUp = debounce(() => {
    speedFontSize = Math.min(CONFIG.MAX_SPEED_FONT_SIZE, speedFontSize + CONFIG.SPEED_FONT_SIZE_STEP);
    updateSpeedFontSize();
  }, CONFIG.DEBOUNCE_DELAY);

  document.getElementById('font-size-down').addEventListener('click', handleFontSizeDown);
  document.getElementById('font-size-up').addEventListener('click', handleFontSizeUp);
  document.getElementById('speed-font-size-down').addEventListener('click', handleSpeedFontSizeDown);
  document.getElementById('speed-font-size-up').addEventListener('click', handleSpeedFontSizeUp);

  // Swipe gestures for normal reading navigation
  setupNormalViewSwipeGestures();

  // Speed view
  document.getElementById('to-library-speed').addEventListener('click', async () => {
    await saveReadingState();
    switchView('library');
  });
  document.getElementById('to-normal').addEventListener('click', () => {
    switchView('normal');
    renderNormalReading();
  });
  document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
  document.getElementById('reset-btn').addEventListener('click', resetReading);
  document.getElementById('speed-slider').addEventListener('input', debounce(updateSpeed, CONFIG.SPEED_SLIDER_DEBOUNCE));
  document.getElementById('ramp-to-speed-toggle').addEventListener('change', toggleRampToSpeed);

  // Allow tapping the reading area to play/pause
  document.getElementById('rsvp-container').addEventListener('click', togglePlayPause);

  // Swipe gestures for speed reading navigation
  setupSwipeGestures();
}

function setupNormalViewSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;

  // Throttle page navigation to prevent rapid swipes
  const throttledPrevPage = throttle(goToPreviousPage, CONFIG.PAGE_SWIPE_THROTTLE);
  const throttledNextPage = throttle(goToNextPage, CONFIG.PAGE_SWIPE_THROTTLE);

  const textContainer = document.getElementById('text-container');

  textContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  textContainer.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Check if this is a horizontal swipe
    if (Math.abs(deltaX) > CONFIG.SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault();

      if (deltaX > 0) {
        // Swipe right - go to previous page
        throttledPrevPage();
      } else {
        // Swipe left - go to next page
        throttledNextPage();
      }
    }
  });
}

function setupSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  // Throttle word navigation to prevent rapid swipes
  const throttledPrevWord = throttle(goToPreviousWord, CONFIG.WORD_SWIPE_THROTTLE);
  const throttledNextWord = throttle(goToNextWord, CONFIG.WORD_SWIPE_THROTTLE);

  const rsvpContainer = document.getElementById('rsvp-container');

  rsvpContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  rsvpContainer.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const deltaTime = touchEndTime - touchStartTime;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Check if this is a tap (small movement, quick)
    if (distance < CONFIG.TAP_THRESHOLD && deltaTime < CONFIG.TAP_TIME_THRESHOLD) {
      // Let the click handler deal with it
      return;
    }

    // Check if this is a horizontal swipe
    if (Math.abs(deltaX) > CONFIG.SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      // Prevent the click event from firing
      e.preventDefault();

      if (deltaX > 0) {
        // Swipe right - go to previous word
        throttledPrevWord();
      } else {
        // Swipe left - go to next word
        throttledNextWord();
      }
    }
  });
}

function goToPreviousWord() {
  if (readingState.currentWordIndex > 0) {
    readingState.currentWordIndex--;
    updateWordDisplay();
    updateProgressSpeed();
  }
}

function goToNextWord() {
  if (readingState.currentWordIndex < readingState.words.length - 1) {
    readingState.currentWordIndex++;
    updateWordDisplay();
    updateProgressSpeed();
  }
}

function goToNextPage() {
  const newIndex = Math.min(
    readingState.words.length - 1,
    readingState.currentWordIndex + wordsPerPage
  );
  setCurrentWord(newIndex);
  saveReadingState();
}

function goToPreviousPage() {
  const newIndex = Math.max(
    0,
    readingState.currentWordIndex - wordsPerPage
  );
  setCurrentWord(newIndex);
  saveReadingState();
}

async function loadDocuments() {
  const keys = await db.keys();
  documents = [];
  for (const key of keys) {
    const doc = await db.getItem(key);
    documents.push(doc);
  }
}

function renderLibrary() {
  documentList.textContent = '';
  if (documents.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No documents yet. Tap + to import.';
    documentList.appendChild(emptyState);
    return;
  }
  documents.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'document-item';
    item.setAttribute('data-doc-id', doc.id);
    const progress = doc.totalWords > 0 ? Math.round((doc.lastReadPosition / doc.totalWords) * 100) : 0;
    const progressText = `${progress}% • ${doc.lastReadPosition}/${doc.totalWords} words`;

    const filenameDiv = document.createElement('div');
    filenameDiv.textContent = doc.filename;

    const progressDiv = document.createElement('div');
    progressDiv.textContent = progressText;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '🗑️';

    item.appendChild(filenameDiv);
    item.appendChild(progressDiv);
    item.appendChild(deleteBtn);
    documentList.appendChild(item);
  });
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  const validTypes = ['text/plain', 'application/epub+zip'];
  if (!validTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.epub')) {
    alert('Please select a valid TXT or EPUB file.');
    return;
  }

  // Validate file size
  const maxSizeBytes = CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    alert(`File is too large. Maximum size is ${CONFIG.MAX_FILE_SIZE_MB}MB.`);
    return;
  }

  const data = await file.arrayBuffer();

  try {
    const parseResult = await parseDocument(file);
    const words = parseResult.words || parseResult;
    const toc = parseResult.toc || null;

    if (words.length === 0) {
      throw new Error('No words found in document');
    }
    const doc = {
      id: generateId(),
      filepath: '', // Will be set below
      filename: file.name,
      format: file.name.endsWith('.epub') ? 'epub' : 'txt',
      words: words,
      toc: toc,
      lastReadPosition: 0,
      totalWords: words.length,
      addedAt: Date.now(),
      lastAccessedAt: Date.now()
    };

    // Copy file to internal storage
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      try {
        const result = await window.Capacitor.Plugins.Filesystem.writeFile({
          path: `documents/${doc.id}.${doc.format}`,
          data: data,
          directory: window.Capacitor.Plugins.Filesystem.Directory.Data
        });
        doc.filepath = result.uri;
      } catch (e) {
        console.error('Failed to copy file to internal storage:', e);
        // Continue without filepath
      }
    }

    await db.setItem(doc.id, doc);
    documents.push(doc);
    renderLibrary();
    fileInput.value = ''; // Reset input
  } catch (error) {
    console.error('Error importing document:', error);
    alert('Error importing document: ' + error.message);
  }
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}


function renderNormalReading() {
  const textContainer = document.getElementById('text-container');
  textContainer.textContent = '';

  // Calculate initial estimate
  const estimatedWords = calculateWordsPerPage();

  // Render words and find out how many actually fit
  renderedStartIndex = readingState.currentWordIndex;
  const maxWords = Math.min(readingState.words.length, renderedStartIndex + estimatedWords * 2);

  const containerRect = textContainer.getBoundingClientRect();
  const maxBottom = containerRect.bottom;

  let fittingWords = 0;
  for (let index = renderedStartIndex; index < maxWords; index++) {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = readingState.words[index] + ' ';
    span.addEventListener('click', () => setCurrentWord(index));
    textContainer.appendChild(span);

    // Check if this word is still within bounds
    const wordRect = span.getBoundingClientRect();
    if (wordRect.bottom > maxBottom) {
      // This word went over the edge, remove it
      textContainer.removeChild(span);
      break;
    }
    fittingWords++;
  }

  renderedEndIndex = renderedStartIndex + fittingWords;
  wordsPerPage = fittingWords;

  updateHighlight();
  updateProgress();
}

function calculateWordsPerPage() {
  const textContainer = document.getElementById('text-container');

  // Get the actual available dimensions
  const containerHeight = textContainer.clientHeight;
  const containerWidth = textContainer.clientWidth;

  // Account for padding
  const availableWidth = containerWidth - CONFIG.CONTAINER_PADDING;
  // Account for vertical padding and ensure some margin
  const availableHeight = containerHeight - CONFIG.CONTAINER_PADDING;

  // Estimate words per line based on average word length and font size
  const avgWordLength = CONFIG.AVG_WORD_LENGTH;
  const charWidth = fontSize * CONFIG.CHAR_WIDTH_RATIO;
  const wordsPerLine = Math.floor(availableWidth / (avgWordLength * charWidth));

  // Estimate lines per page based on line height
  const lineHeight = fontSize * 1.5; // Based on CSS line-height
  const linesPerPage = Math.floor(availableHeight / lineHeight);

  const estimated = Math.max(1, wordsPerLine * linesPerPage);

  // Return a reasonable estimate
  return estimated > 0 ? estimated : CONFIG.DEFAULT_WORDS_PER_PAGE;
}

function setCurrentWord(index) {
  readingState.currentWordIndex = index;

  // Always re-render to show page starting from clicked word
  renderNormalReading();
}

function updateHighlight() {
  const words = document.querySelectorAll('.word');
  const localIndex = readingState.currentWordIndex - renderedStartIndex;
  words.forEach((word, index) => {
    word.classList.toggle('highlighted', index === localIndex);
  });
}

function updateProgress() {
  const totalWords = readingState.words.length;
  const progress = totalWords > 0 ? Math.round((readingState.currentWordIndex / totalWords) * 100) : 0;
  document.getElementById('progress').innerHTML = `${progress}%<br>${readingState.currentWordIndex + 1}/${totalWords}`;
}

function renderSpeedReading() {
  updateWordDisplay();
  updateProgressSpeed();
  updateSpeedDisplay();
}

function updateWordDisplay() {
  const word = readingState.words[readingState.currentWordIndex] || '';
  // Calculate ORP index: closest to 1/3 of the way into the word
  let orpIndex = Math.round((word.length - 1) / 3);
  if (word.length === 2) orpIndex = 1; // For 2-letter words, choose the last letter
  if (word.length === 1) orpIndex = 0; // Single letter, first
  const before = word.substring(0, orpIndex);
  const red = word[orpIndex] || '';
  const after = word.substring(orpIndex + 1);

  // Update cached span elements (no DOM creation needed)
  wordBeforeSpan.textContent = before;
  wordRedSpan.textContent = red;
  wordAfterSpan.textContent = after;
}

function updateProgressSpeed() {
  const totalWords = readingState.words.length;
  const progress = totalWords > 0 ? Math.round((readingState.currentWordIndex / totalWords) * 100) : 0;
  document.getElementById('progress-speed').innerHTML = `${progress}%<br>${readingState.currentWordIndex + 1}/${totalWords}`;
}

function updateSpeedDisplay() {
  document.getElementById('current-wpm').textContent = `Current: ${readingState.speedWPM} WPM`;
}

function togglePlayPause() {
  readingState.isPlaying = !readingState.isPlaying;
  document.getElementById('play-pause-btn').textContent = readingState.isPlaying ? '‖' : '▶';
  if (readingState.isPlaying) {
    if (readingState.rampToSpeedEnabled) {
      readingState.rampToSpeedStartWordIndex = readingState.currentWordIndex;
      readingState.rampToSpeedStartWPM = CONFIG.RAMP_TO_SPEED_START_WPM;
      readingState.targetSpeedWPM = readingState.speedWPM;
    }
    startPlayback();
  } else {
    stopPlayback();
    saveReadingState();
  }
}

let playbackTimeout;
let wakeLock = null;

async function acquireWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      // Wake lock request failed (e.g., low battery)
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

function startPlayback() {
  stopPlayback(); // Clear any existing timeout first
  acquireWakeLock();
  scheduleNextWord();
}

function scheduleNextWord() {
  const delay = calculateDelay();
  playbackTimeout = setTimeout(() => {
    readingState.currentWordIndex++;
    if (readingState.currentWordIndex >= readingState.words.length) {
      readingState.currentWordIndex = readingState.words.length - 1;
      togglePlayPause();
    } else {
      updateWordDisplay();
      updateProgressSpeed();
      updateSpeedDisplay();
      // Schedule next word with fresh delay (handles ramp-to-speed naturally)
      scheduleNextWord();
    }
  }, delay);
}

function calculateDelay() {
  let wpm = readingState.speedWPM;
  if (readingState.rampToSpeedEnabled) {
    const progress = Math.min((readingState.currentWordIndex - readingState.rampToSpeedStartWordIndex) / readingState.rampToSpeedDurationWords, 1);
    wpm = readingState.rampToSpeedStartWPM + (readingState.targetSpeedWPM - readingState.rampToSpeedStartWPM) * progress;
  }
  return 60000 / wpm;
}

function stopPlayback() {
  clearTimeout(playbackTimeout);
  releaseWakeLock();
}

function resetReading() {
  readingState.currentWordIndex = 0;
  updateWordDisplay();
  updateProgressSpeed();
}

function updateSpeed(event) {
  const newSpeed = parseInt(event.target.value);
  if (readingState.rampToSpeedEnabled && readingState.isPlaying) {
    // User-initiated speed changes take effect immediately
    readingState.rampToSpeedStartWPM = newSpeed;
    readingState.rampToSpeedStartWordIndex = readingState.currentWordIndex;
  }
  readingState.speedWPM = newSpeed;
  readingState.targetSpeedWPM = newSpeed;
  updateSpeedDisplay();
  if (readingState.isPlaying) {
    stopPlayback();
    startPlayback();
  }
}

function toggleRampToSpeed(event) {
  readingState.rampToSpeedEnabled = event.target.checked;
  if (readingState.rampToSpeedEnabled) {
    readingState.rampToSpeedStartWordIndex = readingState.currentWordIndex;
    readingState.rampToSpeedStartWPM = readingState.speedWPM;
    readingState.targetSpeedWPM = readingState.speedWPM;
  }
  if (readingState.isPlaying) {
    stopPlayback();
    startPlayback();
  }
}

function toggleNightMode() {
  isNightMode = !isNightMode;
  document.body.classList.toggle('night', isNightMode);
  localStorage.setItem('nightMode', isNightMode);
}

async function openDocument(doc) {
  currentDocument = doc;
  readingState.documentId = doc.id;
  readingState.currentWordIndex = doc.lastReadPosition;
  readingState.words = doc.words;
  doc.lastAccessedAt = Date.now();
  await db.setItem(doc.id, doc); // Update access time
  switchView('normal');
  renderNormalReading();
}

function switchView(view) {
  // If leaving speed view while playing, stop playback
  if (currentView === 'speed' && view !== 'speed' && readingState.isPlaying) {
    readingState.isPlaying = false;
    document.getElementById('play-pause-btn').textContent = '▶';
    stopPlayback();
  }

  currentView = view;
  libraryView.classList.toggle('hidden', view !== 'library');
  normalView.classList.toggle('hidden', view !== 'normal');
  speedView.classList.toggle('hidden', view !== 'speed');
}

async function parseDocument(file) {
  if (file.name.endsWith('.epub')) {
    return await parseEPUB(file);
  } else {
    const content = await readFile(file);
    return parseTXT(content);
  }
}

function parseTXT(content) {
  // Insert spaces around punctuation to split words properly
  content = content.replace(/([,\.!?;:\u2013\u2014])/g, ' $1 ');
  let words = content.split(/\s+/).filter(word => word.length > 0);
  words = mergeTrailingPunctuation(words);

  // Generate percentage-based bookmarks for TXT files
  const toc = [];
  const percentages = [0, 25, 50, 75, 100];
  for (const pct of percentages) {
    const wordIndex = Math.floor((pct / 100) * words.length);
    toc.push({
      title: `${pct}%`,
      wordIndex: Math.min(wordIndex, words.length - 1)
    });
  }

  return { words, toc };
}

async function parseEPUB(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Parse container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: Missing container.xml. This file may be corrupted or not a valid EPUB.');
    }
    const containerText = await containerFile.async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerText, 'text/xml');
    const rootfileElement = containerDoc.querySelector('rootfile');
    if (!rootfileElement) {
      throw new Error('Invalid EPUB: Cannot find content location in container.xml');
    }
    const rootfile = rootfileElement.getAttribute('full-path');

    // Parse OPF
    const opfFile = zip.file(rootfile);
    if (!opfFile) {
      throw new Error('Invalid EPUB: Cannot find content file. The EPUB structure may be malformed.');
    }
    const opfText = await opfFile.async('text');
    const opfDoc = parser.parseFromString(opfText, 'text/xml');

    // Get base path for manifest hrefs
    const basePath = rootfile.includes('/') ? rootfile.substring(0, rootfile.lastIndexOf('/') + 1) : '';

    // Build manifest
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = basePath + item.getAttribute('href');
    });

    // Get spine
    const spine = opfDoc.querySelectorAll('spine itemref');

    if (spine.length === 0) {
      throw new Error('Invalid EPUB: No chapters found. The EPUB may be empty or corrupted.');
    }

    let allWords = [];
    let successfulChapters = 0;
    let failedChapters = 0;
    const toc = []; // Track chapters for TOC

    for (const itemref of spine) {
      const id = itemref.getAttribute('idref');
      const href = manifest[id];
      if (href && (href.endsWith('.html') || href.endsWith('.xhtml') || href.endsWith('.htm'))) {
        try {
          const htmlFile = zip.file(href);
          if (!htmlFile) {
            failedChapters++;
            continue;
          }
          const htmlText = await htmlFile.async('text');
          const htmlDoc = parser.parseFromString(htmlText, 'text/html');

          // Extract text with proper spacing between block elements
          const text = extractTextWithSpacing(htmlDoc.body);

          // Track chapter start word index BEFORE adding words
          const chapterStartWordIndex = allWords.length;

          // Try to extract chapter title
          let chapterTitle = '';
          const h1 = htmlDoc.querySelector('h1');
          const h2 = htmlDoc.querySelector('h2');
          const title = htmlDoc.querySelector('title');
          if (h1 && h1.textContent.trim()) {
            chapterTitle = h1.textContent.trim();
          } else if (h2 && h2.textContent.trim()) {
            chapterTitle = h2.textContent.trim();
          } else if (title && title.textContent.trim()) {
            chapterTitle = title.textContent.trim();
          } else {
            chapterTitle = `Chapter ${successfulChapters + 1}`;
          }

          // Parse this chapter's text into words
          let chapterText = text.replace(/([,\.!?;:\u2013\u2014])/g, ' $1 ');
          let chapterWords = chapterText.split(/\s+/).filter(word => word.length > 0);
          chapterWords = mergeTrailingPunctuation(chapterWords);

          // Only add to TOC if chapter has words
          if (chapterWords.length > 0) {
            toc.push({
              title: chapterTitle,
              wordIndex: chapterStartWordIndex
            });
          }

          allWords = allWords.concat(chapterWords);
          successfulChapters++;
        } catch (e) {
          failedChapters++;
        }
      }
    }

    if (allWords.length === 0) {
      throw new Error('EPUB contains no readable text. All chapters failed to parse or are empty.');
    }

    // Warn user if some chapters failed but we got some content
    if (failedChapters > 0 && successfulChapters > 0) {
      setTimeout(() => {
        alert(`Warning: ${failedChapters} chapter(s) could not be parsed. The book may be incomplete.`);
      }, 500);
    }

    return { words: allWords, toc };
  } catch (error) {
    console.error('EPUB parsing error:', error);
    // Re-throw with user-friendly message if we have one, otherwise use generic message
    if (error.message && (error.message.startsWith('Invalid EPUB') || error.message.startsWith('EPUB contains'))) {
      throw error;
    }
    throw new Error('Failed to parse EPUB file: ' + (error.message || 'Unknown error'));
  }
}

async function deleteDocument(docId) {
  if (confirm('Delete this document?')) {
    await db.removeItem(docId);
    documents = documents.filter(doc => doc.id !== docId);
    renderLibrary();
  }
}

// Start the app
init();
setupLifecycleListeners();

function pauseSpeedReadingIfPlaying() {
  if (readingState.isPlaying) {
    togglePlayPause();
  }
}

function setupLifecycleListeners() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        pauseSpeedReadingIfPlaying();
        saveReadingState();
      }
    });
    window.Capacitor.Plugins.App.addListener('pause', () => {
      pauseSpeedReadingIfPlaying();
      saveReadingState();
    });
  }

  window.addEventListener('beforeunload', () => {
    saveReadingState();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseSpeedReadingIfPlaying();
      saveReadingState();
    }
  });
}

async function saveReadingState() {
  if (currentDocument && readingState.documentId) {
    currentDocument.lastReadPosition = readingState.currentWordIndex;
    currentDocument.lastAccessedAt = Date.now();
    await db.setItem(readingState.documentId, currentDocument);
    // Update progress in library view
    const item = document.querySelector(`[data-doc-id="${readingState.documentId}"]`);
    if (item) {
      const progress = currentDocument.totalWords > 0 ? Math.round((currentDocument.lastReadPosition / currentDocument.totalWords) * 100) : 0;
      const progressText = `${progress}% • ${currentDocument.lastReadPosition}/${currentDocument.totalWords} words`;
      item.children[1].textContent = progressText;
    }
  }
}

function openTOC() {
  if (!currentDocument || !currentDocument.toc || currentDocument.toc.length === 0) {
    alert('No table of contents available for this document.');
    return;
  }

  renderTOC();
  document.getElementById('toc-modal').classList.remove('hidden');
}

function closeTOC() {
  const modal = document.getElementById('toc-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function renderTOC() {
  const tocList = document.getElementById('toc-list');
  tocList.textContent = '';

  if (!currentDocument.toc) return;

  currentDocument.toc.forEach((item) => {
    const tocItem = document.createElement('div');
    tocItem.className = 'toc-item';

    const title = document.createElement('div');
    title.className = 'toc-item-title';
    title.textContent = item.title;

    const progress = document.createElement('div');
    progress.className = 'toc-item-progress';
    const percentage = currentDocument.totalWords > 0 ? Math.round((item.wordIndex / currentDocument.totalWords) * 100) : 0;
    progress.textContent = `${percentage}% • Word ${item.wordIndex + 1}`;

    tocItem.appendChild(title);
    tocItem.appendChild(progress);

    tocItem.addEventListener('click', () => {
      jumpToChapter(item.wordIndex);
    });

    tocList.appendChild(tocItem);
  });
}

function jumpToChapter(wordIndex) {
  readingState.currentWordIndex = wordIndex;
  closeTOC();

  // Update the appropriate view
  if (currentView === 'normal') {
    renderNormalReading();
  } else if (currentView === 'speed') {
    renderSpeedReading();
  }
}