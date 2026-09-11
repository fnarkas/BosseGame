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
