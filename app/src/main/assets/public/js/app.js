(function () {
  "use strict";

  const { GameEngine, SIZE } = window.BlockDropEngine;
  const {
    COUNTRIES,
    targetForLevel,
    countryIndexForLevel,
    atlasPosition,
    normalizeProgression,
    advanceProgression,
    levelsUntilPostcard
  } = window.BlockDropProgression;
  const { StorageService, AudioManager, Haptics, SimulatedAdProvider, NativeAdProvider, AdsManager } = window.BlockDropServices;
  const $ = (id) => document.getElementById(id);

  const storage = new StorageService();
  let meta = storage.loadMeta();
  meta = { ...meta, ...normalizeProgression(meta) };
  let settings = storage.loadSettings();
  const audio = new AudioManager(settings.sound);
  const haptics = new Haptics(settings.vibration);
  const nativeAdsAvailable = NativeAdProvider.isSupported(window.AndroidAdsBridge);
  const adProvider = nativeAdsAvailable
    ? new NativeAdProvider(window.AndroidAdsBridge)
    : new SimulatedAdProvider(showSimulatedAd);
  const ads = new AdsManager(adProvider, {
    demoMode: !nativeAdsAvailable && new URLSearchParams(location.search).has("ads-demo")
  });

  const saved = storage.loadGame();
  let engine = new GameEngine(saved?.state || null);
  if (engine.gameOver) engine.newGame();

  let drag = null;
  let inputLocked = false;
  let eraseMode = false;
  let eraseSelection = new Set();
  let tutorialStep = 0;
  let sessionStartedAt = 0;
  let gameCountRecorded = false;
  let scoreAnimation = 0;
  let toastTimer = 0;
  let reactionTimer = 0;
  let dragFrame = 0;
  let pendingDragPoint = null;
  let activeScreen = "home";
  let recordAnnounced = false;
  let recordBrokenThisGame = false;
  let earnedPostcardThisGame = false;
  let postcardRewardResolve = null;
  let bestAtSessionStart = meta.bestScore;

  const cells = [];
  const tutorialSteps = [
    { title: "À toi de jouer", text: "Glisse une pièce sur la grille." },
    { title: "Fais de la place", text: "Complète une ligne ou une colonne pour la faire disparaître." },
    { title: "Tiens le cap", text: "Essaie de tenir le plus longtemps possible !" }
  ];

  function init() {
    buildBoard();
    bindControls();
    syncSettings();
    updateHome();
    renderAll();
    history.replaceState({ blockDrop: "home" }, "", location.href);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", saveAndCommitTime);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveAndCommitTime();
      else if (activeScreen === "game") sessionStartedAt = Date.now();
    });
    document.addEventListener("touchmove", (event) => {
      if (activeScreen === "game" || drag) event.preventDefault();
    }, { passive: false });
    document.addEventListener("contextmenu", (event) => {
      if (activeScreen === "game") event.preventDefault();
    });
    registerWebMcp();
    registerServiceWorker();
    exposeTestHooks();
    exposeNativeApi();
    refreshPrivacyOptions();
  }

  function buildBoard() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < SIZE * SIZE; index += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.index = String(index);
      cell.addEventListener("pointerup", () => handleBoardCellTap(index));
      cells.push(cell);
      fragment.appendChild(cell);
    }
    $("board").appendChild(fragment);
  }

  function bindControls() {
    $("playButton").addEventListener("click", () => enterGame());
    $("backButton").addEventListener("click", returnHome);
    $("homeSettingsButton").addEventListener("click", () => openSettings());
    $("gameSettingsButton").addEventListener("click", () => openSettings());
    $("statsButton").addEventListener("click", openStats);
    $("journeyButton").addEventListener("click", openPostcards);
    $("homeJourney").addEventListener("click", openPostcards);
    $("postcardContinueButton").addEventListener("click", completePostcardReward);
    $("tutorialNext").addEventListener("click", advanceTutorial);
    $("showTutorialButton").addEventListener("click", () => {
      hideOverlay("settingsOverlay");
      showTutorial(true);
    });
    $("privacyOptionsButton").addEventListener("click", () => {
      try { window.AndroidConsentBridge?.showPrivacyOptions(); } catch (_error) { showToast("Options indisponibles."); }
    });
    $("soundToggle").addEventListener("change", (event) => {
      settings.sound = event.target.checked;
      audio.setEnabled(settings.sound);
      storage.saveSettings(settings);
      if (settings.sound) audio.play("click");
    });
    $("vibrationToggle").addEventListener("change", (event) => {
      settings.vibration = event.target.checked;
      haptics.setEnabled(settings.vibration);
      storage.saveSettings(settings);
      if (settings.vibration) haptics.pulse("drop");
    });
    document.querySelectorAll("[data-close-overlay]").forEach((button) => {
      button.addEventListener("click", () => hideOverlay(button.dataset.closeOverlay));
    });
    $("eraserButton").addEventListener("click", beginEraseMode);
    $("cancelEraseButton").addEventListener("click", cancelEraseMode);
    $("confirmEraseButton").addEventListener("click", confirmErase);
    $("redrawButton").addEventListener("click", useRedraw);
    $("secondChanceButton").addEventListener("click", useSecondChance);
    $("gameOverEraser").addEventListener("click", useEmergencyEraser);
    $("gameOverRedraw").addEventListener("click", useEmergencyRedraw);
    $("replayButton").addEventListener("click", replayFromGameOver);
    $("gameOverHomeButton").addEventListener("click", () => {
      hideOverlay("gameOverOverlay");
      returnHome();
    });

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", cancelDrag, { passive: false });
  }

  function syncSettings() {
    $("soundToggle").checked = settings.sound;
    $("vibrationToggle").checked = settings.vibration;
  }

  function showScreen(name) {
    activeScreen = name;
    $("app").classList.toggle("playing", name === "game");
    $("homeScreen").classList.toggle("active", name === "home");
    $("gameScreen").classList.toggle("active", name === "game");
  }

  function enterGame(forceNew = false) {
    audio.play("click");
    if (forceNew || engine.gameOver) {
      engine.newGame();
      gameCountRecorded = false;
      recordAnnounced = false;
      recordBrokenThisGame = false;
      earnedPostcardThisGame = false;
    }
    bestAtSessionStart = meta.bestScore;
    showScreen("game");
    sessionStartedAt = Date.now();
    inputLocked = false;
    renderAll();
    saveGame();
    if (history.state?.blockDrop !== "game") history.pushState({ blockDrop: "game" }, "", location.href);
    if (!meta.tutorialSeen) window.setTimeout(() => showTutorial(false), 260);
  }

  function returnHome() {
    cancelDrag();
    cancelEraseMode();
    closeTransientOverlays();
    commitPlayTime();
    saveGame();
    showScreen("home");
    updateHome();
    history.replaceState({ blockDrop: "home" }, "", location.href);
  }

  function handlePopState() {
    if (document.querySelector(".overlay:not([hidden])")) {
      closeTransientOverlays();
      history.pushState({ blockDrop: activeScreen }, "", location.href);
      return;
    }
    if (activeScreen === "game") {
      commitPlayTime();
      saveGame();
      showScreen("home");
      updateHome();
    }
  }

  function closeTransientOverlays() {
    ["tutorialOverlay", "settingsOverlay", "statsOverlay", "postcardsOverlay", "gameOverOverlay"].forEach(hideOverlay);
    completePostcardReward();
  }

  function renderAll() {
    renderBoard();
    renderPieces();
    updateHud(false);
    updateJourneyUi();
  }

  function renderBoard(board = engine.board, options = {}) {
    cells.forEach((cell, index) => {
      cell.className = "cell";
      cell.style.removeProperty("--preview-color");
      const color = board[index];
      if (color) cell.classList.add("filled", `color-${color}`);
      if (options.placed?.includes(index)) cell.classList.add("drop-in");
      if (eraseSelection.has(index)) cell.classList.add("erase-selected");
      cell.setAttribute("aria-label", color ? `Case occupée ${color}` : "Case libre");
    });
    $("board").classList.toggle("erase-mode", eraseMode);
  }

  function renderPieces() {
    const tray = $("piecesTray");
    tray.replaceChildren();
    engine.pieces.forEach((piece, pieceIndex) => {
      const slot = document.createElement("div");
      slot.className = `piece-slot${piece.used ? " used" : ""}`;
      slot.dataset.pieceUid = piece.uid;
      slot.dataset.pieceIndex = String(pieceIndex);
      slot.setAttribute("role", "button");
      slot.setAttribute("tabindex", piece.used ? "-1" : "0");
      slot.setAttribute("aria-label", piece.used ? "Pièce utilisée" : `Pièce ${pieceIndex + 1}, ${piece.cells.length} blocs`);
      if (!piece.used) {
        slot.appendChild(createPieceShape(piece, "piece-shape"));
        slot.addEventListener("pointerdown", (event) => beginDrag(event, piece, slot));
        slot.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPieceForTap(piece, slot);
          }
        });
      }
      tray.appendChild(slot);
    });
  }

  function createPieceShape(piece, className) {
    const element = document.createElement("div");
    element.className = `${className} color-${piece.color}`;
    element.style.setProperty("--piece-cols", piece.cols);
    element.style.setProperty("--piece-rows", piece.rows);
    const active = new Set(piece.cells.map(([row, col]) => `${row}:${col}`));
    for (let row = 0; row < piece.rows; row += 1) {
      for (let col = 0; col < piece.cols; col += 1) {
        const block = document.createElement("span");
        block.className = active.has(`${row}:${col}`) ? (className === "drag-piece" ? "drag-cell" : "piece-block") : (className === "drag-piece" ? "drag-cell empty" : "piece-block empty");
        element.appendChild(block);
      }
    }
    return element;
  }

  function updateHud(animate = true, fromScore = engine.score) {
    if (animate) animateNumber($("scoreValue"), fromScore, engine.score, 260);
    else $("scoreValue").textContent = formatScore(engine.score);
    $("bestValue").textContent = formatScore(meta.bestScore);
    $("homeBest").textContent = formatScore(meta.bestScore);
    $("eraserCount").textContent = engine.bonuses.eraser;
    $("redrawCount").textContent = engine.bonuses.redraw;
    $("eraserButton").disabled = engine.bonuses.eraser <= 0 || inputLocked;
    $("redrawButton").disabled = engine.bonuses.redraw <= 0 || inputLocked;
  }

  function updateHome() {
    const resumable = engine.moves > 0 && !engine.gameOver;
    const country = COUNTRIES[countryIndexForLevel(meta.level)];
    $("playButtonLabel").textContent = resumable ? "REPRENDRE" : "JOUER";
    $("playButtonHint").textContent = resumable ? `Score ${formatScore(engine.score)}` : `${country.flag} Cap sur ${country.name}`;
    $("homeBest").textContent = formatScore(meta.bestScore);
    updateJourneyUi();
  }

  function updateJourneyUi() {
    const countryIndex = countryIndexForLevel(meta.level);
    const country = COUNTRIES[countryIndex];
    const target = targetForLevel(meta.level);
    const ratio = Math.min(1, Math.max(0, meta.levelLines / target));
    const position = atlasPosition(countryIndex);
    const countryLabel = `${country.flag} ${country.name.toLocaleUpperCase("fr-FR")}`;

    $("homeCountry").textContent = countryLabel;
    $("homeLevel").textContent = String(meta.level);
    $("homePostcardCount").textContent = String(meta.unlockedPostcards.length);
    $("countryName").textContent = countryLabel;
    $("levelValue").textContent = String(meta.level);
    $("levelProgressFill").style.width = `${ratio * 100}%`;
    $("levelProgressText").textContent = `${meta.levelLines}/${target} ligne${target > 1 ? "s" : ""}`;
    $("countryBackdrop").style.backgroundPosition = `${position.x}% ${position.y}%`;
    $("countryBackdrop").setAttribute("aria-label", `Décor de jeu : ${country.name}`);
  }

  function beginDrag(event, piece, slot) {
    if (inputLocked || eraseMode || drag || piece.used || !event.isPrimary) return;
    event.preventDefault();
    audio.play("take");
    const ghost = createPieceShape(piece, "drag-piece");
    ghost.style.setProperty("--drag-cell", "2rem");
    ghost.style.setProperty("--drag-gap", ".2rem");
    document.body.appendChild(ghost);
    drag = { pointerId: event.pointerId, piece, slot, ghost, valid: false, row: null, col: null, moved: false, startX: event.clientX, startY: event.clientY };
    slot.classList.add("dragging");
    try { slot.setPointerCapture(event.pointerId); } catch (_error) { /* Capture is best effort. */ }
    updateDrag(event.clientX, event.clientY);
  }

  function handlePointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    pendingDragPoint = { x: event.clientX, y: event.clientY };
    if (!dragFrame) {
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        if (pendingDragPoint) updateDrag(pendingDragPoint.x, pendingDragPoint.y);
        pendingDragPoint = null;
      });
    }
  }

  function updateDrag(clientX, clientY) {
    if (!drag) return;
    const firstCellRect = cells[0].getBoundingClientRect();
    const boardStyle = getComputedStyle($("board"));
    const gap = parseFloat(boardStyle.columnGap) || 0;
    const step = firstCellRect.width + gap;
    const width = drag.piece.cols * firstCellRect.width + (drag.piece.cols - 1) * gap;
    const height = drag.piece.rows * firstCellRect.height + (drag.piece.rows - 1) * gap;
    const lift = Math.max(38, firstCellRect.height * .88);
    const left = clientX - width / 2;
    const top = clientY - height - lift;
    const col = Math.round((left - firstCellRect.left) / step);
    const row = Math.round((top - firstCellRect.top) / step);

    drag.moved = drag.moved || Math.hypot(clientX - drag.startX, clientY - drag.startY) > 4;
    drag.ghost.style.setProperty("--drag-cell", `${firstCellRect.width}px`);
    drag.ghost.style.setProperty("--drag-gap", `${gap}px`);
    drag.ghost.style.setProperty("--drag-x", `${left}px`);
    drag.ghost.style.setProperty("--drag-y", `${top}px`);
    drag.valid = engine.canPlace(drag.piece, row, col);
    drag.row = row;
    drag.col = col;
    drag.ghost.classList.toggle("invalid", !drag.valid);
    clearPreview();
    if (drag.valid) {
      drag.piece.cells.forEach(([dr, dc]) => {
        const cell = cells[(row + dr) * SIZE + col + dc];
        cell.style.setProperty("--preview-color", colorHex(drag.piece.color));
        cell.classList.add("preview-valid");
      });
    }
  }

  function handlePointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const placement = drag.valid ? { pieceUid: drag.piece.uid, row: drag.row, col: drag.col } : null;
    const wasValid = drag.valid;
    cleanupDrag();
    if (!wasValid || !placement) {
      audio.play("invalid");
      haptics.pulse("invalid");
      setHint("Pas ici.", 900);
      return;
    }
    inputLocked = true;
    const result = engine.place(placement.pieceUid, placement.row, placement.col);
    if (!result.ok) {
      inputLocked = false;
      renderAll();
      return;
    }
    void processPlacement(result);
  }

  function cancelDrag(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    cleanupDrag();
  }

  function cleanupDrag() {
    if (!drag) return;
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    pendingDragPoint = null;
    clearPreview();
    drag.slot.classList.remove("dragging");
    drag.ghost.remove();
    drag = null;
  }

  function clearPreview() {
    cells.forEach((cell) => {
      cell.classList.remove("preview-valid");
      cell.style.removeProperty("--preview-color");
    });
  }

  async function processPlacement(result) {
    audio.play("drop");
    haptics.pulse("drop");
    renderBoard(result.boardBeforeClear, { placed: result.placedCells });
    const progression = updateProgressFromPlacement(result);
    updateHud(true, result.scoreBefore);

    if (result.lineCount > 0) {
      await wait(95);
      result.clearedCells.forEach((index) => cells[index].classList.add("clearing"));
      const sound = result.combo >= 3 ? "combo" : result.lineCount >= 2 ? "double" : "clear";
      audio.play(sound);
      haptics.pulse(result.combo >= 2 ? "combo" : "clear");
      showCombo(result);
      await wait(255);
    } else {
      await wait(45);
    }

    renderBoard();
    renderPieces();
    updateHud(false);
    updateJourneyUi();
    saveGame();
    await handleProgressionRewards(progression);
    if (result.restoredBonuses?.length) {
      const names = result.restoredBonuses.map((kind) => kind === "eraser" ? "Gomme" : "Tirage");
      showToast(`${names.join(" et ")} rechargé${names.length > 1 ? "s" : ""} !`);
    }
    inputLocked = result.gameOver;
    updateHud(false);
    maybeReactToBoard(result);
    if (result.gameOver) await wait(170), showGameOver();
  }

  function updateProgressFromPlacement(result) {
    let progression = { state: normalizeProgression(meta), levelUps: [], postcardUnlocks: [] };
    if (result.lineCount > 0) {
      meta.linesCleared += result.lineCount;
      progression = advanceProgression(meta, result.lineCount);
      meta = { ...meta, ...progression.state };
    }
    meta.bestCombo = Math.max(meta.bestCombo, result.bestCombo);
    if (engine.score > bestAtSessionStart) recordBrokenThisGame = true;
    if (engine.score > meta.bestScore) {
      meta.bestScore = engine.score;
      if (!recordAnnounced && engine.score > bestAtSessionStart && bestAtSessionStart > 0) {
        recordAnnounced = true;
        showRecord();
      }
    }
    storage.saveMeta(meta);
    return progression;
  }

  async function handleProgressionRewards(progression) {
    if (progression.levelUps.length > 0) {
      const latestLevel = progression.levelUps[progression.levelUps.length - 1];
      showLevelUp(latestLevel);
      audio.play("level");
      haptics.pulse("clear");
    }

    for (const postcardIndex of progression.postcardUnlocks) {
      earnedPostcardThisGame = true;
      await wait(260);
      await showPostcardReward(postcardIndex);
    }
  }

  function showLevelUp(level) {
    const country = COUNTRIES[countryIndexForLevel(level)];
    const banner = $("levelUpBanner");
    banner.querySelector("span").textContent = `CAP SUR ${country.name.toLocaleUpperCase("fr-FR")}`;
    $("levelUpValue").textContent = String(level);
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
  }

  function showCombo(result) {
    const simultaneous = result.lineCount >= 4 ? "MEGA DROP !" : result.lineCount === 3 ? "TRIPLE !" : result.lineCount === 2 ? "DOUBLE !" : "LIGNE !";
    const text = result.combo >= 2 ? `${simultaneous}\nCOMBO ×${result.combo}` : simultaneous;
    const banner = $("comboBanner");
    banner.innerHTML = text.replace("\n", "<br>");
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    if (result.combo >= 2) showReaction(result.combo >= 4 ? "Ça, c'est du propre." : "Pas mal.");
  }

  function showRecord() {
    const banner = $("recordBanner");
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    audio.play("record");
    haptics.pulse("record");
    showReaction("Record. Évidemment.");
  }

  function maybeReactToBoard(result) {
    if (result.combo >= 2) return;
    const remainingMoves = engine.pieces.filter((piece) => !piece.used).reduce((sum, piece) => sum + Math.min(engine.findPlacements(piece).length, 4), 0);
    if (remainingMoves <= 2 && !engine.gameOver) showReaction("Ça se resserre…");
    else if (result.lineCount >= 2) showReaction("Propre.");
  }

  function showReaction(text) {
    window.clearTimeout(reactionTimer);
    $("reactionText").textContent = text;
    const reaction = $("mascotReaction");
    reaction.classList.remove("show");
    void reaction.offsetWidth;
    reaction.classList.add("show");
    reactionTimer = window.setTimeout(() => reaction.classList.remove("show"), 2200);
  }

  function showGameOver() {
    inputLocked = true;
    cancelDrag();
    commitPlayTime();
    if (!gameCountRecorded) {
      meta.gamesPlayed += 1;
      meta.gamesSinceInterstitial += 1;
      gameCountRecorded = true;
    }
    meta.bestScore = Math.max(meta.bestScore, engine.score);
    meta.bestCombo = Math.max(meta.bestCombo, engine.bestCombo);
    storage.saveMeta(meta);
    saveGame();
    $("finalScore").textContent = formatScore(engine.score);
    $("finalBest").textContent = formatScore(meta.bestScore);
    $("finalCombo").textContent = `×${engine.bestCombo}`;
    $("secondChanceButton").disabled = engine.usedSecondChance;
    const canErase = engine.emergencyEraseCells().length > 0;
    const canRedraw = engine.bonuses.redraw > 0 && engine.board.some((cell) => !cell);
    $("gameOverEraser").hidden = !canErase;
    $("gameOverRedraw").hidden = !canRedraw;
    $("gameOverJokers").hidden = !canErase && !canRedraw;
    showOverlay("gameOverOverlay");
    audio.play("gameover");
    showReaction("Encore une ?");
  }

  async function useSecondChance() {
    if (engine.usedSecondChance) return;
    $("secondChanceButton").disabled = true;
    hideOverlay("gameOverOverlay");
    const ad = await ads.showRewarded("second_chance");
    if (!ad.completed) {
      $("secondChanceButton").disabled = false;
      showOverlay("gameOverOverlay");
      showToast("Publicité indisponible. Réessaie dans un instant.");
      return;
    }
    const result = engine.secondChance();
    if (!result.ok) {
      $("secondChanceButton").disabled = false;
      showOverlay("gameOverOverlay");
      return;
    }
    inputLocked = false;
    sessionStartedAt = Date.now();
    renderAll();
    audio.play("joker");
    haptics.pulse("joker");
    showReaction("On respire.");
    setHint(`${result.removedCells.length} blocs libérés`, 1500);
    saveGame();
  }

  function resumeWithJoker(label) {
    hideOverlay("gameOverOverlay");
    inputLocked = false;
    sessionStartedAt = Date.now();
    renderAll();
    saveGame();
    audio.play("joker");
    haptics.pulse("joker");
    showToast(label);
  }

  function useEmergencyEraser() {
    const cellsToErase = engine.emergencyEraseCells();
    const result = engine.eraseCells(cellsToErase);
    if (!result.ok) return;
    resumeWithJoker(`${result.erasedCells.length} blocs effacés`);
  }

  function useEmergencyRedraw() {
    const result = engine.redraw();
    if (!result.ok) return;
    resumeWithJoker("Nouveau tirage");
  }

  async function replayFromGameOver() {
    hideOverlay("gameOverOverlay");
    const mayShowInterstitial = !earnedPostcardThisGame && !recordBrokenThisGame && ads.shouldShowInterstitial(meta);
    if (mayShowInterstitial) {
      const ad = await ads.showInterstitial("between_games");
      if (ad.completed) {
        meta.gamesSinceInterstitial = 0;
        meta.lastInterstitialAt = Date.now();
        storage.saveMeta(meta);
      } else {
        showToast("Publicité indisponible — la partie continue.");
      }
    }
    engine.newGame();
    gameCountRecorded = false;
    recordAnnounced = false;
    recordBrokenThisGame = false;
    earnedPostcardThisGame = false;
    bestAtSessionStart = meta.bestScore;
    inputLocked = false;
    sessionStartedAt = Date.now();
    renderAll();
    saveGame();
  }

  function beginEraseMode() {
    if (inputLocked || engine.bonuses.eraser <= 0) return;
    if (!engine.board.some(Boolean)) {
      showToast("Aucun bloc à effacer.");
      return;
    }
    eraseMode = true;
    eraseSelection.clear();
    $("erasePanel").hidden = false;
    $("board").classList.add("erase-mode");
    $("eraseCount").textContent = "0";
    $("confirmEraseButton").disabled = true;
    setHint("Choisis jusqu'à 3 blocs", 0);
    renderBoard();
  }

  function handleBoardCellTap(index) {
    if (!eraseMode || inputLocked || !engine.board[index]) return;
    if (eraseSelection.has(index)) eraseSelection.delete(index);
    else if (eraseSelection.size < 3) eraseSelection.add(index);
    $("eraseCount").textContent = String(eraseSelection.size);
    $("confirmEraseButton").disabled = eraseSelection.size === 0;
    renderBoard();
    if (eraseSelection.size === 3) haptics.pulse("drop");
  }

  function cancelEraseMode() {
    eraseMode = false;
    eraseSelection.clear();
    $("erasePanel").hidden = true;
    $("board").classList.remove("erase-mode");
    if ($("gameHint")) $("gameHint").textContent = "Glisse une pièce sur la grille";
    renderBoard();
  }

  function confirmErase() {
    const result = engine.eraseCells(Array.from(eraseSelection));
    cancelEraseMode();
    if (!result.ok) return;
    audio.play("joker");
    haptics.pulse("joker");
    renderAll();
    showToast(`${result.erasedCells.length} bloc${result.erasedCells.length > 1 ? "s" : ""} effacé${result.erasedCells.length > 1 ? "s" : ""}`);
    saveGame();
  }

  function useRedraw() {
    if (inputLocked || engine.bonuses.redraw <= 0) return;
    const result = engine.redraw();
    if (!result.ok) return;
    audio.play("joker");
    haptics.pulse("joker");
    renderPieces();
    updateHud(false);
    showToast("Nouveau tirage");
    saveGame();
  }

  function selectPieceForTap(piece, slot) {
    if (inputLocked || piece.used) return;
    document.querySelectorAll(".piece-slot.selected").forEach((node) => node.classList.remove("selected"));
    slot.classList.add("selected");
    setHint("Utilise le glisser-déposer pour placer la pièce", 1600);
  }

  function showTutorial(manual) {
    tutorialStep = 0;
    updateTutorial();
    showOverlay("tutorialOverlay");
    if (manual) audio.play("click");
  }

  function advanceTutorial() {
    audio.play("click");
    tutorialStep += 1;
    if (tutorialStep >= tutorialSteps.length) {
      hideOverlay("tutorialOverlay");
      meta.tutorialSeen = true;
      storage.saveMeta(meta);
      return;
    }
    updateTutorial();
  }

  function updateTutorial() {
    const step = tutorialSteps[tutorialStep];
    $("tutorialTitle").textContent = step.title;
    $("tutorialText").textContent = step.text;
    $("tutorialNext").textContent = tutorialStep === tutorialSteps.length - 1 ? "C'EST PARTI" : "CONTINUER";
    document.querySelectorAll(".tutorial-dots i").forEach((dot, index) => dot.classList.toggle("active", index === tutorialStep));
  }

  function openSettings() {
    syncSettings();
    audio.play("click");
    showOverlay("settingsOverlay");
  }

  function openStats() {
    $("statsLevel").textContent = String(meta.level);
    $("statsPostcards").textContent = `${meta.unlockedPostcards.length}/${COUNTRIES.length}`;
    $("statsGames").textContent = String(meta.gamesPlayed);
    $("statsBest").textContent = formatScore(meta.bestScore);
    $("statsLines").textContent = String(meta.linesCleared);
    $("statsCombo").textContent = `×${meta.bestCombo}`;
    $("statsTime").textContent = formatDuration(meta.totalPlayMs);
    audio.play("click");
    showOverlay("statsOverlay");
  }

  function openPostcards() {
    renderPostcardCollection();
    audio.play("click");
    showOverlay("postcardsOverlay");
  }

  function renderPostcardCollection() {
    const grid = $("postcardGrid");
    const fragment = document.createDocumentFragment();
    COUNTRIES.forEach((country, index) => {
      const unlocked = meta.unlockedPostcards.includes(index);
      const item = document.createElement("div");
      item.className = `postcard-item${unlocked ? "" : " locked"}`;
      item.dataset.level = `NIV. ${(index + 1) * 10}`;
      const art = document.createElement("div");
      art.className = "postcard-art";
      setPostcardArt(art, index);
      const label = document.createElement("span");
      label.textContent = unlocked ? `${country.flag} ${country.name}` : `Escale ${(index + 1) * 10}`;
      item.append(art, label);
      fragment.appendChild(item);
    });
    grid.replaceChildren(fragment);
  }

  function setPostcardArt(element, postcardIndex) {
    const country = COUNTRIES[postcardIndex];
    const position = atlasPosition(postcardIndex);
    element.style.setProperty("--post-x", `${position.x}%`);
    element.style.setProperty("--post-y", `${position.y}%`);
    element.setAttribute("aria-label", `Carte postale BLOCK DROP : ${country.name}`);
  }

  function showPostcardReward(postcardIndex) {
    const country = COUNTRIES[postcardIndex];
    setPostcardArt($("rewardPostcard"), postcardIndex);
    $("rewardCountry").textContent = `${country.flag} ${country.name}`;
    $("rewardPostcard").style.animation = "none";
    void $("rewardPostcard").offsetWidth;
    $("rewardPostcard").style.removeProperty("animation");
    showOverlay("postcardRewardOverlay");
    audio.play("postcard");
    haptics.pulse("record");
    showReaction("La classe mondiale.");
    renderPostcardCollection();
    return new Promise((resolve) => {
      postcardRewardResolve = resolve;
    });
  }

  function completePostcardReward() {
    const wasVisible = !$("postcardRewardOverlay").hidden;
    hideOverlay("postcardRewardOverlay");
    if (postcardRewardResolve) {
      const resolve = postcardRewardResolve;
      postcardRewardResolve = null;
      resolve();
    }
    if (wasVisible) audio.play("click");
  }

  function showOverlay(id) {
    const overlay = $(id);
    if (overlay) overlay.hidden = false;
  }

  function hideOverlay(id) {
    const overlay = $(id);
    if (overlay) overlay.hidden = true;
  }

  function showSimulatedAd({ kind, duration }) {
    return new Promise((resolve) => {
      const overlay = $("adOverlay");
      const progress = $("adProgress");
      const countdown = $("adCountdown");
      $("adLabel").textContent = kind === "rewarded"
        ? "PUBLICITÉ RÉCOMPENSÉE · SIMULATION"
        : "PUBLICITÉ INTERSTITIELLE · SIMULATION";
      $("adMessage").textContent = kind === "rewarded" ? "Ta seconde chance arrive" : "Prochaine partie en préparation";
      progress.style.width = "0%";
      countdown.textContent = String(Math.ceil(duration / 1000));
      overlay.hidden = false;
      const started = performance.now();
      const tick = (now) => {
        const ratio = Math.min(1, (now - started) / duration);
        progress.style.width = `${ratio * 100}%`;
        countdown.textContent = String(Math.max(0, Math.ceil((duration - (now - started)) / 1000)));
        if (ratio < 1) requestAnimationFrame(tick);
        else {
          window.setTimeout(() => {
            overlay.hidden = true;
            resolve();
          }, 160);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  function saveGame() {
    storage.saveGame(engine.getState());
    storage.saveMeta(meta);
  }

  function commitPlayTime() {
    if (!sessionStartedAt) return;
    meta.totalPlayMs += Math.max(0, Date.now() - sessionStartedAt);
    sessionStartedAt = 0;
    storage.saveMeta(meta);
  }

  function saveAndCommitTime() {
    commitPlayTime();
    saveGame();
  }

  function refreshPrivacyOptions() {
    const button = $("privacyOptionsButton");
    if (!button) return false;
    try {
      button.hidden = !Boolean(window.AndroidConsentBridge?.isPrivacyOptionsRequired());
    } catch (_error) {
      button.hidden = true;
    }
    return !button.hidden;
  }

  function handleAndroidBack() {
    if (!$('adOverlay').hidden) return true;
    if (!$('postcardRewardOverlay').hidden) {
      completePostcardReward();
      return true;
    }
    if (!$('gameOverOverlay').hidden) {
      hideOverlay("gameOverOverlay");
      returnHome();
      return true;
    }
    const transient = ["tutorialOverlay", "settingsOverlay", "statsOverlay", "postcardsOverlay"]
      .find((id) => !$(id).hidden);
    if (transient) {
      hideOverlay(transient);
      return true;
    }
    if (activeScreen === "game") {
      returnHome();
      return true;
    }
    return false;
  }

  function exposeNativeApi() {
    window.BLOCK_DROP = {
      saveNow() {
        saveAndCommitTime();
        return true;
      },
      handleAndroidBack,
      refreshPrivacyOptions
    };
  }

  function animateNumber(element, from, to, duration) {
    cancelAnimationFrame(scoreAnimation);
    const start = performance.now();
    const delta = to - from;
    const frame = (now) => {
      const ratio = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      element.textContent = formatScore(Math.round(from + delta * eased));
      if (ratio < 1) scoreAnimation = requestAnimationFrame(frame);
    };
    scoreAnimation = requestAnimationFrame(frame);
  }

  function setHint(text, duration = 1200) {
    $("gameHint").textContent = text;
    if (duration > 0) window.setTimeout(() => {
      if (!eraseMode) $("gameHint").textContent = "Glisse une pièce sur la grille";
    }, duration);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2050);
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value || 0)).toLocaleString("fr-FR");
  }

  function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }

  function colorHex(color) {
    return {
      blue: "#2eb9f0", turquoise: "#2fd6c7", green: "#6bd663", yellow: "#ffca45", orange: "#ff963b", red: "#f65c61", violet: "#8f65e8"
    }[color] || "#fff";
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const safeRegister = (tool) => {
      try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_error) { /* Unsupported preview. */ }
    };

    safeRegister({
      name: "get_game_state",
      title: "Lire la partie BLOCK DROP",
      description: "Retourne le score, la grille et les pièces disponibles sans modifier la partie.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const country = COUNTRIES[countryIndexForLevel(meta.level)];
        return {
          score: engine.score,
          bestScore: meta.bestScore,
          level: meta.level,
          levelLines: meta.levelLines,
          levelTarget: targetForLevel(meta.level),
          country: country.name,
          postcards: meta.unlockedPostcards.length,
          board: engine.board.slice(),
          pieces: engine.pieces.filter((piece) => !piece.used).map((piece, index) => ({ index, shapeId: piece.shapeId, color: piece.color }))
        };
      }
    });

    safeRegister({
      name: "start_new_game",
      title: "Nouvelle partie BLOCK DROP",
      description: "Démarre immédiatement une nouvelle partie visible de BLOCK DROP.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        enterGame(true);
        return { started: true, score: engine.score };
      }
    });

    safeRegister({
      name: "place_block_piece",
      title: "Placer une pièce BLOCK DROP",
      description: "Place une pièce disponible sur la grille avec son index, sa ligne et sa colonne de départ.",
      inputSchema: {
        type: "object",
        properties: { pieceIndex: { type: "integer", minimum: 0, maximum: 2 }, row: { type: "integer", minimum: 0, maximum: 7 }, col: { type: "integer", minimum: 0, maximum: 7 } },
        required: ["pieceIndex", "row", "col"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const { pieceIndex, row, col } = input || {};
        if (![pieceIndex, row, col].every(Number.isInteger)) throw new Error("pieceIndex, row et col doivent être des nombres entiers.");
        const piece = engine.pieces[pieceIndex];
        if (!piece || piece.used || !engine.canPlace(piece, row, col)) throw new Error("Placement impossible.");
        if (activeScreen !== "game") enterGame(false);
        inputLocked = true;
        const result = engine.place(piece.uid, row, col);
        await processPlacement(result);
        return { placed: true, score: engine.score, linesCleared: result.lineCount, combo: result.combo, gameOver: result.gameOver };
      }
    });
  }

  function registerServiceWorker() {
    if (nativeAdsAvailable || !("serviceWorker" in navigator) || location.protocol !== "https:") return;
    void navigator.serviceWorker.register("./sw.js").catch(() => {
      // Installation remains optional; gameplay is never blocked by caching.
    });
  }

  function exposeTestHooks() {
    window.__BLOCK_DROP_TEST__ = {
      getState: () => engine.getState(),
      getMeta: () => ({ ...meta }),
      getJourney: () => ({
        level: meta.level,
        lines: meta.levelLines,
        target: targetForLevel(meta.level),
        country: COUNTRIES[countryIndexForLevel(meta.level)].name,
        levelsUntilPostcard: levelsUntilPostcard(meta.level),
        postcards: meta.unlockedPostcards.slice()
      }),
      startNewGame: () => enterGame(true),
      enterGame: () => enterGame(false),
      findFirstPlacement(pieceIndex = 0) {
        const piece = engine.pieces[pieceIndex];
        return piece ? engine.findPlacements(piece)[0] || null : null;
      },
      async place(pieceIndex, row, col) {
        const piece = engine.pieces[pieceIndex];
        if (!piece || !engine.canPlace(piece, row, col)) return { ok: false };
        inputLocked = true;
        const result = engine.place(piece.uid, row, col);
        await processPlacement(result);
        return result;
      },
      showGameOver,
      useSecondChance
    };
  }

  init();
})();
