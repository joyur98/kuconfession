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
//  MODERATION
// ==========================================

const bannedWords = [
  // Nepali slurs — direct
  'lado', 'lādo',
  'puti', 'pūti',
  'muji', 'mujī',
  'randi', 'randī',
  'machikne', 'māchikne',
  'myachikne', 'myāchikne',
  'bhalu', 'valu', 'bhālu',
  'kutta', 'kutti',
  'haramkhor', 'haramkor',
  'chikna', 'chikne',
  'harami',
  'dalla', 'dalal',
  'beshya', 'besya',
  'suwwar', 'suwar',
  'gandu', 'gaandu',
  'laure',
  'chhakka', 'chakka',
  'jhatu',
  'bakchod', 'bakchodi',
  'chutiya', 'chhutiya',
  'lode', 'lodi',
  'tharki',
  'phataha', 'fataaha',
  'kukur',
];

/**
 * Normalize text to catch:
 *  - leet-speak:       muj1, pu7i
 *  - spaced letters:   m u j i
 *  - repeated letters: puuuttttiii → puti, mmuujjii → muji
 *  - mixed:            p.u.t.i, p_u_t_i
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    // leet substitutions
    .replace(/0/g,  'o')
    .replace(/1/g,  'i')
    .replace(/3/g,  'e')
    .replace(/4/g,  'a')
    .replace(/5/g,  's')
    .replace(/7/g,  't')
    .replace(/@/g,  'a')
    .replace(/\$/g, 's')
    // strip non-alpha (spaces, dots, underscores, dashes, etc.)
    .replace(/[^a-z]/g, '')
    // collapse runs of the same letter: "puuuttiii" → "puti"
    .replace(/(.)\1+/g, '$1');
}

function containsBannedWord(text) {
  const normalized = normalizeText(text);
  const lower      = text.toLowerCase().replace(/(.)\1+/gi, '$1'); // also de-dupe on raw
  return bannedWords.some(w => {
    // normalize the banned word itself the same way so comparisons are consistent
    const nw = normalizeText(w);
    return normalized.includes(nw) || lower.includes(w);
  });
}

// Rotate through friendly-but-firm messages
const warningMessages = [
  "💬 Words carry weight — even anonymously. Please rephrase without the offensive language.",
  "🙏 Real people from your campus read these. Keep it human and kind.",
  "✍️ You clearly have something to say — say it without the slur. We're listening.",
  "💛 This is a safe space. Offensive language breaks that for everyone. Try again.",
  "🌿 KU Confessions works because people trust it. Help us keep it that way.",
];
let warningIndex = 0;
function getWarningMessage() {
  const msg = warningMessages[warningIndex % warningMessages.length];
  warningIndex++;
  return msg;
}

// Show the warning overlay with animated progress bar
function showWarning() {
  const overlay  = document.getElementById("warningOverlay");
  const msgEl    = document.getElementById("warningMessage");
  const barEl    = document.getElementById("warningProgressBar");

  if (msgEl) msgEl.textContent = getWarningMessage();
  if (!overlay) return;

  overlay.classList.remove("hidden");

  // Reset + animate progress bar over 5 s
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
//  HISTORICAL CLEANUP
//  Deletes confessions (and their comments)
//  that contain any banned word, including
//  stretched variants like "puuuttttiii".
//  Also cleans up stray comment sub-collections.
// ==========================================
async function cleanupBannedContent() {
  console.log("🧹 Starting banned-content cleanup…");
  try {
    const snapshot = await getDocs(collection(db, "confessions"));
    const deletionPromises = [];

    for (const confDoc of snapshot.docs) {
      const data = confDoc.data();
      const textToCheck = data.text || "";

      if (containsBannedWord(textToCheck)) {
        console.log(`🗑 Deleting confession ${confDoc.id}:`, textToCheck.slice(0, 60));

        // Delete all comments in the sub-collection first
        try {
          const commentsSnap = await getDocs(
            collection(db, "confessions", confDoc.id, "comments")
          );
          commentsSnap.docs.forEach(commentDoc => {
            deletionPromises.push(
              deleteDoc(doc(db, "confessions", confDoc.id, "comments", commentDoc.id))
            );
          });
        } catch (e) {
          // sub-collection may not exist — that's fine
        }

        // Delete the confession itself
        deletionPromises.push(deleteDoc(doc(db, "confessions", confDoc.id)));
        continue; // no need to check comments if the whole confession is gone
      }

      // Confession text is clean — but check its comments too
      try {
        const commentsSnap = await getDocs(
          collection(db, "confessions", confDoc.id, "comments")
        );
        for (const commentDoc of commentsSnap.docs) {
          const cData = commentDoc.data();
          if (containsBannedWord(cData.text || "")) {
            console.log(`🗑 Deleting comment ${commentDoc.id} on ${confDoc.id}`);
            deletionPromises.push(
              deleteDoc(doc(db, "confessions", confDoc.id, "comments", commentDoc.id))
            );
            // Decrement the parent's commentCount
            deletionPromises.push(
              updateDoc(doc(db, "confessions", confDoc.id), { commentCount: increment(-1) })
            );
          }
        }
      } catch (e) {
        // sub-collection may not exist
      }
    }

    await Promise.all(deletionPromises);
    const deleted = deletionPromises.length;
    if (deleted > 0) {
      console.log(`✅ Cleanup done — ${deleted} document(s) removed.`);
    } else {
      console.log("✅ Cleanup done — nothing to remove.");
    }
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
  }
}

// Run cleanup on every page load (safe to leave permanently —
// it only deletes documents that match the banned list).
cleanupBannedContent();

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
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
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
      </div>
    </div>
  `;

  card.querySelector(".like-btn").addEventListener("click", handleLike);
  card.querySelector(".comment-btn").addEventListener("click", openCommentModal);
  return card;
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
      const data = d.data();
      const item = document.createElement("div");
      item.className = "comment-item";
      item.innerHTML = `
        <p class="comment-item-text">${escapeHtml(data.text || "")}</p>
        <p class="comment-item-time">${timeAgo(data.createdAt)}</p>
      `;
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

async function handleCommentSubmit() {
  const text = commentText.value.trim();
  if (!text) { showToast("Write something first ✍️"); return; }
  if (!activeConfessionId) return;

  if (containsBannedWord(text)) { showWarning(); return; }

  commentSubmitBtn.disabled = true;
  try {
    const commentsRef = collection(db, "confessions", activeConfessionId, "comments");
    await addDoc(commentsRef, { text, createdAt: serverTimestamp() });
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
    await addDoc(collection(db, "confessions"), {
      text, category, likes: 0, commentCount: 0, createdAt: serverTimestamp(),
    });
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
  onSnapshot(q, (snapshot) => {
    allConfessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFeed();
  });
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
