# TODO: Stability Reads App Fixes

This file documents identified errors, security vulnerabilities, performance issues, and suggested fixes for the Stability Reads Capacitor Android app.

## UI Improvements

## Errors and Bugs

- [ ] **Table of Contents navigation error**
  When a new chapter is selected from the Table of Contents modal. The normal reading view doesn't go to the correct page.

## Security Vulnerabilities

- [ ] **Potential XSS via file content in speed reading display**  
  Although files are treated as plain text, if a malicious TXT file contains HTML-like content, and if future changes allow HTML rendering, it could lead to XSS. Currently, `innerHTML` is used safely for controlled word display, but file content is not sanitized.  
  *Fix*: Sanitize file content on import using a library like DOMPurify (add as dependency) or ensure all text rendering uses `textContent` instead of `innerHTML`.

- [x] **No file type validation beyond extension**  
  File input accepts `.txt,.epub`, but doesn't validate MIME types or content. A renamed malicious file could be processed.  
  *Fix*: Check `file.type` (e.g., 'text/plain' for TXT) before processing, and reject invalid types.

- [ ] **CDN script loading over HTTP (potential MITM)**  
  Scripts for JSZip, epubjs, and localforage are loaded from `https://cdn.jsdelivr.net`, which is secure, but if the CDN is compromised, it could inject malicious code.  
  *Fix*: Bundle dependencies locally using a bundler like Webpack or Vite to avoid external loading. Update `package.json` scripts and build process accordingly.

## Performance Issues

- [ ] **DOM updates in speed reading may cause lag on low-end devices**  
  At high WPM (e.g., 900), the DOM is updated ~15 times/second via `innerHTML` and style changes. On slower Android devices, this could cause stuttering or dropped frames.  
  *Fix*: Optimize by batching updates, using `requestAnimationFrame`, or pre-rendering words into a buffer. Consider using Canvas for rendering instead of DOM manipulation.

- [ ] **Memory usage for large documents**  
  Entire word arrays are stored in memory (`readingState.words` and `doc.words`). For long books (e.g., 100k+ words), this consumes significant RAM, potentially causing crashes on memory-constrained devices.  
  *Fix*: Implement lazy loading or pagination for words—only load chunks around the current position. Store parsed words in IndexedDB instead of memory.

- [ ] **Inefficient virtual rendering in normal reading**  
  The render window (200 words) is recalculated on every word click, and DOM is rebuilt. For frequent clicks, this could be slow.  
  *Fix*: Cache rendered elements and update only changed parts. Use a virtual scroller library if needed.

- [ ] **No throttling on UI interactions**  
  Rapid clicks (e.g., font size buttons) trigger immediate updates without debouncing, potentially overwhelming the main thread.  
  *Fix*: Add debouncing (e.g., using Lodash or custom) to buttons like font size controls.

## Additional Recommendations

- [ ] **Testing and Validation**: Test on various Android devices for performance. Add unit tests for parsing functions using a framework like Jest.
- [ ] **Build and Deployment**: Ensure APK signing and testing before release. Update `package.json` with proper build scripts if bundling is added.
- [ ] **Accessibility**: Add ARIA labels to buttons and ensure keyboard navigation works (e.g., for speed controls).
- [ ] **Dependencies**: Audit for vulnerabilities using `npm audit`. Consider updating to latest versions of Capacitor and libraries.