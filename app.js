// ==========================================
//  KU CONFESSIONS — app.js
//  Firebase SDK (compat v9 via CDN module)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  increment,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";

// ---- Firebase Config ----
const firebaseConfig = {
  apiKey: "AIzaSyAgRqNFrPf9qZVHEG1aduKLrONy4L0sTCc",
  authDomain: "kuconfess-f9b05.firebaseapp.com",
  projectId: "kuconfess-f9b05",
  storageBucket: "kuconfess-f9b05.firebasestorage.app",
  messagingSenderId: "899894286957",
  appId: "1:899894286957:web:f97b8aa68f376cb94a3d64",
  measurementId: "G-QQ2Z1FB3K9"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ---- State ----
let allConfessions = [];
let activeCategory = "all";
let activeSort = "newest";
let likedSet = new Set(JSON.parse(localStorage.getItem("ku_liked") || "[]"));

// ---- DOM Refs ----
const feed = document.getElementById("feed");
const skeletonLoader = document.getElementById("skeletonLoader");
const emptyState = document.getElementById("emptyState");
const modalOverlay = document.getElementById("modalOverlay");
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const submitBtn = document.getElementById("submitBtn");
const submitLabel = document.getElementById("submitLabel");
const confessionText = document.getElementById("confessionText");
const charCount = document.getElementById("charCount");
const statCount = document.getElementById("statCount");
const statLikes = document.getElementById("statLikes");
const toastEl = document.getElementById("toast");
const navTabs = document.querySelectorAll(".nav-tab");
const sortBtns = document.querySelectorAll(".sort-btn");
const categoryPills = document.querySelectorAll(".pill");

// ---- Category meta ----
const catMeta = {
  love:      { label: "💛 Love",      color: "#f5c842" },
  academics: { label: "📚 Academics", color: "#7c6af5" },
  campus:    { label: "🏛️ Campus",    color: "#5bbfea" },
  other:     { label: "🌀 Other",     color: "#e86a3a" },
};

// ---- Helpers ----
function timeAgo(ts) {
  if (!ts) return "just now";
  const now = Date.now();
  const sec = Math.floor((now - ts.toMillis()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.add("hidden"), duration);
}

function saveLiked() {
  localStorage.setItem("ku_liked", JSON.stringify([...likedSet]));
}

// ---- Render ----
function renderFeed() {
  // Remove existing cards (keep skeleton)
  document.querySelectorAll(".confession-card").forEach((el) => el.remove());

  let filtered =
    activeCategory === "all"
      ? [...allConfessions]
      : allConfessions.filter((c) => c.category === activeCategory);

  if (activeSort === "top") {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    filtered.sort((a, b) => {
      const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }

  skeletonLoader.classList.add("hidden");

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach((conf, i) => {
    const card = buildCard(conf, i);
    feed.appendChild(card);
  });

  // Update stats
  const totalLikes = allConfessions.reduce((s, c) => s + (c.likes || 0), 0);
  statCount.textContent = allConfessions.length;
  statLikes.textContent = totalLikes;
}

function buildCard(conf, i) {
  const card = document.createElement("div");
  card.className = "confession-card";
  card.style.animationDelay = `${i * 0.04}s`;

  const meta = catMeta[conf.category] || catMeta.other;
  const isLiked = likedSet.has(conf.id);

  card.innerHTML = `
    <div class="card-category" style="color:${meta.color};background:${meta.color}18">${meta.label}</div>
    <p class="card-text">${escapeHtml(conf.text)}</p>
    <div class="card-footer">
      <span class="card-time">${timeAgo(conf.createdAt)}</span>
      <button class="like-btn ${isLiked ? "liked" : ""}" data-id="${conf.id}">
        <span class="heart">${isLiked ? "❤️" : "🤍"}</span>
        <span class="like-count">${conf.likes || 0}</span>
      </button>
    </div>
  `;

  card.querySelector(".like-btn").addEventListener("click", handleLike);
  return card;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---- Like ----
async function handleLike(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;

  if (likedSet.has(id)) {
    showToast("You've already liked this confession 💛");
    return;
  }

  likedSet.add(id);
  saveLiked();
  btn.classList.add("liked");
  btn.querySelector(".heart").textContent = "❤️";

  const countEl = btn.querySelector(".like-count");
  countEl.textContent = parseInt(countEl.textContent || "0") + 1;

  // Update in Firestore
  try {
    await updateDoc(doc(db, "confessions", id), { likes: increment(1) });
  } catch (err) {
    console.error("Like update failed:", err);
  }
}

// ---- Submit ----
async function handleSubmit() {
  const text = confessionText.value.trim();
  if (!text) {
    showToast("Please write something first ✍️");
    return;
  }

  const activePill = document.querySelector(".pill.active");
  const category = activePill ? activePill.dataset.cat : "other";

  submitBtn.disabled = true;
  submitLabel.textContent = "Posting…";

  try {
    await addDoc(collection(db, "confessions"), {
      text,
      category,
      likes: 0,
      createdAt: serverTimestamp(),
    });

    confessionText.value = "";
    charCount.textContent = "0";
    modalOverlay.classList.add("hidden");
    showToast("Confession posted 🎉 The world is listening.");
  } catch (err) {
    console.error("Post failed:", err);
    showToast("Something went wrong. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitLabel.textContent = "Post Anonymously";
  }
}

// ---- Real-time listener ----
function listenToConfessions() {
  const q = query(collection(db, "confessions"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allConfessions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    docChanges();
  });
}

// ---- Category filter ----
navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    navTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.tab;
    renderFeed();
  });
});

// ---- Sort ----
sortBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    sortBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSort = btn.dataset.sort;
    renderFeed();
  });
});

// ---- Category pills in modal ----
categoryPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    categoryPills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
  });
});

// ---- Char counter ----
confessionText.addEventListener("input", () => {
  charCount.textContent = confessionText.value.length;
});

// ---- Modal open/close ----
openModalBtn.addEventListener("click", () => {
  modalOverlay.classList.remove("hidden");
  confessionText.focus();
});
closeModalBtn.addEventListener("click", () => {
  modalOverlay.classList.add("hidden");
});
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modalOverlay.classList.add("hidden");
});

// ---- Submit ----
submitBtn.addEventListener("click", handleSubmit);
confessionText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.metaKey) handleSubmit();
});

// ---- Boot ----
listenToConfessions();
