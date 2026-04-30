import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const LEADERBOARD_URL = 'http://217.154.161.167:11891/leaderboard';
const MCDATA_URL      = 'http://217.154.161.167:11891/mcdata';
const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT   = 5000;           // 5 seconds per request

const VALID_TIERS = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5','Unranked'];

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { data: null, timestamp: 0 };

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Build rankings ────────────────────────────────────────────────────────────
async function buildRankings() {
  // 1. Fetch leaderboard
  const lbRes  = await fetchWithTimeout(LEADERBOARD_URL, 10_000);
  const lbData = await lbRes.json();

  // 2. For each entry, fetch mc username concurrently (cap at 20 at a time)
  const entries = Object.values(lbData).filter(e =>
    e.minecraft_uuid && VALID_TIERS.includes(e.tier)
  );

  const CONCURRENCY = 20;
  const players = [];

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async entry => {
        const res = await fetchWithTimeout(
          `${MCDATA_URL}?minecraft_uuid=${entry.minecraft_uuid}`
        );
        const mc = await res.json();
        if (!mc?.username) return null;
        return { uuid: entry.minecraft_uuid, name: mc.username, tier: entry.tier };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) players.push(r.value);
    }
  }

  // 3. Sort by tier order
  const tierOrder = Object.fromEntries(VALID_TIERS.map((t, i) => [t, i]));
  players.sort((a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99));

  return players;
}

// ── /api/rankings ─────────────────────────────────────────────────────────────
app.get('/api/rankings', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const now = Date.now();

  // Serve cache if fresh
  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return res.json(cache.data);
  }

  try {
    const players = await buildRankings();
    cache = { data: players, timestamp: Date.now() };
    res.json(players);
  } catch (err) {
    console.error('Failed to build rankings:', err.message);

    // Serve stale cache rather than an error, if we have one
    if (cache.data) {
      console.warn('Serving stale cache due to upstream error.');
      return res.json(cache.data);
    }

    res.status(502).json({ error: 'Failed to fetch rankings from upstream.' });
  }
});

// ── Serve static frontend files ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`VoxlyTiers running at http://localhost:${PORT}`);
});