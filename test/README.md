# Minigame tests

`npm test` runs the suite with vitest in Node. Phaser cannot run outside a
browser, so the modes are exercised against `test/helpers/fakeScene.js`, a small
model of the Phaser scene API they use:

- `scene.click(obj)` / `scene.drag(obj, x, y)` – emit the same pointer/drag
  events Phaser would. Disabled objects are not clickable, like in Phaser.
- `scene.advance(ms)` – virtual clock. Fires `time.delayedCall`, `time.addEvent`
  and tween completions in chronological order.
- `flush()` – let async `createChallengeUI`/config loads settle.
- `scene.liveObjects()`, `scene.objectsCreatedAfter(t)` – leak / orphaned-UI checks.
- `scene.playedAudio()`, `scene.lastAudio()` – audio keys played. Unknown keys
  throw, exactly like Phaser, and the set of known keys comes from running the
  real `BootScene.preload()`.
- `scene.sceneCalls` – `scene.scene.restart()/start()` calls.
- `setTestConfig({...})` – override sections of `public/config/minigames.json`.

`test/assets.test.js` checks that every asset BootScene loads exists on disk.

Also modelled:

- `scene.load` – `image()/audio()` queue keys; `start()` marks them loaded and
  fires `complete` synchronously, so `ensureAssets()` (src/lazyLoad.js) resolves
  on the next microtask. `scene.loadedAssets` lists what was requested.
- `scene.events` emits `shutdown` when `scene.scene.start()/restart()` is called,
  before the display list is destroyed, like Phaser.
- Every lazily-loaded key (Pokemon artwork/names, per-mode audio packs from
  `src/assetManifest.js`) is treated as already in the cache, so modes can be
  tested without a loader round-trip. `test/assets.test.js` and
  `test/lazyLoad.test.js` check the files exist on disk.
