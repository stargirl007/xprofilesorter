const form = document.querySelector("#analyze-form");
const statusBox = document.querySelector("#status");
const results = document.querySelector("#results");
const summaryEl = document.querySelector("#summary");
const tweetsEl = document.querySelector("#tweets");
const titleEl = document.querySelector("#title");
const metaEl = document.querySelector("#meta");
const filterEl = document.querySelector("#category-filter");
const exportButton = document.querySelector("#export-csv");
const syncButton = document.querySelector("#sync-supabase");
const selectedCountEl = document.querySelector("#selected-count");
const submitBtn = document.querySelector("#submit-btn");
const cacheKey = "x-profile-sorter:last-result:v21";

let currentTweets = [];
let currentSummary = [];

// ── Utilities ──────────────────────────────────────────────────

function setStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
}

function hideStatus() {
  statusBox.className = "status hidden";
}

function formatNum(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateSelectedCount() {
  const checked = form.querySelectorAll('input[name="categories"]:checked').length;
  if (!selectedCountEl) return;
  selectedCountEl.textContent = checked === 0 ? "all by default" : `${checked} selected`;
}

// ── Rendering ──────────────────────────────────────────────────

function renderSummary(summary) {
  summaryEl.innerHTML = summary
    .map((item) => `
      <button class="summary-card" data-category="${item.id}" style="--card-accent:${item.color}">
        <span>${item.label}</span>
        <strong>${item.count}</strong>
        <small>matched posts</small>
      </button>
    `)
    .join("");

  filterEl.innerHTML =
    '<option value="all">All categories</option>' +
    summary
      .filter((item) => item.count > 0)
      .map((item) => `<option value="${item.id}">${item.label}</option>`)
      .join("");
}

function renderTweets() {
  const selected = filterEl.value;
  const tweets =
    selected === "all"
      ? currentTweets
      : currentTweets.filter((tweet) =>
          tweet.categories.some((cat) => cat.id === selected)
        );

  if (!tweets.length) {
    tweetsEl.innerHTML = '<div class="empty">No posts in this category.</div>';
    return;
  }

  tweetsEl.innerHTML = tweets
    .map((tweet, i) => {
      const cardAccent = tweet.categories[0]?.color || "rgba(148,130,255,0.5)";
      const categories = tweet.categories
        .map(
          (cat) =>
            `<span class="pill" style="--card-accent:${cat.color}">${escapeHtml(cat.label)}</span>`
        )
        .join("");

      const hits = tweet.categories
        .flatMap((cat) => cat.hits || [])
        .slice(0, 8)
        .join(", ");

      const text = String(tweet.text || "");
      const isLong = text.length > 260;
      const shortText = isLong ? `${text.slice(0, 260).trim()}…` : text;

      const date = new Date(tweet.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const mediaPart = tweet.mediaUrl
        ? `<a href="${escapeHtml(tweet.url)}" target="_blank" rel="noreferrer" class="tweet-thumb-link">
            <img class="tweet-thumb" src="${escapeHtml(tweet.mediaUrl)}" alt="media preview" loading="lazy" />
           </a>`
        : "";

      return `
        <article class="tweet-card" data-expanded="false" style="--card-accent:${cardAccent}; animation-delay:${Math.min(i * 30, 400)}ms">
          <div class="tweet-top">
            <div class="pills">${categories}</div>
            <div class="tweet-top-right">
              ${mediaPart}
              <a href="${escapeHtml(tweet.url)}" target="_blank" rel="noreferrer">Open</a>
            </div>
          </div>
          <p class="tweet-text" data-short="${escapeHtml(shortText)}" data-full="${escapeHtml(text)}">${escapeHtml(shortText)}</p>
          ${isLong ? `<button class="see-more" type="button">See more</button>` : ""}
          <div class="tweet-meta">
            <span>📅 ${date}</span>
            <span>♥ ${formatNum(tweet.likeCount)}</span>
            <span>🔁 ${formatNum(tweet.retweetCount)}</span>
            <span>👁 ${formatNum(tweet.viewCount)}</span>
          </div>
          ${hits ? `<div class="hits">Matched: ${escapeHtml(hits)}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderAnalyzeResult(data, shouldScroll = false) {
  // Sort by viewCount descending — highest views first
  currentTweets = (data.tweets || []).slice().sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  currentSummary = data.summary || [];

  // Profile picture in header
  const pfp = document.getElementById("profile-avatar");
  if (pfp) {
    if (data.avatarUrl) {
      pfp.src = data.avatarUrl;
      pfp.style.display = "block";
    } else {
      pfp.style.display = "none";
    }
  }

  titleEl.textContent = `@${data.username}`;
  metaEl.textContent = `${data.total} posts · since ${data.since} · updated ${new Date(data.updatedAt).toLocaleTimeString()}`;

  // Update terminal window title bar
  const termTitle = document.getElementById("term-title");
  if (termTitle) termTitle.textContent = `x-sort — @${data.username} — ${data.total} posts`;

  renderSummary(currentSummary);
  renderTweets();
  hideStatus();
  results.classList.remove("hidden");
  if (syncButton) {
    if (data.username.toLowerCase() === "ice_bearcute") {
      syncButton.classList.remove("hidden");
    } else {
      syncButton.classList.add("hidden");
    }
  }

  if (shouldScroll) {
    requestAnimationFrame(() => {
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

// ── Submit loading state ───────────────────────────────────────

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "Analyzing…" : "Analyze handle →";
  submitBtn.style.opacity = loading ? "0.7" : "";
}

// ── Form events ────────────────────────────────────────────────

form.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category-action]");
  if (!button) return;
  const checked = button.dataset.categoryAction === "all";
  form.querySelectorAll('input[name="categories"]').forEach((input) => {
    input.checked = checked;
  });
  updateSelectedCount();
});

form.addEventListener("change", (event) => {
  if (event.target.matches('input[name="categories"]')) updateSelectedCount();
});

updateSelectedCount();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  body.categories = formData.getAll("categories");
  body.refresh = Boolean(form.querySelector("#refresh")?.checked);
  body.quickScan = Boolean(form.querySelector("#quick-scan")?.checked);

  results.classList.add("hidden");
  setLoading(true);
  const scanLabel = body.quickScan ? "Quick scan (up to 80 posts)" : "Full scan (up to 240 posts)";
  setStatus(`⏳ ${scanLabel} — fetching posts from Twitter…`);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analyze failed");

    localStorage.setItem(cacheKey, JSON.stringify(data));
    renderAnalyzeResult(data, true);

    const refreshCheckbox = form.querySelector("#refresh");
    if (refreshCheckbox) refreshCheckbox.checked = false;
    const quickCheckbox = form.querySelector("#quick-scan");
    if (quickCheckbox) quickCheckbox.checked = false;
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
});

// ── Results events ─────────────────────────────────────────────

summaryEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;

  // Toggle: clicking the active category resets to "all"
  const clicked = button.dataset.category;
  filterEl.value = filterEl.value === clicked ? "all" : clicked;
  renderTweets();

  // Scroll to tweets
  requestAnimationFrame(() => {
    tweetsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

filterEl.addEventListener("change", renderTweets);

tweetsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".see-more");
  if (!button) return;
  const card = button.closest(".tweet-card");
  const text = card?.querySelector(".tweet-text");
  if (!card || !text) return;
  const expanded = card.dataset.expanded === "true";
  card.dataset.expanded = expanded ? "false" : "true";
  text.textContent = expanded ? text.dataset.short : text.dataset.full;
  button.textContent = expanded ? "See more" : "See less";
});

// ── Export CSV ─────────────────────────────────────────────────

exportButton.addEventListener("click", () => {
  const rows = [["date", "primary_category", "categories", "likes", "reposts", "replies", "views", "url", "text"]];
  for (const tweet of currentTweets) {
    rows.push([
      tweet.createdAt,
      tweet.primaryCategory,
      tweet.categories.map((cat) => cat.label).join("; "),
      tweet.likeCount,
      tweet.retweetCount,
      tweet.replyCount,
      tweet.viewCount,
      tweet.url,
      tweet.text,
    ]);
  }
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `x-profile-sorter-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Sync Supabase ──────────────────────────────────────────────
if (syncButton) {
  syncButton.addEventListener("click", async () => {
    const cachedStr = localStorage.getItem(cacheKey);
    if (!cachedStr) {
      alert("No analyzed results found. Please analyze a profile first.");
      return;
    }

    const cachedData = JSON.parse(cachedStr);
    const body = {
      profile: cachedData.username,
      range: cachedData.rangeMonths,
      categories: cachedData.selectedCategories,
      quickScan: cachedData.tweets.length <= 80
    };

    syncButton.disabled = true;
    syncButton.textContent = "☁ Syncing...";

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Sync failed");

      alert(`Successfully synced ${resData.count} tweets to Supabase!`);
    } catch (error) {
      console.error(error);
      alert(`Error syncing to Supabase: ${error.message}`);
    } finally {
      syncButton.disabled = false;
      syncButton.textContent = "☁ Sync Supabase";
    }
  });
}

// ── Restore last result ────────────────────────────────────────

try {
  const cached = localStorage.getItem(cacheKey);
  if (cached) renderAnalyzeResult(JSON.parse(cached), false);
} catch {
  localStorage.removeItem(cacheKey);
}

// ── Theme Toggle ───────────────────────────────────────────────
try {
  const termWindow = document.querySelector(".term-window");
  const themeToggle = document.getElementById("theme-toggle");

  if (themeToggle && termWindow) {
    const savedTheme = localStorage.getItem("x-sort:theme") || "dark";
    termWindow.setAttribute("data-theme", savedTheme);

    themeToggle.addEventListener("click", () => {
      const currentTheme = termWindow.getAttribute("data-theme");
      const newTheme = currentTheme === "light" ? "dark" : "light";
      termWindow.setAttribute("data-theme", newTheme);
      localStorage.setItem("x-sort:theme", newTheme);
    });
  }
} catch (e) {
  console.error("Theme toggle error:", e);
}
