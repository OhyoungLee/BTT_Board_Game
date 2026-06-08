'use strict';

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

const KEY_CONFIG = {
    NORMAL:      { emoji: '🔑', name: '일반',  points: 1,  count: 35, css: 'key-normal'      },
    SPECIAL:     { emoji: '🗝️', name: '특수',  points: 3,  count: 5,  css: 'key-special'     },
    GOLDEN:      { emoji: '✨', name: '황금',  points: 5,  count: 2,  css: 'key-golden'      },
    TRANSPARENT: { emoji: '👻', name: '투명',  points: 10, count: 2,  css: 'key-transparent' },
};

let G = {}; // game state

// ──────────────────────────────────────────
// 초기화
// ──────────────────────────────────────────
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateBoard() {
    const board = new Array(100).fill(null);
    const pos = shuffle([...Array(100).keys()]);
    let idx = 0;
    for (const [type, cfg] of Object.entries(KEY_CONFIG)) {
        for (let k = 0; k < cfg.count; k++) board[pos[idx++]] = type;
    }
    return board;
}

function surroundingCount(index) {
    const r = Math.floor(index / 10), c = index % 10;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10 && G.board[nr * 10 + nc] !== null) n++;
        }
    }
    return n;
}

// ──────────────────────────────────────────
// 게임 시작
// ──────────────────────────────────────────
function startGame() {
    const names = [0, 1, 2, 3].map(i => {
        const v = document.getElementById(`team-name-${i}`).value.trim();
        return v || `팀 ${i + 1}`;
    });

    G = {
        teams: names.map((name, i) => ({
            name,
            color: TEAM_COLORS[i],
            score: 0,
            hiddenScore: 0,
            keys: [],
            hiddenKeys: 0,
        })),
        board: generateBoard(),
        revealed:   new Array(100).fill(false),
        revealedBy: new Array(100).fill(null),
        hints:      new Array(100).fill(null),
        round: 1,
        phase: 'ranking',   // 'ranking' | 'selection'
        turnOrder: [],
        turnIdx: 0,
        totalPicks: 0,
        locked: false,
    };

    showScreen('game-screen');
    renderAll();
    showRankingPhase();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function renderAll() {
    renderBoard();
    renderScores();
    renderRemaining();
    document.getElementById('current-round').textContent = G.round;
    document.getElementById('total-picks').textContent   = G.totalPicks;
}

// ──────────────────────────────────────────
// 보드 렌더링
// ──────────────────────────────────────────
function renderBoard() {
    const el = document.getElementById('board');
    el.innerHTML = '';

    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;

        if (G.revealed[i]) {
            const type = G.board[i];
            if (type === null) {
                const h = G.hints[i];
                cell.classList.add('hint', `h${h}`);
                cell.textContent = h > 0 ? h : '';
            } else if (type === 'TRANSPARENT') {
                cell.classList.add('key-transparent');
                cell.textContent = '👻';
                // 누가 획득했는지 비공개 → 팀 색상 테두리 없음
            } else {
                const cfg = KEY_CONFIG[type];
                cell.classList.add(cfg.css);
                cell.textContent = cfg.emoji;
                const team = G.teams[G.revealedBy[i]];
                if (team) cell.style.outline = `2px solid ${team.color}`;
            }
        } else {
            cell.textContent = i + 1;
            if (G.phase === 'selection' && !G.locked) {
                cell.classList.add('selectable');
                cell.addEventListener('click', () => selectCell(i));
            }
        }

        el.appendChild(cell);
    }
}

// ──────────────────────────────────────────
// 점수판 / 남은 열쇠
// ──────────────────────────────────────────
function renderScores() {
    const list = document.getElementById('score-list');
    list.innerHTML = '';
    const activeIdx = G.phase === 'selection' ? G.turnOrder[G.turnIdx] : -1;

    G.teams.forEach((team, i) => {
        const card = document.createElement('div');
        card.className = `score-card${i === activeIdx ? ' active-team' : ''}`;
        card.style.borderLeftColor = team.color;

        const keyStr = team.keys.map(k => KEY_CONFIG[k].emoji).join('');
        card.innerHTML = `
            <div class="score-name" style="color:${team.color}">${team.name}</div>
            <div class="score-pts">${team.score}<span class="pts-label">점</span></div>
            ${team.hiddenKeys ? `<div class="score-hidden">👻 ×${team.hiddenKeys} 비공개</div>` : ''}
            <div class="score-keys">${keyStr || '—'}</div>
        `;
        list.appendChild(card);
    });
}

function renderRemaining() {
    const counts = Object.fromEntries(Object.keys(KEY_CONFIG).map(k => [k, 0]));
    for (let i = 0; i < 100; i++) {
        if (!G.revealed[i] && G.board[i]) counts[G.board[i]]++;
    }
    document.getElementById('remaining-info').innerHTML =
        Object.entries(KEY_CONFIG).map(([type, cfg]) =>
            `<div class="remaining-row">${cfg.emoji} ${cfg.name}: <b>${counts[type]}</b>개</div>`
        ).join('');
}

// ──────────────────────────────────────────
// 순위 입력 단계
// ──────────────────────────────────────────
function showRankingPhase() {
    G.phase = 'ranking';
    document.getElementById('ranking-phase').style.display  = 'block';
    document.getElementById('selection-phase').style.display = 'none';
    renderRankingInputs();
    renderBoard(); // phase가 'ranking'으로 바뀐 후 렌더링 → 클릭 핸들러 제거
}

function renderRankingInputs() {
    const labels = ['🥇 1등', '🥈 2등', '🥉 3등', '4️⃣ 4등'];
    const classes = ['r1', 'r2', 'r3', 'r4'];
    const wrap = document.getElementById('ranking-inputs');
    wrap.innerHTML = '';

    for (let rank = 0; rank < 4; rank++) {
        const row = document.createElement('div');
        row.className = 'ranking-row';

        const lbl = document.createElement('span');
        lbl.className = `rank-label ${classes[rank]}`;
        lbl.textContent = labels[rank];

        const sel = document.createElement('select');
        sel.id = `rank-${rank}`;
        sel.innerHTML = `<option value="">선택...</option>` +
            G.teams.map((t, i) =>
                `<option value="${i}">${t.name}</option>`
            ).join('');
        sel.addEventListener('change', autoFill);

        row.appendChild(lbl);
        row.appendChild(sel);
        wrap.appendChild(row);
    }
}

function randomRanking() {
    const order = shuffle([0, 1, 2, 3]);
    order.forEach((teamIdx, rank) => {
        document.getElementById(`rank-${rank}`).value = teamIdx;
    });
}

function autoFill() {
    const vals = [0, 1, 2, 3].map(i => document.getElementById(`rank-${i}`).value);
    const filled = vals.filter(v => v !== '');
    const unique = new Set(filled);
    if (filled.length === 3 && unique.size === 3) {
        const last = ['0','1','2','3'].find(v => !unique.has(v));
        const emptyIdx = vals.indexOf('');
        document.getElementById(`rank-${emptyIdx}`).value = last;
    }
}

function confirmRanking() {
    const order = [0, 1, 2, 3].map(i => {
        const v = document.getElementById(`rank-${i}`).value;
        return v !== '' ? parseInt(v) : null;
    });

    if (order.includes(null))      { alert('모든 순위를 입력해주세요!'); return; }
    if (new Set(order).size !== 4) { alert('중복된 팀이 있습니다!'); return; }

    G.turnOrder = order;
    G.turnIdx   = 0;
    G.phase     = 'selection';

    document.getElementById('ranking-phase').style.display   = 'none';
    document.getElementById('selection-phase').style.display = 'flex';
    document.getElementById('last-result').innerHTML = '';

    renderBoard();
    renderTurnOrder();
    renderCurrentTeam();
}

// ──────────────────────────────────────────
// 칸 선택 단계
// ──────────────────────────────────────────
function renderTurnOrder() {
    const el = document.getElementById('turn-order-display');
    el.innerHTML = G.turnOrder.map((teamIdx, i) => {
        const t = G.teams[teamIdx];
        const done   = i < G.turnIdx;
        const active = i === G.turnIdx;
        return `<div class="turn-item${done ? ' done' : ''}${active ? ' active' : ''}"
                     ${active ? `style="border-color:${t.color};color:${t.color}"` : ''}>
            <span class="turn-dot" style="background:${t.color}"></span>
            ${i + 1}. ${t.name}
            ${done ? '<span class="done-check">✓</span>' : ''}
        </div>`;
    }).join('');
}

function renderCurrentTeam() {
    const team = G.teams[G.turnOrder[G.turnIdx]];
    const box  = document.getElementById('current-team-box');
    box.style.borderColor = team.color;
    box.style.boxShadow   = `0 0 22px ${team.color}44`;
    box.innerHTML = `
        <div class="cur-name" style="color:${team.color}">${team.name}</div>
        <div class="cur-label">보드에서 칸을 선택하세요</div>
    `;
}

function selectCell(index) {
    if (G.revealed[index] || G.locked) return;
    G.locked = true;

    const teamIdx = G.turnOrder[G.turnIdx];
    const team    = G.teams[teamIdx];
    const type    = G.board[index];

    G.revealed[index]   = true;
    G.revealedBy[index] = teamIdx;
    G.totalPicks++;
    document.getElementById('total-picks').textContent = G.totalPicks;

    const resultEl = document.getElementById('last-result');

    if (type !== null) {
        const cfg = KEY_CONFIG[type];
        if (type === 'TRANSPARENT') {
            team.hiddenScore += cfg.points;
            team.hiddenKeys++;
            resultEl.innerHTML = `<div class="ghost-result">👻 투명 열쇠! (+${cfg.points}점 비공개)</div>`;
        } else {
            team.score += cfg.points;
            team.keys.push(type);
            resultEl.innerHTML = `<div class="result-got">🎉 ${team.name}: ${cfg.emoji} ${cfg.name} 열쇠 +${cfg.points}점!</div>`;
        }
    } else {
        const h = surroundingCount(index);
        G.hints[index] = h;
        resultEl.innerHTML = `<div class="result-miss">🔍 ${team.name}: 주변 열쇠 <strong>${h}개</strong></div>`;
    }

    renderBoard();
    renderScores();
    renderRemaining();

    // 선택된 셀 팝 애니메이션
    const cellEl = document.querySelector(`.cell[data-index="${index}"]`);
    if (cellEl) { cellEl.classList.add('pop'); }

    setTimeout(advanceTurn, 2000);
}

function advanceTurn() {
    G.turnIdx++;
    G.locked = false;

    if (G.turnIdx >= 4) {
        // 라운드 종료
        if (G.round >= 15) {
            endGame();
        } else {
            G.round++;
            document.getElementById('current-round').textContent = G.round;
            renderScores();
            showRankingPhase(); // 내부에서 phase 변경 후 renderBoard() 호출
        }
    } else {
        renderTurnOrder();
        renderCurrentTeam();
        renderBoard();
    }
}

// ──────────────────────────────────────────
// 게임 종료
// ──────────────────────────────────────────
function endGame() {
    showScreen('end-screen');

    // 투명 열쇠 공개
    const ghosters = G.teams
        .map((t, i) => ({ ...t, idx: i }))
        .filter(t => t.hiddenKeys > 0);

    const revealEl = document.getElementById('final-reveal');
    if (ghosters.length > 0) {
        revealEl.innerHTML = `<h3>👻 투명 열쇠 공개!</h3>` +
            ghosters.map(t =>
                `<div class="ghost-card">
                    <span style="color:${t.color}">${t.name}</span>:
                    👻 ×${t.hiddenKeys} → +${t.hiddenScore}점!
                </div>`
            ).join('');
    } else {
        revealEl.innerHTML = `<p style="color:#64748b">이번 게임 투명 열쇠는 아무도 획득하지 못했습니다.</p>`;
    }

    // 최종 순위
    const sorted = G.teams
        .map(t => ({ ...t, total: t.score + t.hiddenScore }))
        .sort((a, b) => b.total - a.total);

    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    document.getElementById('final-scores').innerHTML = sorted.map((t, rank) => `
        <div class="final-card" style="border-left-color:${t.color}">
            <span class="medal">${medals[rank]}</span>
            <span class="final-name" style="color:${t.color}">${t.name}</span>
            <span class="breakdown">공개 ${t.score}점 + 👻 ${t.hiddenScore}점</span>
            <span class="total-pts">${t.total}점</span>
        </div>
    `).join('');
}

function resetGame() {
    G = {};
    showScreen('setup-screen');
}
