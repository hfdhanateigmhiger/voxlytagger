const LEADERBOARD_URL = 'http://217.154.161.167:11891/leaderboard';
const MCDATA_URL = 'http://217.154.161.167:11891/mcdata';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT = 5000;
const CONCURRENCY = 20;
const VALID_TIERS = ['HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5', 'Unranked'];

let cache = {
    data: null,
    timestamp: 0
};

function formatUUID(raw) {
    if (raw.includes('-')) return raw; // already formatted
    return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: controller.signal
        });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

async function buildRankings() {
    const lbRes = await fetchWithTimeout(LEADERBOARD_URL, 10_000);
    const lbData = await lbRes.json();

    const entries = Object.values(lbData).filter(e =>
        e.minecraft_uuid && VALID_TIERS.includes(e.tier)
    );

    const players = [];
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
        const chunk = entries.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            chunk.map(async entry => {
                const uuid = formatUUID(entry.minecraft_uuid); // <-- add this
                const res = await fetchWithTimeout(
                    `${MCDATA_URL}?minecraft_uuid=${uuid}`
                );
                const mc = await res.json();
                if (!mc?.username) return null;
                return {
                    uuid: entry.minecraft_uuid,
                    name: mc.username,
                    tier: entry.tier
                };
            }) const mc = await res.json();
            if (!mc?.username) return null;
            return {
                uuid: entry.minecraft_uuid,
                name: mc.username,
                tier: entry.tier
            };
        })
);
for (const r of results) {
    if (r.status === 'fulfilled' && r.value) players.push(r.value);
}
}

const tierOrder = Object.fromEntries(VALID_TIERS.map((t, i) => [t, i]));
players.sort((a, b) => (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99));
return players;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
        return res.json(cache.data);
    }

    try {
        const players = await buildRankings();
        cache = {
            data: players,
            timestamp: Date.now()
        };
        res.json(players);
    } catch (err) {
        console.error('Failed to build rankings:', err.message);
        if (cache.data) return res.json(cache.data);
        res.status(502).json({
            error: 'Failed to fetch rankings from upstream.'
        });
    }
}
