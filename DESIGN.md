# Product Design Document: SpeedRead Android App

## Overview
Local-first Android speed reading app using RSVP (Rapid Serial Visual Presentation) technique. Built with Capacitor to leverage existing web-based speed reading UI patterns.

The reference project for this is [Focus Reader](https://github.com/mstrawberryman-ui/focus-reader-), which has many (but not all) desired features and doesn't run as an Android app.

## Technology Stack
- **Framework**: Capacitor (web tech deployed as native Android)
- **UI**: HTML/CSS/JavaScript (can reuse focus-reader- patterns)
- **Storage**: LocalStorage/IndexedDB for document metadata
- **File Access**: @capacitor/filesystem plugin
- **EPUB Parsing**: epub.js or similar JavaScript library
- **Build**: Capacitor CLI + Android Studio for final packaging

## Core Features

### 1. Library Activity
- Display list of documents from device storage
- Support file formats: TXT, EPUB
- Show reading progress per document (percentage complete, last position)
- Allow user to select document to open in reading mode
- Basic file management: delete from library (not from filesystem)
- Manual document import via file picker

### 2. Normal Reading Activity
- Standard ereader display with scrollable text
- Current word highlighting: word at currentWordIndex highlighted with distinct background color
- User can tap any word to set new reading position
- Bottom navigation: back to library, switch to speed mode
- Display current position (percentage)
- Font size adjustment (+/- buttons)
- Night mode toggle

### 3. Speed Reading Activity  
- RSVP display: single word at a time, center-aligned
- Red letter focus point on optimal recognition point (ORP) - typically 1/3 into the word
- Speed control slider (120-900 WPM)
- Auto-pace feature: linear ramp from starting speed to target speed over configurable duration
- Playback controls: play/pause, reset
- Keyboard shortcuts (for testing on desktop):
  - Space: play/pause
  - Arrow left/right: previous/next word
  - R: reset to beginning
- Touch controls: tap to play/pause, swipe left/right for prev/next word
- Bottom navigation: back to library, switch to normal mode
- Display progress indicator (percentage)
- Display current WPM

## Out of Scope (Future Features)
- PDF support
- Bookmarks/annotations/highlights
- Word length-based speed adjustment
- OCR functionality
- Cloud sync

## Data Model

```javascript
// Stored in IndexedDB
Document {
  id: string,              // UUID
  filepath: string,        // Capacitor filesystem URI
  filename: string,
  format: 'txt' | 'epub',
  lastReadPosition: number, // word index
  totalWords: number,
  addedAt: timestamp,
  lastAccessedAt: timestamp
}

// Stored in memory (persisted to Document on exit)
ReadingState {
  documentId: string,
  currentWordIndex: number,
  words: string[],         // parsed words from document
  isPlaying: boolean,
  speedWPM: number,
  targetSpeedWPM: number,
  autoPaceEnabled: boolean,
  autoPaceStartWPM: number,
  autoPaceDurationWords: number
}
```

## State Synchronization
- Normal and speed reading views share ReadingState via global state manager
- When switching views, preserve currentWordIndex
- In normal reading, scroll to ensure word at currentWordIndex is visible and highlighted
- In speed reading, display word at currentWordIndex
- User interaction in either mode updates shared currentWordIndex
- On pause/exit, persist currentWordIndex to Document.lastReadPosition

## Document Parsing

### TXT Files
- Read entire file as UTF-8 text
- Tokenize on whitespace: `text.split(/\s+/)`
- Filter empty strings
- Store as words array

### EPUB Files
- Use epub.js library
- Extract text from all spine items in reading order
- Concatenate and tokenize similar to TXT
- Note: Ignore images, formatting for v1

### Rendering
- Normal reading: continuous scroll, no pagination (unless performance issues arise with >100k words)
- Speed reading: single word display with character-level styling for ORP

## UI/UX Details

### Library View
```
┌─────────────────────────┐
│  My Documents      [+]  │
├─────────────────────────┤
│ The Art of War          │
│ 45% • 2,341/5,203 words │
├─────────────────────────┤
│ Dune                    │
│ 12% • 1,234/10,456 words│
├─────────────────────────┤
│ [Empty state message]   │
└─────────────────────────┘
```

### Normal Reading View
```
┌─────────────────────────┐
│ ←  [︙] 🌙 A+ A-         │
├─────────────────────────┤
│                         │
│ The quick brown fox     │
│ jumped over the lazy    │
│ ██dog██. It was a       │  ← highlighted word
│ beautiful day.          │
│                         │
│ 23% • Word 234/1,000    │
├─────────────────────────┤
│ [Library] [Speed Read]  │
└─────────────────────────┘
```

### Speed Reading View
```
┌─────────────────────────┐
│ ←  [Reset]              │
├─────────────────────────┤
│                         │
│                         │
│       j█mped            │  ← red letter
│                         │
│                         │
│ ────────────────        │  ← speed slider
│ 120          900 WPM    │
│ Current: 340 WPM        │
│ [Auto-Pace: ON]         │
│                         │
│ 23% • Word 234/1,000    │
├─────────────────────────┤
│ [▶/‖] [Library] [Normal]│
└─────────────────────────┘
```

## Implementation Plan

### Phase 1: Project Setup
1. Initialize Capacitor project
   - `npm init @capacitor/app`
   - Configure for Android target
   - Set up project structure: `/src`, `/www`, `/android`
2. Install dependencies
   - `@capacitor/filesystem` - file access
   - `@capacitor/app` - app lifecycle
   - `epub.js` - EPUB parsing
   - `localforage` - IndexedDB wrapper
3. Set up build pipeline
   - Configure Vite/Webpack for bundling
   - Set up Android build in Android Studio
4. Create basic routing/navigation structure
   - Single-page app with view switcher
   - Three main views: Library, Normal, Speed

### Phase 2: Document Management
1. Implement Document database
   - Create IndexedDB schema with localforage
   - CRUD operations for Document objects
2. Build Library view
   - List all documents from database
   - Display progress stats
   - Empty state with import prompt
3. Implement file import
   - Capacitor file picker integration
   - Copy selected file to app's internal storage
   - Parse and create Document record
4. Implement TXT parser
   - Read file with Filesystem plugin
   - Tokenize into words array
   - Store word count

### Phase 3: Normal Reading Mode
1. Build reading view layout
   - Scrollable text container
   - Bottom toolbar with controls
   - Top toolbar with settings
2. Implement text rendering
   - Load words array into DOM
   - Apply current word highlighting
   - Ensure highlighted word is in viewport
3. Implement word selection
   - Click/tap handler on words
   - Update currentWordIndex
   - Persist position on exit
4. Add controls
   - Font size adjustment
   - Night mode toggle
   - Back to library navigation

### Phase 4: Speed Reading Mode
1. Build RSVP display
   - Center-aligned word container
   - Character-level styling for ORP (red letter)
   - Large, readable font
2. Implement playback engine
   - Timer-based word advancement
   - Calculate delay from WPM: `delay = 60000 / WPM`
   - Handle play/pause state
3. Add controls
   - Play/pause button
   - Speed slider (120-900 WPM)
   - Manual word stepping (prev/next)
   - Reset button
4. Implement keyboard shortcuts
   - Space, arrow keys, R key handlers
   - Touch gestures for mobile

### Phase 5: Auto-Pace Feature
1. Implement linear ramp algorithm
   ```javascript
   currentWPM = startWPM + 
     (targetWPM - startWPM) * 
     (wordsRead / autoPaceDurationWords)
   ```
2. Add auto-pace toggle and configuration
   - Enable/disable switch
   - Starting WPM input
   - Ramp duration (in words or percentage)
3. Update playback engine to use ramped speed

### Phase 6: Cross-Mode State Management
1. Create global state manager
   - ReadingState object
   - Subscribers for view updates
2. Implement view switching
   - Preserve currentWordIndex
   - Update UI appropriately for each mode
3. Sync reading position
   - Normal mode: scroll and highlight
   - Speed mode: display current word
   - Both modes update shared state

### Phase 7: EPUB Support
1. Integrate epub.js library
2. Implement EPUB parser
   - Extract text from spine items
   - Maintain reading order
   - Tokenize into words
3. Test with sample EPUB files
4. Handle edge cases (images, complex formatting)

### Phase 8: Polish & Testing
1. Add loading states
   - File import progress
   - Document parsing progress
2. Error handling
   - Invalid file formats
   - Corrupted files
   - Storage errors
3. Performance optimization
   - Test with 100k+ word documents
   - Implement pagination if needed
   - Optimize rendering
4. Android-specific testing
   - Different screen sizes
   - Back button behavior
   - App lifecycle (pause/resume)
5. Build final APK
   - Configure signing
   - Optimize bundle size
   - Test installation

### Phase 9: Documentation
1. User guide (in-app help)
2. README with build instructions
3. Developer notes for future features

## Testing Considerations
- Test with various document sizes: 1k, 10k, 100k, 500k words
- Test EPUB files with different structures
- Test reading position persistence across app restarts
- Test auto-pace with different parameters
- Test on physical Android devices (various screen sizes)

## Performance Notes
- For documents >100k words, monitor:
  - Memory usage during parsing
  - Rendering performance in normal mode
  - State update performance when switching modes
- If issues arise, implement pagination in normal reading mode
- Consider lazy loading for very large documents

## File Storage Strategy
- Imported documents stored in app's internal storage
- Path: `Capacitor.convertFileSrc()`
- Documents remain accessible offline
- User can delete from library (removes from DB, keeps file)
