import 'react-native/Libraries/Core/InitializeCore';

// RN 0.83 ships the WebIDL implementation but doesn't install it globally.
// Reuse it instead of implementing DOMException or loading a second fetch stack.
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = require('react-native/src/private/webapis/errors/DOMException').default;
}
// The signal-only patch dispatches twice on RN's old AbortController, consuming
// once listeners before their callback. Use the package's complete ponyfill.
if (typeof AbortSignal.any !== 'function' || typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  const polyfill = require('abortcontroller-polyfill/dist/cjs-ponyfill');
  globalThis.AbortController = polyfill.AbortController;
  globalThis.AbortSignal = polyfill.AbortSignal;
}
