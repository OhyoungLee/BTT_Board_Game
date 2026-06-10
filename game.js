'use strict';

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

const KEY_CONFIG = {
    NORMAL:      { emoji: '🔑', name: '일반',  points: 1,   count: 25, css: 'key-normal'      },
    SPECIAL:     { emoji: '🗝️', name: '특수',  points: 3,   count: 5,  css: 'key-special'     },
    GOLDEN:      { emoji: '✨', name: '황금',  points: 5,   count: 2,  css: 'key-golden'      },
    TRANSPARENT: { emoji: '👻', name: '투명',  points: 10,  count: 2,  css: 'key-transparent' },
    TRAP:        { emoji: '🪤', name: '함정',  points: -10, count: 2,  css: 'key-trap'        },
    BOMB:        { emoji: '💣', name: '폭탄',  points: 0,   count: 2,  css: 'key-bomb'        },
};

// 공개 단계 정의
const REVEAL_STAGES = [
    { id: 'BASE',        label: '📦 보물 개수 공개',   revealType: null          },
    { id: 'SPECIAL',     label: '🗝️ 특수 열쇠 공개',   revealType: 'SPECIAL'     },
    { id: 'GOLDEN',      label: '✨ 황금 열쇠 공개',    revealType: 'GOLDEN'      },
    { id: 'TRANSPARENT', label: '👻 투명 열쇠 공개',    revealType: 'TRANSPARENT' },
    { id: 'TRAP',        label: '🪤 함정 공개',          revealType: 'TRAP'        },
    { id: 'BOMB',        label: '💣 폭탄 공개',          revealType: 'BOMB'        },
    { id: 'FINAL',       label: '🏁 최종 결과',          revealType: 'NORMAL'      },
];

let G = {};

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

// ──────────────────────────────────────────
// 점수 계산 (단계별 누적)
// ──────────────────────────────────────────
function calculateScores(upToStageIdx) {
    const scores = new Array(G.teams.length).fill(0);
    const destroyed = new Set();

    // 기본: 모든 보물 +1 (열쇠/함정/폭탄 구분 없이)
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] !== null) {
            scores[G.revealedBy[i]] += 1;
        }
    }
    if (upToStageIdx <= 0) return { scores, destroyed };

    // 특수 열쇠: +2 추가 (총 +3)
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'SPECIAL') scores[G.revealedBy[i]] += 2;
    }
    if (upToStageIdx <= 1) return { scores, destroyed };

    // 황금 열쇠: +4 추가 (총 +5)
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'GOLDEN') scores[G.revealedBy[i]] += 4;
    }
    if (upToStageIdx <= 2) return { scores, destroyed };

    // 투명 열쇠: +9 추가 (총 +10)
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'TRANSPARENT') scores[G.revealedBy[i]] += 9;
    }
    if (upToStageIdx <= 3) return { scores, destroyed };

    // 함정: -11 (기본 +1 취소 + -10 = 총 -10)
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'TRAP') scores[G.revealedBy[i]] -= 11;
    }
    if (upToStageIdx <= 4) return { scores, destroyed };

    // 폭탄: 선택된 경우만 — 주변 열쇠(NORMAL/SPECIAL/GOLDEN/TRANSPARENT) 파괴
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === 'BOMB') {
            for (const ni of getAdjacent(i)) {
                if (G.revealed[ni]) {
                    const t = G.board[ni];
                    if (['NORMAL', 'SPECIAL', 'GOLDEN', 'TRANSPARENT'].includes(t)) {
                        scores[G.revealedBy[ni]] -= KEY_CONFIG[t].points;
                        destroyed.add(ni);
                    }
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
        board: generateBoard(),
        revealed:   new Array(100).fill(false),
        revealedBy: new Array(100).fill(null),
        hints:      new Array(100).fill(null),
        round: 1, phase: 'ranking',
        turnOrder: [], turnIdx: 0,
        totalPicks: 0, locked: false,
        revealStep: 0,
    };

    showScreen('game-screen');
    renderBoard();
    renderScores();
    document.getElementById('current-round').textContent = G.round;
    document.getElementById('total-picks').textContent   = G.totalPicks;
    showRankingPhase();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ──────────────────────────────────────────
// 게임 중 렌더링
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
            } else {
                // 게임 중: 모든 보물은 🎁
                cell.classList.add('key-treasure');
                cell.textContent = '🎁';
                const team = G.teams[G.revealedBy[i]];
                cell.style.outline = `2px solid ${team.color}`;
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
        `;
        list.appendChild(card);
    });
}

// ──────────────────────────────────────────
// 순위 입력
// ──────────────────────────────────────────
function showRankingPhase() {
    G.phase = 'ranking';
    document.getElementById('ranking-phase').style.display   = 'block';
    document.getElementById('selection-phase').style.display = 'none';
    renderRankingInputs();
    renderBoard();
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
            G.teams.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
        sel.addEventListener('change', autoFill);

        row.appendChild(lbl);
        row.appendChild(sel);
        wrap.appendChild(row);
    }
}

function autoFill() {
    const vals = [0, 1, 2, 3].map(i => document.getElementById(`rank-${i}`).value);
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
    renderCurrentTeam();
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
        team.treasureCount++;
        resultEl.innerHTML = `<div class="result-got">🎁 ${team.name}: 보물 획득!</div>`;
    } else {
        const h = surroundingCount(index);
        G.hints[index] = h;
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
            startReveal();
        } else {
            G.round++;
            document.getElementById('current-round').textContent = G.round;
            renderScores();
            showRankingPhase();
        }
    } else {
        renderTurnOrder();
        renderCurrentTeam();
        renderBoard();
    }
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
    G.revealStep++;
    if (G.revealStep >= REVEAL_STAGES.length) {
        G = {};
        showScreen('setup-screen');
        return;
    }
    renderRevealStep();
}

function renderRevealStep() {
    const stage = REVEAL_STAGES[G.revealStep];
    const isLast = G.revealStep === REVEAL_STAGES.length - 1;

    document.getElementById('reveal-stage-title').textContent = stage.label;
    document.getElementById('reveal-next-btn').textContent = isLast ? '🔄 다시 시작' : '다음 ▶';

    const { scores, destroyed } = calculateScores(G.revealStep);

    renderRevealBoard(destroyed);
    renderRevealScores(scores);
    renderRevealDetail(stage, scores, destroyed);
}

// 현재 단계까지 공개된 타입 집합
function getRevealedTypes() {
    const types = new Set(['NORMAL']); // BASE 단계부터 일반 열쇠 보드 표시
    for (let i = 1; i <= G.revealStep && i < REVEAL_STAGES.length; i++) {
        if (REVEAL_STAGES[i].revealType) types.add(REVEAL_STAGES[i].revealType);
    }
    return types;
}

function renderRevealBoard(destroyed) {
    const el = document.getElementById('reveal-board');
    el.innerHTML = '';
    const revealedTypes = getRevealedTypes();

    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (!G.revealed[i]) {
            cell.textContent = i + 1;
            cell.classList.add('unrevealed');
        } else {
            const type = G.board[i];
            if (type === null) {
                const h = G.hints[i];
                cell.classList.add('hint', `h${h}`);
                cell.textContent = h > 0 ? h : '';
            } else if (revealedTypes.has(type)) {
                const cfg = KEY_CONFIG[type];
                if (destroyed.has(i)) {
                    cell.classList.add('key-destroyed');
                } else {
                    cell.classList.add(cfg.css);
                }
                cell.textContent = cfg.emoji;
                // 팀 색상 테두리 (투명/함정 제외)
                if (!['TRANSPARENT', 'TRAP'].includes(type) && !destroyed.has(i)) {
                    cell.style.outline = `2px solid ${G.teams[G.revealedBy[i]].color}`;
                    cell.style.outlineOffset = '-2px';
                }
            } else {
                // 아직 공개 안 된 타입: 보물로 표시
                cell.classList.add('key-treasure');
                cell.textContent = '🎁';
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
            <thead>
                <tr><th>팀</th><th>보물</th><th>점수</th></tr>
            </thead>
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
        const totalTreasure = G.teams.reduce((s, t) => s + t.treasureCount, 0);
        el.innerHTML = `
            <p>모든 보물에 기본 <strong style="color:#f59e0b">+1점</strong>이 적용됩니다.</p>
            <div class="detail-row">총 보물 ${totalTreasure}개 발견</div>
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
                <span style="float:right;font-size:1.2rem">${t.score}점</span>
            </div>
        `).join('');
        return;
    }

    const cfg = KEY_CONFIG[stage.revealType];

    // 이번 단계 타입을 획득한 팀 목록
    const finders = {};
    for (let i = 0; i < 100; i++) {
        if (G.revealed[i] && G.board[i] === stage.revealType) {
            finders[G.revealedBy[i]] = (finders[G.revealedBy[i]] || 0) + 1;
        }
    }

    if (Object.keys(finders).length === 0) {
        el.innerHTML = `<p>이번 게임에서 아무도 획득하지 못했습니다.</p>`;
        return;
    }

    const increments = { SPECIAL: 2, GOLDEN: 4, TRANSPARENT: 9, TRAP: -11, BOMB: 0 };
    const inc = increments[stage.revealType];

    if (stage.id === 'BOMB') {
        const bombRows = Object.entries(finders).map(([idx, cnt]) => {
            const team = G.teams[idx];
            return `<div class="detail-row"><span style="color:${team.color}">${team.name}</span>: 💣 ×${cnt}</div>`;
        }).join('');

        const dmg = [...destroyed].reduce((acc, ni) => {
            const t = G.board[ni];
            const teamIdx = G.revealedBy[ni];
            acc[teamIdx] = (acc[teamIdx] || 0) + KEY_CONFIG[t].points;
            return acc;
        }, {});

        const dmgRows = Object.entries(dmg).map(([idx, pts]) => {
            const team = G.teams[idx];
            return `<div class="detail-note"><span style="color:${team.color}">${team.name}</span>: 💥 -${pts}점 (열쇠 파괴)</div>`;
        }).join('');

        el.innerHTML = bombRows + (destroyed.size > 0
            ? `<div class="detail-row">💥 열쇠 <strong>${destroyed.size}개</strong> 파괴!</div>` + dmgRows
            : '<div class="detail-row" style="color:#475569">폭발 피해 없음</div>');
        return;
    }

    el.innerHTML = Object.entries(finders).map(([idx, cnt]) => {
        const team = G.teams[idx];
        const change = inc * cnt;
        const sign = change >= 0 ? '+' : '';
        return `<div class="detail-row">
            <span style="color:${team.color}">${team.name}</span>:
            ${cfg.emoji} ×${cnt} → <strong>${sign}${change}점</strong>
        </div>`;
    }).join('');
}

function resetGame() {
    G = {};
    showScreen('setup-screen');
}
