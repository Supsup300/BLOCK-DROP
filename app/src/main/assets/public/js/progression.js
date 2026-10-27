(function (root) {
  "use strict";

  const COUNTRIES = [
    { name: "France", flag: "🇫🇷", col: 1, row: 0, art: "france" },
    { name: "Italie", flag: "🇮🇹", col: 2, row: 0, art: "italie" },
    { name: "Japon", flag: "🇯🇵", col: 3, row: 0, art: "japon" },
    { name: "États-Unis", flag: "🇺🇸", col: 0, row: 1, art: "etats-unis" },
    { name: "Royaume-Uni", flag: "🇬🇧", col: 1, row: 1, art: "royaume-uni" },
    { name: "Égypte", flag: "🇪🇬", col: 2, row: 1, art: "egypte" },
    { name: "Brésil", flag: "🇧🇷", col: 3, row: 1, art: "bresil" },
    { name: "Thaïlande", flag: "🇹🇭", col: 0, row: 2, art: "thailande" },
    { name: "Australie", flag: "🇦🇺", col: 1, row: 2, art: "australie" },
    { name: "Chine", flag: "🇨🇳", col: 2, row: 2, art: "chine" },
    { name: "Grèce", flag: "🇬🇷", col: 3, row: 2, art: "grece" },
    { name: "Espagne", flag: "🇪🇸", col: 0, row: 3, art: "espagne" },
    { name: "Mexique", flag: "🇲🇽", col: 1, row: 3, art: "mexique" },
    { name: "Maroc", flag: "🇲🇦", col: 2, row: 3, art: "maroc" },
    { name: "Turquie", flag: "🇹🇷", col: 3, row: 3, art: "turquie" },
    { name: "Islande", flag: "🇮🇸", col: 0, row: 4, art: "islande" },
    { name: "Canada", flag: "🇨🇦", col: 1, row: 4, art: "canada" },
    { name: "Inde", flag: "🇮🇳", col: 2, row: 4, art: "inde" },
    { name: "Kenya", flag: "🇰🇪", col: 3, row: 4, art: "kenya" }
  ];
  const EDITIONS = [
    { name: "Carte postale", icon: "✦", tint: "classic" },
    { name: "À l'aube", icon: "☀", tint: "dawn" },
    { name: "Grand horizon", icon: "≈", tint: "blue" },
    { name: "En vadrouille", icon: "✈", tint: "wander" },
    { name: "L'heure dorée", icon: "✧", tint: "gold" },
    { name: "À la nuit tombée", icon: "☾", tint: "night" }
  ];
  const CARDS = COUNTRIES.flatMap((country, countryIndex) => EDITIONS.map((edition, editionIndex) => ({
    countryIndex, editionIndex, name: country.name, flag: country.flag,
    title: `${country.name} · ${edition.name}`, icon: edition.icon, tint: edition.tint,
    special: editionIndex === 0
  })));

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
    const legacy = state.collectionVersion !== 2;
    const unlockedPostcards = Array.from(new Set(
      (Array.isArray(state.unlockedPostcards) ? state.unlockedPostcards : [])
        .map(Number)
        .map((index) => legacy ? index * EDITIONS.length : index)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < CARDS.length)
    )).sort((a, b) => a - b);
    const collectionMilestone = legacy
      ? Math.floor(Math.max(0, Number(state.linesCleared) || 0) / 3)
      : Math.max(0, Math.floor(Number(state.collectionMilestone) || 0));
    return { level, levelLines, unlockedPostcards, collectionMilestone, collectionVersion: 2 };
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
        const postcardIndex = (((completedLevel / 10) - 1) % COUNTRIES.length) * EDITIONS.length;
        if (!next.unlockedPostcards.includes(postcardIndex)) {
          next.unlockedPostcards.push(postcardIndex);
          next.unlockedPostcards.sort((a, b) => a - b);
          postcardUnlocks.push(postcardIndex);
        }
      }
    }

    return { state: next, levelUps, postcardUnlocks };
  }

  function advanceCollection(state, totalLines) {
    const next = normalizeProgression(state);
    const unlocks = [];
    const milestone = Math.floor(Math.max(0, Number(totalLines) || 0) / 3);
    while (next.collectionMilestone < milestone) {
      next.collectionMilestone += 1;
      const index = CARDS.findIndex((card, candidate) => !card.special && !next.unlockedPostcards.includes(candidate));
      if (index < 0) continue;
      next.unlockedPostcards.push(index);
      unlocks.push(index);
    }
    next.unlockedPostcards.sort((a, b) => a - b);
    return { state: next, unlocks };
  }

  function levelsUntilPostcard(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 10 - ((safeLevel - 1) % 10);
  }

  root.BlockDropProgression = {
    COUNTRIES,
    CARDS,
    EDITIONS,
    targetForLevel,
    countryIndexForLevel,
    atlasPosition,
    normalizeProgression,
    advanceProgression,
    advanceCollection,
    levelsUntilPostcard
  };
})(typeof window !== "undefined" ? window : globalThis);
