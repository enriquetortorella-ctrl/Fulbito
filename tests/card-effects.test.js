const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/card-effects.js'), 'utf8');
const selector = '.fifa-card[role="button"]:not(.card-thumbnail):not(.is-historical)';
function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ callback, options });
    },
    dispatch(type, event = {}) {
      for (const { callback } of listeners.get(type) || []) callback(event);
    }
  };
}
function setup({ fine = true, reduced = false, legacyMedia = false, noAnimationFrame = false } = {}) {
  const document = Object.assign(eventTarget(), { hidden: false, documentElement: {} });
  const frames = new Map();
  let nextId = 0;
  let observer;
  const media = [fine, reduced].map(matches => {
    const target = Object.assign(eventTarget(), { matches });
    if (legacyMedia) {
      target.addListener = callback => target.listeners.set('change', [{ callback }]);
      target.addEventListener = undefined;
    }
    return target;
  });
  const window = Object.assign(eventTarget(), {
    matchMedia: query => query.includes('prefers-reduced-motion') ? media[1] : media[0],
    requestAnimationFrame: noAnimationFrame ? undefined : callback => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.observing = false; observer = this; }
      observe(root, options) { this.observing = true; this.root = root; this.options = options; }
      disconnect() { this.observing = false; }
    }
  });
  const sandbox = { document, window };
  vm.runInNewContext(source, sandbox);
  return {
    document, window, frames, media, sandbox,
    get observer() { return observer; },
    paint() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    },
    move(card, clientX = 160, clientY = 100, pointerType = 'mouse') {
      document.dispatch('pointermove', { target: card, clientX, clientY, pointerType });
    }
  };
}
function createCard({ historical = false, thumbnail = false, role = 'button', connected = true, width = 200, height = 300 } = {}) {
  const values = new Map();
  const classes = new Set(['fifa-card', ...(historical ? ['is-historical'] : []), ...(thumbnail ? ['card-thumbnail'] : [])]);
  const card = {
    role,
    isConnected: connected,
    rectReads: 0,
    style: { setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    matches(query) { assert.equal(query, selector); return this.role === 'button' && !classes.has('card-thumbnail') && !classes.has('is-historical'); },
    closest(query) { return this.matches(query) ? this : null; },
    contains(node) { return node === this || node?.parent === this; },
    getBoundingClientRect() { this.rectReads++; return { left: 10, top: 20, width, height }; },
    values
  };
  return card;
}
function assertReset(env, card) {
  assert.equal(card.classList.contains('is-card-tilting'), false);
  assert.equal(card.values.size, 0);
  assert.equal(env.frames.size, 0);
  assert.equal(env.observer.observing, false);
}

test('coalesces moves, caches geometry and clamps tilt and foil coordinates', () => {
  const env = setup();
  const card = createCard();
  for (let i = 0; i < 10; i++) env.move(card, 150 + i, 110 + i);
  assert.equal(env.frames.size, 1);
  assert.equal(card.rectReads, 1);
  assert.equal(card.values.size, 0, 'no style writes before rAF');
  env.paint();
  assert.equal(env.frames.size, 0, 'no perpetual animation loop');
  assert.equal(card.classList.contains('is-card-tilting'), true);
  assert.equal(card.values.get('--card-light-x'), '74.5%');
  assert.equal(card.values.get('--card-light-y'), '33.0%');
  env.move(card, -1000, 2000);
  env.paint();
  assert.equal(card.values.get('--card-rotate-x'), '-3.00deg');
  assert.equal(card.values.get('--card-rotate-y'), '-3.00deg');
  assert.equal(card.values.get('--card-light-x'), '0.0%');
  assert.equal(card.values.get('--card-light-y'), '100.0%');
  assert.equal(card.rectReads, 1);
});

test('delegates through descendants, keeps internal transitions and resets on leaving', () => {
  const env = setup();
  const card = createCard();
  const child = { parent: card, closest: query => card.closest(query) };
  env.move(child);
  env.paint();
  env.document.dispatch('pointerout', { target: child, relatedTarget: card });
  assert.equal(card.classList.contains('is-card-tilting'), true);
  env.document.dispatch('pointerout', { target: child, relatedTarget: null });
  assertReset(env, card);
});

test('switching cards cancels the old frame and supports newly rendered cards', () => {
  const env = setup();
  const first = createCard();
  const second = createCard();
  env.move(first);
  env.move(second);
  assert.equal(env.frames.size, 1);
  env.paint();
  assert.equal(first.values.size, 0);
  assert.equal(second.classList.contains('is-card-tilting'), true);
  assert.equal(second.rectReads, 1);
});

test('thumbnail, historical, noninteractive, detached and zero-size cards stay static', () => {
  const env = setup();
  for (const options of [{ thumbnail: true }, { historical: true }, { role: 'presentation' }, { connected: false }, { width: 0 }, { height: 0 }]) {
    const card = createCard(options);
    env.move(card);
    env.paint();
    assert.equal(card.values.size, 0);
    assert.equal(card.classList.contains('is-card-tilting'), false);
  }
});

test('coarse pointers, reduced motion and touch events do not animate', () => {
  for (const options of [{ fine: false }, { reduced: true }]) {
    const env = setup(options);
    const card = createCard();
    env.move(card);
    assert.equal(env.frames.size, 0);
    assert.equal(card.rectReads, 0);
  }
  const env = setup();
  const card = createCard();
  env.move(card, 50, 50, 'touch');
  assert.equal(env.frames.size, 0);
  env.move(card);
  env.paint();
  env.move(card, 50, 50, 'touch');
  assertReset(env, card);
});

test('each lifecycle exit cancels pending work and clears only effect properties', () => {
  for (const [owner, event] of [['window', 'blur'], ['window', 'pagehide'], ['window', 'resize'], ['window', 'scroll'], ['document', 'visibilitychange'], ['document', 'pointercancel']]) {
    const env = setup();
    const card = createCard();
    card.style.setProperty('--unrelated', 'retained');
    env.move(card);
    env.paint();
    env.move(card, 170, 90);
    env[owner].dispatch(event);
    assert.equal(card.classList.contains('is-card-tilting'), false);
    assert.deepEqual([...card.values], [['--unrelated', 'retained']]);
    assert.equal(env.frames.size, 0);
    assert.equal(env.observer.observing, false);
  }
});

test('keyboard blur resets effects without changing keyboard behavior', () => {
  const env = setup();
  const card = createCard();
  env.move(card);
  env.paint();
  env.document.dispatch('focusout', { target: card, relatedTarget: {} });
  assertReset(env, card);
  assert.equal(env.document.listeners.has('keydown'), false);
});

test('media changes clean up immediately and may re-enable future interaction', () => {
  for (const legacyMedia of [false, true]) {
    const env = setup({ legacyMedia });
    const card = createCard();
    env.move(card);
    env.paint();
    env.media[1].matches = true;
    env.media[1].dispatch('change');
    assertReset(env, card);
    env.move(card);
    assert.equal(env.frames.size, 0);
    env.media[1].matches = false;
    env.media[1].dispatch('change');
    env.move(card);
    env.paint();
    assert.equal(card.classList.contains('is-card-tilting'), true);
    env.media[0].matches = false;
    env.media[0].dispatch('change');
    assertReset(env, card);
  }
});

test('removed or newly noninteractive cards are cleaned up by the temporary observer', () => {
  for (const detach of [true, false]) {
    const env = setup();
    const card = createCard();
    env.move(card);
    env.paint();
    assert.equal(env.observer.observing, true);
    if (detach) card.isConnected = false;
    else card.role = null;
    env.observer.callback([]);
    assertReset(env, card);
  }
});

test('rAF rechecks removal and visibility even before mutation/events arrive', () => {
  for (const hide of [true, false]) {
    const env = setup();
    const card = createCard();
    env.move(card);
    if (hide) env.document.hidden = true;
    else card.isConnected = false;
    env.paint();
    assertReset(env, card);
  }
});

test('listeners are passive and add no click/touch interception or public globals', () => {
  const env = setup();
  for (const event of ['pointermove', 'pointerout', 'pointercancel']) {
    assert.equal(env.document.listeners.get(event)[0].options.passive, true);
  }
  for (const target of [env.document, env.window]) {
    for (const event of ['click', 'touchstart', 'touchmove', 'pointerdown']) assert.equal(target.listeners.has(event), false);
  }
  assert.deepEqual(Object.keys(env.sandbox).sort(), ['document', 'window']);
  assert.equal(env.frames.size, 0, 'idle page does not schedule work');
});

test('missing animation-frame support leaves a functional static component', () => {
  const env = setup({ noAnimationFrame: true });
  assert.equal(env.document.listeners.size, 0);
  assert.equal(env.window.listeners.size, 0);
});
