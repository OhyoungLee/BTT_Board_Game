'use strict';

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

const KEY_CONFIG = {
    NORMAL:      { emoji: '🔑', name: '일반',  points: 1,   count: 25, css: 'key-normal'      },
    SPECIAL:     { emoji: '🗝️', name: '특수',  points: 3,   count: 5,  css: 'key-special'     },
    GOLDEN:      { emoji: '✨', name: '황금',  points: 5,   count: 2,  css: 'key-golden'      },
    TRANSPARENT: { emoji: '👻', name: '투명',  points: 10,  count: 2,  css: 'key-transparent' },
    TRAP:        { emoji: '🪤', name: '함정',  points: 0,   count: 3,  css: 'key-trap'        },
    BOMB:        { emoji: '💣', name: '폭탄',  points: -5,  count: 2,  css: 'key-bomb'        },
};

const TREASURE_TYPES = new Set(['NORMAL', 'SPECIAL', 'GOLDEN', 'TRANSPARENT', 'BOMB']);
const SPECIAL_TYPES  = new Set(['SPECIAL', 'GOLDEN', 'TRANSPARENT', 'BOMB']);
const TOTAL_TREASURES = Object.entries(KEY_CONFIG)
    .filter(([t]) => TREASURE_TYPES.has(t))
    .reduce((s, [, c]) => s + c.count, 0);

const REVEAL_STAGES = [
    { id: 'BASE',        label: '📦 보물 개수 공개',  revealType: null          },
    { id: 'SPECIAL',     label: '🗝️ 특수 열쇠 공개',  revealType: 'SPECIAL'     },
    { id: 'GOLDEN',      label: '✨ 황금 열쇠 공개',   revealType: 'GOLDEN'      },
    { id: 'TRANSPARENT', label: '👻 투명 열쇠 공개',   revealType: 'TRANSPARENT' },
    { id: 'BOMB',        label: '💣 폭탄 공개',         revealType: 'BOMB'        },
    { id: 'FINAL',       label: '🏁 최종 결과',         revealType: 'NORMAL'      },
];

let G = {};
let selectedMode = 'B'; // 'A' = 고정, 'B' = 랜덤

// ──────────────────────────────────────────
// A모드 고정 보드 (항상 동일한 위치)
// NORMAL×25 SPECIAL×5 GOLDEN×2 TRANSPARENT×2 TRAP×3 BOMB×2 = 39개
// ──────────────────────────────────────────
const FIXED_BOARD_A = (() => {
    const board = new Array(100).fill(null);
    const placements = {
        NORMAL:      [3, 7, 12, 15, 18, 23, 26, 31, 34, 38, 42, 46, 51, 55, 58, 62, 67, 71, 74, 78, 83, 86, 91, 95, 98],
        SPECIAL:     [9, 30, 53, 76, 97],
        GOLDEN:      [44, 63],
        TRANSPARENT: [22, 85],
        TRAP:        [17, 49, 80],
        BOMB:        [37, 68],
    };
    for (const [type, indices] of Object.entries(placements)) {
        for (const i of indices) board[i] = type;
    }
    return board;
})();

function selectMode(mode) {
    selectedMode = mode;
    document.getElementById('mode-a-btn').classList.toggle('mode-selected', mode === 'A');
    document.getElementById('mode-b-btn').classList.toggle('mode-selected', mode === 'B');
}

// ──────────────────────────────────────────
// 유틸
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
    const positions = shuffle([...Array(100).keys()]);
    let idx = 0;
    for (const [type, cfg] of Object.entries(KEY_CONFIG)) {
        for (let k = 0; k < cfg.count; k++) board[positions[idx++]] = type;
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

function hasSpecialNearby(index) {
    const r = Math.floor(index / 10), c = index % 10;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
                if (SPECIAL_TYPES.has(G.board[nr * 10 + nc])) return true;
            }
        }
    }
    return false;
}

function getAdjacent(index) {
    const r = Math.floor(index / 10), c = index % 10;
    const res = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) res.push(nr * 10 + nc);
        }
    }
    return res;
}

function getFoundTreasureCount() {
    let n = 0;
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && TREASURE_TYPES.has(G.board[i])) n++;
    }
    return n;
}

// ──────────────────────────────────────────
// 점수 계산
// ──────────────────────────────────────────
function calculateScores(upToStageIdx) {
    const scores   = new Array(G.teams.length).fill(0);
    const destroyed = new Set();

    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && TREASURE_TYPES.has(G.board[i])) scores[G.revealedBy[i]] += 1;
    }
    if (upToStageIdx <= 0) return { scores, destroyed };

    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'SPECIAL') scores[G.revealedBy[i]] += 2;
    }
    if (upToStageIdx <= 1) return { scores, destroyed };

    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'GOLDEN') scores[G.revealedBy[i]] += 4;
    }
    if (upToStageIdx <= 2) return { scores, destroyed };

    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'TRANSPARENT') scores[G.revealedBy[i]] += 9;
    }
    if (upToStageIdx <= 3) return { scores, destroyed };

    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'BOMB') {
            scores[G.revealedBy[i]] -= 6;
            for (const ni of getAdjacent(i)) {
                if (G.revealed[ni] && ['NORMAL', 'SPECIAL', 'GOLDEN', 'TRANSPARENT'].includes(G.board[ni])) {
                    scores[G.revealedBy[ni]] -= KEY_CONFIG[G.board[ni]].points;
                    destroyed.add(ni);
                }
            }
        }
    }
    return { scores, destroyed };
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
        teams: names.map((name, i) => ({ name, color: TEAM_COLORS[i], treasureCount: 0 })),
        board: selectedMode === 'A' ? [...FIXED_BOARD_A] : generateBoard(),
        mode: selectedMode,
        revealed:      new Array(100).fill(false),
        revealedBy:    new Array(100).fill(null),
        hints:         new Array(100).fill(null),
        specialNearby: new Array(100).fill(false),
        round: 1, phase: 'ranking',
        turnOrder: [], turnIdx: 0,
        totalPicks: 0, locked: false,
        skippedTeams: new Set(),
        revealStep: 0,
        animating: false,
    };

    showScreen('game-screen');
    renderBoard();
    renderScores();
    document.getElementById('current-round').textContent = G.round;
    document.getElementById('total-picks').textContent   = G.totalPicks;
    const badge = document.getElementById('mode-badge');
    badge.textContent  = G.mode === 'A' ? 'A 고정' : 'B 랜덤';
    badge.className    = `mode-badge mode-${G.mode.toLowerCase()}`;
    showRankingPhase();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ──────────────────────────────────────────
// 게임 화면 렌더링
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
                if (G.specialNearby[i]) cell.classList.add('special-nearby');
                cell.textContent = h > 0 ? h : '';
            } else if (type === 'TRAP') {
                cell.classList.add('key-trap');
                cell.textContent = '🪤';
            } else {
                cell.classList.add('key-treasure');
                cell.textContent = '🎁';
                cell.dataset.teamIdx = G.revealedBy[i];
                cell.style.setProperty('--team-color', G.teams[G.revealedBy[i]].color);
                cell.style.outline = `2px solid ${G.teams[G.revealedBy[i]].color}`;
                cell.style.outlineOffset = '-2px';
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

function renderScores() {
    const list = document.getElementById('score-list');
    list.innerHTML = '';
    const activeIdx = G.phase === 'selection' ? G.turnOrder[G.turnIdx] : -1;

    G.teams.forEach((team, i) => {
        const card = document.createElement('div');
        card.className = `score-card${i === activeIdx ? ' active-team' : ''}`;
        card.style.borderLeftColor = team.color;
        card.innerHTML = `
            <div class="score-name" style="color:${team.color}">${team.name}</div>
            <div class="score-treasure">🎁 <span>${team.treasureCount}</span>개</div>
            ${G.skippedTeams.has(i) ? '<div class="skip-badge">다음 턴 패스</div>' : ''}
        `;
        card.addEventListener('mouseenter', () => highlightTeamCells(i, true));
        card.addEventListener('mouseleave', () => highlightTeamCells(i, false));
        list.appendChild(card);
    });

    // 남은 보물 표시
    const found = getFoundTreasureCount();
    const remaining = TOTAL_TREASURES - found;
    document.getElementById('remaining-count').textContent = remaining;
    document.getElementById('remaining-found').textContent  = found;
}

function highlightTeamCells(teamIdx, on) {
    document.querySelectorAll('#board .cell[data-team-idx]').forEach(c => {
        c.classList.remove('team-blink');
    });
    if (on) {
        document.querySelectorAll(`#board .cell[data-team-idx="${teamIdx}"]`).forEach(c => {
            c.classList.add('team-blink');
        });
    }
}

// ──────────────────────────────────────────
// 순위 입력
// ──────────────────────────────────────────
function showRankingPhase() {
    G.phase = 'ranking';
    document.getElementById('ranking-phase').style.display      = 'block';
    document.getElementById('selection-phase').style.display    = 'none';
    document.getElementById('game-complete-phase').style.display = 'none';
    renderRankingInputs();
    renderBoard();
}

function renderRankingInputs() {
    const labels  = ['🥇 1등', '🥈 2등', '🥉 3등', '4️⃣ 4등'];
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
            G.teams.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
        sel.addEventListener('change', autoFill);
        row.appendChild(lbl);
        row.appendChild(sel);
        wrap.appendChild(row);
    }
}

function autoFill() {
    const vals   = [0, 1, 2, 3].map(i => document.getElementById(`rank-${i}`).value);
    const filled = vals.filter(v => v !== '');
    const unique = new Set(filled);
    if (filled.length === 3 && unique.size === 3) {
        const last = ['0','1','2','3'].find(v => !unique.has(v));
        document.getElementById(`rank-${vals.indexOf('')}`).value = last;
    }
}

function randomRanking() {
    shuffle([0, 1, 2, 3]).forEach((teamIdx, rank) => {
        document.getElementById(`rank-${rank}`).value = teamIdx;
    });
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
    showNextTeamOrSkip();
}

// ──────────────────────────────────────────
// 게임 완료 화면 (결과 공개 전 버튼)
// ──────────────────────────────────────────
function showGameComplete() {
    G.phase  = 'complete';
    G.locked = true;
    renderBoard();
    renderScores();
    document.getElementById('selection-phase').style.display     = 'none';
    document.getElementById('ranking-phase').style.display       = 'none';
    document.getElementById('game-complete-phase').style.display = 'flex';
}

// ──────────────────────────────────────────
// 칸 선택
// ──────────────────────────────────────────
function renderTurnOrder() {
    document.getElementById('turn-order-display').innerHTML =
        G.turnOrder.map((teamIdx, i) => {
            const t = G.teams[teamIdx];
            const done = i < G.turnIdx, active = i === G.turnIdx;
            return `<div class="turn-item${done?' done':''}${active?' active':''}"
                        ${active ? `style="border-color:${t.color};color:${t.color}"` : ''}>
                <span class="turn-dot" style="background:${t.color}"></span>
                ${i+1}. ${t.name}
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

function renderSkipTeam(teamIdx) {
    const team = G.teams[teamIdx];
    const box  = document.getElementById('current-team-box');
    box.style.borderColor = '#a855f7';
    box.style.boxShadow   = '0 0 22px #a855f744';
    box.innerHTML = `
        <div class="cur-name" style="color:#a855f7">${team.name}</div>
        <div class="cur-label" style="color:#a855f7">🪤 함정 패스!</div>
    `;
}

function showNextTeamOrSkip() {
    const teamIdx = G.turnOrder[G.turnIdx];
    renderTurnOrder();

    if (G.skippedTeams.has(teamIdx)) {
        G.skippedTeams.delete(teamIdx);
        G.locked = true;
        renderSkipTeam(teamIdx);
        document.getElementById('last-result').innerHTML =
            `<div class="result-trap">🪤 ${G.teams[teamIdx].name}: 함정으로 인해 이번 턴 패스!</div>`;
        setTimeout(advanceTurn, 1800);
    } else {
        renderCurrentTeam();
        renderBoard();
    }
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

    if (type === 'TRAP') {
        G.skippedTeams.add(teamIdx);
        resultEl.innerHTML = `<div class="result-trap">🪤 ${team.name}: 함정 발동! 다음 턴 패스!</div>`;
    } else if (type !== null) {
        team.treasureCount++;
        resultEl.innerHTML = `<div class="result-got">🎁 ${team.name}: 보물 획득!</div>`;
    } else {
        const h = surroundingCount(index);
        G.hints[index] = h;
        G.specialNearby[index] = hasSpecialNearby(index);
        resultEl.innerHTML = `<div class="result-miss">🔍 ${team.name}: 주변 보물 <strong>${h}개</strong></div>`;
    }

    renderBoard();
    renderScores();

    const cellEl = document.querySelector(`.cell[data-index="${index}"]`);
    if (cellEl) cellEl.classList.add('pop');

    setTimeout(advanceTurn, 2000);
}

function advanceTurn() {
    G.turnIdx++;
    G.locked = false;

    if (G.turnIdx >= 4) {
        if (G.round >= 15) {
            showGameComplete(); // 자동 공개 대신 버튼으로
        } else {
            G.round++;
            document.getElementById('current-round').textContent = G.round;
            renderScores();
            showRankingPhase();
        }
        return;
    }

    showNextTeamOrSkip();
}

// ──────────────────────────────────────────
// 공개 단계
// ──────────────────────────────────────────
function startReveal() {
    G.revealStep = 0;
    showScreen('reveal-screen');
    renderRevealStep();
}

function nextRevealStep() {
    if (G.animating) return;
    G.revealStep++;

    if (G.revealStep >= REVEAL_STAGES.length) {
        G = {};
        showScreen('setup-screen');
        return;
    }

    const stage = REVEAL_STAGES[G.revealStep];

    if (stage.id === 'TRANSPARENT') {
        document.getElementById('reveal-next-btn').disabled = true;
        document.getElementById('reveal-stage-title').textContent = stage.label;
        playRouletteReveal('TRANSPARENT', G.revealStep - 1, () => {
            renderRevealStep();
            document.getElementById('reveal-next-btn').disabled = false;
        });
    } else if (stage.id === 'BOMB') {
        document.getElementById('reveal-next-btn').disabled = true;
        document.getElementById('reveal-stage-title').textContent = stage.label;
        playBombReveal(() => {
            renderRevealStep();
            document.getElementById('reveal-next-btn').disabled = false;
        });
    } else {
        renderRevealStep();
    }
}

function renderRevealStep() {
    const stage  = REVEAL_STAGES[G.revealStep];
    const isLast = G.revealStep === REVEAL_STAGES.length - 1;

    document.getElementById('reveal-stage-title').textContent = stage.label;
    document.getElementById('reveal-next-btn').textContent    = isLast ? '🔄 다시 시작' : '다음 ▶';

    const { scores, destroyed } = calculateScores(G.revealStep);
    renderRevealBoard(destroyed, getRevealedTypes());
    renderRevealScores(scores);
    renderRevealDetail(stage, scores, destroyed);
}

function getRevealedTypesAtStep(step) {
    const types = new Set(['TRAP']);
    for (let i = 1; i <= step && i < REVEAL_STAGES.length; i++) {
        if (REVEAL_STAGES[i].revealType) types.add(REVEAL_STAGES[i].revealType);
    }
    return types;
}

function getRevealedTypes() {
    return getRevealedTypesAtStep(G.revealStep);
}

function renderRevealBoard(destroyed, revealedTypes) {
    const el = document.getElementById('reveal-board');
    el.innerHTML = '';

    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;

        if (!G.revealed[i]) {
            cell.textContent = i + 1;
            cell.classList.add('unrevealed');
        } else {
            const type = G.board[i];
            if (type === null) {
                const h = G.hints[i];
                cell.classList.add('hint', `h${h}`);
                if (G.specialNearby[i]) cell.classList.add('special-nearby');
                cell.textContent = h > 0 ? h : '';
            } else if (type === 'TRAP') {
                cell.classList.add('key-trap');
                cell.textContent = '🪤';
            } else if (revealedTypes.has(type)) {
                const cfg = KEY_CONFIG[type];
                cell.classList.add(destroyed.has(i) ? 'key-destroyed' : cfg.css);
                cell.textContent = cfg.emoji;
                if (!destroyed.has(i)) {
                    cell.style.outline = `2px solid ${G.teams[G.revealedBy[i]].color}`;
                    cell.style.outlineOffset = '-2px';
                }
            } else {
                cell.classList.add('key-treasure');
                cell.textContent = '🎁';
                cell.dataset.teamIdx = G.revealedBy[i];
                cell.style.setProperty('--team-color', G.teams[G.revealedBy[i]].color);
                cell.style.outline = `2px solid ${G.teams[G.revealedBy[i]].color}`;
                cell.style.outlineOffset = '-2px';
            }
        }

        el.appendChild(cell);
    }
}

function renderRevealScores(scores) {
    const sorted = G.teams
        .map((t, i) => ({ ...t, score: scores[i] }))
        .sort((a, b) => b.score - a.score);

    document.getElementById('reveal-scores').innerHTML = `
        <table class="score-table">
            <thead><tr><th>팀</th><th>보물</th><th>점수</th></tr></thead>
            <tbody>
                ${sorted.map(t => `
                    <tr>
                        <td style="color:${t.color};font-weight:800">${t.name}</td>
                        <td style="color:#64748b">${t.treasureCount}개</td>
                        <td class="score-val" style="color:${t.color}">${t.score}점</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderRevealDetail(stage, scores, destroyed) {
    const el = document.getElementById('reveal-detail');

    if (stage.id === 'BASE') {
        const total = G.teams.reduce((s, t) => s + t.treasureCount, 0);
        el.innerHTML = `
            <p>모든 보물에 기본 <strong style="color:#f59e0b">+1점</strong> 적용<br>
            <span style="color:#475569;font-size:0.85rem">(함정은 점수 없음)</span></p>
            <div class="detail-row">총 보물 ${total}개 발견</div>
            ${G.teams.map(t => `
                <div class="detail-row">
                    <span style="color:${t.color}">${t.name}</span>: 🎁 ×${t.treasureCount} = +${t.treasureCount}점
                </div>
            `).join('')}
        `;
        return;
    }

    if (stage.id === 'FINAL') {
        const medals = ['🥇', '🥈', '🥉', '4️⃣'];
        const sorted = G.teams
            .map((t, i) => ({ ...t, score: scores[i] }))
            .sort((a, b) => b.score - a.score);
        el.innerHTML = sorted.map((t, rank) => `
            <div class="final-row" style="border-left-color:${t.color}">
                ${medals[rank]} <span style="color:${t.color};font-weight:900">${t.name}</span>
                <span style="float:right;font-size:1.3rem">${t.score}점</span>
            </div>
        `).join('');
        return;
    }

    const finders = {};
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === stage.revealType) {
            finders[G.revealedBy[i]] = (finders[G.revealedBy[i]] || 0) + 1;
        }
    }

    if (Object.keys(finders).length === 0) {
        el.innerHTML = `<p>아무도 획득하지 못했습니다.</p>`;
        return;
    }

    if (stage.id === 'BOMB') {
        const finderRows = Object.entries(finders).map(([idx, cnt]) => {
            const team = G.teams[idx];
            return `<div class="detail-row">
                <span style="color:${team.color}">${team.name}</span>: 💣 ×${cnt} → <strong style="color:#ef4444">-5점</strong>
            </div>`;
        }).join('');

        const dmg = {};
        for (const ni of destroyed) {
            const idx = G.revealedBy[ni];
            dmg[idx] = (dmg[idx] || 0) + KEY_CONFIG[G.board[ni]].points;
        }
        const dmgRows = Object.entries(dmg).map(([idx, pts]) => {
            const team = G.teams[idx];
            return `<div class="detail-note">
                <span style="color:${team.color}">${team.name}</span>: 💥 열쇠 파괴 -${pts}점
            </div>`;
        }).join('');

        el.innerHTML = finderRows
            + (destroyed.size > 0
                ? `<div class="detail-row">💥 열쇠 <strong>${destroyed.size}개</strong> 파괴!</div>` + dmgRows
                : '<div class="detail-row" style="color:#475569">폭발 피해 없음</div>');
        return;
    }

    const increments = { SPECIAL: 2, GOLDEN: 4, TRANSPARENT: 9 };
    const inc = increments[stage.revealType] || 0;
    const cfg = KEY_CONFIG[stage.revealType];

    el.innerHTML = Object.entries(finders).map(([idx, cnt]) => {
        const team = G.teams[idx];
        return `<div class="detail-row">
            <span style="color:${team.color}">${team.name}</span>:
            ${cfg.emoji} ×${cnt} → <strong>+${inc * cnt}점 추가</strong>
        </div>`;
    }).join('');
}

// ──────────────────────────────────────────
// 룰렛 애니메이션
// ──────────────────────────────────────────
function buildRouletteSequence(candidates, targets) {
    const nonTargets = candidates.filter(i => !targets.includes(i));
    if (nonTargets.length === 0) return [...targets];

    const sh  = shuffle([...nonTargets]);
    const sh2 = shuffle([...nonTargets]);
    const seq = [];

    // 빠른 구간 20프레임
    for (let i = 0; i < 20; i++) seq.push(sh[i % sh.length]);
    // 중간 구간 12프레임
    for (let i = 0; i < 12; i++) seq.push(sh2[i % sh2.length]);
    // 느려지는 구간 6프레임 (후보 줄이기)
    const small = sh.slice(0, Math.min(4, sh.length));
    for (let i = 0; i < 6; i++) seq.push(small[i % small.length]);
    // 직전 2프레임 (비 타겟)
    for (let i = 0; i < Math.min(2, nonTargets.length); i++) seq.push(nonTargets[i]);
    // 착지
    targets.forEach(t => seq.push(t));

    return seq;
}

function getFrameDelay(frame, total) {
    const p = frame / total;
    if (p < 0.45) return 60 + 40 * (p / 0.45);
    if (p < 0.75) return 100 + 200 * ((p - 0.45) / 0.3);
    const t = (p - 0.75) / 0.25;
    return 300 + 350 * t * t;
}

function playRouletteReveal(targetType, prevStepIdx, onComplete) {
    G.animating = true;
    const prevTypes = getRevealedTypesAtStep(prevStepIdx);
    const { destroyed: prevDestroyed } = calculateScores(prevStepIdx);
    renderRevealBoard(prevDestroyed, prevTypes);

    const candidates = [], targets = [];
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] !== null && !prevTypes.has(G.board[i])) {
            candidates.push(i);
            if (G.board[i] === targetType) targets.push(i);
        }
    }

    if (targets.length === 0 || candidates.length < 2) {
        G.animating = false;
        onComplete();
        return;
    }

    const seq = buildRouletteSequence(candidates, targets);
    let frame = 0, prevIdx = null;

    function step() {
        if (prevIdx !== null) {
            const e = document.querySelector(`#reveal-board .cell[data-index="${prevIdx}"]`);
            if (e) e.classList.remove('roulette-flash');
        }

        if (frame >= seq.length) {
            // 착지 효과
            targets.forEach(ti => {
                const e = document.querySelector(`#reveal-board .cell[data-index="${ti}"]`);
                if (e) { e.classList.add('roulette-land'); }
            });
            setTimeout(() => {
                G.animating = false;
                onComplete();
            }, 1000);
            return;
        }

        const idx = seq[frame];
        prevIdx = idx;
        const e = document.querySelector(`#reveal-board .cell[data-index="${idx}"]`);
        if (e) e.classList.add('roulette-flash');

        setTimeout(step, getFrameDelay(frame, seq.length));
        frame++;
    }

    step();
}

function playBombReveal(onComplete) {
    G.animating = true;
    const prevStepIdx = G.revealStep - 1;
    const prevTypes   = getRevealedTypesAtStep(prevStepIdx);
    const { destroyed: prevDestroyed } = calculateScores(prevStepIdx);
    renderRevealBoard(prevDestroyed, prevTypes);

    const candidates = [], targets = [];
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] !== null && !prevTypes.has(G.board[i])) {
            candidates.push(i);
            if (G.board[i] === 'BOMB') targets.push(i);
        }
    }

    if (targets.length === 0 || candidates.length < 2) {
        G.animating = false;
        onComplete();
        return;
    }

    const seq = buildRouletteSequence(candidates, targets);
    let frame = 0, prevIdx = null;

    function step() {
        if (prevIdx !== null) {
            const e = document.querySelector(`#reveal-board .cell[data-index="${prevIdx}"]`);
            if (e) e.classList.remove('roulette-flash');
        }

        if (frame >= seq.length) {
            // 폭탄 착지
            targets.forEach(ti => {
                const e = document.querySelector(`#reveal-board .cell[data-index="${ti}"]`);
                if (e) {
                    e.classList.remove('roulette-flash');
                    e.classList.add('roulette-land', 'key-bomb');
                    e.textContent = '💣';
                }
            });

            // 800ms 후 연기 효과
            setTimeout(() => {
                targets.forEach(ti => {
                    getAdjacent(ti).forEach(ni => {
                        const e = document.querySelector(`#reveal-board .cell[data-index="${ni}"]`);
                        if (e) {
                            e.className = 'cell smoke-cell';
                            e.dataset.index = ni;
                            e.textContent = '💨';
                        }
                    });
                });

                // 2초 후 최종 상태로
                setTimeout(() => {
                    G.animating = false;
                    onComplete();
                }, 2000);
            }, 800);
            return;
        }

        const idx = seq[frame];
        prevIdx = idx;
        const e = document.querySelector(`#reveal-board .cell[data-index="${idx}"]`);
        if (e) e.classList.add('roulette-flash');

        setTimeout(step, getFrameDelay(frame, seq.length));
        frame++;
    }

    step();
}

function resetGame() {
    G = {};
    showScreen('setup-screen');
}
