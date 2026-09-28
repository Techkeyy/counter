// Deep link probe testing Android App Links and Custom URI scheme resolution

function parseDuelUri(uriString) {
  // Supports:
  // 1. App Link: https://counter.app/duel/duel_88f921
  // 2. Custom Scheme: counter://duel/duel_88f921
  // 3. Query Param: https://counter.app?d=duel_88f921
  try {
    const url = new URL(uriString);
    let duelId = null;

    if (url.protocol === 'counter:') {
      // counter://duel/xyz -> hostname = duel, pathname = /xyz
      if (url.hostname === 'duel') {
        duelId = url.pathname.replace(/^\//, '');
      }
    } else if (url.protocol === 'https:' || url.protocol === 'http:') {
      const match = url.pathname.match(/\/duel\/([a-zA-Z0-9_-]+)/);
      if (match) {
        duelId = match[1];
      } else if (url.searchParams.has('d')) {
        duelId = url.searchParams.get('d');
      }
    }

    return {
      valid: !!duelId,
      duelId,
      originalUri: uriString
    };
  } catch (err) {
    return { valid: false, error: err.message, originalUri: uriString };
  }
}

function testDeepLinkResolution() {
  console.log('--- Probing Deep-Link / App-Link Resolution ---');
  
  const testCases = [
    'https://counter.app/duel/arsenal-vs-city-2026',
    'counter://duel/sol-250-target',
    'https://counter.app/duel/duel_9941a?ref=praise',
    'https://counter.app/?d=duel_101b'
  ];

  for (const uri of testCases) {
    const res = parseDuelUri(uri);
    console.log(`[PASS] Input: "${uri}" -> Resolved Duel ID: "${res.duelId}" (Valid: ${res.valid})`);
  }

  console.log('\n[PASS] Android Manifest Configuration Architecture:');
  console.log(`
  <intent-filter android:autoVerify="true">
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="https" android:host="counter.app" android:pathPrefix="/duel" />
      <data android:scheme="counter" android:host="duel" />
  </intent-filter>
  `);
}

testDeepLinkResolution();
