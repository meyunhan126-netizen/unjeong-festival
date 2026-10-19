/* =========================================================
   운정 페스티벌 - 데이터 저장소 (Store)

   두 가지 방식으로 동작합니다.
   1) 로컬 모드  : js/firebase-config.js 가 비어 있으면 브라우저 localStorage에 저장 (혼자 연습/시연용)
   2) 서버 모드  : firebase-config.js 를 채우면 Firebase(Firestore)에 저장
                  → 모든 휴대폰이 같은 데이터를 실시간으로 봅니다.

   화면(app.js)은 어느 모드든 같은 함수를 부릅니다.
   데이터를 바꿀 때는 먼저 메모리(db)를 고치고 → commit()으로 저장소에 기록합니다.
   ========================================================= */

// ---------- 공용 도우미 ----------
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function toMin(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
function fromMin(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// 부스가 차지하는 교실을 하나의 문자열로 (같은 교실에 부스 2개가 들어가지 않게 비교할 때 사용)
const roomKey = (b) => `${b.building || 'main'}|${b.floor}|${b.room}`;

const Store = (() => {
  const REMOTE = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  const KEY = 'unjeong-fest-v2';
  const PRESENCE_KEY = 'unjeong-presence';
  const DEVICE_KEY = 'unjeong-device';
  const SESSION_KEY = 'unjeong-session';
  const BACKUP_KEY = 'unjeong-backups';     // 자동 백업(최근 3개) 저장 위치
  const EMAIL_DOMAIN = '@unjeong.app';     // 로그인 아이디 booth01 → booth01@unjeong.app 로 Firebase에 가입
  const STUDENT_RE = /^(\d{5})([가-힣]{2,5})$/;   // 참여자 아이디 = 학번(5자리) + 이름  예) 20315홍길동
  // Firebase는 비밀번호가 6자 이상이어야 해서, 내부적으로 뒤에 고정 문자를 붙여 저장합니다. (사용자는 1234처럼 짧게 입력 가능)
  const authPw = (pw) => String(pw) + '#ujhs';
  const staffEmail = (id) => id.trim().toLowerCase() + EMAIL_DOMAIN;
  const studentEmail = (no) => 'stu-' + no + EMAIL_DOMAIN;
  const ACTIVE = ['reserved', 'checked'];   // 자리를 차지하는 예약 상태
  const T_LIVE = ['waiting', 'called'];     // 아직 끝나지 않은 번호표 상태
  const VERSION = 5;

  let db = null;
  let fs = null, auth = null;               // Firebase 객체 (서버 모드)
  let session = null;                       // { role: 'admin'|'op'|'student', id, boothId, name, studentNo }
  let needsSetup = false;
  let onChange = () => {};
  let onError = (msg) => alert(msg);

  // =========================================================
  // 시작
  // =========================================================
  async function init(changeCb, errorCb) {
    onChange = changeCb || onChange;
    onError = errorCb || onError;
    if (!REMOTE) { loadLocal(); return; }

    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    fs = firebase.firestore();
    if (FIREBASE_CONFIG.useEmulator) {      // 개발용: 내 컴퓨터의 Firebase 에뮬레이터에 연결
      auth.useEmulator('http://127.0.0.1:9099');
      fs.useEmulator('127.0.0.1', 8080);
    }
    // 서버 절약 ①: 받은 데이터를 휴대폰에 저장해 두고, 다시 열 때는 바뀐 것만 받음 (+ 잠깐 끊겨도 화면 유지)
    try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* 지원 안 되는 브라우저면 그냥 진행 */ }
    db = { version: VERSION, settings: defaultSettings(), booths: [], slots: [], reservations: [], notices: [], accounts: [], queues: [], tickets: [], securityLog: [], blocked: [] };

    await new Promise((resolve) => {
      let first = true;
      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          // 관람객은 회원가입 없이 "익명 로그인" → 이 기기의 예약을 구분하는 데 사용
          try { await auth.signInAnonymously(); return; }
          catch (e) { onError('익명 로그인 실패: Firebase 콘솔 > Authentication 에서 "익명" 로그인을 켜주세요.'); }
        }
        session = user ? await loadProfile(user) : null;
        subscribeScoped(user);
        if (first) { first = false; await subscribePublic(); resolve(); }
        else onChange('auth');
      });
    });
  }

  async function loadProfile(user) {
    if (!user || user.isAnonymous) return null;
    try {
      const u = await fs.collection('users').doc(user.uid).get();
      if (!u.exists) return null;
      const d = u.data();
      return { role: d.role, id: d.loginId, boothId: d.boothId || null, name: d.name || '', studentNo: d.studentNo || '' };
    } catch (e) { return null; }
  }

  // ----- 실시간 구독 (서버 데이터가 바뀌면 자동으로 db 갱신) -----
  const unsubs = {};
  const docs = (snap) => snap.docs.map(d => ({ ...d.data(), id: d.id }));
  function listen(name, ref, apply) {
    return new Promise((resolve) => {
      if (unsubs[name]) unsubs[name]();
      unsubs[name] = ref.onSnapshot(
        (snap) => { apply(snap); if (health.state !== 'ok' && !snap.metadata.fromCache) setHealth('ok'); onChange(name); resolve(); },
        (err) => { console.error(name, err); noteError(err); resolve(); }
      );
    });
  }
  const PUBLIC = ['settings', 'booths', 'slots', 'notices', 'queues'];
  let paused = false;
  // 서버 절약 ②: 관람객 화면이 1분 넘게 꺼져 있으면(주머니 속 휴대폰) 공용 데이터 실시간 연결을 멈췄다가, 다시 보면 이어 받음
  //   (내 예약·번호표 연결은 유지 → 호출 알림은 그대로 옴)
  function pauseLive() {
    if (!REMOTE || paused || (session && (session.role === 'admin' || session.role === 'op'))) return;
    PUBLIC.forEach(k => { if (unsubs[k]) { unsubs[k](); delete unsubs[k]; } });
    paused = true;
  }
  function resumeLive() {
    if (!REMOTE || !paused) return;
    paused = false;
    subscribePublic();
  }
  function subscribePublic() {
    return Promise.all([
      listen('settings', fs.collection('settings').doc('main'), (s) => {
        needsSetup = !s.exists;
        db.settings = s.exists ? { ...defaultSettings(), ...s.data() } : defaultSettings();
      }),
      listen('booths', fs.collection('booths'), (s) => { db.booths = docs(s).map(b => ({ building: 'main', ...b })); }),
      listen('slots', fs.collection('slots'), (s) => { db.slots = docs(s); }),
      listen('notices', fs.collection('notices'), (s) => { db.notices = docs(s); }),
      listen('queues', fs.collection('queues'), (s) => { db.queues = docs(s); }),
    ]);
  }
  // 예약 정보는 개인정보라서 역할마다 볼 수 있는 범위가 다릅니다.
  function subscribeScoped(user) {
    let q = null;
    if (session && session.role === 'admin') q = fs.collection('reservations');
    else if (session && session.role === 'op') q = fs.collection('reservations').where('boothId', '==', session.boothId);
    else if (user) q = fs.collection('reservations').where('device', '==', user.uid);
    db.reservations = [];
    if (unsubs.reservations) { unsubs.reservations(); delete unsubs.reservations; }
    if (q) listen('reservations', q, (s) => { db.reservations = docs(s); });

    // 줄서기 번호표도 같은 범위로 (관람객은 내 것만, 운영자는 우리 부스, 관리자는 전부)
    let tq = null;
    if (session && session.role === 'admin') tq = fs.collection('tickets');
    else if (session && session.role === 'op') tq = fs.collection('tickets').where('boothId', '==', session.boothId);
    else if (user) tq = fs.collection('tickets').where('device', '==', user.uid);
    db.tickets = [];
    if (unsubs.tickets) { unsubs.tickets(); delete unsubs.tickets; }
    if (tq) listen('tickets', tq, (s) => { db.tickets = docs(s); });

    db.accounts = [];
    if (unsubs.users) { unsubs.users(); delete unsubs.users; }
    // 보안: 관리자는 보안 로그·차단 목록 전체, 다른 기기는 "내 기기가 차단됐는지"만
    ['securityLog', 'blocked'].forEach(k => { if (unsubs[k]) { unsubs[k](); delete unsubs[k]; } });
    db.securityLog = []; db.blocked = [];
    if (session && session.role === 'admin') {
      listen('securityLog', fs.collection('securityLog').orderBy('at', 'desc').limit(300), (s) => { db.securityLog = docs(s); autoBlock(); });
      listen('blocked', fs.collection('blocked'), (s) => { db.blocked = docs(s); });
    } else if (user) {
      listen('blocked', fs.collection('blocked').doc(user.uid), (d) => { db.blocked = d.exists ? [{ ...d.data(), id: d.id }] : []; });
    }
    if (session && session.role === 'admin') {
      listen('users', fs.collection('users'), (s) => {
        db.accounts = s.docs.map(d => ({ uid: d.id, id: d.data().loginId, pw: d.data().initialPw || '', role: d.data().role, boothId: d.data().boothId || null, studentNo: d.data().studentNo || '', name: d.data().name || '' }));
      });
    }
  }

  function dropScoped() {
    ['reservations', 'tickets'].forEach(k => { if (unsubs[k]) { unsubs[k](); delete unsubs[k]; } });
  }

  // ----- 저장 -----
  // ops = [['set'|'update'|'delete', 컬렉션, 문서ID, 데이터], ...]
  const clean = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
  function commit(ops) {
    if (!REMOTE) return Promise.resolve(saveLocal());
    const chunks = [];
    for (let i = 0; i < ops.length; i += 450) chunks.push(ops.slice(i, i + 450));   // 한 번에 최대 500개 제한
    return Promise.all(chunks.map((ch) => {
      const batch = fs.batch();
      ch.forEach(([op, col, id, data]) => {
        const ref = fs.collection(col).doc(id);
        if (op === 'set') batch.set(ref, clean(data));
        else if (op === 'update') batch.update(ref, clean(data));
        else batch.delete(ref);
      });
      return batch.commit();
    })).then(() => true).catch((e) => { onError(errMsg(e)); return false; });
  }
  function errMsg(e) {
    noteError(e);
    if (e && e.code === 'resource-exhausted') return '서버 사용량 한도를 넘었어요. 운영 본부에 알려 주세요.';
    if (e && e.code === 'permission-denied') return '권한이 없습니다. 다시 로그인해 주세요.';
    if (e && e.code === 'unavailable') return '인터넷 연결을 확인해 주세요.';
    return '오류: ' + (e && e.message ? e.message : e);
  }

  // ----- 로컬 모드 -----
  function loadLocal() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (db && db.version === 2) { migrateV2(db); saveLocal(); }
    if (db && db.version === 3) { migrateV3(db); saveLocal(); }
    if (db && db.version === 4) { migrateV4(db); saveLocal(); }
    if (!db || db.version !== VERSION) { db = createSeed(); saveLocal(); }
    // 미리 준비된 관리자 계정은 항상 있도록
    if (!db.accounts.some(a => a.role === 'admin')) { db.accounts.unshift({ id: ADMIN_ID, pw: ADMIN_PW, role: 'admin' }); saveLocal(); }
    // 예전 기본 이름을 쓰던 데이터는 새 이름으로 바꿔줌
    if (db.settings.festivalName === '2026 운정 페스티벌') Object.assign(db.settings, { festivalName: 'UJHS Festival', subtitle: '운정고등학교 동아리 발표회' });
    if (!db.settings.heroPhotos) db.settings.heroPhotos = [];
    db.settings = { ...defaultSettings(), ...db.settings };   // 새로 생긴 설정 항목은 기본값으로 채움
    db.securityLog = db.securityLog || []; db.blocked = db.blocked || [];
    try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }
    autoNoShow();
  }
  function reloadLocal() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.version === VERSION) db = d; } catch (e) {}
  }
  // 예전(1·2·3층 임시 배치) 데이터를 새 건물 배치(본관/후관 1~5층)로 옮김. 부스·예약은 그대로 유지
  function migrateV2(d) {
    const used = new Set();
    const bad = [];
    d.booths.forEach(b => {
      b.building = b.building || 'main';
      const k = roomKey(b);
      if (bookableRooms(b.building, b.floor).includes(b.room) && !used.has(k)) used.add(k);
      else bad.push(b);
    });
    bad.forEach(b => {
      outer: for (const bid of Object.keys(BUILDINGS)) for (const f of FLOOR_NUMS) for (const r of bookableRooms(bid, f)) {
        if (!used.has(`${bid}|${f}|${r}`)) { Object.assign(b, { building: bid, floor: f, room: r }); used.add(roomKey(b)); break outer; }
      }
    });
    d.accounts = [{ id: ADMIN_ID, pw: ADMIN_PW, role: 'admin' }, ...d.accounts.filter(a => a.role !== 'admin')];
    d.settings.requireLogin = true;
    d.version = 3;
  }
  // v3 → v4: 직접 입력하던 대기 인원(b.waiting)을 QR 줄서기 번호표로 옮김
  function migrateV3(d) {
    d.queues = d.queues || [];
    d.tickets = d.tickets || [];
    d.settings = { ...defaultSettings(), ...d.settings };
    d.booths.forEach(b => {
      if (d.queues.some(q => q.id === b.id)) return;
      const q = { id: b.id, seq: 0, waiting: 0, nowServing: 0, open: true, createdAt: Date.now(), lastCallAt: Date.now() };
      if (b.type !== 'reserve') {
        for (let k = 0; k < (Number(b.waiting) || 0); k++) {
          q.seq++; q.waiting++;
          d.tickets.push({ id: uid('t'), boothId: b.id, no: q.seq, name: '현장대기', device: 'migrated', status: 'waiting', source: 'walkin', createdAt: Date.now() });
        }
      }
      d.queues.push(q);
    });
    d.version = 4;
  }
  // v4 → v5: 회차에 날짜가 생기고, 예약에 인원·전화번호가 생김.
  //   예전 예약은 날짜가 없어 이어 쓸 수 없으므로 "오늘 기준"으로 깨끗하게 다시 시작 (부스·계정·공지는 유지)
  function migrateV4(d) {
    const today = dateStr();
    d.settings = { ...defaultSettings(), ...d.settings, festivalDates: [today], timeOffset: 0 };
    d.reservations = [];
    d.tickets = [];
    d.slots = [];
    d.queues = d.booths.map(b => ({ id: b.id, seq: 0, waiting: 0, nowServing: 0, open: true, createdAt: Date.now(), lastCallAt: Date.now() }));
    d.booths.forEach(b => {
      Object.assign(b, { resvOpen: true, stopped: false });
      if (!b.qrToken) Object.assign(b, { qrToken: newToken(), qrCreatedAt: Date.now() });
      if (b.type === 'reserve') {
        b.slotConfig = b.slotConfig || { start: '10:00', end: '16:00', interval: 20, capacity: 6 };
        d.slots.push(...buildSlots(b.id, b.slotConfig, [today]));
      }
    });
    d.version = 5;
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { onError('저장 공간이 부족합니다. 사진 크기나 개수를 줄여주세요.'); return false; }
  }

  // =========================================================
  // 시간
  // =========================================================
  function now() { return Date.now() + (db && db.settings ? db.settings.timeOffset || 0 : 0); }
  function nowMin() { const d = new Date(now()); return d.getHours() * 60 + d.getMinutes(); }
  function setSimTime(hm) {
    let offset = 0;
    if (hm) {
      const d = new Date();
      offset = (toMin(hm) - (d.getHours() * 60 + d.getMinutes())) * 60000 - d.getSeconds() * 1000;
    }
    return setSettings({ timeOffset: offset });
  }

  // 이 기기를 구분하는 값 (서버 모드에서는 익명 로그인 ID)
  function device() {
    if (REMOTE) return auth && auth.currentUser ? auth.currentUser.uid : 'none';
    if (session && session.role === 'student') return 'stu:' + session.id;   // 참여자 로그인 시 계정 기준 (다른 기기에서도 내 예약 보임)
    let d = null;
    try { d = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!d) { d = uid('dev'); try { localStorage.setItem(DEVICE_KEY, d); } catch (e) {} }
    return d;
  }

  // =========================================================
  // 부스
  // =========================================================
  const booths = () => db.booths;
  const booth = (id) => db.booths.find(b => b.id === id);
  const publicBooths = () => db.booths.filter(b => b.status === 'approved');
  function updateBooth(id, patch) { Object.assign(booth(id), patch); return commit([['update', 'booths', id, patch]]); }
  function setCrowd(id, patch) { return updateBooth(id, { ...patch, crowdUpdatedAt: now() }); }
  // 혼잡도 방식 바꾸기. 직접 입력으로 바꿀 때는 지금 보이는 값을 이어받아 숫자가 갑자기 0이 되지 않게 함
  function setCrowdMode(id, mode) {
    const b = booth(id);
    if (!b || b.type === 'reserve') return Promise.resolve(false);
    if (mode === 'manual') {
      const w = waitingOf(b), lv = crowdKey(b);
      return setCrowd(id, { crowdMode: 'manual', waiting: w, crowd: lv === 'closed' ? 'free' : lv });
    }
    return setCrowd(id, { crowdMode: 'qr' });
  }
  // QR 방식에서 운영자가 혼잡도를 직접 고정 ('' = 자동으로 되돌리기)
  function setCrowdOverride(id, level) { return setCrowd(id, { crowdOverride: CROWD[level] ? level : '' }); }
  // QR 방식에서 대기 인원 보정 (QR 없이 줄 선 사람 +, 이미 떠난 사람 -)
  function setWaitAdjust(id, n) { return setCrowd(id, { waitAdjust: Math.max(-99, Math.min(99, Math.round(Number(n) || 0))) }); }

  // ---------- 혼잡도: 사람이 입력하지 않고 자동으로 계산 ----------
  //   당일 부스 = QR 줄서기 대기 인원 / 예약 부스 = 다가오는 3회차의 예약률
  function crowdKey(b) {
    if (b.stopped) return 'closed';
    const st = db.settings;
    if (b.type === 'reserve') {
      const next = slotsOf(b.id).filter(s => !s.blocked && slotEndTs(s) > now()).slice(0, 3);
      const cap = next.reduce((a, s) => a + s.capacity, 0);
      if (!cap) return 'free';
      const ratio = next.reduce((a, s) => a + (s.count || 0), 0) / cap;
      return ratio >= 0.9 ? 'busy' : ratio >= 0.5 ? 'normal' : 'free';
    }
    // 당일 부스: 직접 입력 방식이면 운영자가 고른 값, QR 방식이면 운영자 조정값 → 없으면 대기 인원으로 자동
    if (isManual(b)) return CROWD[b.crowd] && b.crowd !== 'closed' ? b.crowd : 'free';
    if (b.crowdOverride && CROWD[b.crowdOverride]) return b.crowdOverride;
    return levelOf(waitingOf(b));
  }
  // 대기 인원 → 혼잡도 단계 (관리자 → 설정의 기준 인원)
  const levelOf = (w) => (w >= db.settings.queueBusy ? 'busy' : w >= db.settings.queueNormal ? 'normal' : 'free');
  // 당일 부스의 혼잡도 방식: 'qr'(QR 줄서기로 자동, 기본) | 'manual'(운영자가 직접 입력)
  const isManual = (b) => b.type !== 'reserve' && b.crowdMode === 'manual';
  function waitMinutes(b) { return waitingOf(b) * b.minPerPerson; }
  // 경고: 직접 입력 방식은 오랫동안 혼잡도를 안 바꿈 / QR 방식은 대기자가 있는데 오랫동안 호출이 없음
  function isStale(b) {
    if (b.stopped || b.type === 'reserve') return false;
    if (isManual(b)) return now() - (b.crowdUpdatedAt || 0) > db.settings.staleMin * 60000;
    const q = queue(b.id);
    if (!q.waiting) return false;
    const since = q.lastCallAt || q.createdAt || 0;
    return !!since && now() - since > db.settings.staleMin * 60000;
  }

  // =========================================================
  // 예약 회차(슬롯): { id, boothId, date('YYYY-MM-DD'), start, end, capacity(명), count(예약된 인원), blocked }
  // =========================================================
  const today = () => dateStr(now());
  const slotTs = (s) => dateTimeTs(s.date || today(), s.start);
  const slotEndTs = (s) => dateTimeTs(s.date || today(), s.end);
  const slot = (id) => db.slots.find(s => s.id === id);
  const slotsOf = (boothId, date = null) => db.slots.filter(s => s.boothId === boothId && (!date || s.date === date))
    .sort((a, b) => slotTs(a) - slotTs(b));
  const slotCount = (slotId) => { const s = slot(slotId); return s ? s.count || 0 : 0; };
  const slotLeft = (s) => Math.max(0, s.capacity - (s.count || 0));
  const bookedOf = (boothId) => slotsOf(boothId).reduce((n, s) => n + (s.count || 0), 0);
  // 예약 마감 시각 = 회차 시작 - resvCloseMin 분
  const closeTs = (s) => slotTs(s) - (db.settings.resvCloseMin || 0) * 60000;
  // 지금 이 회차를 예약할 수 있는가? (사유를 함께 돌려줌)
  function slotState(s) {
    const b = booth(s.boothId);
    if (now() >= slotTs(s)) return { ok: false, label: '종료' };
    if (now() >= closeTs(s)) return { ok: false, label: '마감' };
    if (s.blocked) return { ok: false, label: '예약불가' };
    if (b && (b.stopped || b.resvOpen === false)) return { ok: false, label: '접수마감' };
    if (slotLeft(s) <= 0) return { ok: false, label: '만석' };
    return { ok: true, label: `잔여 ${slotLeft(s)}` };
  }
  // 앞으로 예약 가능한 자리 수 (date 를 주면 그 날짜만)
  const remaining = (boothId, date = null) => slotsOf(boothId, date).filter(s => slotState(s).ok).reduce((n, s) => n + slotLeft(s), 0);
  const remainingToday = (boothId) => remaining(boothId, today());
  // 이 부스가 예약을 받는 날짜 목록 (회차가 있는 날짜)
  const datesOf = (boothId) => [...new Set(slotsOf(boothId).map(s => s.date))].sort();

  // 회차 다시 만들기: 예약 기록이 있는 회차는 남기고, 빈 회차만 새 설정으로 교체
  function generateSlots(boothId, cfg, dates = db.settings.festivalDates) {
    const mine = db.slots.filter(s => s.boothId === boothId);
    const keep = mine.filter(s => (s.count || 0) > 0 || db.reservations.some(r => r.slotId === s.id));
    const ops = [];
    mine.filter(s => !keep.includes(s)).forEach(s => ops.push(['delete', 'slots', s.id]));
    db.slots = db.slots.filter(s => s.boothId !== boothId || keep.includes(s));
    buildSlots(boothId, cfg, dates).forEach(s => {
      const existing = keep.find(k => k.date === s.date && k.start === s.start);
      if (existing) {
        existing.capacity = Math.max(cfg.capacity, existing.count || 0);
        ops.push(['update', 'slots', existing.id, { capacity: existing.capacity }]);
        return;
      }
      db.slots.push(s);
      ops.push(['set', 'slots', s.id, s]);
    });
    booth(boothId).slotConfig = cfg;
    ops.push(['update', 'booths', boothId, { slotConfig: cfg }]);
    commit(ops);
    return keep.length;
  }
  function toggleSlot(slotId) {
    const s = slot(slotId);
    s.blocked = !s.blocked;
    return commit([['update', 'slots', slotId, { blocked: s.blocked }]]);
  }
  function setSlotCapacity(slotId, capacity) {
    const s = slot(slotId);
    s.capacity = Math.max(Number(capacity) || 1, s.count || 0);   // 이미 예약된 인원보다 줄일 수는 없음
    return commit([['update', 'slots', slotId, { capacity: s.capacity }]]);
  }
  function setResvOpen(boothId, open) { return updateBooth(boothId, { resvOpen: !!open }); }

  // =========================================================
  // 예약: { code, slotId, boothId, device, name, phone(숫자만), party(인원), status, createdAt }
  // =========================================================
  const resv = (id) => db.reservations.find(r => r.id === id);
  const partyOf = (r) => Math.max(1, Number(r.party) || 1);
  const myResv = () => db.reservations.filter(r => r.device === device() && slot(r.slotId))
    .sort((a, b) => slotTs(slot(a.slotId)) - slotTs(slot(b.slotId)));
  const resvOfBooth = (boothId) => db.reservations.filter(r => r.boothId === boothId);
  const normPhone = (p) => String(p || '').replace(/\D/g, '');
  const fmtPhone = (p) => { const d = normPhone(p); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d; };

  async function reserve(slotId, { name, phone, party }) {
    const g = guardAction('예약');
    if (g) return { ok: false, msg: g };
    const s = slot(slotId);
    const b = s && booth(s.boothId);
    if (!s || !b) return { ok: false, msg: '존재하지 않는 시간대입니다.' };
    party = Math.floor(Number(party) || 0);
    phone = normPhone(phone);
    name = String(name || '').trim();
    if (!name) return { ok: false, msg: '이름을 입력해 주세요.' };
    if (!/^01\d{8,9}$/.test(phone)) return { ok: false, msg: '전화번호를 정확히 입력해 주세요. 예) 010-1234-5678' };
    if (party < 1 || party > db.settings.maxParty) return { ok: false, msg: `인원은 1~${db.settings.maxParty}명까지 예약할 수 있어요.` };
    const st = slotState(s);
    if (!st.ok) return { ok: false, msg: st.label === '만석' ? '아쉽지만 방금 마감되었어요.' : `지금은 예약할 수 없는 회차예요. (${st.label})` };
    if (slotLeft(s) < party) return { ok: false, msg: `남은 자리가 ${slotLeft(s)}명뿐이에요. 인원을 줄여 주세요.` };

    const mine = myResv().filter(r => r.status === 'reserved');
    if (mine.length >= db.settings.maxPerPerson)
      return { ok: false, msg: `예약은 1인당 최대 ${db.settings.maxPerPerson}개까지 가능합니다.` };
    if (mine.some(r => r.boothId === b.id))
      return { ok: false, msg: '이미 이 부스를 예약했어요. 내 티켓에서 확인하세요.' };
    const overlap = mine.find(r => {
      const o = slot(r.slotId);
      return slotTs(o) < slotEndTs(s) && slotTs(s) < slotEndTs(o);
    });
    if (overlap) return { ok: false, msg: `같은 시간에 '${booth(overlap.boothId).name}' 예약이 있어요.` };

    const r = { code: makeCode(), slotId, boothId: b.id, device: device(), name, phone, party, status: 'reserved', createdAt: now() };

    if (!REMOTE) {
      r.id = uid('r');
      db.reservations.push(r);
      s.count = (s.count || 0) + party;
      saveLocal();
      return { ok: true, resv: r };
    }

    // 서버 모드: 트랜잭션으로 "남은 자리 확인 + 인원 +party + 예약 생성"을 한 번에 → 동시 예약에도 초과되지 않음
    const ref = fs.collection('reservations').doc();
    try {
      await fs.runTransaction(async (tx) => {
        const sref = fs.collection('slots').doc(slotId);
        const snap = await tx.get(sref);
        const sd = snap.data();
        if (!snap.exists || sd.blocked) throw new Error('BLOCKED');
        if ((sd.count || 0) + party > sd.capacity) throw new Error('FULL');
        tx.update(sref, { count: (sd.count || 0) + party, lastResv: ref.id });
        tx.set(ref, r);
      });
    } catch (e) {
      if (e.message === 'FULL') return { ok: false, msg: '아쉽지만 방금 자리가 찼어요. 인원을 줄이거나 다른 회차를 골라 주세요.' };
      if (e.message === 'BLOCKED') return { ok: false, msg: '예약을 받지 않는 시간대입니다.' };
      if (e.code === 'permission-denied') return { ok: false, msg: '아쉽지만 방금 마감되었어요.' };
      return { ok: false, msg: errMsg(e) };
    }
    return { ok: true, resv: { ...r, id: ref.id } };
  }

  // 예약 상태 변경 (입장/노쇼/취소). 회차 인원(count)도 예약 인원만큼 함께 맞춥니다.
  async function setResvStatus(id, status) {
    const r = resv(id);
    if (!r || r.status === status) return true;
    const p = partyOf(r);
    if (!REMOTE) {
      const delta = ((ACTIVE.includes(status) ? 1 : 0) - (ACTIVE.includes(r.status) ? 1 : 0)) * p;
      const s = slot(r.slotId);
      if (s && delta) s.count = Math.max(0, (s.count || 0) + delta);
      r.status = status;
      if (status === 'checked') r.checkedAt = now();
      return saveLocal();
    }
    try {
      await fs.runTransaction(async (tx) => {
        const rref = fs.collection('reservations').doc(id);
        const sref = fs.collection('slots').doc(r.slotId);
        const rs = await tx.get(rref);
        const ss = await tx.get(sref);
        const old = rs.data().status;
        if (old === status) return;
        const delta = ((ACTIVE.includes(status) ? 1 : 0) - (ACTIVE.includes(old) ? 1 : 0)) * p;
        tx.update(rref, status === 'checked' ? { status, checkedAt: now() } : { status });
        if (delta && ss.exists) tx.update(sref, { count: Math.max(0, (ss.data().count || 0) + delta), lastResv: id });
      });
      return true;
    } catch (e) { onError(errMsg(e)); return false; }
  }

  async function checkIn(boothId, code) {
    const r = db.reservations.find(x => x.boothId === boothId && x.code === code.trim().toUpperCase());
    if (!r) return { ok: false, msg: '이 부스의 예약번호가 아닙니다.' };
    if (r.status === 'checked') return { ok: false, msg: '이미 입장 처리된 예약입니다.' };
    if (r.status === 'cancelled') return { ok: false, msg: '취소된 예약입니다.' };
    const ok = await setResvStatus(r.id, 'checked');
    return ok ? { ok: true, resv: r } : { ok: false, msg: '입장 처리에 실패했어요.' };
  }

  // 회차 시작 + 유예시간이 지나도 입장하지 않으면 노쇼 처리 → 자리 반환
  const pendingNoShow = new Set();
  function autoNoShow() {
    if (!db.settings) return;
    const late = db.reservations.filter(r => {
      const s = slot(r.slotId);
      return r.status === 'reserved' && s && slotTs(s) + db.settings.graceMin * 60000 < now() && !pendingNoShow.has(r.id);
    });
    late.forEach(r => {
      pendingNoShow.add(r.id);
      setResvStatus(r.id, 'noshow').finally(() => pendingNoShow.delete(r.id));
    });
    autoNoShowTickets();
  }

  // =========================================================
  // 관리자: 행사 날짜 · 운영 초기화
  // =========================================================
  // 예약 날짜 바꾸기 → 모든 예약 부스의 회차를 새 날짜로 다시 만듦 (예약이 있는 회차는 유지)
  function setFestivalDates(dates) {
    dates = [...new Set(dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    if (!dates.length) dates = [today()];
    setSettings({ festivalDates: dates });
    db.booths.filter(b => b.type === 'reserve').forEach(b => generateSlots(b.id, b.slotConfig || { start: '10:00', end: '16:00', interval: 20, capacity: 6 }, dates));
    return dates;
  }

  // 한 부스의 예약만 초기화: 예약 기록을 지우고 회차를 행사 날짜 기준으로 새로 만듦
  function resetBoothReservations(boothId) {
    const b = booth(boothId);
    if (!b || b.type !== 'reserve') return Promise.resolve(false);
    const ops = [];
    db.reservations.filter(r => r.boothId === boothId).forEach(r => ops.push(['delete', 'reservations', r.id]));
    db.slots.filter(s => s.boothId === boothId).forEach(s => ops.push(['delete', 'slots', s.id]));
    db.reservations = db.reservations.filter(r => r.boothId !== boothId);
    db.slots = db.slots.filter(s => s.boothId !== boothId);
    const cfg = b.slotConfig || { start: '10:00', end: '16:00', interval: 20, capacity: 6 };
    const list = buildSlots(boothId, cfg, db.settings.festivalDates || [today()]);
    db.slots.push(...list);
    list.forEach(s => ops.push(['set', 'slots', s.id, s]));
    return commit(ops);
  }

  // 운영 초기화: opts = { reservations, queue, status, dates:[...] }
  //   reservations : 예약 기록 삭제 + 회차를 (dates 기준으로) 새로 만듦
  //   queue        : 줄서기 번호표 삭제 + 번호를 1번부터 다시
  //   status       : 운영 중단·한 줄 공지·접수 마감 풀기, 가상 시각 끄기
  async function resetOperations(opts = {}) {
    snapshot('운영 초기화 직전 자동 백업');
    const dates = opts.dates && opts.dates.length ? opts.dates : [today()];
    const ops = [];
    if (opts.reservations) {
      db.reservations.forEach(r => ops.push(['delete', 'reservations', r.id]));
      db.slots.forEach(s => ops.push(['delete', 'slots', s.id]));
      db.reservations = [];
      db.slots = [];
      db.booths.filter(b => b.type === 'reserve').forEach(b => {
        const cfg = b.slotConfig || { start: '10:00', end: '16:00', interval: 20, capacity: 6 };
        b.slotConfig = cfg;
        const list = buildSlots(b.id, cfg, dates);
        db.slots.push(...list);
        list.forEach(s => ops.push(['set', 'slots', s.id, s]));
        ops.push(['update', 'booths', b.id, { slotConfig: cfg }]);
      });
      Object.assign(db.settings, { festivalDates: dates });
      ops.push(['update', 'settings', 'main', { festivalDates: dates }]);
    }
    if (opts.queue) {
      db.tickets.forEach(t => ops.push(['delete', 'tickets', t.id]));
      db.tickets = [];
      db.booths.forEach(b => {
        const q = { id: b.id, seq: 0, waiting: 0, nowServing: 0, open: true, createdAt: now(), lastCallAt: now() };
        db.queues = db.queues.filter(x => x.id !== b.id).concat(q);
        ops.push(['set', 'queues', b.id, q]);
      });
    }
    if (opts.status) {
      db.booths.forEach(b => {
        const patch = { stopped: false, shortNotice: '', resvOpen: true, crowdUpdatedAt: now(), crowdOverride: '', waitAdjust: 0, crowd: 'free', waiting: 0 };
        Object.assign(b, patch);
        ops.push(['update', 'booths', b.id, patch]);
      });
      db.settings.timeOffset = 0;
      ops.push(['update', 'settings', 'main', { timeOffset: 0 }]);
    }
    return commit(ops);
  }

  // =========================================================
  // QR 코드 (관리자): 부스마다 무작위 값(qrToken)을 넣은 주소를 QR로 만듦
  //   삭제하면 qrToken 이 지워져서, 이미 인쇄한 QR을 찍어도 "사용할 수 없는 QR"로 안내됨
  // =========================================================
  function createQR(boothId) { return updateBooth(boothId, { qrToken: newToken(), qrCreatedAt: now() }); }
  function deleteQR(boothId) { return updateBooth(boothId, { qrToken: '', qrCreatedAt: 0 }); }
  const qrValid = (boothId, token) => { const b = booth(boothId); return !!(b && b.qrToken && token && b.qrToken === token); };

  // =========================================================
  // QR 줄서기 (당일 부스)
  //   queues/{부스ID} : { seq(마지막 발급 번호), waiting(대기 인원), nowServing(마지막 호출 번호), open, lastCallAt }
  //   tickets/{ID}    : { boothId, no, name, device, status, source('qr'|'walkin'), createdAt, calledAt, enteredAt }
  //   status: waiting(대기) → called(호출) → entered(입장) | noshow(노쇼) | cancelled(취소)
  // =========================================================
  const emptyQueue = (id) => ({ id, seq: 0, waiting: 0, nowServing: 0, open: true, createdAt: now(), lastCallAt: 0 });
  const queue = (boothId) => (db.queues || []).find(q => q.id === boothId) || emptyQueue(boothId);
  const hasQueue = (boothId) => (db.queues || []).some(q => q.id === boothId);
  // 관람객에게 보이는 대기 인원
  //   직접 입력: 운영자가 입력한 숫자 / QR: QR 번호표 대기 인원 + 운영자 보정(QR 없이 줄 선 사람 등, 음수 가능)
  const waitingOf = (b) => (isManual(b) ? Math.max(0, Number(b.waiting) || 0)
    : Math.max(0, (queue(b.id).waiting || 0) + (Number(b.waitAdjust) || 0)));
  const ticket = (id) => db.tickets.find(t => t.id === id);
  const ticketsOf = (boothId) => db.tickets.filter(t => t.boothId === boothId).sort((a, b) => a.no - b.no);
  const myTickets = () => db.tickets.filter(t => t.device === device() && t.source !== 'walkin').sort((a, b) => b.createdAt - a.createdAt);
  const myActiveTickets = () => myTickets().filter(t => T_LIVE.includes(t.status));

  // 내 앞에 몇 명? (운영자·관리자·로컬 모드는 정확히, 서버의 관람객은 공개 정보로 추정)
  function aheadOf(t) {
    if (t.status !== 'waiting') return 0;
    const exact = !REMOTE || (session && (session.role === 'admin' || session.role === 'op'));
    if (exact) return db.tickets.filter(x => x.boothId === t.boothId && x.status === 'waiting' && x.no < t.no).length;
    const q = queue(t.boothId);
    return Math.max(0, Math.min(t.no - (q.nowServing || 0) - 1, (q.waiting || 1) - 1));
  }

  // 줄이 없으면 만들기 (부스 추가·복구·운영자 화면에서 호출)
  function ensureQueue(boothId) {
    if (hasQueue(boothId)) return Promise.resolve(true);
    const q = emptyQueue(boothId);
    q.lastCallAt = now();
    db.queues.push(q);
    return commit([['set', 'queues', boothId, q]]);
  }

  // 줄서기 (관람객: source 'qr' / 운영자의 현장 등록: source 'walkin')
  async function joinQueue(boothId, name, source = 'qr') {
    const b = booth(boothId);
    name = String(name || '').trim().slice(0, 10);
    if (!b || b.type === 'reserve') return { ok: false, msg: '줄서기를 받지 않는 부스입니다.' };
    if (!name) return { ok: false, msg: '이름을 입력해 주세요.' };
    if (b.stopped) return { ok: false, msg: '현재 운영이 중단된 부스입니다.' };
    if (isManual(b) && source === 'qr') return { ok: false, msg: '이 부스는 현장 줄서기로 운영해요. 부스 앞에 줄을 서 주세요.' };
    if (source === 'qr') { const g = guardAction('줄서기'); if (g) return { ok: false, msg: g }; }
    if (!hasQueue(boothId) || queue(boothId).open === false) return { ok: false, msg: '지금은 줄서기 접수를 받지 않아요.' };
    if (source === 'qr') {
      if (b.status !== 'approved') return { ok: false, msg: '아직 공개되지 않은 부스입니다.' };
      const mine = myActiveTickets();
      if (mine.some(t => t.boothId === boothId)) return { ok: false, msg: '이미 이 부스 줄에 서 있어요.' };
      if (mine.length >= db.settings.maxQueuePerPerson)
        return { ok: false, msg: `줄서기는 1인당 동시에 ${db.settings.maxQueuePerPerson}곳까지 가능해요.` };
    }
    const t = { boothId, name, device: device(), status: 'waiting', source, createdAt: now() };

    if (!REMOTE) {
      const q = queue(boothId);
      q.seq = (q.seq || 0) + 1; q.waiting = (q.waiting || 0) + 1;
      Object.assign(t, { id: uid('t'), no: q.seq });
      db.tickets.push(t);
      saveLocal();
      return { ok: true, ticket: t };
    }
    // 서버 모드: 트랜잭션으로 "번호 +1 · 대기 +1 · 번호표 생성"을 한 번에 → 동시에 눌러도 번호가 겹치지 않음
    const ref = fs.collection('tickets').doc();
    try {
      await fs.runTransaction(async (tx) => {
        const qref = fs.collection('queues').doc(boothId);
        const snap = await tx.get(qref);
        if (!snap.exists || snap.data().open === false) throw new Error('CLOSED');
        const qd = snap.data();
        t.no = (qd.seq || 0) + 1;
        tx.update(qref, { seq: t.no, waiting: (qd.waiting || 0) + 1, lastTicket: ref.id });
        tx.set(ref, t);
      });
    } catch (e) {
      if (e.message === 'CLOSED') return { ok: false, msg: '지금은 줄서기 접수를 받지 않아요.' };
      if (e.code === 'permission-denied') return { ok: false, msg: '줄서기에 실패했어요. 잠시 후 다시 눌러 주세요.' };
      return { ok: false, msg: errMsg(e) };
    }
    return { ok: true, ticket: { ...t, id: ref.id } };
  }

  // 번호표 상태 바꾸기 (취소·입장·노쇼·재호출). 'waiting'에서 벗어나면 대기 인원 -1
  async function setTicketStatus(id, status) {
    const t = ticket(id);
    if (!t) return false;
    if (t.status === status && status !== 'called') return true;
    const stamp = status === 'called' ? { calledAt: now() } : status === 'entered' ? { enteredAt: now() } : {};
    if (!REMOTE) {
      const q = queue(t.boothId);
      if (t.status === 'waiting' && status !== 'waiting') q.waiting = Math.max(0, (q.waiting || 0) - 1);
      Object.assign(t, { status, ...stamp });
      return saveLocal();
    }
    try {
      await fs.runTransaction(async (tx) => {
        const tref = fs.collection('tickets').doc(id);
        const qref = fs.collection('queues').doc(t.boothId);
        const ts = await tx.get(tref);
        const qs = await tx.get(qref);
        const old = ts.data().status;
        const leave = old === 'waiting' && status !== 'waiting';
        tx.update(tref, { status, ...stamp });
        if (leave && qs.exists) tx.update(qref, { waiting: Math.max(0, (qs.data().waiting || 0) - 1), lastTicket: id });
      });
      return true;
    } catch (e) { onError(errMsg(e)); return false; }
  }
  const cancelTicket = (id) => setTicketStatus(id, 'cancelled');

  // 다음 손님 호출 (운영자): 번호가 가장 빠른 대기자부터 n명
  async function callNext(boothId, n = 1) {
    const list = ticketsOf(boothId).filter(t => t.status === 'waiting').slice(0, Math.max(1, n));
    if (!list.length) return { ok: false, msg: '기다리는 손님이 없어요.' };
    const at = now();
    if (!REMOTE) {
      const q = queue(boothId);
      list.forEach(t => Object.assign(t, { status: 'called', calledAt: at }));
      q.waiting = Math.max(0, (q.waiting || 0) - list.length);
      q.nowServing = Math.max(q.nowServing || 0, ...list.map(t => t.no));
      q.lastCallAt = at;
      saveLocal();
      return { ok: true, called: list };
    }
    try {
      const called = [];
      await fs.runTransaction(async (tx) => {
        const qref = fs.collection('queues').doc(boothId);
        const qs = await tx.get(qref);
        const refs = list.map(t => fs.collection('tickets').doc(t.id));
        const snaps = [];
        for (const r of refs) snaps.push(await tx.get(r));
        called.length = 0;
        snaps.forEach((sn, i) => { if (sn.exists && sn.data().status === 'waiting') called.push(list[i]); });
        if (!called.length) throw new Error('NONE');
        called.forEach(t => tx.update(fs.collection('tickets').doc(t.id), { status: 'called', calledAt: at }));
        const qd = qs.data() || {};
        tx.update(qref, {
          waiting: Math.max(0, (qd.waiting || 0) - called.length),
          nowServing: Math.max(qd.nowServing || 0, ...called.map(t => t.no)),
          lastCallAt: at,
        });
      });
      return { ok: true, called };
    } catch (e) {
      if (e.message === 'NONE') return { ok: false, msg: '방금 다른 기기에서 호출했어요. 목록을 확인하세요.' };
      onError(errMsg(e)); return { ok: false, msg: '호출에 실패했어요.' };
    }
  }

  // 줄서기 접수 열기/닫기 (운영자)
  function setQueueOpen(boothId, open) {
    const q = queue(boothId);
    q.open = open;
    return commit([['update', 'queues', boothId, { open }]]);
  }

  // 호출하고 callGraceMin 분이 지나도 오지 않으면 자동 노쇼 (운영자·관리자 기기, 로컬 모드에서 처리)
  const pendingTicket = new Set();
  function autoNoShowTickets() {
    if (REMOTE && !(session && (session.role === 'op' || session.role === 'admin'))) return;
    const limit = (db.settings.callGraceMin || 5) * 60000;
    db.tickets.filter(t => t.status === 'called' && t.calledAt && now() - t.calledAt > limit && !pendingTicket.has(t.id))
      .forEach(t => {
        pendingTicket.add(t.id);
        setTicketStatus(t.id, 'noshow').finally(() => pendingTicket.delete(t.id));
      });
  }

  // =========================================================
  // 보안: 이상 접속 감지 · 차단
  //   1) 로그인 잠금   : 이 기기에서 10분 안에 5번 틀리면 5분 동안 로그인 잠금 (+ Firebase 자체 시도 제한)
  //   2) 과다 요청 제한: 1분 안에 예약·줄서기·가입을 8번 넘게 시도하면 2분 동안 멈춤
  //   3) 보안 로그     : 로그인 실패 · 잠금 · 과다 요청 · 권한 거부 · 차단된 기기의 시도를 기록 (관리자만 읽기)
  //   4) 기기 차단     : 관리자가 차단한 기기는 예약·줄서기·가입 불가. 서버 규칙(firestore.rules)으로 강제됨
  //   5) 자동 차단     : 관리자 화면이 열려 있으면, 1시간 안에 기준을 넘긴 기기를 자동으로 차단
  // =========================================================
  const SEC = { failMax: 5, failWindow: 10 * 60000, lockMs: 5 * 60000, rateMax: 8, rateWindow: 60000, rateLockMs: 2 * 60000 };
  const SEC_KEY = 'unjeong-sec';
  const secState = () => { try { return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; } catch (e) { return {}; } };
  const secSave = (s) => { try { localStorage.setItem(SEC_KEY, JSON.stringify(s)); } catch (e) {} };
  const realNow = () => Date.now();   // 보안 시간은 시연용 가상 시각과 상관없이 실제 시각 기준

  // 로그인 잠금 상태 { locked, leftSec, failsLeft }
  function loginGuard() {
    const s = secState(), t = realNow();
    if (s.lockUntil && s.lockUntil > t) return { locked: true, leftSec: Math.ceil((s.lockUntil - t) / 1000), failsLeft: 0 };
    const fails = (s.fails || []).filter(x => t - x < SEC.failWindow);
    return { locked: false, leftSec: 0, failsLeft: Math.max(0, SEC.failMax - fails.length) };
  }
  function recordLoginFail(id) {
    const s = secState(), t = realNow();
    s.fails = (s.fails || []).filter(x => t - x < SEC.failWindow).concat(t);
    logSecurity('login_fail', `로그인 실패 (${s.fails.length}/${SEC.failMax})`, id);
    if (s.fails.length >= SEC.failMax) {
      s.lockUntil = t + SEC.lockMs; s.fails = [];
      logSecurity('lockout', `로그인 ${SEC.failMax}번 실패 → ${SEC.lockMs / 60000}분 잠금`, id);
    }
    secSave(s);
  }
  function clearLoginFails() { const s = secState(); delete s.fails; delete s.lockUntil; secSave(s); }

  // 과다 요청 검사: 통과하면 '' , 막히면 안내 문구
  function rateGuard(action) {
    const s = secState(), t = realNow();
    if (s.rateUntil && s.rateUntil > t) return `요청이 너무 많아요. ${Math.ceil((s.rateUntil - t) / 1000)}초 뒤에 다시 시도해 주세요.`;
    s.acts = (s.acts || []).filter(x => t - x < SEC.rateWindow).concat(t);
    if (s.acts.length > SEC.rateMax) {
      s.rateUntil = t + SEC.rateLockMs; s.acts = [];
      secSave(s);
      logSecurity('rate_limit', `1분 안에 ${SEC.rateMax}번 넘게 시도 (${action}) → ${SEC.rateLockMs / 60000}분 멈춤`);
      return `요청이 너무 많아요. ${SEC.rateLockMs / 60000}분 뒤에 다시 시도해 주세요.`;
    }
    secSave(s);
    return '';
  }

  // 보안 로그 남기기 (한 기기에서 10분에 최대 30개까지만 → 로그 자체로 서버를 괴롭히지 못하게)
  const logTimes = [];
  function logSecurity(type, detail = '', loginId = '') {
    const t = realNow();
    while (logTimes.length && t - logTimes[0] > 600000) logTimes.shift();
    if (logTimes.length >= 30) return;
    logTimes.push(t);
    const entry = { type: String(type).slice(0, 20), detail: String(detail).slice(0, 200), loginId: String(loginId || '').slice(0, 40),
      device: device(), at: t, ua: String(navigator.userAgent || '').slice(0, 200) };
    if (!REMOTE) {
      db.securityLog = (db.securityLog || []).concat({ id: uid('L'), ...entry }).slice(-300);
      saveLocal();
      return;
    }
    if (!auth || !auth.currentUser) return;
    fs.collection('securityLog').add(entry).catch(() => {});
  }
  const securityLog = () => (db.securityLog || []).slice().sort((a, b) => b.at - a.at);
  function clearSecurityLog() {
    const ops = (db.securityLog || []).map(l => ['delete', 'securityLog', l.id]);
    db.securityLog = [];
    return commit(ops);
  }

  // 기기 차단 (차단 목록 문서 ID = 기기 ID = Firebase 로그인 ID)
  const blockedList = () => db.blocked || [];
  const isBlocked = (dev = device()) => blockedList().some(x => x.id === dev);
  function blockDevice(dev, reason = '관리자 차단') {
    if (!dev || isBlocked(dev)) return Promise.resolve(true);
    const item = { id: dev, reason: String(reason).slice(0, 100), at: realNow(), by: session ? session.id : '' };
    db.blocked = blockedList().concat(item);
    return commit([['set', 'blocked', dev, item]]);
  }
  function unblockDevice(dev) {
    db.blocked = blockedList().filter(x => x.id !== dev);
    return commit([['delete', 'blocked', dev]]);
  }
  const BLOCK_MSG = '이 기기는 운영 본부에 의해 이용이 제한되었어요. 문제가 있다면 운영 본부에 문의해 주세요.';
  // 예약·줄서기·가입 전에 부르는 공통 검사: 통과하면 ''
  function guardAction(action) {
    if (window.EMERGENCY && window.EMERGENCY.on) return window.EMERGENCY.message || '지금은 비상 운영 중이라 앱 접수를 잠시 멈췄어요. 현장에서 접수해 주세요.';
    if (isBlocked()) { logSecurity('blocked_try', `차단된 기기의 시도 (${action})`); return BLOCK_MSG; }
    return rateGuard(action);
  }

  // 기기별 위험 점수 (최근 1시간): 로그인 실패 1 · 잠금 3 · 과다 요청 3 · 권한 거부 2 · 차단 후 시도 1
  const RISK = { login_fail: 1, lockout: 3, rate_limit: 3, denied: 2, blocked_try: 1 };
  function riskByDevice(windowMs = 3600000) {
    const t = realNow(), map = {};
    securityLog().filter(l => t - l.at < windowMs && RISK[l.type]).forEach(l => {
      const m = map[l.device] = map[l.device] || { device: l.device, score: 0, count: 0, last: 0, ids: new Set(), types: {} };
      m.score += RISK[l.type]; m.count++; m.last = Math.max(m.last, l.at);
      if (l.loginId) m.ids.add(l.loginId);
      m.types[l.type] = (m.types[l.type] || 0) + 1;
    });
    return Object.values(map).sort((a, b) => b.score - a.score);
  }
  // 자동 차단: 관리자 기기에서만 실행 (차단 목록은 관리자만 쓸 수 있음)
  const pendingBlock = new Set();
  function autoBlock() {
    if (!db.settings.autoBlock || !session || session.role !== 'admin') return;
    const limit = db.settings.autoBlockScore || 10;
    riskByDevice().filter(r => r.score >= limit && !isBlocked(r.device) && r.device !== device() && !pendingBlock.has(r.device))
      .forEach(r => {
        pendingBlock.add(r.device);
        blockDevice(r.device, `자동 차단: 1시간 위험 점수 ${r.score}`).finally(() => pendingBlock.delete(r.device));
        logSecurity('auto_block', `기기 ${r.device.slice(0, 8)}… 자동 차단 (점수 ${r.score})`);
      });
  }

  // =========================================================
  // 서버 상태 (연결 끊김 · 사용량 한도 초과) — 화면 위 안내 띠에 쓰임
  // =========================================================
  const health = { state: 'ok', since: Date.now(), detail: '' };
  function setHealth(state, detail = '') {
    if (health.state === state && health.detail === detail) return;
    Object.assign(health, { state, detail, since: Date.now() });
    onChange('health');
  }
  window.addEventListener('offline', () => setHealth('offline'));
  window.addEventListener('online', () => setHealth('ok'));
  function noteError(e) {
    if (!e) return;
    if (e.code === 'resource-exhausted') setHealth('quota', '서버 사용량 한도를 넘었어요');
    else if (e.code === 'unavailable') setHealth('offline');
    else if (e.code === 'permission-denied') logSecurity('denied', `권한 거부: ${String(e.message || '').slice(0, 120)}`);
  }

  // =========================================================
  // 공지
  // =========================================================
  // notices() = 전체 공지, notices('b01') = 해당 부스 공지, notices('all') = 모두
  const notices = (boothId = null) => db.notices
    .filter(n => boothId === 'all' || n.boothId === boothId)
    .sort((a, b) => (b.urgent - a.urgent) || (b.createdAt - a.createdAt));
  function addNotice(body, urgent, boothId = null) {
    const n = { id: uid('n'), body, urgent, boothId, createdAt: now() };
    db.notices.push(n);
    return commit([['set', 'notices', n.id, n]]);
  }
  function deleteNotice(id) {
    db.notices = db.notices.filter(n => n.id !== id);
    return commit([['delete', 'notices', id]]);
  }

  // =========================================================
  // 로그인 / 계정
  // =========================================================
  const getSession = () => session;
  const accounts = () => db.accounts;
  const isSetupNeeded = () => REMOTE && needsSetup;
  const randomPw = () => String(Math.floor(100000 + Math.random() * 900000));   // Firebase는 비밀번호 6자 이상

  // 하나의 로그인 창에서 관리자 · 부스 운영자 · 참여자(학번+이름) 모두 로그인
  async function login(id, pw) {
    id = id.trim();
    if (loginGuard().locked) return null;   // 잠금 중이면 시도하지 않음 (화면에서 남은 시간 안내)
    if (!REMOTE) {
      const a = db.accounts.find(x => x.id.toLowerCase() === id.toLowerCase() && x.pw === pw);
      if (!a) { recordLoginFail(id); return null; }
      clearLoginFails();
      session = { role: a.role, id: a.id, boothId: a.boothId || null, name: a.name || '', studentNo: a.studentNo || '' };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
      return session;
    }
    dropScoped();   // 관람객용 구독 먼저 정리
    const m = id.match(STUDENT_RE);
    try {
      const cred = await auth.signInWithEmailAndPassword(m ? studentEmail(m[1]) : staffEmail(id), authPw(pw));
      const s = await loadProfile(cred.user);
      // 참여자는 학번과 이름이 모두 맞아야 함
      if (!s || (m && s.id !== id)) { await auth.signOut(); recordLoginFail(id); return null; }
      session = s;
      clearLoginFails();
      subscribeScoped(cred.user);
      return session;
    } catch (e) {
      // auth/too-many-requests = Firebase 서버가 이 계정 시도를 잠시 막은 것
      if (e && e.code === 'auth/too-many-requests') { const st = secState(); st.lockUntil = realNow() + SEC.lockMs; secSave(st); logSecurity('lockout', 'Firebase가 시도 과다로 차단', id); }
      else recordLoginFail(id);
      return null;
    }
  }
  async function logout() {
    session = null;
    if (!REMOTE) { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} return; }
    await auth.signOut();   // → onAuthStateChanged 에서 다시 익명 로그인
  }

  // ---------- 내 비밀번호 바꾸기 (관리자 · 운영자 · 참여자 모두) ----------
  //   서버 모드: 현재 비밀번호로 한 번 더 확인(재인증)한 뒤 Firebase 계정의 비밀번호를 바꿈
  //   Firebase 콘솔에서는 이 앱 계정의 비밀번호를 직접 바꿀 수 없어서(가짜 이메일 주소라 재설정 메일을 못 받음) 앱 안에서 바꿉니다.
  async function changePassword(oldPw, newPw) {
    if (!session) throw new Error('로그인한 뒤에 바꿀 수 있어요.');
    oldPw = String(oldPw || ''); newPw = String(newPw || '');
    if (newPw.length < 4) throw new Error('새 비밀번호는 4자 이상으로 정하세요.');
    if (newPw === oldPw) throw new Error('지금과 다른 비밀번호를 입력하세요.');
    if (!REMOTE) {
      const a = db.accounts.find(x => x.id === session.id);
      if (!a || a.pw !== oldPw) throw new Error('현재 비밀번호가 맞지 않아요.');
      a.pw = newPw;
      saveLocal();
      return true;
    }
    const u = auth.currentUser;
    if (!u || u.isAnonymous) throw new Error('다시 로그인한 뒤 시도해 주세요.');
    try {
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, authPw(oldPw)));
    } catch (e) {
      if (e.code === 'auth/too-many-requests') throw new Error('시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.');
      throw new Error('현재 비밀번호가 맞지 않아요.');
    }
    try { await u.updatePassword(authPw(newPw)); }
    catch (e) { throw new Error(errMsg(e)); }
    return true;
  }

  // ---------- 참여자 회원가입 (아이디 = 학번 + 이름) ----------
  async function signupStudent(studentNo, name, pw) {
    const g = guardAction('회원가입');
    if (g) throw new Error(g);
    studentNo = String(studentNo).trim(); name = String(name).trim();
    if (!/^\d{5}$/.test(studentNo)) throw new Error('학번은 숫자 5자리로 입력하세요. 예) 20315');
    if (!/^[가-힣]{2,5}$/.test(name)) throw new Error('이름은 한글 2~5자로 입력하세요.');
    if (String(pw).length < 4) throw new Error('비밀번호는 4자 이상으로 정하세요.');
    const id = studentNo + name;
    if (!REMOTE) {
      if (db.accounts.some(a => a.id === id)) throw new Error('이미 가입된 아이디예요. 로그인해 주세요.');
      if (db.accounts.some(a => a.studentNo === studentNo))
        throw new Error('이미 가입된 학번이에요. 본인이 가입한 적이 없다면 운영 본부에 알려주세요.');
      db.accounts.push({ id, pw: String(pw), role: 'student', studentNo, name, createdAt: now() });
      saveLocal();
      return login(id, pw);
    }
    dropScoped();
    let user;
    try {
      const cur = auth.currentUser;
      if (cur && cur.isAnonymous) {
        // 익명으로 쓰던 기기라면 그 계정을 그대로 학생 계정으로 전환 (이전 예약 유지)
        const c = firebase.auth.EmailAuthProvider.credential(studentEmail(studentNo), authPw(pw));
        user = (await cur.linkWithCredential(c)).user;
      } else {
        user = (await auth.createUserWithEmailAndPassword(studentEmail(studentNo), authPw(pw))).user;
      }
    } catch (e) {
      if (e.code === 'auth/email-already-in-use' || e.code === 'auth/credential-already-in-use')
        throw new Error('이미 가입된 학번이에요. 본인이 가입한 적이 없다면 운영 본부에 알려주세요.');
      throw new Error(errMsg(e));
    }
    await fs.collection('users').doc(user.uid).set({ role: 'student', loginId: id, studentNo, name });
    session = { role: 'student', id, boothId: null, name, studentNo };
    subscribeScoped(user);
    return session;
  }

  // 처음 한 번: 관리자 계정 만들기 (서버 모드)
  async function setupAdmin(loginId, pw) {
    dropScoped();
    const cred = await auth.createUserWithEmailAndPassword(staffEmail(loginId), authPw(pw));
    const batch = fs.batch();
    batch.set(fs.collection('users').doc(cred.user.uid), { role: 'admin', loginId: loginId.trim().toLowerCase() });
    batch.set(fs.collection('settings').doc('main'), defaultSettings());
    await batch.commit();
    session = { role: 'admin', id: loginId.trim().toLowerCase(), boothId: null };
    needsSetup = false;
    subscribeScoped(cred.user);
    return session;
  }

  // 관리자가 운영자 계정을 만들 때, 관리자 로그인이 풀리지 않도록 보조 Firebase 앱을 사용
  let secondaryAuth = null;
  function getSecondaryAuth() {
    if (secondaryAuth) return secondaryAuth;
    const app2 = firebase.initializeApp(FIREBASE_CONFIG, 'secondary');
    secondaryAuth = app2.auth();
    if (FIREBASE_CONFIG.useEmulator) secondaryAuth.useEmulator('http://127.0.0.1:9099');
    return secondaryAuth;
  }

  // 운영자 계정 만들기 (관리자가 아이디·비밀번호를 직접 정함)
  async function createOpAccount(loginId, pw, boothId) {
    const id = String(loginId).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,19}$/.test(id) || id.startsWith('stu-')) throw new Error('아이디는 영문 소문자·숫자 3~20자로 정하세요.');
    if (String(pw).length < 4) throw new Error('비밀번호는 4자 이상으로 정하세요.');
    if (boothId && !booth(boothId)) throw new Error('연결할 부스를 찾을 수 없어요.');
    if (!REMOTE) {
      if (db.accounts.some(a => a.id.toLowerCase() === id)) throw new Error('이미 사용 중인 아이디예요.');
      const acc = { id, pw: String(pw), role: 'op', boothId: boothId || null };
      db.accounts.push(acc);
      saveLocal();
      return acc;
    }
    const sa = getSecondaryAuth();
    let cred;
    try { cred = await sa.createUserWithEmailAndPassword(staffEmail(id), authPw(pw)); }
    catch (e) { throw new Error(e.code === 'auth/email-already-in-use' ? '이미 사용 중인 아이디예요.' : errMsg(e)); }
    await sa.signOut();
    await fs.collection('users').doc(cred.user.uid).set({ role: 'op', boothId: boothId || null, loginId: id, initialPw: String(pw) });
    return { id, pw: String(pw), role: 'op', boothId: boothId || null };
  }

  // 자동 발급 (아이디가 겹치면 -2, -3 … 을 붙임)
  async function issueAccount(boothId, baseId, pw = randomPw()) {
    let id = baseId, n = 2;
    for (;;) {
      try { return await createOpAccount(id, pw, boothId); }
      catch (e) { if (/이미 사용 중/.test(e.message)) { id = baseId + '-' + n++; continue; } throw e; }
    }
  }

  // 계정 수정: 로컬 모드는 비밀번호·부스 변경, 서버 모드는 부스 연결만 변경 가능
  function updateAccount(loginId, patch) {
    const a = db.accounts.find(x => x.id === loginId);
    if (!a) return Promise.resolve(false);
    if (!REMOTE) { Object.assign(a, patch); return Promise.resolve(saveLocal()); }
    const p = {};
    if ('boothId' in patch) p.boothId = patch.boothId || null;
    Object.assign(a, p);
    return commit([['update', 'users', a.uid, p]]);
  }
  // 계정 삭제 (서버 모드: 프로필을 지워 아무 권한도 없게 함)
  function deleteAccount(loginId) {
    const a = db.accounts.find(x => x.id === loginId);
    if (!a || (a.role === 'admin' && db.accounts.filter(x => x.role === 'admin').length <= 1)) return Promise.resolve(false);
    db.accounts = db.accounts.filter(x => x !== a);
    return REMOTE ? commit([['delete', 'users', a.uid]]) : Promise.resolve(saveLocal());
  }

  // ---------- 부스 추가 / 삭제 (관리자) ----------
  // 비어 있는 교실 목록 (exceptId 부스가 쓰는 교실은 빈 것으로 취급)
  // 교실별로 그 교실을 쓰는 부스 목록 { 'main|5|탐구학습실Ⅰ': [부스, ...] }
  function roomUsage(exceptId = null) {
    const map = {};
    db.booths.filter(b => b.id !== exceptId).forEach(b => locsOf(b).forEach(l => { (map[locKey(l)] = map[locKey(l)] || []).push(b); }));
    return map;
  }
  function freeRooms(exceptId = null) {
    const used = new Set(Object.keys(roomUsage(exceptId)));
    const list = [];
    for (const bid of Object.keys(BUILDINGS)) for (const f of FLOOR_NUMS) for (const r of bookableRooms(bid, f)) {
      if (!used.has(`${bid}|${f}|${r}`)) list.push({ building: bid, floor: f, room: r });
    }
    return list;
  }

  // opts = { club, name?, type?, emoji?, locations? } → 새 부스 (작성 중 상태)
  //   locations: [] 이면 '위치 미정', 주지 않으면 첫 번째 빈 교실. 관리자는 이미 쓰는 교실도 지정할 수 있음
  async function addBooth(opts) {
    let locs = opts.locations;
    if (!Array.isArray(locs)) {
      if (opts.room) locs = [{ building: opts.building || 'main', floor: Number(opts.floor) || 1, room: opts.room }];
      else { const free = freeRooms(); locs = free.length ? [free[0]] : []; }
    }
    let n = db.booths.length + 1;
    while (db.booths.some(b => b.id === 'b' + String(n).padStart(2, '0'))) n++;
    const id = 'b' + String(n).padStart(2, '0');
    const type = opts.type === 'reserve' ? 'reserve' : 'live';
    const b = {
      id, name: (opts.name || '').trim() || opts.club + ' 부스', club: opts.club, emoji: opts.emoji || '⭐', color: '#4f46e5',
      type, ...locPatch(locs), themes: [], summary: '', cover: '', blocks: [], status: 'draft',
      minPerPerson: 3, crowdUpdatedAt: now(), shortNotice: '', stopped: false,
      crowdMode: 'qr', crowd: 'free', waiting: 0, crowdOverride: '', waitAdjust: 0, resvOpen: true,
      qrToken: newToken(), qrCreatedAt: now(),
      slotConfig: type === 'reserve' ? { start: '10:00', end: '15:00', interval: 20, capacity: 6 } : null,
    };
    db.booths.push(b);
    if (!(await commit([['set', 'booths', id, b]]))) throw new Error('부스를 만들지 못했어요.');
    await ensureQueue(id);
    if (type === 'reserve') generateSlots(id, b.slotConfig);
    return b;
  }

  // 부스 위치 바꾸기 (빈 배열 = 미정). 관리자는 다른 부스가 쓰는 교실도 함께 쓸 수 있게 지정 가능
  function setLocations(boothId, locs) { return updateBooth(boothId, locPatch(locs)); }

  // 부스 삭제: 회차·예약·부스 공지·운영자 계정까지 함께 지움 (되돌릴 수 없음)
  async function deleteBooth(id) {
    const ops = [['delete', 'booths', id]];
    db.slots.filter(s => s.boothId === id).forEach(s => ops.push(['delete', 'slots', s.id]));
    db.reservations.filter(r => r.boothId === id).forEach(r => ops.push(['delete', 'reservations', r.id]));
    db.notices.filter(n => n.boothId === id).forEach(n => ops.push(['delete', 'notices', n.id]));
    db.tickets.filter(t => t.boothId === id).forEach(t => ops.push(['delete', 'tickets', t.id]));
    if (hasQueue(id)) ops.push(['delete', 'queues', id]);
    // 서버 모드: 로그인 계정 자체는 남지만 프로필이 지워져 아무 권한도 없게 됨
    if (REMOTE) db.accounts.filter(a => a.boothId === id).forEach(a => ops.push(['delete', 'users', a.uid]));

    db.booths = db.booths.filter(b => b.id !== id);
    db.slots = db.slots.filter(s => s.boothId !== id);
    db.reservations = db.reservations.filter(r => r.boothId !== id);
    db.notices = db.notices.filter(n => n.boothId !== id);
    db.tickets = db.tickets.filter(t => t.boothId !== id);
    db.queues = db.queues.filter(q => q.id !== id);
    db.accounts = db.accounts.filter(a => a.boothId !== id);
    return commit(ops);
  }

  // 새 부스 + 운영자 계정. account = { id, pw } 를 주면 그 값으로, 없으면 자동(boothNN / 기본 비밀번호)
  async function createBoothAccount(club, opts = {}, account = null) {
    if (account && account.id && !REMOTE && db.accounts.some(a => a.id.toLowerCase() === account.id.trim().toLowerCase()))
      throw new Error('이미 사용 중인 아이디예요.');
    const b = await addBooth({ ...opts, club });
    if (account && account.id) return createOpAccount(account.id, account.pw, b.id);
    return issueAccount(b.id, 'booth' + b.id.replace(/^b/, ''), OP_DEFAULT_PW);
  }

  // 계정 없는 부스에 운영자 계정 일괄 발급
  async function issueMissingAccounts() {
    const issued = [];
    for (const b of db.booths) {
      if (db.accounts.some(a => a.role === 'op' && a.boothId === b.id)) continue;
      issued.push({ booth: b.name, ...(await issueAccount(b.id, 'booth' + b.id.replace(/^b/, ''), OP_DEFAULT_PW)) });
    }
    return issued;
  }

  // 비밀번호 재발급 (서버 모드는 브라우저에서 남의 비밀번호를 바꿀 수 없어 새 아이디로 다시 발급)
  async function reissueAccount(loginId) {
    const a = db.accounts.find(x => x.id === loginId);
    if (!REMOTE) { a.pw = randomPw(); saveLocal(); return { id: a.id, pw: a.pw }; }
    const acc = await issueAccount(a.boothId, loginId.replace(/-\d+$/, ''), randomPw());
    await fs.collection('users').doc(a.uid).delete();
    return acc;
  }

  function setSettings(patch) {
    Object.assign(db.settings, patch);
    return commit([['update', 'settings', 'main', patch]]);
  }

  // 데모 데이터로 초기화
  async function reset() {
    snapshot('초기화 직전 자동 백업');
    const seed = createSeed();
    if (!REMOTE) { seed.accounts = mergeAccounts(seed.accounts, db.accounts); db = seed; return saveLocal(); }
    // 서버: 부스·회차·예약·공지를 모두 지우고 예시 데이터(예약 없음)를 넣음. 계정은 유지.
    const ops = [];
    db.booths.forEach(b => ops.push(['delete', 'booths', b.id]));
    db.slots.forEach(s => ops.push(['delete', 'slots', s.id]));
    db.reservations.forEach(r => ops.push(['delete', 'reservations', r.id]));
    db.notices.forEach(n => ops.push(['delete', 'notices', n.id]));
    db.tickets.forEach(t => ops.push(['delete', 'tickets', t.id]));
    db.queues.forEach(q => ops.push(['delete', 'queues', q.id]));
    await commit(ops);
    const add = [];
    seed.booths.forEach(b => add.push(['set', 'booths', b.id, b]));
    seed.slots.forEach(s => add.push(['set', 'slots', s.id, { ...s, count: 0 }]));
    db.reservations = []; db.tickets = [];
    seed.notices.forEach(n => add.push(['set', 'notices', n.id, n]));
    // 서버에서는 예시 대기자 없이 빈 줄로 시작 (번호표는 실제 관람객 기기에 연결되어야 하므로)
    seed.queues.forEach(q => add.push(['set', 'queues', q.id, { ...q, seq: 0, waiting: 0, nowServing: 0, lastCallAt: Date.now() }]));
    add.push(['update', 'settings', 'main', { timeOffset: 0, festivalDates: seed.settings.festivalDates }]);
    return commit(add);
  }

  // =========================================================
  // 접속자 수
  // =========================================================
  let lastBeat = 0, lastRole = null, presenceCache = { total: 0, visitor: 0, op: 0, admin: 0 }, lastFetch = 0;
  function heartbeat(tabId, role) {
    if (REMOTE) {
      // 서버 비용을 아끼기 위해 2분에 한 번만 기록 (화면을 보고 있을 때만)
      // 서버 절약 ③: 관람객 접속 집계는 관리자가 켰을 때만, 운영자·관리자는 5분에 한 번만 기록
      const u = auth && auth.currentUser;
      if (!u || document.visibilityState !== 'visible') return;
      if (role === 'visitor' && !db.settings.presenceVisitors) return;
      if (Date.now() - lastBeat < 300000 && role === lastRole) return;
      lastBeat = Date.now(); lastRole = role;
      fs.collection('presence').doc(u.uid).set({ t: Date.now(), role }).catch(() => {});
      return;
    }
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PRESENCE_KEY)) || {}; } catch (e) {}
    const t = Date.now();
    p[tabId] = { t, role };
    for (const k in p) if (t - p[k].t > 30000) delete p[k];
    try { localStorage.setItem(PRESENCE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function presence() {
    if (REMOTE) {
      // 최근 5분 안에 기록이 있는 기기 수 (관리자만, 1분마다 새로 셈)
      if (session && session.role === 'admin' && Date.now() - lastFetch > 300000) {
        lastFetch = Date.now();
        fs.collection('presence').where('t', '>', Date.now() - 600000).get().then((s) => {
          const res = { total: 0, visitor: 0, op: 0, admin: 0 };
          s.docs.forEach(d => { res.total++; res[d.data().role] = (res[d.data().role] || 0) + 1; });
          presenceCache = res;
          onChange('presence');
        }).catch(() => {});
      }
      return presenceCache;
    }
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PRESENCE_KEY)) || {}; } catch (e) {}
    const res = { total: 0, visitor: 0, op: 0, admin: 0 };
    for (const k in p) if (Date.now() - p[k].t <= 30000) { res.total++; res[p[k].role]++; }
    return res;
  }

  // =========================================================
  // 통계 내보내기 (엑셀에서 열 수 있는 CSV)
  // =========================================================
  function exportCSV() {
    const rows = [['부스ID', '부스명', '동아리', '유형', '위치', '혼잡도', '대기인원', '예약', '예약입장', '예약노쇼', '예약취소',
      '줄서기발급', '줄서기입장', '줄서기노쇼', '줄서기취소', '현장등록']];
    db.booths.forEach(b => {
      const rs = resvOfBooth(b.id), ts = ticketsOf(b.id);
      const c = (st) => rs.filter(r => r.status === st).length;
      const tc = (st) => ts.filter(t => t.status === st).length;
      rows.push([b.id, b.name, b.club, b.type === 'reserve' ? '예약' : '당일', locsOf(b).map(locLabel).join(' / ') || '위치 미정',
        CROWD[crowdKey(b)].label, waitingOf(b), c('reserved'), c('checked'), c('noshow'), c('cancelled'),
        ts.length, tc('entered'), tc('noshow'), tc('cancelled'), ts.filter(t => t.source === 'walkin').length]);
    });
    return '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // =========================================================
  // 백업 / 복구
  //   exportData()  : 지금 데이터 전체를 하나의 객체로 (JSON 파일 · 엑셀 파일의 원본)
  //   importData()  : 백업 파일 내용으로 되돌리기 (사진이 빠진 엑셀 백업이면 지금 사진을 유지)
  //   snapshot()    : 이 브라우저에 최근 3개까지 자동 백업
  // =========================================================
  function exportData({ images = true } = {}) {
    const d = JSON.parse(JSON.stringify({
      app: 'ujhs-festival', version: VERSION, exportedAt: new Date().toISOString(), mode: REMOTE ? 'server' : 'local',
      settings: db.settings, booths: db.booths, slots: db.slots, reservations: db.reservations, notices: db.notices,
      queues: db.queues, tickets: db.tickets,
      accounts: db.accounts.map(({ uid: _u, ...a }) => a),
    }));
    if (!images) {
      d.booths.forEach(b => { b.cover = ''; (b.blocks || []).forEach(bl => { if (bl.type === 'image') bl.src = ''; }); });
      delete d.settings.heroPhotos;
    }
    return d;
  }

  // 같은 아이디는 앞쪽 목록을 우선해서 합침
  function mergeAccounts(first, second) {
    const out = [...first];
    (second || []).forEach(a => { if (!out.some(x => x.id === a.id)) out.push(a); });
    return out;
  }

  function validateBackup(d) {
    if (!d || typeof d !== 'object') throw new Error('백업 파일 형식이 아니에요.');
    for (const k of ['booths', 'slots', 'reservations', 'notices']) {
      if (!Array.isArray(d[k])) throw new Error(`백업 파일에 '${k}' 목록이 없어요.`);
    }
    d.booths.forEach((b, i) => {
      if (!b.id || !b.name) throw new Error(`부스 ${i + 1}번째 줄에 id 또는 부스명이 비어 있어요.`);
      Object.assign(b, locPatch(locsOf(b)));   // 위치 목록 정리 (엑셀에서 비우면 '미정')
      b.themes = Array.isArray(b.themes) ? b.themes : [];
      b.blocks = Array.isArray(b.blocks) ? b.blocks : [];
      b.minPerPerson = Number(b.minPerPerson) || 1;
      b.crowdMode = b.crowdMode === 'manual' ? 'manual' : 'qr';
      b.crowd = ['free', 'normal', 'busy'].includes(b.crowd) ? b.crowd : 'free';
      b.waiting = Math.max(0, Number(b.waiting) || 0);
      b.crowdOverride = ['free', 'normal', 'busy'].includes(b.crowdOverride) ? b.crowdOverride : '';
      b.waitAdjust = Number(b.waitAdjust) || 0;
      b.crowdUpdatedAt = Number(b.crowdUpdatedAt) || now();
      b.status = ['draft', 'pending', 'approved', 'hidden'].includes(b.status) ? b.status : 'pending';
      b.type = b.type === 'reserve' ? 'reserve' : 'live';
      b.stopped = !!b.stopped;
    });
    // 회차 인원은 예약 기록으로 다시 계산 (엑셀에서 손으로 고쳐도 숫자가 어긋나지 않게)
    d.reservations.forEach(r => {
      r.party = Math.max(1, Number(r.party) || 1);
      r.phone = normPhone(r.phone || r.phone4 || '');
    });
    d.slots.forEach(s => {
      s.capacity = Number(s.capacity) || 1;
      s.blocked = !!s.blocked;
      s.date = /^\d{4}-\d{2}-\d{2}$/.test(String(s.date || '')) ? String(s.date) : today();   // 예전 백업(날짜 없음)은 오늘로
      s.count = d.reservations.filter(r => r.slotId === s.id && ACTIVE.includes(r.status)).reduce((n, r) => n + r.party, 0);
    });
    d.booths.forEach(b => { if (b.resvOpen === undefined) b.resvOpen = true; if (b.qrToken === undefined) b.qrToken = newToken(); });
    // 줄서기: 예전 백업(v3)에는 없으므로 빈 줄을 만들고, 대기 인원은 번호표 기록으로 다시 계산
    d.tickets = Array.isArray(d.tickets) ? d.tickets.filter(t => t && t.id && t.boothId) : [];
    d.tickets.forEach(t => {
      t.no = Number(t.no) || 0;
      t.status = ['waiting', 'called', 'entered', 'noshow', 'cancelled'].includes(t.status) ? t.status : 'cancelled';
      t.source = t.source === 'walkin' ? 'walkin' : 'qr';
    });
    const qs = Array.isArray(d.queues) ? d.queues : [];
    d.queues = d.booths.map(b => {
      const old = qs.find(q => q.id === b.id) || {};
      const mine = d.tickets.filter(t => t.boothId === b.id);
      return {
        id: b.id, open: old.open !== false, createdAt: Number(old.createdAt) || now(), lastCallAt: Number(old.lastCallAt) || now(),
        seq: Math.max(Number(old.seq) || 0, ...mine.map(t => t.no), 0),
        nowServing: Math.max(Number(old.nowServing) || 0, ...mine.filter(t => t.status !== 'waiting').map(t => t.no), 0),
        waiting: mine.filter(t => t.status === 'waiting').length,
      };
    });
    return d;
  }

  async function importData(data) {
    const d = validateBackup(JSON.parse(JSON.stringify(data)));
    snapshot('복구 직전 자동 백업');
    // 엑셀 백업에는 사진이 없으므로, 같은 부스의 지금 사진을 그대로 살림
    d.booths.forEach(b => {
      const cur = booth(b.id);
      if (!cur) return;
      if (!b.cover && cur.cover) b.cover = cur.cover;
      b.blocks.forEach((bl, i) => { if (bl.type === 'image' && !bl.src && cur.blocks && cur.blocks[i] && cur.blocks[i].src) bl.src = cur.blocks[i].src; });
    });
    const settings = { ...defaultSettings(), ...db.settings, ...(d.settings || {}) };
    if (!d.settings || !d.settings.heroPhotos) settings.heroPhotos = db.settings.heroPhotos || [];

    if (!REMOTE) {
      let accts = Array.isArray(d.accounts) && d.accounts.length ? d.accounts : db.accounts;
      if (!accts.some(a => a.role === 'admin')) accts = [{ id: ADMIN_ID, pw: ADMIN_PW, role: 'admin' }, ...accts];
      db = { version: VERSION, settings: { ...settings, festivalDates: settings.festivalDates || [today()] }, booths: d.booths, slots: d.slots, reservations: d.reservations, notices: d.notices, accounts: accts, queues: d.queues, tickets: d.tickets };
      return saveLocal();
    }
    // 서버 모드: 백업 내용을 먼저 덮어쓰고(실패해도 기존 데이터는 남음) → 백업에 없는 것만 지움
    // 로그인 계정은 Firebase가 관리하므로 그대로 둠
    const add = [['set', 'settings', 'main', settings]];
    d.booths.forEach(b => add.push(['set', 'booths', b.id, b]));
    d.slots.forEach(s => add.push(['set', 'slots', s.id, s]));
    d.reservations.forEach(r => add.push(['set', 'reservations', r.id, r]));
    d.notices.forEach(n => add.push(['set', 'notices', n.id, n]));
    d.queues.forEach(q => add.push(['set', 'queues', q.id, q]));
    d.tickets.forEach(t => add.push(['set', 'tickets', t.id, t]));
    if (!(await commit(add))) return false;
    const keep = (list) => new Set(list.map(x => x.id));
    const kb = keep(d.booths), ks = keep(d.slots), kr = keep(d.reservations), kn = keep(d.notices), kq = keep(d.queues), kt = keep(d.tickets);
    const del = [];
    db.booths.forEach(b => { if (!kb.has(b.id)) del.push(['delete', 'booths', b.id]); });
    db.slots.forEach(x => { if (!ks.has(x.id)) del.push(['delete', 'slots', x.id]); });
    db.reservations.forEach(r => { if (!kr.has(r.id)) del.push(['delete', 'reservations', r.id]); });
    db.notices.forEach(n => { if (!kn.has(n.id)) del.push(['delete', 'notices', n.id]); });
    db.queues.forEach(q => { if (!kq.has(q.id)) del.push(['delete', 'queues', q.id]); });
    db.tickets.forEach(t => { if (!kt.has(t.id)) del.push(['delete', 'tickets', t.id]); });
    return del.length ? commit(del) : true;
  }

  function snapshots() {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || []; } catch (e) { return []; }
  }
  // 사진을 뺀 가벼운 백업을 이 브라우저에 최근 3개까지 보관
  function snapshot(reason = '자동 백업') {
    if (!db || !db.booths) return;
    const list = snapshots();
    list.unshift({ at: Date.now(), reason, data: exportData({ images: false }) });
    for (let keep = 3; keep >= 1; keep--) {
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, keep))); return; } catch (e) {}
    }
  }

  return {
    REMOTE, KEY, PRESENCE_KEY, get db() { return db; },
    init, reloadLocal, now, nowMin, setSimTime, device, pauseLive, resumeLive,
    booths, booth, publicBooths, updateBooth, setCrowd, crowdKey, levelOf, isManual, setCrowdMode, setCrowdOverride, setWaitAdjust, waitMinutes, isStale,
    queue, hasQueue, ensureQueue, waitingOf, ticket, ticketsOf, myTickets, myActiveTickets, aheadOf,
    joinQueue, setTicketStatus, cancelTicket, callNext, setQueueOpen,
    today, slotTs, slotEndTs, slot, slotsOf, slotCount, slotLeft, slotState, bookedOf, remaining, remainingToday, datesOf,
    generateSlots, toggleSlot, setSlotCapacity, setResvOpen, setFestivalDates, resetOperations, resetBoothReservations,
    resv, myResv, resvOfBooth, partyOf, fmtPhone, reserve, setResvStatus, checkIn, autoNoShow,
    createQR, deleteQR, qrValid,
    notices, addNotice, deleteNotice,
    loginGuard, securityLog, clearSecurityLog, blockedList, isBlocked, blockDevice, unblockDevice, riskByDevice, autoBlock, logSecurity, health, setHealth, SEC,
    session: getSession, accounts, login, logout, changePassword, isSetupNeeded, setupAdmin, signupStudent,
    createOpAccount, updateAccount, deleteAccount, STUDENT_RE,
    roomUsage, freeRooms, addBooth, setLocations, deleteBooth, createBoothAccount, issueMissingAccounts, reissueAccount, setSettings, reset,
    heartbeat, presence, exportCSV, exportData, importData, snapshot, snapshots,
  };
})();
