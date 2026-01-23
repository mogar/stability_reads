# TODO: Stability Reads App Fixes

This file documents identified errors, security vulnerabilities, performance issues, and suggested fixes for the Stability Reads Capacitor Android app.

## UI Improvements

## Errors and Bugs

- [ ] **Capacitor Filesystem Directory enum access** ([main.js:462](www/main.js#L462))
  `window.Capacitor.Plugins.Filesystem.Directory.Data` may not be the correct way to access the Directory enum in Capacitor 6. Should use the imported enum from @capacitor/filesystem.
  *Fix*: Import `Directory` from `@capacitor/filesystem` and use `Directory.Data`.

## Security Vulnerabilities


## Performance Issues

- [ ] **Memory usage for large documents**
  Entire word arrays are stored in memory (`readingState.words` and `doc.words`). For long books (e.g., 100k+ words), this consumes significant RAM, potentially causing crashes on memory-constrained devices.
  *Fix*: Implement lazy loading or pagination for words—only load chunks around the current position. Store parsed words in IndexedDB instead of memory.

## Code Quality / Maintainability

- [ ] **Single 999-line file with global state** ([main.js](www/main.js))
  All application logic is in one file with module-level global variables. This makes the code harder to test, reason about, and maintain.
  *Fix*: Refactor into modules (e.g., `storage.js`, `epub-parser.js`, `txt-parser.js`, `reading-state.js`, `views/library.js`, `views/normal.js`, `views/speed.js`).

- [ ] **Debug console.log statements throughout** ([main.js](www/main.js))
  Multiple `console.log` calls used for debugging should be removed for production.
  *Fix*: Remove all debug logging or use a logging utility that can be disabled.

## Additional Recommendations

- [ ] **Testing and Validation**: Test on various Android devices for performance. Add unit tests for parsing functions using a framework like Jest.
- [ ] **Build and Deployment**: Ensure APK signing and testing before release. Update `package.json` with proper build scripts if bundling is added.
- [ ] **Consider TypeScript**: Adding TypeScript would catch many of these bugs at compile time (e.g., the missing await, operator precedence issues).
