// Global state
let currentView = 'library';
let documents = [];
let currentDocument = null;
let readingState = {
  documentId: null,
  currentWordIndex: 0,
  words: [],
  isPlaying: false,
  speedWPM: 300,
  targetSpeedWPM: 300,
  autoPaceEnabled: false,
  autoPaceStartWPM: 120,
  autoPaceDurationWords: 100,
  autoPaceStartWordIndex: 0
};

// UI state
let isNightMode = false;
let fontSize = 16;
let speedFontSize = 48;

// Virtual rendering for normal reading
let renderedStartIndex = 0;
let renderedEndIndex = 0;
const RENDER_WINDOW_SIZE = 200; // Number of words to render around current position

// Initialize localforage
const db = window.localforage.createInstance({
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

// Initialize app
async function init() {
  // Load UI preferences
  isNightMode = localStorage.getItem('nightMode') === 'true';
  fontSize = parseInt(localStorage.getItem('fontSize')) || 16;
  speedFontSize = parseInt(localStorage.getItem('speedFontSize')) || 48;
  applyUIState();

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

  // Normal view
  document.getElementById('back-to-library').addEventListener('click', async () => {
    await saveReadingState();
    switchView('library');
  });
  document.getElementById('to-library').addEventListener('click', async () => {
    await saveReadingState();
    switchView('library');
  });
  document.getElementById('to-speed').addEventListener('click', () => {
    switchView('speed');
    renderSpeedReading();
  });
  document.getElementById('night-mode-btn').addEventListener('click', () => {
    isNightMode = !isNightMode;
    document.body.classList.toggle('night', isNightMode);
    localStorage.setItem('nightMode', isNightMode);
  });
  document.getElementById('font-size-down').addEventListener('click', () => {
    fontSize = Math.max(12, fontSize - 2);
    updateFontSize();
  });
  document.getElementById('speed-font-size-down').addEventListener('click', () => {
    speedFontSize = Math.max(24, speedFontSize - 4);
    updateSpeedFontSize();
  });
  document.getElementById('speed-font-size-up').addEventListener('click', () => {
    speedFontSize = Math.min(72, speedFontSize + 4);
    updateSpeedFontSize();
  });

  // Speed view
  document.getElementById('back-to-library-speed').addEventListener('click', async () => {
    await saveReadingState();
    switchView('library');
  });
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
  document.getElementById('speed-slider').addEventListener('input', updateSpeed);
  document.getElementById('auto-pace-toggle').addEventListener('change', toggleAutoPace);
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
  documentList.innerHTML = '';
  if (documents.length === 0) {
    documentList.innerHTML = '<div class="empty-state">No documents yet. Tap + to import.</div>';
    return;
  }
  documents.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'document-item';
    item.setAttribute('data-doc-id', doc.id);
    const progress = Math.round((doc.lastReadPosition / doc.totalWords) * 100);
    const progressText = `${progress}% • ${doc.lastReadPosition}/${doc.totalWords} words`;
    item.innerHTML = `
      <div>${doc.filename}</div>
      <div>${progressText}</div>
      <button class="delete-btn">🗑️</button>
    `;
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) {
        openDocument(doc);
      }
    });
    const deleteBtn = item.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDocument(doc.id);
    });
    documentList.appendChild(item);
  });
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const words = await parseDocument(file);
    if (words.length === 0) {
      throw new Error('No words found in document');
    }
    const doc = {
      id: generateId(),
      filepath: '', // TODO: copy to internal
      filename: file.name,
      format: file.name.endsWith('.epub') ? 'epub' : 'txt',
      words: words,
      lastReadPosition: 0,
      totalWords: words.length,
      addedAt: Date.now(),
      lastAccessedAt: Date.now()
    };
    await db.setItem(doc.id, doc);
    documents.push(doc);
    renderLibrary();
    fileInput.value = ''; // Reset input
  } catch (error) {
    console.error('Error importing document:', error);
    // Optionally show a message to user, but for now just log
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

function parseDocumentFromContent(content, format) {
  if (format === 'epub') {
    return parseEPUB(content);
  } else {
    return parseTXT(content);
  }
}

function parseTXT(text) {
  return text.split(/\s+/).filter(word => word.length > 0);
}

async function parseEPUB(content) {
  // TODO: Implement EPUB parsing with epubjs
  // For now, return empty
  return [];
}

function renderNormalReading() {
  const textContainer = document.getElementById('text-container');
  textContainer.innerHTML = '';
  
  // Calculate render window
  const halfWindow = Math.floor(RENDER_WINDOW_SIZE / 2);
  renderedStartIndex = Math.max(0, readingState.currentWordIndex - halfWindow);
  renderedEndIndex = Math.min(readingState.words.length, renderedStartIndex + RENDER_WINDOW_SIZE);
  
  // Adjust if at end
  if (renderedEndIndex - renderedStartIndex < RENDER_WINDOW_SIZE && renderedStartIndex > 0) {
    renderedStartIndex = Math.max(0, renderedEndIndex - RENDER_WINDOW_SIZE);
  }
  
  for (let index = renderedStartIndex; index < renderedEndIndex; index++) {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = readingState.words[index] + ' ';
    span.addEventListener('click', () => setCurrentWord(index));
    textContainer.appendChild(span);
  }
  
  updateHighlight();
  updateProgress();
}

function setCurrentWord(index) {
  readingState.currentWordIndex = index;
  
  // Check if we need to re-render the window
  if (index < renderedStartIndex || index >= renderedEndIndex) {
    renderNormalReading();
  } else {
    updateHighlight();
    updateProgress();
  }
}

function updateHighlight() {
  const words = document.querySelectorAll('.word');
  const localIndex = readingState.currentWordIndex - renderedStartIndex;
  words.forEach((word, index) => {
    word.classList.toggle('highlighted', index === localIndex);
  });
  // Scroll to highlighted word
  const highlighted = document.querySelector('.word.highlighted');
  if (highlighted) {
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function updateProgress() {
  const progress = Math.round((readingState.currentWordIndex / readingState.words.length) * 100);
  document.getElementById('progress').textContent = `${progress}% • Word ${readingState.currentWordIndex + 1}/${readingState.words.length}`;
}

function renderSpeedReading() {
  updateWordDisplay();
  updateProgressSpeed();
  updateSpeedDisplay();
}

function updateWordDisplay() {
  const word = readingState.words[readingState.currentWordIndex] || '';
  const display = document.getElementById('word-display');
  // Add ORP styling: red letter at center
  const orpIndex = Math.min(2, word.length - 1);
  const before = word.substring(0, orpIndex);
  const red = word[orpIndex] || '';
  const after = word.substring(orpIndex + 1);
  display.innerHTML = `<span class="before">${before}</span><span class="red">${red}</span><span class="after">${after}</span>`;
}

function updateProgressSpeed() {
  const progress = Math.round((readingState.currentWordIndex / readingState.words.length) * 100);
  document.getElementById('progress-speed').textContent = `${progress}% • Word ${readingState.currentWordIndex + 1}/${readingState.words.length}`;
}

function updateSpeedDisplay() {
  document.getElementById('current-wpm').textContent = `Current: ${readingState.speedWPM} WPM`;
  document.getElementById('speed-slider').value = readingState.speedWPM;
}

function togglePlayPause() {
  readingState.isPlaying = !readingState.isPlaying;
  document.getElementById('play-pause-btn').textContent = readingState.isPlaying ? '‖' : '▶';
  if (readingState.isPlaying) {
    if (readingState.autoPaceEnabled) {
      readingState.autoPaceStartWordIndex = readingState.currentWordIndex;
      readingState.autoPaceStartWPM = 120; // Fixed starting speed
      readingState.targetSpeedWPM = readingState.speedWPM;
    }
    startPlayback();
  } else {
    stopPlayback();
  }
}

let playbackInterval;

function startPlayback() {
  const delay = calculateDelay();
  playbackInterval = setInterval(() => {
    readingState.currentWordIndex++;
    if (readingState.currentWordIndex >= readingState.words.length) {
      readingState.currentWordIndex = readingState.words.length - 1;
      togglePlayPause();
    } else {
      updateWordDisplay();
      updateProgressSpeed();
      updateSpeedDisplay();
      if (readingState.autoPaceEnabled) {
        // Restart with new delay
        stopPlayback();
        startPlayback();
      }
    }
  }, delay);
}

function calculateDelay() {
  let wpm = readingState.speedWPM;
  if (readingState.autoPaceEnabled) {
    const progress = Math.min((readingState.currentWordIndex - readingState.autoPaceStartWordIndex) / readingState.autoPaceDurationWords, 1);
    wpm = readingState.autoPaceStartWPM + (readingState.targetSpeedWPM - readingState.autoPaceStartWPM) * progress;
  }
  return 60000 / wpm;
}

function stopPlayback() {
  clearInterval(playbackInterval);
}

function resetReading() {
  readingState.currentWordIndex = 0;
  updateWordDisplay();
  updateProgressSpeed();
}

function updateSpeed(event) {
  const newSpeed = parseInt(event.target.value);
  if (readingState.autoPaceEnabled && readingState.isPlaying) {
    // Calculate current WPM for smooth transition
    const progress = Math.min((readingState.currentWordIndex - readingState.autoPaceStartWordIndex) / readingState.autoPaceDurationWords, 1);
    const currentWpm = readingState.autoPaceStartWPM + (readingState.targetSpeedWPM - readingState.autoPaceStartWPM) * progress;
    readingState.autoPaceStartWPM = currentWpm;
    readingState.autoPaceStartWordIndex = readingState.currentWordIndex;
  }
  readingState.speedWPM = newSpeed;
  readingState.targetSpeedWPM = newSpeed;
  updateSpeedDisplay();
  if (readingState.isPlaying) {
    stopPlayback();
    startPlayback();
  }
}

function toggleAutoPace(event) {
  readingState.autoPaceEnabled = event.target.checked;
  if (readingState.autoPaceEnabled) {
    readingState.autoPaceStartWordIndex = readingState.currentWordIndex;
    readingState.autoPaceStartWPM = readingState.speedWPM;
    readingState.targetSpeedWPM = readingState.speedWPM;
  }
  if (readingState.isPlaying) {
    stopPlayback();
    startPlayback();
  }
}

function openDocument(doc) {
  currentDocument = doc;
  readingState.documentId = doc.id;
  readingState.currentWordIndex = doc.lastReadPosition;
  readingState.words = doc.words;
  doc.lastAccessedAt = Date.now();
  db.setItem(doc.id, doc); // Update access time
  switchView('normal');
  renderNormalReading();
}

function switchView(view) {
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
  content = content.replace(/([-\u2013\u2014,.!?;:])/g, ' $1 ');
  return content.split(/\s+/).filter(word => word.length > 0);
}

async function parseEPUB(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);

    // Parse container.xml
    const containerText = await zip.file('META-INF/container.xml').async('text');
    console.log('Container XML:', containerText.substring(0, 200));
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerText, 'text/xml');
    const rootfile = containerDoc.querySelector('rootfile').getAttribute('full-path');
    console.log('Rootfile:', rootfile);

    // Parse OPF
    const opfText = await zip.file(rootfile).async('text');
    console.log('OPF length:', opfText.length);
    const opfDoc = parser.parseFromString(opfText, 'text/xml');

    // Get base path for manifest hrefs
    const basePath = rootfile.includes('/') ? rootfile.substring(0, rootfile.lastIndexOf('/') + 1) : '';

    // Build manifest
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = basePath + item.getAttribute('href');
    });
    console.log('Manifest items:', Object.keys(manifest).length);

    // Get spine
    const spine = opfDoc.querySelectorAll('spine itemref');
    console.log('Spine items:', spine.length);

    let fullText = '';
    for (const itemref of spine) {
      const id = itemref.getAttribute('idref');
      const href = manifest[id];
      console.log('Processing spine item:', id, href);
      if (href && (href.endsWith('.html') || href.endsWith('.xhtml') || href.endsWith('.htm'))) {
        try {
          const htmlText = await zip.file(href).async('text');
          console.log('HTML length for', href, ':', htmlText.length);
          const htmlDoc = parser.parseFromString(htmlText, 'text/html');
          const text = htmlDoc.body ? htmlDoc.body.textContent : '';
          console.log('Text length:', text.length);
          fullText += text + ' ';
        } catch (e) {
          console.log('Error processing', href, ':', e);
        }
      }
    }

    console.log('Total fullText length:', fullText.length);
    const words = fullText.split(/\s+/).filter(word => word.length > 0);
    console.log('Words count:', words.length);
    return words;
  } catch (error) {
    console.error('EPUB parsing error:', error);
    return ['EPUB', 'parsing', 'failed'];
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

function setupLifecycleListeners() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        saveReadingState();
      }
    });
  }
}

async function saveReadingState() {
  if (currentDocument && readingState.documentId) {
    currentDocument.lastReadPosition = readingState.currentWordIndex;
    currentDocument.lastAccessedAt = Date.now();
    await db.setItem(readingState.documentId, currentDocument);
    // Update progress in library view
    const item = document.querySelector(`[data-doc-id="${readingState.documentId}"]`);
    if (item) {
      const progress = Math.round((currentDocument.lastReadPosition / currentDocument.totalWords) * 100);
      const progressText = `${progress}% • ${currentDocument.lastReadPosition}/${currentDocument.totalWords} words`;
      item.children[1].textContent = progressText;
    }
  }
}