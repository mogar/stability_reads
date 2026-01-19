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
  autoPaceDurationWords: 100
};

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
  await loadDocuments();
  renderLibrary();
  setupEventListeners();
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
  document.getElementById('back-to-library').addEventListener('click', () => switchView('library'));
  document.getElementById('to-library').addEventListener('click', () => switchView('library'));
  document.getElementById('to-speed').addEventListener('click', () => {
    switchView('speed');
    renderSpeedReading();
  });

  // Speed view
  document.getElementById('back-to-library-speed').addEventListener('click', () => switchView('library'));
  document.getElementById('to-library-speed').addEventListener('click', () => switchView('library'));
  document.getElementById('to-normal').addEventListener('click', () => {
    switchView('normal');
    renderNormalReading();
  });
  document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
  document.getElementById('reset-btn').addEventListener('click', resetReading);
  document.getElementById('speed-slider').addEventListener('input', updateSpeed);
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
    item.innerHTML = `
      <div>${doc.filename}</div>
      <div>${Math.round((doc.lastReadPosition / doc.totalWords) * 100)}% • ${doc.lastReadPosition}/${doc.totalWords} words</div>
    `;
    item.addEventListener('click', () => openDocument(doc));
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
  readingState.words.forEach((word, index) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word + ' ';
    span.addEventListener('click', () => setCurrentWord(index));
    textContainer.appendChild(span);
  });
  updateHighlight();
  updateProgress();
}

function setCurrentWord(index) {
  readingState.currentWordIndex = index;
  updateHighlight();
  updateProgress();
}

function updateHighlight() {
  const words = document.querySelectorAll('.word');
  words.forEach((word, index) => {
    word.classList.toggle('highlighted', index === readingState.currentWordIndex);
  });
  // Scroll to highlighted word
  const highlighted = document.querySelector('.word.highlighted');
  if (highlighted) {
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
    startPlayback();
  } else {
    stopPlayback();
  }
}

let playbackInterval;

function startPlayback() {
  const delay = 60000 / readingState.speedWPM;
  playbackInterval = setInterval(() => {
    readingState.currentWordIndex++;
    if (readingState.currentWordIndex >= readingState.words.length) {
      readingState.currentWordIndex = readingState.words.length - 1;
      togglePlayPause();
    } else {
      updateWordDisplay();
      updateProgressSpeed();
    }
  }, delay);
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
  readingState.speedWPM = parseInt(event.target.value);
  updateSpeedDisplay();
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
  return content.split(/\s+/).filter(word => word.length > 0);
}

async function parseEPUB(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);

    // Parse container.xml
    const containerText = await zip.file('META-INF/container.xml').async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerText, 'text/xml');
    const rootfile = containerDoc.querySelector('rootfile').getAttribute('full-path');

    // Parse OPF
    const opfText = await zip.file(rootfile).async('text');
    const opfDoc = parser.parseFromString(opfText, 'text/xml');

    // Build manifest
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // Get spine
    const spine = opfDoc.querySelectorAll('spine itemref');

    let fullText = '';
    for (const itemref of spine) {
      const id = itemref.getAttribute('idref');
      const href = manifest[id];
      if (href && (href.endsWith('.html') || href.endsWith('.xhtml'))) {
        try {
          const htmlText = await zip.file(href).async('text');
          const htmlDoc = parser.parseFromString(htmlText, 'text/html');
          const text = htmlDoc.body ? htmlDoc.body.textContent : '';
          fullText += text + ' ';
        } catch (e) {
          // Skip
        }
      }
    }

    return fullText.split(/\s+/).filter(word => word.length > 0);
  } catch (error) {
    console.error('EPUB parsing error:', error);
    return ['EPUB', 'parsing', 'failed'];
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Start the app
init();