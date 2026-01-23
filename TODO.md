# TODO: Stability Reads App Fixes

This file documents identified errors, security vulnerabilities, performance issues, and suggested fixes for the Stability Reads Capacitor Android app.

## UI Improvements

## Errors and Bugs

- [ ] **Capacitor Filesystem Directory enum access** ([main.js:462](www/main.js#L462))
  `window.Capacitor.Plugins.Filesystem.Directory.Data` may not be the correct way to access the Directory enum in Capacitor 6. Should use the imported enum from @capacitor/filesystem.
  *Fix*: Import `Directory` from `@capacitor/filesystem` and use `Directory.Data`.

## Security Vulnerabilities

- [ ] **No file size validation on import** ([main.js:422](www/main.js#L422))
  Files are read entirely into memory without checking their size. A maliciously large file (multi-GB EPUB) could cause memory exhaustion or app crash.
  *Fix*: Add a file size check (e.g., reject files over 50MB) before reading.

- [ ] **Debug console.log statements expose file content** ([main.js:776](www/main.js#L776), [784](www/main.js#L784), [791](www/main.js#L791), [803](www/main.js#L803), [807](www/main.js#L807), [821](www/main.js#L821), [831](www/main.js#L831), [836](www/main.js#L836), [878-879](www/main.js#L878), [885](www/main.js#L885))
  Multiple `console.log` statements output EPUB content during parsing. This could expose document content in production logs or debugging tools.
  *Fix*: Remove or wrap in a debug flag that's disabled in production builds.

## Performance Issues

- [ ] **Memory usage for large documents**
  Entire word arrays are stored in memory (`readingState.words` and `doc.words`). For long books (e.g., 100k+ words), this consumes significant RAM, potentially causing crashes on memory-constrained devices.
  *Fix*: Implement lazy loading or pagination for words—only load chunks around the current position. Store parsed words in IndexedDB instead of memory.

- [ ] **Auto-pace restarts interval on every word** ([main.js:654-658](www/main.js#L654-L658))
  During auto-pace playback, `stopPlayback()` and `startPlayback()` are called on every single word to recalculate the delay. This is inefficient—creating and clearing intervals rapidly.
  *Fix*: Use `setTimeout` chaining instead of `setInterval`, or calculate the next delay without recreating the interval.

- [ ] **No debounce/throttle on swipe navigation** ([main.js:256](www/main.js#L256), [290](www/main.js#L290))
  Swipe gesture handlers immediately trigger page/word navigation. Rapid swipes can queue up many navigation calls and re-renders.
  *Fix*: Add throttling to prevent more than one navigation per ~100ms.

- [ ] **wordsPerPage recalculated on every render** ([main.js:496](www/main.js#L496))
  `calculateWordsPerPage()` is called every time `renderNormalReading()` runs. This should only change on window resize or font size change.
  *Fix*: Cache the value and only recalculate on resize events or font size changes.

## Code Quality / Maintainability

- [ ] **Single 999-line file with global state** ([main.js](www/main.js))
  All application logic is in one file with module-level global variables. This makes the code harder to test, reason about, and maintain.
  *Fix*: Refactor into modules (e.g., `storage.js`, `epub-parser.js`, `txt-parser.js`, `reading-state.js`, `views/library.js`, `views/normal.js`, `views/speed.js`).

- [ ] **Magic numbers throughout the codebase**
  Hard-coded values like `50` (swipe threshold), `100` (auto-pace duration), `12`/`32` (font size limits), `24`/`72` (speed font limits), `150` (debounce delay), `120`/`900` (WPM range).
  *Fix*: Extract to named constants at the top of the file or in a config module.

- [ ] **Unused `epubjs` dependency** ([package.json:15](package.json#L15))
  The `epubjs` package is listed as a dependency but never imported or used—the app implements its own EPUB parser with JSZip.
  *Fix*: Remove from package.json to reduce bundle size.

- [ ] **Event listeners not cleaned up in renderLibrary** ([main.js:409-417](www/main.js#L409-L417))
  Each call to `renderLibrary()` adds click event listeners to document items. When the list is re-rendered, old DOM elements are removed but if any references were kept, listeners could leak.
  *Fix*: Use event delegation on the parent `documentList` element instead of individual listeners.

- [ ] **innerHTML used where textContent would suffice** ([main.js:493](www/main.js#L493), [961](www/main.js#L961))
  `textContainer.innerHTML = ''` and `tocList.innerHTML = ''` are used to clear content. While safe for clearing, `textContent = ''` is marginally faster and makes intent clearer.
  *Fix*: Replace with `textContent = ''` for clearing operations.

- [ ] **Debug console.log statements throughout** ([main.js](www/main.js))
  Multiple `console.log` calls used for debugging should be removed for production.
  *Fix*: Remove all debug logging or use a logging utility that can be disabled.

## Additional Recommendations

- [ ] **Testing and Validation**: Test on various Android devices for performance. Add unit tests for parsing functions using a framework like Jest.
- [ ] **Build and Deployment**: Ensure APK signing and testing before release. Update `package.json` with proper build scripts if bundling is added.
- [ ] **Add window resize handler**: Recalculate `wordsPerPage` when screen orientation or window size changes.
- [ ] **Consider TypeScript**: Adding TypeScript would catch many of these bugs at compile time (e.g., the missing await, operator precedence issues).
