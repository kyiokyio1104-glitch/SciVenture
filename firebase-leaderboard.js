import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const status = () => document.getElementById("leaderboardStatus");
const list = () => document.getElementById("leaderboardList");

const configured =
    !!firebaseConfig?.apiKey &&
    !!firebaseConfig?.projectId &&
    !firebaseConfig.apiKey.startsWith("PASTE_") &&
    !firebaseConfig.projectId.startsWith("PASTE_");

let db = null;
let auth = null;
let currentUser = null;
let readyPromise = null;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function initFirebase() {
    if (!configured) {
        throw new Error("Firebase Web App configuration is missing.");
    }

    if (readyPromise) {
        return readyPromise;
    }

    readyPromise = (async () => {
        console.log("🔥 Initializing SciVenture Firebase...");

        const app = initializeApp(firebaseConfig);

        auth = getAuth(app);
        db = getFirestore(app);

        if (!auth.currentUser) {
            console.log("🔥 Signing in anonymously...");
            await signInAnonymously(auth);
        }

        currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error("Anonymous Firebase authentication failed.");
        }

        console.log("✅ Firebase connected. Anonymous UID:", currentUser.uid);

        return currentUser;
    })().catch(error => {
        readyPromise = null;
        throw error;
    });

    return readyPromise;
}

async function loadLeaderboard() {
    if (!list() || !status()) return;

    list().innerHTML = "";
    status().textContent = "Connecting to Firebase...";

    try {
        await initFirebase();

        status().textContent = "Loading online leaderboard...";

        const q = query(
            collection(db, "leaderboard"),
            orderBy("score", "desc"),
            limit(50)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            list().innerHTML =
                '<p class="leaderboard-empty">No scores yet. Be the first Explorer!</p>';
            status().textContent = "Online • 0 players";
            return;
        }

        let rank = 1;

        snapshot.forEach((entry) => {
            const data = entry.data();

            const row = document.createElement("div");
            row.className = "leaderboard-row";

            row.innerHTML = `
                <span class="leaderboard-rank">#${rank}</span>
                <span class="leaderboard-name">${escapeHTML(data.name || "Explorer")}</span>
                <span class="leaderboard-score">
                    ⭐ ${Number(data.score || 0).toLocaleString()}
                </span>
            `;

            list().appendChild(row);
            rank++;
        });

        status().textContent =
            `Online • ${snapshot.size} player${snapshot.size === 1 ? "" : "s"}`;

    } catch (error) {
        console.error("❌ Firebase leaderboard error:", error);

        list().innerHTML =
            `<p class="leaderboard-empty">
                ${configured
                    ? "Could not connect to the leaderboard. Check Firebase Authentication, Firestore, Rules, and your internet connection."
                    : "Firebase is not connected yet. Check firebase-config.js."}
             </p>`;

        status().textContent =
            configured ? "Firebase connection error" : "Firebase setup required";
    }
}

async function submitScoreToLeaderboard() {
    try {
        await initFirebase();

        const score =
            typeof window.getScore === "function"
                ? Number(window.getScore())
                : Number(localStorage.getItem("totalScore") || 0);

        const name =
            typeof window.getPlayerName === "function"
                ? window.getPlayerName()
                : (localStorage.getItem("playerName") || "Explorer");

        if (!Number.isFinite(score) || score < 0 || !currentUser) {
            return;
        }

        const playerRef = doc(db, "leaderboard", currentUser.uid);
        const existing = await getDoc(playerRef);

        const oldScore =
            existing.exists()
                ? Number(existing.data().score || 0)
                : -1;

        // Never replace a player's high score with a lower score.
        if (score <= oldScore) {
            return;
        }

        await setDoc(playerRef, {
            uid: currentUser.uid,
            name: String(name || "Explorer").slice(0, 16),
            score: Math.floor(score),
            updatedAt: serverTimestamp()
        });

        console.log("🏆 SciVenture score uploaded:", score);

    } catch (error) {
        // Firebase should never stop the game from being played offline.
        console.warn("⚠️ Leaderboard submission skipped:", error);
    }
}

// script.js uses these functions through window.
window.loadFirebaseLeaderboard = loadLeaderboard;
window.submitScoreToLeaderboard = submitScoreToLeaderboard;

// Start Firebase in the background, but don't block the game.
if (configured) {
    initFirebase().catch(error => {
        console.warn("⚠️ Firebase background initialization failed:", error);
    });
}
