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
import 'react-native/Libraries/Core/setUpXHR';
