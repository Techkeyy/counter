// Bootstrap entry: establish the Buffer global BEFORE any application module
// evaluates. Static ES imports are hoisted and evaluate before subsequent
// statements, so every other import must go through require() below.
// (Physical cold-launch crash 2026-09-30: @solana/spl-token-metadata
// lib/cjs/state.js:8 executes bare global `Buffer.from(...)` at module
// scope; Hermes provides no Node Buffer global. Chain: ArenaScreen ->
// BackModal -> @solana/spl-token -> ... -> spl-token-metadata/state.js.)
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

require('react-native-get-random-values');
require('react-native-url-polyfill/auto');

const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);
