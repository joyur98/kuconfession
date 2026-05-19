// ==========================================
//  KU CONFESSIONS — app.js
//  Firebase SDK v9 via CDN module
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
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

// ==========================================
//  OWNERSHIP TOKENS
//  When a user posts, we generate a random token,
//  store it on the Firestore document AND in
//  localStorage. If the tokens match, they own it
//  and see a delete button — no login needed.
// ==========================================

const OWNED_KEY = "confess_owned";

function loadOwned() {
  try { return JSON.parse(localStorage.getItem(OWNED_KEY) || "{}"); }
  catch { return {}; }
}
function saveOwned(owned) {
  localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
}
function generateToken() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function registerOwnership(docId, token) {
  const owned = loadOwned();
  owned[docId] = token;
  saveOwned(owned);
}
function isOwned(docId, firestoreToken) {
  if (!firestoreToken) return false;
  return loadOwned()[docId] === firestoreToken;
}

// ==========================================
//  MODERATION
//  Only runs on NEW submissions — no historical
//  cleanup so the feed never reloads on its own.
// ==========================================

const bannedWords = [
  // --- Nepali / campus slurs ---
  'lado', 'puti', 'muji', 'randi', 'machikne', 'myachikne',
  'bhalu', 'valu', 'kutta', 'kutti', 'haramkhor', 'haramkor',
  'chikna', 'chikne', 'harami', 'dalla', 'dalal', 'beshya',
  'besya', 'suwwar', 'suwar', 'gandu', 'gaandu', 'laure',
  'chhakka', 'chakka', 'jhatu', 'bakchod', 'bakchodi',
  'chutiya', 'chhutiya', 'lode', 'lodi', 'tharki',
  'phataha', 'fataaha', 'kukur',

  // --- English profanity ---
  'fuck', 'fucker', 'fucking', 'fucked', 'fuckup', 'fuckoff',
  'shit', 'shitty', 'bullshit',
  'bitch', 'bitches', 'bitching',
  'asshole', 'arsehole', 'ass', 'asses',
  'bastard', 'bastards',
  'damn', 'damnit',
  'cunt', 'cunts',
  'dick', 'dicks', 'dickhead',
  'cock', 'cocks', 'cocksucker',
  'pussy', 'pussies',
  'whore', 'whores', 'whorish',
  'slut', 'sluts', 'slutty',
  'piss', 'pissed', 'pissoff',
  'crap', 'crappy',
  'motherfucker', 

  // --- Racial & identity slurs ---
  'nigger', 'nigga', 'niggas',
  'chink', 'chinks',
  'spic', 'spics',
  'kike', 'kikes',
  'gook', 'gooks',
  'wetback',
  'cracker',
  'faggot', 'fag', 'fags',
  'dyke',
  'tranny', 'trannies',
  'retard', 'retarded', 'retards',
  'spastic', 'spaz',
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function containsBannedWord(text) {
  const normalized = normalizeText(text);
  const lower = text.toLowerCase().replace(/(.)\1+/gi, '$1');
  return bannedWords.some(w => {
    const nw = normalizeText(w);
    // Word boundary check — must be whole word, not substring
    const wordBoundary = new RegExp(`(?<![a-z])${nw}(?![a-z])`);
    const wordBoundaryRaw = new RegExp(`(?<![a-z])${w.replace(/(.)\1+/gi,'$1')}(?![a-z])`);
    return wordBoundary.test(normalized) || wordBoundaryRaw.test(lower);
  });
}

const warningMessages = [
  "💬 Words carry weight — even anonymously. Please rephrase without the offensive language.",
  "🙏 Real people from your campus read these. Keep it human and kind.",
  "✍️ You clearly have something to say — say it without the slur. We're listening.",
  "💛 This is a safe space. Offensive language breaks that for everyone. Try again.",
  "🌿 KU Confessions works because people trust it. Help us keep it that way.",
];
let warningIndex = 0;
function getWarningMessage() {
  return warningMessages[(warningIndex++) % warningMessages.length];
}

function showWarning() {
  const overlay = document.getElementById("warningOverlay");
  const msgEl   = document.getElementById("warningMessage");
  const barEl   = document.getElementById("warningProgressBar");
  if (msgEl) msgEl.textContent = getWarningMessage();
  if (!overlay) return;
  overlay.classList.remove("hidden");
  if (barEl) {
    barEl.style.transition = "none";
    barEl.style.width = "100%";
    void barEl.offsetWidth;
    barEl.style.transition = "width 5s linear";
    barEl.style.width = "0%";
  }
  clearTimeout(overlay._timer);
  overlay._timer = setTimeout(() => overlay.classList.add("hidden"), 5000);
}

// ==========================================
//  STATE
// ==========================================
let allConfessions = [];
let activeCategory = "all";
let activeSort     = "newest";
let likedSet       = new Set(JSON.parse(localStorage.getItem("confess_liked") || "[]"));

let activeConfessionId   = null;
let activeConfessionText = null;
let commentUnsubscribe   = null;

// ==========================================
//  DOM REFS
// ==========================================
const feed           = document.getElementById("feed");
const skeletonLoader = document.getElementById("skeletonLoader");
const emptyState     = document.getElementById("emptyState");
const modalOverlay   = document.getElementById("modalOverlay");
const openModalBtn   = document.getElementById("openModalBtn");
const closeModalBtn  = document.getElementById("closeModalBtn");
const submitBtn      = document.getElementById("submitBtn");
const submitLabel    = document.getElementById("submitLabel");
const confessionText = document.getElementById("confessionText");
const charCount      = document.getElementById("charCount");
const statCount      = document.getElementById("statCount");
const toastEl        = document.getElementById("toast");
const navTabs        = document.querySelectorAll(".nav-tab");
const sortBtns       = document.querySelectorAll(".sort-btn");
const categoryPills  = document.querySelectorAll(".pill");

const commentModalOverlay      = document.getElementById("commentModalOverlay");
const closeCommentModalBtn     = document.getElementById("closeCommentModalBtn");
const commentConfessionPreview = document.getElementById("commentConfessionPreview");
const commentsList             = document.getElementById("commentsList");
const commentText              = document.getElementById("commentText");
const commentCharCount         = document.getElementById("commentCharCount");
const commentSubmitBtn         = document.getElementById("commentSubmitBtn");
const commentModalReplyCount   = document.getElementById("commentModalReplyCount");

// ==========================================
//  CATEGORY META
// ==========================================
const catMeta = {
  love:  { label: "💛 Love",  color: "#f5c842" },
  life:  { label: "🌿 Life",  color: "#6abf7b" },
  rant:  { label: "🔥 Rant",  color: "#e86a3a" },
  other: { label: "🌀 Other", color: "#7c6af5" },
};

// ==========================================
//  HELPERS
// ==========================================
function timeAgo(ts) {
  if (!ts) return "just now";
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function showToast(msg, duration = 2500) {
  toastEl.innerHTML = "";
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.add("hidden"), duration);
}

function saveLiked() {
  localStorage.setItem("confess_liked", JSON.stringify([...likedSet]));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ==========================================
//  INLINE CONFIRM (uses toast bar)
// ==========================================
function confirmDelete(label, onConfirm) {
  toastEl.innerHTML = `
    <span style="flex:1">${label}</span>
    <button id="toastConfirmYes" style="margin-left:10px;background:#e86a3a;border:none;color:#fff;border-radius:7px;padding:4px 14px;cursor:pointer;font-size:0.8rem;font-family:inherit;font-weight:500">Delete</button>
    <button id="toastConfirmNo"  style="margin-left:6px;background:rgba(255,255,255,0.14);border:none;color:#fff;border-radius:7px;padding:4px 14px;cursor:pointer;font-size:0.8rem;font-family:inherit">Cancel</button>
  `;
  toastEl.style.display = "flex";
  toastEl.style.alignItems = "center";
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._timer);

  const cleanup = () => {
    toastEl.classList.add("hidden");
    toastEl.innerHTML = "";
    toastEl.style.display = "";
    toastEl.style.alignItems = "";
  };

  document.getElementById("toastConfirmYes").addEventListener("click", () => { cleanup(); onConfirm(); });
  document.getElementById("toastConfirmNo").addEventListener("click", cleanup);
  toastEl._timer = setTimeout(cleanup, 7000);
}

// ==========================================
//  RENDER FEED
// ==========================================
function renderFeed() {
  document.querySelectorAll(".confession-card").forEach(el => el.remove());

  let filtered = activeCategory === "all"
    ? [...allConfessions]
    : allConfessions.filter(c => c.category === activeCategory);

  if (activeSort === "top") {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (activeSort === "discussed") {
    filtered.sort((a, b) => (Number(b.commentCount) || 0) - (Number(a.commentCount) || 0));
  } else {
    filtered.sort((a, b) => {
      const aT = a.createdAt ? a.createdAt.toMillis() : 0;
      const bT = b.createdAt ? b.createdAt.toMillis() : 0;
      return bT - aT;
    });
  }

  skeletonLoader.classList.add("hidden");

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach((conf, i) => feed.appendChild(buildCard(conf, i)));
  statCount.textContent = allConfessions.length;
}

function buildCard(conf, i) {
  const card = document.createElement("div");
  card.className = "confession-card";
  card.style.animationDelay = `${i * 0.04}s`;

  const meta         = catMeta[conf.category] || catMeta.other;
  const isLiked      = likedSet.has(conf.id);
  const commentCount = parseInt(conf.commentCount, 10) || 0;
  const replyLabel   = commentCount === 0 ? "Reply"
    : commentCount === 1 ? "1 reply"
    : `${commentCount} replies`;
  const owned        = isOwned(conf.id, conf.ownerToken);

  card.innerHTML = `
    <div class="card-category" style="color:${meta.color};background:${meta.color}18">${meta.label}</div>
    <p class="card-text">${escapeHtml(conf.text)}</p>
    <div class="card-footer">
      <span class="card-time">${timeAgo(conf.createdAt)}</span>
      <div class="card-actions">
        <button class="like-btn ${isLiked ? "liked" : ""}" data-id="${conf.id}">
          <span class="heart">${isLiked ? "❤️" : "🤍"}</span>
          <span class="like-count">${conf.likes || 0}</span>
        </button>
        <button class="comment-btn ${commentCount > 0 ? "has-comments" : ""}" data-id="${conf.id}" data-text="${escapeHtml(conf.text)}">
          <span class="comment-icon">💬</span>
          <span class="comment-label">${replyLabel}</span>
        </button>
        ${owned ? `<button class="delete-confession-btn" title="Delete my confession" aria-label="Delete confession">🗑</button>` : ""}
      </div>
    </div>
  `;

  card.querySelector(".like-btn").addEventListener("click", handleLike);
  card.querySelector(".comment-btn").addEventListener("click", openCommentModal);
  if (owned) {
    card.querySelector(".delete-confession-btn").addEventListener("click", () =>
      handleDeleteConfession(conf.id)
    );
  }
  return card;
}

// ==========================================
//  DELETE CONFESSION
// ==========================================
async function handleDeleteConfession(id) {
  confirmDelete("Delete your confession? This can't be undone.", async () => {
    try {
      const commentsSnap = await getDocs(collection(db, "confessions", id, "comments"));
      await Promise.all(commentsSnap.docs.map(cd =>
        deleteDoc(doc(db, "confessions", id, "comments", cd.id))
      ));
      await deleteDoc(doc(db, "confessions", id));
      const owned = loadOwned();
      delete owned[id];
      saveOwned(owned);
      showToast("Your confession was deleted.");
    } catch (err) {
      console.error("Delete confession failed:", err);
      showToast("Couldn't delete — try again.");
    }
  });
}

// ==========================================
//  LIKE
// ==========================================
async function handleLike(e) {
  const btn = e.currentTarget;
  const id  = btn.dataset.id;

  if (likedSet.has(id)) {
    showToast("You've already liked this one 💛");
    return;
  }

  likedSet.add(id);
  saveLiked();
  btn.classList.add("liked");
  btn.querySelector(".heart").textContent = "❤️";
  const countEl = btn.querySelector(".like-count");
  countEl.textContent = parseInt(countEl.textContent || "0") + 1;

  try {
    await updateDoc(doc(db, "confessions", id), { likes: increment(1) });
  } catch (err) {
    console.error("Like update failed:", err);
  }
}

// ==========================================
//  COMMENTS
// ==========================================
function openCommentModal(e) {
  const btn = e.currentTarget;
  activeConfessionId   = btn.dataset.id;
  activeConfessionText = btn.dataset.text;

  commentConfessionPreview.textContent = `"${activeConfessionText}"`;
  commentsList.innerHTML = `<div class="comments-loading">Loading replies…</div>`;
  commentText.value = "";
  commentCharCount.textContent = "0";
  if (commentModalReplyCount) commentModalReplyCount.textContent = "…";

  commentModalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  if (commentUnsubscribe) commentUnsubscribe();

  const commentsRef = collection(db, "confessions", activeConfessionId, "comments");
  const q = query(commentsRef, orderBy("createdAt", "asc"));

  commentUnsubscribe = onSnapshot(q, (snapshot) => {
    const count      = snapshot.size;
    const countLabel = n => n === 0 ? "Reply" : n === 1 ? "1 reply" : `${n} replies`;

    if (commentModalReplyCount) {
      commentModalReplyCount.textContent = count === 0
        ? "No replies yet"
        : count === 1 ? "1 reply" : `${count} replies`;
    }

    const cardBtn = document.querySelector(`.comment-btn[data-id="${activeConfessionId}"]`);
    if (cardBtn) {
      const labelEl = cardBtn.querySelector(".comment-label");
      if (labelEl) labelEl.textContent = countLabel(count);
      cardBtn.classList.toggle("has-comments", count > 0);
    }

    commentsList.innerHTML = "";
    if (snapshot.empty) {
      commentsList.innerHTML = `
        <div class="no-comments">
          <div class="no-comments-icon">💬</div>
          <p>No replies yet.</p>
          <p class="no-comments-sub">Be the first to say something kind.</p>
        </div>`;
      return;
    }

    snapshot.docs.forEach(d => {
      const data       = d.data();
      const commentId  = d.id;
      const commentKey = `${activeConfessionId}__${commentId}`;
      const ownedCmt   = isOwned(commentKey, data.ownerToken);

      const item = document.createElement("div");
      item.className = "comment-item";
      item.innerHTML = `
        <div class="comment-item-body">
          <p class="comment-item-text">${escapeHtml(data.text || "")}</p>
          ${ownedCmt ? `<button class="delete-comment-btn" title="Delete my reply" aria-label="Delete reply">🗑</button>` : ""}
        </div>
        <p class="comment-item-time">${timeAgo(data.createdAt)}</p>
      `;
      if (ownedCmt) {
        item.querySelector(".delete-comment-btn").addEventListener("click", () =>
          handleDeleteComment(activeConfessionId, commentId, commentKey)
        );
      }
      commentsList.appendChild(item);
    });
    commentsList.scrollTop = commentsList.scrollHeight;
  });
}

function closeCommentModal() {
  commentModalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  if (commentUnsubscribe) { commentUnsubscribe(); commentUnsubscribe = null; }
  activeConfessionId = null;
}

// ==========================================
//  DELETE COMMENT
// ==========================================
async function handleDeleteComment(confessionId, commentId, commentKey) {
  confirmDelete("Delete your reply? This can't be undone.", async () => {
    try {
      await deleteDoc(doc(db, "confessions", confessionId, "comments", commentId));
      await updateDoc(doc(db, "confessions", confessionId), { commentCount: increment(-1) });
      const owned = loadOwned();
      delete owned[commentKey];
      saveOwned(owned);
      showToast("Reply deleted.");
    } catch (err) {
      console.error("Delete comment failed:", err);
      showToast("Couldn't delete — try again.");
    }
  });
}

async function handleCommentSubmit() {
  const text = commentText.value.trim();
  if (!text) { showToast("Write something first ✍️"); return; }
  if (!activeConfessionId) return;
  if (containsBannedWord(text)) { showWarning(); return; }

  commentSubmitBtn.disabled = true;
  try {
    const token       = generateToken();
    const commentsRef = collection(db, "confessions", activeConfessionId, "comments");
    const newDoc      = await addDoc(commentsRef, {
      text,
      ownerToken: token,
      createdAt: serverTimestamp(),
    });
    registerOwnership(`${activeConfessionId}__${newDoc.id}`, token);
    await updateDoc(doc(db, "confessions", activeConfessionId), { commentCount: increment(1) });
    commentText.value = "";
    commentCharCount.textContent = "0";
    showToast("Reply posted anonymously 💬");
  } catch (err) {
    console.error("Comment failed:", err);
    showToast("Something went wrong. Try again.");
  } finally {
    commentSubmitBtn.disabled = false;
  }
}

// ==========================================
//  SUBMIT CONFESSION
// ==========================================
async function handleSubmit() {
  const text = confessionText.value.trim();
  if (!text) { showToast("Please write something first ✍️"); return; }
  if (containsBannedWord(text)) { showWarning(); return; }

  const activePill = document.querySelector(".pill.active");
  const category   = activePill ? activePill.dataset.cat : "other";

  submitBtn.disabled      = true;
  submitLabel.textContent = "Posting…";

  try {
    const token  = generateToken();
    const newDoc = await addDoc(collection(db, "confessions"), {
      text,
      category,
      likes: 0,
      commentCount: 0,
      ownerToken: token,
      createdAt: serverTimestamp(),
    });
    registerOwnership(newDoc.id, token);
    confessionText.value = "";
    charCount.textContent = "0";
    modalOverlay.classList.add("hidden");
    showToast("Posted anonymously 🎉 The world is listening.");
  } catch (err) {
    console.error("Post failed:", err);
    showToast("Something went wrong. Please try again.");
  } finally {
    submitBtn.disabled      = false;
    submitLabel.textContent = "Post Anonymously";
  }
}

// ==========================================
//  REAL-TIME LISTENER
// ==========================================
function listenToConfessions() {
  const q = query(collection(db, "confessions"), orderBy("createdAt", "desc"));
  onSnapshot(q,
    (snapshot) => {
      allConfessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderFeed();
    },
    (err) => {
      // If the ordered query fails (e.g. missing Firestore index),
      // fall back to an unordered fetch so confessions still appear.
      console.warn("Ordered snapshot failed, falling back:", err.message);
      getDocs(collection(db, "confessions")).then(snapshot => {
        allConfessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderFeed();
      }).catch(e => console.error("Fallback fetch failed:", e));
    }
  );
}

// ==========================================
//  EVENT LISTENERS
// ==========================================

navTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    navTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeCategory = tab.dataset.tab;
    renderFeed();
  });
});

sortBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    sortBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeSort = btn.dataset.sort;
    renderFeed();
  });
});

categoryPills.forEach(pill => {
  pill.addEventListener("click", () => {
    categoryPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
  });
});

confessionText.addEventListener("input", () => { charCount.textContent = confessionText.value.length; });
commentText.addEventListener("input",    () => { commentCharCount.textContent = commentText.value.length; });

openModalBtn.addEventListener("click", () => {
  modalOverlay.classList.remove("hidden");
  confessionText.focus();
});
closeModalBtn.addEventListener("click", () => modalOverlay.classList.add("hidden"));
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) modalOverlay.classList.add("hidden"); });

closeCommentModalBtn.addEventListener("click", closeCommentModal);
commentModalOverlay.addEventListener("click", e => { if (e.target === commentModalOverlay) closeCommentModal(); });
commentSubmitBtn.addEventListener("click", handleCommentSubmit);
commentText.addEventListener("keydown", e => { if (e.key === "Enter" && e.metaKey) handleCommentSubmit(); });

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    modalOverlay.classList.add("hidden");
    closeCommentModal();
  }
});

submitBtn.addEventListener("click", handleSubmit);
confessionText.addEventListener("keydown", e => { if (e.key === "Enter" && e.metaKey) handleSubmit(); });

// ==========================================
//  BOOT
// ==========================================
listenToConfessions();
