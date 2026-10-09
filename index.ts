import { registerRootComponent } from 'expo';
import 'react-native/Libraries/Core/InitializeCore';
// SDK v7 needs reason/timeout/any/throwIfAborted. Patch AbortSignal only; retain Expo fetch.
import 'abortcontroller-polyfill/dist/abortsignal-polyfill-only';

import App from './App';
import { registerDatabaseProbe } from './src/development/registerDatabaseProbe';

registerDatabaseProbe();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
