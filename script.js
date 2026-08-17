/* =========================================================
   SCIVENTURE - MAIN JAVASCRIPT
   Screen switching + loading + music + basic interactions
   ========================================================= */


/* =========================================================
   1. GET ELEMENTS
   ========================================================= */

const screens = document.querySelectorAll(".screen");

const bgMusic = document.getElementById("bgMusic");

const loadingProgress = document.getElementById("loadingProgress");
const loadingPercent = document.getElementById("loadingPercent");
let gameLoopRunning = false;
let gameFrameId = null;
let levelCompleted = false; // tracks whether the current level goal has been reached

/* =========================================================
   1.5 SCREEN BACKGROUNDS  (EASY TO EDIT!)

   Want to change the background picture behind any screen?
   Just change the file path below - nothing else to touch.
   Point it at any image inside the "images" folder, or set
   it to null to use no image (plain color background).

   Note: the in-level GAME backgrounds (Kinetic Meadow, Force
   Falls, etc.) are set separately, per-level, in the
   "bgImage" field of each entry in the LEVELS array further
   down this file - because each kingdom needs its own image.
   ========================================================= */

const SCREEN_BACKGROUNDS = {
    loadingScreen:     "images/bg.jpg",
    menuScreen:        "images/bg.jpg",
    customizeScreen:   "images/bg.jpg",
    profileScreen:     "images/bg.jpg",
    shopScreen:        "images/bg.jpg",
    inventoryScreen:   "images/bg.jpg",
    mapScreen:         "images/map-bg.png"
};

function applyScreenBackgrounds() {

    Object.keys(SCREEN_BACKGROUNDS).forEach(screenId => {

        const el = document.getElementById(screenId);

        if (!el) return;

        const path = SCREEN_BACKGROUNDS[screenId];

        el.style.setProperty(
            "--screen-bg",
            path ? "url('" + path + "')" : "none"
        );

    });

}

applyScreenBackgrounds();


/* =========================================================
   2. SCREEN SWITCHING
   ========================================================= */

function showScreen(screenId) {

    /*
       Clear any held movement keys whenever we switch
       screens, so nothing can stay "stuck" and keep moving
       the player after we leave/enter a level.
    */
    if (typeof resetKeys === "function") {
        resetKeys();
    }

    screens.forEach(screen => {
        screen.classList.remove("active");
    });

    const targetScreen = document.getElementById(screenId);

    if (targetScreen) {
        targetScreen.classList.add("active");
    }

    /* Switch back to the default menu music on every screen
       except the game screen - that one sets its own per-level
       track itself (see switchMusic() inside startLevel()). */

    if (screenId !== "gameScreen") {
        switchMusic(DEFAULT_MUSIC);
    }
}


/* =========================================================
   3. START BACKGROUND MUSIC
   ========================================================= */

/* The default track, used on the menu/customize/shop/etc.
   screens and as a fallback for any level that doesn't set
   its own "bgMusic" in the LEVELS array below. */
const DEFAULT_MUSIC = "audio/bgm/background.mp3";

const bgMusicSource = document.getElementById("bgMusicSource");

/* Remembers which track is currently loaded so we don't
   reload/restart the same file every time (e.g. re-entering
   the same level, or switching between menu screens). */
let currentMusicTrack = DEFAULT_MUSIC;

/* =========================================================
   3.5 SWITCH MUSIC TRACK  (EASY TO EDIT!)

   Call switchMusic("path/to/file.mp3") any time you want a
   different song to start playing. If that file is already
   the one playing, nothing happens (no restart/stutter).

   Per-location tracks are set via the "bgMusic" field on each
   entry in the LEVELS array further down this file - just
   like "bgImage" controls each kingdom's background picture.
   ========================================================= */

function switchMusic(trackPath) {

    if (!bgMusic || !bgMusicSource) return;

    const path = trackPath || DEFAULT_MUSIC;

    if (currentMusicTrack === path) {
        /* Same track already loaded - just make sure it's playing. */
        if (bgMusic.paused) {
            startMusic();
        }
        return;
    }

    currentMusicTrack = path;

    const wasPlaying = !bgMusic.paused;

    bgMusicSource.src = path;
    bgMusic.load();

    if (wasPlaying) {
        startMusic();
    }
}

function startMusic() {

    if (!bgMusic) return;

    applyMusicVolume();

    const playPromise = bgMusic.play();

    if (playPromise !== undefined) {

        playPromise.catch(() => {

            console.log(
                "Music is waiting for user interaction."
            );

        });

    }
}


/*
   Browsers normally prevent websites from automatically
   playing audio.

   The first click/key press will start the music.
*/

document.addEventListener("click", startMusic, {
    once: true
});

document.addEventListener("keydown", startMusic, {
    once: true
});


/* =========================================================
   3.6 SOUND EFFECTS  (EASY TO EDIT!)

   All SFX are synthesized on the fly with the Web Audio API -
   no extra audio files needed, so nothing to download and
   nothing that can 404. Volume/mute works just like the music
   settings above and is saved to localStorage separately, so
   players can turn one off without the other.

   Want a sound to feel different? Tweak the numbers inside its
   play___Sound() function below (frequencies, durations,
   waveform "type"). Want a brand-new effect? Copy one of the
   small helpers (tone/sweep/noiseBurst) and call it with your
   own numbers.
   ========================================================= */

let sfxContext = null;

function getSfxContext() {

    if (sfxContext) return sfxContext;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    if (!AudioCtx) return null;

    sfxContext = new AudioCtx();

    return sfxContext;

}

/* Unlock/resume the audio context on the very first user
   gesture - same restriction browsers apply to <audio>. */
function unlockSfxContext() {

    const ctx = getSfxContext();

    if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
    }

}

document.addEventListener("click", unlockSfxContext, { once: true });
document.addEventListener("keydown", unlockSfxContext, { once: true });
document.addEventListener("pointerdown", unlockSfxContext, { once: true });

function getSfxVolume() {

    const saved = localStorage.getItem("sfxVolume");

    const value = saved === null ? 60 : Number(saved);

    if (isNaN(value)) return 60;

    return Math.min(100, Math.max(0, value));

}

function setSfxVolume(value) {

    localStorage.setItem(
        "sfxVolume",
        Math.min(100, Math.max(0, value))
    );

}

function isSfxMuted() {

    return localStorage.getItem("sfxMuted") === "true";

}

function setSfxMuted(muted) {

    localStorage.setItem("sfxMuted", muted ? "true" : "false");

}

/* Master gain for every effect, 0-1, folding in mute + the
   saved volume slider together. */
function getSfxMasterGain() {

    if (isSfxMuted()) return 0;

    return getSfxVolume() / 100;

}

/* ---------------------------------------------------------
   LOW-LEVEL HELPERS
   Every play___Sound() function below is built from these
   three building blocks.
   ---------------------------------------------------------- */

/* A single tone that fades in fast and out smoothly. */
function sfxTone(freq, duration, type, startGain, delay) {

    const ctx = getSfxContext();

    if (!ctx) return;

    const master = getSfxMasterGain();

    if (master <= 0) return;

    const when = ctx.currentTime + (delay || 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, when);

    const peak = (startGain === undefined ? 0.3 : startGain) * master;

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(when);
    osc.stop(when + duration + 0.02);

}

/* A tone that glides from one frequency to another - great for
   jumps (rising) and hits/misses (falling). */
function sfxSweep(freqFrom, freqTo, duration, type, startGain, delay) {

    const ctx = getSfxContext();

    if (!ctx) return;

    const master = getSfxMasterGain();

    if (master <= 0) return;

    const when = ctx.currentTime + (delay || 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freqFrom, when);
    osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freqTo),
        when + duration
    );

    const peak = (startGain === undefined ? 0.3 : startGain) * master;

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(when);
    osc.stop(when + duration + 0.02);

}

/* Short burst of filtered white noise - used for the sword
   swing "whoosh" and the coin/hit "impact" transient. */
function sfxNoiseBurst(duration, filterFreq, startGain, delay) {

    const ctx = getSfxContext();

    if (!ctx) return;

    const master = getSfxMasterGain();

    if (master <= 0) return;

    const when = ctx.currentTime + (delay || 0);

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterFreq || 1200, when);

    const gain = ctx.createGain();

    const peak = (startGain === undefined ? 0.25 : startGain) * master;

    gain.gain.setValueAtTime(peak, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(when);
    noise.stop(when + duration + 0.02);

}

/* ---------------------------------------------------------
   PLAYABLE SOUND EFFECTS
   Call any of these from wherever the matching game event
   happens.
   ---------------------------------------------------------- */

/* Small UI blip - menu buttons, tabs, etc. */
function playClickSound() {
    sfxTone(520, 0.07, "square", 0.15);
}

/* Rising sweep for jumping. */
function playJumpSound() {
    sfxSweep(320, 700, 0.18, "square", 0.22);
}

/* Bright two-note "coin" chime, the classic 8-bit pickup. */
function playCoinSound() {
    sfxTone(988, 0.09, "square", 0.22);
    sfxTone(1319, 0.16, "square", 0.22, 0.07);
}

/* Falling buzzy tone + a short impact thump for taking damage. */
function playHitSound() {
    sfxSweep(300, 90, 0.22, "sawtooth", 0.22);
    sfxNoiseBurst(0.12, 300, 0.3);
}

/* Metallic "clink" for the golden shield absorbing a hit. */
function playShieldSound() {
    sfxTone(900, 0.1, "triangle", 0.22);
    sfxTone(1400, 0.12, "triangle", 0.16, 0.02);
}

/* Whoosh + clang for the sword swing. */
function playSwordSound() {
    sfxNoiseBurst(0.14, 2200, 0.2);
    sfxTone(660, 0.1, "triangle", 0.18, 0.05);
}

/* Cheerful ascending arpeggio for a correct quiz answer. */
function playCorrectSound() {
    sfxTone(523, 0.1, "square", 0.2);
    sfxTone(659, 0.1, "square", 0.2, 0.09);
    sfxTone(784, 0.18, "square", 0.22, 0.18);
}

/* Descending "buzzer" for a wrong quiz answer / timeout. */
function playWrongSound() {
    sfxSweep(300, 140, 0.28, "sawtooth", 0.2);
}

/* Short triumphant fanfare for finishing a level. */
function playLevelCompleteSound() {
    sfxTone(523, 0.14, "square", 0.22);
    sfxTone(659, 0.14, "square", 0.22, 0.13);
    sfxTone(784, 0.14, "square", 0.22, 0.26);
    sfxTone(1046, 0.32, "square", 0.24, 0.39);
}

/* Slow descending tone for game over. */
function playGameOverSound() {
    sfxTone(392, 0.22, "sawtooth", 0.22);
    sfxTone(311, 0.22, "sawtooth", 0.22, 0.2);
    sfxTone(220, 0.4, "sawtooth", 0.22, 0.4);
}

/* Generic "click" for every menu button, so navigating the UI
   has a bit of tactile feedback. Skips the on-screen touch
   D-pad/jump/attack buttons (those already get their own game
   sounds - jump, attack, etc - a click on top would double up)
   and the quiz answer buttons (those play correct/wrong
   instead). Runs on the capture phase so it fires even for
   buttons that stopPropagation() in their own handler. */
document.addEventListener("click", (event) => {

    const button = event.target.closest("button");

    if (!button) return;

    if (button.classList.contains("answerBtn")) return;

    const skipIds = [
        "touchLeftBtn",
        "touchRightBtn",
        "touchJumpBtn",
        "touchAttackBtn",
        "attackBtn"
    ];

    if (skipIds.indexOf(button.id) !== -1) return;

    playClickSound();

}, true);


/* =========================================================
   4. LOADING SCREEN
   ========================================================= */

let progress = 0;

const loadingTimer = setInterval(() => {

    progress += 2;

    if (progress > 100) {
        progress = 100;
    }

    if (loadingProgress) {
        loadingProgress.style.width = progress + "%";
    }

    if (loadingPercent) {
        loadingPercent.textContent = progress + "%";
    }

    if (progress >= 100) {

        clearInterval(loadingTimer);

        setTimeout(() => {

            showScreen("menuScreen");

        }, 400);

    }

}, 40);


/* =========================================================
   5. MENU BUTTONS
   ========================================================= */

const playBtn = document.getElementById("playBtn");
const customizeBtn = document.getElementById("customizeBtn");
const shopBtn = document.getElementById("shopBtn");
const settingsBtn = document.getElementById("settingsBtn");
const exitBtn = document.getElementById("exitBtn");


/* PLAY */

if (playBtn) {

    playBtn.addEventListener("click", () => {

        startMusic();

        /* First time on this device? Ask for a name. */
        if (!getPlayerName()) {

            openNameModal(() => {
                showScreen("mapScreen");
            });

            return;

        }

        showScreen("mapScreen");

    });

}


/* CHANGE NAME (from the menu screen) */

const menuChangeNameBtn =
    document.getElementById("menuChangeNameBtn");

if (menuChangeNameBtn) {

    menuChangeNameBtn.addEventListener("click", () => {

        openNameModal();

    });

}


/* NAME MODAL */

const nameModalSaveBtn =
    document.getElementById("nameModalSaveBtn");

if (nameModalSaveBtn) {

    nameModalSaveBtn.addEventListener("click", trySaveName);

}

const nameModalInput =
    document.getElementById("nameModalInput");

if (nameModalInput) {

    nameModalInput.addEventListener("keydown", (e) => {

        if (e.key === "Enter") {
            trySaveName();
        }

    });

}


/* Show the saved player name (if any) on the menu as soon as
   the game loads. */
updateMenuPlayerName();
updateScoreDisplay();


/* CUSTOMIZE */

if (customizeBtn) {

    customizeBtn.addEventListener("click", () => {

        startMusic();

        renderCharacterGrid();
        applyCharacterSprites();

        showScreen("customizeScreen");

    });

}

/* PROFILE */

const profileBtn = document.getElementById("profileBtn");

/* Fills in the profile screen with the player's name, current
   total score, and their currently active (selected)
   character - reads the same saved data the menu/customize
   screens already use, so it always stays in sync. */
function renderProfile() {

    const nameEl =
        document.getElementById("profilePlayerName");

    if (nameEl) {
        nameEl.textContent = getPlayerName() || "Explorer";
    }

    const scoreEl =
        document.getElementById("profileScore");

    if (scoreEl) {
        scoreEl.textContent = getScore().toLocaleString();
    }

    const character =
        getCharacterByKey(getSelectedCharacterKey());

    const imgEl =
        document.getElementById("profileCharacterImg");

    if (imgEl) {
        imgEl.src = character.image;
        imgEl.alt = character.name;
    }

    const charNameEl =
        document.getElementById("profileCharacterName");

    if (charNameEl) {
        charNameEl.textContent = character.name;
    }

}

if (profileBtn) {

    profileBtn.addEventListener("click", () => {

        startMusic();

        renderProfile();

        showScreen("profileScreen");

    });

}

const profileBackBtn =
    document.getElementById("profileBackBtn");

if (profileBackBtn) {

    profileBackBtn.addEventListener("click", () => {

        showScreen("menuScreen");

    });

}


/* SHOP */
if (shopBtn) {

    shopBtn.addEventListener("click", () => {

        window.showScreen("shopScreen");

    });

}

/* INVENTORY (used to be a direct-download PRIZE button - now
   opens a screen that shows every item bought in the shop, plus
   the grand prize claim once it's unlocked). */
const prizeBtn = document.getElementById("prizeBtn");

if (prizeBtn) {

    prizeBtn.addEventListener("click", () => {

        startMusic();

        renderInventory();

        showScreen("inventoryScreen");

    });

}

const inventoryBackBtn =
    document.getElementById("inventoryBackBtn");

if (inventoryBackBtn) {

    inventoryBackBtn.addEventListener("click", () => {

        showScreen("menuScreen");

    });

}

const inventoryClaimPrizeBtn =
    document.getElementById("inventoryClaimPrizeBtn");

if (inventoryClaimPrizeBtn) {

    inventoryClaimPrizeBtn.addEventListener("click", claimPrize);

}

/* =========================================================
   SETTINGS

   Music volume + mute (saved to localStorage, read by
   applyMusicVolume() above) and a "reset progress" button
   that wipes coins, score, unlocked locations, and owned
   shop items so the game can start fresh.
   ========================================================= */

function getMusicVolume() {

    const saved = localStorage.getItem("musicVolume");

    const value = saved === null ? 50 : Number(saved);

    if (isNaN(value)) return 50;

    return Math.min(100, Math.max(0, value));

}

function setMusicVolume(value) {

    localStorage.setItem(
        "musicVolume",
        Math.min(100, Math.max(0, value))
    );

}

function isMusicMuted() {

    return localStorage.getItem("musicMuted") === "true";

}

function setMusicMuted(muted) {

    localStorage.setItem("musicMuted", muted ? "true" : "false");

}

/* Applies the saved volume/mute settings to the <audio>
   element. Called on load and any time settings change. */
function applyMusicVolume() {

    if (!bgMusic) return;

    bgMusic.volume = isMusicMuted() ? 0 : (getMusicVolume() / 100);

}

applyMusicVolume();

const settingsModal =
    document.getElementById("settingsModal");

const musicVolumeSlider =
    document.getElementById("musicVolumeSlider");

const musicMuteToggle =
    document.getElementById("musicMuteToggle");

const sfxVolumeSlider =
    document.getElementById("sfxVolumeSlider");

const sfxMuteToggle =
    document.getElementById("sfxMuteToggle");

const resetProgressBtn =
    document.getElementById("resetProgressBtn");

const settingsCloseBtn =
    document.getElementById("settingsCloseBtn");

if (settingsBtn) {

    settingsBtn.addEventListener("click", () => {

        if (musicVolumeSlider) {
            musicVolumeSlider.value = getMusicVolume();
        }

        if (musicMuteToggle) {
            musicMuteToggle.checked = isMusicMuted();
        }

        if (sfxVolumeSlider) {
            sfxVolumeSlider.value = getSfxVolume();
        }

        if (sfxMuteToggle) {
            sfxMuteToggle.checked = isSfxMuted();
        }

        if (settingsModal) {
            settingsModal.classList.add("active");
        }

    });

}

if (musicVolumeSlider) {

    musicVolumeSlider.addEventListener("input", () => {

        setMusicVolume(Number(musicVolumeSlider.value));

        /* Adjusting the slider while muted un-mutes, so the
           player can actually hear the change they're making. */
        if (musicMuteToggle && musicMuteToggle.checked) {
            musicMuteToggle.checked = false;
            setMusicMuted(false);
        }

        applyMusicVolume();

    });

}

if (musicMuteToggle) {

    musicMuteToggle.addEventListener("change", () => {

        setMusicMuted(musicMuteToggle.checked);
        applyMusicVolume();

    });

}

if (sfxVolumeSlider) {

    sfxVolumeSlider.addEventListener("input", () => {

        setSfxVolume(Number(sfxVolumeSlider.value));

        /* Adjusting the slider while muted un-mutes, so the
           player can actually hear the change they're making. */
        if (sfxMuteToggle && sfxMuteToggle.checked) {
            sfxMuteToggle.checked = false;
            setSfxMuted(false);
        }

    });

    /* Play a sample beep once the player lets go of the
       slider, so they can hear the new volume immediately. */
    sfxVolumeSlider.addEventListener("change", () => {
        playCoinSound();
    });

}

if (sfxMuteToggle) {

    sfxMuteToggle.addEventListener("change", () => {

        setSfxMuted(sfxMuteToggle.checked);

        if (!sfxMuteToggle.checked) {
            playCoinSound();
        }

    });

}

if (resetProgressBtn) {

    resetProgressBtn.addEventListener("click", () => {

        const sure = confirm(
            "This will erase all coins, score, unlocked " +
            "locations, and shop items. This can't be undone.\n\n" +
            "Reset progress?"
        );

        if (!sure) return;

        const keysToClear = [
            "walletCoins",
            "totalScore",
            "unlockedLevel",
            "selectedCharacter",
            "playerHue",
            "owns_sword",
            "owns_shield",
            "count_crystalBall",
            "count_magicKey",
            "count_healthPotion",
            "count_megaHeart",
            "prizeUnlocked"
        ];

        keysToClear.forEach(key => {
            localStorage.removeItem(key);
        });

        if (settingsModal) {
            settingsModal.classList.remove("active");
        }

        alert("✅ Progress has been reset!");

        location.reload();

    });

}

if (settingsCloseBtn) {

    settingsCloseBtn.addEventListener("click", () => {

        if (settingsModal) {
            settingsModal.classList.remove("active");
        }

    });

}


/* EXIT */

if (exitBtn) {

    exitBtn.addEventListener("click", () => {

        const confirmExit = confirm(
            "Exit SciVenture?"
        );

        if (confirmExit) {

            /*
               Browsers usually prevent JavaScript
               from closing a normal tab.

               So instead, we return to the loading screen.
            */

            showScreen("loadingScreen");

        }

    });

}


/* =========================================================
   6. CUSTOMIZE SYSTEM
   ========================================================= */

const characterPreview =
    document.getElementById("characterPreview");


/* =========================================================
   6.5 UNLOCKABLE CHARACTERS

   Special explorers earned by finishing a kingdom. Each one
   carries its own passive perk that only applies while it's
   the selected character (see startLevel/damagePlayer/
   updateSuiShieldCooldown/buildMonsters/useMagicKey for where
   each perk hooks in).

   "requiredLevelId" is the LEVELS[].id that must be COMPLETED
   (not just reached) to unlock the character. Finishing a
   level sets unlockedLevel to (that level's id + 1), so a
   character unlocks once getUnlockedLevel() > requiredLevelId.
   ========================================================= */

const CHARACTERS = [

    {
        key: "default",
        name: "Explorer",
        image: "images/player-map.png",
        gameImage: "images/player-frames/idle-1.png",
        requiredLevelId: null,
        levelName: null,
        perkText: "Default Character"
    },

    {
        key: "sui",
        name: "Sui",
        image: "images/characters/sui.png",
        gameImage: "images/sui-frames/idle-1.png",
        requiredLevelId: 1,
        levelName: "Kinetic Meadow",
        perkText: "🛡️ Shield: 20s cooldown"
    },

    {
        key: "aqua",
        name: "Aqua",
        image: "images/characters/aqua.png",
        gameImage: "images/aqua-frames/idle-1.png",
        requiredLevelId: 2,
        levelName: "Force Falls",
        perkText: "🌊 No damage from wrong answers (5x/level)"
    },

    {
        key: "azaic",
        name: "Azaic",
        image: "images/characters/azaic.png",
        gameImage: "images/azaic-frames/idle-1.png",
        requiredLevelId: 3,
        levelName: "Momentum City",
        perkText: "⚡ Monsters move slower"
    },

    {
        key: "mualene",
        name: "Mualene",
        image: "images/characters/mualene.png",
        gameImage: "images/mualene-frames/idle-1.png",
        requiredLevelId: 4,
        levelName: "Energy Volcano",
        perkText: "🔑 3 free skips per game"
    },

    {
        key: "corvin",
        name: "Corvin",
        image: "images/characters/corvin.png",
        gameImage: "images/corvin-frames/idle-1.png",
        requiredLevelId: 5,
        levelName: "Gravitas Kingdom",
        perkText: "💜 +2 max lives, no fall damage"
    }

];

function getCharacterByKey(key) {

    return CHARACTERS.find(character => character.key === key)
        || CHARACTERS[0];

}

function isCharacterUnlocked(character) {

    if (character.requiredLevelId === null) return true;

    return getUnlockedLevel() > character.requiredLevelId;

}

function getSelectedCharacterKey() {

    const saved = localStorage.getItem("selectedCharacter");

    if (!saved) return "default";

    /* Guard against a saved character that's no longer
       unlocked (e.g. storage was edited/shared) - fall back
       to the default explorer rather than letting a locked
       skin sneak into play. */
    const character = getCharacterByKey(saved);

    return isCharacterUnlocked(character) ? saved : "default";

}

function setSelectedCharacterKey(key) {

    localStorage.setItem("selectedCharacter", key);

}

/* The single square image used for the map + game sprite.
   Characters with their own animation frames (currently the
   default explorer, Sui, and Azaic) use their first idle frame
   as the in-game sprite, swapped for real frames once movement
   starts; everything else (preview, map, or a character with no
   animation frames) falls back to the one square portrait. */
function getCharacterSpriteSrc(character, context) {

    if (context === "game" && character.gameImage) {

        return character.gameImage;

    }

    return character.image;

}

/* Applies the selected character's art to every sprite slot
   on screen: the customize preview, the map sprite, and -
   if a level is currently running - the in-game sprite. */
function applyCharacterSprites() {

    const character =
        getCharacterByKey(getSelectedCharacterKey());

    const filter = "none";

    if (characterPreview) {

        characterPreview.src =
            getCharacterSpriteSrc(character, "preview");

        characterPreview.style.filter = filter;

    }

    const mapCharacterEl =
        document.getElementById("mapCharacter");

    if (mapCharacterEl) {

        mapCharacterEl.src =
            getCharacterSpriteSrc(character, "map");

        mapCharacterEl.style.filter = filter;

    }

    const gamePlayerEl =
        document.getElementById("gamePlayer");

    if (gamePlayerEl) {

        gamePlayerEl.src =
            getCharacterSpriteSrc(character, "game");

        gamePlayerEl.style.filter = filter;

    }

}

function renderCharacterGrid() {

    const grid = document.getElementById("characterGrid");

    if (!grid) return;

    const selectedKey = getSelectedCharacterKey();

    grid.innerHTML = "";

    CHARACTERS.forEach(character => {

        const unlocked = isCharacterUnlocked(character);

        const card = document.createElement("div");

        card.className = "character-card";

        card.classList.toggle("locked", !unlocked);
        card.classList.toggle(
            "selected",
            character.key === selectedKey
        );

        const img = document.createElement("img");
        img.src = character.image;
        img.alt = character.name;

        const nameEl = document.createElement("div");
        nameEl.className = "char-name";
        nameEl.textContent = character.name;

        const perkEl = document.createElement("div");
        perkEl.className = "char-perk";
        perkEl.textContent = character.perkText;

        card.appendChild(img);
        card.appendChild(nameEl);
        card.appendChild(perkEl);

        if (!unlocked) {

            const lockBadge = document.createElement("div");
            lockBadge.className = "lock-badge";
            lockBadge.textContent = "🔒";
            card.appendChild(lockBadge);

            const lockText = document.createElement("div");
            lockText.className = "char-lock";
            lockText.textContent =
                "Beat " + character.levelName;
            card.appendChild(lockText);

        }

        card.addEventListener("click", () => {

            if (!unlocked) {

                alert(
                    "🔒 " + character.name + " is locked!\n\n" +
                    "Finish " + character.levelName +
                    " to unlock this explorer."
                );

                return;

            }

            setSelectedCharacterKey(character.key);

            renderCharacterGrid();
            applyCharacterSprites();

        });

        grid.appendChild(card);

    });

}

renderCharacterGrid();
applyCharacterSprites();


/* =========================================================
   7. CUSTOMIZE BACK BUTTON
   ========================================================= */

const customizeBackBtn =
    document.getElementById("customizeBackBtn");

if (customizeBackBtn) {

    customizeBackBtn.addEventListener("click", () => {

        showScreen("menuScreen");

    });

}





/* =========================================================
   10. SHOP / COIN ECONOMY

   Coins are earned in levels and saved to a persistent
   wallet. Sword and shield must be bought before you have
   them - they no longer come for free.
   ========================================================= */

const SHOP_ITEMS = {
    sword: { price: 50, type: "owned", label: "🗡️" },
    shield: { price: 75, type: "owned", label: "🛡️" },
    crystalBall: { price: 30, type: "count", label: "🔮" },
    magicKey: { price: 100, type: "count", label: "🔑" },
    healthPotion: { price: 10, type: "count", label: "🧪" },
    megaHeart: { price: 15, type: "count", label: "❤️" }
};

function getWallet() {

    const saved = Number(localStorage.getItem("walletCoins"));

    return saved > 0 ? saved : 0;

}

function setWallet(amount) {

    localStorage.setItem("walletCoins", Math.max(0, amount));

}

function addCoins(amount) {

    setWallet(getWallet() + amount);

}


/* =========================================================
   10.5 SCORE

   Points:
     Correct answer        -> +100
     Coin collected         -> +10
     Monster defeated       -> +50
     Location completed     -> bonus (see LOCATION_BONUS below)

   The running total is saved to localStorage (same pattern as
   the coin wallet above) so it survives reloads.
   ========================================================= */

const POINTS_CORRECT_ANSWER = 100;
const POINTS_COIN = 10;
const POINTS_MONSTER_DEFEATED = 50;

/* Bonus for finishing a location: a flat 200, plus 50 for each
   heart still remaining - rewards finishing clean as well as
   just finishing. */
function getLocationBonus() {

    return 200 + (livesCount * 50);

}

function getScore() {

    const saved = Number(localStorage.getItem("totalScore"));

    return saved > 0 ? saved : 0;

}

function setScore(amount) {

    localStorage.setItem("totalScore", Math.max(0, amount));

    updateScoreDisplay();

}

function addScore(amount) {

    setScore(getScore() + amount);

}

function updateScoreDisplay() {

    const scoreEl =
        document.getElementById("scoreCounter");

    if (!scoreEl) return;

    scoreEl.textContent =
        "⭐ " + getScore().toLocaleString();

}

/* ---------------------------------------------------------
   PLAYER NAME
   --------------------------------------------------------- */

function getPlayerName() {

    return localStorage.getItem("playerName") || "";

}

function setPlayerName(name) {

    localStorage.setItem("playerName", name);

    updateMenuPlayerName();

}

function updateMenuPlayerName() {

    const nameEl =
        document.getElementById("menuPlayerName");

    if (nameEl) {
        nameEl.textContent = getPlayerName() || "Explorer";
    }

}

/* Opens the name modal. onDone (optional) is called after a
   valid name is saved - used so the PLAY button can ask for a
   name the first time, then continue into the map. */
function openNameModal(onDone) {

    const modal =
        document.getElementById("nameModal");

    const input =
        document.getElementById("nameModalInput");

    const error =
        document.getElementById("nameModalError");

    if (!modal || !input) return;

    input.value = getPlayerName();
    if (error) error.textContent = "";

    modal.classList.add("active");
    input.focus();

    nameModalOnDone = onDone || null;

}

function closeNameModal() {

    const modal =
        document.getElementById("nameModal");

    if (modal) modal.classList.remove("active");

    nameModalOnDone = null;

}

let nameModalOnDone = null;

function trySaveName() {

    const input =
        document.getElementById("nameModalInput");

    const error =
        document.getElementById("nameModalError");

    if (!input) return;

    const name = input.value.trim().slice(0, 16);

    if (name.length === 0) {

        if (error) {
            error.textContent =
                "Please enter a name first!";
        }

        return;

    }

    setPlayerName(name);

    const callback = nameModalOnDone;

    closeNameModal();

    if (typeof callback === "function") {
        callback();
    }

}

function ownsItem(key) {

    const item = SHOP_ITEMS[key];

    if (!item) return false;

    if (item.type === "owned") {
        return localStorage.getItem("owns_" + key) === "true";
    }

    return getItemCount(key) > 0;

}

function getItemCount(key) {

    const saved = Number(localStorage.getItem("count_" + key));

    return saved > 0 ? saved : 0;

}

function buyItem(key) {

    const item = SHOP_ITEMS[key];

    if (!item) return;

    if (item.type === "owned" && ownsItem(key)) {
        return; // already own it
    }

    const wallet = getWallet();

    if (wallet < item.price) {

        alert("🪙 Not enough coins for that yet!");
        return;

    }

    setWallet(wallet - item.price);

    if (item.type === "owned") {

        localStorage.setItem("owns_" + key, "true");

    } else {

        localStorage.setItem(
            "count_" + key,
            getItemCount(key) + 1
        );

    }

    renderShop();

}

function renderShop() {

    const shopCoins = document.getElementById("shopCoins");

    if (shopCoins) {
        shopCoins.textContent = getWallet();
    }

    document.querySelectorAll(".buyBtn").forEach(button => {

        const key = button.dataset.item;
        const item = SHOP_ITEMS[key];

        if (!item) return;

        if (item.type === "owned" && ownsItem(key)) {

            button.textContent = "✅ Owned";
            button.classList.add("owned");
            button.disabled = true;

        } else if (item.type === "count") {

            const count = getItemCount(key);

            button.textContent =
                count > 0 ? "BUY (Owned: " + count + ")" : "BUY";

        }

    });

}


/* Friendly names for the inventory list - keys match SHOP_ITEMS
   above, so any item added to the shop just needs an entry
   here too. */
const SHOP_ITEM_NAMES = {
    sword: "Golden Sword",
    shield: "Golden Shield",
    crystalBall: "Crystal Ball",
    magicKey: "Magic Key",
    healthPotion: "Health Potion",
    megaHeart: "Mega Heart"
};

/* Fills in the 🎒 Inventory screen: every shop item the player
   currently owns (with a count for stackable items), plus the
   grand prize claim box once it's unlocked. Reuses the same
   .shop-item row markup as the shop screen itself. */
function renderInventory() {

    const coinsEl = document.getElementById("inventoryCoins");

    if (coinsEl) {
        coinsEl.textContent = getWallet();
    }

    const listEl = document.getElementById("inventoryItemsList");
    const emptyHint = document.getElementById("inventoryEmptyHint");

    let hasAnyItem = false;

    if (listEl) {

        listEl.innerHTML = "";

        Object.keys(SHOP_ITEMS).forEach(key => {

            if (!ownsItem(key)) return;

            hasAnyItem = true;

            const item = SHOP_ITEMS[key];

            const countLabel =
                item.type === "count"
                    ? "Owned: " + getItemCount(key)
                    : "Owned";

            const row = document.createElement("div");
            row.className = "shop-item";

            const sellPrice = getSellPrice(key);

            row.innerHTML =
                '<div class="item-icon">' + item.label + '</div>' +
                '<div class="item-info">' +
                    '<h2>' +
                        (SHOP_ITEM_NAMES[key] || key) +
                    '</h2>' +
                    '<p class="price">' + countLabel + '</p>' +
                '</div>' +
                '<button class="sellBtn" data-item="' + key + '">' +
                    'SELL 🪙' + sellPrice +
                '</button>';

            listEl.appendChild(row);

        });

    }

    if (emptyHint) {
        emptyHint.hidden = hasAnyItem;
    }

    const prizeBox = document.getElementById("inventoryPrizeBox");

    if (prizeBox) {
        prizeBox.hidden = !isPrizeUnlocked();
    }

}

/* Selling always pays 10 coins less than the item's shop price
   (floored at 0), e.g. the 🪙30 Crystal Ball sells for 🪙20. */
function getSellPrice(key) {

    const item = SHOP_ITEMS[key];

    if (!item) return 0;

    return Math.max(0, item.price - 10);

}

function sellItem(key) {

    const item = SHOP_ITEMS[key];

    if (!item || !ownsItem(key)) return;

    const sellPrice = getSellPrice(key);

    if (item.type === "owned") {

        const sure = confirm(
            "Sell " + (SHOP_ITEM_NAMES[key] || key) +
            " for 🪙" + sellPrice + "?\n\n" +
            "You'll need to buy it again to use it."
        );

        if (!sure) return;

        localStorage.removeItem("owns_" + key);

    } else {

        const count = getItemCount(key);

        if (count <= 0) return;

        localStorage.setItem("count_" + key, count - 1);

    }

    addCoins(sellPrice);

    renderInventory();
    renderShop();

}

const inventoryItemsListEl =
    document.getElementById("inventoryItemsList");

if (inventoryItemsListEl) {

    inventoryItemsListEl.addEventListener("click", event => {

        const button = event.target.closest(".sellBtn");

        if (!button) return;

        sellItem(button.dataset.item);

    });

}

const buyButtons = document.querySelectorAll(".buyBtn");

buyButtons.forEach(button => {

    button.addEventListener("click", () => {

        buyItem(button.dataset.item);

    });

});


const shopBtn2 = document.getElementById("shopBtn");

if (shopBtn2) {

    shopBtn2.addEventListener("click", renderShop);

}


/* Shop back button */

const shopBackBtn = document.getElementById("shopBackBtn");

if (shopBackBtn) {

    shopBackBtn.addEventListener("click", () => {

        showScreen("menuScreen");

    });

}


/* =========================================================
   11. LEVEL DEFINITIONS

   One config per kingdom. The engine below reads this data
   to build platforms, monsters, coins, the quiz, and the
   goal crystal - so every level shares the same Mario-style
   movement/combat code but looks and plays a little
   differently.
   ========================================================= */

const LEVELS = [

    {
        id: 1,
        key: "motionMeadow",
        name: "Kinetic Meadow",
        icon: "🌿",
        introSubject: "physics",
        crystalName: "Meadow Crystal",
        sceneDetails: "Rolling hills of tall grass and wildflowers, dotted with trees — a peaceful forest meadow.",
        theme: "theme-jungle",
        bgImage: "images/backgrounds/motion-meadow.jpg",
        bgMusic: "audio/bgm/motion-meadow.mp3",
        monsterCount: 5,
        /* Platform surfaceY values are all 195+ now, which puts
           their top edge above the tallest a ground monster can
           reach (monsters stay glued to bottom:130px, 65px tall,
           so their reach tops out around y=195) - so standing up
           here is genuinely safe. */
        platforms: [
            { xPercent: 18, widthPx: 180, surfaceY: 280 },
            { xPercent: 38, widthPx: 130, surfaceY: 220 },
            { xPercent: 55, widthPx: 160, surfaceY: 350 },
            { xPercent: 78, widthPx: 190, surfaceY: 290 }
        ],
        /* Holes: gaps in the ground you can fall through and
           take damage in if you don't jump over them. */
        holes: [
            { xPercent: 30, widthPx: 110 },
            { xPercent: 88, widthPx: 120 }
        ],
        coins: [
            { xPercent: 25, bottom: 160 },
            { xPercent: 40, bottom: 300 },
            { xPercent: 55, bottom: 150 },
            { xPercent: 68, bottom: 260 },
            { xPercent: 85, bottom: 170 }
        ],
        quizBank: [
            { question: "What is the formula for power?", choices: ["P = F × d", "P = W ÷ t", "P = m × v", "P = E × t"], correctIndex: 1, explanation: "Power is the rate work is done, so P = W ÷ t (work divided by time)." },
            { question: "The SI unit of power is:", choices: ["Joule", "Newton", "Watt", "Meter"], correctIndex: 2, explanation: "Power is measured in watts (W) — one watt equals one joule of work done every second." },
            { question: "One watt is equal to:", choices: ["1 joule per second", "1 newton per meter", "1 meter per second", "1 kilogram per second"], correctIndex: 0, explanation: "By definition, 1 watt = 1 joule of energy transferred per second." },
            { question: "If the same amount of work is done in less time, the power is:", choices: ["Less", "Greater", "Zero", "Unchanged"], correctIndex: 1, explanation: "Power = work ÷ time, so doing the same work in less time means a greater power." },
            { question: "A machine does 100 J of work in 5 seconds. What is its power?", choices: ["20 W", "50 W", "100 W", "500 W"], correctIndex: 0, explanation: "P = W ÷ t = 100 J ÷ 5 s = 20 W." },
            { question: "Which formula relates power, force, and velocity?", choices: ["P = Fv", "P = F ÷ v", "P = F + v", "P = v ÷ F"], correctIndex: 0, explanation: "When force and velocity point the same way, power equals their product: P = Fv." },
            { question: "A force of 10 N moves an object at 3 m/s in the same direction. What is the power?", choices: ["3 W", "13 W", "30 W", "300 W"], correctIndex: 2, explanation: "P = Fv = 10 N × 3 m/s = 30 W." },
            { question: "Power measures how fast:", choices: ["An object moves", "Work is done", "Force is applied", "Mass increases"], correctIndex: 1, explanation: "Power describes how fast work is done or energy is transferred, not how fast an object itself moves." },
            { question: "Which quantity is measured in joules?", choices: ["Power", "Force", "Work and energy", "Velocity"], correctIndex: 2, explanation: "The joule (J) is the SI unit for both work and energy, since work is a transfer of energy." },
            { question: "What is the unit of force?", choices: ["Watt", "Joule", "Newton", "Meter per second"], correctIndex: 2, explanation: "Force is measured in newtons (N), named after Sir Isaac Newton." }
        ]
    },

    {
        id: 2,
        key: "forceFalls",
        name: "Force Falls",
        icon: "💧",
        introSubject: "physics",
        crystalName: "Tide Crystal",
        sceneDetails: "Rushing waterfalls and tide pools lined with coral and sea plants, like a stretch of ocean shoreline.",
        theme: "theme-ocean",
        bgImage: "images/backgrounds/force-falls.jpg",
        bgMusic: "audio/bgm/force-falls.mp3",
        monsterCount: 5,
        platforms: [
            { xPercent: 22, widthPx: 170, surfaceY: 260 },
            { xPercent: 42, widthPx: 180, surfaceY: 330 },
            { xPercent: 63, widthPx: 170, surfaceY: 270 },
            { xPercent: 80, widthPx: 160, surfaceY: 340 }
        ],
        holes: [
            { xPercent: 33, widthPx: 100 },
            { xPercent: 72, widthPx: 110 }
        ],
        coins: [
            { xPercent: 20, bottom: 150 },
            { xPercent: 35, bottom: 280 },
            { xPercent: 50, bottom: 160 },
            { xPercent: 65, bottom: 260 },
            { xPercent: 88, bottom: 290 }
        ],
        quizBank: [
            { question: "If force and velocity are in the same direction, power can be calculated by:", choices: ["P = F × v", "P = F + v", "P = F − v", "P = F ÷ v"], correctIndex: 0, explanation: "When force and velocity point the same way, power is simply their product: P = F × v." },
            { question: "A person does 600 J of work in 20 seconds. What is the power?", choices: ["20 W", "30 W", "40 W", "50 W"], correctIndex: 1, explanation: "P = W ÷ t = 600 J ÷ 20 s = 30 W." },
            { question: "Which statement is TRUE about power and work?", choices: ["Power is the total amount of work.", "Power is the rate at which work is done.", "Work and power have the same unit.", "Power is measured in newtons."], correctIndex: 1, explanation: "Work is the total energy transferred; power is how quickly that work gets done." },
            { question: "If an object moves faster while the same force is applied, the power will:", choices: ["Decrease", "Stay the same", "Increase", "Become zero"], correctIndex: 2, explanation: "Since P = F × v, increasing velocity while the force stays the same increases power." },
            { question: "A machine uses 200 W of power for 10 seconds. How much energy does it transfer?", choices: ["20 J", "200 J", "2,000 J", "20,000 J"], correctIndex: 2, explanation: "Energy = power × time = 200 W × 10 s = 2,000 J." },
            { question: "Newton's First Law of Motion is also known as the Law of:", choices: ["Acceleration", "Inertia", "Action-Reaction", "Gravitation"], correctIndex: 1, explanation: "Newton's First Law says an object keeps its state of motion unless a force acts on it — this is the Law of Inertia." },
            { question: "A 10 kg object is pushed with a net force of 50 N. What is its acceleration?", choices: ["2 m/s²", "5 m/s²", "10 m/s²", "500 m/s²"], correctIndex: 1, explanation: "a = F ÷ m = 50 N ÷ 10 kg = 5 m/s²." },
            { question: "Which equation represents Newton's Second Law of Motion?", choices: ["F = mv", "F = ma", "W = mg", "v = d/t"], correctIndex: 1, explanation: "Newton's Second Law states force equals mass times acceleration: F = ma." },
            { question: "A box remains at rest on a table. Which statement is correct?", choices: ["No forces are acting on it.", "The net force acting on it is zero.", "Gravity is not acting on it.", "The box has no mass."], correctIndex: 1, explanation: "An object at rest has balanced forces on it (gravity down, the table pushing up), so the net force is zero — it isn't that no forces exist at all." },
            { question: "A person pulls a rope attached to a box with a force of 100 N. If friction is 30 N, what is the net force on the box?", choices: ["30 N", "70 N", "100 N", "130 N"], correctIndex: 1, explanation: "Net force = applied force − friction = 100 N − 30 N = 70 N." },
            { question: "In an ideal pulley system, the main purpose of a pulley is to:", choices: ["Increase the mass of an object", "Change the direction or reduce the effort needed to lift a load", "Remove gravity", "Stop an object from moving"], correctIndex: 1, explanation: "A pulley redirects the force needed to lift a load, and using several pulleys together can also reduce the effort required." },
            { question: "A 20 kg load is lifted upward with a constant velocity. What is the net force on the load?", choices: ["0 N", "20 N", "196 N", "392 N"], correctIndex: 0, explanation: "Constant velocity means zero acceleration, so by Newton's Second Law the net (lifting force vs. gravity) force must be 0 N." },
            { question: "A rope is used to pull two boxes in a straight line. The force transmitted through the rope is called:", choices: ["Friction", "Weight", "Tension", "Momentum"], correctIndex: 2, explanation: "The pulling force carried through a rope or cable is called tension." },
            { question: "A 5 kg object hangs from a rope and is at rest. Using g = 9.8 m/s², what is the tension in the rope?", choices: ["5 N", "9.8 N", "49 N", "98 N"], correctIndex: 2, explanation: "At rest, the tension balances the weight: T = mg = 5 kg × 9.8 m/s² = 49 N." },
            { question: "If the upward tension force on a hanging object is greater than its weight, the object will:", choices: ["Accelerate upward", "Accelerate downward", "Remain at rest only", "Lose its mass"], correctIndex: 0, explanation: "When the upward force is bigger than the downward weight, the net force points upward, so the object accelerates upward." }
        ]
    },

    {
        id: 3,
        key: "circuitCity",
        name: "Momentum City",
        icon: "⚡",
        introSubject: "electricity",
        crystalName: "Circuit Crystal",
        sceneDetails: "Tall buildings and glowing streetlights line the busy streets of this city.",
        theme: "theme-city",
        bgImage: "images/backgrounds/circuit-city.jpg",
        /* No dedicated "circuit-city" track was uploaded, so this
           borrows the spare audio/gamebgm.mp3 file for now - drop
           a circuit-city.mp3 into audio/bgm/ and update this path
           any time you want a track made just for this kingdom. */
        bgMusic: "audio/bgm/circuit-city.mp3",
        monsterCount: 6,
        platforms: [
            { xPercent: 15, widthPx: 160, surfaceY: 260 },
            { xPercent: 33, widthPx: 150, surfaceY: 340 },
            { xPercent: 52, widthPx: 170, surfaceY: 280 },
            { xPercent: 72, widthPx: 150, surfaceY: 350 },
            { xPercent: 88, widthPx: 160, surfaceY: 290 }
        ],
        holes: [
            { xPercent: 24, widthPx: 90 },
            { xPercent: 62, widthPx: 100 }
        ],
        coins: [
            { xPercent: 22, bottom: 150 },
            { xPercent: 38, bottom: 290 },
            { xPercent: 56, bottom: 170 },
            { xPercent: 75, bottom: 300 },
            { xPercent: 90, bottom: 240 }
        ],
        quizBank: [
            { question: "A mobile sculpture is balanced when:", choices: ["All objects have the same mass.", "The net torque on each balanced support is zero.", "All objects are at the same height.", "Gravity does not act on the sculpture."], correctIndex: 1, explanation: "A mobile is balanced when the torques on either side of each support cancel out, giving a net torque of zero." },
            { question: "Torque is calculated by:", choices: ["Force × perpendicular distance", "Mass × acceleration", "Mass × gravity", "Distance ÷ time"], correctIndex: 0, explanation: "Torque is calculated as force multiplied by the perpendicular distance from the pivot: τ = F × d." },
            { question: "A 10 N weight is placed 2 m from the pivot of a mobile. What is the torque produced?", choices: ["5 N·m", "10 N·m", "20 N·m", "40 N·m"], correctIndex: 2, explanation: "Torque = force × distance = 10 N × 2 m = 20 N·m." },
            { question: "A mobile sculpture has a 20 N weight located 1 m to the left of the pivot. Where should a 10 N weight be placed on the right to balance it?", choices: ["0.5 m", "1 m", "2 m", "4 m"], correctIndex: 2, explanation: "To balance, the torques must be equal: 20 N × 1 m = 10 N × d, so d = 2 m." },
            { question: "Why can a lighter object balance a heavier object on a mobile sculpture?", choices: ["It has more gravity.", "It can be placed farther from the pivot.", "It has no weight.", "It removes friction."], correctIndex: 1, explanation: "A lighter object can balance a heavier one by sitting farther from the pivot, since torque depends on both force and distance." },
            { question: "A conveyor belt moves a 50 kg load with a net horizontal force of 100 N. What is the acceleration of the load?", choices: ["0.5 m/s²", "2 m/s²", "50 m/s²", "150 m/s²"], correctIndex: 1, explanation: "a = F ÷ m = 100 N ÷ 50 kg = 2 m/s²." },
            { question: "Friction between a conveyor belt and a load helps the load to:", choices: ["Fall through the belt", "Move together with the belt", "Lose its mass", "Stop gravity"], correctIndex: 1, explanation: "Friction between the belt and the load is what drags the load along, letting it move together with the belt." },
            { question: "If a conveyor belt suddenly stops, a load may continue moving forward due to:", choices: ["Inertia", "Torque", "Buoyancy", "Magnetism"], correctIndex: 0, explanation: "Without the belt's friction still acting on it, a load keeps moving at its previous speed due to inertia — Newton's First Law." },
            { question: "A load on a conveyor belt moves at constant velocity. What can be said about the net force?", choices: ["It is increasing.", "It is zero.", "It is equal to the mass.", "It is always downward."], correctIndex: 1, explanation: "Constant velocity means no acceleration, so the net force on the load must be zero." },
            { question: "Which change would require a greater force to accelerate a load on a conveyor belt?", choices: ["Decreasing its mass", "Increasing its mass", "Reducing the acceleration to zero", "Removing all forces"], correctIndex: 1, explanation: "Newton's Second Law (F = ma) means a larger mass needs a larger force to reach the same acceleration." },
            { question: "A stalled vehicle requires a force of 2,000 N to move. If four people push with equal force, how much force must each person exert?", choices: ["250 N", "500 N", "1,000 N", "2,000 N"], correctIndex: 1, explanation: "Total force is shared equally: 2,000 N ÷ 4 people = 500 N each." },
            { question: "Two people push a stalled car in the same direction with forces of 400 N and 600 N. What is the total applied force?", choices: ["200 N", "500 N", "1,000 N", "2,400 N"], correctIndex: 2, explanation: "Forces in the same direction add together: 400 N + 600 N = 1,000 N." },
            { question: "A car is pushed with 1,500 N forward, while friction and resistance total 500 N backward. What is the net force?", choices: ["500 N backward", "1,000 N forward", "1,500 N forward", "2,000 N forward"], correctIndex: 1, explanation: "Net force = forward force − resistance = 1,500 N − 500 N = 1,000 N forward." },
            { question: "Why is it harder to start moving a stalled vehicle than to keep it moving?", choices: ["Static friction must first be overcome.", "Gravity disappears while it moves.", "The mass decreases after moving.", "Newton's laws stop applying."], correctIndex: 0, explanation: "Static friction resists the very first bit of motion and is generally stronger than the kinetic (moving) friction that follows." },
            { question: "According to Newton's Third Law, when a person pushes a car, the car:", choices: ["Does not push back.", "Pushes the person with an equal and opposite force.", "Has no reaction force.", "Pushes with twice the force."], correctIndex: 1, explanation: "Newton's Third Law says every action force has an equal and opposite reaction force — the car pushes back just as hard." },
            { question: "A car travels around a banked curve. The banking helps provide:", choices: ["Centripetal force", "Buoyant force", "Magnetic force", "Nuclear force"], correctIndex: 0, explanation: "The banking angle tilts the normal force so part of it points toward the center of the turn, supplying centripetal force." },
            { question: "What may happen if a vehicle travels too fast for a particular banked curve?", choices: ["It may slide upward on the bank.", "It will lose all its weight.", "Gravity will stop acting on it.", "The road will become flat."], correctIndex: 0, explanation: "If speed is too high for the banking, the required centripetal force exceeds what the bank provides, and the car can slide up and off the curve." },
            { question: "What is the main reason roads are banked on some curves?", choices: ["To make the road longer", "To help vehicles turn safely", "To decrease the mass of vehicles", "To eliminate all friction"], correctIndex: 1, explanation: "Banking a curve helps direct part of the normal force toward the center of the turn, letting vehicles corner safely at higher speed." },
            { question: "On a properly designed banked curve, the normal force from the road has a horizontal component that:", choices: ["Provides centripetal force", "Cancels gravity completely", "Stops the vehicle permanently", "Increases the vehicle's mass"], correctIndex: 0, explanation: "On a banked curve, part of the normal force points horizontally, toward the center of the circle — that's the centripetal force." },
            { question: "A car travels around a curve of radius 50 m. If the safe speed increases, what happens to the required centripetal force, assuming the mass and radius remain constant?", choices: ["It decreases.", "It remains the same.", "It increases.", "It becomes zero."], correctIndex: 2, explanation: "Centripetal force = mv² ÷ r, so with mass and radius fixed, a higher speed requires more centripetal force." }
        ]
    },

    {
        id: 4,
        key: "energyVolcano",
        name: "Energy Volcano",
        icon: "🔥",
        introSubject: "energy",
        crystalName: "Ember Crystal",
        sceneDetails: "Scorched, fire-cracked rocks and rivers of glowing lava, with flames flickering across the ground.",
        theme: "theme-volcano",
        bgImage: "images/backgrounds/energy-volcano.jpg",
        bgMusic: "audio/bgm/energy-volcano.mp3",
        monsterCount: 6,
        platforms: [
            { xPercent: 20, widthPx: 160, surfaceY: 250 },
            { xPercent: 40, widthPx: 150, surfaceY: 330 },
            { xPercent: 58, widthPx: 160, surfaceY: 270 },
            { xPercent: 78, widthPx: 170, surfaceY: 340 }
        ],
        holes: [
            { xPercent: 30, widthPx: 100 },
            { xPercent: 68, widthPx: 110 }
        ],
        coins: [
            { xPercent: 25, bottom: 160 },
            { xPercent: 44, bottom: 290 },
            { xPercent: 62, bottom: 170 },
            { xPercent: 80, bottom: 300 },
            { xPercent: 92, bottom: 200 }
        ],
        quizBank: [
            { question: "What is the SI unit of energy?", choices: ["Watt", "Newton", "Joule", "Meter"], correctIndex: 2, explanation: "Energy is measured in joules (J), the same unit used for work." },
            { question: "Which formula is used to calculate kinetic energy?", choices: ["KE = mgh", "KE = ½mv²", "KE = Fd", "KE = Pt"], correctIndex: 1, explanation: "Kinetic energy is calculated with KE = ½mv²." },
            { question: "What happens to an object's kinetic energy when its speed increases?", choices: ["It decreases", "It stays the same", "It increases", "It becomes zero"], correctIndex: 2, explanation: "Since KE = ½mv², a higher speed always means more kinetic energy." },
            { question: "A 2 kg object moves at 4 m/s. What is its kinetic energy?", choices: ["4 J", "8 J", "16 J", "32 J"], correctIndex: 2, explanation: "KE = ½mv² = ½ × 2 kg × (4 m/s)² = 16 J." },
            { question: "Which type of energy does an object have because of its position or height?", choices: ["Kinetic energy", "Potential energy", "Thermal energy", "Sound energy"], correctIndex: 1, explanation: "Energy an object has because of its position or height is potential energy." },
            { question: "What is the formula for gravitational potential energy?", choices: ["PE = ½mv²", "PE = Fd", "PE = mgh", "PE = Pt"], correctIndex: 2, explanation: "Gravitational potential energy is calculated with PE = mgh." },
            { question: "A 5 kg object is lifted to a height of 2 m. Using g = 9.8 m/s², what is its gravitational potential energy?", choices: ["9.8 J", "49 J", "98 J", "196 J"], correctIndex: 2, explanation: "PE = mgh = 5 kg × 9.8 m/s² × 2 m = 98 J." },
            { question: "If an object is lifted higher while its mass remains the same, its potential energy will:", choices: ["Decrease", "Increase", "Stay the same", "Become zero"], correctIndex: 1, explanation: "Since PE = mgh, increasing height while mass stays the same increases potential energy." },
            { question: "Which statement best describes kinetic energy?", choices: ["Energy stored because of position", "Energy of motion", "Energy stored in a battery only", "Energy caused by height"], correctIndex: 1, explanation: "Kinetic energy is the energy an object has because it is moving." },
            { question: "Which statement best describes potential energy?", choices: ["Energy caused by motion", "Energy that is always zero", "Stored energy due to position or condition", "Energy measured in watts"], correctIndex: 2, explanation: "Potential energy is energy stored because of an object's position or condition, like height above the ground." },
            { question: "A 10 kg object is moving at 2 m/s. What is its kinetic energy?", choices: ["10 J", "20 J", "40 J", "100 J"], correctIndex: 1, explanation: "KE = ½mv² = ½ × 10 kg × (2 m/s)² = 20 J." },
            { question: "A 4 kg object is lifted 5 m above the ground. Using g = 9.8 m/s², what is its potential energy?", choices: ["19.6 J", "98 J", "196 J", "245 J"], correctIndex: 2, explanation: "PE = mgh = 4 kg × 9.8 m/s² × 5 m = 196 J." },
            { question: "When a ball rolls down a hill, its gravitational potential energy is mainly converted into:", choices: ["Kinetic energy", "Chemical energy", "Nuclear energy", "Sound energy"], correctIndex: 0, explanation: "As a ball rolls downhill, the height (and potential energy) it loses mostly turns into kinetic energy of motion." },
            { question: "In an ideal system with no energy loss, the total mechanical energy is:", choices: ["Always increasing", "Always decreasing", "Conserved", "Always zero"], correctIndex: 2, explanation: "With no energy lost to friction or heat, the total mechanical energy of the system stays the same — it is conserved." },
            { question: "Mechanical energy is the combination of:", choices: ["Force and mass", "Kinetic and potential energy", "Power and force", "Mass and velocity"], correctIndex: 1, explanation: "Mechanical energy is the sum of an object's kinetic energy and potential energy." },
            { question: "A machine does 500 J of work in 10 seconds. What is its power?", choices: ["5 W", "25 W", "50 W", "5000 W"], correctIndex: 2, explanation: "P = W ÷ t = 500 J ÷ 10 s = 50 W." },
            { question: "Which formula relates energy, power, and time?", choices: ["E = P × t", "E = P ÷ t", "E = F × v", "E = mgh"], correctIndex: 0, explanation: "Energy transferred equals power multiplied by time: E = P × t." },
            { question: "A device operates at 100 W for 20 seconds. How much energy does it transfer?", choices: ["5 J", "120 J", "2,000 J", "20,000 J"], correctIndex: 2, explanation: "E = P × t = 100 W × 20 s = 2,000 J." },
            { question: "A student pushes a box with a force of 50 N for 4 m in the same direction as the force. How much work is done?", choices: ["12.5 J", "46 J", "200 J", "250 J"], correctIndex: 2, explanation: "Work = force × distance = 50 N × 4 m = 200 J." },
            { question: "Two machines perform the same amount of work. Machine A takes 5 seconds while Machine B takes 10 seconds. Which machine has greater power?", choices: ["Machine A", "Machine B", "They have the same power", "Neither machine has power"], correctIndex: 0, explanation: "Doing the same work in less time means more power, so Machine A (5 s) has the greater power." }
        ]
    },

    {
        id: 5,
        key: "waveCastle",
        name: "Gravitas Kingdom",
        icon: "🌊",
        introSubject: "sound",
        crystalName: "Echo Crystal",
        sceneDetails: "A dark, misty kingdom of withered grass, scattered bones, and crows perched on crumbling stone.",
        theme: "theme-castle",
        bgImage: "images/backgrounds/wave-kingdom.jpg",
        bgMusic: "audio/bgm/wave-kingdom.mp3",
        monsterCount: 7,
        platforms: [
            { xPercent: 15, widthPx: 150, surfaceY: 260 },
            { xPercent: 30, widthPx: 150, surfaceY: 340 },
            { xPercent: 48, widthPx: 160, surfaceY: 280 },
            { xPercent: 65, widthPx: 150, surfaceY: 350 },
            { xPercent: 82, widthPx: 170, surfaceY: 300 }
        ],
        holes: [
            { xPercent: 22, widthPx: 90 },
            { xPercent: 57, widthPx: 100 },
            { xPercent: 90, widthPx: 100 }
        ],
        coins: [
            { xPercent: 20, bottom: 150 },
            { xPercent: 35, bottom: 290 },
            { xPercent: 52, bottom: 170 },
            { xPercent: 70, bottom: 300 },
            { xPercent: 90, bottom: 230 }
        ],
        quizBank: [
            { question: "Which equation can be used to calculate energy using power and time?", choices: ["E = P × t", "E = P ÷ t", "E = F × v", "E = F ÷ t"], correctIndex: 0, explanation: "Energy transferred equals power multiplied by time: E = P × t." },
            { question: "A motor exerts a force of 50 N and moves at 4 m/s. What is its power?", choices: ["54 W", "200 W", "250 W", "400 W"], correctIndex: 1, explanation: "P = Fv = 50 N × 4 m/s = 200 W." },
            { question: "Two students do the same amount of work. Student A finishes faster than Student B. Who has greater power?", choices: ["Student A", "Student B", "Both have the same power", "Cannot be determined"], correctIndex: 0, explanation: "Finishing the same work in less time means more power, so Student A has the greater power." },
            { question: "Power is directly related to:", choices: ["Work done per unit time", "Mass only", "Distance only", "Time only"], correctIndex: 0, explanation: "Power is the rate at which work is done — more work per unit time means more power." },
            { question: "Which equation correctly shows the relationship between power, work, and time?", choices: ["P = W × t", "P = W ÷ t", "P = t ÷ W", "P = W + t"], correctIndex: 1, explanation: "Power equals work divided by time: P = W ÷ t." },
            { question: "A ball is launched straight upward with an initial velocity of 20 m/s. What is the time to reach maximum height?", choices: ["1 s", "2 s", "3 s", "4 s"], correctIndex: 1, explanation: "Time to reach max height = v ÷ g = 20 m/s ÷ 10 m/s² = 2 s." },
            { question: "A ball is launched straight upward at 30 m/s. What is the maximum height reached?", choices: ["30 m", "40 m", "45 m", "90 m"], correctIndex: 2, explanation: "Max height = v² ÷ (2g) = (30 m/s)² ÷ 20 = 45 m." },
            { question: "A projectile is launched with a vertical component of velocity of 20 m/s and lands at the same height. What is its total time of flight?", choices: ["2 s", "3 s", "4 s", "5 s"], correctIndex: 2, explanation: "Total flight time (launched and landing at the same height) is twice the time to the top: 2 × 20 ÷ 10 = 4 s." },
            { question: "A projectile moves horizontally at 15 m/s for 4 seconds. What is its range?", choices: ["19 m", "45 m", "60 m", "75 m"], correctIndex: 2, explanation: "Range = horizontal velocity × time = 15 m/s × 4 s = 60 m." },
            { question: "A ball is launched straight upward at 40 m/s. What is its time to reach maximum height?", choices: ["2 s", "3 s", "4 s", "8 s"], correctIndex: 2, explanation: "Time to reach max height = v ÷ g = 40 m/s ÷ 10 m/s² = 4 s." },
            { question: "A projectile has a horizontal velocity of 12 m/s and stays in the air for 5 seconds. What is its range?", choices: ["17 m", "50 m", "60 m", "120 m"], correctIndex: 2, explanation: "Range = horizontal velocity × time = 12 m/s × 5 s = 60 m." },
            { question: "A ball is thrown upward with an initial vertical velocity of 10 m/s. What is its maximum height?", choices: ["5 m", "10 m", "15 m", "20 m"], correctIndex: 0, explanation: "Max height = v² ÷ (2g) = (10 m/s)² ÷ 20 = 5 m." },
            { question: "A projectile takes 6 seconds to reach the ground after being launched and lands at the same height. What is the time to reach maximum height?", choices: ["2 s", "3 s", "6 s", "12 s"], correctIndex: 1, explanation: "When launch and landing heights match, the time to max height is half the total flight time: 6 s ÷ 2 = 3 s." },
            { question: "A projectile has a horizontal velocity of 20 m/s and a time of flight of 3 seconds. What is its range?", choices: ["23 m", "40 m", "60 m", "80 m"], correctIndex: 2, explanation: "Range = horizontal velocity × time = 20 m/s × 3 s = 60 m." },
            { question: "A ball is launched straight upward at 50 m/s. What is the maximum height?", choices: ["25 m", "50 m", "100 m", "125 m"], correctIndex: 3, explanation: "Max height = v² ÷ (2g) = (50 m/s)² ÷ 20 = 125 m." },
            { question: "A projectile is launched with a vertical velocity of 40 m/s and lands at the same level. What is the time of flight?", choices: ["4 s", "6 s", "8 s", "10 s"], correctIndex: 2, explanation: "Total flight time = 2v ÷ g = 2 × 40 ÷ 10 = 8 s." },
            { question: "A projectile moves horizontally at 25 m/s and stays in the air for 2 seconds. What is the range?", choices: ["27 m", "50 m", "75 m", "100 m"], correctIndex: 1, explanation: "Range = horizontal velocity × time = 25 m/s × 2 s = 50 m." },
            { question: "A ball is launched vertically upward at 60 m/s. What is the time to reach maximum height?", choices: ["3 s", "4 s", "5 s", "6 s"], correctIndex: 3, explanation: "Time to reach max height = v ÷ g = 60 m/s ÷ 10 m/s² = 6 s." },
            { question: "A projectile is launched vertically upward at 60 m/s. What is its maximum height?", choices: ["60 m", "120 m", "180 m", "360 m"], correctIndex: 2, explanation: "Max height = v² ÷ (2g) = (60 m/s)² ÷ 20 = 180 m." },
            { question: "A projectile has a horizontal velocity of 18 m/s and stays in the air for 4 seconds. What is its range?", choices: ["22 m", "54 m", "72 m", "90 m"], correctIndex: 2, explanation: "Range = horizontal velocity × time = 18 m/s × 4 s = 72 m." },
            { question: "A projectile is launched with a vertical velocity of 30 m/s and lands at the same height. What is the time of flight?", choices: ["3 s", "5 s", "6 s", "9 s"], correctIndex: 2, explanation: "Total flight time = 2v ÷ g = 2 × 30 ÷ 10 = 6 s." },
            { question: "A ball is launched vertically upward with an initial velocity of 70 m/s. What is its maximum height?", choices: ["70 m", "140 m", "245 m", "490 m"], correctIndex: 2, explanation: "Max height = v² ÷ (2g) = (70 m/s)² ÷ 20 = 245 m." },
            { question: "A projectile travels horizontally at 30 m/s for 5 seconds. What is the range?", choices: ["35 m", "100 m", "150 m", "300 m"], correctIndex: 2, explanation: "Range = horizontal velocity × time = 30 m/s × 5 s = 150 m." },
            { question: "A projectile stays in the air for 10 seconds and lands at the same height where it was launched. What is the time to reach maximum height?", choices: ["2 s", "5 s", "10 s", "20 s"], correctIndex: 1, explanation: "When launch and landing heights match, the time to max height is half the total flight time: 10 s ÷ 2 = 5 s." },
            { question: "A projectile has a horizontal velocity of 14 m/s and remains in the air for 6 seconds. What is its range?", choices: ["20 m", "56 m", "70 m", "84 m"], correctIndex: 3, explanation: "Range = horizontal velocity × time = 14 m/s × 6 s = 84 m." }
        ]
    }

];

/* =========================================================
   GAME SETTINGS

   Single difficulty level: 5 questions per location,
   slow-ish monsters (previously the "Easy" settings).
   ========================================================= */

const GAME_SETTINGS = {
    questionCount: 5,
    monsterSpeedMult: 0.38,
    monsterCountBonus: 0
};

function getDifficultySettings() {

    return GAME_SETTINGS;

}

/* =========================================================
   LEVEL LAYOUT (spacing between physics walls + the terrain
   obstacles that fill the ground between them)

   Physics walls now sit a fixed pixel distance apart (rather
   than being squeezed evenly across the level width), so a
   25-question level feels just as roomy per-question as a
   10-question one - the level simply gets longer. Each gap
   between two consecutive walls gets a pit with a floating
   platform "bridge" over it (plus a coin on top), echoing the
   island-platform look of the reference art.
   ========================================================= */

const WALL_START_PX = 520;   // space from level start to the first physics wall
const WALL_GAP_PX = 760;     // fixed pixel distance between consecutive physics walls
const WALL_END_PADDING_PX = 560; // space after the last wall before the goal crystal

function computeWallPositions(wallCount) {

    const positions = [];

    for (let i = 0; i < wallCount; i++) {
        positions.push(WALL_START_PX + (i * WALL_GAP_PX));
    }

    return positions;

}

function computeLevelWidthForWalls(wallCount) {

    if (wallCount <= 0) {
        return 1800;
    }

    return WALL_START_PX + ((wallCount - 1) * WALL_GAP_PX) + WALL_END_PADDING_PX;

}

/* Builds one pit + floating platform + coin "obstacle" in the
   gap between each pair of neighboring physics walls. Returns
   percent-based holes/platforms/coins ready to merge with a
   level's own hand-placed ones. */
function generateWallGapObstacles(wallPositionsPx, levelWidthPx) {

    const holes = [];
    const platforms = [];
    const coins = [];

    const surfaceYCycle = [260, 320, 290];

    for (let i = 0; i < wallPositionsPx.length - 1; i++) {

        const gapStart = wallPositionsPx[i] + 70;
        const gapEnd = wallPositionsPx[i + 1] - 70;
        const gapWidth = gapEnd - gapStart;

        if (gapWidth < 200) continue;

        const holeWidth = 90 + ((i % 3) * 20);
        const gapCenter = gapStart + (gapWidth / 2);
        const holeLeft = gapCenter - (holeWidth / 2);

        holes.push({
            xPercent: (holeLeft / levelWidthPx) * 100,
            widthPx: holeWidth
        });

        const surfaceY = surfaceYCycle[i % surfaceYCycle.length];
        const platformWidth = holeWidth + 130;
        const platformLeft = holeLeft - 25;

        platforms.push({
            xPercent: (platformLeft / levelWidthPx) * 100,
            widthPx: platformWidth,
            surfaceY: surfaceY
        });

        coins.push({
            xPercent: ((platformLeft + (platformWidth / 2)) / levelWidthPx) * 100,
            bottom: surfaceY + 45
        });

    }

    return { holes, platforms, coins };

}


/* =========================================================
   12. WORLD MAP
   ========================================================= */

const mapBackBtn =
    document.getElementById("mapBackBtn");

if (mapBackBtn) {

    mapBackBtn.addEventListener("click", () => {

        showScreen("menuScreen");

    });

}

function getUnlockedLevel() {

    const saved =
        Number(localStorage.getItem("unlockedLevel"));

    return saved && saved >= 1 ? saved : 1;

}

/* ---------------------------------------------------------
   GRAND PRIZE

   Once every kingdom on the map has been finished, the player
   earns a real downloadable prize (a PDF). "prizeUnlocked" is
   saved to localStorage (same pattern as unlockedLevel/coins)
   so it's remembered on future visits even after they close
   the browser. It's surfaced inside the 🎒 INVENTORY screen
   (see renderInventory()), which is itself always reachable
   from the menu.
   --------------------------------------------------------- */

function isPrizeUnlocked() {

    return localStorage.getItem("prizeUnlocked") === "true";

}

/* True only once the player has finished every single location
   on the map (not just the current/most recent one). Checked
   against LEVELS.length directly (rather than "is there a next
   level after this one") so the grand prize can never unlock
   early even if levels are reordered or added later. */
function areAllLevelsCompleted() {

    return getUnlockedLevel() > LEVELS.length;

}

function setPrizeUnlocked() {

    localStorage.setItem("prizeUnlocked", "true");

}

/* Triggers the actual file download/open - shared by the
   inventory screen's claim button and the level-complete
   modal's claim button (which is a plain <a download> and
   doesn't need this, but the inventory button is a <button>,
   so it needs a click handled in JS instead of native link
   behavior). */
function claimPrize() {

    const link = document.createElement("a");

    link.href = "module.pdf";
    link.download = "module.pdf";
    link.target = "_blank";
    link.rel = "noopener";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

}

function unlockLevel(levelNumber) {

    if (levelNumber > getUnlockedLevel()) {

        localStorage.setItem(
            "unlockedLevel",
            levelNumber
        );

    }

    refreshLevelButtons();

}

function refreshLevelButtons() {

    /* Keep the map sprite (and the character grid, if the
       player just unlocked someone) in sync with whatever is
       currently selected/unlocked. */
    applyCharacterSprites();

    const unlocked = getUnlockedLevel();

    document.querySelectorAll(".level-btn[data-level]")
        .forEach(button => {

            const levelNumber =
                Number(button.dataset.level);

            const isUnlocked =
                levelNumber <= unlocked;

            button.classList.toggle(
                "locked",
                !isUnlocked
            );

            const lockIcon =
                button.querySelector(".lockIcon");

            if (lockIcon) {

                lockIcon.style.display =
                    isUnlocked ? "none" : "inline";

            }

        });

}

document.querySelectorAll(".level-btn[data-level]")
    .forEach(button => {

        button.addEventListener("click", () => {

            const levelNumber =
                Number(button.dataset.level);

            if (levelNumber > getUnlockedLevel()) {

                alert(
                    "🔒 This kingdom is locked!\n\n" +
                    "Complete the previous kingdom first."
                );

                return;

            }

            const levelConfig =
                LEVELS[levelNumber - 1];

            if (!levelConfig) return;

            console.log("Entering " + levelConfig.name + "...");

            showScreen("gameScreen");

            startGame(levelConfig);

        });

    });

refreshLevelButtons();


/* =========================================================
   13. BASIC GAME START
   ========================================================= */

function startGame(levelConfig) {

    startLevel(levelConfig);

}


/* =========================================================
   14. PLAYER / PHYSICS STATE
   ========================================================= */

let playerX = 120;
let playerY = 130;

let playerVelocityY = 0;

let isJumping = false;

const playerSpeed = 5;

/*
   PLAYER SPRITE ANIMATION

   Hand-drawn/generated frame sets live under images/player-frames/
   (default explorer), images/sui-frames/ (Sui), images/azaic-frames/
   (Azaic), images/aqua-frames/ (Aqua), images/mualene-frames/
   (Mualene), and images/corvin-frames/ (Corvin), and are swapped on a
   timer to animate whichever of those is selected while it idles,
   runs, or jumps in-game. Any other character keeps its single
   static portrait, untouched by any of this - see
   ANIM_FRAMES_BY_CHARACTER below.
*/
const PLAYER_ANIM_FRAMES = {

    idle: [
        "images/player-frames/idle-1.png",
        "images/player-frames/idle-2.png",
        "images/player-frames/idle-3.png",
        "images/player-frames/idle-4.png"
    ],

    run: [
        "images/player-frames/run-1.png",
        "images/player-frames/run-2.png",
        "images/player-frames/run-3.png",
        "images/player-frames/run-4.png",
        "images/player-frames/run-5.png",
        "images/player-frames/run-6.png"
    ],

    jump: [
        "images/player-frames/jump-1.png",
        "images/player-frames/jump-2.png",
        "images/player-frames/jump-3.png",
        "images/player-frames/jump-4.png",
        "images/player-frames/jump-5.png",
        "images/player-frames/jump-6.png"
    ]

};

const SUI_ANIM_FRAMES = {

    idle: [
        "images/sui-frames/idle-1.png",
        "images/sui-frames/idle-2.png",
        "images/sui-frames/idle-3.png",
        "images/sui-frames/idle-4.png"
    ],

    run: [
        "images/sui-frames/run-1.png",
        "images/sui-frames/run-2.png",
        "images/sui-frames/run-3.png",
        "images/sui-frames/run-4.png",
        "images/sui-frames/run-5.png",
        "images/sui-frames/run-6.png",
        "images/sui-frames/run-7.png"
    ],

    jump: [
        "images/sui-frames/jump-1.png",
        "images/sui-frames/jump-2.png",
        "images/sui-frames/jump-3.png",
        "images/sui-frames/jump-4.png"
    ]

};

/* Sui's shield-burst frames - flashed briefly over her normal
   animation whenever her Golden Shield perk absorbs a hit (see
   triggerShieldFlash() / damagePlayer()). */
const SUI_SHIELD_FRAMES = [
    "images/sui-frames/shield-1.png",
    "images/sui-frames/shield-2.png",
    "images/sui-frames/shield-3.png",
    "images/sui-frames/shield-4.png"
];

const AZAIC_ANIM_FRAMES = {

    idle: [
        "images/azaic-frames/idle-1.png",
        "images/azaic-frames/idle-2.png",
        "images/azaic-frames/idle-3.png",
        "images/azaic-frames/idle-4.png"
    ],

    run: [
        "images/azaic-frames/run-1.png",
        "images/azaic-frames/run-2.png",
        "images/azaic-frames/run-3.png",
        "images/azaic-frames/run-4.png",
        "images/azaic-frames/run-5.png",
        "images/azaic-frames/run-6.png"
    ],

    jump: [
        "images/azaic-frames/jump-1.png",
        "images/azaic-frames/jump-2.png",
        "images/azaic-frames/jump-3.png",
        "images/azaic-frames/jump-4.png",
        "images/azaic-frames/jump-5.png",
        "images/azaic-frames/jump-6.png"
    ]

};

const AQUA_ANIM_FRAMES = {
    idle: [
        "images/aqua-frames/idle-1.png",
        "images/aqua-frames/idle-2.png",
        "images/aqua-frames/idle-3.png",
        "images/aqua-frames/idle-4.png"
    ],

    run: [
        "images/aqua-frames/run-1.png",
        "images/aqua-frames/run-2.png",
        "images/aqua-frames/run-3.png",
        "images/aqua-frames/run-4.png",
        "images/aqua-frames/run-5.png"
    ],

    jump: [
        "images/aqua-frames/jump-1.png",
        "images/aqua-frames/jump-2.png",
        "images/aqua-frames/jump-3.png",
        "images/aqua-frames/jump-4.png",
        "images/aqua-frames/jump-5.png"
    ]
};

const MUALENE_ANIM_FRAMES = {
    idle: [
        "images/mualene-frames/idle-1.png",
        "images/mualene-frames/idle-2.png",
        "images/mualene-frames/idle-3.png",
        "images/mualene-frames/idle-4.png"
    ],

    run: [
        "images/mualene-frames/run-1.png",
        "images/mualene-frames/run-2.png",
        "images/mualene-frames/run-3.png",
        "images/mualene-frames/run-4.png",
        "images/mualene-frames/run-5.png",
        "images/mualene-frames/run-6.png"
    ],

    jump: [
        "images/mualene-frames/jump-1.png",
        "images/mualene-frames/jump-2.png",
        "images/mualene-frames/jump-3.png",
        "images/mualene-frames/jump-4.png",
        "images/mualene-frames/jump-5.png"
    ]
};

const CORVIN_ANIM_FRAMES = {
    idle: [
        "images/corvin-frames/idle-1.png",
        "images/corvin-frames/idle-2.png",
        "images/corvin-frames/idle-3.png"
    ],

    run: [
        "images/corvin-frames/run-1.png",
        "images/corvin-frames/run-2.png",
        "images/corvin-frames/run-3.png",
        "images/corvin-frames/run-4.png",
        "images/corvin-frames/run-5.png",
        "images/corvin-frames/run-6.png"
    ],

    jump: [
        "images/corvin-frames/jump-1.png",
        "images/corvin-frames/jump-2.png",
        "images/corvin-frames/jump-3.png",
        "images/corvin-frames/jump-4.png",
        "images/corvin-frames/jump-5.png"
    ]
};

/* Which character keys get real frame-by-frame animation, and
   which frame set drives it. Any character not listed here keeps
   its single static portrait in-game. */
const ANIM_FRAMES_BY_CHARACTER = {
    default: PLAYER_ANIM_FRAMES,
    sui: SUI_ANIM_FRAMES,
    azaic: AZAIC_ANIM_FRAMES,
    aqua: AQUA_ANIM_FRAMES,
    mualene: MUALENE_ANIM_FRAMES,
    corvin: CORVIN_ANIM_FRAMES
};

const SHIELD_FRAMES_BY_CHARACTER = {
    sui: SUI_SHIELD_FRAMES
};

/* How long each frame stays on screen, per animation (ms). */
const PLAYER_ANIM_FRAME_DURATION = {
    idle: 220,
    run: 80,
    jump: 90
};

/* Total time (ms) the shield-burst flash plays over the normal
   animation, and how long each of its 3 frames gets. */
const SHIELD_FLASH_DURATION = 360;
const SHIELD_FLASH_FRAME_DURATION =
    SHIELD_FLASH_DURATION / SUI_SHIELD_FRAMES.length;

/* Sui: timestamp (performance.now()) the current shield flash
   should end. 0 while no flash is playing. */
let playerShieldFlashEndTime = 0;

/* Starts a shield-burst flash for the currently selected
   character, if it has shield frames defined. Safe to call for
   any character - it's a no-op otherwise. */
function triggerShieldFlash() {

    const character =
        getCharacterByKey(getSelectedCharacterKey());

    if (!SHIELD_FRAMES_BY_CHARACTER[character.key]) return;

    playerShieldFlashEndTime =
        performance.now() + SHIELD_FLASH_DURATION;

}

let playerAnimState = "idle";
let playerAnimFrameIndex = 0;
let playerAnimElapsed = 0;
let playerAnimLastTimestamp = null;

/* Picks idle / run / jump from the current physics state. Airborne
   (jumping OR falling) always wins, then left/right movement,
   otherwise idle. */
function getPlayerAnimState() {

    if (quizOpen) {
        return "idle";
    }

    if (isJumping || playerVelocityY !== 0) {
        return "jump";
    }

    if (
        keys["arrowleft"] || keys["a"] ||
        keys["arrowright"] || keys["d"]
    ) {
        return "run";
    }

    return "idle";

}

/* Advances the sprite-frame timer and updates #gamePlayer's src.
   Only takes effect for characters listed in
   ANIM_FRAMES_BY_CHARACTER (currently the default explorer, Sui,
   Azaic, Aqua, and Mualene) - any other character is left to its
   existing single-portrait behavior. */
function updatePlayerAnimation(player, timestamp) {

    const charKey = getSelectedCharacterKey();
    const frameSet = ANIM_FRAMES_BY_CHARACTER[charKey];

    if (!frameSet) {

        playerAnimLastTimestamp = null;
        playerShieldFlashEndTime = 0;

        return;

    }

    /* Only the default explorer has a customizable color. */
    const hue =
        charKey === "default"
            ? localStorage.getItem("playerHue")
            : null;

    player.style.filter =
        hue ? `hue-rotate(${hue}deg) saturate(1.3)` : "none";

    /* Shield-burst flash takes over the sprite for a moment,
       overriding whatever idle/run/jump would normally show. */
    const shieldFrames = SHIELD_FRAMES_BY_CHARACTER[charKey];

    if (shieldFrames && timestamp < playerShieldFlashEndTime) {

        const remaining =
            playerShieldFlashEndTime - timestamp;

        const elapsed =
            SHIELD_FLASH_DURATION - remaining;

        const flashIndex = Math.min(
            shieldFrames.length - 1,
            Math.floor(elapsed / SHIELD_FLASH_FRAME_DURATION)
        );

        const flashSrc = shieldFrames[flashIndex];

        if (!player.src.endsWith(flashSrc)) {
            player.src = flashSrc;
        }

        playerAnimLastTimestamp = timestamp;

        return;

    }

    const nextState = getPlayerAnimState();

    /* Corvin: hand-driven jump animation (see the constants above
       for the rising/falling/landing breakdown) instead of the
       generic timer-cycled frame set below. Idle and run still
       fall through to the generic logic beneath this block. */
    if (charKey === "corvin") {

        const wasJump = playerAnimState === "jump";

        if (wasJump && nextState !== "jump") {
            /* Just touched down - hold the landing pose briefly. */
            corvinLandingUntil = timestamp + CORVIN_LANDING_HOLD_MS;
        }

        if (timestamp < corvinLandingUntil) {

            playerAnimState = nextState;
            playerAnimFrameIndex = 0;
            playerAnimElapsed = 0;
            playerAnimLastTimestamp = timestamp;

            const landingSrc =
                frameSet.jump[frameSet.jump.length - 1];

            if (!player.src.endsWith(landingSrc)) {
                player.src = landingSrc;
            }

            return;

        }

        if (nextState === "jump") {

            if (nextState !== playerAnimState) {
                playerAnimState = nextState;
                playerAnimFrameIndex = 0;
                playerAnimElapsed = 0;
            }

            if (playerVelocityY < 0) {

                /* Falling: freeze on jump-4 for the whole descent. */
                playerAnimFrameIndex = CORVIN_FALL_FRAME_INDEX;
                playerAnimElapsed = 0;

            } else {

                /* Rising: cycle the lift-off frames (jump-1..3),
                   leaving jump-4/5 reserved for falling/landing. */
                const dt =
                    playerAnimLastTimestamp === null
                        ? 0
                        : timestamp - playerAnimLastTimestamp;

                playerAnimElapsed += dt;

                if (playerAnimElapsed >= PLAYER_ANIM_FRAME_DURATION.jump) {
                    playerAnimElapsed = 0;
                    playerAnimFrameIndex =
                        (playerAnimFrameIndex + 1) % CORVIN_FALL_FRAME_INDEX;
                }

            }

            playerAnimLastTimestamp = timestamp;

            const frameSrc = frameSet.jump[playerAnimFrameIndex];

            if (!player.src.endsWith(frameSrc)) {
                player.src = frameSrc;
            }

            return;

        }

    }

    if (nextState !== playerAnimState) {

        playerAnimState = nextState;
        playerAnimFrameIndex = 0;
        playerAnimElapsed = 0;

    }

    const dt =
        playerAnimLastTimestamp === null
            ? 0
            : timestamp - playerAnimLastTimestamp;

    playerAnimLastTimestamp = timestamp;

    playerAnimElapsed += dt;

    const frames = frameSet[playerAnimState];
    const frameDuration =
        PLAYER_ANIM_FRAME_DURATION[playerAnimState];

    if (playerAnimElapsed >= frameDuration) {

        playerAnimElapsed = 0;

        playerAnimFrameIndex =
            (playerAnimFrameIndex + 1) % frames.length;

    }

    const frameSrc = frames[playerAnimFrameIndex];

    if (!player.src.endsWith(frameSrc)) {
        player.src = frameSrc;
    }

}

/*
   PLAYER FACING DIRECTION

   1 = facing right (the sprite's natural/default direction),
   -1 = facing left (sprite flipped horizontally). Updated
   whenever the player actually moves, so the character always
   visually faces the direction it's walking in.
*/
let playerFacing = 1;

function setPlayerFacing(direction) {

    if (direction === playerFacing) return;

    playerFacing = direction;

    const player =
        document.getElementById("gamePlayer");

    if (!player) return;

    player.classList.toggle(
        "facing-left",
        playerFacing === -1
    );

}

/*
   FIX: "character floats"

   The old gravity (0.7) pulled the player down so gently that
   jumps and falls both felt slow and weightless - the character
   hung in the air instead of landing with any snap.

   Real gravity is stronger, and falling gravity is stronger
   still than rising gravity (classic platformer trick - Mario,
   Celeste, etc. all do this). This does NOT change the
   character's size, only how fast it moves vertically.
*/
const gravity = 1.1;
const fallGravityMultiplier = 1.6; // extra pull while falling, not while rising
const maxFallSpeed = 22; // terminal velocity so falls stay readable

/* Corvin: floatier descent - his cloak/robe theme gets a slower,
   more drifting fall on the way down from a jump. Only the
   falling half of his arc is affected; the rise off a jump still
   uses the normal gravity above. */
const CORVIN_FALL_GRAVITY_MULTIPLIER = 0.85;
const CORVIN_MAX_FALL_SPEED = 13;

/* Corvin's jump animation is hand-driven rather than the generic
   timer-cycled frame set every other character uses (see the
   corvin-specific branch inside updatePlayerAnimation()):
     - rising: cycles jump-1..jump-3 like a normal takeoff
     - falling: holds on jump-4 for the entire descent
     - landing: holds on jump-5 briefly the moment he touches down,
       before handing off to idle/run
*/
const CORVIN_FALL_FRAME_INDEX = 3; // jump-4
const CORVIN_LANDING_HOLD_MS = 150;
let corvinLandingUntil = 0;
const jumpPower = 19;

let currentLevel = null;
let currentLevelWidth = 1800;


/* =========================================================
   KEYBOARD CONTROLS
   ========================================================= */

const keys = {};

/*
   FIX: "player keeps moving forward on its own"

   This happened because a key could get marked as "held down"
   (keys[...] = true) but never receive its matching "keyup"
   event - for example when a quiz popup, an alert(), or a tab
   switch stole focus while a direction key was still pressed.
   Once that happened the player would drift forever because
   the game loop still thought the key was held.

   resetKeys() clears every tracked key. We call it whenever
   focus could be lost or a new level/screen starts, so no key
   can stay "stuck" across those moments.
*/
function resetKeys() {

    for (const key in keys) {
        keys[key] = false;
    }

}

window.addEventListener("blur", resetKeys);

document.addEventListener("visibilitychange", () => {

    if (document.hidden) {
        resetKeys();
    }

});


/* Jump trigger shared by the keyboard handler and the on-screen
   mobile jump button - both just call this. */
function tryJump() {

    if (isJumping) return;

    playerVelocityY = jumpPower;

    isJumping = true;

    playJumpSound();

}

document.addEventListener("keydown", (event) => {

    keys[event.key.toLowerCase()] = true;


    /* JUMP */

    if (
        event.key === " " ||
        event.key === "ArrowUp" ||
        event.key.toLowerCase() === "w"
    ) {

        tryJump();

    }

});


document.addEventListener("keyup", (event) => {

    keys[event.key.toLowerCase()] = false;

});


/* =========================================================
   14.5 MOBILE TOUCH CONTROLS

   On-screen left/right/jump/attack buttons for touch devices,
   shown only on the in-game HUD (see #touchControls in
   index.html / style.css). They drive the exact same `keys`
   object and tryJump()/attackMonster() the keyboard uses, so
   every perk, collision, and animation hook keeps working
   unmodified regardless of input method.

   Uses pointer events (not click) so movement starts the
   instant a finger touches down and stops the instant it
   lifts, instead of waiting on the ~300ms click/tap delay.
   ========================================================= */

/*
   FIX: "can't press move + jump at the same time"

   Each on-screen button used to release its key on
   "pointerleave" with no pointer capture. Without capture, a
   second finger touching a DIFFERENT button can cause the OS
   to redeliver/settle pointer coordinates for the FIRST touch,
   which some mobile browsers (notably Android WebViews) report
   as a spurious "pointerleave" on the first button - silently
   turning that key back off even though the finger never
   actually left it. Two fingers on two buttons should be fully
   independent since they're different DOM elements, but that
   spurious-leave quirk broke it in practice.

   setPointerCapture() locks each button to its own pointerId,
   so it stops listening to ambient pointer movement entirely
   and only reacts to a real pointerup/pointercancel for THAT
   finger. That makes the two buttons genuinely independent, and
   is what actually fixes holding one while tapping the other.
*/
function bindHoldButton(id, keyName) {

    const btn = document.getElementById(id);

    if (!btn) return;

    const press = (event) => {
        event.preventDefault();

        try {
            btn.setPointerCapture(event.pointerId);
        } catch (e) {
            // Capture isn't available - fall back to normal
            // event flow, still functional, just less robust.
        }

        keys[keyName] = true;
    };

    const release = (event) => {
        event.preventDefault();
        keys[keyName] = false;
    };

    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);

    /* Fires once capture is released (on pointerup/cancel, or if
       the browser has to steal it back) - the reliable signal to
       treat this button as "let go", replacing pointerleave. */
    btn.addEventListener("lostpointercapture", release);

}

bindHoldButton("touchLeftBtn", "arrowleft");
bindHoldButton("touchRightBtn", "arrowright");

const touchJumpBtn =
    document.getElementById("touchJumpBtn");

if (touchJumpBtn) {

    touchJumpBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        try {
            touchJumpBtn.setPointerCapture(event.pointerId);
        } catch (e) {}

        tryJump();
    });

}

/* Attack button, sitting right next to Jump in the bottom-right
   touch controls so both actions are reachable with one thumb
   during a fight instead of reaching up to the top HUD bar
   (which stays hidden on touch devices - see CSS). Mirrors the
   jump button's pointer-capture handling. */
const touchAttackBtn =
    document.getElementById("touchAttackBtn");

if (touchAttackBtn) {

    touchAttackBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        try {
            touchAttackBtn.setPointerCapture(event.pointerId);
        } catch (e) {}

        attackMonster();
    });

}

/* Safety net: if a finger drags off the whole controls bar
   without ever firing a clean pointerup (e.g. sliding off the
   screen edge), make sure movement keys don't stay stuck on -
   same "stuck key" problem resetKeys() covers for the keyboard.
   This only matters as a fallback now that the buttons capture
   their own pointers, so it's a rare case rather than the norm. */
const touchControlsBar =
    document.getElementById("touchControls");

if (touchControlsBar) {

    touchControlsBar.addEventListener("pointerleave", () => {
        keys["arrowleft"] = false;
        keys["arrowright"] = false;
    });

}


/* =========================================================
   15. START A LEVEL

   Builds platforms / coins / monsters from the level's
   config, resets all per-level state, and kicks off the
   game loop.
   ========================================================= */

let coinsCollected = 0;

/* Hearts cap - referenced by the lives HUD, the correct-answer
   heal, and the shop's Health Potion / Mega Heart items below. */
const MAX_LIVES = 3;
let livesCount = MAX_LIVES;

let quizOpen = false;
let physicsWalls = [];
let currentQuizWall = null;

/* Countdown timer for each physics-wall question. */
const QUIZ_TIME_LIMIT = 30;
let quizTimerInterval = null;
let quizTimeRemaining = QUIZ_TIME_LIMIT;

let hasGoldenSword = false;
let swordCooldown = false;

let hasGoldenShield = false;
let shieldHits = 0;
let shieldMaxHits = 3;

/* Sui: once her shield breaks (all hits used up), it recharges
   on its own after a cooldown instead of staying gone for the
   rest of the level. See damagePlayer() / updateSuiShieldCooldown(). */
const SUI_SHIELD_COOLDOWN_MS = 20000;
let suiShieldCooldownEndTime = 0;

let monsters = [];

/* =========================================================
   CHARACTER PERKS (per-level state)

   activeCharacterKey is snapshotted at the start of each level
   so a mid-level customize-screen visit (not really possible
   today, but safe to guard anyway) can't change the rules of a
   run already in progress.
   ========================================================= */
let activeCharacterKey = "default";
let mualeneBonusSkip = 0;

/* Aqua: immune to wrong-answer/timeout damage, but only for the
   first AQUA_IMMUNITY_LIMIT misses each level - after that, misses
   cost a life like normal. */
const AQUA_IMMUNITY_LIMIT = 5;
let aquaImmunityRemaining = AQUA_IMMUNITY_LIMIT;

/* Corvin: +2 max lives (on top of the normal MAX_LIVES cap) and
   total immunity to fall-into-a-hole damage. The bonus lives are
   folded into every place that reads/caps against MAX_LIVES via
   getMaxLives() below, rather than changing MAX_LIVES itself,
   since MAX_LIVES also sizes the empty-heart HUD for every other
   character. See handleHoleFall() for the fall-damage immunity. */
const CORVIN_BONUS_LIVES = 2;

function isActiveCharacter(key) {
    return activeCharacterKey === key;
}

/* The lives cap for whichever character is currently active -
   MAX_LIVES for everyone except Corvin, who gets
   CORVIN_BONUS_LIVES extra on top. Used anywhere lives are set,
   healed, or capped so his bonus lives actually stick instead of
   being clipped back down to 3. */
function getMaxLives() {
    return MAX_LIVES + (isActiveCharacter("corvin") ? CORVIN_BONUS_LIVES : 0);
}

function startLevel(levelConfig) {

    currentLevel = levelConfig;

    playerX = 120;
    playerY = 130;

    playerVelocityY = 0;
    isJumping = false;

    /* Always start a fresh level facing right */
    playerFacing = 1;

    const playerEl =
        document.getElementById("gamePlayer");

    if (playerEl) {
        playerEl.classList.remove("facing-left");
    }

    /* Make sure the in-game sprite matches whatever character
       is currently selected (and its color, for the default
       explorer). */
    applyCharacterSprites();

    /*
       Reset held-key state whenever a level starts.
       Fixes the bug where a key that got "stuck" down
       (e.g. because a quiz/alert stole focus) would keep
       moving the player forward on their own.
    */
    resetKeys();

    levelCompleted = false;
    quizOpen = false;

    hasGoldenSword = ownsItem("sword");
    hasGoldenShield = ownsItem("shield");

    /* ---- CHARACTER PERKS: setup ---- */

    activeCharacterKey = getSelectedCharacterKey();

    /* Set AFTER activeCharacterKey so Corvin's +2 bonus (via
       getMaxLives()) actually applies at the start of his run. */
    livesCount = getMaxLives();

    /* Aqua: refill her wrong-answer immunity uses for this level. */
    aquaImmunityRemaining = AQUA_IMMUNITY_LIMIT;

    /* Sui: +2 bonus shield hits, stacking on top of an owned
       Golden Shield - and enough on its own to give shield
       protection even without ever buying one. */
    const suiShieldBonus =
        isActiveCharacter("sui") ? 2 : 0;

    shieldMaxHits =
        (hasGoldenShield ? 3 : 0) + suiShieldBonus;

    shieldHits = shieldMaxHits;

    /* The shield-blocking logic below gates on hasGoldenShield,
       so Sui's bonus alone needs to flip it on even if no
       Golden Shield was purchased. */
    if (shieldMaxHits > 0) {
        hasGoldenShield = true;
    }

    /* Mualene: three free question skips per game, on top of any
       Magic Keys the player owns. Resets every level start. */
    mualeneBonusSkip =
        isActiveCharacter("mualene") ? 3 : 0;

    swordCooldown = false;
    suiShieldCooldownEndTime = 0;

    const stage =
        document.getElementById("levelStage");

    if (!stage) return;

    /* Apply the level's visual theme */

    stage.className = "";
    stage.classList.add(levelConfig.theme);

    /* Apply a custom per-level background image, if provided.
       This replaces the painted gradient/clouds/mountains with
       your own artwork/photo for that location. */

    if (levelConfig.bgImage) {

        stage.style.backgroundImage =
            "url('" + levelConfig.bgImage + "')";

        stage.classList.add("has-custom-bg");

    } else {

        stage.style.backgroundImage = "";
        stage.classList.remove("has-custom-bg");

    }

    /* Play this kingdom's own background music (falls back to
       the default track if the level has no "bgMusic" set). */

    switchMusic(levelConfig.bgMusic);

    /*
       LONGER LEVELS + CAMERA
       The level world is now much wider than the screen (more
       obstacles on harder difficulties = a longer level), and
       the camera scrolls to follow the player through it, like
       classic Mario side-scrollers.

       Computed early (before platforms/ground/etc.) because the
       ground and hole positions below are worked out in pixels
       from this width.
    */
    const difficultySettings = getDifficultySettings();

    const levelQuestionCount =
        (levelConfig.quizBank && levelConfig.quizBank.length) || difficultySettings.questionCount;

    const wallPositionsPx =
        computeWallPositions(levelQuestionCount);

    currentLevelWidth =
        computeLevelWidthForWalls(levelQuestionCount);

    const generatedObstacles =
        generateWallGapObstacles(wallPositionsPx, currentLevelWidth);

    /* Merge this level's hand-placed platforms/holes/coins with
       the generated pit-and-bridge obstacles between each wall,
       without mutating the original LEVELS config. */
    const renderConfig = Object.assign({}, levelConfig, {
        platforms: (levelConfig.platforms || []).concat(generatedObstacles.platforms),
        holes: (levelConfig.holes || []).concat(generatedObstacles.holes),
        coins: (levelConfig.coins || []).concat(generatedObstacles.coins)
    });

    /* Collision code (findHoleAt, ground-landing checks, etc.)
       reads from currentLevel, so it needs the generated pits
       and platforms too - not just the level's original ones. */
    currentLevel = renderConfig;

    const levelWorld =
        document.getElementById("levelWorld");

    if (levelWorld) {

        levelWorld.style.width = currentLevelWidth + "px";
        levelWorld.style.transform = "translateX(0px)";

    }

    /* Build platforms */

    const platformsLayer =
        document.getElementById("platformsLayer");

    if (platformsLayer) {

        platformsLayer.innerHTML = "";

        renderConfig.platforms.forEach(platform => {

            const el = document.createElement("div");

            el.className = "platform";
            el.style.left = platform.xPercent + "%";
            el.style.width = platform.widthPx + "px";
            el.style.height = "18px";
            el.style.bottom = (platform.surfaceY - 18) + "px";

            platformsLayer.appendChild(el);

        });

    }

    /* Build the ground, with gaps where this level's holes are */

    buildGround(renderConfig);

    /* Scatter this kingdom's themed scenery (trees, coral, lamp-
       posts, bones...) along the ground and on the platforms */

    buildDecorations(renderConfig, levelConfig);

    /* Build coins */

    resetCoins(renderConfig);

    /* Build monsters */

    buildMonsters(levelConfig);

    /* Physics walls (spaced a fixed distance apart) */

    buildPhysicsWalls(levelConfig, wallPositionsPx, currentLevelWidth);

    /* Level goal: a flag planted on the ground near the finish
       line (rather than floating on a platform), so it reads
       clearly as "the end of the level".

       Its position is worked out from the actual last physics
       wall instead of a fixed 90% - levels with more questions
       are wider (see computeLevelWidthForWalls), so a fixed
       percentage could land the flag BEFORE the final wall on
       longer locations. Anchoring it a fixed distance past the
       last wall keeps it last no matter how many questions the
       location has. */

    const goal =
        document.getElementById("levelGoal");

    const goalLabel =
        document.getElementById("levelGoalLabel");

    if (goal) {

        const lastWallPx =
            wallPositionsPx.length > 0 ?
                wallPositionsPx[wallPositionsPx.length - 1] :
                currentLevelWidth * 0.5;

        /* Sit roughly 2/3 of the way through the leftover
           padding after the last wall, leaving some walkway
           both before and after the flag. */
        const goalXPx =
            Math.min(
                currentLevelWidth - 120,
                lastWallPx + (WALL_END_PADDING_PX * 0.65)
            );

        const goalXPercent =
            (goalXPx / currentLevelWidth) * 100;

        goal.style.right = "";
        goal.style.left = goalXPercent + "%";
        goal.style.bottom = "130px";

    }

    if (goalLabel) {

        goalLabel.textContent = "Finish";

    }

    updateGoalLockState();

    /* Quiz overlay starts closed; content is filled in per-wall */

    const quizOverlay =
        document.getElementById("quizOverlay");

    if (quizOverlay) {

        quizOverlay.classList.remove("active");

    }

    quizOpen = false;
    currentQuizWall = null;

    updateItemsDisplay();

    /* HUD */

    updateLivesDisplay();

    const weaponDisplay =
        document.getElementById("weaponDisplay");

    if (weaponDisplay) {

        weaponDisplay.textContent =
            hasGoldenSword ? "🗡️ Golden Sword" : "🗡️ No Sword";

    }

    const shieldDisplay =
        document.getElementById("shieldDisplay");

    if (shieldDisplay) {

        shieldDisplay.textContent =
            hasGoldenShield
                ? "🛡️ Shield: " + shieldHits + "/" + shieldMaxHits
                : "🛡️ No Shield";

    }

    /*
       Make sure any previous loop is stopped, then show the
       level's introduction card instead of starting play right
       away. The game loop only actually starts once the player
       clicks "Start" on that card (see showLevelIntro() /
       beginLevelPlay() below) - so nothing moves or attacks
       while the intro is up.
    */

    if (gameFrameId !== null) {

        cancelAnimationFrame(gameFrameId);
        gameFrameId = null;

    }

    gameLoopRunning = false;

    showLevelIntro(levelConfig);

}


/* =========================================================
   15b. LEVEL INTRODUCTION CARD

   Shown every time a location is opened (fresh entry from the
   world map), before any movement, monsters, or the camera
   start up. Dismissing it (Start button) is what actually
   kicks off the game loop.
   ========================================================= */

function showLevelIntro(levelConfig) {

    const overlay =
        document.getElementById("levelIntroOverlay");

    const icon =
        document.getElementById("levelIntroIcon");

    const name =
        document.getElementById("levelIntroName");

    const text =
        document.getElementById("levelIntroText");

    const details =
        document.getElementById("levelIntroDetails");

    if (icon) {
        icon.textContent = levelConfig.icon || "🗺";
    }

    if (name) {
        name.textContent = levelConfig.name;
    }

    if (details) {
        details.textContent = levelConfig.sceneDetails || "";
        details.style.display = levelConfig.sceneDetails ? "" : "none";
    }

    if (text) {

        const subject =
            levelConfig.introSubject || "science";

        const isTouchDevice =
            window.matchMedia(
                "(hover: none) and (pointer: coarse)"
            ).matches;

        const controlsHint =
            isTouchDevice
                ? "Use the ◀ ▶ buttons to move and JUMP to jump."
                : "Use ◀ ▶ to move and ⬆ to jump.";

        text.textContent =
            controlsHint + " Reach the wall and " +
            "answer a " + subject + " question to break through. " +
            "Avoid monsters and pits — you only have 3 lives!";

    }

    if (overlay) {
        overlay.classList.add("active");
    }

}

function beginLevelPlay() {

    const overlay =
        document.getElementById("levelIntroOverlay");

    if (overlay) {
        overlay.classList.remove("active");
    }

    /* Reset keys again in case anything was held while the
       intro card had focus. */
    resetKeys();

    if (gameFrameId !== null) {

        cancelAnimationFrame(gameFrameId);

    }

    gameLoopRunning = true;

    /* Start the sprite animation fresh each level so it doesn't
       replay a stale frame count/timer from a previous run. */
    playerAnimState = "idle";
    playerAnimFrameIndex = 0;
    playerAnimElapsed = 0;
    playerAnimLastTimestamp = null;

    gameFrameId =
        requestAnimationFrame(updatePlayer);

}

const levelIntroStartBtn =
    document.getElementById("levelIntroStartBtn");

if (levelIntroStartBtn) {

    levelIntroStartBtn.addEventListener(
        "click",
        beginLevelPlay
    );

}


/* =========================================================
   16. GAME LOOP
   ========================================================= */

/*
   BUILD GROUND (with gaps for holes)

   The ground used to be one solid strip. Now it's built as
   separate segments with real gaps cut out wherever this
   level's "holes" are, plus a dark pit graphic dropped into
   each gap so the danger is visible, not just invisible physics.
*/
/* =========================================================
   SCENERY PROPS (decorLayer)

   Small themed decorations scattered along the ground and on
   top of platforms, picked per-kingdom so each location feels
   distinct: forest bits in Kinetic Meadow, coral/sea life in
   Force Falls, streetlamps/signs in Momentum City, fire/rock
   in Energy Volcano, and crows/bones/dead grass in Gravitas
   Kingdom. Purely visual - built fresh each time a level loads.
   ========================================================= */

const DECOR_ICONS = {

    tree: `<svg viewBox="0 0 40 54"><rect x="17" y="34" width="6" height="20" rx="2" fill="#7a4a26"/><ellipse cx="20" cy="24" rx="17" ry="16" fill="#3f9142"/><ellipse cx="12" cy="18" rx="10" ry="9" fill="#4caf1f"/><ellipse cx="27" cy="20" rx="9" ry="8" fill="#4caf1f"/></svg>`,

    bush: `<svg viewBox="0 0 40 26"><ellipse cx="10" cy="18" rx="10" ry="8" fill="#3f9142"/><ellipse cx="22" cy="14" rx="13" ry="10" fill="#4caf1f"/><ellipse cx="33" cy="18" rx="8" ry="7" fill="#3f9142"/></svg>`,

    flower: `<svg viewBox="0 0 20 30"><rect x="9" y="14" width="2.5" height="16" fill="#4caf1f"/><circle cx="10" cy="9" r="2.6" fill="#ffd63c"/><circle cx="5.5" cy="9" r="3" fill="#fff"/><circle cx="14.5" cy="9" r="3" fill="#fff"/><circle cx="10" cy="4.5" r="3" fill="#fff"/><circle cx="10" cy="13.5" r="3" fill="#fff"/></svg>`,

    coral: `<svg viewBox="0 0 34 42"><path d="M8 42 C4 30 14 26 9 14 C6 6 12 2 12 2" stroke="#ff8f9e" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M22 42 C26 28 17 24 22 12 C25 5 20 2 20 2" stroke="#ffb4c0" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`,

    seaweed: `<svg viewBox="0 0 26 40"><path d="M6 40 C2 28 10 24 6 12 C4 6 8 2 8 2" stroke="#1f9c8f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M18 40 C22 26 15 22 19 10 C21 5 17 2 17 2" stroke="#2bb89a" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,

    bubble: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="rgba(210,235,255,0.55)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/><circle cx="7" cy="7" r="2" fill="rgba(255,255,255,0.9)"/></svg>`,

    streetLamp: `<svg viewBox="0 0 20 70"><rect x="8.5" y="18" width="3" height="50" rx="1.5" fill="#14141c"/><rect x="8.5" y="66" width="14" height="4" rx="1" fill="#14141c" transform="translate(-7 0)"/><circle cx="10" cy="12" r="10" fill="rgba(125,211,252,0.35)"/><ellipse cx="10" cy="12" rx="7" ry="6" fill="#7dd3fc"/></svg>`,

    sign: `<svg viewBox="0 0 40 46"><rect x="18" y="16" width="4" height="30" rx="1.5" fill="#241a30"/><rect x="2" y="2" width="36" height="20" rx="4" fill="#2e7dff"/></svg>`,

    emberRock: `<svg viewBox="0 0 40 30"><path d="M2 30 L6 14 L14 20 L20 4 L28 18 L34 12 L38 30 Z" fill="#3b1a10"/><path d="M20 6 L16 18 L21 17 L18 28" stroke="#ff8a30" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    fireWisp: `<svg viewBox="0 0 26 34"><path d="M13 34 C4 26 4 16 10 8 C10 14 13 14 13 10 C16 16 22 20 18 28 C22 24 22 18 22 18 C25 26 20 34 13 34 Z" fill="#ff9d2e"/><path d="M13 30 C9 25 9 19 13 14 C13 20 17 22 15 27 C17 25 18 21 18 21 C19 26 16 30 13 30 Z" fill="#ffd35c"/></svg>`,

    crow: `<svg viewBox="0 0 34 20"><path d="M0 10 C6 2 10 8 13 6 C16 4 15 0 15 0 C20 4 18 9 22 9 C26 9 28 4 34 6 C28 10 24 10 22 12 C25 15 30 14 30 14 C24 18 18 14 15 16 C11 18 6 17 0 10 Z" fill="#0d0d12"/></svg>`,

    bonePile: `<svg viewBox="0 0 40 22"><g fill="#d6cdb6"><rect x="2" y="9" width="36" height="4" rx="2" transform="rotate(20 20 11)"/><circle cx="4" cy="15" r="4" transform="rotate(20 20 11)"/><circle cx="36" cy="7" r="4" transform="rotate(20 20 11)"/><rect x="2" y="9" width="36" height="4" rx="2" transform="rotate(-20 20 11)"/><circle cx="4" cy="7" r="4" transform="rotate(-20 20 11)"/><circle cx="36" cy="15" r="4" transform="rotate(-20 20 11)"/></g></svg>`,

    deadGrass: `<svg viewBox="0 0 26 30"><path d="M4 30 L2 6" stroke="#6b6046" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12 30 L13 2" stroke="#8a7d57" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M20 30 L23 8" stroke="#6b6046" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`

};

/* Which prop types show up in each kingdom, and how big they
   render (px) - matched to what the location's sceneDetails
   call out (see LEVELS above). */
const LEVEL_DECOR_SETS = {

    motionMeadow: [
        { type: "tree", w: 46, h: 62 },
        { type: "bush", w: 40, h: 26 },
        { type: "flower", w: 16, h: 24 }
    ],

    forceFalls: [
        { type: "coral", w: 30, h: 38, glow: null },
        { type: "seaweed", w: 22, h: 34 },
        { type: "bubble", w: 14, h: 14, glow: "decorGlowBlue", float: true }
    ],

    circuitCity: [
        { type: "streetLamp", w: 18, h: 64, glow: "decorGlowBlue" },
        { type: "sign", w: 34, h: 40, glow: "decorGlowBlue" }
    ],

    energyVolcano: [
        { type: "emberRock", w: 38, h: 28 },
        { type: "fireWisp", w: 22, h: 30, glow: "decorGlowOrange", float: true }
    ],

    waveCastle: [
        { type: "crow", w: 30, h: 18 },
        { type: "bonePile", w: 34, h: 18 },
        { type: "deadGrass", w: 20, h: 24 }
    ]

};

/* Simple seeded-ish pseudo-random so the same level lays out
   its scenery the same way every time it's (re)built, rather
   than reshuffling on every retry. */
function decorRandom(seed) {
    const x = Math.sin(seed * 999.7) * 43758.5453;
    return x - Math.floor(x);
}

function makeDecorEl(entry, seedBase) {

    const icon = DECOR_ICONS[entry.type];
    if (!icon) return null;

    const el = document.createElement("div");

    el.className = "decorIcon" + (entry.glow ? " " + entry.glow : "");
    el.style.width = entry.w + "px";
    el.style.height = entry.h + "px";
    el.innerHTML = icon;

    /* Gentle per-item variety: a little random scale/flip so a
       repeated prop (five trees, five crows...) doesn't look
       like it was stamped with a copy machine. */
    const scaleJitter = 0.85 + decorRandom(seedBase) * 0.3;
    const flip = decorRandom(seedBase + 0.37) < 0.5 ? -1 : 1;

    el.style.transform =
        `scale(${(flip * scaleJitter).toFixed(3)}, ${scaleJitter.toFixed(3)})`;

    if (entry.float) {
        /* Bubbles / fire wisps drift gently in place. */
        el.style.animation =
            `decorFloat ${(2.4 + decorRandom(seedBase + 0.6) * 1.6).toFixed(2)}s ease-in-out infinite`;
        el.style.animationDelay = `-${(decorRandom(seedBase + 0.9) * 2).toFixed(2)}s`;
    }

    return el;

}

/* Scatters this kingdom's props along the solid ground (skipping
   holes, the spawn area, and the goal area) and drops one on top
   of each platform. Called after buildGround()/platforms so the
   surface positions are already known. */
function buildDecorations(renderConfig, levelConfig) {

    const decorLayer = document.getElementById("decorLayer");

    if (!decorLayer) return;

    decorLayer.innerHTML = "";

    const decorSet = LEVEL_DECOR_SETS[levelConfig.key];

    if (!decorSet || decorSet.length === 0) return;

    const holes =
        (renderConfig.holes || [])
            .map(hole => {
                const left = hole.xPercent / 100 * currentLevelWidth;
                return { left: left, right: left + hole.widthPx };
            });

    function isOverHole(x) {
        return holes.some(h => x >= h.left - 20 && x <= h.right + 20);
    }

    /* --- ground props --- */

    const spacing = 150;
    const startX = 220;
    const endX = currentLevelWidth - 180;

    let i = 0;

    for (let x = startX; x < endX; x += spacing) {

        const jitteredX = x + (decorRandom(i * 3.1) - 0.5) * 70;

        if (isOverHole(jitteredX)) { i++; continue; }

        const pick = decorSet[Math.floor(decorRandom(i * 7.3) * decorSet.length)];
        const el = makeDecorEl(pick, i * 5.2 + 1);

        if (el) {

            el.style.left = (jitteredX - pick.w / 2) + "px";
            el.style.bottom = "126px";

            decorLayer.appendChild(el);

        }

        i++;

    }

    /* --- one prop on top of each platform --- */

    (renderConfig.platforms || []).forEach((platform, idx) => {

        const pick = decorSet[Math.floor(decorRandom(idx * 4.4 + 2) * decorSet.length)];
        const el = makeDecorEl(pick, idx * 6.1 + 3);

        if (!el) return;

        const platformLeftPx = platform.xPercent / 100 * currentLevelWidth;
        const platformCenterX = platformLeftPx + platform.widthPx / 2;

        el.style.left = (platformCenterX - pick.w / 2) + "px";
        el.style.bottom = platform.surfaceY + "px";

        decorLayer.appendChild(el);

    });

}

function buildGround(levelConfig) {

    const groundLayer =
        document.getElementById("groundLayer");

    if (!groundLayer) return;

    groundLayer.innerHTML = "";

    const holes =
        (levelConfig.holes || [])
            .map(hole => {

                const left =
                    hole.xPercent / 100 * currentLevelWidth;

                return {
                    left: left,
                    right: left + hole.widthPx
                };

            })
            .sort((a, b) => a.left - b.left);

    let cursor = 0;

    holes.forEach(hole => {

        /* Solid ground segment before this hole */

        if (hole.left > cursor) {

            addGroundSegment(groundLayer, cursor, hole.left - cursor);

        }

        /* The hole/pit itself */

        addHolePit(groundLayer, hole.left, hole.right - hole.left);

        cursor = hole.right;

    });

    /* Final solid segment after the last hole (or the whole
       ground, on levels with no holes) */

    if (cursor < currentLevelWidth) {

        addGroundSegment(groundLayer, cursor, currentLevelWidth - cursor);

    }

}

function addGroundSegment(layer, leftPx, widthPx) {

    const el = document.createElement("div");

    el.className = "groundSegment";
    el.style.left = leftPx + "px";
    el.style.width = widthPx + "px";

    layer.appendChild(el);

}

function addHolePit(layer, leftPx, widthPx) {

    const el = document.createElement("div");

    el.className = "holePit";
    el.style.left = leftPx + "px";
    el.style.width = widthPx + "px";

    layer.appendChild(el);

}

/*
   Returns the hole config the given world-x falls inside, or
   null if there isn't one there.
*/
function findHoleAt(centerX) {

    if (!currentLevel || !currentLevel.holes) return null;

    return currentLevel.holes.find(hole => {

        const left =
            hole.xPercent / 100 * currentLevelWidth;

        const right =
            left + hole.widthPx;

        return centerX >= left && centerX <= right;

    }) || null;

}

function getGroundLevelAt(centerX) {

    /*
       Base ground is solid EXCEPT where a hole is cut into it.
       Over a hole there's no floor at all (null) unless a
       platform happens to bridge across that spot.
    */
    let level =
        findHoleAt(centerX) ? null : 130;

    if (!currentLevel) return level;

    currentLevel.platforms.forEach(platform => {

        const left =
            platform.xPercent / 100 * currentLevelWidth;

        const right =
            left + platform.widthPx;

        if (
            centerX >= left &&
            centerX <= right &&
            platform.surfaceY <= playerY + 40
        ) {

            if (level === null || platform.surfaceY > level) {
                level = platform.surfaceY;
            }

        }

    });

    return level;

}

/*
   How far below the normal ground (130) the player has to sink
   into a hole before it counts as "fallen in" - by then they've
   dropped out of sight, which reads clearly as a fall.
*/
const HOLE_FALL_DAMAGE_Y = -90;

function handleHoleFall(centerX) {

    const hole = findHoleAt(centerX);

    /* Corvin: falling into a pit still knocks him back to safe
       ground below, it just never costs a life or a shield hit. */
    if (!isActiveCharacter("corvin")) {
        damagePlayer();
    }

    /* Respawn just before the hole so the player doesn't fall
       straight back in. */
    const safeX =
        hole ?
            Math.max(0, (hole.xPercent / 100 * currentLevelWidth) - 70) :
            playerX;

    playerX = safeX;
    playerY = 130;
    playerVelocityY = 0;
    isJumping = false;

}

/* =========================================================
   CAMERA

   Slides the wide #levelWorld left under the fixed viewport
   so the player stays roughly centered, like classic Mario
   side-scrollers. Clamped so we never scroll past either end
   of the level.
   ========================================================= */

function updateCamera(stage) {

    const levelWorld =
        document.getElementById("levelWorld");

    if (!levelWorld || !stage) return;

    const viewportWidth = stage.clientWidth;
    const viewportHeight = stage.clientHeight;

    let cameraX = playerX - (viewportWidth / 2) + 40;

    const maxCameraX =
        Math.max(0, currentLevelWidth - viewportWidth);

    if (cameraX < 0) cameraX = 0;
    if (cameraX > maxCameraX) cameraX = maxCameraX;

    /*
       VERTICAL CAMERA

       playerY is measured up from the ground, and with no shift
       at all it also doubles as the player's raw on-screen
       height (their sprite is placed with "bottom: playerY").
       That's fine wherever the stage is tall enough for the
       highest platform (surfaceY up to 350) plus the player's
       own 80px sprite to fit - true on desktop. But on the
       rotated mobile layout the stage is only as tall as the
       phone is WIDE (often just ~370-430px), so climbing onto a
       high platform there pushed the player's head right up
       against, or past, the top edge - it couldn't be seen.

       This keeps a fixed headroom margin free above the player
       once they climb higher than the screen has room for,
       sliding the whole world down (the ground scrolls out of
       view below) so the player and whatever they're standing on
       stay fully visible - the same idea as the horizontal
       camera above, just for the vertical axis. It does nothing
       at all while the player is low enough to already fit.
    */
    const topHeadroom = 100; // 80px sprite + a little air above it

    let cameraY = playerY - (viewportHeight - topHeadroom);

    if (cameraY < 0) cameraY = 0;

    const highestSurfaceY =
        (currentLevel && currentLevel.platforms && currentLevel.platforms.length)
            ? currentLevel.platforms.reduce(
                (max, platform) => Math.max(max, platform.surfaceY),
                130
              )
            : 130;

    /* Safety clamp so the world can never be pushed further down
       than the highest platform in this level ever needs, even
       if playerY briefly overshoots mid-jump. */
    const maxCameraY =
        Math.max(0, highestSurfaceY + 200 - viewportHeight);

    if (cameraY > maxCameraY) cameraY = maxCameraY;

    levelWorld.style.transform =
        "translateX(" + (-cameraX) + "px) " +
        "translateY(" + cameraY + "px)";

    /* Subtle parallax on the mountains, for depth */

    const mountainsLayer =
        document.getElementById("mountainsLayer");

    if (mountainsLayer) {

        mountainsLayer.style.backgroundPositionX =
            (-cameraX * 0.35) + "px";

    }

}

/* Sui: brings her shield back once the 20-second cooldown
   started in damagePlayer() has elapsed. Called every frame
   from updatePlayer(). */
function updateSuiShieldCooldown(timestamp) {

    if (!isActiveCharacter("sui")) return;
    if (!suiShieldCooldownEndTime) return;
    if (timestamp < suiShieldCooldownEndTime) return;

    suiShieldCooldownEndTime = 0;
    hasGoldenShield = true;
    shieldHits = shieldMaxHits;

    const shieldDisplay =
        document.getElementById("shieldDisplay");

    if (shieldDisplay) {
        shieldDisplay.textContent =
            "🛡️ Shield: " + shieldHits + "/" + shieldMaxHits;
    }

}

function updatePlayer() {

    if (!gameLoopRunning) {
        return;
    }

    const player =
        document.getElementById("gamePlayer");

    const stage =
        document.getElementById("levelStage");

    if (!player || !stage) {

        requestAnimationFrame(updatePlayer);

        return;

    }

    updatePlayerAnimation(player, performance.now());
    updateSuiShieldCooldown(performance.now());


    /*
       PAUSE EVERYTHING WHILE A QUIZ IS OPEN

       No movement, no gravity, no monsters, no collisions -
       the player and every monster just freeze in place until
       the question is answered (or skipped with a Magic Key).
    */
    if (!quizOpen) {

        /* LEFT */

        if (
            keys["arrowleft"] ||
            keys["a"]
        ) {

            playerX -= playerSpeed;

            setPlayerFacing(-1);

        }


        /* RIGHT */

        if (
            keys["arrowright"] ||
            keys["d"]
        ) {

            playerX += playerSpeed;

            setPlayerFacing(1);

        }


        /* GRAVITY (stronger while falling - see fix note above.
           Corvin gets a gentler pull and lower terminal velocity
           on the way down, for a slower, floatier descent.) */

        const isCorvinFalling =
            playerVelocityY < 0 && isActiveCharacter("corvin");

        const currentGravity =
            playerVelocityY < 0
                ? gravity * (isCorvinFalling ? CORVIN_FALL_GRAVITY_MULTIPLIER : fallGravityMultiplier)
                : gravity;

        playerVelocityY -= currentGravity;

        const fallSpeedCap =
            isCorvinFalling ? CORVIN_MAX_FALL_SPEED : maxFallSpeed;

        if (playerVelocityY < -fallSpeedCap) {
            playerVelocityY = -fallSpeedCap;
        }

        playerY += playerVelocityY;


        /* LAND ON GROUND OR PLATFORM ("higher lands") */

        const groundLevel =
            getGroundLevelAt(playerX + 35);

        /*
           groundLevel is null when the player is over an open
           HOLE with no platform beneath them - there's nothing
           to land on, so skip landing and keep falling. See
           handleHoleFall() below for what happens next.
        */
        if (groundLevel !== null && playerY <= groundLevel) {

            playerY = groundLevel;

            playerVelocityY = 0;

            isJumping = false;

        } else if (groundLevel === null && playerY < HOLE_FALL_DAMAGE_Y) {

            handleHoleFall(playerX + 35);

        }


        /* LEVEL LIMITS (the level is wider than the screen now) */

        const maxX =
            currentLevelWidth - 80;

        if (playerX < 0) {

            playerX = 0;

        }

        if (playerX > maxX) {

            playerX = maxX;

        }


        /* APPLY POSITION */

        player.style.left =
            playerX + "px";

        player.style.bottom =
            playerY + "px";

        checkCoinCollection();

        checkPhysicsWall();

        checkMonsterCollisions();

        checkLevelGoal();

        updateMonsters();

    }

    updateCamera(stage);

    if (gameLoopRunning) {

        gameFrameId =
            requestAnimationFrame(updatePlayer);

    }

}


/* =========================================================
   RETURN TO MAP
   ========================================================= */

const leaveGameBtn =
    document.getElementById("leaveGameBtn");

if (leaveGameBtn) {

    leaveGameBtn.addEventListener(
        "click",
        () => {

            gameLoopRunning = false;

            if (gameFrameId !== null) {

                cancelAnimationFrame(gameFrameId);

                gameFrameId = null;

            }

            showScreen("mapScreen");

        }
    );

}

/* =========================================================
   17. COINS
   ========================================================= */

function resetCoins(levelConfig) {

    coinsCollected = 0;

    const coinCounter =
        document.getElementById("coinCounter");

    if (coinCounter) {
        coinCounter.textContent = "🪙 0";
    }

    /* Score is cumulative across the whole playthrough, so just
       refresh the HUD to show the current running total. */
    updateScoreDisplay();

    const coinsLayer =
        document.getElementById("coinsLayer");

    if (!coinsLayer) return;

    coinsLayer.innerHTML = "";

    levelConfig.coins.forEach(coin => {

        const el = document.createElement("div");

        el.className = "coin";
        el.style.left = coin.xPercent + "%";
        el.style.bottom = coin.bottom + "px";
        el.textContent = "🪙";

        coinsLayer.appendChild(el);

    });

}


/* Check whether player touches coins */

function checkCoinCollection() {

    const player =
        document.getElementById("gamePlayer");

    const coins =
        document.querySelectorAll("#coinsLayer .coin");

    if (!player) return;


    const playerRect =
        player.getBoundingClientRect();


    coins.forEach(coin => {

        /* Already collected */

        if (coin.dataset.collected === "true") {
            return;
        }


        const coinRect =
            coin.getBoundingClientRect();


        /* Collision */

        const touching =
            playerRect.left < coinRect.right &&
            playerRect.right > coinRect.left &&
            playerRect.top < coinRect.bottom &&
            playerRect.bottom > coinRect.top;


        if (touching) {

            coin.dataset.collected = "true";

            coin.style.display = "none";

            coinsCollected++;

            playCoinSound();

            addCoins(1);

            /* Score: +10 for a collected coin */
            addScore(POINTS_COIN);

            const coinCounter =
                document.getElementById("coinCounter");

            if (coinCounter) {

                coinCounter.textContent =
                    "🪙 " + coinsCollected;

            }

        }

    });

}

/* =========================================================
   18. PHYSICS WALL / QUIZ
   ========================================================= */

/* =========================================================
   LIVES
   ========================================================= */

function updateLivesDisplay() {

    const lives =
        document.getElementById("lives");

    if (!lives) return;

    let hearts = "";

    for (let i = 0; i < livesCount; i++) {
        hearts += "❤️";
    }

    for (let i = livesCount; i < getMaxLives(); i++) {
        hearts += "🖤";
    }

    lives.textContent = hearts;

    /* Keep the potion buttons' disabled state (hearts already
       full) in sync any time lives change, not just when a
       potion is bought/used. */
    updatePotionButtons();

}

/* =========================================================
   BUILD PHYSICS WALLS (obstacles)

   The number of walls = the difficulty's question count
   (Easy 5 / Medium 10 / Hard 20). Each wall is bound to one
   question drawn from the level's quiz bank (questions repeat
   in order if a difficulty needs more than the bank has).
   ========================================================= */

function buildPhysicsWalls(levelConfig, wallPositionsPx, levelWidthPx) {

    physicsWalls = [];
    currentQuizWall = null;

    const layer =
        document.getElementById("physicsWallsLayer");

    if (!layer) return;

    layer.innerHTML = "";

    const bank = levelConfig.quizBank || [];

    if (bank.length === 0) return;

    const wallCount = bank.length;

    for (let i = 0; i < wallCount; i++) {

        const el = document.createElement("div");

        el.className = "physicsWall";

        const xPercent =
            (wallPositionsPx[i] / levelWidthPx) * 100;

        el.style.left = xPercent + "%";
        el.innerHTML =
            "❓<span class=\"physicsWallLabel\">⚡ Physics Wall " +
            (i + 1) + "/" + wallCount + "</span>";

        layer.appendChild(el);

        physicsWalls.push({
            el: el,
            passed: false,
            question: bank[i % bank.length]
        });

    }

}

/* =========================================================
   PHYSICS WALL COLLISION
   ========================================================= */

function checkPhysicsWall() {

    if (quizOpen) {
        return;
    }

    const player =
        document.getElementById("gamePlayer");

    if (!player) return;

    const playerRect =
        player.getBoundingClientRect();

    for (const wall of physicsWalls) {

        if (wall.passed) continue;

        const wallRect =
            wall.el.getBoundingClientRect();

        const touching =
            playerRect.left < wallRect.right &&
            playerRect.right > wallRect.left &&
            playerRect.top < wallRect.bottom &&
            playerRect.bottom > wallRect.top;

        if (touching) {

            /* Push player back slightly */

            playerX -= 8;

            openPhysicsQuiz(wall);

            return;

        }

    }

}

/* =========================================================
   OPEN QUIZ
   ========================================================= */

function openPhysicsQuiz(wall) {

    quizOpen = true;
    currentQuizWall = wall;

    /*
       Clear held keys as soon as the quiz opens - the overlay
       steals focus/attention, which is exactly the situation
       that used to leave a key "stuck" down.
    */
    resetKeys();

    const questionText =
        document.getElementById("questionText");

    if (questionText) {
        questionText.textContent = wall.question.question;
    }

    const answerButtons =
        document.querySelectorAll(".answerBtn");

    answerButtons.forEach((button, index) => {

        const choiceText = wall.question.choices[index];
        const letter = String.fromCharCode(65 + index);

        button.textContent = letter + ". " + choiceText;
        button.disabled = false;
        button.style.opacity = "1";

        button.dataset.answer =
            index === wall.question.correctIndex
                ? "correct"
                : "wrong";

    });

    updateItemsDisplay();

    const overlay =
        document.getElementById("quizOverlay");

    if (overlay) {
        overlay.classList.add("active");
    }

    startQuizTimer();

}

/* =========================================================
   QUIZ TIMER (30 seconds per question)

   Counts down while a physics wall question is open. If time
   runs out before the player answers, it's treated the same
   as picking a wrong answer.
   ========================================================= */

function updateQuizTimerDisplay() {

    const timerEl =
        document.getElementById("quizTimer");

    if (!timerEl) return;

    timerEl.textContent = "⏱ " + quizTimeRemaining;

    if (quizTimeRemaining <= 10) {
        timerEl.classList.add("timerLow");
    } else {
        timerEl.classList.remove("timerLow");
    }

}

function startQuizTimer() {

    stopQuizTimer();

    quizTimeRemaining = QUIZ_TIME_LIMIT;
    updateQuizTimerDisplay();

    quizTimerInterval = setInterval(() => {

        quizTimeRemaining--;

        updateQuizTimerDisplay();

        if (quizTimeRemaining <= 0) {

            stopQuizTimer();
            handleQuizTimeout();

        }

    }, 1000);

}

function stopQuizTimer() {

    if (quizTimerInterval !== null) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }

}

/* =========================================================
   WRONG-ANSWER EXPLANATION

   Shown any time a question is missed (wrong choice picked,
   or the timer runs out) so the player learns the correct
   answer and why, instead of just losing a life and moving
   on. Play only continues once they tap "Continue".
   ========================================================= */

/* Holds whatever should happen once the player taps Continue
   (pushing them back, checking for game over, etc). Set right
   before the explanation is shown; cleared once it runs. */
let pendingQuizContinue = null;

function showQuizExplanation() {

    if (!currentQuizWall) return;

    const explanationEl =
        document.getElementById("quizExplanation");

    const continueBtn =
        document.getElementById("quizContinueBtn");

    const question = currentQuizWall.question;

    if (explanationEl) {

        const correctLetter =
            String.fromCharCode(65 + question.correctIndex);

        const correctChoice =
            question.choices[question.correctIndex];

        explanationEl.textContent =
            "✔ Correct answer: " + correctLetter + ". " +
            correctChoice +
            (question.explanation ? " — " + question.explanation : "");

        explanationEl.classList.add("active");

    }

    if (continueBtn) {
        continueBtn.classList.add("active");
    }

    // The question is over - hint/skip no longer apply to it.
    const hintBtn = document.getElementById("hintBtn");
    const skipBtn = document.getElementById("skipBtn");

    if (hintBtn) hintBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;

}

function hideQuizExplanation() {

    const explanationEl =
        document.getElementById("quizExplanation");

    const continueBtn =
        document.getElementById("quizContinueBtn");

    if (explanationEl) {
        explanationEl.textContent = "";
        explanationEl.classList.remove("active");
    }

    if (continueBtn) {
        continueBtn.classList.remove("active");
    }

}

const quizContinueBtn =
    document.getElementById("quizContinueBtn");

if (quizContinueBtn) {

    quizContinueBtn.addEventListener("click", () => {

        const action = pendingQuizContinue;
        pendingQuizContinue = null;

        hideQuizExplanation();

        if (action) {
            action();
        }

    });

}

/* Swap a wall's question for a different one drawn from the
   same level's quiz bank, so re-approaching a missed wall
   doesn't just show the same question again. Falls back to
   leaving the question as-is if the bank only has one entry. */
function assignFreshQuestion(wall) {

    if (!wall) return;

    const bank =
        (currentLevel && currentLevel.quizBank) || [];

    if (bank.length <= 1) return;

    let nextQuestion = wall.question;

    while (nextQuestion === wall.question) {
        nextQuestion =
            bank[Math.floor(Math.random() * bank.length)];
    }

    wall.question = nextQuestion;

}

/* Shared "player got this question wrong" follow-through:
   close the quiz, push the player back a bit, and end the
   game if they're out of lives. Used after both a wrong
   answer and a timeout, once the player has read the
   explanation and tapped Continue. */
function proceedAfterQuizMiss() {

    // Grab the wall before closePhysicsQuiz() clears the
    // currentQuizWall reference, so we can give it a new
    // question for next time.
    const missedWall = currentQuizWall;

    closePhysicsQuiz();

    assignFreshQuestion(missedWall);

    // Push player backward

    playerX -= 180;

    // Prevent player from going off-screen

    if (playerX < 0) {
        playerX = 0;
    }

    // Game Over

    if (livesCount <= 0) {

        livesCount = 0;

        updateLivesDisplay();

        gameLoopRunning = false;

        if (gameFrameId !== null) {
            cancelAnimationFrame(gameFrameId);
            gameFrameId = null;
        }

        resetKeys();

        playGameOverSound();

        alert(
            "💔 Game Over!\n\n" +
            "You ran out of lives."
        );

        // Return to map

        showScreen("mapScreen");

    }

}

/* Time's up before an answer was picked - counts as wrong. */
function handleQuizTimeout() {

    if (!currentQuizWall) return;

    const answerButtons =
        document.querySelectorAll(".answerBtn");

    answerButtons.forEach(button => {
        button.disabled = true;
        button.style.opacity = "0.6";
    });

    const feedback =
        document.getElementById("quizFeedback");

    /* Aqua: immune to damage from missing a question - still
       counts as a miss (no wall/skip credit), just without
       losing a life, up to AQUA_IMMUNITY_LIMIT times per level. */
    const aquaShrugsItOff =
        isActiveCharacter("aqua") && aquaImmunityRemaining > 0;

    if (aquaShrugsItOff) {
        aquaImmunityRemaining--;
    } else {
        livesCount--;
    }

    updateLivesDisplay();

    if (feedback) {

        feedback.textContent =
            aquaShrugsItOff
                ? "⏰ Time's up! 🌊 Aqua shrugs it off - no life lost."
                : "⏰ Time's up! You lost 1 life.";

        feedback.style.color = "#ff7777";

    }

    pendingQuizContinue = proceedAfterQuizMiss;
    showQuizExplanation();

}

/* =========================================================
   ANSWER BUTTONS
   ========================================================= */

const answerButtons =
    document.querySelectorAll(".answerBtn");


answerButtons.forEach(button => {

    button.addEventListener("click", () => {

        if (!currentQuizWall) return;

        stopQuizTimer();

        const answer =
            button.dataset.answer;

        const feedback =
            document.getElementById(
                "quizFeedback"
            );


        /* CORRECT */

        if (answer === "correct") {

    playCorrectSound();

    /* Gain 1 life, maximum getMaxLives() */

    if (livesCount < getMaxLives()) {
        livesCount++;
    }

    updateLivesDisplay();

    /* Score: +100 for a correct answer */
    addScore(POINTS_CORRECT_ANSWER);


    feedback.textContent =
        "✅ Correct! +1 ❤️ +100⭐ The wall is broken!";

    feedback.style.color = "#72e06b";

    const passedWall = currentQuizWall;
    passedWall.passed = true;
    updateGoalLockState();


    setTimeout(() => {

        closePhysicsQuiz();

        /* Make the wall disappear */

        if (passedWall && passedWall.el) {

            passedWall.el.classList.add("wallPassed");

        }

    }, 800);

}


        /* WRONG */

        else {

    playWrongSound();

    /* Aqua: immune to damage from a wrong answer - still
       counts as a miss (no wall/skip credit), just without
       losing a life, up to AQUA_IMMUNITY_LIMIT times per level. */
    const aquaShrugsItOff =
        isActiveCharacter("aqua") && aquaImmunityRemaining > 0;

    if (aquaShrugsItOff) {
        aquaImmunityRemaining--;
    } else {
        livesCount--;
    }

    updateLivesDisplay();

    const feedback =
        document.getElementById("quizFeedback");

    feedback.textContent =
        aquaShrugsItOff
            ? "❌ Wrong answer! 🌊 Aqua shrugs it off - no life lost."
            : "❌ Wrong answer! You lost 1 life.";

    feedback.style.color = "#ff7777";

    // Disable all the answer buttons so nothing else can be
    // clicked while the explanation is showing.
    answerButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = "0.6";
    });

    pendingQuizContinue = proceedAfterQuizMiss;
    showQuizExplanation();

}
    });

});

/* =========================================================
   CLOSE QUIZ
   ========================================================= */

function closePhysicsQuiz() {

    stopQuizTimer();

    const overlay =
        document.getElementById("quizOverlay");

    if (overlay) {
        overlay.classList.remove("active");
    }

    quizOpen = false;
    currentQuizWall = null;

    /*
       Also reset keys on close - if the player was holding a
       direction key when the wall was touched, we don't want
       that press to have gotten "lost" and then replayed as a
       stuck key once the overlay closes.
    */
    resetKeys();

    const feedback =
        document.getElementById(
            "quizFeedback"
        );

    if (feedback) {
        feedback.textContent = "";
    }

    hideQuizExplanation();
    pendingQuizContinue = null;

}

/* =========================================================
   ITEMS: CRYSTAL BALL (hint) & MAGIC KEY (skip question)
   ========================================================= */

function updateItemsDisplay() {

    const hintCount = getItemCount("crystalBall");

    /* Mualene's free skip stacks on top of any purchased
       Magic Keys - shown/used as one combined pool. */
    const skipCount =
        getItemCount("magicKey") + mualeneBonusSkip;

    const hintCountEl = document.getElementById("hintCount");
    const skipCountEl = document.getElementById("skipCount");

    if (hintCountEl) hintCountEl.textContent = hintCount;
    if (skipCountEl) skipCountEl.textContent = skipCount;

    const hintBtn = document.getElementById("hintBtn");
    const skipBtn = document.getElementById("skipBtn");

    if (hintBtn) hintBtn.disabled = hintCount <= 0;
    if (skipBtn) skipBtn.disabled = skipCount <= 0;

    const itemsDisplay = document.getElementById("itemsDisplay");

    if (itemsDisplay) {
        itemsDisplay.textContent =
            "🔮 " + hintCount + "   🔑 " + skipCount;
    }

    updatePotionButtons();

}

/* =========================================================
   ITEMS: HEALTH POTION & MEGA HEART (heal, usable any time
   during a level - not gated behind a quiz like the hint/skip
   items above)
   ========================================================= */

function updatePotionButtons() {

    const potionCount = getItemCount("healthPotion");
    const megaHeartCount = getItemCount("megaHeart");

    const potionCountEl = document.getElementById("potionCount");
    const megaHeartCountEl = document.getElementById("megaHeartCount");

    if (potionCountEl) potionCountEl.textContent = potionCount;
    if (megaHeartCountEl) megaHeartCountEl.textContent = megaHeartCount;

    const potionBtn = document.getElementById("usePotionBtn");
    const megaHeartBtn = document.getElementById("useMegaHeartBtn");

    const heartsFull = livesCount >= getMaxLives();

    if (potionBtn) {
        potionBtn.disabled = potionCount <= 0 || heartsFull;
    }

    if (megaHeartBtn) {
        megaHeartBtn.disabled = megaHeartCount <= 0 || heartsFull;
    }

}

function healPlayer(amount) {

    livesCount = Math.min(getMaxLives(), livesCount + amount);

    updateLivesDisplay();
    updatePotionButtons();

}

function useHealthPotion() {

    if (getItemCount("healthPotion") <= 0) return;
    if (livesCount >= getMaxLives()) return;

    localStorage.setItem(
        "count_healthPotion",
        getItemCount("healthPotion") - 1
    );

    healPlayer(1);

}

function useMegaHeart() {

    if (getItemCount("megaHeart") <= 0) return;
    if (livesCount >= getMaxLives()) return;

    localStorage.setItem(
        "count_megaHeart",
        getItemCount("megaHeart") - 1
    );

    healPlayer(2);

}

const usePotionBtn = document.getElementById("usePotionBtn");
const useMegaHeartBtn = document.getElementById("useMegaHeartBtn");

if (usePotionBtn) {
    usePotionBtn.addEventListener("click", useHealthPotion);
}

if (useMegaHeartBtn) {
    useMegaHeartBtn.addEventListener("click", useMegaHeart);
}

function useCrystalBall() {

    if (!quizOpen || !currentQuizWall) return;

    if (getItemCount("crystalBall") <= 0) return;

    localStorage.setItem(
        "count_crystalBall",
        getItemCount("crystalBall") - 1
    );

    /* Hint: gray out and disable two of the wrong answers */

    const wrongButtons =
        Array.from(document.querySelectorAll(".answerBtn"))
            .filter(button => button.dataset.answer === "wrong");

    wrongButtons
        .sort(() => Math.random() - 0.5)
        .slice(0, 2)
        .forEach(button => {

            button.disabled = true;
            button.style.opacity = "0.35";

        });

    const feedback = document.getElementById("quizFeedback");

    if (feedback) {

        feedback.textContent = "🔮 Two wrong answers ruled out!";
        feedback.style.color = "#a463ff";

    }

    updateItemsDisplay();

}

function useMagicKey() {

    if (!quizOpen || !currentQuizWall) return;

    const purchasedKeys = getItemCount("magicKey");

    if (purchasedKeys <= 0 && mualeneBonusSkip <= 0) return;

    let usedFreeSkip = false;

    /* Spend Mualene's free skip before touching purchased
       Magic Keys, so paid keys are saved for later. */
    if (mualeneBonusSkip > 0) {

        mualeneBonusSkip--;
        usedFreeSkip = true;

    } else {

        localStorage.setItem(
            "count_magicKey",
            purchasedKeys - 1
        );

    }

    const skippedWall = currentQuizWall;
    skippedWall.passed = true;
    updateGoalLockState();

    const feedback = document.getElementById("quizFeedback");

    if (feedback) {

        feedback.textContent =
            usedFreeSkip
                ? "🔑 Mualene's free skip used!"
                : "🔑 Question skipped!";

        feedback.style.color = "#ffd23a";

    }

    updateItemsDisplay();

    setTimeout(() => {

        closePhysicsQuiz();

        if (skippedWall && skippedWall.el) {
            skippedWall.el.classList.add("wallPassed");
        }

    }, 500);

}

const hintBtn = document.getElementById("hintBtn");
const skipBtn = document.getElementById("skipBtn");

if (hintBtn) {
    hintBtn.addEventListener("click", useCrystalBall);
}

if (skipBtn) {
    skipBtn.addEventListener("click", useMagicKey);
}

/* =========================================================
   19. MONSTERS (Mario-style: several roaming enemies)
   ========================================================= */

function buildMonsters(levelConfig) {

    monsters = [];

    const monstersLayer =
        document.getElementById("monstersLayer");

    if (!monstersLayer) return;

    monstersLayer.innerHTML = "";

    const difficultySettings = getDifficultySettings();

    /* Monster count and speed use the single fixed game setting. */
    const monsterCount =
        levelConfig.monsterCount + difficultySettings.monsterCountBonus;

    /* Azaic: monsters move noticeably slower while equipped. */
    const azaicSlowMult =
        isActiveCharacter("azaic") ? 0.5 : 1;

    const speedMult =
        difficultySettings.monsterSpeedMult * azaicSlowMult;

    /* Spread monsters across almost the whole level (not just a
       cramped 25%-80% pocket) so a bigger roster still leaves
       clear gaps to walk/jump through - "avoidable" rather than
       a wall of enemies. A little per-monster jitter keeps the
       spacing from looking perfectly mechanical. */
    for (let i = 0; i < monsterCount; i++) {

        const el = document.createElement("div");

        el.className = "monster";

        el.innerHTML =
            "<div class=\"monsterBody\">" +
                "<div class=\"monsterSpike\"></div>" +
                "<div class=\"monsterSpike\"></div>" +
                "<div class=\"monsterSpike\"></div>" +
                "<div class=\"monsterEyes\">" +
                    "<span class=\"monsterEye\"></span>" +
                    "<span class=\"monsterEye\"></span>" +
                "</div>" +
                "<div class=\"monsterMouth\"></div>" +
            "</div>" +
            "<div class=\"monsterLegs\"><span></span><span></span></div>";

        monstersLayer.appendChild(el);

        const spacing =
            72 / Math.max(1, monsterCount - 1 || 1);

        const jitter =
            ((i % 2 === 0) ? 1 : -1) * Math.min(2.5, spacing * 0.2);

        const startPercent =
            14 + (i * spacing) + jitter;

        const spawnX =
            Math.min(92, Math.max(8, startPercent));

        monsters.push({
            el: el,
            x: spawnX,
            spawnX: spawnX,
            /* Patrol speed - now that monsters only ever walk
               their own patrol stretch (no chasing), they can
               move noticeably faster than the old chase speed
               without becoming unfair. */
            speed: (0.09 + (i * 0.015)) * speedMult,
            canDamage: true,
            defeated: false,
            /* Patrol: starts walking left/right, alternating per
               monster so a row of them doesn't all step the same
               way at once. */
            direction: (i % 2 === 0) ? 1 : -1
        });

        el.style.left = monsters[i].x + "%";

    }

}

/*
   MONSTERS ARE PATROLLERS, NOT HUNTERS

   Monsters never chase the player - they just walk back and
   forth over a short stretch centered on their spawn point,
   flipping direction whenever they reach either edge of that
   stretch. The player has to time a walk-past through a gap
   in the patrol, or jump over the monster while it's underfoot -
   avoid it rather than outrun it.
*/
const MONSTER_PATROL_RANGE_PERCENT = 8; // how far (in % of level width) each side of spawn a monster walks

function updateMonsters() {

    if (quizOpen || levelCompleted) {
        return;
    }

    monsters.forEach(monster => {

        if (monster.defeated) return;

        monster.x += monster.speed * monster.direction;

        const patrolMin =
            monster.spawnX - MONSTER_PATROL_RANGE_PERCENT;

        const patrolMax =
            monster.spawnX + MONSTER_PATROL_RANGE_PERCENT;

        /* Hit an edge of the patrol stretch - turn around. */
        if (monster.x <= patrolMin) {

            monster.x = patrolMin;
            monster.direction = 1;

        } else if (monster.x >= patrolMax) {

            monster.x = patrolMax;
            monster.direction = -1;

        }

        if (monster.x < 5) monster.x = 5;
        if (monster.x > 95) monster.x = 95;

        monster.el.style.left = monster.x + "%";

    });

}

function checkMonsterCollisions() {

    if (quizOpen || levelCompleted) {
        return;
    }

    const player =
        document.getElementById("gamePlayer");

    if (!player) return;

    const playerRect =
        player.getBoundingClientRect();

    monsters.forEach(monster => {

        if (monster.defeated || !monster.canDamage) return;

        const monsterRect =
            monster.el.getBoundingClientRect();

        const touching =
            playerRect.left < monsterRect.right &&
            playerRect.right > monsterRect.left &&
            playerRect.top < monsterRect.bottom &&
            playerRect.bottom > monsterRect.top;

        if (touching) {

            damagePlayer();

        }

    });

}

function damagePlayer() {

    /* =========================================
       GOLDEN SHIELD
       ========================================= */

    if (hasGoldenShield && shieldHits > 0) {

        shieldHits--;

        playShieldSound();

        triggerShieldFlash();

        const shieldDisplay =
            document.getElementById("shieldDisplay");

        if (shieldHits > 0) {

            if (shieldDisplay) {

                shieldDisplay.textContent =
                    "🛡️ Shield: " +
                    shieldHits +
                    "/" +
                    shieldMaxHits;

            }

        } else {

            hasGoldenShield = false;

            /* Sui: start a 20-second cooldown instead of
               leaving her shield gone for the rest of the
               level. See updateSuiShieldCooldown(). */
            if (isActiveCharacter("sui")) {

                suiShieldCooldownEndTime =
                    performance.now() + SUI_SHIELD_COOLDOWN_MS;

                if (shieldDisplay) {
                    shieldDisplay.textContent =
                        "💥 Shield Broken (recharging...)";
                }

            } else if (shieldDisplay) {

                shieldDisplay.textContent =
                    "💥 Shield Broken";

            }

        }


        /* Push player backward */

        playerX -= 120;

        if (playerX < 0) {
            playerX = 0;
        }


        pauseAllMonsterDamage();

        return;
    }


    /* =========================================
       NO SHIELD — LOSE A LIFE
       ========================================= */

    playHitSound();

    livesCount--;

    updateLivesDisplay();


    /* Push player backward */

    playerX -= 120;

    if (playerX < 0) {
        playerX = 0;
    }


    pauseAllMonsterDamage();


    /* Game Over */

    if (livesCount <= 0) {

        livesCount = 0;

        updateLivesDisplay();

        setTimeout(() => {

            gameLoopRunning = false;

            if (gameFrameId !== null) {

                cancelAnimationFrame(gameFrameId);

                gameFrameId = null;

            }

            playGameOverSound();

            alert(
                "💔 Game Over!\n\n" +
                "You ran out of lives."
            );

            showScreen("mapScreen");

        }, 300);

    }

}

function pauseAllMonsterDamage() {

    monsters.forEach(monster => {
        monster.canDamage = false;
    });

    setTimeout(() => {

        monsters.forEach(monster => {
            monster.canDamage = true;
        });

    }, 1200);

}

/* =========================================================
   20. GOLDEN SWORD SYSTEM
   ========================================================= */

function attackMonster() {

    if (quizOpen) {
        return;
    }

    if (!hasGoldenSword) {
        return;
    }

    if (swordCooldown) {
        return;
    }

    const player =
        document.getElementById("gamePlayer");

    if (!player) {
        return;
    }

    const playerRect =
        player.getBoundingClientRect();

    monsters.forEach(monster => {

        if (monster.defeated) return;

        const monsterRect =
            monster.el.getBoundingClientRect();

        /* Distance between player and monster */

        const distance =
            Math.abs(
                playerRect.left -
                monsterRect.left
            );

        /*
           Player must be close enough
           to attack.
        */

        if (distance > 120) {
            return;
        }

        monster.defeated = true;
        monster.canDamage = false;
        monster.el.style.display = "none";

        /* Score: +50 for each monster defeated */
        addScore(POINTS_MONSTER_DEFEATED);

    });

    /* Always play the swing - a swipe that connects with nothing
       should still feel responsive, not silently do nothing. */
    playSwordSwingEffect();
    playSwordSound();

    /* Attack cooldown */

    swordCooldown = true;

    setTimeout(() => {

        swordCooldown = false;

    }, 500);

}

/* =========================================================
   SWORD SWING EFFECT (visual only)

   Positions the swing at the player and re-triggers its CSS
   animation. Mirrors the whole effect when the player is
   facing left so the blade always swings toward whatever
   direction the player is actually facing.
   ========================================================= */
function playSwordSwingEffect() {

    const attackEffect =
        document.getElementById("attackEffect");

    if (!attackEffect) return;

    attackEffect.style.left =
        playerX + 35 + "px";

    attackEffect.style.bottom =
        playerY + 20 + "px";

    attackEffect.classList.toggle(
        "facing-left",
        playerFacing === -1
    );

    /* Restart the CSS animation even if it's already mid-swing
       from a very recent attack. */
    attackEffect.classList.remove("slash");

    void attackEffect.offsetWidth;

    attackEffect.classList.add("slash");

}

document.addEventListener("keydown", (event) => {

    if (event.key.toLowerCase() === "f") {

        attackMonster();

    }

});

const attackBtn =
    document.getElementById("attackBtn");

if (attackBtn) {

    attackBtn.addEventListener(
        "click",
        attackMonster
    );

}

/* =========================================================
   21. LEVEL GOAL / COMPLETION
   ========================================================= */

/* The Finish flag stays locked (dim, no "come touch me" glow)
   until every physics wall question has been cleared - either
   answered correctly or skipped with a Magic Key. Call this any
   time a wall's "passed" state changes. */
function updateGoalLockState() {

    const goal =
        document.getElementById("levelGoal");

    if (!goal) return;

    const allWallsCleared =
        physicsWalls.every(wall => wall.passed);

    goal.classList.toggle("locked", !allWallsCleared);

}

let lastGoalHintTime = 0;

function showGoalLockedHint() {

    const now = Date.now();

    /* Throttle so standing against the locked flag doesn't spam
       the hint every animation frame. */
    if (now - lastGoalHintTime < 2500) return;

    lastGoalHintTime = now;

    const hint =
        document.getElementById("goalLockedHint");

    if (!hint) return;

    const remaining =
        physicsWalls.filter(wall => !wall.passed).length;

    hint.textContent =
        remaining === 1 ?
            "⚡ Answer the last Physics Wall first!" :
            "⚡ Answer all " + remaining + " remaining Physics Walls first!";

    hint.classList.add("active");

    clearTimeout(hint._hideTimer);

    hint._hideTimer = setTimeout(() => {
        hint.classList.remove("active");
    }, 2200);

}

function checkLevelGoal() {

    if (levelCompleted) return;

    const player =
        document.getElementById("gamePlayer");

    const goal =
        document.getElementById("levelGoal");

    if (!player || !goal) return;


    const playerRect =
        player.getBoundingClientRect();

    const goalRect =
        goal.getBoundingClientRect();


    const touching =
        playerRect.left < goalRect.right &&
        playerRect.right > goalRect.left &&
        playerRect.top < goalRect.bottom &&
        playerRect.bottom > goalRect.top;


    if (!touching) return;

    /* All questions must be finished before the flag counts -
       reaching it early just nudges the player back to the
       remaining physics walls instead of ending the level. */
    const allWallsCleared =
        physicsWalls.every(wall => wall.passed);

    if (!allWallsCleared) {

        showGoalLockedHint();
        return;

    }

    levelCompleted = true;

    completeLevel();

}


/* Tracks which location the completion modal is currently
   showing, so its Restart / Next buttons know what to do. */
let completedLevelConfig = null;
let completedLevelNext = null;

function completeLevel() {

    if (!currentLevel) return;

    playLevelCompleteSound();

    const nextLevelNumber = currentLevel.id + 1;
    const nextLevel = LEVELS[nextLevelNumber - 1];

    /* Score: bonus points for completing this location */
    const locationBonus = getLocationBonus();
    addScore(locationBonus);

    // Submit the new high score without interrupting offline gameplay.
    if (typeof window.submitScoreToLeaderboard === "function") {
        window.submitScoreToLeaderboard();
    }

    let message =
        nextLevel ?
            "You have finished " + currentLevel.name +
                ", next stop - " + nextLevel.name + "!" :
            "You have finished " + currentLevel.name + "!";

    message +=
        "\n\n🪙 Coins collected: " + coinsCollected +
        "\n⭐ Location bonus: +" + locationBonus +
        "\n⭐ Total score: " + getScore().toLocaleString();

    /* Always advance the unlocked-level counter, even past the
       final location - this is what areAllLevelsCompleted() (and
       therefore the grand prize) checks against, so it must move
       past LEVELS.length once the last kingdom is finished. */
    unlockLevel(nextLevelNumber);

    if (nextLevel) {

        /* Not done yet - more kingdoms left. */

    } else if (areAllLevelsCompleted()) {

        message += "\n\n🏆 Congratulations! you have completed SciVenture";

        setPrizeUnlocked();

    }

    completedLevelConfig = currentLevel;
    completedLevelNext = nextLevel || null;

    /* Stop the game loop right away - don't wait on the player
       to dismiss the summary, and don't rely on a blocking
       native alert() (which some embedded/mobile browsers
       silently block, which used to leave the game stuck on
       this screen forever). */
    gameLoopRunning = false;

    if (gameFrameId !== null) {

        cancelAnimationFrame(gameFrameId);
        gameFrameId = null;

    }

    showLevelCompleteModal(
        "💎 " + currentLevel.name.toUpperCase() + " COMPLETE!",
        message
    );

}

/* ---------------------------------------------------------
   LEVEL COMPLETE MODAL

   Non-blocking replacement for alert() - shows the location
   summary in-game with three options: back to the Map, Restart
   this same location, or jump straight into the Next one (if
   it exists).
   ---------------------------------------------------------- */

function showLevelCompleteModal(title, body) {

    const modal =
        document.getElementById("levelCompleteModal");

    const titleEl =
        document.getElementById("levelCompleteTitle");

    const bodyEl =
        document.getElementById("levelCompleteBody");

    if (!modal || !titleEl || !bodyEl) {

        /* Fallback, in case the modal markup is missing for
           some reason - still return to the map either way. */
        showScreen("mapScreen");
        return;

    }

    titleEl.textContent = title;
    bodyEl.textContent = body;

    /* The prize box only shows when this was the final kingdom
       (no next location to unlock) - i.e. the whole game is
       finished and the grand prize was just claimed. */
    const prizeBox =
        document.getElementById("levelCompletePrizeBox");

    if (prizeBox) {
        prizeBox.hidden = !!completedLevelNext;
    }

    const nextBtn =
        document.getElementById("levelCompleteNextBtn");

    if (nextBtn) {

        /* No next location (final kingdom just finished) - hide
           the Next button rather than leaving it clickable with
           nothing to advance to. */
        nextBtn.style.display =
            completedLevelNext ? "" : "none";

        nextBtn.textContent =
            completedLevelNext ?
                "▶ NEXT: " + completedLevelNext.name.toUpperCase() :
                "▶ NEXT";

    }

    modal.classList.add("active");

}

function closeLevelCompleteModal() {

    const modal =
        document.getElementById("levelCompleteModal");

    if (modal) modal.classList.remove("active");

}

function goToMapFromLevelComplete() {

    closeLevelCompleteModal();
    showScreen("mapScreen");

}

function restartLevelFromComplete() {

    if (!completedLevelConfig) {
        goToMapFromLevelComplete();
        return;
    }

    closeLevelCompleteModal();
    showScreen("gameScreen");
    startGame(completedLevelConfig);

}

function goToNextLevelFromComplete() {

    if (!completedLevelNext) {
        goToMapFromLevelComplete();
        return;
    }

    closeLevelCompleteModal();
    showScreen("gameScreen");
    startGame(completedLevelNext);

}

const levelCompleteMapBtn =
    document.getElementById("levelCompleteMapBtn");

if (levelCompleteMapBtn) {

    levelCompleteMapBtn.addEventListener(
        "click",
        goToMapFromLevelComplete
    );

}

const levelCompleteRestartBtn =
    document.getElementById("levelCompleteRestartBtn");

if (levelCompleteRestartBtn) {

    levelCompleteRestartBtn.addEventListener(
        "click",
        restartLevelFromComplete
    );

}

const levelCompleteNextBtn =
    document.getElementById("levelCompleteNextBtn");

if (levelCompleteNextBtn) {

    levelCompleteNextBtn.addEventListener(
        "click",
        goToNextLevelFromComplete
    );

}


/* =========================================================
   22. DEBUG MESSAGE
   ========================================================= */

console.log(
    "🌿 SciVenture loaded successfully!"
);


/* =========================================================
   SCIVENTURE ONLINE LEADERBOARD UI
   The modal works even if Firebase is not configured yet.
   Firebase functions are supplied by firebase-leaderboard.js.
   ========================================================= */
(function setupLeaderboardUI() {
    const button = document.getElementById("leaderboardBtn");
    const modal = document.getElementById("leaderboardModal");
    const close = document.getElementById("leaderboardCloseBtn");
    const refresh = document.getElementById("leaderboardRefreshBtn");

    function openLeaderboard() {
        if (!modal) return;
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");

        if (typeof window.loadFirebaseLeaderboard === "function") {
            window.loadFirebaseLeaderboard();
        } else {
            const status = document.getElementById("leaderboardStatus");
            const list = document.getElementById("leaderboardList");
            if (status) status.textContent = "Connecting to Firebase...";
            if (list) list.innerHTML = "<p>Loading online leaderboard...</p>";
        }
    }

    function closeLeaderboard() {
        if (!modal) return;
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    if (button) button.addEventListener("click", openLeaderboard);
    if (close) close.addEventListener("click", closeLeaderboard);
    if (refresh) refresh.addEventListener("click", () => {
        if (typeof window.loadFirebaseLeaderboard === "function") {
            window.loadFirebaseLeaderboard();
        }
    });

    if (modal) modal.addEventListener("click", (event) => {
        if (event.target === modal) closeLeaderboard();
    });
})();
