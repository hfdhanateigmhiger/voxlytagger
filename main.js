/* ── CONFIG ──────────────────────────────────────── */
const LEADERBOARD_API = '/api/rankings';
const PAGE_SIZE       = 12;

const TIER_TO_COLUMN = {
  HT1:1, LT1:1, HT2:2, LT2:2, HT3:3, LT3:3, HT4:4, LT4:4, HT5:5, LT5:5,
};
const TIER_ORDER = ['HT1','LT1','HT2','LT2','HT3','LT3','HT4','LT4','HT5','LT5'];

const state = {};
for (let t = 1; t <= 5; t++) state[t] = { players: [], offset: 0 };

/* ── HELPERS ─────────────────────────────────────── */
const avatarUrl = uuid =>
  `https://crafatar.com/avatars/${uuid.replace(/-/g,'')}?size=26&overlay`;

/* ── RENDER ──────────────────────────────────────── */
const renderPage = col => {
  const s     = state[col];
  const list  = document.getElementById(`tier${col}-list`);
  const slice = s.players.slice(s.offset, s.offset + PAGE_SIZE);

  slice.forEach(p => {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = avatarUrl(p.uuid);
    img.alt = p.name;
    img.onerror = () => { img.style.opacity = '.3'; };

    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-name';
    nameSpan.textContent = p.name;
    nameSpan.title = p.name;

    const btn = document.createElement('button');
    btn.className = 'upvote-btn';
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="18 15 12 9 6 15"/>
      </svg>`;
    btn.title = 'Vote up';

    li.appendChild(img);
    li.appendChild(nameSpan);
    li.appendChild(btn);
    list.appendChild(li);
  });

  s.offset += slice.length;
};

/* ── INFINITE SCROLL ─────────────────────────────── */
const setupScroll = col => {
  const list = document.getElementById(`tier${col}-list`);
  list.addEventListener('scroll', () => {
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 60) {
      renderPage(col);
    }
  });
};

/* ── SEARCH FILTER ───────────────────────────────── */
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase();
  document.querySelectorAll('.player-list li').forEach(li => {
    const name = li.querySelector('.player-name');
    if (!name) return;
    li.style.display = (!q || name.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
});

/* ── TAB SWITCHING ───────────────────────────────── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

/* ── BOOT ────────────────────────────────────────── */
(async () => {
  // Show spinners
  for (let t = 1; t <= 5; t++) {
    const li = document.createElement('li');
    li.className = 'loading-item';
    li.innerHTML = `<span class="spinner"></span>Loading…`;
    document.getElementById(`tier${t}-list`).appendChild(li);
  }

  try {
    const res     = await fetch(LEADERBOARD_API);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const players = await res.json();

    // Bucket players into columns
    players.forEach(p => {
      const col = TIER_TO_COLUMN[p.tier];
      if (col) state[col].players.push(p);
    });

    document.querySelectorAll('.loading-item').forEach(el => el.remove());

    for (let t = 1; t <= 5; t++) {
      renderPage(t);
      setupScroll(t);
    }
  } catch (err) {
    console.error('Failed to load rankings:', err);
    document.querySelectorAll('.loading-item').forEach(el => {
      el.innerHTML = '⚠ Failed to load';
    });
  }
})();