/* =========================================================
   운정 페스티벌 - 화면(뷰)과 라우터
   주소의 # 뒤 경로에 따라 화면이 바뀝니다.
     #/               관람객 홈
     #/explore/floor  층별 안내   (/club 동아리별, /theme 테마별)
     #/booth/b01      부스 상세 + 예약 / 줄서기
     #/q/b01          QR 줄서기 (부스 앞 QR 코드가 이 주소로 연결됨)
     #/my             내 티켓 (예약 + 줄서기 번호표)
     #/op             부스 운영자 모드 (/edit, /crowd = 줄서기·현황, /resv)
     #/admin          서버 관리자 모드 (/dash, /booths, /notices, /accounts, /settings, /qr)
   ========================================================= */

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const topnav = document.getElementById('topnav');
const loginLink = document.getElementById('login-link');
const TAB_ID = uid('tab');
const ui = { building: 'main', floor: 1, theme: 'all', q: '', selSlot: null, selDate: null, boardDate: null, adResvBooth: null, lastResv: null, draft: null, heroIdx: 0, next: null };
let current = null;   // 현재 화면 { route, params }

// =========================================================
// 공통 도우미
// =========================================================
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.className = ''; }, 2400);
}

function timeAgo(ts) {
  const m = Math.floor((Store.now() - ts) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return m + '분 전';
  return Math.floor(m / 60) + '시간 전';
}

const getSession = () => Store.session();

function getFavs() { try { return JSON.parse(localStorage.getItem('unjeong-favs')) || []; } catch (e) { return []; } }
function toggleFav(id) {
  const f = getFavs();
  const next = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
  try { localStorage.setItem('unjeong-favs', JSON.stringify(next)); } catch (e) {}
  return next.includes(id);
}

// 업로드 사진은 서버 문서 크기 제한(1MB) 때문에 작게 줄입니다.
function readImage(file, maxW = 640) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// =========================================================
// 아이콘 (선 아이콘 SVG, 글자색을 따라감)
// =========================================================
const ICON_PATHS = {
  school: '<path d="M3 21h18M5 21V10l7-4 7 4v11M12 6V2.5l4 1.5-4 1.5"/><path d="M10 21v-4h4v4M8.5 12h.01M15.5 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  heart: '<path d="M12 20.5s-7.5-4.4-7.5-10.1A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.8c0 5.7-7.5 10.1-7.5 10.1z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14h1a4 4 0 0 1 4 4v1"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  signal: '<path d="M5 20v-4M10 20v-8M15 20V8M20 20V4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 11.5V20h14v-8.5M10 20v-5h4v5"/>',
  megaphone: '<path d="M4 10v4h3l8 4V6l-8 4H4z"/><path d="M18.5 9a4 4 0 0 1 0 6M7 14l1.5 5.5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
};
const icon = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

// =========================================================
// 공통 UI 조각
// =========================================================
const crowdOf = (b) => CROWD[Store.crowdKey(b)];   // 혼잡도는 자동 계산 (store.js의 crowdKey)
const locText = (b) => `${buildingLabel(b.building)} ${b.floor}층 ${esc(b.room)}`;
const themeLabel = (id) => { const t = THEMES.find(x => x.id === id); return t ? `${t.emoji} ${t.label}` : id; };

function crowdBadge(b) {
  const c = crowdOf(b);
  return `<span class="badge crowd" style="--c:${c.color}">${c.icon} ${c.label}</span>`;
}
function typeBadge(b) {
  return b.type === 'reserve' ? '<span class="badge type-reserve">예약제</span>' : '<span class="badge type-live">현장 입장</span>';
}
function coverHTML(b, cls = 'cover') {
  if (b.cover) return `<div class="${cls}" style="background-image:url('${b.cover}')"></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg, ${b.color}, ${b.color}88)"><span>${b.emoji}</span></div>`;
}
function waitText(b) {
  if (b.stopped) return '지금은 운영하지 않아요';
  if (b.type === 'reserve') {
    if (b.resvOpen === false) return '예약 접수 마감';
    const n = Store.remaining(b.id);
    return n > 0 ? `예약 잔여 <b>${n}</b>자리` : '예약 마감';
  }
  const q = Store.queue(b.id), w = q.waiting || 0;
  if (q.open === false) return '줄서기 접수 마감';
  return w > 0 ? `대기 ${w}명 · 약 <b>${Store.waitMinutes(b)}분</b>` : '<b>바로 입장 가능</b>';
}
function boothCard(b) {
  return `
    <a class="booth-card" href="#/booth/${b.id}">
      ${coverHTML(b, 'thumb')}
      <div class="bc-body">
        <div class="badges">${typeBadge(b)}${crowdBadge(b)}</div>
        <h3>${esc(b.name)}</h3>
        <p class="muted small">${esc(b.club)} · ${locText(b)}</p>
        <p class="bc-wait">${waitText(b)}</p>
      </div>
    </a>`;
}
function boothList(list, empty = '해당하는 부스가 없어요.') {
  return list.length ? `<div class="booth-list">${list.map(boothCard).join('')}</div>` : `<p class="empty">${empty}</p>`;
}

// ---------------------------------------------------------
// 층 안내도 (교실 배치도 기준, 살짝 기울여 입체감)
//   opts.all = 비공개 부스도 표시(관리자용) / opts.highlight = 강조할 부스 id / opts.small = 작게
// ---------------------------------------------------------
function floorPlan(building, floor, opts = {}) {
  const rows = floorRows(building, floor);
  const byRoom = {};
  Store.booths()
    .filter(b => (b.building || 'main') === building && b.floor === floor && (opts.all || b.status === 'approved'))
    .forEach(b => { byRoom[b.room] = b; });
  const cell = (c) => {
    const st = `flex:${c.w} 1 0`;
    if (c.gap) return `<div class="cell gap" style="${st}"></div>`;
    if (c.fac) return `<div class="cell fac" style="${st}" title="${esc(c.name)}"><span>${esc(c.name)}</span></div>`;
    const b = byRoom[c.name];
    if (!b) return `<div class="cell room" style="${st}"><span class="cell-name">${esc(c.name)}</span></div>`;
    const cr = crowdOf(b);
    const warn = opts.all && Store.isStale(b) ? '<i class="cell-warn" title="호출 지연">!</i>' : '';
    return `
      <a class="cell room booth ${opts.highlight === b.id ? 'hl' : ''}" style="${st};--c:${cr.color}" href="#/booth/${b.id}" title="${esc(b.name)}">
        ${warn}<span class="cell-name">${esc(c.name)}</span>
        <span class="cell-emoji">${b.emoji}</span>
        <span class="cell-booth">${esc(b.name)}</span>
        <span class="cell-crowd">${cr.label}${b.type === 'live' && Store.waitingOf(b) ? ` · ${Store.waitingOf(b)}명` : ''}</span>
      </a>`;
  };
  return `
    <div class="plan-wrap ${opts.small ? 'small' : ''}">
      <div class="plan-scroll">
        <div class="plan-stage">
          <div class="plan">
            <div class="plan-label"><b>${buildingLabel(building)} ${floor}F</b><span>서편 ← 복도 → 동편</span></div>
            <div class="plan-row">${rows.n.map(cell).join('')}</div>
            <div class="plan-corridor">CORRIDOR</div>
            <div class="plan-row">${rows.s.map(cell).join('')}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------
// 학교 건물 입체 모형 (본관 · 연결통로 · 후관, 1~5층). 층을 누르면 그 층으로 이동
// ---------------------------------------------------------
function buildingModel(selB, selF, opts = {}) {
  const U = 21, C = 0.866, S = 0.5, H = 1.2;
  const P = (x, y, z) => [(x - y) * C * U, (x + y) * S * U - z * H * U];
  const all = [];
  const pts = (arr) => arr.map(p => { const q = P(...p); all.push(q); return q.map(v => v.toFixed(1)).join(','); }).join(' ');
  const list = Store.booths().filter(b => opts.all || b.status === 'approved');
  const count = (bid, f) => list.filter(b => (b.building || 'main') === bid && b.floor === f).length;
  const blocks = [   // 뒤쪽부터 그려야 겹침이 자연스러움
    { id: 'rear', x0: 1.5, x1: 9.5, y0: -7.8, y1: -5.2 },
    { id: 'bridge', x0: 5.7, x1: 6.7, y0: -5.2, y1: 0, floors: [2, 3, 4] },
    { id: 'main', x0: 0, x1: 13, y0: 0, y1: 2.6 },
  ];
  let g = '';
  for (const bl of blocks) {
    for (const f of FLOOR_NUMS) {
      if (bl.floors && !bl.floors.includes(f)) continue;
      const { x0, x1, y0, y1 } = bl;
      const z0 = f - 1, z1 = f - 0.1;
      const bridge = bl.id === 'bridge';
      const n = bridge ? 0 : count(bl.id, f);
      const sel = !bridge && bl.id === selB && f === selF;
      const top = pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      const front = pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
      const side = pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
      const win = bridge ? '' : `<polygon class="win" points="${pts([[x0 + .35, y1, z0 + .3], [x1 - .35, y1, z0 + .3], [x1 - .35, y1, z0 + .66], [x0 + .35, y1, z0 + .66]])}"/>`;
      let badge = '';
      if (n) { const [bx, by] = P(x1 - .7, y1, z0 + .48); badge = `<g class="cnt"><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="8.5"/><text x="${bx.toFixed(1)}" y="${(by + 3.6).toFixed(1)}">${n}</text></g>`; }
      const attrs = bridge ? '' : `data-b="${bl.id}" data-f="${f}" tabindex="0" role="button" aria-label="${buildingLabel(bl.id)} ${f}층${n ? `, 부스 ${n}개` : ''}"`;
      g += `<g class="fl ${bridge ? 'bridge' : ''} ${sel ? 'sel' : ''}" ${attrs}><polygon class="side" points="${side}"/><polygon class="front" points="${front}"/><polygon class="top" points="${top}"/>${win}${badge}</g>`;
    }
  }
  // 층 번호 · 건물 이름
  let labels = '';
  FLOOR_NUMS.forEach(f => { const [x, y] = P(-.25, 2.6, f - .55); all.push([x - 24, y]); labels += `<text class="fnum" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${f}F</text>`; });
  const [mx, my] = P(6.5, 2.6, -.75); labels += `<text class="bname" x="${mx.toFixed(1)}" y="${my.toFixed(1)}">본관</text>`;
  const [rx, ry] = P(5.5, -7.8, 5.35); all.push([rx, ry - 14]); labels += `<text class="bname" x="${rx.toFixed(1)}" y="${ry.toFixed(1)}">후관</text>`;
  const [cx, cy] = P(6.2, -2.6, 4.6); labels += `<text class="bnote" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">연결통로</text>`;
  all.push(P(6.5, 2.6, -1.3));
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]), pad = 12;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad;
  return `<svg class="model" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" role="group" aria-label="학교 건물 모형">${g}${labels}</svg>`;
}
// 모형의 층을 눌렀을 때
function bindModel(root, onPick) {
  root.querySelectorAll('.model .fl[data-b]').forEach(el => {
    const go = () => onPick(el.dataset.b, Number(el.dataset.f));
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

// 하위 페이지 상단 배너 (학교 사진 + 제목 + 위치 경로)
function pageBanner(title, eng, crumbs = []) {
  const path = [['홈', '#/'], ...crumbs];
  return `
    <section class="page-banner">
      <div class="pb-inner"><p class="pb-eng">${eng}</p><h1 class="pb-title">${esc(title)}</h1></div>
    </section>
    <nav class="crumbs" aria-label="현재 위치">${path.map(([t, h], i) => i === path.length - 1 ? `<span>${esc(t)}</span>` : `<a href="${h}">${esc(t)}</a>`).join('<i>›</i>')}</nav>`;
}

function crowdLegend() {
  return `<div class="legend">${Object.values(CROWD).map(c => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div>`;
}

// 부스 입구에서 보여줄 예약번호 상자
const codeBox = (code) => `<div class="code-box"><small>예약번호</small><b>${esc(code)}</b></div>`;

// =========================================================
// 관람객 모드
// =========================================================
function viewHome() {
  const s = Store.db.settings;
  const notices = Store.notices();
  const next = Store.myResv().find(r => r.status === 'reserved');
  const pub = Store.publicBooths().filter(b => !b.stopped);
  const calm = pub.filter(b => Store.crowdKey(b) === 'free').slice(0, 4);
  const hot = [...pub].sort((a, b) => score(b) - score(a)).slice(0, 4);
  function score(b) { return b.type === 'reserve' ? Store.bookedOf(b.id) : Store.waitingOf(b) * 2; }
  // 줄서기 번호표: 호출된 것이 있으면 맨 먼저
  const myT = Store.myActiveTickets().sort((a, b) => (b.status === 'called') - (a.status === 'called'));
  const ticketHTML = myT.slice(0, 2).map(t => {
    const tb = Store.booth(t.boothId);
    if (!tb) return '';
    const called = t.status === 'called';
    const ahead = Store.aheadOf(t);
    return `
      <a class="next-resv ${called ? 'called' : ''}" href="#/q/${tb.id}">
        <div>
          <p class="eyebrow light">${called ? '🔔 NOW CALLING · 지금 입장하세요' : `MY QUEUE · 앞에 ${ahead}명`}</p>
          <h3>${tb.emoji} ${esc(tb.name)}</h3>
          <p class="small">대기 번호 <b>${t.no}번</b> · ${locText(tb)}${called ? '' : ` · 예상 ${ahead * tb.minPerPerson}분`}</p>
        </div>
        <span class="arrow">번호표 ${icon('chevron')}</span>
      </a>`;
  }).join('');
  const photos = s.heroPhotos || [];

  let nextHTML = '';
  if (next) {
    const sl = Store.slot(next.slotId), b = Store.booth(next.boothId);
    const left = Math.round((Store.slotTs(sl) - Store.now()) / 60000);
    nextHTML = `
      <a class="next-resv" href="#/my">
        <div>
          <p class="eyebrow light">MY RESERVATION ${left > 24 * 60 ? `· ${dateLabel(sl.date)}` : left > 0 ? `· ${left >= 60 ? Math.floor(left / 60) + '시간 ' : ''}${left % 60}분 남음` : '· 지금 입장하세요'}</p>
          <h3>${b.emoji} ${esc(b.name)}</h3>
          <p class="small">${sl.date === Store.today() ? '오늘' : dateLabel(sl.date)} ${sl.start} · ${Store.partyOf(next)}명 · ${locText(b)} · 예약번호 <b>${next.code}</b></p>
        </div>
        <span class="arrow">예약번호 ${icon('chevron')}</span>
      </a>`;
  }

  const menu = [
    ['floor', 'school', '층별 안내', '본관 · 후관 1~5층 안내도'],
    ['theme', 'heart', '테마별 안내', '방탈출 · 카페 · 체험 · 공연'],
    ['club', 'people', '동아리별 안내', '동아리 이름으로 찾기'],
  ];

  const reserveN = pub.filter(b => b.type === 'reserve').length;
  const facts = [
    ['clock', '운영 시간', `${s.openTime} – ${s.closeTime}`],
    ['store', '참여 부스', `${pub.length}곳의 동아리`],
    ['ticket', '예약 부스', `${reserveN}곳 · 앱으로 미리 예약`],
    ['school', '전관 운영', '본관 · 후관 1~5층'],
  ];

  app.innerHTML = `
    <section class="hero ${photos.length ? '' : 'no-photo'}">
      <div class="hero-media">
        ${photos.length ? `
          <div class="slides" style="transform:translateX(-${(ui.heroIdx % photos.length) * 100}%)">
            ${photos.map(p => `<figure class="slide"><img src="${p.src}" alt="">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}
          </div>`
        : '<div class="hero-art" role="img" aria-label="운정고등학교 전경"></div>'}
      </div>
      <div class="hero-shade"></div>

      <div class="hero-content">
        <p class="hero-eyebrow">UNJEONG HIGH SCHOOL · CLUB FESTIVAL</p>
        <h1 class="hero-title">${esc(s.festivalName)}</h1>
        <p class="hero-sub">${esc(s.subtitle)}</p>
        <a class="hero-cta" href="#/explore/floor">부스 둘러보기 ${icon('chevron')}</a>
      </div>

      <div class="hero-foot">
        ${photos.length > 1 ? `<div class="dots">${photos.map((_, i) => `<button data-dot="${i}" class="${i === ui.heroIdx % photos.length ? 'on' : ''}" aria-label="${i + 1}번 사진"></button>`).join('')}</div>` : '<div class="dots"></div>'}
        <ul class="hero-facts">
          ${facts.map(([ic, t, d]) => `<li><span class="fact-ic">${icon(ic)}</span><span><b>${t}</b><small>${d}</small></span></li>`).join('')}
        </ul>
      </div>
    </section>

    <h2 class="sec-title center"><span class="eyebrow">GUIDE</span>어떻게 둘러볼까요?</h2>
    <nav class="menu-list">
      ${menu.map(([k, ic, t, d]) => `
        <a class="menu-btn" href="#/explore/${k}">
          <span class="menu-ico">${icon(ic)}</span>
          <span class="menu-txt"><b>${t}</b><small>${d}</small></span>
          ${icon('chevron', 'ico chev')}
        </a>`).join('')}
    </nav>

    ${ticketHTML}
    ${nextHTML}

    ${notices.length ? `<section>
      <h2 class="sec-title"><span class="eyebrow">NOTICE</span>공지사항</h2>
      <div class="notices">${notices.slice(0, 3).map(n => `
        <div class="notice ${n.urgent ? 'urgent' : ''}"><span>${esc(n.body)}</span><small class="muted">${timeAgo(n.createdAt)}</small></div>`).join('')}
      </div>
    </section>` : ''}

    <section>
      <h2 class="sec-title"><span class="eyebrow">QUIET NOW</span>지금 한산한 부스</h2>
      ${boothList(calm, '지금은 모든 부스가 붐비고 있어요.')}
    </section>

    <section>
      <h2 class="sec-title"><span class="eyebrow">POPULAR</span>인기 부스</h2>
      ${boothList(hot)}
    </section>

    <footer class="foot">
      <img class="foot-logo" src="images/logo.png" alt="" onerror="this.remove()">
      <p class="foot-brand">${esc(s.festivalName)}</p>
      <p class="foot-sub">${esc(s.subtitle)}</p>
      <a href="#/login">로그인</a><span>·</span><a href="#/signup">참여자 회원가입</a><span>·</span><a href="#/op/login">부스 운영자</a><span>·</span><a href="#/admin/login">관리자</a>
    </footer>`;

  app.querySelectorAll('[data-dot]').forEach(d => d.onclick = () => { ui.heroIdx = Number(d.dataset.dot); slideTo(); });
  startSlides(photos.length);
}

// 활동 사진 자동 넘김
let slideTimer = null;
function slideTo() {
  const n = (Store.db.settings.heroPhotos || []).length;
  const track = app.querySelector('.slides');
  if (!track || !n) return;
  track.style.transform = `translateX(-${(ui.heroIdx % n) * 100}%)`;
  app.querySelectorAll('[data-dot]').forEach((d, i) => d.classList.toggle('on', i === ui.heroIdx % n));
}
function startSlides(n) {
  clearInterval(slideTimer);
  if (n > 1) slideTimer = setInterval(() => {
    if (!app.querySelector('.slides')) return clearInterval(slideTimer);
    ui.heroIdx++; slideTo();
  }, 4500);
}

function viewExplore(mode = 'floor') {
  const tabs = [['floor', '층별 안내'], ['theme', '테마별 안내'], ['club', '동아리별 안내']];
  const heads = { floor: ['FLOOR GUIDE', '층별안내'], theme: ['BY THEME', '테마별안내'], club: ['BY CLUB', '동아리별안내'] };
  let body = '';

  if (mode === 'floor') {
    const pub = Store.publicBooths();
    const list = pub.filter(b => (b.building || 'main') === ui.building && b.floor === ui.floor);
    const cnt = (bid, f) => pub.filter(b => (b.building || 'main') === bid && b.floor === f).length;
    body = `
      <div class="floor-guide">
        <div class="model-card">${buildingModel(ui.building, ui.floor)}
          <p class="model-hint">건물의 층을 누르면 그 층 안내도가 열려요</p>
        </div>
        <div class="floor-picker">
          <div class="seg">${Object.entries(BUILDINGS).map(([k, v]) => `<button class="${ui.building === k ? 'on' : ''}" data-bld="${k}">${v.label}</button>`).join('')}</div>
          <div class="floor-btns">${[...FLOOR_NUMS].reverse().map(f => {
            const n = cnt(ui.building, f);
            return `<button class="${ui.floor === f ? 'on' : ''}" data-floor="${f}"><b>${f}F</b><small>${n ? `부스 ${n}곳` : '부스 없음'}</small></button>`;
          }).join('')}</div>
        </div>
      </div>
      <div class="plan-head">
        <h3>${buildingLabel(ui.building)} ${ui.floor}층</h3>
        ${crowdLegend()}
      </div>
      ${floorPlan(ui.building, ui.floor)}
      <h2 class="sec-title">${buildingLabel(ui.building)} ${ui.floor}층 부스 <span class="muted">${list.length}</span></h2>
      ${boothList(list, '이 층에는 부스가 없어요. 위에서 다른 층을 눌러 보세요.')}`;
  } else if (mode === 'club') {
    body = `
      <input class="search" id="q" type="search" placeholder="동아리 이름이나 부스 이름으로 검색" value="${esc(ui.q)}">
      <div id="club-list"></div>`;
  } else {
    const list = Store.publicBooths().filter(b => ui.theme === 'all' || b.themes.includes(ui.theme));
    body = `
      <div class="chips">
        <button class="chip ${ui.theme === 'all' ? 'on' : ''}" data-theme="all">전체</button>
        ${THEMES.map(t => {
          const n = Store.publicBooths().filter(b => b.themes.includes(t.id)).length;
          return `<button class="chip ${ui.theme === t.id ? 'on' : ''}" data-theme="${t.id}">${t.emoji} ${t.label} <small>${n}</small></button>`;
        }).join('')}
      </div>
      ${boothList(list)}`;
  }

  app.innerHTML = `
    ${pageBanner('둘러보기', 'EXPLORE', [['둘러보기', '#/explore/floor'], [tabs.find(t => t[0] === mode)[1], '']])}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/explore/${k}" class="${mode === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <h2 class="page-head"><span class="eyebrow">${heads[mode][0]}</span>${heads[mode][1]}</h2>
    ${body}`;

  app.querySelectorAll('[data-bld]').forEach(btn => btn.onclick = () => { ui.building = btn.dataset.bld; viewExplore('floor'); });
  app.querySelectorAll('[data-floor]').forEach(btn => btn.onclick = () => { ui.floor = Number(btn.dataset.floor); viewExplore('floor'); });
  bindModel(app, (bid, f) => { ui.building = bid; ui.floor = f; viewExplore('floor'); });
  app.querySelectorAll('[data-theme]').forEach(btn => btn.onclick = () => { ui.theme = btn.dataset.theme; viewExplore('theme'); });

  if (mode === 'club') {
    const draw = () => {
      const q = ui.q.trim().toLowerCase();
      const list = Store.publicBooths()
        .filter(b => !q || (b.club + b.name).toLowerCase().includes(q))
        .sort((a, b) => a.club.localeCompare(b.club, 'ko'));
      document.getElementById('club-list').innerHTML = boothList(list, '검색 결과가 없어요.');
    };
    document.getElementById('q').oninput = (e) => { ui.q = e.target.value; draw(); };
    draw();
  }
}

function viewBooth(id) {
  const b = Store.booth(id);
  const sess = getSession();
  const canPreview = sess && (sess.role === 'admin' || sess.boothId === id);
  if (!b || (b.status !== 'approved' && !canPreview)) {
    app.innerHTML = '<p class="empty">아직 공개되지 않았거나 없는 부스입니다.<br><a href="#/">홈으로</a></p>';
    return;
  }
  const fav = getFavs().includes(id);
  const c = crowdOf(b);

  app.innerHTML = `
    <nav class="crumbs plain" aria-label="현재 위치"><a href="#/">홈</a><i>›</i><a href="#/explore/floor">둘러보기</a><i>›</i><span>${esc(b.name)}</span></nav>
    ${b.status !== 'approved' ? `<div class="preview-bar">👀 미리보기 (현재 상태: ${statusLabel(b.status)}) · <a href="#/op/edit">편집으로</a></div>` : ''}
    <article class="booth-detail">
      ${coverHTML(b, 'cover')}
      <div class="bd-head">
        <div class="badges">${typeBadge(b)}${b.themes.map(t => `<span class="badge">${themeLabel(t)}</span>`).join('')}</div>
        <h1>${esc(b.name)}</h1>
        <p class="muted">${esc(b.club)} · 📍 ${locText(b)}</p>
        <button class="fav-btn ${fav ? 'on' : ''}" id="fav">${fav ? '★ 찜함' : '☆ 찜하기'}</button>
      </div>

      <div class="crowd-box" style="--c:${c.color}">
        <div class="crowd-main"><span class="crowd-dot"></span><b>${c.label}</b></div>
        <div>${waitText(b)}</div>
        <div class="small muted">${crowdInfo(b)}</div>
      </div>
      ${b.shortNotice ? `<div class="notice urgent">📢 ${esc(b.shortNotice)}</div>` : ''}
      ${Store.notices(b.id).map(n => `<div class="notice">📌 ${esc(n.body)}</div>`).join('')}
      ${b.type !== 'reserve' ? '<div class="block" id="queue"></div>' : ''}

      ${b.blocks.map(renderBlock).join('')}

      <div class="block">
        <h3>위치 · ${locText(b)}</h3>
        ${floorPlan(b.building || 'main', b.floor, { small: true, all: canPreview, highlight: b.id })}
        <a class="link-more" href="#/explore/floor" data-goto-floor>층별 안내에서 보기 ${icon('chevron')}</a>
      </div>

      ${b.type === 'reserve' ? '<div class="block" id="reserve"></div>' : ''}
    </article>`;

  document.getElementById('fav').onclick = () => { const on = toggleFav(id); toast(on ? '찜 목록에 추가했어요' : '찜을 해제했어요'); viewBooth(id); };
  app.querySelector('[data-goto-floor]').onclick = () => { ui.building = b.building || 'main'; ui.floor = b.floor; };
  if (b.type === 'reserve') renderReserve(b);
  else renderQueue(b, document.getElementById('queue'));
}

// 혼잡도 상자 아래 한 줄: 무엇으로 자동 계산했는지
function crowdInfo(b) {
  if (b.stopped) return '운영자가 잠시 운영을 멈췄어요';
  if (b.type === 'reserve') return '다가오는 회차 예약률로 자동 계산돼요';
  const q = Store.queue(b.id);
  const parts = ['QR 줄서기 인원으로 자동 계산'];
  if (q.nowServing) parts.push(`지금 ${q.nowServing}번까지 호출`);
  if (q.lastCallAt && q.waiting) parts.push(`최근 호출 ${timeAgo(q.lastCallAt)}`);
  return (Store.isStale(b) ? '⚠️ 한동안 호출이 없었어요 · ' : '') + parts.join(' · ');
}

// =========================================================
// QR 줄서기 (관람객)
// =========================================================
// QR 코드를 찍으면 들어오는 주소 (#/qr/부스ID/무작위값). 유효하면 줄서기·예약 화면으로 보내고, 아니면 안내
function viewQR(id, token) {
  const b = Store.booth(id);
  if (b && b.status === 'approved' && Store.qrValid(id, token)) {
    location.replace('#/' + (b.type === 'reserve' ? 'booth/' : 'q/') + id);
    return;
  }
  app.innerHTML = `
    ${pageBanner('QR 코드', 'QR CODE', [['QR 코드', '']])}
    <div class="block center qr-invalid">
      <p class="big-ico">⚠️</p>
      <h2>사용할 수 없는 QR 코드예요</h2>
      <p class="muted">운영 본부에서 이 QR 코드를 삭제했거나 새로 만들었어요. 부스 입구의 새 QR 코드를 찍어 주세요.</p>
      <div class="row center-row">
        ${b && b.status === 'approved' ? `<a class="btn" href="#/booth/${b.id}">${b.emoji} ${esc(b.name)} 바로 가기</a>` : ''}
        <a class="btn ghost" href="#/explore/floor">부스 둘러보기</a>
      </div>
    </div>`;
}

// 부스 앞 QR 코드 → #/q/부스ID 로 들어오는 화면
function viewQueue(id) {
  const b = Store.booth(id);
  if (!b || b.status !== 'approved') {
    app.innerHTML = '<p class="empty">아직 공개되지 않았거나 없는 부스입니다.<br><a href="#/">홈으로</a></p>';
    return;
  }
  if (b.type === 'reserve') { location.hash = '#/booth/' + id; return; }
  app.innerHTML = `
    ${pageBanner('줄서기', 'QUEUE', [[b.name, '#/booth/' + b.id], ['줄서기', '']])}
    <div class="q-head">
      ${coverHTML(b, 'thumb')}
      <div>
        <div class="badges">${crowdBadge(b)}</div>
        <h1>${b.emoji} ${esc(b.name)}</h1>
        <p class="muted small">${esc(b.club)} · 📍 ${locText(b)}</p>
      </div>
    </div>
    ${b.shortNotice ? `<div class="notice urgent">📢 ${esc(b.shortNotice)}</div>` : ''}
    <div class="block" id="queue"></div>
    <p class="center"><a class="link-more" href="#/booth/${b.id}">부스 소개 보기 ${icon('chevron')}</a></p>`;
  renderQueue(b, document.getElementById('queue'));
}

function renderQueue(b, box) {
  if (!box) return;
  const s = Store.db.settings;
  const q = Store.queue(b.id);
  const sess = getSession();
  const student = sess && sess.role === 'student' ? sess : null;
  const mine = Store.myActiveTickets().find(t => t.boothId === b.id);
  const about = Store.REMOTE ? '약 ' : '';
  const stats = `
    <div class="q-stats">
      <div><small>지금 대기</small><b>${q.waiting || 0}<i>명</i></b></div>
      <div><small>예상 대기</small><b>${Store.waitMinutes(b)}<i>분</i></b></div>
      <div><small>호출 번호</small><b>${q.nowServing ? `${q.nowServing}<i>번</i>` : '-'}</b></div>
    </div>`;

  if (mine && mine.status === 'called') {
    const left = Math.max(0, s.callGraceMin - Math.floor((Store.now() - mine.calledAt) / 60000));
    box.innerHTML = `
      <div class="q-ticket called">
        <small>내 대기 번호</small><b class="q-no">${mine.no}</b>
        <p class="q-msg">🔔 지금 입장하세요!</p>
        <p class="small">부스 입구에서 이 화면을 보여 주세요. <b>${left}분</b> 안에 오지 않으면 자동으로 취소돼요.</p>
      </div>
      <button class="btn ghost full" data-tcancel="${mine.id}">못 가요 (번호표 취소)</button>`;
  } else if (mine) {
    const ahead = Store.aheadOf(mine);
    box.innerHTML = `
      <div class="q-ticket">
        <small>내 대기 번호</small><b class="q-no">${mine.no}</b>
        <p class="q-msg">${ahead ? `앞에 ${about}${ahead}명 · 예상 ${about}${ahead * b.minPerPerson}분` : '곧 차례예요! 부스 근처에서 기다려 주세요'}</p>
        <p class="small muted">차례가 되면 이 화면과 상단에 알림이 떠요. 다른 부스를 둘러보다 와도 돼요.</p>
      </div>
      ${stats}
      <div class="row"><a class="btn ghost grow" href="#/my">내 티켓</a><button class="btn ghost grow" data-tcancel="${mine.id}">줄서기 취소</button></div>`;
  } else if (b.stopped) {
    box.innerHTML = `<h3>🙋 QR 줄서기</h3>${stats}<p class="empty">지금은 운영이 중단되어 줄을 설 수 없어요.</p>`;
  } else if (q.open === false || !Store.hasQueue(b.id)) {
    box.innerHTML = `<h3>🙋 QR 줄서기</h3>${stats}<p class="empty">지금은 줄서기 접수를 받지 않아요.</p>`;
  } else if (s.requireLogin && !sess) {
    box.innerHTML = `
      <h3>🙋 QR 줄서기</h3>${stats}
      <div class="login-need">
        <p>줄을 서려면 참여자 로그인이 필요해요.</p>
        <p class="small muted">학번 + 이름으로 만든 <b>본인 계정</b>으로 로그인해 주세요. 계정이 없다면 1분이면 만들 수 있어요.</p>
        <div class="row"><a class="btn" href="#/login" data-next>로그인</a><a class="btn ghost" href="#/signup" data-next>회원가입</a></div>
      </div>`;
  } else {
    const last = (() => { try { return JSON.parse(localStorage.getItem('unjeong-me')) || {}; } catch (e) { return {}; } })();
    box.innerHTML = `
      <h3>🙋 QR 줄서기</h3>${stats}
      <form class="form" id="q-form">
        <label>이름<input name="name" required maxlength="10" value="${esc(student ? student.name : (last.name || ''))}" ${student ? 'readonly' : ''} placeholder="홍길동"></label>
        <label class="check"><input type="checkbox" required> 호출 확인용으로 이름 수집에 동의합니다. (행사 후 삭제)</label>
        <button class="btn full" type="submit">줄서기 · 번호표 받기</button>
        <p class="small muted">줄에 서 있지 않아도 돼요. 번호표를 받고 다른 부스를 둘러보다가 차례가 되면 와 주세요. 1인당 동시에 ${s.maxQueuePerPerson}곳까지 설 수 있어요.</p>
      </form>`;
  }

  box.querySelectorAll('[data-next]').forEach(a => a.onclick = () => { ui.next = '#/q/' + b.id; });
  box.querySelectorAll('[data-tcancel]').forEach(btn => btn.onclick = async () => {
    if (!confirm('번호표를 취소할까요? 다시 서면 맨 뒤 번호를 받아요.')) return;
    btn.disabled = true;
    if (await Store.cancelTicket(btn.dataset.tcancel)) toast('줄서기를 취소했어요');
    router();
  });
  const form = document.getElementById('q-form');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '번호표 받는 중…';
    const res = await Store.joinQueue(b.id, name);
    if (!res.ok) { btn.disabled = false; btn.textContent = '줄서기 · 번호표 받기'; return toast(res.msg, 'err'); }
    try {
      const me = JSON.parse(localStorage.getItem('unjeong-me') || '{}');
      localStorage.setItem('unjeong-me', JSON.stringify({ ...me, name }));
    } catch (err) {}
    askNotifyPermission();
    toast(`${res.ticket.no}번 번호표를 받았어요!`);
    router();
  };
}

// ---------- 호출 알림 ----------
// 내 번호표가 '호출됨'이 되면: 화면 위 알림 띠 + 진동 + 소리 + (허락했다면) 시스템 알림
const ALERTED_KEY = 'unjeong-alerted';
function askNotifyPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}
function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const c = new C();
    [0, 0.45].forEach(at => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.25, c.currentTime + at);
      o.start(c.currentTime + at); o.stop(c.currentTime + at + 0.3);
    });
  } catch (e) {}
}
function updateCallBar() {
  const bar = document.getElementById('callbar');
  if (!bar || !Store.db) return;
  const called = Store.myActiveTickets().filter(t => t.status === 'called');
  document.title = called.length ? `🔔 호출! ${Store.db.settings.festivalName}` : Store.db.settings.festivalName;
  if (!called.length) { bar.innerHTML = ''; bar.classList.remove('on'); return; }
  const grace = Store.db.settings.callGraceMin;
  bar.innerHTML = called.map(t => {
    const b = Store.booth(t.boothId);
    const left = Math.max(0, grace - Math.floor((Store.now() - t.calledAt) / 60000));
    return b ? `<a href="#/q/${b.id}">🔔 <b>${esc(b.name)}</b> ${t.no}번 호출! ${left}분 안에 ${locText(b)}로 와 주세요 ›</a>` : '';
  }).join('');
  bar.classList.add('on');

  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem(ALERTED_KEY)) || []; } catch (e) {}
  const fresh = called.filter(t => !seen.includes(t.id));
  if (!fresh.length) return;
  try { sessionStorage.setItem(ALERTED_KEY, JSON.stringify([...seen, ...fresh.map(t => t.id)])); } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 500]); } catch (e) {}
  beep();
  fresh.forEach(t => {
    const b = Store.booth(t.boothId);
    if (!b) return;
    toast(`🔔 ${b.name} ${t.no}번 차례예요!`);
    try {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
        new Notification(`${b.name} ${t.no}번 차례예요!`, { body: `${grace}분 안에 ${buildingLabel(b.building)} ${b.floor}층 ${b.room}로 와 주세요.`, icon: 'images/logo.png' });
    } catch (e) {}
  });
}

// ---------- QR 코드 ----------
// QR에 담기는 주소: #/qr/부스ID/무작위값 → 관리자가 QR을 삭제하거나 다시 만들면 예전 QR은 더 이상 열리지 않음
const appBase = () => location.origin + location.pathname;
const boothURL = (b) => appBase() + '#/' + (b.type === 'reserve' ? 'booth/' : 'q/') + b.id;   // 일반 링크 (주소 복사용)
const qrURL = (b) => (b.qrToken ? `${appBase()}#/qr/${b.id}/${b.qrToken}` : '');
function qrSVG(text) {
  if (!window.qrcode) return `<div class="qr-missing">QR 코드를 만들지 못했어요.<br>js/qrcode.js 파일이 있는지 확인하세요.</div>`;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function qrCard(b) {
  const url = qrURL(b);
  const live = b.type !== 'reserve';
  if (!url) return `
    <div class="qr-card empty-qr">
      <p class="qr-eyebrow">NO QR CODE</p>
      <h3>${b.emoji} ${esc(b.name)}</h3>
      <p class="qr-sub">${esc(b.club)} · ${locText(b)}</p>
      <div class="qr-img qr-none"><span>QR 없음</span></div>
      <p class="qr-guide">관리자가 아직 QR 코드를 만들지 않았거나 삭제했어요.</p>
    </div>`;
  return `
    <div class="qr-card">
      <p class="qr-eyebrow">${live ? 'SCAN TO QUEUE' : 'SCAN TO RESERVE'}</p>
      <h3>${b.emoji} ${esc(b.name)}</h3>
      <p class="qr-sub">${esc(b.club)} · ${locText(b)}</p>
      <div class="qr-img">${qrSVG(url)}</div>
      <p class="qr-guide">${live ? '휴대폰 카메라로 찍고 <b>번호표</b>를 받으세요.<br>차례가 되면 휴대폰으로 알려 드려요.' : '휴대폰 카메라로 찍고 <b>시간을 골라 예약</b>하세요.'}</p>
      <p class="qr-url">${esc(url)}</p>
    </div>`;
}
// 지금 주소가 다른 휴대폰에서 열 수 없는 주소인지 (QR을 인쇄하기 전에 확인)
function qrWarning() {
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  if (local) return '<p class="warn small">⚠️ 지금 주소(' + esc(location.host || 'file') + ')는 다른 휴대폰에서 열리지 않아요. 인터넷에 공개한 주소(GitHub Pages)에서 QR을 인쇄하세요.</p>';
  if (!Store.REMOTE) return '<p class="warn small">⚠️ 로컬 모드라서 QR로 들어온 휴대폰과 데이터가 공유되지 않아요. 실제 행사는 서버 모드(Firebase)로 운영하세요.</p>';
  return '';
}
// 화면의 한 부분만 인쇄
function printPart(html) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

function renderBlock(bl) {
  switch (bl.type) {
    case 'text':
      return `<div class="block">${bl.title ? `<h3>${esc(bl.title)}</h3>` : ''}<p>${nl2br(bl.body)}</p></div>`;
    case 'info': {
      const rows = (bl.body || '').split('\n').filter(Boolean).map(line => {
        const i = line.indexOf(':');
        return i > -1 ? `<tr><th>${esc(line.slice(0, i))}</th><td>${esc(line.slice(i + 1).trim())}</td></tr>` : `<tr><td colspan="2">${esc(line)}</td></tr>`;
      }).join('');
      return `<div class="block">${bl.title ? `<h3>${esc(bl.title)}</h3>` : ''}<table class="info">${rows}</table></div>`;
    }
    case 'notice':
      return `<div class="notice">⚠️ ${nl2br(bl.body)}</div>`;
    case 'image':
      return bl.src ? `<figure class="block img-block"><img src="${bl.src}" alt=""><figcaption>${esc(bl.caption)}</figcaption></figure>` : '';
    case 'link':
      return bl.url ? `<a class="block link-block" href="${esc(bl.url)}" target="_blank" rel="noopener">🔗 ${esc(bl.title || bl.url)}</a>` : '';
    default:
      return '';
  }
}

// ---------------------------------------------------------
// 예약하기: ① 날짜 → ② 시간대 → ③ 인원수 · 전화번호 · 이름
// ---------------------------------------------------------
const phoneInputFmt = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};
const dayTag = (d) => (d === Store.today() ? '오늘' : '');

function renderReserve(b) {
  const box = document.getElementById('reserve');
  if (!box) return;
  const s = Store.db.settings;
  const last = (() => { try { return JSON.parse(localStorage.getItem('unjeong-me')) || {}; } catch (e) { return {}; } })();
  const sess = getSession();
  const student = sess && sess.role === 'student' ? sess : null;
  const needLogin = s.requireLogin && !sess;

  // 방금 예약을 마친 경우: 예약 확인 카드
  if (ui.lastResv && ui.lastResv.boothId === b.id) {
    const r = ui.lastResv, sl = Store.slot(r.slotId);
    box.innerHTML = `
      <h3>🎉 예약 완료!</h3>
      <div class="ticket">
        ${codeBox(r.code)}
        <div>
          <p><b>${dateLabel(sl.date)} ${sl.start} ~ ${sl.end}</b> · ${r.party}명</p>
          <p class="small">${locText(b)} · ${esc(r.name)} · ${Store.fmtPhone(r.phone)}</p>
          <p class="small muted">부스 입구에서 예약번호를 보여주세요. 시작 후 ${s.graceMin}분이 지나면 자동 취소돼요.</p>
        </div>
      </div>
      <div class="row"><a class="btn" href="#/my">내 티켓 보기</a><button class="btn ghost" id="again">닫기</button></div>`;
    document.getElementById('again').onclick = () => { ui.lastResv = null; renderReserve(b); };
    return;
  }

  const dates = Store.datesOf(b.id);
  if (!dates.includes(ui.selDate)) ui.selDate = dates.find(d => Store.remaining(b.id, d) > 0) || dates[0] || null;
  const slots = ui.selDate ? Store.slotsOf(b.id, ui.selDate) : [];
  const sel = ui.selSlot && Store.slot(ui.selSlot);
  const selOk = sel && sel.boothId === b.id && sel.date === ui.selDate && Store.slotState(sel).ok;
  if (!selOk) ui.selSlot = null;
  const left = selOk ? Store.slotLeft(sel) : 0;
  const maxP = Math.min(s.maxParty, left);

  let formHTML = `<p class="small muted">원하는 시간을 눌러주세요. 1인당 최대 ${s.maxPerPerson}건, 1건에 최대 ${s.maxParty}명까지 예약할 수 있어요.</p>`;
  if (selOk && needLogin) {
    formHTML = `
      <div class="login-need">
        <p><b>${dateLabel(sel.date)} ${sel.start}</b> 회차를 예약하려면 참여자 로그인이 필요해요.</p>
        <p class="small muted">학번 + 이름으로 만든 <b>본인 계정</b>으로 로그인해 주세요. 계정이 없다면 1분이면 만들 수 있어요.</p>
        <div class="row"><a class="btn" href="#/login" data-next>로그인</a><a class="btn ghost" href="#/signup" data-next>회원가입</a></div>
      </div>`;
  } else if (selOk) {
    formHTML = `
      <form class="form" id="resv-form">
        <p class="step">③ 예약 정보 <span class="muted small">· ${dateLabel(sel.date)} ${sel.start}~${sel.end} · 남은 자리 ${left}명</span></p>
        <div class="grid2">
          <label>인원수
            <select name="party">${Array.from({ length: maxP }, (_, i) => `<option value="${i + 1}" ${i + 1 === Math.min(Number(last.party) || 1, maxP) ? 'selected' : ''}>${i + 1}명</option>`).join('')}</select>
          </label>
          <label>전화번호<input name="phone" type="tel" inputmode="tel" required maxlength="13" placeholder="010-1234-5678" value="${esc(phoneInputFmt(last.phone || ''))}" autocomplete="tel"></label>
        </div>
        <label>예약자 이름${student ? ` <span class="muted small">· ${esc(student.studentNo)} 계정</span>` : ''}
          <input name="name" required maxlength="10" value="${esc(student ? student.name : (last.name || ''))}" ${student ? 'readonly' : ''} placeholder="홍길동"></label>
        <label class="check"><input type="checkbox" required> 예약 확인용으로 이름·전화번호 수집에 동의합니다. (행사 후 삭제)</label>
        <button class="btn full" type="submit">예약하기</button>
      </form>`;
  }

  box.innerHTML = `
    <h3>🎟️ 예약하기</h3>
    ${b.stopped ? '<p class="warn">현재 운영이 중단되어 예약할 수 없어요.</p>' : b.resvOpen === false ? '<p class="warn">지금은 예약 접수를 받지 않아요.</p>' : ''}
    <p class="step">① 날짜</p>
    <div class="date-chips">${dates.map(d => `
      <button class="date-chip ${d === ui.selDate ? 'on' : ''}" data-date="${d}">
        <b>${dateLabel(d)}</b><small>${dayTag(d) ? dayTag(d) + ' · ' : ''}잔여 ${Store.remaining(b.id, d)}</small>
      </button>`).join('') || '<p class="empty">예약을 받는 날짜가 없어요.</p>'}</div>
    <p class="step">② 시간대</p>
    <div class="slot-grid">
      ${slots.map(x => {
        const st = Store.slotState(x);
        return `<button class="slot ${ui.selSlot === x.id ? 'on' : ''} ${st.ok && Store.slotLeft(x) <= 2 ? 'few' : ''}" data-slot="${x.id}" ${st.ok ? '' : 'disabled'}>
          <b>${x.start}</b><small>${st.label}</small></button>`;
      }).join('') || '<p class="empty">이 날짜에 등록된 시간이 없어요.</p>'}
    </div>
    ${formHTML}`;

  box.querySelectorAll('[data-next]').forEach(a => a.onclick = () => { ui.next = '#/booth/' + b.id; });
  box.querySelectorAll('[data-date]').forEach(btn => btn.onclick = () => { ui.selDate = btn.dataset.date; ui.selSlot = null; renderReserve(b); });
  box.querySelectorAll('[data-slot]').forEach(btn => btn.onclick = () => { ui.selSlot = btn.dataset.slot; renderReserve(b); });
  const form = document.getElementById('resv-form');
  if (!form) return;
  form.phone.oninput = (e) => { e.target.value = phoneInputFmt(e.target.value); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim(), phone = form.phone.value, party = Number(form.party.value);
    if (!/^01\d{8,9}$/.test(phone.replace(/\D/g, ''))) return toast('전화번호를 정확히 입력해 주세요. 예) 010-1234-5678', 'err');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '예약 중…';
    const res = await Store.reserve(ui.selSlot, { name, phone, party });
    btn.disabled = false; btn.textContent = '예약하기';
    if (!res.ok) return toast(res.msg, 'err');
    try { localStorage.setItem('unjeong-me', JSON.stringify({ ...last, name, phone: phone.replace(/\D/g, ''), party })); } catch (err) {}
    ui.selSlot = null;
    ui.lastResv = res.resv;
    toast('예약이 완료되었어요!');
    renderReserve(b);
  };
}

function viewMy() {
  const tks = Store.myTickets().filter(t => Store.booth(t.boothId));
  const liveT = tks.filter(t => t.status === 'waiting' || t.status === 'called')
    .sort((a, b) => (b.status === 'called') - (a.status === 'called') || a.createdAt - b.createdAt);
  const doneT = tks.filter(t => !liveT.includes(t));
  const tStatus = { waiting: ['대기 중', 'blue'], called: ['호출됨 · 지금 입장', 'green'], entered: ['입장 완료', 'green'], noshow: ['노쇼(자동취소)', 'gray'], cancelled: ['취소됨', 'gray'] };
  const tcard = (t) => {
    const b = Store.booth(t.boothId);
    const [label, color] = tStatus[t.status];
    const live = liveT.includes(t);
    const ahead = Store.aheadOf(t);
    const left = t.status === 'called' ? Math.max(0, Store.db.settings.callGraceMin - Math.floor((Store.now() - t.calledAt) / 60000)) : 0;
    const d = new Date(t.createdAt);
    return `
      <div class="ticket ${live ? '' : 'dim'} ${t.status === 'called' ? 'called' : ''}">
        ${live ? `<div class="code-box"><small>대기 번호</small><b>${t.no}</b></div>` : ''}
        <div class="grow">
          <span class="badge ${color}">${label}</span>
          <h3>${b.emoji} <a href="#/q/${b.id}">${esc(b.name)}</a></h3>
          <p>${t.status === 'waiting' ? `앞에 ${Store.REMOTE ? '약 ' : ''}${ahead}명 · 예상 ${ahead * b.minPerPerson}분 · ` : t.status === 'called' ? `<b>${left}분 안에 입장하세요</b> · ` : ''}${locText(b)}</p>
          <p class="small muted">${live ? '' : `번호 <b class="code-sm">${t.no}</b> · `}${esc(t.name)} · ${fromMin(d.getHours() * 60 + d.getMinutes())} 발급</p>
          ${live ? `<button class="btn ghost sm" data-tcancel="${t.id}">줄서기 취소</button>` : ''}
        </div>
      </div>`;
  };
  const list = Store.myResv();
  const active = list.filter(r => r.status === 'reserved');
  const done = list.filter(r => r.status !== 'reserved');
  const favs = getFavs().map(Store.booth).filter(b => b && b.status === 'approved');
  const statusMap = { reserved: ['예약됨', 'blue'], checked: ['입장 완료', 'green'], noshow: ['노쇼(자동취소)', 'gray'], cancelled: ['취소됨', 'gray'] };

  const card = (r) => {
    const s = Store.slot(r.slotId), b = Store.booth(r.boothId);
    const [label, color] = statusMap[r.status];
    return `
      <div class="ticket ${r.status !== 'reserved' ? 'dim' : ''}">
        ${r.status === 'reserved' ? codeBox(r.code) : ''}
        <div class="grow">
          <span class="badge ${color}">${label}</span>
          <h3>${b.emoji} <a href="#/booth/${b.id}">${esc(b.name)}</a></h3>
          <p><b>${dateLabel(s.date || Store.today())} ${s.start} ~ ${s.end}</b> · ${Store.partyOf(r)}명 · ${locText(b)}</p>
          <p class="small muted">${r.status === 'reserved' ? '' : `예약번호 <b class="code-sm">${r.code}</b> · `}${esc(r.name)}${r.phone ? ' · ' + Store.fmtPhone(r.phone) : ''}</p>
          ${r.status === 'reserved' ? `<button class="btn ghost sm" data-cancel="${r.id}">예약 취소</button>` : ''}
        </div>
      </div>`;
  };

  const sess = getSession();
  const acct = sess && sess.role === 'student'
    ? `<div class="acct-bar"><span>${icon('people')}<b>${esc(sess.name)}</b>님 · 학번 ${esc(sess.studentNo)}</span><span class="row"><a class="btn ghost sm" href="#/password">비밀번호 변경</a><button class="btn ghost sm" id="my-logout">로그아웃</button></span></div>`
    : sess ? ''
    : `<div class="acct-bar"><span>학번 + 이름 계정으로 로그인하면 <b>다른 기기에서도</b> 내 예약을 볼 수 있어요.</span><a class="btn sm" href="#/login" data-next>로그인</a></div>`;
  app.innerHTML = `
    ${pageBanner('내 티켓', 'MY TICKETS', [['내 티켓', '']])}
    ${acct}
    <p class="small muted">줄서기는 대기 번호, 예약은 예약번호 6자리를 부스 입구에서 보여주세요.${sess && sess.role === 'student' ? '' : ' 지금은 이 기기(브라우저)에 저장된 것만 보여요.'}</p>
    ${liveT.length ? `<h2 class="sec-title"><span class="eyebrow">QUEUE</span>줄서기 번호표</h2>${liveT.map(tcard).join('')}` : ''}
    ${active.length ? `<h2 class="sec-title"><span class="eyebrow">RESERVED</span>예약</h2>${active.map(card).join('')}` : ''}
    ${!liveT.length && !active.length ? '<p class="empty">줄서기 번호표나 예정된 예약이 없어요.<br>부스 앞 QR 코드를 찍거나 <a href="#/explore/floor">부스를 둘러보세요 →</a></p>' : ''}
    ${done.length || doneT.length ? `<h2 class="sec-title"><span class="eyebrow">HISTORY</span>지난 기록</h2>${doneT.map(tcard).join('')}${done.map(card).join('')}` : ''}
    <h2 class="sec-title"><span class="eyebrow">FAVORITES</span>찜한 부스</h2>
    ${boothList(favs, '부스 페이지에서 ☆를 눌러 찜해보세요.')}`;

  const lo = document.getElementById('my-logout');
  if (lo) lo.onclick = async () => { await Store.logout(); toast('로그아웃했어요'); viewMy(); renderTabbar('visitor', '/my'); };
  app.querySelectorAll('[data-next]').forEach(a => a.onclick = () => { ui.next = '#/my'; });
  app.querySelectorAll('[data-tcancel]').forEach(btn => btn.onclick = async () => {
    if (!confirm('번호표를 취소할까요? 다시 서면 맨 뒤 번호를 받아요.')) return;
    btn.disabled = true;
    if (await Store.cancelTicket(btn.dataset.tcancel)) toast('줄서기를 취소했어요');
    viewMy();
  });
  app.querySelectorAll('[data-cancel]').forEach(btn => btn.onclick = async () => {
    if (!confirm('예약을 취소할까요?')) return;
    btn.disabled = true;
    if (!(await Store.setResvStatus(btn.dataset.cancel, 'cancelled'))) return;
    toast('예약을 취소했어요');
    viewMy();
  });
}

// =========================================================
// 로그인 · 참여자 회원가입 (관리자 / 부스 운영자 / 참여자 공용)
// =========================================================
function viewLogin(tab = 'login', hint = '') {
  const s = getSession();
  const placeholder = hint === 'admin' ? '관리자 아이디' : hint === 'op' ? '운영자 아이디 (예: booth01)' : '학번+이름 (예: 20315홍길동)';
  const loginForm = `
    <form class="form" id="login-form">
      <label>아이디<input name="id" required autocomplete="username" placeholder="${placeholder}"></label>
      <label>비밀번호<input name="pw" type="password" required autocomplete="current-password"></label>
      <button class="btn full">로그인</button>
      <p class="small muted">참여자는 <b>학번+이름</b>, 부스 운영자·관리자는 운영 본부에서 받은 아이디로 로그인하세요.</p>
    </form>`;
  const signupForm = `
    <form class="form" id="signup-form" novalidate>
      <div class="warn-box" role="note">
        <b>⚠️ 반드시 "본인"의 학번과 이름으로만 가입하세요.</b>
        <p>다른 사람의 학번·이름으로 가입하거나 예약하는 것은 <b>명의 도용</b>입니다. 적발되면 계정과 예약이 모두 삭제되고, 학교 규정에 따라 조치될 수 있습니다.</p>
      </div>
      <div class="grid2">
        <label>학번 (5자리)<input name="no" required inputmode="numeric" maxlength="5" placeholder="20315" autocomplete="off"></label>
        <label>이름<input name="name" required maxlength="5" placeholder="홍길동" autocomplete="off"></label>
      </div>
      <p class="id-preview">내 아이디 <b id="id-prev">학번+이름</b> <span id="id-dup"></span></p>
      <div class="grid2">
        <label>비밀번호 (4자 이상)<input name="pw" type="password" required minlength="4" autocomplete="new-password"></label>
        <label>비밀번호 확인<input name="pw2" type="password" required minlength="4" autocomplete="new-password"></label>
      </div>
      <label class="check"><input type="checkbox" name="self" required> 본인의 학번과 이름으로 가입하며, 명의 도용 시 불이익을 받을 수 있음을 확인합니다.</label>
      <label class="check"><input type="checkbox" name="agree" required> 예약 확인을 위해 학번·이름을 수집하는 데 동의합니다. (행사 후 삭제)</label>
      <button class="btn full">가입하고 로그인</button>
    </form>`;

  app.innerHTML = `
    ${pageBanner(tab === 'signup' ? '회원가입' : '로그인', 'MEMBERSHIP', [[tab === 'signup' ? '회원가입' : '로그인', '']])}
    <div class="login">
      ${s ? `<p class="acct-bar"><span>현재 <b>${esc(s.name || s.id)}</b> (${({ admin: '관리자', op: '부스 운영자', student: '참여자' })[s.role]})로 로그인되어 있어요.</span><button class="btn ghost sm" id="lo">로그아웃</button></p>` : ''}
      <div class="tabs slim">
        <a href="#/login" class="${tab === 'login' ? 'on' : ''}">로그인</a>
        <a href="#/signup" class="${tab === 'signup' ? 'on' : ''}">참여자 회원가입</a>
      </div>
      ${tab === 'signup' ? signupForm : loginForm}
      <p class="login-links"><a href="#/">← 홈으로</a></p>
    </div>`;

  const lo = document.getElementById('lo');
  if (lo) lo.onclick = async () => { await Store.logout(); toast('로그아웃했어요'); router(); };
  const afterLogin = (acc) => {
    ui.draft = null;
    const next = ui.next; ui.next = null;
    location.hash = acc.role === 'admin' ? '#/admin' : acc.role === 'op' ? '#/op' : (next || '#/my');
  };

  const lf = document.getElementById('login-form');
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault();
    const btn = lf.querySelector('button');
    btn.disabled = true;
    const acc = await Store.login(lf.id.value, lf.pw.value);
    btn.disabled = false;
    if (!acc) return toast('아이디 또는 비밀번호가 맞지 않아요', 'err');
    toast(acc.role === 'student' ? `${acc.name}님, 환영해요!` : '로그인했어요');
    afterLogin(acc);
  };

  const sf = document.getElementById('signup-form');
  if (sf) {
    const prev = document.getElementById('id-prev'), dup = document.getElementById('id-dup');
    const check = () => {
      const no = sf.no.value.trim(), name = sf.name.value.trim();
      prev.textContent = (no || '학번') + (name || '이름');
      dup.textContent = ''; dup.className = '';
      // 로컬 모드는 바로 중복 확인 (서버 모드는 가입 버튼을 누를 때 확인)
      if (!Store.REMOTE && /^\d{5}$/.test(no)) {
        if (Store.accounts().some(a => a.studentNo === no)) { dup.textContent = '이미 가입된 학번'; dup.className = 'bad'; }
        else if (/^[가-힣]{2,5}$/.test(name)) { dup.textContent = '사용 가능'; dup.className = 'ok'; }
      }
    };
    sf.oninput = check;
    sf.onsubmit = async (e) => {
      e.preventDefault();
      if (!/^\d{5}$/.test(sf.no.value.trim())) return toast('학번은 숫자 5자리로 입력하세요. 예) 20315', 'err');
      if (!/^[가-힣]{2,5}$/.test(sf.name.value.trim())) return toast('이름은 한글 2~5자로 입력하세요.', 'err');
      if (sf.pw.value.length < 4) return toast('비밀번호는 4자 이상으로 정하세요.', 'err');
      if (sf.pw.value !== sf.pw2.value) return toast('비밀번호 확인이 일치하지 않아요.', 'err');
      if (!sf.self.checked) return toast('본인 확인 항목에 체크해 주세요.', 'err');
      if (!sf.agree.checked) return toast('개인정보 수집에 동의해 주세요.', 'err');
      const btn = sf.querySelector('button');
      btn.disabled = true; btn.textContent = '가입 중…';
      try {
        const acc = await Store.signupStudent(sf.no.value, sf.name.value, sf.pw.value);
        toast(`가입 완료! 아이디는 ${acc.id} 입니다.`);
        afterLogin(acc);
      } catch (err) {
        btn.disabled = false; btn.textContent = '가입하고 로그인';
        toast(err.message, 'err');
      }
    };
  }
}

// =========================================================
// 내 비밀번호 바꾸기 (#/password) — 관리자 · 운영자 · 참여자 공용
// =========================================================
function viewPassword() {
  const s = getSession();
  if (!s) { ui.next = '#/password'; location.hash = '#/login'; return; }
  const roleTxt = { admin: '관리자', op: '부스 운영자', student: '참여자' }[s.role];
  const back = s.role === 'admin' ? '#/admin/settings' : s.role === 'op' ? '#/op' : '#/my';
  app.innerHTML = `
    ${pageBanner('비밀번호 변경', 'PASSWORD', [['비밀번호 변경', '']])}
    <div class="login">
      <p class="acct-bar"><span><b>${esc(s.name || s.id)}</b> (${roleTxt}) 계정의 비밀번호를 바꿔요.</span></p>
      <form class="form" id="pw-form">
        <label>현재 비밀번호<input name="old" type="password" required autocomplete="current-password"></label>
        <label>새 비밀번호 (4자 이상)<input name="pw" type="password" required minlength="4" autocomplete="new-password"></label>
        <label>새 비밀번호 확인<input name="pw2" type="password" required minlength="4" autocomplete="new-password"></label>
        <button class="btn full">비밀번호 바꾸기</button>
        <p class="small muted">아이디(${esc(s.id)})는 그대로이고 비밀번호만 바뀌어요. 다음 로그인부터 새 비밀번호를 쓰세요.${s.role === 'op' ? ' 바꾼 비밀번호는 관리자 화면의 계정 목록에는 보이지 않으니 따로 기억해 두세요.' : ''}</p>
      </form>
      <p class="login-links"><a href="${back}">← 돌아가기</a></p>
    </div>`;
  const f = document.getElementById('pw-form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.pw.value !== f.pw2.value) return toast('새 비밀번호 확인이 일치하지 않아요.', 'err');
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = '바꾸는 중…';
    try {
      await Store.changePassword(f.old.value, f.pw.value);
      toast('비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.');
      location.hash = back;
    } catch (err) {
      btn.disabled = false; btn.textContent = '비밀번호 바꾸기';
      toast(err.message, 'err');
    }
  };
}

async function logout() { await Store.logout(); ui.draft = null; location.hash = '#/'; }

const statusLabel = (s) => ({ draft: '작성 중', pending: '승인 대기', approved: '공개 중', hidden: '비공개' }[s]);

// =========================================================
// 부스 운영자 모드
// =========================================================
function viewOp(tab) {
  const sess = getSession();
  if (!sess || sess.role !== 'op') { location.hash = '#/op/login'; return; }
  const b = Store.booth(sess.boothId);
  if (!b) { logout(); return; }
  tab = tab || (b.status === 'draft' ? 'edit' : 'crowd');
  if (tab === 'resv' && b.type !== 'reserve') tab = 'crowd';

  app.innerHTML = `
    ${pageBanner('부스 운영', 'BOOTH OPERATOR', [['부스 운영', '']])}
    <div class="op-head">
      <div>
        <p class="small muted">${esc(sess.id)} · ${esc(b.club)}</p>
        <h1>${b.emoji} ${esc(b.name)}</h1>
        <span class="badge status-${b.status}">${statusLabel(b.status)}</span> ${typeBadge(b)}
      </div>
      <div class="row">
        <a class="btn ghost sm" href="#/booth/${b.id}">미리보기</a>
        <a class="btn ghost sm" href="#/password">비밀번호 변경</a>
        <button class="btn ghost sm" id="logout">로그아웃</button>
      </div>
    </div>
    <div class="tabs">
      <a href="#/op/edit" class="${tab === 'edit' ? 'on' : ''}">페이지 편집</a>
      <a href="#/op/crowd" class="${tab === 'crowd' ? 'on' : ''}">${b.type === 'reserve' ? '현황 · QR' : 'QR 줄서기'}</a>
      ${b.type === 'reserve' ? `<a href="#/op/resv" class="${tab === 'resv' ? 'on' : ''}">예약 관리</a>` : ''}
    </div>
    <div id="op-body"></div>`;
  document.getElementById('logout').onclick = logout;

  const body = document.getElementById('op-body');
  if (tab === 'edit') opEdit(body, b);
  else if (tab === 'crowd') (b.type === 'reserve' ? opStatus : opQueue)(body, b);
  else opResv(body, b);
}

// ----- 페이지 편집 (블록 조립식) -----
const BLOCK_TYPES = {
  text:   { label: '📝 글', make: () => ({ type: 'text', title: '', body: '' }) },
  info:   { label: '📋 정보표', make: () => ({ type: 'info', title: '운영 정보', body: '운영 시간: 10:00 ~ 15:00\n준비물: 없음' }) },
  notice: { label: '⚠️ 주의사항', make: () => ({ type: 'notice', body: '' }) },
  image:  { label: '🖼️ 사진', make: () => ({ type: 'image', src: '', caption: '' }) },
  link:   { label: '🔗 링크', make: () => ({ type: 'link', title: '인스타그램', url: '' }) },
};

function opEdit(root, b) {
  if (!ui.draft || ui.draft.id !== b.id) ui.draft = JSON.parse(JSON.stringify(b));
  const d = ui.draft;
  if (!d.building) d.building = 'main';
  const taken = new Set(Store.booths().filter(x => x.id !== b.id).map(roomKey));
  const isTaken = (r) => taken.has(`${d.building}|${d.floor}|${r}`);
  const hasResv = Store.resvOfBooth(b.id).some(r => r.status === 'reserved');

  const blockEditor = (bl, i) => {
    let fields = '';
    if (bl.type === 'text') fields = `<input data-b="${i}" data-k="title" value="${esc(bl.title)}" placeholder="소제목 (선택)"><textarea data-b="${i}" data-k="body" rows="4" placeholder="내용">${esc(bl.body)}</textarea>`;
    if (bl.type === 'info') fields = `<input data-b="${i}" data-k="title" value="${esc(bl.title)}" placeholder="제목"><textarea data-b="${i}" data-k="body" rows="4" placeholder="항목: 내용 (한 줄에 하나)">${esc(bl.body)}</textarea><small class="muted">"항목: 내용" 형식으로 한 줄씩 쓰면 표로 보여요.</small>`;
    if (bl.type === 'notice') fields = `<textarea data-b="${i}" data-k="body" rows="2" placeholder="주의사항">${esc(bl.body)}</textarea>`;
    if (bl.type === 'image') fields = `${bl.src ? `<img class="mini-img" src="${bl.src}" alt="">` : ''}<input type="file" accept="image/*" data-b="${i}" data-img="1"><input data-b="${i}" data-k="caption" value="${esc(bl.caption)}" placeholder="사진 설명">`;
    if (bl.type === 'link') fields = `<input data-b="${i}" data-k="title" value="${esc(bl.title)}" placeholder="버튼 이름"><input data-b="${i}" data-k="url" value="${esc(bl.url)}" placeholder="https://">`;
    return `
      <div class="blk-edit">
        <div class="blk-bar"><b>${BLOCK_TYPES[bl.type].label}</b>
          <span><button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-move="${i}" data-dir="1" ${i === d.blocks.length - 1 ? 'disabled' : ''}>▼</button><button type="button" data-del="${i}">🗑</button></span>
        </div>
        ${fields}
      </div>`;
  };

  root.innerHTML = `
    <form class="form editor" id="edit-form">
      <fieldset>
        <legend>1. 부스 유형</legend>
        <div class="type-pick">
          <label class="${d.type === 'reserve' ? 'on' : ''}"><input type="radio" name="type" value="reserve" ${d.type === 'reserve' ? 'checked' : ''}><b>🎟️ 예약 부스</b><small>홍보 페이지 + 예약 페이지</small></label>
          <label class="${d.type === 'live' ? 'on' : ''}"><input type="radio" name="type" value="live" ${d.type === 'live' ? 'checked' : ''}><b>🚶 당일 부스</b><small>홍보 페이지 + 혼잡도 페이지</small></label>
        </div>
        ${hasResv && d.type === 'live' ? '<p class="warn">⚠️ 아직 진행 전인 예약이 있어요. 당일 부스로 바꾸면 예약자에게 따로 안내해야 합니다.</p>' : ''}
      </fieldset>

      <fieldset>
        <legend>2. 기본 정보</legend>
        <div class="grid2">
          <label>부스 이름<input data-f="name" value="${esc(d.name)}" maxlength="30" required></label>
          <label>동아리 이름<input data-f="club" value="${esc(d.club)}" maxlength="20" required></label>
          <label>대표 이모지<input data-f="emoji" value="${esc(d.emoji)}" maxlength="4"></label>
          <label>대표 색상<input type="color" data-f="color" value="${esc(d.color)}"></label>
        </div>
        <label>한 줄 소개<input data-f="summary" value="${esc(d.summary)}" maxlength="60" placeholder="목록에 보이는 짧은 소개"></label>
        <label>대표 사진 ${d.cover ? '<button type="button" class="link-btn" id="rm-cover">삭제</button>' : ''}
          <input type="file" accept="image/*" id="cover"></label>
        ${coverHTML(d, 'cover small')}
      </fieldset>

      <fieldset>
        <legend>3. 위치</legend>
        <div class="grid2">
          <label>건물<select id="bld">${Object.entries(BUILDINGS).map(([k, v]) => `<option value="${k}" ${d.building === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          <label>층<select id="floor">${FLOOR_NUMS.map(f => `<option value="${f}" ${d.floor === f ? 'selected' : ''}>${f}층</option>`).join('')}</select></label>
        </div>
        <label>교실<select id="room">${bookableRooms(d.building, d.floor).map(r => `<option value="${esc(r)}" ${d.room === r ? 'selected' : ''} ${isTaken(r) ? 'disabled' : ''}>${esc(r)}${isTaken(r) ? ' (사용 중)' : ''}</option>`).join('')}</select></label>
      </fieldset>

      <fieldset>
        <legend>4. 테마 (여러 개 선택 가능)</legend>
        <div class="chips">${THEMES.map(t => `<label class="chip ${d.themes.includes(t.id) ? 'on' : ''}"><input type="checkbox" data-theme-pick="${t.id}" ${d.themes.includes(t.id) ? 'checked' : ''}>${t.emoji} ${t.label}</label>`).join('')}</div>
      </fieldset>

      <fieldset>
        <legend>5. 홍보 페이지 내용</legend>
        <div id="blocks">${d.blocks.map(blockEditor).join('') || '<p class="small muted">아래 버튼으로 내용을 추가하세요.</p>'}</div>
        <div class="row wrap">${Object.entries(BLOCK_TYPES).map(([k, v]) => `<button type="button" class="btn ghost sm" data-add="${k}">+ ${v.label}</button>`).join('')}</div>
      </fieldset>

      <div class="sticky-save">
        <button type="button" class="btn ghost" id="revert">되돌리기</button>
        <button class="btn">${b.status === 'approved' ? '저장 (바로 반영)' : b.status === 'pending' ? '저장 (승인 대기 중)' : '저장 후 승인 요청'}</button>
      </div>
    </form>`;

  const rerender = () => opEdit(root, b);

  // 입력값을 초안(draft)에 바로 반영
  root.oninput = (e) => {
    const el = e.target;
    if (el.dataset.f) d[el.dataset.f] = el.value;
    if (el.dataset.b !== undefined && el.dataset.k) d.blocks[el.dataset.b][el.dataset.k] = el.value;
  };
  root.onchange = async (e) => {
    const el = e.target;
    if (el.name === 'type') { d.type = el.value; return rerender(); }
    if (el.id === 'bld' || el.id === 'floor') {
      if (el.id === 'bld') d.building = el.value; else d.floor = Number(el.value);
      const rooms = bookableRooms(d.building, d.floor);
      d.room = rooms.find(r => !isTaken(r)) || rooms[0];
      return rerender();
    }
    if (el.id === 'room') d.room = el.value;
    if (el.dataset.themePick) {
      const t = el.dataset.themePick;
      d.themes = el.checked ? [...d.themes, t] : d.themes.filter(x => x !== t);
      return rerender();
    }
    if (el.id === 'cover' && el.files[0]) { d.cover = await readImage(el.files[0]); return rerender(); }
    if (el.dataset.img && el.files[0]) { d.blocks[el.dataset.b].src = await readImage(el.files[0]); return rerender(); }
  };
  root.onclick = (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.add) { d.blocks.push(BLOCK_TYPES[el.dataset.add].make()); rerender(); }
    else if (el.dataset.del !== undefined) { if (confirm('이 블록을 삭제할까요?')) { d.blocks.splice(Number(el.dataset.del), 1); rerender(); } }
    else if (el.dataset.move !== undefined) {
      const i = Number(el.dataset.move), j = i + Number(el.dataset.dir);
      [d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]];
      rerender();
    }
    else if (el.id === 'rm-cover') { d.cover = ''; rerender(); }
    else if (el.id === 'revert') { if (confirm('저장하지 않은 변경을 버릴까요?')) { ui.draft = null; rerender(); } }
  };
  document.getElementById('edit-form').onsubmit = (e) => {
    e.preventDefault();
    if (!d.name.trim() || !d.club.trim()) return toast('부스 이름과 동아리 이름을 입력하세요', 'err');
    if (Store.booths().some(x => x.id !== b.id && roomKey(x) === roomKey(d))) return toast('이미 다른 부스가 사용 중인 교실이에요', 'err');
    const patch = {
      name: d.name.trim(), club: d.club.trim(), emoji: d.emoji || '⭐', color: d.color, summary: d.summary,
      cover: d.cover, type: d.type, building: d.building, floor: d.floor, room: d.room, themes: d.themes, blocks: d.blocks,
    };
    if (JSON.stringify(patch).length > 900000) return toast('사진 용량이 너무 커요. 사진 블록을 줄여주세요.', 'err');
    if (b.status === 'draft' || b.status === 'hidden') patch.status = 'pending';
    if (d.type === 'reserve' && !b.slotConfig) {
      patch.slotConfig = { start: '10:00', end: '15:00', interval: 20, capacity: 6 };
    }
    Store.updateBooth(b.id, patch);
    if (d.type === 'reserve' && Store.slotsOf(b.id).length === 0) Store.generateSlots(b.id, patch.slotConfig || b.slotConfig);
    ui.draft = null;
    toast(patch.status === 'pending' ? '저장했어요. 관리자 승인 후 공개됩니다.' : '저장했어요!');
    viewOp('edit');
  };
}

// ----- QR 줄서기 운영 (당일 부스) -----
//   혼잡도는 대기 인원으로 자동 계산되므로, 운영자는 "호출"과 "입장 확인"만 하면 됩니다.
function opQueue(root, b) {
  if (!Store.hasQueue(b.id)) {
    root.innerHTML = '<p class="empty">줄서기를 준비하는 중…</p>';
    Store.ensureQueue(b.id).then(() => viewOp('crowd'));
    return;
  }
  const s = Store.db.settings;
  const q = Store.queue(b.id);
  const all = Store.ticketsOf(b.id);
  const waiting = all.filter(t => t.status === 'waiting');
  const called = all.filter(t => t.status === 'called').sort((x, y) => x.calledAt - y.calledAt);
  const cnt = (st) => all.filter(t => t.status === st).length;
  const c = crowdOf(b);
  const graceMs = s.callGraceMin * 60000;
  const walkin = (t) => (t.source === 'walkin' ? ' <span class="badge gray">현장</span>' : '');

  root.innerHTML = `
    <div class="stats">
      <div class="stat hl"><small>지금 대기</small><b>${waiting.length}</b><small>예상 ${Store.waitMinutes(b)}분</small></div>
      <div class="stat"><small>혼잡도 (자동)</small><b style="color:${c.color}">${c.label}</b><small>${s.queueNormal}명↑ 보통 · ${s.queueBusy}명↑ 혼잡</small></div>
      <div class="stat"><small>호출 번호</small><b>${q.nowServing || '-'}</b><small>다음 ${waiting[0] ? waiting[0].no + '번' : '없음'}</small></div>
      <div class="stat"><small>오늘 입장</small><b>${cnt('entered')}</b><small>노쇼 ${cnt('noshow')} · 취소 ${cnt('cancelled')}</small></div>
    </div>
    ${Store.isStale(b) ? `<p class="warn">⚠️ 대기자가 있는데 ${timeAgo(q.lastCallAt)} 이후로 호출이 없어요. 관리자 화면에도 경고가 떠요.</p>` : ''}
    ${q.open === false ? '<p class="warn">⛔ 줄서기 접수를 마감한 상태예요. 새 손님은 번호표를 받을 수 없어요.</p>' : ''}

    <div class="panel call-panel">
      <h2>📣 손님 호출</h2>
      <button class="btn call-btn" data-call="1" ${waiting.length ? '' : 'disabled'}>
        다음 손님 호출${waiting[0] ? ` · <b>${waiting[0].no}번</b> ${esc(waiting[0].name)}` : ''}
      </button>
      <div class="row call-many">
        <input type="number" id="call-n" min="2" max="30" value="${ui.callN || 4}">
        <button class="btn ghost" data-call="n" ${waiting.length > 1 ? '' : 'disabled'}>명 한꺼번에 호출 (단체 체험용)</button>
      </div>
      <p class="small muted">호출하면 손님 휴대폰에 알림이 떠요. ${s.callGraceMin}분 안에 오지 않으면 자동으로 노쇼 처리돼요.</p>
    </div>

    <div class="panel">
      <h2>🔔 호출한 손님 <span class="badge">${called.length}</span></h2>
      ${called.length ? `<table class="tbl qtbl">
        <tr><th>번호</th><th>이름 · 호출</th><th></th></tr>
        ${called.map(t => `<tr class="${Store.now() - t.calledAt > graceMs * 0.6 ? 'late' : ''}">
          <td><b class="tno">${t.no}</b></td><td>${esc(t.name)}${walkin(t)}<br><small class="muted">${timeAgo(t.calledAt)} 호출</small></td>
          <td class="acts"><button class="btn sm" data-t="${t.id}" data-st="entered">입장</button>
            <button class="btn ghost sm" data-t="${t.id}" data-st="called">재호출</button>
            <button class="btn ghost sm" data-t="${t.id}" data-st="noshow">노쇼</button></td>
        </tr>`).join('')}
      </table>` : '<p class="small muted">호출한 손님이 없어요. 자리가 나면 위의 호출 버튼을 누르세요.</p>'}
    </div>

    <div class="panel">
      <h2>⏳ 대기 명단 <span class="badge">${waiting.length}</span></h2>
      ${waiting.length ? `<table class="tbl qtbl">
        <tr><th>번호</th><th>이름 · 발급</th><th></th></tr>
        ${waiting.map(t => `<tr>
          <td><b class="tno">${t.no}</b></td><td>${esc(t.name)}${walkin(t)}<br><small class="muted">${timeAgo(t.createdAt)} 발급</small></td>
          <td class="acts"><button class="btn ghost sm" data-t="${t.id}" data-st="cancelled">빼기</button></td>
        </tr>`).join('')}
      </table>` : '<p class="small muted">기다리는 손님이 없어요.</p>'}
    </div>

    <div class="panel">
      <h2>✍️ 현장 등록</h2>
      <p class="small muted">휴대폰이 없거나 QR을 찍기 어려운 손님은 여기서 번호표를 대신 받아 주세요.</p>
      <form class="row" id="walkin">
        <input class="grow" name="name" maxlength="10" placeholder="손님 이름" required autocomplete="off">
        <button class="btn">번호 발급</button>
      </form>
    </div>

    <div class="panel">
      <h2>⚙️ 줄 운영</h2>
      <div class="row wrap">
        <button class="btn ${q.open === false ? '' : 'ghost'}" id="q-open">${q.open === false ? '줄서기 접수 다시 열기' : '줄서기 접수 마감'}</button>
        <button class="btn ghost" id="stop">${b.stopped ? '⚫ 운영 재개' : '⚫ 일시 중단'}</button>
      </div>
      <label class="inline">1명(팀)당 처리 시간 <input type="number" id="mpp" min="1" max="60" value="${b.minPerPerson}"> 분</label>
      <p class="small muted">관람객에게 보이는 예상 대기 = 대기 인원 × 처리 시간. 혼잡도는 대기 인원으로 자동으로 바뀌어요.</p>
    </div>

    ${shortNoticePanel(b)}
    ${qrPanel(b)}`;

  const done = (msg, type) => { if (msg) toast(msg, type); viewOp('crowd'); };
  root.querySelectorAll('[data-call]').forEach(btn => btn.onclick = async () => {
    let n = 1;
    if (btn.dataset.call === 'n') {
      n = Math.max(2, Math.min(30, Number(document.getElementById('call-n').value) || 2));
      ui.callN = n;
    }
    btn.disabled = true;
    const res = await Store.callNext(b.id, n);
    if (!res.ok) return done(res.msg, 'err');
    done(`📣 ${res.called.map(t => t.no + '번').join(', ')} 호출했어요`);
  });
  root.querySelectorAll('[data-t]').forEach(btn => btn.onclick = async () => {
    const t = Store.ticket(btn.dataset.t), st = btn.dataset.st;
    if (st === 'cancelled' && !confirm(`${t.no}번 ${t.name}님을 대기 명단에서 뺄까요?`)) return;
    btn.disabled = true;
    if (!(await Store.setTicketStatus(t.id, st))) return;
    done({ entered: `${t.no}번 입장 처리했어요`, called: `${t.no}번 다시 호출했어요`, noshow: `${t.no}번 노쇼 처리했어요`, cancelled: `${t.no}번을 뺐어요` }[st]);
  });
  document.getElementById('walkin').onsubmit = async (e) => {
    e.preventDefault();
    const res = await Store.joinQueue(b.id, e.target.name.value, 'walkin');
    if (!res.ok) return toast(res.msg, 'err');
    alert(`${res.ticket.name}님 번호는 ${res.ticket.no}번입니다.\n\n손님께 번호를 알려 주시고, 호출하면 부스 앞에서 불러 주세요.`);
    done();
  };
  document.getElementById('q-open').onclick = () => {
    const open = q.open === false;
    if (!open && !confirm('줄서기 접수를 마감할까요? 이미 받은 번호표는 그대로 유지돼요.')) return;
    Store.setQueueOpen(b.id, open);
    done(open ? '줄서기 접수를 다시 열었어요' : '줄서기 접수를 마감했어요');
  };
  document.getElementById('stop').onclick = () => { Store.setCrowd(b.id, { stopped: !b.stopped }); done(b.stopped ? '운영을 재개했어요' : '운영을 잠시 멈췄어요'); };
  document.getElementById('mpp').onchange = (e) => { Store.setCrowd(b.id, { minPerPerson: Math.max(1, Number(e.target.value) || 1) }); done('처리 시간을 바꿨어요'); };
  bindShortNotice(root, b);
  bindQrPanel(root, b);
}

// ----- 예약 부스의 현황 탭: 혼잡도는 예약률로 자동, 운영자는 중단·공지·QR만 -----
function opStatus(root, b) {
  const c = crowdOf(b);
  root.innerHTML = `
    <div class="panel">
      <h2>지금 우리 부스 상황</h2>
      <div class="crowd-box" style="--c:${c.color}">
        <div class="crowd-main"><span class="crowd-dot"></span><b>${c.label}</b></div>
        <div>${waitText(b)}</div>
        <div class="small muted">다가오는 3회차의 예약률로 자동 계산돼요 (50%↑ 보통 · 90%↑ 혼잡).</div>
      </div>
      <div class="row"><button class="btn ghost" id="stop">${b.stopped ? '⚫ 운영 재개' : '⚫ 일시 중단'}</button></div>
    </div>
    ${shortNoticePanel(b)}
    ${qrPanel(b)}`;
  document.getElementById('stop').onclick = () => { Store.setCrowd(b.id, { stopped: !b.stopped }); toast(b.stopped ? '운영을 재개했어요' : '운영을 잠시 멈췄어요'); viewOp('crowd'); };
  bindShortNotice(root, b);
  bindQrPanel(root, b);
}

function shortNoticePanel(b) {
  return `
    <div class="panel">
      <h2>부스 한 줄 공지</h2>
      <form class="row" id="sn-form">
        <input class="grow" name="sn" value="${esc(b.shortNotice)}" maxlength="50" placeholder="예) 재료 소진! 14시에 다시 열어요">
        <button class="btn sm">게시</button>
      </form>
    </div>`;
}
function bindShortNotice(root, b) {
  document.getElementById('sn-form').onsubmit = (e) => { e.preventDefault(); Store.updateBooth(b.id, { shortNotice: e.target.sn.value.trim() }); toast('공지를 게시했어요'); viewOp('crowd'); };
}
function qrPanel(b) {
  return `
    <div class="panel">
      <h2>🔳 부스 QR 코드</h2>
      <p class="small muted">${b.type === 'reserve' ? '찍으면 우리 부스 예약 화면이 열려요.' : '찍으면 바로 줄서기 화면이 열려요. 부스 입구와 줄 서는 곳에 붙여 두세요.'}</p>
      ${b.qrToken ? qrWarning() : '<p class="warn small">QR 코드가 없어요. 운영 본부(관리자)에게 만들어 달라고 요청하세요.</p>'}
      <div class="qr-one">${qrCard(b)}</div>
      <div class="row"><button class="btn sm" id="print-qr" ${b.qrToken ? '' : 'disabled'}>인쇄하기</button><button class="btn ghost sm" id="copy-url">부스 주소 복사</button></div>
    </div>`;
}
function bindQrPanel(root, b) {
  document.getElementById('print-qr').onclick = () => printPart(`<div class="print-grid one">${qrCard(b)}</div>`);
  document.getElementById('copy-url').onclick = async () => {
    try { await navigator.clipboard.writeText(boothURL(b)); toast('주소를 복사했어요'); }
    catch (e) { prompt('아래 주소를 복사하세요', boothURL(b)); }
  };
}

// ----- 예약 현황판 (운영자 '예약' 탭과 관리자 '예약' 탭이 함께 씀) -----
//   날짜 탭 → 회차별 예약자 목록. 회차마다 정원 바꾸기 · 예약 막기/열기, 예약자마다 입장 · 노쇼 · 취소
const RESV_STATUS = { reserved: ['대기', 'blue'], checked: ['입장', 'green'], noshow: ['노쇼', 'gray'], cancelled: ['취소', 'gray'] };
function resvBoard(b) {
  const dates = Store.datesOf(b.id);
  if (!dates.includes(ui.boardDate)) ui.boardDate = dates.includes(Store.today()) ? Store.today() : dates[0];
  const slots = ui.boardDate ? Store.slotsOf(b.id, ui.boardDate) : [];
  const all = Store.resvOfBooth(b.id);
  const t = Store.now();
  return `
    <div class="date-chips">${dates.map(d => `<button class="date-chip ${d === ui.boardDate ? 'on' : ''}" data-bdate="${d}"><b>${dateLabel(d)}</b><small>${dayTag(d) ? dayTag(d) + ' · ' : ''}예약 ${Store.slotsOf(b.id, d).reduce((n, s) => n + (s.count || 0), 0)}명</small></button>`).join('')}</div>
    ${slots.map(s => {
      const rs = all.filter(r => r.slotId === s.id && r.status !== 'cancelled');
      const now = Store.slotTs(s) <= t && t < Store.slotEndTs(s);
      const past = Store.slotEndTs(s) <= t;
      const st = Store.slotState(s);
      return `
        <details class="slot-row ${now ? 'now' : ''} ${past ? 'past' : ''}" ${now ? 'open' : ''}>
          <summary>
            <b>${s.start}~${s.end}</b>
            <span>${s.count || 0} / ${s.capacity}명</span>
            ${now ? '<span class="badge green">진행 중</span>' : `<span class="badge ${st.ok ? 'blue' : 'gray'}">${st.label}</span>`}
            <button class="link-btn" data-block="${s.id}">${s.blocked ? '예약 열기' : '예약 막기'}</button>
          </summary>
          <div class="slot-tools">
            <label class="inline">정원 <input type="number" data-cap="${s.id}" min="${Math.max(1, s.count || 0)}" max="200" value="${s.capacity}"> 명</label>
            <span class="small muted">예약된 ${s.count || 0}명보다 줄일 수는 없어요.</span>
          </div>
          ${rs.length ? `<div class="scroll-x"><table class="tbl">
            <tr><th>이름</th><th>인원</th><th>전화번호</th><th>예약번호</th><th>상태</th><th></th></tr>
            ${rs.map(r => `<tr>
              <td>${esc(r.name)}</td><td>${Store.partyOf(r)}명</td><td class="nowrap">${r.phone ? Store.fmtPhone(r.phone) : esc(r.phone4 || '')}</td><td><code>${r.code}</code></td>
              <td><span class="badge ${RESV_STATUS[r.status][1]}">${RESV_STATUS[r.status][0]}</span></td>
              <td class="nowrap">${r.status === 'reserved' ? `<button class="btn sm" data-rst="checked" data-rid="${r.id}">입장</button> <button class="btn ghost sm" data-rst="noshow" data-rid="${r.id}">노쇼</button> <button class="btn ghost sm" data-rst="cancelled" data-rid="${r.id}">취소</button>` : ''}</td>
            </tr>`).join('')}</table></div>` : '<p class="small muted">예약자가 없어요.</p>'}
        </details>`;
    }).join('') || '<p class="empty">이 날짜에 회차가 없어요. 아래 "예약 시간 설정"에서 만들어 주세요.</p>'}`;
}
function bindResvBoard(root, refresh) {
  root.querySelectorAll('[data-bdate]').forEach(x => x.onclick = () => { ui.boardDate = x.dataset.bdate; refresh(); });
  root.querySelectorAll('[data-block]').forEach(x => x.onclick = (e) => { e.preventDefault(); Store.toggleSlot(x.dataset.block); refresh('변경했어요'); });
  root.querySelectorAll('[data-cap]').forEach(x => x.onchange = () => { Store.setSlotCapacity(x.dataset.cap, x.value); refresh('정원을 바꿨어요'); });
  root.querySelectorAll('[data-rst]').forEach(x => x.onclick = async () => {
    const st = x.dataset.rst;
    if (st === 'cancelled' && !confirm('이 예약을 취소할까요? 자리가 다시 열려요.')) return;
    x.disabled = true;
    if (await Store.setResvStatus(x.dataset.rid, st)) refresh({ checked: '입장 처리했어요', noshow: '노쇼 처리했어요', cancelled: '예약을 취소했어요' }[st]);
  });
}
// 예약 시간 설정 폼 (운영자·관리자 공용)
function slotForm(b) {
  const cfg = b.slotConfig || { start: '10:00', end: '16:00', interval: 20, capacity: 6 };
  const dates = Store.db.settings.festivalDates || [Store.today()];
  return `
    <form class="form" id="slot-form">
      <div class="grid2">
        <label>시작<input type="time" name="start" value="${cfg.start}" required></label>
        <label>종료<input type="time" name="end" value="${cfg.end}" required></label>
        <label>회차 간격(분)<select name="interval">${[10, 15, 20, 30, 40, 60].map(v => `<option ${cfg.interval === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>회차당 정원(명)<input type="number" name="capacity" min="1" max="200" value="${cfg.capacity}" required></label>
      </div>
      <p class="small muted">예약 날짜: ${dates.map(dateLabel).join(', ')} <span class="muted">(날짜는 관리자 → 예약 탭에서 바꿔요)</span></p>
      <button class="btn ghost">시간대 다시 만들기</button>
      <p class="small muted">이미 예약자가 있는 회차는 지워지지 않고 그대로 유지돼요.</p>
    </form>`;
}
function bindSlotForm(root, b, refresh) {
  document.getElementById('slot-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const c = { start: f.start.value, end: f.end.value, interval: Number(f.interval.value), capacity: Number(f.capacity.value) };
    if (toMin(c.end) - toMin(c.start) < c.interval) return toast('종료 시각을 시작보다 늦게 설정하세요', 'err');
    if (!confirm('예약자가 없는 시간대를 새 설정으로 다시 만들까요?')) return;
    const kept = Store.generateSlots(b.id, c);
    refresh(`시간대를 만들었어요${kept ? ` (예약 있는 ${kept}개 회차 유지)` : ''}`);
  };
}

// ----- 예약 관리 (운영자) -----
function opResv(root, b) {
  const all = Store.resvOfBooth(b.id);
  const people = (st) => all.filter(r => r.status === st).reduce((n, r) => n + Store.partyOf(r), 0);
  root.innerHTML = `
    <div class="stats">
      <div class="stat"><small>예약 대기</small><b>${people('reserved')}</b><small>명</small></div>
      <div class="stat"><small>입장 완료</small><b>${people('checked')}</b><small>명</small></div>
      <div class="stat"><small>노쇼</small><b>${people('noshow')}</b><small>명</small></div>
      <div class="stat"><small>남은 자리</small><b>${Store.remaining(b.id)}</b><small>오늘 ${Store.remainingToday(b.id)}</small></div>
    </div>
    ${b.resvOpen === false ? '<p class="warn">⛔ 관리자가 이 부스의 예약 접수를 마감했어요.</p>' : ''}

    <div class="panel">
      <h2>✅ 입장 확인</h2>
      <form class="row" id="checkin">
        <input class="grow code-input" name="code" maxlength="6" placeholder="예약번호 6자리" autocomplete="off">
        <button class="btn">입장 처리</button>
      </form>
      <p class="small muted">관람객이 보여주는 예약번호 6자리를 입력하세요. (대소문자 구분 없음)</p>
    </div>

    <div class="panel">
      <h2>⏱️ 날짜 · 시간대별 예약자</h2>
      ${resvBoard(b)}
    </div>

    <div class="panel">
      <h2>⚙️ 예약 시간 설정</h2>
      ${slotForm(b)}
    </div>`;

  const refresh = (msg, type) => { if (msg) toast(msg, type); viewOp('resv'); };
  document.getElementById('checkin').onsubmit = async (e) => {
    e.preventDefault();
    const res = await Store.checkIn(b.id, e.target.code.value);
    if (!res.ok) return toast(res.msg, 'err');
    const s = Store.slot(res.resv.slotId);
    refresh(`✅ ${res.resv.name}님 ${Store.partyOf(res.resv)}명 입장 (${dateLabel(s.date)} ${s.start} 회차)`);
  };
  bindResvBoard(root, refresh);
  bindSlotForm(root, b, refresh);
}

// =========================================================
// 서버 관리자 모드
// =========================================================
function viewAdmin(tab = 'dash') {
  const sess = getSession();
  if (!sess || sess.role !== 'admin') { location.hash = '#/admin/login'; return; }
  const tabs = [['dash', '대시보드'], ['booths', '부스'], ['resv', '예약'], ['qr', 'QR 코드'], ['notices', '공지'], ['accounts', '계정'], ['settings', '설정']];
  app.innerHTML = `
    ${pageBanner('운영 본부', 'ADMINISTRATION', [['운영 본부', '']])}
    <div class="op-head">
      <p class="small muted">${esc(sess.id)} 관리자님 · 모든 부스와 예약 현황을 관리합니다.</p>
      <div class="row"><a class="btn ghost sm" href="#/password">비밀번호 변경</a><button class="btn ghost sm" id="logout">로그아웃</button></div>
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="ad-body"></div>`;
  document.getElementById('logout').onclick = logout;
  const body = document.getElementById('ad-body');
  ({ dash: adDash, booths: adBooths, resv: adResv, qr: adQR, notices: adNotices, accounts: adAccounts, settings: adSettings })[tab](body);
}

function adDash(root) {
  const p = Store.presence();
  const all = Store.booths();
  const pub = all.filter(b => b.status === 'approved');
  const rs = Store.db.reservations;
  const cnt = (st) => rs.filter(r => r.status === st).length;
  // 예전 데이터라 줄(queue)이 없는 부스는 관리자 화면을 열 때 만들어 줌
  all.filter(b => !Store.hasQueue(b.id)).forEach(b => Store.ensureQueue(b.id));
  const busy = pub.filter(b => Store.crowdKey(b) === 'busy');
  const liveWaiting = pub.filter(b => b.type !== 'reserve').reduce((n, b) => n + Store.waitingOf(b), 0);
  const ts = Store.db.tickets;
  const stale = pub.filter(Store.isStale);
  const pending = all.filter(b => b.status === 'pending');
  const stopped = pub.filter(b => b.stopped);
  const total = cnt('checked') + cnt('noshow');
  // 부스가 있는 층만 안내도로 보여줌 (본관 → 후관, 위층부터)
  const floorsUsed = [];
  Object.keys(BUILDINGS).forEach(bid => [...FLOOR_NUMS].reverse().forEach(f => {
    if (all.some(b => (b.building || 'main') === bid && b.floor === f)) floorsUsed.push([bid, f]);
  }));

  const alerts = [
    ...pending.map(b => `<li>📝 <b>${esc(b.name)}</b> 페이지 승인 대기 <a href="#/admin/booths">처리 →</a></li>`),
    ...stopped.map(b => `<li>⚫ <b>${esc(b.name)}</b> 운영 중단 중</li>`),
    ...stale.map(b => `<li>⏰ <b>${esc(b.name)}</b> 대기 ${Store.waitingOf(b)}명인데 ${timeAgo(Store.queue(b.id).lastCallAt)} 이후 호출 없음 (운영자 확인 필요)</li>`),
    ...busy.map(b => `<li>🔴 <b>${esc(b.name)}</b> 혼잡 ${b.type === 'reserve' ? '· 예약 거의 마감' : `· 대기 ${Store.waitingOf(b)}명`}</li>`),
  ];

  root.innerHTML = `
    <div class="stats">
      <div class="stat hl"><small>현재 접속</small><b>${p.total}</b><small>관람 ${p.visitor} · 운영 ${p.op} · 관리 ${p.admin}</small></div>
      <div class="stat"><small>가입 참여자</small><b>${Store.accounts().filter(a => a.role === 'student').length}</b><small>학번+이름 계정</small></div>
      <div class="stat"><small>공개 부스</small><b>${pub.length}</b><small>전체 ${all.length}</small></div>
      <div class="stat"><small>혼잡 부스</small><b class="red">${busy.length}</b></div>
      <div class="stat"><small>줄서기 대기</small><b>${liveWaiting}</b><small>입장 ${ts.filter(t => t.status === 'entered').length} · 노쇼 ${ts.filter(t => t.status === 'noshow').length}</small></div>
      <div class="stat"><small>예약 대기</small><b>${cnt('reserved')}</b></div>
      <div class="stat"><small>예약 입장</small><b>${cnt('checked')}</b></div>
      <div class="stat"><small>예약 노쇼율</small><b>${total ? Math.round(cnt('noshow') / total * 100) : 0}%</b><small>${cnt('noshow')}건</small></div>
    </div>

    <div class="panel">
      <h2>🚨 확인이 필요한 곳 <span class="badge">${alerts.length}</span></h2>
      ${alerts.length ? `<ul class="alerts">${alerts.join('')}</ul>` : '<p class="muted">모두 정상이에요 👍</p>'}
    </div>

    <div class="panel">
      <h2>건물별 실시간 현황</h2>
      ${crowdLegend()}
      <div class="dash-model">${buildingModel(null, null, { all: true })}</div>
      <div class="floors">${floorsUsed.map(([bid, f]) => `<div><h3>${buildingLabel(bid)} ${f}층</h3>${floorPlan(bid, f, { small: true, all: true })}</div>`).join('') || '<p class="muted">등록된 부스가 없어요.</p>'}</div>
    </div>

    <p class="small muted">${Store.REMOTE ? '접속자 수는 최근 5분 안에 앱을 연 기기 수입니다.' : '접속자 수는 로컬 모드라 <b>이 브라우저에서 열린 탭 수</b> 기준입니다. 서버를 연결하면 실제 접속자 수로 바뀝니다.'} · 화면은 자동으로 갱신돼요.</p>`;
  bindModel(root, (bid, f) => { ui.building = bid; ui.floor = f; location.hash = '#/explore/floor'; });
}

function adBooths(root) {
  const list = [...Store.booths()].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || a.id.localeCompare(b.id));
  const free = Store.freeRooms();
  root.innerHTML = `
    <details class="panel add-booth" ${list.length === 0 ? 'open' : ''}>
      <summary><h2>➕ 새 부스 추가</h2><span class="small muted">빈 교실 ${free.length}개</span></summary>
      ${free.length ? `
      <form class="form" id="add-form">
        <div class="grid2">
          <label>동아리 이름<input name="club" required maxlength="20" placeholder="예) 천문동아리 별빛"></label>
          <label>부스 이름 (선택)<input name="name" maxlength="30" placeholder="비우면 '동아리 이름 + 부스'"></label>
          <label>유형<select name="type"><option value="live">🚶 당일 부스 (현장 입장)</option><option value="reserve">🎟️ 예약 부스</option></select></label>
          <label>위치 (빈 교실만 표시)<select name="loc">${Object.keys(BUILDINGS).map(bid => FLOOR_NUMS.map(f => {
            const rooms = free.filter(r => r.building === bid && r.floor === f);
            return rooms.length ? `<optgroup label="${buildingLabel(bid)} ${f}층">${rooms.map(r => `<option value="${bid}|${f}|${esc(r.room)}">${buildingLabel(bid)} ${f}층 ${esc(r.room)}</option>`).join('')}</optgroup>` : '';
          }).join('')).join('')}</select></label>
          <label>대표 이모지<input name="emoji" maxlength="4" value="⭐"></label>
        </div>
        <label class="check"><input type="checkbox" name="account" checked> 운영자 계정도 함께 발급</label>
        <div class="grid2 acct-fields">
          <label>운영자 아이디 (비우면 자동: booth번호)<input name="accId" maxlength="20" placeholder="예) astro01" autocomplete="off"></label>
          <label>비밀번호 (비우면 ${OP_DEFAULT_PW})<input name="accPw" maxlength="30" placeholder="4자 이상" autocomplete="off"></label>
        </div>
        <button class="btn">부스 추가</button>
        <p class="small muted">새 부스는 '작성 중' 상태로 만들어져요. 운영자가 페이지를 채우면 승인 후 공개하세요.</p>
      </form>` : '<p class="muted">빈 교실이 없어요. 부스를 삭제하거나 js/data.js의 BUILDINGS에 교실을 추가하세요.</p>'}
    </details>

    <div class="panel scroll-x">
      <h2>전체 부스 ${list.length}개</h2>
      ${list.length ? `<table class="tbl">
        <tr><th>부스</th><th>유형</th><th>위치</th><th>혼잡도</th><th>대기/잔여</th><th>최근 호출</th><th>예약·번호표(입장/노쇼)</th><th>상태</th><th>관리</th></tr>
        ${list.map(b => {
          const rs = Store.resvOfBooth(b.id), tk = Store.ticketsOf(b.id);
          const c = (st) => rs.filter(r => r.status === st).length;
          const tc = (st) => tk.filter(t => t.status === st).length;
          const lq = Store.queue(b.id).lastCallAt;
          return `<tr>
            <td><a href="#/booth/${b.id}">${b.emoji} ${esc(b.name)}</a><br><small class="muted">${esc(b.club)}</small></td>
            <td>${b.type === 'reserve' ? '예약' : '당일'}</td>
            <td>${locText(b)}</td>
            <td>${crowdBadge(b)}</td>
            <td>${b.type === 'reserve' ? `잔여 ${Store.remaining(b.id)}` : `${Store.waitingOf(b)}명`}</td>
            <td class="${Store.isStale(b) ? 'red' : ''}">${b.type === 'reserve' ? '-' : lq ? timeAgo(lq) : '-'}</td>
            <td>${b.type === 'reserve' ? `예약 ${c('reserved') + c('checked')} (${c('checked')}/${c('noshow')})` : `번호표 ${tk.length} (${tc('entered')}/${tc('noshow')})`}</td>
            <td><span class="badge status-${b.status}">${statusLabel(b.status)}</span></td>
            <td class="nowrap">
              ${b.status !== 'approved' ? `<button class="btn sm" data-act="approve" data-id="${b.id}">승인·공개</button>` : `<button class="btn ghost sm" data-act="hide" data-id="${b.id}">비공개</button>`}
              <button class="btn ghost sm" data-act="stop" data-id="${b.id}">${b.stopped ? '재개' : '중단'}</button>
              <button class="btn danger sm" data-act="delete" data-id="${b.id}">삭제</button>
            </td>
          </tr>`;
        }).join('')}
      </table>` : '<p class="empty">부스가 없어요. 위에서 새 부스를 추가하세요.</p>'}
    </div>`;

  const addForm = document.getElementById('add-form');
  if (addForm) addForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button');
    const [building, floor, room] = f.loc.value.split('|');
    const opts = { name: f.name.value, type: f.type.value, building, floor: Number(floor), room, emoji: f.emoji.value.trim() || '⭐' };
    const custom = f.accId.value.trim() ? { id: f.accId.value.trim(), pw: f.accPw.value || OP_DEFAULT_PW } : null;
    const club = f.club.value.trim();
    btn.disabled = true; btn.textContent = '추가 중…';
    try {
      if (f.account.checked) {
        const acc = await Store.createBoothAccount(club, opts, custom);
        alert(`부스를 추가했어요.\n\n운영자 아이디: ${acc.id}\n비밀번호: ${acc.pw}\n\n동아리에 전달해 주세요.`);
      } else {
        await Store.addBooth({ ...opts, club });
        toast('부스를 추가했어요');
      }
    } catch (err) { toast('추가 실패: ' + err.message, 'err'); }
    viewAdmin('booths');
  };

  root.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    const b = Store.booth(btn.dataset.id), act = btn.dataset.act;
    if (act === 'approve') Store.updateBooth(b.id, { status: 'approved' });
    if (act === 'hide') { if (!confirm(`'${b.name}'을(를) 비공개로 바꿀까요?`)) return; Store.updateBooth(b.id, { status: 'hidden' }); }
    if (act === 'stop') {
      if (!b.stopped && !confirm(`'${b.name}' 운영을 강제로 중단할까요? 관람객에게 운영중단으로 표시됩니다.`)) return;
      Store.setCrowd(b.id, { stopped: !b.stopped });
    }
    if (act === 'delete') {
      const active = Store.resvOfBooth(b.id).filter(r => r.status === 'reserved').length;
      const msg = `'${b.name}' 부스를 삭제할까요?\n\n· 부스 페이지, 예약 시간대, 예약 기록, 운영자 계정이 모두 지워집니다.\n· 되돌릴 수 없어요.` +
        (active ? `\n\n⚠️ 아직 입장 전인 예약이 ${active}건 있어요! 예약자에게 따로 안내해야 합니다.` : '');
      if (!confirm(msg)) return;
      // 예약이 남아 있으면 실수 방지를 위해 부스 이름을 한 번 더 입력받음
      if (active && prompt(`확인을 위해 부스 이름을 그대로 입력하세요:\n${b.name}`) !== b.name) return toast('이름이 달라 삭제를 취소했어요', 'err');
      btn.disabled = true;
      if (await Store.deleteBooth(b.id)) toast(`'${b.name}' 부스를 삭제했어요`);
      return viewAdmin('booths');
    }
    toast('변경했어요');
    viewAdmin('booths');
  });
}

// ----- 관리자: 예약 · 운영 초기화 -----
//   ① 운영 초기화(예약·줄서기·운영 상태를 오늘 기준으로 새로 시작)  ② 예약 날짜  ③ 예약 규칙
//   ④ 부스별 예약 현황(접수 열기/마감 · 이 부스만 초기화 · 회차 상세)
function adResv(root) {
  const s = Store.db.settings;
  const today = Store.today();
  const dates = ui.draftDates || [...(s.festivalDates || [today])];
  const reserveBooths = Store.booths().filter(b => b.type === 'reserve').sort((a, b) => a.id.localeCompare(b.id));
  const sel = Store.booth(ui.adResvBooth);
  const people = (b, st) => Store.resvOfBooth(b.id).filter(r => r.status === st).reduce((n, r) => n + Store.partyOf(r), 0);

  root.innerHTML = `
    <div class="panel reset-panel" id="reset">
      <h2>🔄 운영 초기화</h2>
      <p class="small muted">행사를 새로 시작할 때 씁니다. 부스 페이지·계정·공지는 그대로 두고, 고른 항목만 처음 상태로 되돌려요. 직전 상태는 자동 백업에 남아요.</p>
      <form class="form" id="reset-form">
        <label class="check"><input type="checkbox" name="reservations" checked> <span><b>예약</b> — 모든 예약 기록을 지우고, 회차를 아래 날짜 기준으로 새로 만들기</span></label>
        <label class="check"><input type="checkbox" name="queue" checked> <span><b>줄서기</b> — 번호표를 모두 지우고 번호를 1번부터 다시</span></label>
        <label class="check"><input type="checkbox" name="status" checked> <span><b>운영 상태</b> — 운영 중단 · 한 줄 공지 · 예약 접수 마감 풀기, 가상 시각 끄기</span></label>
        <div class="row wrap">
          <label class="check"><input type="radio" name="base" value="today" checked> 오늘(${dateLabel(today)}) 하루로</label>
          <label class="check"><input type="radio" name="base" value="dates"> 아래 "예약 날짜" 기준으로</label>
        </div>
        <button class="btn danger">선택한 항목 초기화</button>
      </form>
    </div>

    <div class="panel">
      <h2>📅 예약 날짜</h2>
      <p class="small muted">예약 부스는 이 날짜들에 회차가 만들어져요. 저장하면 모든 예약 부스의 회차가 새 날짜로 바뀌어요. (이미 예약이 있는 회차는 남아요)</p>
      <div class="date-chips">${dates.map(d => `<span class="date-chip static ${d === today ? 'on' : ''}"><b>${dateLabel(d)}</b><small>${d === today ? '오늘' : d < today ? '지난 날짜' : d}</small><button type="button" class="x" data-deldate="${d}" aria-label="${dateLabel(d)} 빼기">×</button></span>`).join('') || '<p class="small muted">날짜가 없어요. 아래에서 추가하세요.</p>'}</div>
      <div class="row wrap">
        <input type="date" id="add-date" value="${today}">
        <button class="btn ghost sm" id="add-date-btn">날짜 추가</button>
        <button class="btn ghost sm" id="only-today">오늘만</button>
        <button class="btn sm" id="save-dates">저장하고 회차 다시 만들기</button>
      </div>
    </div>

    <div class="panel">
      <h2>📏 예약 규칙</h2>
      <form class="form" id="rule-form">
        <div class="grid2">
          <label>예약 마감 (회차 시작 몇 분 전)<input type="number" name="resvCloseMin" min="0" max="240" value="${s.resvCloseMin || 0}"></label>
          <label>예약 1건당 최대 인원<input type="number" name="maxParty" min="1" max="10" value="${s.maxParty}"></label>
          <label>1인당 동시 예약 수<input type="number" name="maxPerPerson" min="1" max="10" value="${s.maxPerPerson}"></label>
          <label>노쇼 처리 유예(분)<input type="number" name="graceMin" min="0" max="60" value="${s.graceMin}"></label>
        </div>
        <button class="btn">저장</button>
      </form>
    </div>

    <div class="panel scroll-x">
      <h2>🎟️ 부스별 예약 현황</h2>
      ${reserveBooths.length ? `<table class="tbl">
        <tr><th>부스</th><th>회차</th><th>예약(입장/노쇼)</th><th>남은 자리</th><th>접수</th><th>관리</th></tr>
        ${reserveBooths.map(b => {
          const c = b.slotConfig || {};
          return `<tr class="${ui.adResvBooth === b.id ? 'sel' : ''}">
            <td><a href="#/booth/${b.id}">${b.emoji} ${esc(b.name)}</a><br><small class="muted">${esc(b.club)}</small></td>
            <td class="nowrap">${c.start || '-'}~${c.end || '-'}<br><small class="muted">${c.interval || '-'}분 · ${c.capacity || '-'}명</small></td>
            <td>${people(b, 'reserved') + people(b, 'checked')}명 (${people(b, 'checked')}/${people(b, 'noshow')})</td>
            <td>${Store.remaining(b.id)}명</td>
            <td><button class="btn sm ${b.resvOpen === false ? '' : 'ghost'}" data-open="${b.id}">${b.resvOpen === false ? '마감됨 · 열기' : '접수 중 · 마감'}</button></td>
            <td class="nowrap"><button class="btn ghost sm" data-detail="${b.id}">${ui.adResvBooth === b.id ? '닫기' : '회차 · 예약자'}</button>
              <button class="btn ghost sm" data-breset="${b.id}">이 부스 초기화</button></td>
          </tr>`;
        }).join('')}
      </table>` : '<p class="empty">예약 부스가 없어요.</p>'}
    </div>

    ${sel ? `
    <div class="panel" id="booth-detail">
      <h2>${sel.emoji} ${esc(sel.name)} · 회차와 예약자</h2>
      ${resvBoard(sel)}
      <h3 class="small-head">예약 시간 설정</h3>
      ${slotForm(sel)}
    </div>` : ''}`;

  const refresh = (msg, type) => { if (msg) toast(msg, type); viewAdmin('resv'); };

  document.getElementById('reset-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const opts = { reservations: f.reservations.checked, queue: f.queue.checked, status: f.status.checked };
    if (!opts.reservations && !opts.queue && !opts.status) return toast('초기화할 항목을 골라 주세요', 'err');
    opts.dates = f.base.value === 'today' ? [today] : (s.festivalDates || [today]);
    const what = [opts.reservations && '예약', opts.queue && '줄서기', opts.status && '운영 상태'].filter(Boolean).join(' · ');
    if (prompt(`${what}을(를) 초기화합니다.\n예약 날짜: ${opts.dates.map(dateLabel).join(', ')}\n\n되돌리려면 자동 백업을 써야 해요. 계속하려면 "초기화"라고 입력하세요.`) !== '초기화') return toast('초기화를 취소했어요');
    f.querySelector('button').disabled = true;
    if (await Store.resetOperations(opts)) { ui.draftDates = null; ui.selSlot = null; ui.lastResv = null; refresh('초기화했어요. 오늘부터 새로 예약·운영할 수 있어요.'); }
    else refresh();
  };

  // 날짜 편집은 저장 전까지 ui.draftDates 에만 반영
  const setDraft = (list) => { ui.draftDates = [...new Set(list)].sort(); viewAdmin('resv'); };
  root.querySelectorAll('[data-deldate]').forEach(x => x.onclick = () => setDraft(dates.filter(d => d !== x.dataset.deldate)));
  document.getElementById('add-date-btn').onclick = () => { const v = document.getElementById('add-date').value; if (v) setDraft([...dates, v]); };
  document.getElementById('only-today').onclick = () => setDraft([today]);
  document.getElementById('save-dates').onclick = () => {
    if (!dates.length) return toast('날짜를 하나 이상 넣어 주세요', 'err');
    if (!confirm(`예약 날짜를 ${dates.map(dateLabel).join(', ')}(으)로 저장하고 모든 예약 부스의 회차를 다시 만들까요?`)) return;
    Store.setFestivalDates(dates);
    ui.draftDates = null;
    refresh('예약 날짜를 저장했어요');
  };

  document.getElementById('rule-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    Store.setSettings({
      resvCloseMin: Math.max(0, Number(f.resvCloseMin.value) || 0), maxParty: Math.max(1, Number(f.maxParty.value) || 1),
      maxPerPerson: Math.max(1, Number(f.maxPerPerson.value) || 1), graceMin: Math.max(0, Number(f.graceMin.value) || 0),
    });
    refresh('예약 규칙을 저장했어요');
  };

  root.querySelectorAll('[data-open]').forEach(x => x.onclick = () => {
    const b = Store.booth(x.dataset.open);
    Store.setResvOpen(b.id, b.resvOpen === false);
    refresh(b.resvOpen === false ? `'${b.name}' 예약 접수를 열었어요` : `'${b.name}' 예약 접수를 마감했어요`);
  });
  root.querySelectorAll('[data-detail]').forEach(x => x.onclick = () => { ui.adResvBooth = ui.adResvBooth === x.dataset.detail ? null : x.dataset.detail; ui.boardDate = null; viewAdmin('resv'); });
  root.querySelectorAll('[data-breset]').forEach(x => x.onclick = async () => {
    const b = Store.booth(x.dataset.breset);
    const n = Store.resvOfBooth(b.id).filter(r => r.status === 'reserved').length;
    if (!confirm(`'${b.name}'의 예약 기록을 모두 지우고 회차를 새로 만들까요?${n ? `\n\n⚠️ 아직 입장 전인 예약이 ${n}건 있어요.` : ''}`)) return;
    x.disabled = true;
    if (await Store.resetBoothReservations(b.id)) refresh(`'${b.name}' 예약을 초기화했어요`);
  });
  if (sel) {
    const box = document.getElementById('booth-detail');
    bindResvBoard(box, refresh);
    bindSlotForm(box, sel, refresh);
  }
}

// ----- 관리자: QR 코드 만들기 · 다시 만들기 · 삭제 · 인쇄 -----
//   다시 만들기/삭제를 하면 그 부스의 예전 QR(이미 인쇄한 것 포함)은 "사용할 수 없는 QR"로 바뀜
function adQR(root) {
  const list = Store.booths().slice().sort((a, b) => (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1) || a.id.localeCompare(b.id));
  const withQR = list.filter(b => b.qrToken);
  const fmt = (ts) => { const d = new Date(ts); return `${dateLabel(dateStr(ts))} ${fromMin(d.getHours() * 60 + d.getMinutes())}`; };
  root.innerHTML = `
    <div class="panel">
      <h2>🔳 부스 QR 코드</h2>
      <p class="small muted">당일 부스 QR은 <b>줄서기 화면</b>, 예약 부스 QR은 <b>예약 화면</b>으로 연결돼요. <b>다시 만들기</b>나 <b>삭제</b>를 하면 이미 인쇄한 예전 QR은 더 이상 열리지 않아요. 잘못 붙였거나 잃어버린 QR을 막을 때 쓰세요.</p>
      ${qrWarning()}
      <div class="row wrap">
        <button class="btn" id="qr-make-missing" ${list.some(b => !b.qrToken) ? '' : 'disabled'}>QR 없는 부스 모두 만들기 (${list.filter(b => !b.qrToken).length})</button>
        <button class="btn ghost" id="qr-print-all" ${withQR.length ? '' : 'disabled'}>만든 QR ${withQR.length}개 모두 인쇄</button>
        <button class="btn danger" id="qr-del-all" ${withQR.length ? '' : 'disabled'}>모든 QR 삭제</button>
      </div>
    </div>
    <div class="qr-grid">${list.map(b => `
      <div class="qr-item">
        ${qrCard(b)}
        <p class="small muted">${b.status !== 'approved' ? `<span class="badge status-${b.status}">${statusLabel(b.status)}</span> ` : ''}${b.qrToken ? `만든 시각 ${fmt(b.qrCreatedAt)}` : 'QR 없음'}</p>
        <div class="row wrap center-row">
          ${b.qrToken ? `
            <button class="btn ghost sm" data-qprint="${b.id}">인쇄</button>
            <button class="btn ghost sm" data-qmake="${b.id}">다시 만들기</button>
            <button class="btn danger sm" data-qdel="${b.id}">삭제</button>`
          : `<button class="btn sm" data-qmake="${b.id}">QR 만들기</button>`}
        </div>
      </div>`).join('') || '<p class="empty">부스가 없어요.</p>'}</div>`;

  const refresh = (msg) => { if (msg) toast(msg); viewAdmin('qr'); };
  document.getElementById('qr-make-missing').onclick = async () => {
    for (const b of list.filter(x => !x.qrToken)) await Store.createQR(b.id);
    refresh('QR 코드를 만들었어요');
  };
  document.getElementById('qr-print-all').onclick = () => printPart(`<div class="print-grid">${withQR.map(qrCard).join('')}</div>`);
  document.getElementById('qr-del-all').onclick = async () => {
    if (!confirm(`QR 코드 ${withQR.length}개를 모두 삭제할까요?\n이미 인쇄해 붙인 QR도 모두 열리지 않게 돼요.`)) return;
    for (const b of withQR) await Store.deleteQR(b.id);
    refresh('모든 QR 코드를 삭제했어요');
  };
  root.querySelectorAll('[data-qmake]').forEach(btn => btn.onclick = async () => {
    const b = Store.booth(btn.dataset.qmake);
    if (b.qrToken && !confirm(`'${b.name}' QR을 새로 만들까요?\n예전 QR(이미 인쇄한 것 포함)은 더 이상 열리지 않아요. 새로 인쇄해서 바꿔 붙여야 해요.`)) return;
    await Store.createQR(b.id);
    refresh(`'${b.name}' QR 코드를 ${b.qrToken ? '다시 ' : ''}만들었어요`);
  });
  root.querySelectorAll('[data-qdel]').forEach(btn => btn.onclick = async () => {
    const b = Store.booth(btn.dataset.qdel);
    if (!confirm(`'${b.name}' QR 코드를 삭제할까요?\n이미 인쇄한 QR을 찍으면 "사용할 수 없는 QR"로 안내돼요.`)) return;
    await Store.deleteQR(b.id);
    refresh(`'${b.name}' QR 코드를 삭제했어요`);
  });
  root.querySelectorAll('[data-qprint]').forEach(btn => btn.onclick = () => printPart(`<div class="print-grid one">${qrCard(Store.booth(btn.dataset.qprint))}</div>`));
}

function adNotices(root) {
  const list = Store.notices('all');
  root.innerHTML = `
    <div class="panel">
      <h2>새 공지</h2>
      <form class="form" id="nf">
        <textarea name="body" rows="2" maxlength="100" required placeholder="예) 14시부터 강당에서 밴드 공연이 시작됩니다!"></textarea>
        <div class="grid2">
          <label>대상<select name="target"><option value="">전체 (홈 화면)</option>${Store.booths().map(b => `<option value="${b.id}">${esc(b.name)} 부스 페이지</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="urgent"> 📢 긴급 공지 (맨 위 고정, 강조)</label>
        </div>
        <button class="btn">공지 올리기</button>
      </form>
    </div>
    <div class="panel">
      <h2>게시된 공지 ${list.length}개</h2>
      ${list.map(n => `
        <div class="notice ${n.urgent ? 'urgent' : ''} row between">
          <span>${n.urgent ? '📢' : '📌'} ${esc(n.body)}<br><small class="muted">${n.boothId ? esc(Store.booth(n.boothId)?.name || '') + ' 부스' : '전체'} · ${timeAgo(n.createdAt)}</small></span>
          <button class="btn ghost sm" data-del="${n.id}">삭제</button>
        </div>`).join('') || '<p class="muted">공지가 없어요.</p>'}
    </div>`;
  document.getElementById('nf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    Store.addNotice(f.body.value.trim(), f.urgent.checked, f.target.value || null);
    toast('공지를 올렸어요');
    viewAdmin('notices');
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('삭제할까요?')) { Store.deleteNotice(b.dataset.del); viewAdmin('notices'); } });
}

function adAccounts(root) {
  const accs = Store.accounts();
  const ops = accs.filter(a => a.role === 'op');
  const admins = accs.filter(a => a.role === 'admin');
  const students = accs.filter(a => a.role === 'student').sort((x, y) => String(x.studentNo).localeCompare(String(y.studentNo)));
  const boothOpts = (sel) => `<option value="">(연결 안 함)</option>` + Store.booths().map(b => `<option value="${b.id}" ${sel === b.id ? 'selected' : ''}>${esc(b.name)} · ${esc(b.club)}</option>`).join('');
  const sq = (ui.stuQ || '').trim();
  const stuList = students.filter(a => !sq || (a.id + a.studentNo).includes(sq));

  root.innerHTML = `
    <div class="panel">
      <h2>부스 운영자 계정 만들기</h2>
      <form class="form" id="opf">
        <div class="grid2">
          <label>아이디 (영문 소문자·숫자 3~20자)<input name="id" required maxlength="20" placeholder="예) booth11, astro" autocomplete="off"></label>
          <label>비밀번호 (4자 이상)<input name="pw" required minlength="4" maxlength="30" value="${OP_DEFAULT_PW}" autocomplete="off"></label>
        </div>
        <label>담당 부스<select name="booth">${boothOpts('')}</select></label>
        <button class="btn">계정 만들기</button>
      </form>
      <p class="small muted">부스가 아직 없다면 <a href="#/admin/booths">부스 탭</a>에서 부스와 계정을 한 번에 만들 수 있어요.</p>
      <button class="btn ghost sm" id="bulk">계정 없는 부스에 일괄 발급 (booth번호 / ${OP_DEFAULT_PW})</button>
    </div>

    <div class="panel scroll-x">
      <h2>부스 운영자 계정 <span class="muted">${ops.length}</span></h2>
      <table class="tbl">
        <tr><th>아이디</th><th>비밀번호</th><th>담당 부스</th><th>부스 상태</th><th>관리</th></tr>
        ${ops.map(a => { const b = Store.booth(a.boothId); return `<tr>
          <td><code>${esc(a.id)}</code></td>
          <td>${Store.REMOTE ? `<code>${esc(a.pw || '—')}</code>` : `<input class="mini" data-pw="${esc(a.id)}" value="${esc(a.pw)}" maxlength="30" aria-label="${esc(a.id)} 비밀번호">`}</td>
          <td><select class="mini" data-booth="${esc(a.id)}" aria-label="${esc(a.id)} 담당 부스">${boothOpts(a.boothId)}</select></td>
          <td>${b ? `<span class="badge status-${b.status}">${statusLabel(b.status)}</span>` : '<span class="muted small">없음</span>'}</td>
          <td class="nowrap">${Store.REMOTE ? `<button class="btn ghost sm" data-reset="${esc(a.id)}">재발급</button>` : ''}<button class="btn ghost sm" data-del="${esc(a.id)}">삭제</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">계정이 없어요.</td></tr>'}
      </table>
      <p class="small muted">${Store.REMOTE ? '서버 모드에서는 보안상 다른 사람의 비밀번호를 바꿀 수 없어요. "재발급"을 누르면 새 아이디·비밀번호가 만들어집니다.' : '비밀번호 칸을 고치고 다른 곳을 누르면 바로 저장돼요.'}</p>
    </div>

    <div class="panel scroll-x">
      <h2>참여자 계정 <span class="muted">${students.length}</span></h2>
      <input class="search" id="stu-q" type="search" placeholder="학번 또는 이름으로 찾기" value="${esc(sq)}">
      <table class="tbl">
        <tr><th>아이디</th><th>학번</th><th>이름</th><th>예약</th><th>관리</th></tr>
        ${stuList.map(a => {
          const n = Store.db.reservations.filter(r => r.device === 'stu:' + a.id || (a.uid && r.device === a.uid)).length;
          return `<tr><td><code>${esc(a.id)}</code></td><td>${esc(a.studentNo)}</td><td>${esc(a.name)}</td><td>${n}건</td>
            <td><button class="btn ghost sm" data-del="${esc(a.id)}">삭제</button></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="muted">가입한 참여자가 없어요.</td></tr>'}
      </table>
      <p class="small muted">명의 도용이 의심되는 계정은 삭제하세요. 삭제해도 그 계정의 예약 기록은 남아 있어요.</p>
    </div>

    <div class="panel">
      <h2>관리자 계정</h2>
      <p>${admins.map(a => `<code>${esc(a.id)}</code>`).join(' ')} <span class="small muted">· 관리자 아이디·비밀번호는 js/data.js 의 ADMIN_ID / ADMIN_PW 에서 정합니다.</span></p>
    </div>`;

  document.getElementById('opf').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const acc = await Store.createOpAccount(f.id.value, f.pw.value, f.booth.value || null);
      alert(`운영자 계정을 만들었어요.\n\n아이디: ${acc.id}\n비밀번호: ${acc.pw}`);
      viewAdmin('accounts');
    } catch (err) { btn.disabled = false; toast(err.message, 'err'); }
  };
  document.getElementById('bulk').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = '발급 중…';
    try {
      const list = await Store.issueMissingAccounts();
      alert(list.length ? '발급된 계정\n\n' + list.map(a => `${a.booth}: ${a.id} / ${a.pw}`).join('\n') : '모든 부스에 이미 계정이 있어요.');
    } catch (err) { toast('발급 실패: ' + err.message, 'err'); }
    viewAdmin('accounts');
  };
  root.querySelectorAll('[data-pw]').forEach(inp => inp.onchange = async () => {
    if (inp.value.length < 4) { toast('비밀번호는 4자 이상이어야 해요', 'err'); return viewAdmin('accounts'); }
    await Store.updateAccount(inp.dataset.pw, { pw: inp.value });
    toast(`${inp.dataset.pw} 비밀번호를 바꿨어요`);
  });
  root.querySelectorAll('[data-booth]').forEach(sel => sel.onchange = async () => {
    await Store.updateAccount(sel.dataset.booth, { boothId: sel.value || null });
    toast('담당 부스를 바꿨어요');
    viewAdmin('accounts');
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm(`${b.dataset.del} 계정을 삭제할까요? 이 아이디로는 더 이상 로그인할 수 없어요.`)) return;
    b.disabled = true;
    if (await Store.deleteAccount(b.dataset.del)) toast('삭제했어요');
    viewAdmin('accounts');
  });
  root.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    if (!confirm(`${b.dataset.reset} 계정을 새 아이디·비밀번호로 다시 발급할까요?\n(기존 아이디는 사용할 수 없게 됩니다)`)) return;
    b.disabled = true;
    try {
      const acc = await Store.reissueAccount(b.dataset.reset);
      alert(`새 계정\n\n아이디: ${acc.id}\n비밀번호: ${acc.pw}`);
    } catch (err) { toast('재발급 실패: ' + err.message, 'err'); }
    viewAdmin('accounts');
  });
  const q = document.getElementById('stu-q');
  q.onchange = () => { ui.stuQ = q.value; viewAdmin('accounts'); };
}

function adSettings(root) {
  const s = Store.db.settings;
  const snaps = Store.snapshots();
  const d = new Date(Store.now());
  const cur = fromMin(d.getHours() * 60 + d.getMinutes());
  root.innerHTML = `
    <div class="panel">
      <h2>🔐 관리자 비밀번호</h2>
      <p class="small muted">처음 설정한 비밀번호(예: 1234)는 꼭 바꿔 두세요. 링크를 아는 누구나 로그인을 시도할 수 있어요.</p>
      <a class="btn sm" href="#/password">비밀번호 바꾸기</a>
    </div>

    <div class="panel">
      <h2>행사 정보</h2>
      <form class="form" id="sf">
        <div class="grid2">
          <label>행사 이름<input name="festivalName" value="${esc(s.festivalName)}"></label>
          <label>부제<input name="subtitle" value="${esc(s.subtitle)}"></label>
          <label>운영 시작<input type="time" name="openTime" value="${s.openTime}"></label>
          <label>운영 종료<input type="time" name="closeTime" value="${s.closeTime}"></label>
          <label>노쇼 처리 유예(분)<input type="number" name="graceMin" min="0" max="60" value="${s.graceMin}"></label>
          <label>1인당 동시 예약 수<input type="number" name="maxPerPerson" min="1" max="10" value="${s.maxPerPerson}"></label>
          <label>호출 지연 경고(분)<input type="number" name="staleMin" min="1" max="120" value="${s.staleMin}"></label>
        </div>
        <h3 class="small-head">QR 줄서기 (당일 부스)</h3>
        <div class="grid2">
          <label>호출 후 자동 노쇼(분)<input type="number" name="callGraceMin" min="1" max="30" value="${s.callGraceMin}"></label>
          <label>1인당 동시 줄서기 수<input type="number" name="maxQueuePerPerson" min="1" max="10" value="${s.maxQueuePerPerson}"></label>
          <label>'보통' 기준 대기 인원<input type="number" name="queueNormal" min="1" max="100" value="${s.queueNormal}"></label>
          <label>'혼잡' 기준 대기 인원<input type="number" name="queueBusy" min="2" max="200" value="${s.queueBusy}"></label>
        </div>
        <label class="check"><input type="checkbox" name="requireLogin" ${s.requireLogin ? 'checked' : ''}> 예약·줄서기할 때 참여자 로그인(학번+이름 계정) 필요</label>
        <button class="btn">저장</button>
      </form>
    </div>

    <div class="panel">
      <h2>홈 화면 활동 사진</h2>
      <p class="small muted">홈 맨 위에 자동으로 넘어가는 사진입니다. 최대 6장, 가로 사진을 추천해요.</p>
      <div class="photo-admin">
        ${(s.heroPhotos || []).map((ph, i) => `
          <div class="pa-item">
            <img src="${ph.src}" alt="">
            <input data-cap="${i}" value="${esc(ph.caption || '')}" maxlength="30" placeholder="사진 설명 (선택)">
            <div class="row">
              <button class="btn ghost sm" data-pmove="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>◀</button>
              <button class="btn ghost sm" data-pmove="${i}" data-dir="1" ${i === s.heroPhotos.length - 1 ? 'disabled' : ''}>▶</button>
              <button class="btn ghost sm" data-pdel="${i}">삭제</button>
            </div>
          </div>`).join('')}
        ${(s.heroPhotos || []).length < 6 ? `<label class="pa-add">${icon('camera', 'ico big')}<span>사진 추가</span><input type="file" accept="image/*" multiple id="hero-add" hidden></label>` : ''}
      </div>
    </div>

    <div class="panel">
      <h2>시연용 가상 시각</h2>
      <p class="small muted">행사 시간이 아닐 때 예약 기능을 시연하기 위한 기능입니다. 현재 앱 시각: <b>${cur}</b> ${s.timeOffset ? '(가상)' : '(실제)'}</p>
      <form class="row" id="tf">
        <input type="time" name="t" value="${cur}">
        <button class="btn sm">가상 시각 적용</button>
        <button type="button" class="btn ghost sm" id="real">실제 시각으로</button>
      </form>
    </div>

    <div class="panel" id="backup">
      <h2>백업 · 복구</h2>
      <p class="small muted">데이터가 지워지거나 잘못 바뀌었을 때 백업 파일로 되돌릴 수 있어요. <b>행사 전날과 당일 점심에 한 번씩</b> 내려받아 두세요.</p>
      <div class="backup-grid">
        <div class="bk-card">
          <b>엑셀 백업 (.xlsx)</b>
          <p class="small muted">부스·회차·예약·공지·계정이 시트별로 정리돼요. 엑셀에서 열어 보고 고칠 수 있어요. (사진 제외)</p>
          <button class="btn sm" id="bk-xlsx">엑셀로 내려받기</button>
        </div>
        <div class="bk-card">
          <b>전체 백업 (.json)</b>
          <p class="small muted">사진까지 모두 담긴 완전한 백업이에요. 엑셀 백업과 함께 보관하세요.</p>
          <button class="btn sm" id="bk-json">JSON으로 내려받기</button>
        </div>
        <div class="bk-card">
          <b>백업 파일로 복구</b>
          <p class="small muted">.xlsx 또는 .json 백업 파일을 고르면 그 시점으로 되돌아가요. 복구 직전 상태는 자동 백업에 남아요.</p>
          <label class="btn ghost sm file-btn">파일 고르기<input type="file" id="bk-file" accept=".xlsx,.xls,.json" hidden></label>
        </div>
      </div>
      <h3 class="small-head">이 브라우저의 자동 백업 <span class="muted small">(최근 3개 · 사진 제외)</span></h3>
      ${snaps.length ? `<ul class="snap-list">${snaps.map((sn, i) => `
        <li><span><b>${new Date(sn.at).toLocaleString('ko-KR')}</b> · ${esc(sn.reason)} · 부스 ${sn.data.booths.length}개 · 예약 ${sn.data.reservations.length}건</span>
          <span class="row"><button class="btn ghost sm" data-snap-dl="${i}">내려받기</button><button class="btn ghost sm" data-snap="${i}">이 시점으로 복구</button></span></li>`).join('')}</ul>`
        : '<p class="small muted">아직 자동 백업이 없어요. 관리자 화면을 열어 두면 30분마다 자동으로 저장돼요.</p>'}
      <button class="btn ghost sm" id="bk-now">지금 자동 백업 하나 만들기</button>
    </div>

    <div class="panel">
      <h2>데이터</h2>
      <div class="row wrap">
        <button class="btn ghost" id="csv">📥 부스별 통계 CSV 다운로드</button>
        <a class="btn ghost" href="#/admin/resv">🔄 예약·운영 초기화 (오늘 기준)</a>
        <button class="btn danger" id="reset">⚠️ 예시 데이터로 초기화</button>
      </div>
    </div>`;

  // ----- 백업 / 복구 -----
  const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };
  document.getElementById('bk-xlsx').onclick = async (e) => {
    const t = e.target.textContent; busy(e.target, true, '만드는 중…');
    try { await Backup.downloadExcel(); toast('엑셀 백업 파일을 내려받았어요'); }
    catch (err) { toast(err.message, 'err'); }
    busy(e.target, false, t);
  };
  document.getElementById('bk-json').onclick = () => { Backup.downloadJSON(); toast('JSON 백업 파일을 내려받았어요'); };
  document.getElementById('bk-now').onclick = () => { Store.snapshot('수동 백업'); toast('자동 백업에 저장했어요'); viewAdmin('settings'); };
  const restore = async (data, label) => {
    const n = (k) => (Array.isArray(data[k]) ? data[k].length : 0);
    if (!confirm(`${label}

부스 ${n('booths')}개 · 회차 ${n('slots')}개 · 예약 ${n('reservations')}건 · 번호표 ${n('tickets')}장 · 공지 ${n('notices')}개로 되돌릴까요?
지금 데이터는 자동 백업에 남겨 둡니다.`)) return;
    try {
      if (await Store.importData(data)) { ui.draft = null; toast('복구했어요'); }
    } catch (err) { toast('복구 실패: ' + err.message, 'err'); }
    viewAdmin('settings');
  };
  document.getElementById('bk-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { await restore(await Backup.readFile(file), `"${file.name}" 파일로 복구합니다.`); }
    catch (err) { toast(err.message, 'err'); }
  };
  root.querySelectorAll('[data-snap]').forEach(b => b.onclick = () => {
    const sn = Store.snapshots()[Number(b.dataset.snap)];
    restore(sn.data, `${new Date(sn.at).toLocaleString('ko-KR')} 자동 백업으로 복구합니다.`);
  });
  root.querySelectorAll('[data-snap-dl]').forEach(b => b.onclick = () => {
    const sn = Store.snapshots()[Number(b.dataset.snapDl)];
    Backup.downloadJSON(sn.data, `UJHS_autobackup_${new Date(sn.at).toISOString().slice(0, 16).replace(/[-:T]/g, '')}.json`);
  });

  document.getElementById('sf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    Store.setSettings({
      festivalName: f.festivalName.value, subtitle: f.subtitle.value, openTime: f.openTime.value, closeTime: f.closeTime.value,
      graceMin: Number(f.graceMin.value), maxPerPerson: Number(f.maxPerPerson.value), staleMin: Number(f.staleMin.value),
      callGraceMin: Math.max(1, Number(f.callGraceMin.value) || 5), maxQueuePerPerson: Math.max(1, Number(f.maxQueuePerPerson.value) || 1),
      queueNormal: Math.max(1, Number(f.queueNormal.value) || 5),
      queueBusy: Math.max(Number(f.queueNormal.value) + 1, Number(f.queueBusy.value) || 15),
      requireLogin: f.requireLogin.checked,
    });
    toast('저장했어요');
  };
  // 활동 사진 관리
  const photos = () => [...(Store.db.settings.heroPhotos || [])];
  const savePhotos = (list, msg) => {
    if (JSON.stringify(list).length > 900000) return toast('사진 용량이 너무 커요. 사진 수를 줄여주세요.', 'err');
    Store.setSettings({ heroPhotos: list });
    if (msg) toast(msg);
    viewAdmin('settings');
  };
  const addInput = document.getElementById('hero-add');
  if (addInput) addInput.onchange = async () => {
    const list = photos();
    for (const f of [...addInput.files].slice(0, 6 - list.length)) list.push({ src: await readImage(f, 900), caption: '' });
    savePhotos(list, '사진을 추가했어요');
  };
  root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    const list = photos(); list.splice(Number(b.dataset.pdel), 1); savePhotos(list, '삭제했어요');
  });
  root.querySelectorAll('[data-pmove]').forEach(b => b.onclick = () => {
    const list = photos(), i = Number(b.dataset.pmove), j = i + Number(b.dataset.dir);
    [list[i], list[j]] = [list[j], list[i]]; savePhotos(list);
  });
  root.querySelectorAll('[data-cap]').forEach(inp => inp.onchange = () => {
    const list = photos(); list[Number(inp.dataset.cap)] = { ...list[Number(inp.dataset.cap)], caption: inp.value.trim() };
    Store.setSettings({ heroPhotos: list }); toast('설명을 저장했어요');
  });

  document.getElementById('tf').onsubmit = (e) => { e.preventDefault(); Store.setSimTime(e.target.t.value); toast('가상 시각을 적용했어요'); viewAdmin('settings'); };
  document.getElementById('real').onclick = () => { Store.setSimTime(null); toast('실제 시각으로 돌아왔어요'); viewAdmin('settings'); };
  document.getElementById('csv').onclick = () => {
    const blob = new Blob([Store.exportCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'UJHS_booth_stats.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('reset').onclick = async () => {
    if (!confirm('모든 부스·예약·공지가 지워지고 예시 데이터로 바뀝니다. 계속할까요?')) return;
    await Store.reset();
    ui.draft = null;
    toast('초기화했어요');
    viewAdmin('settings');
  };
}

// =========================================================
// 최초 설정 (서버 모드에서 처음 한 번)
// =========================================================
function viewSetup() {
  if (!Store.isSetupNeeded()) { location.hash = '#/admin'; return; }
  app.innerHTML = `
    <div class="login">
      <h1>🚀 처음 설정</h1>
      <p class="small muted">서버가 연결되었어요! 운영 본부가 사용할 <b>관리자 계정</b>을 만들어 주세요. 이 화면은 처음 한 번만 나옵니다.</p>
      <form class="form" id="setup-form">
        <label>관리자 아이디 (영문/숫자)<input name="id" required pattern="[a-zA-Z0-9_\\-]{3,20}" value="${ADMIN_ID}"></label>
        <label>비밀번호 (4자 이상)<input name="pw" type="password" required minlength="4" value="${ADMIN_PW}" autocomplete="new-password"></label>
        <p class="small muted">미리 정해 둔 관리자 계정(js/data.js의 ADMIN_ID / ADMIN_PW)이 채워져 있어요.</p>
        <label class="check"><input type="checkbox" name="seed" checked> 예시 부스 10개 넣기 (나중에 지우거나 고칠 수 있어요)</label>
        <button class="btn full">관리자 계정 만들기</button>
      </form>
    </div>`;
  document.getElementById('setup-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = '만드는 중…';
    try {
      await Store.setupAdmin(f.id.value, f.pw.value);
      if (f.seed.checked) await Store.reset();
      if (f.seed.checked) await Store.issueMissingAccounts();
      toast('설정 완료! 예시 부스 계정(booth01~)도 만들어 두었어요.');
      location.hash = '#/admin/accounts';
    } catch (err) {
      btn.disabled = false; btn.textContent = '관리자 계정 만들기';
      toast('실패: ' + (err.code === 'auth/operation-not-allowed' ? 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜주세요.' : err.message), 'err');
    }
  };
}

// =========================================================
// 라우터
// =========================================================
const routes = [
  { re: /^\/?$/,                                                  mode: 'visitor', view: () => viewHome(),         live: true },
  { re: /^\/explore(?:\/(floor|club|theme))?$/,                   mode: 'visitor', view: (m) => viewExplore(m),    live: true },
  { re: /^\/booth\/([\w-]+)$/,                                     mode: 'visitor', view: (id) => viewBooth(id),    live: true },
  { re: /^\/q\/([\w-]+)$/,                                         mode: 'visitor', view: (id) => viewQueue(id),    live: true },
  { re: /^\/qr\/([\w-]+)\/([\w-]+)$/,                              mode: 'visitor', view: (id, t) => viewQR(id, t) },
  { re: /^\/my$/,                                                 mode: 'visitor', view: () => viewMy(),           live: true },
  { re: /^\/login$/,                                              mode: 'visitor', view: () => viewLogin('login') },
  { re: /^\/signup$/,                                             mode: 'visitor', view: () => viewLogin('signup') },
  { re: /^\/op\/login$/,                                          mode: 'visitor', view: () => viewLogin('login', 'op') },
  { re: /^\/op(?:\/(edit|crowd|resv))?$/,                         mode: 'op',      view: (t) => viewOp(t),         live: (t) => t !== 'edit' },
  { re: /^\/admin\/login$/,                                       mode: 'visitor', view: () => viewLogin('login', 'admin') },
  { re: /^\/admin(?:\/(dash|booths|resv|qr|notices|accounts|settings))?$/, mode: 'admin', view: (t) => viewAdmin(t),   live: (t) => !t || t === 'dash' || t === 'booths' },
  { re: /^\/password$/,                                           mode: 'visitor', view: () => viewPassword() },
  { re: /^\/setup$/,                                              mode: 'visitor', view: () => viewSetup() },
];

const TABBARS = {
  visitor: [['#/', 'home', '홈', /^\/?$/], ['#/explore/floor', 'map', '둘러보기', /^\/explore/], ['#/my', 'ticket', '내 티켓', /^\/my/]],
  op: [['#/op/edit', 'edit', '편집', /edit/], ['#/op/crowd', 'signal', '줄서기', /crowd/], ['#/op/resv', 'ticket', '예약', /resv/], ['#/', 'eye', '관람객 화면', /^$/]],
  admin: [['#/admin/dash', 'chart', '대시보드', /^\/admin(\/dash)?$/], ['#/admin/booths', 'store', '부스', /booths/], ['#/admin/resv', 'ticket', '예약', /resv/], ['#/admin/notices', 'megaphone', '공지', /notices/], ['#/', 'eye', '관람객 화면', /^$/]],
};

function renderTabbar(mode, path) {
  let items = TABBARS[mode];
  if (mode === 'op') {
    const s = getSession(), b = s && Store.booth(s.boothId);
    if (!b || b.type !== 'reserve') items = items.filter(i => i[2] !== '예약');
    else items = items.map(i => (i[2] === '줄서기' ? [i[0], i[1], '현황', i[3]] : i));
  }
  document.body.classList.toggle('mode-many', items.length > 4);   // 메뉴가 많으면 휴대폰 상단 메뉴를 왼쪽 정렬 + 가로 스크롤
  tabbar.innerHTML = items.map(([href, ic, label, re]) => `<a href="${href}" class="${re.test(path) ? 'on' : ''}">${icon(ic)}${label}</a>`).join('');
  // PC 화면용 상단 메뉴 (하단 탭바와 같은 항목)
  topnav.innerHTML = items.map(([href, , label, re]) => `<a href="${href}" class="${re.test(path) ? 'on' : ''}">${label}</a>`).join('');
  const sess = getSession();
  loginLink.href = !sess ? '#/login' : sess.role === 'admin' ? '#/admin' : sess.role === 'op' ? '#/op' : '#/my';
  loginLink.textContent = !sess ? 'LOGIN' : sess.role === 'admin' ? 'ADMIN' : sess.role === 'op' ? 'MY BOOTH' : `${sess.name}님`;
  loginLink.classList.toggle('named', !!sess && sess.role === 'student');
  document.getElementById('mode-label').textContent = mode === 'op' ? '운영자 모드' : mode === 'admin' ? '관리자 모드' : (sess && sess.role !== 'student' ? (sess.role === 'admin' ? '관리자 로그인됨' : '운영자 로그인됨') : '');
}

function router() {
  if (Store.isSetupNeeded() && location.hash !== '#/setup') { location.hash = '#/setup'; return; }
  const path = location.hash.replace(/^#/, '') || '/';
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const prev = current && current.path;
    current = { route: r, param: m[1], path };
    if (prev !== path) ui.lastResv = path.startsWith('/booth/') ? ui.lastResv : null;
    Store.heartbeat(TAB_ID, r.mode);
    document.body.classList.toggle('is-home', path === '/');
    if (path !== '/') clearInterval(slideTimer);
    renderTabbar(r.mode, path);
    r.view(m[1], m[2]);
    markBanner();
    updateCallBar();
    if (prev !== path) window.scrollTo(0, 0);
    onScroll();
    return;
  }
  location.hash = '#/';
}

// 실시간처럼 보이게: 다른 탭에서 데이터가 바뀌거나 시간이 흐르면 화면 갱신
// 사진 배너가 있는 화면은 홈처럼 상단바를 사진 위에 투명하게 띄움
function markBanner() { document.body.classList.toggle('has-banner', !!app.querySelector('.page-banner')); }

function isLive() {
  if (!current) return false;
  const l = current.route.live;
  return typeof l === 'function' ? l(current.param) : !!l;
}
function softRefresh() {
  const a = document.activeElement;
  const typing = a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
  if (!isLive() || typing || app.querySelector('details[open]:not(.now)')) return;
  const y = window.scrollY;
  current.route.view(current.param);
  markBanner();
  window.scrollTo(0, y);
}

// 상단 시계: 가상 시각이 아니라 이 기기의 "현재 날짜와 시각"을 1초마다 표시
//   (관리자가 시연용 가상 시각을 켜 두었으면 옆에 작게 '시연 HH:MM'을 함께 보여 줌)
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  let sim = '';
  if (Store.db && Store.db.settings && Store.db.settings.timeOffset) {
    const v = new Date(Store.now());
    sim = `<small class="clock-sim" title="관리자가 켠 시연용 가상 시각">시연 ${pad2(v.getHours())}:${pad2(v.getMinutes())}</small>`;
  }
  el.innerHTML = `<span class="clock-date">${dateLabel(dateStr(d.getTime()))}</span><b class="clock-time">${hm}<span class="clock-sec">:${pad2(d.getSeconds())}</span></b>${sim}`;
  el.setAttribute('datetime', d.toISOString());
}

// 로컬 모드: 같은 브라우저의 다른 탭에서 바뀐 내용 반영
window.addEventListener('storage', (e) => {
  if (Store.REMOTE) return;
  if (e.key === Store.KEY) { Store.reloadLocal(); softRefresh(); updateClock(); updateCallBar(); }
  if (e.key === Store.PRESENCE_KEY && current && current.route.mode === 'admin' && isLive()) softRefresh();
});
window.addEventListener('hashchange', router);

// 홈 화면: 사진 위에서는 상단바가 투명, 스크롤하면 불투명하게
function onScroll() { document.body.classList.toggle('scrolled', window.scrollY > 60); }
window.addEventListener('scroll', onScroll, { passive: true });

// 서버 모드: 다른 기기에서 바뀐 내용이 도착하면 화면 갱신 (여러 개가 한꺼번에 와도 한 번만)
let changeTimer = null;
function onStoreChange() {
  if (!current) return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => { softRefresh(); updateClock(); updateCallBar(); }, 150);
}

// 시작!
app.innerHTML = '<p class="empty">불러오는 중…</p>';
Store.init(onStoreChange, (msg) => toast(msg, 'err')).then(() => {
  updateClock();
  setInterval(updateClock, 1000);
  router();
  // 관리자 화면을 열어 두면 30분마다 자동 백업 (이 브라우저에 최근 3개 보관)
  setInterval(() => {
    const s = getSession();
    const last = (Store.snapshots()[0] || {}).at || 0;
    if (s && s.role === 'admin' && Date.now() - last > 30 * 60000) Store.snapshot('30분 자동 백업');
  }, 60000);
  setInterval(() => {
    Store.autoNoShow();
    if (current) Store.heartbeat(TAB_ID, current.route.mode);
    updateClock();
    softRefresh();
    updateCallBar();
  }, 10000);
});
