// Ensure React Native's network polyfills (FormData, fetch, File, Blob, etc.)
// are initialised before expo/src/winter/runtime.native.ts runs.
//
// expo/Expo.fx.tsx → winter/index.ts → runtime.native.ts calls
// `installFormDataPatch(FormData)` at the top-level of that module.
// In React Native 0.81 the lazy-global setup in setUpXHR.js may not have
// executed yet by the time Metro evaluates the first `import 'expo'` line,
// causing: ReferenceError: Property 'FormData' doesn't exist
//
// Importing this file as the very first import in index.ts guarantees that
// polyfillGlobal('FormData', …) runs before Expo's winter runtime is loaded.
//
// The `.js` extension is required: with `unstable_enablePackageExports`
// enabled, Metro resolves this deep import against React Native's `exports`
// map. The extensionless specifier resolves locally but fails in the EAS
// build environment ("Unable to resolve module
// react-native/Libraries/Core/setUpXHR"). The explicit `.js` matches RN's
// `"./*.js"` export entry and resolves consistently in both environments.
import 'react-native/Libraries/Core/setUpXHR.js';
