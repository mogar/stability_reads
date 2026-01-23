# TODO: Stability Reads App Fixes

This file documents identified errors, security vulnerabilities, performance issues, and suggested fixes for the Stability Reads Capacitor Android app.

## UI Improvements

## Errors and Bugs

## Security Vulnerabilities

- [x] **CDN script loading over HTTP (potential MITM)**
  Scripts for JSZip, epubjs, and localforage are loaded from `https://cdn.jsdelivr.net`, which is secure, but if the CDN is compromised, it could inject malicious code.
  *Fix*: Bundle dependencies locally using a bundler like Webpack or Vite to avoid external loading. Update `package.json` scripts and build process accordingly.
  *Done*: Set up Vite bundler. Dependencies are now imported as ES modules and bundled locally. Build outputs to `dist/` for Capacitor.

## Performance Issues

- [ ] **Memory usage for large documents**  
  Entire word arrays are stored in memory (`readingState.words` and `doc.words`). For long books (e.g., 100k+ words), this consumes significant RAM, potentially causing crashes on memory-constrained devices.  
  *Fix*: Implement lazy loading or pagination for words—only load chunks around the current position. Store parsed words in IndexedDB instead of memory.

## Additional Recommendations

- [ ] **Testing and Validation**: Test on various Android devices for performance. Add unit tests for parsing functions using a framework like Jest.
- [ ] **Build and Deployment**: Ensure APK signing and testing before release. Update `package.json` with proper build scripts if bundling is added.
- [ ] **Dependencies**: Audit for vulnerabilities using `npm audit`. Consider updating to latest versions of Capacitor and libraries.