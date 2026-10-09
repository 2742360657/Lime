import 'react-native/Libraries/Core/InitializeCore';
import 'abortcontroller-polyfill/dist/abortsignal-polyfill-only';

// RN 0.83 ships the WebIDL implementation but doesn't install it globally.
// Reuse it instead of implementing DOMException or loading a second fetch stack.
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = require('react-native/src/private/webapis/errors/DOMException').default;
}
