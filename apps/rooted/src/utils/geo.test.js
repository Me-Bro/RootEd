import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationState, requestLocation } from './geo.js';

function withNavigator(nav, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  return Promise.resolve(fn()).finally(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
}

// A geolocation stub that answers each call from a script of results, in order.
const script = (...results) => {
  const calls = [];
  return {
    calls,
    getCurrentPosition(ok, fail, options) {
      calls.push(options);
      const next = results.shift();
      if (next.code) fail(next);
      else ok({ coords: next });
    },
  };
};

test('a granted fix is returned from the first, precise attempt', () => {
  const geolocation = script({ latitude: 1, longitude: 2, accuracy: 5 });
  return withNavigator({ geolocation }, async () => {
    const r = await requestLocation();
    assert.equal(r.coords.latitude, 1);
    assert.equal(geolocation.calls.length, 1);
    assert.equal(geolocation.calls[0].enableHighAccuracy, true);
  });
});

test('denied stops at once, with no coarse retry', () => {
  const geolocation = script({ code: 1 });
  return withNavigator({ geolocation }, async () => {
    assert.deepEqual(await requestLocation(), { error: 'denied' });
    assert.equal(geolocation.calls.length, 1);
  });
});

test('a precise timeout falls back to one coarse attempt', () => {
  const geolocation = script({ code: 3 }, { latitude: 1, longitude: 2, accuracy: 80 });
  return withNavigator({ geolocation }, async () => {
    assert.equal((await requestLocation()).coords.accuracy, 80);
    assert.equal(geolocation.calls[1].enableHighAccuracy, false);
  });
});

test('both attempts failing, or no geolocation at all, is unavailable', async () => {
  const geolocation = script({ code: 2 }, { code: 3 });
  await withNavigator({ geolocation }, async () =>
    assert.deepEqual(await requestLocation(), { error: 'unavailable' })
  );
  await withNavigator({}, async () =>
    assert.deepEqual(await requestLocation(), { error: 'unavailable' })
  );
});

test('locationState reports the permission, or unknown without the API', async () => {
  await withNavigator({ permissions: { query: async () => ({ state: 'denied' }) } }, async () =>
    assert.equal(await locationState(), 'denied')
  );
  await withNavigator({}, async () => assert.equal(await locationState(), 'unknown'));
});
