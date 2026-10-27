const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.join(__dirname, 'app/src/main/assets/public/js');
require(path.join(base, 'engine.js'));
require(path.join(base, 'progression.js'));

const { GameEngine } = globalThis.BlockDropEngine;
const { CARDS, normalizeProgression, advanceProgression, advanceCollection } = globalThis.BlockDropProgression;
assert.equal(CARDS.length, 114);
assert.equal(CARDS.filter(card => card.special).length, 19);

const migrated = normalizeProgression({ level: 21, levelLines: 0, unlockedPostcards: [0, 1, 2], linesCleared: 30 });
assert.deepEqual(migrated.unlockedPostcards, [0, 6, 12]);
assert.equal(migrated.collectionMilestone, 10);

let progress = normalizeProgression({ collectionVersion: 2 });
let unlockCount = 0;
for (let lines = 1; lines <= 800; lines++) {
  const advance = advanceProgression(progress, 1);
  const cards = advanceCollection(advance.state, lines);
  progress = cards.state;
  unlockCount += cards.unlocks.length;
}
assert.equal(unlockCount, 95);
assert.equal(new Set(progress.unlockedPostcards).size, progress.unlockedPostcards.length);
assert.equal(progress.unlockedPostcards.length, 114);

const game = new GameEngine();
assert.equal(game.bonuses.eraser, 1);
assert.equal(game.addBonus('eraser'), false);
game.bonuses.eraser = 0;
assert.equal(game.addBonus('eraser'), true);
assert.equal(game.addBonus('eraser'), false);
assert.equal(game.addBonus('unknown'), false);

let moves = 0;
for (let attempts = 0; attempts < 500 && !game.gameOver; attempts++) {
  const choice = game.pieces.find(piece => !piece.used && game.findPlacements(piece).length);
  if (!choice) break;
  const spot = game.findPlacements(choice)[0];
  assert.equal(game.place(choice.uid, spot.row, spot.col).ok, true);
  moves++;
}
assert.ok(moves >= 10, `Only ${moves} moves`);
console.log(`114 collectible cards, migration, joker stock and ${moves} placements: OK`);
