import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const BASE = "https://api.twitterapi.io";
const MAX_TWEETS = 240;
const MAX_SEARCH_PAGES = 12;
const RAW_TWEET_TTL_MS = 12 * 60 * 60 * 1000;
const CLASSIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const CLASSIFIER_VERSION = "v24-parallel-ai";
const cacheDir = path.join(__dirname, ".cache");
const rawCacheDir = path.join(cacheDir, "tweets");
const classificationCacheDir = path.join(cacheDir, "classifications");

const globalExcludeKeywords = ["my pfp", "pfp", "my avatar", "check out", "gm", "gmgm", "gm gm", "good morning", "selfie", "selfie pic", "me irl", "my pic", "my photo", "profile pic", "just woke up", "at gym", "gym", "outfit", "meme", "jk", "vibes only"];
const aiVideoKeywords = ["ai video", "ai-generated video", "ai generated video", "generated video", "generated with ai", "suno", "runway", "pika", "kling", "luma", "hailuo", "veo", "sora"];
const screenRecordingKeywords = ["screen recording", "screen record", "recording screen", "screencast", "screen capture", "ui demo", "browser demo", "demo screen", "walkthrough screen"];
const internetClipKeywords = ["short clip", "movie clip", "film clip", "anime clip", "series clip", "tv show clip", "cinema clip", "scene from", "from a movie", "from movie", "from a film", "from film", "movie scene", "film scene", "anime scene", "netflix", "marvel", "disney", "compilation", "fan edit"];
const cryptoProjectListKeywords = ["rank projects", "project list", "projects list", "tge", "airdrop", "launch", "airdrop/launch", "tier:", "s tier", "a tier", "b tier", "c tier", "d tier"];

function loadEnvFile(name) {
  const file = path.join(__dirname, name);
  if (!existsSync(file)) return;
  return readFile(file, "utf8").then((content) => {
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = valueParts.join("=").trim();
    }
  });
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const categoryRules = [
  {
    id: "video",
    label: "video creation",
    color: "#ea580c",
    requiresMedia: true,
    keywords: ["video creation", "recorded", "created video", "video prod", "filming", "shot this", "made this video", "produced", "dropped video", "talking head", "on camera", "explainer video", "tutorial video", "walkthrough video", "long form", "short-form", "clip", "b-roll", "voiceover", "voice over"],
    // These phrases strongly imply the creator made a video.
    strongVideoKeywords: ["i made a vid", "i made vid", "i make vids", "i made vids", "i made a video", "i made video", "i film", "i filmed", "i'm filming", "i recorded", "i record", "i recorded a vid", "i recorded a video", "i record a video", "i show you", "i show how", "show you how", "in this video", "in this vid", "i make a vid", "i make a video", "made a vid", "made a video", "quick vid", "new vid", "dropped a vid", "vid on", "vid about", "vid is out", "vid out", "my vid", "our vid", "video is out", "video out", "new video", "video on", "video about", "walkthrough video", "walkthrough vid", "tutorial video", "tutorial vid", "explainer", "creator missions", "i made a quick", "posted a vid", "posted a video", "watch my", "link to my vid", "check my vid", "check out my vid", "how i ", "how to ", "guide on ", "guide to ", "roadmap", "walkthrough", "tutorial", "quick guide", "step by step", "step-by-step", "watch this", "watch the video", "here's a video", "here's the video", "see what i", "check what i", "subscribe for", "more videos", "full video", "full vid", "quick recap", "quick breakdown", "quick explainer", "vlog", "vlogging", "talking head"],
    exclude: ["retweet", "clip from", "from tiktok", "from youtube", "from twitter", "credit to", "gif", "animated gif", "screen recording", "screen record", "recording screen", "gameplay", "screencast", "screen capture", "ui demo", "ai-generated", "ai generated", "generated video", "ai video", ...internetClipKeywords],
  },
  {
    id: "ai_vibecode",
    label: "AI & vibecode",
    color: "#db2777",
    keywords: ["ai", "a.i.", "llm", "gpt", "chatgpt", "chat gpt", "claude", "openai", "anthropic", "gemini", "deepseek", "grok", "llama", "mistral", "antigravity", "agentic", "ai agent", "ai agents", "prompt", "prompting", "prompt engineering", "ai model", "language model", "inference", "fine-tune", "training model", "neural", "transformer", "vibecode", "vibecoded", "vibecoder", "vibecoding", "vibecode'd", "vibe code", "vibe coding", "vibe coded", "vibe coder", "coded with ai", "built with ai", "ai coding", "ai app", "ai tool", "ai workflow", "ai automation", "ai assistant", "cursor ai", "cursor editor", "lovable", "bolt.new", "replit agent", "claude code", "codex", "squadcoding", "squad coding", "no-code", "nocode", "perplexity", "midjourney", "suno", "runway", "elevenlabs", "notion ai", "copilot", "windsurf", "v0", "kiro", "vercel ai", "ai stack", "tooling", "i shipped", "i deployed", "i built this", "i just built", "i just shipped", "i just launched", "we shipped", "we deployed", "we built", "we launched", "i built", "we built this", ...aiVideoKeywords, ...screenRecordingKeywords],
    strongKeywords: ["ai", "claude", "gpt", "chatgpt", "chat gpt", "gemini", "openai", "anthropic", "deepseek", "grok", "llama", "mistral", "antigravity", "vibecode", "vibecoded", "vibecoder", "vibecoding", "vibecode'd", "vibe code", "vibe coding", "vibe coded", "vibe coder", "cursor ai", "cursor editor", "lovable", "bolt.new", "replit agent", "claude code", "squadcoding", "squad coding", "perplexity", "midjourney", "suno", "runway", "elevenlabs", "notion ai", "copilot", "windsurf", "v0", "kiro", "vercel ai", "ai automation", "ai workflow", "ai stack", "tooling", "i shipped", "i deployed", "i built this", "i just built", "i just shipped", "i just launched", "we shipped", "we deployed", "we built", "we launched", "i built", "we built this"],
    exclude: ["trend", "ai hype"],
  },
  {
    id: "monad",
    label: "Monad",
    color: "#5b21b6",
    keywords: ["monad", "$mon", "gmonad", "gmonads", "@monad_xyz"],
    strongKeywords: ["monad", "$mon", "gmonad", "gmonads", "@monad_xyz"],
  },
  {
    id: "nft_gamefi",
    label: "NFT & GameFi",
    color: "#7c3aed",
    keywords: ["nft", "gamefi", "nft collection", "nft project", "nft projects", "nft mint", "nft floor", "nft drop", "nft marketplace", "erc-721", "pfp collection", "gamefi project", "onchain game", "dapp game", "play to earn", "p2e", "yugen", "t00ns", "mint", "mint date", "wl", "whitelist", "allowlist", "collection", "play-to-earn"],
    strongKeywords: ["nft", "wl", "collection", "play-to-earn", "play to earn", "p2e", "nft collection", "nft project", "nft projects", "nft mint", "nft floor", "nft drop", "erc-721", "gamefi project", "onchain game", "yugen", "t00ns", "mint date", "whitelist", "allowlist"],
    exclude: ["price pump", "buy now", "trend", "vibecoded", "vibecoding", "vibe coded", "vibe coding", "coded with ai", "built with ai", "ai coding", ...cryptoProjectListKeywords],
  },
  {
    id: "crypto",
    label: "crypto",
    color: "#38bdf8",
    keywords: [
      // General crypto
      "crypto", "bitcoin", "ethereum", "btc", "eth", "$eth", "$btc", "solana", "$sol",
      "stablecoin", "usdt", "usdc", "dai", "arbitrum", "optimism", "base", "l2", "l1",
      "blockchain", "defi", "web3", "dapp", "smart contract", "solidity", "evm",
      "protocol", "token", "bridge", "token bridge", "tvl", "liquidity", "liquidity pool",
      "amm", "dex", "cex", "wallet", "onchain", "cross-chain", "layer 2", "rollup", "sidechain",
      "validator", "staking", "proof of stake", "mining", "hash rate", "consensus",
      "tge", "airdrop", "token launch", "launch", "rank projects", "project list", "projects list", "rewards", "reward", "transaction", "gas fee", "kol", "kols", "kol round", "ambassador", "ambassador program", "ambassador programs",
      "yield", "yields", "yield farming",
      // Trading & perps
      "trade", "trades", "trading", "trader", "perp", "perps", "perpetual", "perpetuals",
      "swap", "swapping", "long", "short", "longing", "shorting", "leverage", "leveraged",
      "margin", "futures", "options", "spot", "pnl", "p&l", "profit", "loss",
      "portfolio", "position", "positions", "entry", "exit", "take profit", "stop loss",
      "funding rate", "funding", "open interest", "liquidation", "liquidated", "rekt",
      "hedge", "hedging", "scalp", "scalping", "swing", "dca", "buy the dip",
      "chart", "charting", "technical analysis", "ta", "support", "resistance",
      "bull", "bear", "bullish", "bearish", "breakout", "dump", "pump",
      "order book", "limit order", "market order", "filled", "fee", "spread",
      // Exchanges & protocols
      "hyperliquid", "gmx", "dydx", "drift", "jupiter", "raydium", "orca",
      "uniswap", "curve", "aave", "compound", "maker", "synthetix",
    ],
    strongKeywords: ["bitcoin", "ethereum", "solana", "stablecoin", "blockchain", "defi", "web3", "smart contract", "solidity", "evm", "liquidity pool", "hyperliquid", "gmx", "dydx", "uniswap", "yield farming", "perp trading", "airdrop", "token launch", "$token", "$sol", "$eth", "$btc"],
    exclude: ["speculation", "trend"],
  },
];

// Extract @mentions from tweet text for AI-based project inference
function extractMentions(text) {
  const matches = String(text).match(/@([a-zA-Z0-9_]{1,50})/g) || [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

function categoryIds() {
  return categoryRules.map((category) => category.id);
}

function normalizeSelectedCategoryIds(value) {
  const allowed = new Set(categoryIds());
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const selected = raw.map((item) => String(item).trim()).filter((item) => allowed.has(item));
  return selected.length > 0 ? [...new Set(selected)] : categoryIds();
}

function safeCacheKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "cache";
}

function cachePath(dir, key) {
  return path.join(dir, `${safeCacheKey(key)}.json`);
}

async function readCache(dir, key, ttlMs) {
  try {
    const data = JSON.parse(await readFile(cachePath(dir, key), "utf8"));
    if (!data?.createdAt || Date.now() - new Date(data.createdAt).getTime() > ttlMs) return null;
    return data.payload;
  } catch {
    return null;
  }
}

async function writeCache(dir, key, payload) {
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath(dir, key), JSON.stringify({ createdAt: new Date().toISOString(), payload }, null, 2));
  } catch (error) {
    console.warn(`Cache write failed for key ${key}:`, error.message);
  }
}

const openaiClassificationsFile = path.join(cacheDir, "openai_classifications.json");

async function readOpenAiClassifications() {
  try {
    if (existsSync(openaiClassificationsFile)) {
      return JSON.parse(await readFile(openaiClassificationsFile, "utf8"));
    }
  } catch (err) {
    console.warn("Failed to read openai_classifications.json:", err.message);
  }
  return {};
}

async function writeOpenAiClassifications(data) {
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(openaiClassificationsFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("Failed to write openai_classifications.json:", err.message);
  }
}

function rawTweetCacheKey(username, months) {
  return `${username}-${months}m`;
}

function classificationCacheKey(username, months, enabledCategoryIds) {
  return `${username}-${months}m-${enabledCategoryIds.join("_")}-${CLASSIFIER_VERSION}`;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function extractUsername(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  const cleaned = value.replace(/^@/, "");
  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : `https://x.com/${cleaned}`);
    const segment = url.pathname.split("/").filter(Boolean)[0] || "";
    return segment.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);
  } catch {
    return cleaned.replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);
  }
}

function monthsAgoIso(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectMedia(tweet) {
  const mediaBuckets = [
    tweet.media,
    tweet.medias,
    tweet.photos,
    tweet.videos,
    tweet.attachments?.media,
    tweet.attachments?.media_keys,
    tweet.entities?.media,
    tweet.extendedEntities?.media,
    tweet.extended_entities?.media,
  ];
  return mediaBuckets.flatMap((bucket) => asArray(bucket));
}

function hasVideoAttached(tweet) {
  if (tweet.video) return true;
  if (asArray(tweet.videos).length > 0) return true;
  return collectMedia(tweet).some((media) => {
    const type = String(media?.type || media?.mediaType || media?.media_type || "").toLowerCase();
    const url = String(media?.url || media?.media_url || media?.mediaUrl || media?.expanded_url || media?.preview_image_url || "").toLowerCase();
    if (type.includes("animated_gif") || type === "gif") return false;
    return type.includes("video") || /\.(mp4|mov|webm)(\?|$)/i.test(url);
  });
}

function hasGifAttached(tweet) {
  return collectMedia(tweet).some((media) => {
    const type = String(media?.type || media?.mediaType || media?.media_type || "").toLowerCase();
    return type.includes("animated_gif") || type === "gif";
  });
}

function extractMediaThumbnail(tweet) {
  // 1. Try video preview image from media arrays first
  const allMedia = collectMedia(tweet);
  for (const m of allMedia) {
    const type = String(m?.type || m?.mediaType || "").toLowerCase();
    if (type.includes("video") || type.includes("animated_gif")) {
      const thumb = m?.previewImage || m?.preview_image_url || m?.thumbnailUrl || m?.media_url_https || m?.media_url || null;
      if (thumb) return String(thumb);
    }
  }
  // 2. Try photos array next
  const photos = asArray(tweet.photos || tweet.photo);
  if (photos.length > 0) {
    const p = photos[0];
    return String(p?.url || p?.media_url_https || p?.media_url || p || "") || null;
  }
  // 3. Try general images in media arrays
  for (const m of allMedia) {
    const url = String(m?.url || m?.media_url_https || m?.media_url || m?.mediaUrl || "");
    if (url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) return url;
  }
  return null;
}

function normalizeTweet(tweet) {
  const author = tweet.author || {};
  const username = author.userName || author.username || "";
  return {
    id: String(tweet.id || tweet.tweetId || ""),
    text: String(tweet.text || tweet.fullText || ""),
    createdAt: tweet.createdAt || tweet.created_at || "",
    url: tweet.url || (username && tweet.id ? `https://x.com/${username}/status/${tweet.id}` : ""),
    likeCount: Number(tweet.likeCount || tweet.favoriteCount || 0),
    retweetCount: Number(tweet.retweetCount || 0),
    replyCount: Number(tweet.replyCount || 0),
    viewCount: Number(tweet.viewCount || 0),
    hasVideo: hasVideoAttached(tweet),
    hasGif: hasGifAttached(tweet),
    isRetweet: Boolean(tweet.retweetedTweet || tweet.quoted_tweet?.retweeted || /^RT\s+@/i.test(String(tweet.text || tweet.fullText || ""))),
    avatarUrl: String(author.profilePicture || author.profile_image_url_https || author.profile_image_url || author.avatar || "") || null,
    mediaUrl: extractMediaThumbnail(tweet),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordRegex(keyword) {
  const escaped = escapeRegExp(keyword.toLowerCase()).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, "i");
}

function matchKeyword(text, keyword) {
  return keywordRegex(keyword).test(text);
}

function matchedKeywords(text, keywords = []) {
  return asArray(keywords).filter((keyword) => matchKeyword(text, keyword));
}

function categoryById(id) {
  return categoryRules.find((category) => category.id === id);
}

function categoryMatch(category, hits, source = "rules") {
  return {
    id: category.id,
    label: category.label,
    color: category.color,
    score: hits.length,
    hits: [...new Set(hits)],
    source,
  };
}

function engagementScore(tweet) {
  return Math.round(tweet.likeCount + tweet.retweetCount * 2 + tweet.replyCount * 1.5 + tweet.viewCount / 250);
}

function buildClassifiedTweet(tweet, matched) {
  return {
    ...tweet,
    categories: matched,
    primaryCategory: matched[0]?.label || "",
    engagement: engagementScore(tweet),
  };
}

function withoutCategory(tweet, enabledCategoryIds, blockedId) {
  return classifyWithRules(tweet, enabledCategoryIds.filter((id) => id !== blockedId));
}

function classifyWithRules(tweet, enabledCategoryIds = categoryIds(), options = {}) {
  const text = tweet.text.toLowerCase();
  const mentions = extractMentions(tweet.text);
  if (mentions.length === 0 && matchedKeywords(text, globalExcludeKeywords).length > 0) {
    return buildClassifiedTweet(tweet, []);
  }

  const enabled = new Set(enabledCategoryIds);
  let matched = categoryRules
    .filter((category) => enabled.has(category.id))
    .map((category) => {
      const hasStrongVideo = category.strongVideoKeywords &&
        matchedKeywords(text, category.strongVideoKeywords).length > 0;
      if (category.requiresMedia && !tweet.hasVideo) return null;
      if (category.id === "video" && tweet.hasGif) return null;
      if (category.id === "video" && tweet.isRetweet) return null;
      if (matchedKeywords(text, category.exclude).length > 0) return null;

      const hits = [
        ...matchedKeywords(text, category.keywords),
        ...(hasStrongVideo ? matchedKeywords(text, category.strongVideoKeywords) : []),
      ];
      // hasVideo=true → video always gets baseline score, wins over all other categories
      if (category.id === "video" && tweet.hasVideo && !hits.includes("has_video")) {
        hits.push("has_video");
      }
      if (category.id === "monad" && /(^|[^a-z0-9_])\$mon\b/i.test(tweet.text)) hits.push("$mon");
      if (category.id === "monad" && text.includes("monad") && !hits.includes("monad")) hits.push("monad");
      if (category.id === "crypto" && /(^|[^a-z0-9_])\$[a-z0-9]{2,12}\b/i.test(tweet.text)) hits.push("$token");
      return categoryMatch(category, hits);
    })
    .filter(Boolean)
    .filter((category) => category.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const exclusiveMatch = ["video", "ai_vibecode", "monad", "nft_gamefi", "crypto"].map((id) => matched.find((category) => category.id === id)).find(Boolean);
  if (exclusiveMatch) matched = [exclusiveMatch];

  if (options.hardOnly) {
    const isHardMatch = matched.some((category) => {
      const rule = categoryRules.find((r) => r.id === category.id);
      if (!rule) return false;

      if (category.id === "video") {
        const hasStrongVideo = rule.strongVideoKeywords && matchedKeywords(text, rule.strongVideoKeywords).length > 0;
        return tweet.hasVideo && hasStrongVideo;
      }

      const hasStrong = rule.strongKeywords && category.hits.some((hit) => rule.strongKeywords.includes(hit));
      return hasStrong;
    });

    if (!isHardMatch) {
      return buildClassifiedTweet(tweet, []);
    }
  }

  return buildClassifiedTweet(tweet, matched);
}

function classify(tweet, enabledCategoryIds = categoryIds()) {
  return classifyWithRules(tweet, enabledCategoryIds);
}
function getNextCursor(data) {
  return data?.next_cursor || data?.nextCursor || data?.next || data?.cursor || data?.pagination?.next_cursor || data?.pagination?.nextCursor || "";
}

async function fetchSearchPage({ key, query, cursor }) {
  const url = new URL(`${BASE}/twitter/tweet/advanced_search`);
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", "Latest");
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url, { headers: { "x-api-key": key } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`TwitterAPI.io returned ${response.status}. ${body.slice(0, 240)}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function openAiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.ENABLE_AI_CLASSIFIER !== "false";
}

function openAiCategoryGuide(enabledCategoryIds) {
  return categoryRules
    .filter((category) => enabledCategoryIds.includes(category.id))
    .map((category) => ({
      id: category.id,
      label: category.label,
      keywords: category.keywords,
      exclude: category.exclude || [],
      notes: category.id === "video"
        ? "Only choose video when hasVideo=true, hasGif=false, and the video is creator-made with a presenter or voiceover narration (talking head, explainer, tutorial, walkthrough with voice). Do NOT choose video for cartoons, anime, puppet clips (like @just_t00ns), memes, raw screen recordings, raw gameplay, raw charts, or AI animations with no creator voiceover or narration. Instead, classify them based on their actual topic keywords/content (e.g. nft_gamefi, ai_vibecode, monad, crypto, or skip)."
        : category.id === "ai_vibecode"
          ? "Only choose this for clear AI, LLM, model, AI coding, or vibecode content."
          : category.id === "nft_gamefi"
            ? "Only choose this when the tweet is clearly about an NFT project, NFT collection, mint, floor, marketplace, GameFi, onchain game, or play-to-earn. Do NOT choose this for generic project lists, TGE rankings, airdrop/launch lists, or token launch rankings unless NFT/GameFi is explicit."
          : category.id === "crypto"
            ? "Choose this for general crypto, token, airdrop, TGE, DeFi, protocol, trading, rewards, staking, onchain content, or project ranking/list posts."
            : "",
    }));
}

function openAiTweetPayload(tweet) {
  const mentions = extractMentions(tweet.text);
  const text = tweet.text.toLowerCase();
  return {
    id: tweet.id,
    text: tweet.text,
    hasVideo: tweet.hasVideo,
    hasGif: tweet.hasGif,
    isAiGeneratedVideoSignal: matchedKeywords(text, aiVideoKeywords).length > 0,
    isScreenRecordingSignal: matchedKeywords(text, screenRecordingKeywords).length > 0,
    isInternetClipSignal: matchedKeywords(text, internetClipKeywords).length > 0,
    hasMediaPreview: Boolean(tweet.mediaUrl),
    mediaUrl: tweet.mediaUrl || null,
    ...(mentions.length > 0 && { mentions }),
  };
}

function buildOpenAiUserContent(payload) {
  const mediaIndexById = new Map(payload.mediaTweets.map((tweet, index) => [tweet.id, index + 1]));
  const content = [
    {
      type: "text",
      text: [
        "Classify these tweets. Use tweet text plus any attached media preview images.",
        "For each tweet, return exactly one category or skip.",
        "If media preview is provided, inspect whether it looks like a creator-made/talking-head/explainer/video-production thumbnail versus a random reposted clip, meme, screenshot, game clip, or unrelated image.",
        JSON.stringify({
          categories: payload.categories,
          priority: payload.priority,
          tweets: payload.tweets.map((tweet) => ({
            id: tweet.id,
            text: tweet.text,
            hasVideo: tweet.hasVideo,
            hasGif: tweet.hasGif,
            isAiGeneratedVideoSignal: tweet.isAiGeneratedVideoSignal,
            isScreenRecordingSignal: tweet.isScreenRecordingSignal,
            isInternetClipSignal: tweet.isInternetClipSignal,
            hasMediaPreview: mediaIndexById.has(tweet.id),
            mediaIndex: mediaIndexById.get(tweet.id) || null,
            mentions: tweet.mentions || [],
          })),
        }),
      ].join("\n\n"),
    },
  ];

  for (const [index, tweet] of payload.mediaTweets.entries()) {
    content.push({ type: "text", text: `Media preview ${index + 1} for tweet id ${tweet.id}:` });
    content.push({ type: "image_url", image_url: { url: tweet.mediaUrl, detail: "low" } });
  }

  return content;
}

function parseJsonObject(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function classifyWithOpenAiBatch(tweets, enabledCategoryIds) {
  if (!openAiEnabled() || tweets.length === 0) return new Map();

  const model = process.env.OPENAI_CLASSIFIER_MODEL || "gpt-4o-mini";
  const tweetPayloads = tweets.map(openAiTweetPayload);
  const payload = {
    categories: openAiCategoryGuide(enabledCategoryIds),
    priority: ["video", "ai_vibecode", "monad", "nft_gamefi", "crypto"].filter((id) => enabledCategoryIds.includes(id)),
    tweets: tweetPayloads,
    mediaTweets: tweetPayloads.filter((tweet) => tweet.hasVideo && tweet.mediaUrl).slice(0, 12),
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You classify X posts for a creator analytics tool.",
            "Return one category per tweet or skip.",
            "Use the category guide and priority order. Do not invent categories.",
            "Skip personal, selfie, gym, GM, vague mood, or unrelated posts only when there is no clear project/category signal.",
            "If a tweet tags or mentions @handles, infer whether each handle is a project, protocol, NFT collection, game, AI tool, creator tool, community, or just a person. Do not assume every @mention is a project. A casual caption can still be NFT/GameFi, Monad, crypto, or AI if the tagged account is clearly about that category. If the handle is unknown and the tweet text has no category signal, skip.",
            "CRITICAL: If a tweet contains 'vibecoded', 'vibecoding', 'vibe coded', 'vibe coding', 'vibe coder', 'coded with ai', 'built with ai', or 'squadcoding', classify it as ai_vibecode — even if it also mentions a game, app, leaderboard, or other product, unless it is a creator video classified as video (video creation) which always takes priority. Vibecoded games are NOT nft_gamefi.",
            "CRITICAL: Classify as video (video creation) only when hasVideo=true and the video is a creator-made video production (e.g., talking head, person speaking, explainer video, walkthrough, or tutorial with creator voiceover/narration). If it is a raw screen recording, gameplay, chart capture, or AI animation with NO voiceover, narration, or presenter, it CANNOT be classified as video; classify it by its actual topic instead.",
            "CRITICAL: If a video shows a screen recording, gameplay, chart, or slideshow, but the tweet text indicates voiceover, walkthrough, tutorial, or presentation (e.g., mentions 'walkthrough', 'vid on', 'tutorial', 'quick guide', 'explanation', 'my video', 'voiced', 'i made a vid', 'i made vid', 'i make vids', 'i made vids', 'i made a video', 'i made video', 'i film', 'i filmed', 'i recorded', 'i record', 'i show you', 'i show how'), classify it as video and map the videoEvidence to 'explainer_or_tutorial' or 'self_made_production'. Do NOT choose 'screen_recording' for voiced tutorials, as 'screen_recording' is reserved for raw silent screen captures.",
            "CRITICAL: If the video preview thumbnail shows a real human face, or if the text/context clearly implies creator voice/narration, prioritize video. Do NOT classify a video as video creation if the preview thumbnail only shows cartoons, anime, puppets, or memes without any text indicator of creator voiceover or walkthrough.",
            "CRITICAL: Cartoon, anime, puppet, 2D/3D animation, or puppet space clips (like @just_t00ns or similar characters laying down/dancing) are NOT creator video productions. Map their videoEvidence to 'not_video' or 'gif_or_image'. Do NOT classify them as video; classify them by their actual topic (e.g., nft_gamefi for @just_t00ns/t00ns NFT space, or skip if no topic).",
            "CRITICAL: Never classify GIFs or image-only posts as video. If hasGif=true, video is forbidden.",
            "CRITICAL: If isInternetClipSignal=true, video is forbidden. Choose another category by topic or skip.",
            "Skip or choose another category for random short clips, reposted clips, TikTok/YouTube/Twitter clips, cartoons, animations, puppets, 2D/3D art, movie/anime/famous film/funny clips from the internet, memes, gameplay, screen recordings, browser/product screen captures, stock videos, compilations, and fan edits.",
            "If isAiGeneratedVideoSignal=true, do NOT classify as video unless there is clear creator voiceover narration or a human face/presenter visible; otherwise, prefer ai_vibecode or skip.",
            "If isScreenRecordingSignal=true or the video shows a screen recording/software capture/browser UI/code/game/charts, only classify as video if it has creator voiceover explanation or walkthrough narration. If it is a raw recording with no voiceover/narration, do NOT use video; classify by topic instead (e.g., ai_vibecode, monad, crypto, nft_gamefi, or skip).",
            "If the video appears AI-generated or made with an AI video tool, do not use video unless a human face/person is clearly visible on camera or there is creator voiceover narration; otherwise, classify by the actual topic, usually ai_vibecode.",
            "CRITICAL: Generic crypto project ranking/list posts about TGE, airdrop, launch, tiers, or upcoming projects are crypto, not nft_gamefi, unless the text explicitly says NFT/GameFi/onchain game.",
            "Do not classify general project launch/build/dev words as AI unless the tweet clearly mentions AI, LLMs, models, agents, or vibecode. 'Grok' is xAI's language model, so classify it as ai_vibecode. 'ct' or 'ct account' stands for Crypto Twitter, so do NOT classify it as Monad. Posts about Hyperliquid, $HYPE, or Jeff (Jeff Yan) belong to crypto. Do NOT classify a project as Monad just because its name starts with 'mon' or contains 'mon' (like @monetrix_xyz); it must be explicitly related to the Monad blockchain, $MON, or Monad community. Posts about KOLs, KOL round, or KOL investors belong to crypto, not nft_gamefi. Posts about ambassador programs, creator programs, or community roles/jobs for general crypto projects belong to crypto, not nft_gamefi, unless the tweet explicitly mentions NFTs, minting, or allowlists.",
            "For video, use both text and media preview if available. If the preview only looks like a movie/TV/anime scene, viral clip, montage, meme, or raw gameplay/charts with no creator voice/narration, do NOT choose video even if it is a video.",
            "Each tweet may include a 'mentions' field listing @handles tagged in the post. Use your knowledge of what each account/project represents (e.g. @monad_xyz is a blockchain, @cursor_ai is an AI coding tool, @capcut is a video editor, NFT collection accounts are nft_gamefi) to infer the most likely category. Treat well-known project accounts as strong classification signals, but skip unknown personal accounts.",
          ].join(" "),
        },
        {
          role: "user",
          content: buildOpenAiUserContent(payload),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tweet_classifications",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    category: { type: "string", enum: [...enabledCategoryIds, "skip"] },
                    confidence: { type: "number" },
                    videoEvidence: { type: "string", enum: ["creator_on_camera", "person_speaking", "explainer_or_tutorial", "self_made_production", "internet_clip", "screen_recording", "ai_generated_video", "gif_or_image", "not_video"] },
                    reason: { type: "string" },
                  },
                  required: ["id", "category", "confidence", "videoEvidence", "reason"],
                },
              },
            },
            required: ["results"],
          },
        },
      },
      max_completion_tokens: 3500,
      temperature: 0.0,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI classifier returned ${response.status}. ${body.slice(0, 240)}`);
  }

  const data = await response.json();
  const parsed = parseJsonObject(data?.choices?.[0]?.message?.content);
  const allowed = new Set([...enabledCategoryIds, "skip"]);
  return new Map(asArray(parsed?.results)
    .filter((item) => item?.id && allowed.has(item.category))
    .map((item) => [String(item.id), item]));
}

async function classifyWithOpenAi(tweets, enabledCategoryIds) {
  const batchSize = Number(process.env.OPENAI_CLASSIFIER_BATCH_SIZE || 60);
  // Split into batches
  const batches = [];
  for (let i = 0; i < tweets.length; i += batchSize) {
    batches.push(tweets.slice(i, i + batchSize));
  }
  // Run all batches in PARALLEL for speed
  const batchMaps = await Promise.all(
    batches.map((batch) => classifyWithOpenAiBatch(batch, enabledCategoryIds))
  );
  const results = new Map();
  for (const batchMap of batchMaps) {
    for (const [id, result] of batchMap) results.set(id, result);
  }
  return results;
}

async function fetchRawTweets({ username, months, limit, maxPages = MAX_SEARCH_PAGES, existingTweets = [] }) {
  const key = process.env.TWITTERAPI_KEY;
  if (!key) {
    const error = new Error("TWITTERAPI_KEY is missing. Copy .env.example to .env.local and add your key.");
    error.status = 400;
    throw error;
  }

  const since = monthsAgoIso(months);
  const query = `from:${username} since:${since} -filter:replies`;
  const tweetsById = new Map();
  const existingIds = new Set(existingTweets.map(t => t.id));
  let cursor = "";

  for (let page = 0; page < maxPages && tweetsById.size < limit; page++) {
    const data = await fetchSearchPage({ key, query, cursor });
    const pageTweets = Array.isArray(data.tweets) ? data.tweets : [];
    
    let hasOverlap = false;
    for (const tweet of pageTweets) {
      const normalized = normalizeTweet(tweet);
      if (normalized.id && normalized.text) {
        tweetsById.set(normalized.id, normalized);
        if (existingIds.has(normalized.id)) {
          hasOverlap = true;
        }
      }
      if (tweetsById.size >= limit) break;
    }

    if (hasOverlap && existingTweets.length > 0) {
      console.log(`[fetchRawTweets] Found overlapping cached tweets on page ${page + 1}. Stopping pagination early.`);
      break;
    }

    const nextCursor = getNextCursor(data);
    if (!nextCursor || nextCursor === cursor || pageTweets.length === 0) break;
    cursor = nextCursor;
  }

  return Array.from(tweetsById.values()).slice(0, limit);
}

async function getRawTweets({ username, months, limit, maxPages = MAX_SEARCH_PAGES, refresh = false }) {
  const key = rawTweetCacheKey(username, months);
  let existingTweets = [];
  try {
    // We read the cache even on refresh, using a high TTL (Infinity) so we can merge with past data
    const cached = await readCache(rawCacheDir, key, refresh ? Infinity : RAW_TWEET_TTL_MS);
    if (cached) {
      existingTweets = cached;
      if (!refresh) {
        return { tweets: existingTweets.slice(0, limit), source: "cache" };
      }
    }
  } catch (err) {
    console.warn(`Failed to read cache for merging raw tweets of ${username}:`, err.message);
  }

  const newTweets = await fetchRawTweets({ username, months, limit, maxPages, existingTweets });
  
  const mergedMap = new Map();
  for (const tweet of existingTweets) {
    mergedMap.set(tweet.id, tweet);
  }
  for (const tweet of newTweets) {
    mergedMap.set(tweet.id, tweet);
  }

  const mergedTweets = Array.from(mergedMap.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  await writeCache(rawCacheDir, key, mergedTweets);

  return { tweets: mergedTweets.slice(0, limit), source: "api" };
}

async function fetchClassifiedTweetsFromSupabase(username) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || !username) return [];

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/tweets_raw?username=eq.${encodeURIComponent(username.toLowerCase())}`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.warn(`Supabase query returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Failed to fetch existing classifications from Supabase:", err.message);
    return [];
  }
}

async function classifyTweets({ tweets, enabledCategoryIds, supabaseTweets = [], refresh = false }) {
  const hard = [];
  const ambiguous = [];
  const skipped = [];

  // Load cached individual classifications
  const cachedAi = await readOpenAiClassifications();
  const toClassifyWithAi = [];

  const sbTweetsMap = new Map(supabaseTweets.map((t) => [String(t.id), t]));

  for (const tweet of tweets) {
    // 1. Check Supabase DB cache first (Layer 1)
    const sbTweet = refresh ? null : sbTweetsMap.get(tweet.id);
    if (sbTweet && sbTweet.categories) {
      const filteredCategories = sbTweet.categories.filter((cat) => enabledCategoryIds.includes(cat.id));
      const sbClassified = {
        ...tweet,
        categories: filteredCategories,
        primaryCategory: filteredCategories[0]?.label || "",
        engagement: engagementScore(tweet),
      };
      if (sbClassified.categories.length > 0) {
        hard.push(sbClassified);
      } else {
        skipped.push(tweet);
      }
      continue;
    }

    // 2. Check rule-based hard matches (Layer 2)
    // If the tweet has a video, only skip rule-based hard matching if it DOES NOT have strong video keywords.
    // This allows videos with clear tutorial/walkthrough text keywords to auto-classify immediately.
    // Otherwise, for vague text videos, we skip hard-matching and send to OpenAI Vision (Layer 3).
    const textLower = tweet.text.toLowerCase();
    const videoRule = categoryById("video");
    const hasStrongVideo = videoRule && videoRule.strongVideoKeywords &&
      matchedKeywords(textLower, videoRule.strongVideoKeywords).length > 0;
    
    const canHardMatch = !tweet.hasVideo || tweet.hasGif || tweet.isRetweet || hasStrongVideo;
    const hardClassified = canHardMatch
      ? classifyWithRules(tweet, enabledCategoryIds, { hardOnly: true })
      : buildClassifiedTweet(tweet, []);
    if (hardClassified.categories.length > 0) {
      hard.push(hardClassified);
    } else if (extractMentions(tweet.text).length === 0 && matchedKeywords(tweet.text.toLowerCase(), globalExcludeKeywords).length > 0) {
      skipped.push(tweet);
    } else {
      // 3. Check local JSON cache (Layer 3)
      if (!refresh && cachedAi[tweet.id]) {
        ambiguous.push(tweet);
      } else {
        toClassifyWithAi.push(tweet);
      }
    }
  }

  let aiResults = new Map();
  let aiError = "";

  if (toClassifyWithAi.length > 0) {
    try {
      const newAiResults = await classifyWithOpenAi(toClassifyWithAi, enabledCategoryIds);
      for (const [id, result] of newAiResults) {
        cachedAi[id] = result;
      }
      await writeOpenAiClassifications(cachedAi);
    } catch (error) {
      aiError = error.message || "OpenAI classifier failed";
    }
  }

  // Build the aiResults map from cached and new results
  for (const tweet of ambiguous) {
    if (cachedAi[tweet.id]) aiResults.set(tweet.id, cachedAi[tweet.id]);
  }
  for (const tweet of toClassifyWithAi) {
    if (cachedAi[tweet.id]) aiResults.set(tweet.id, cachedAi[tweet.id]);
  }

  const allAmbiguous = [...ambiguous, ...toClassifyWithAi];

  const classifiedAmbiguous = allAmbiguous.map((tweet) => {
    const ai = aiResults.get(tweet.id);
    if (ai?.category && ai.category !== "skip") {
      // If the AI-assigned category is not currently enabled, fallback to rules or skip
      if (!enabledCategoryIds.includes(ai.category)) {
        return withoutCategory(tweet, enabledCategoryIds, ai.category);
      }

      const text = tweet.text.toLowerCase();
      const videoRule = categoryById("video");
      const hasStrongVideo = videoRule && videoRule.strongVideoKeywords &&
        matchedKeywords(text, videoRule.strongVideoKeywords).length > 0;
      
      const allowedVideoEvidence = new Set(["creator_on_camera", "person_speaking", "explainer_or_tutorial", "self_made_production"]);
      const isCreatorVideo = tweet.hasVideo &&
        !tweet.hasGif &&
        Number(ai.confidence || 0) >= 0.72 &&
        matchedKeywords(text, internetClipKeywords).length === 0 &&
        (allowedVideoEvidence.has(ai.videoEvidence) || (hasStrongVideo && !["ai_generated_video", "gif_or_image", "not_video"].includes(ai.videoEvidence)));

      let targetCatId = ai.category;
      if (isCreatorVideo && enabledCategoryIds.includes("video")) {
        targetCatId = "video";
      }

      if (targetCatId === "video" && !isCreatorVideo) {
        return withoutCategory(tweet, enabledCategoryIds, "video");
      }

      // Force vibecode keywords to ai_vibecode if not video
      const vibecodeKeywords = ["vibecode", "vibecoded", "vibecoder", "vibecoding", "vibecode'd", "vibe code", "vibe coding", "vibe coded", "vibe coder", "squadcoding", "squad coding", "coded with ai", "built with ai", "ai coding", "perplexity", "midjourney", "suno", "runway", "elevenlabs", "notion ai", "copilot", "windsurf", "v0", "kiro", "vercel ai", "ai automation", "ai workflow", "ai stack", "tooling", "i shipped", "i deployed", "i built this", "i just built", "i just shipped", "i just launched", "we shipped", "we deployed", "we built", "we launched", "i built", "we built this"];
      const hasVibecode = matchedKeywords(text, vibecodeKeywords).length > 0;
      if (hasVibecode && targetCatId !== "video" && enabledCategoryIds.includes("ai_vibecode")) {
        targetCatId = "ai_vibecode";
      }

      if (targetCatId === "nft_gamefi" &&
        matchedKeywords(text, cryptoProjectListKeywords).length > 0 &&
        matchedKeywords(text, ["nft", "gamefi", "onchain game", "nft collection", "nft project", "play to earn", "p2e"]).length === 0
      ) {
        const crypto = categoryById("crypto");
        if (crypto && enabledCategoryIds.includes("crypto")) {
          return buildClassifiedTweet(tweet, [categoryMatch(crypto, [ai.reason || "project list"], "openai")]);
        }
      }
      const category = categoryById(targetCatId);
      if (category) return buildClassifiedTweet(tweet, [categoryMatch(category, [ai.reason || "openai"], "openai")]);
    }
    if (ai?.category === "skip") return buildClassifiedTweet(tweet, []);
    return classifyWithRules(tweet, enabledCategoryIds);
  });

  const vibecodeKeywords = ["vibecode", "vibecoded", "vibecoder", "vibecoding", "vibecode'd", "vibe code", "vibe coding", "vibe coded", "vibe coder", "squadcoding", "squad coding", "coded with ai", "built with ai", "ai coding", "perplexity", "midjourney", "suno", "runway", "elevenlabs", "notion ai", "copilot", "windsurf", "v0", "kiro", "vercel ai", "ai automation", "ai workflow", "ai stack", "tooling", "i shipped", "i deployed", "i built this", "i just built", "i just shipped", "i just launched", "we shipped", "we deployed", "we built", "we launched", "i built", "we built this"];

  const overriddenClassified = [...hard, ...classifiedAmbiguous]
    .filter((tweet) => tweet.categories.length > 0)
    .map((tweet) => {
      const textLower = tweet.text.toLowerCase();
      const hasVibecode = matchedKeywords(textLower, vibecodeKeywords).length > 0;
      const isVideo = tweet.categories.some((cat) => cat.id === "video");
      if (hasVibecode && !isVideo && enabledCategoryIds.includes("ai_vibecode")) {
        const isAlreadyVibecode = tweet.categories.some((cat) => cat.id === "ai_vibecode");
        if (!isAlreadyVibecode) {
          const category = categoryById("ai_vibecode");
          if (category) {
            const hits = matchedKeywords(textLower, vibecodeKeywords);
            const overrideMatch = categoryMatch(category, hits, "override");
            return {
              ...tweet,
              categories: [overrideMatch],
              primaryCategory: category.label,
            };
          }
        }
      }
      return tweet;
    });

  const classified = overriddenClassified
    .sort((a, b) => a.primaryCategory.localeCompare(b.primaryCategory) || b.engagement - a.engagement);

  return {
    tweets: classified,
    meta: {
      classifier: openAiEnabled() ? "hybrid-openai" : "rules",
      classifierVersion: CLASSIFIER_VERSION,
      hardCount: hard.length,
      openAiCandidates: allAmbiguous.length,
      openAiClassified: [...aiResults.values()].filter((item) => item.category && item.category !== "skip").length,
      skippedCount: skipped.length + classifiedAmbiguous.filter((tweet) => tweet.categories.length === 0).length,
    },
  };
}
export async function handleAnalyze(req, res) {
  let body = req.body;
  if (!body) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  }
  const username = extractUsername(body.profile);
  const requestedMonths = Number(body.range || 2);
  const months = [1, 2, 3, 4].includes(requestedMonths) ? requestedMonths : 2;
  const quickScan = Boolean(body.quickScan);
  const limit = quickScan ? 80 : MAX_TWEETS;
  const maxPages = quickScan ? 4 : MAX_SEARCH_PAGES;
  const enabledCategoryIds = normalizeSelectedCategoryIds(body.categories);
  const refresh = Boolean(body.refresh);

  if (!username) return sendJson(res, 400, { error: "Enter an X handle." });

  try {
    const classificationKey = classificationCacheKey(username, months, enabledCategoryIds);
    const cached = refresh ? null : await readCache(classificationCacheDir, classificationKey, CLASSIFICATION_TTL_MS);
    if (cached) {
      return sendJson(res, 200, {
        ...cached,
        cache: { hit: true, type: "classification" },
      });
    }

    const raw = await getRawTweets({ username, months, limit, maxPages, refresh });
    const supabaseTweets = await fetchClassifiedTweetsFromSupabase(username);
    const classified = await classifyTweets({ tweets: raw.tweets, enabledCategoryIds, supabaseTweets, refresh });
    const tweets = classified.tweets;
    const summary = categoryRules.filter((category) => enabledCategoryIds.includes(category.id)).map((category) => ({
      ...category,
      count: tweets.filter((tweet) => tweet.categories.some((item) => item.id === category.id)).length,
    }));

    const avatarUrl = tweets.find((t) => t.avatarUrl)?.avatarUrl || null;

    const payload = {
      username,
      avatarUrl,
      rangeMonths: months,
      since: monthsAgoIso(months),
      total: tweets.length,
      selectedCategories: enabledCategoryIds,
      summary,
      tweets,
      cache: { hit: false, raw: raw.source },
      classifierMeta: classified.meta,
      updatedAt: new Date().toISOString(),
    };

    await writeCache(classificationCacheDir, classificationKey, payload);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Could not analyze profile." });
  }
}

export async function handleSync(req, res) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return sendJson(res, 500, { error: "Admin password is not configured on the server." });
  }

  const clientPassword = req.headers["x-admin-password"] || "";
  if (clientPassword !== adminPassword) {
    return sendJson(res, 401, { error: "Invalid admin password." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return sendJson(res, 400, { error: "Supabase environment variables are missing." });
  }

  let body = req.body;
  if (!body) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  }

  const username = extractUsername(body.profile);
  const requestedMonths = Number(body.range || 2);
  const months = [1, 2, 3, 4].includes(requestedMonths) ? requestedMonths : 2;
  const enabledCategoryIds = normalizeSelectedCategoryIds(body.categories);

  if (!username) return sendJson(res, 400, { error: "Enter an X handle." });

  if (username.toLowerCase() !== "ice_bearcute") {
    return sendJson(res, 403, { error: "Syncing is only allowed for @ice_bearcute." });
  }

  try {
    const classificationKey = classificationCacheKey(username, months, enabledCategoryIds);
    let payload = await readCache(classificationCacheDir, classificationKey, CLASSIFICATION_TTL_MS);

    if (!payload) {
      const quickScan = Boolean(body.quickScan);
      const limit = quickScan ? 80 : MAX_TWEETS;
      const maxPages = quickScan ? 4 : MAX_SEARCH_PAGES;
      const raw = await getRawTweets({ username, months, limit, maxPages, refresh: false });
      const supabaseTweets = await fetchClassifiedTweetsFromSupabase(username);
      const classified = await classifyTweets({ tweets: raw.tweets, enabledCategoryIds, supabaseTweets });
      const tweets = classified.tweets;
      const summary = categoryRules.filter((category) => enabledCategoryIds.includes(category.id)).map((category) => ({
        ...category,
        count: tweets.filter((tweet) => tweet.categories.some((item) => item.id === category.id)).length,
      }));

      const avatarUrl = tweets.find((t) => t.avatarUrl)?.avatarUrl || null;

      payload = {
        username,
        avatarUrl,
        rangeMonths: months,
        since: monthsAgoIso(months),
        total: tweets.length,
        selectedCategories: enabledCategoryIds,
        summary,
        tweets,
        cache: { hit: false, raw: raw.source },
        classifierMeta: classified.meta,
        updatedAt: new Date().toISOString(),
      };
      await writeCache(classificationCacheDir, classificationKey, payload);
    }

    const tweets = payload.tweets || [];
    if (tweets.length === 0) {
      return sendJson(res, 200, { success: true, count: 0, message: "No tweets found to sync." });
    }

    const categoryMap = {
      ai_vibecode: "AI",
      monad: "MONAD",
      crypto: "DEFI",
      nft_gamefi: "NFT",
      video: "VIDEO"
    };

    const supabaseTweets = tweets.map(t => {
      const origCat = t.categories[0]?.id || null;
      return {
        id: t.id,
        username: username.toLowerCase(),
        text: t.text,
        created_at: t.createdAt,
        url: t.url,
        like_count: t.likeCount,
        retweet_count: t.retweetCount,
        reply_count: t.replyCount,
        view_count: t.viewCount,
        primary_category: categoryMap[origCat] || origCat,
        categories: t.categories,
        engagement: t.engagement,
        avatar_url: t.avatarUrl,
        media_url: t.mediaUrl
      };
    });

    // 1. Sync to tweets_raw (rich metadata cache)
    const responseRaw = await fetch(`${supabaseUrl}/rest/v1/tweets_raw`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(supabaseTweets)
    });

    if (!responseRaw.ok) {
      const errorText = await responseRaw.text();
      throw new Error(`Supabase raw sync returned ${responseRaw.status}: ${errorText}`);
    }

    // 2. Sync to tweets (curated portfolio list)
    const portfolioCategoryMap = {
      ai_vibecode: "AI",
      monad: "Monad",
      crypto: "DeFi",
      nft_gamefi: "NFT",
      video: "Video"
    };

    const portfolioTweets = tweets.map(t => {
      const origCat = t.categories[0]?.id || null;
      let topic = portfolioCategoryMap[origCat] || "AI";
      if (origCat === "ai_vibecode") {
        const textLower = t.text.toLowerCase();
        const vibecodeKeywords = ["vibecode", "vibecoded", "vibecoder", "vibecoding", "vibecode'd", "vibe code", "vibe coding", "vibe coded", "vibe coder", "squadcoding", "squad coding"];
        const hasVibecode = matchedKeywords(textLower, vibecodeKeywords).length > 0;
        if (hasVibecode) {
          topic = "Vibecode";
        }
      }
      return {
        tweet_id: t.id,
        tweet_url: t.url,
        topic: topic
      };
    });

    const responsePortfolio = await fetch(`${supabaseUrl}/rest/v1/tweets`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(portfolioTweets)
    });

    if (!responsePortfolio.ok) {
      const errorText = await responsePortfolio.text();
      throw new Error(`Supabase portfolio sync returned ${responsePortfolio.status}: ${errorText}`);
    }

    sendJson(res, 200, { success: true, count: supabaseTweets.length });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to sync to Supabase." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/"
    ? "/index.html"
    : url.pathname === "/admin"
      ? "/admin.html"
      : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    handleAnalyze(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/sync") {
    handleSync(req, res);
    return;
  }
  serveStatic(req, res);
});

const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  const port = Number(process.env.PORT || 4310);
  server.listen(port, () => {
    console.log(`X Profile Sorter running at http://localhost:${port}`);
  });
}

export default server;







