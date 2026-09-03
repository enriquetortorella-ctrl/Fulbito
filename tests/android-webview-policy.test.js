const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const activity = fs.readFileSync(
  path.join(root, 'android-app', 'app', 'src', 'main', 'java', 'ar', 'com', 'fulbito', 'app', 'MainActivity.java'),
  'utf8'
);
const manifest = fs.readFileSync(
  path.join(root, 'android-app', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8'
);

test('the Android WebView only keeps the published app origin and path internally', () => {
  assert.match(activity, /"https"\.equalsIgnoreCase\(uri\.getScheme\(\)\)/);
  assert.match(activity, /APP_HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(activity, /port != -1 && port != 443/);
  assert.match(activity, /APP_PATH\.equals\(path\).*path\.startsWith\(APP_PATH \+ "\/"\)/s);
});

test('external map links require a user gesture and leave the WebView through ACTION_VIEW', () => {
  assert.match(activity, /request\.isForMainFrame\(\) && request\.hasGesture\(\) && canOpenExternally/);
  assert.match(activity, /new Intent\(Intent\.ACTION_VIEW, uri\)/);
  assert.match(activity, /Intent\.CATEGORY_BROWSABLE/);
  assert.match(activity, /ActivityNotFoundException \| SecurityException/);
  assert.match(activity, /"geo"\.equalsIgnoreCase\(scheme\)/);
});

test('the Android container forbids cleartext traffic and local file/content access', () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(activity, /settings\.setAllowFileAccess\(false\)/);
  assert.match(activity, /settings\.setAllowContentAccess\(false\)/);
  assert.match(activity, /WebSettings\.MIXED_CONTENT_NEVER_ALLOW/);
});
