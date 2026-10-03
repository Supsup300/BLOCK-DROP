(function (root) {
  "use strict";

  const COUNTRIES = [
    { name: "France", flag: "🇫🇷", col: 1, row: 0 },
    { name: "Italie", flag: "🇮🇹", col: 2, row: 0 },
    { name: "Japon", flag: "🇯🇵", col: 3, row: 0 },
    { name: "États-Unis", flag: "🇺🇸", col: 0, row: 1 },
    { name: "Royaume-Uni", flag: "🇬🇧", col: 1, row: 1 },
    { name: "Égypte", flag: "🇪🇬", col: 2, row: 1 },
    { name: "Brésil", flag: "🇧🇷", col: 3, row: 1 },
    { name: "Thaïlande", flag: "🇹🇭", col: 0, row: 2 },
    { name: "Australie", flag: "🇦🇺", col: 1, row: 2 },
    { name: "Chine", flag: "🇨🇳", col: 2, row: 2 },
    { name: "Grèce", flag: "🇬🇷", col: 3, row: 2 },
    { name: "Espagne", flag: "🇪🇸", col: 0, row: 3 },
    { name: "Mexique", flag: "🇲🇽", col: 1, row: 3 },
    { name: "Maroc", flag: "🇲🇦", col: 2, row: 3 },
    { name: "Turquie", flag: "🇹🇷", col: 3, row: 3 },
    { name: "Islande", flag: "🇮🇸", col: 0, row: 4 },
    { name: "Canada", flag: "🇨🇦", col: 1, row: 4 },
    { name: "Inde", flag: "🇮🇳", col: 2, row: 4 },
    { name: "Kenya", flag: "🇰🇪", col: 3, row: 4 }
  ];

  function targetForLevel(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 2 + Math.floor(((safeLevel - 1) % 10) / 2);
  }

  function countryIndexForLevel(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return Math.floor((safeLevel - 1) / 10) % COUNTRIES.length;
  }

  function atlasPosition(countryIndex) {
    const country = COUNTRIES[((countryIndex % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length];
    return {
      x: country.col * (100 / 3),
      y: country.row * 25
    };
  }

  function normalizeProgression(state = {}) {
    const level = Math.max(1, Math.floor(Number(state.level) || 1));
    const target = targetForLevel(level);
    const levelLines = Math.min(target - 1, Math.max(0, Math.floor(Number(state.levelLines) || 0)));
    const unlockedPostcards = Array.from(new Set(
      (Array.isArray(state.unlockedPostcards) ? state.unlockedPostcards : [])
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < COUNTRIES.length)
    )).sort((a, b) => a - b);
    return { level, levelLines, unlockedPostcards };
  }

  function advanceProgression(state, clearedLines) {
    const next = normalizeProgression(state);
    const levelUps = [];
    const postcardUnlocks = [];
    next.levelLines += Math.max(0, Math.floor(Number(clearedLines) || 0));

    while (next.levelLines >= targetForLevel(next.level)) {
      next.levelLines -= targetForLevel(next.level);
      const completedLevel = next.level;
      next.level += 1;
      levelUps.push(next.level);

      if (completedLevel % 10 === 0) {
        const postcardIndex = ((completedLevel / 10) - 1) % COUNTRIES.length;
        if (!next.unlockedPostcards.includes(postcardIndex)) {
          next.unlockedPostcards.push(postcardIndex);
          next.unlockedPostcards.sort((a, b) => a - b);
          postcardUnlocks.push(postcardIndex);
        }
      }
    }

    return { state: next, levelUps, postcardUnlocks };
  }

  function levelsUntilPostcard(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 10 - ((safeLevel - 1) % 10);
  }

  root.BlockDropProgression = {
    COUNTRIES,
    targetForLevel,
    countryIndexForLevel,
    atlasPosition,
    normalizeProgression,
    advanceProgression,
    levelsUntilPostcard
  };
})(typeof window !== "undefined" ? window : globalThis);
