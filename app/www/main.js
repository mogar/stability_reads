import { Filesystem } from '@capacitor/filesystem';
import localforage from 'localforage';
import ePub from 'epubjs';

// Initialize localforage
const db = localforage.createInstance({
  name: 'StabilityReads',
  storeName: 'documents'
});

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
  importBtn.addEventListener('click', () => fileInput.click());
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
    const content = await readFile(file);
    const words = await parseDocument(file, content);
    const doc = {
      id: generateId(),
      filepath: '', // TODO: copy to internal
      filename: file.name,
      format: file.name.endsWith('.epub') ? 'epub' : 'txt',
      content: content, // Store content for web
      lastReadPosition: 0,
      totalWords: words.length,
      addedAt: Date.now(),
      lastAccessedAt: Date.now()
    };
    await db.setItem(doc.id, doc);
    documents.push(doc);
    renderLibrary();
  } catch (error) {
    console.error('Error importing document:', error);
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
  // Add ORP styling
  const orpIndex = Math.floor(word.length / 3);
  display.innerHTML = word.substring(0, orpIndex) + '<span style="color:red">' + word[orpIndex] + '</span>' + word.substring(orpIndex + 1);
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
  readingState.words = parseDocumentFromContent(doc.content, doc.format);
  switchView('normal');
  renderNormalReading();
}

function switchView(view) {
  currentView = view;
  libraryView.classList.toggle('hidden', view !== 'library');
  normalView.classList.toggle('hidden', view !== 'normal');
  speedView.classList.toggle('hidden', view !== 'speed');
}

// Start the app
init();