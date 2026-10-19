/* =========================================================
   운정 페스티벌 - 기본 데이터
   처음 실행할 때, 또는 관리자 > 설정 > "데모 데이터 초기화" 때 사용됩니다.
   실제 행사용으로 바꾸려면 BUILDINGS(교실 배치)와 BOOTH_SEED(부스 목록)를 수정하세요.
   ========================================================= */

// 테마 (테마별 안내에 사용)
const THEMES = [
  { id: 'escape',  label: '방탈출',     emoji: '🔐' },
  { id: 'cafe',    label: '카페·먹거리', emoji: '☕' },
  { id: 'exp',     label: '체험',       emoji: '🧪' },
  { id: 'game',    label: '게임',       emoji: '🎮' },
  { id: 'show',    label: '공연',       emoji: '🎸' },
  { id: 'exhibit', label: '전시',       emoji: '🖼️' },
];

// =========================================================
// 학교 건물 배치 (운정고 "교실 배치도" 기준, 서편 → 동편 순서)
//   n = 복도 북쪽 줄, s = 복도 남쪽 줄
//   칸 쓰는 법:  '교실이름'        부스를 열 수 있는 교실
//               '교실이름|2'      너비 2배 (숫자 = 상대 너비)
//               '~화장실'         편의시설 (회색, 부스 불가)
//               '|1.5'            빈 공간 (그림 간격용)
// =========================================================
const BUILDINGS = {
  main: {
    label: '본관',
    floors: {
      5: { n: ['탐구학습실Ⅰ|3', '~화장실', '|1.2', '~승강기|.7', '~계단|.7', '~연결통로', '~화장실', '|1.6', '탐구학습실Ⅱ|3', '~화장실', '~계단|.7'],
           s: ['3-1', '3-2', '3-3', '3-4', '진로도전부(3학년)|2.2', '3-5', '3-6', '3-7', '토론학습실Ⅱ', '3-8', '3-9', '3-10'] },
      4: { n: ['학교운영위원회실|2', '~화장실', '|2.2', '~승강기|.7', '~계단|.7', '~연결통로', '~화장실', '|1.6', '미래교육운영부|3', '~화장실', '~계단|.7'],
           s: ['2-5', '2-4', '인공지능(AI)교육실', '교육정보부', '홈베이스(4층)|2.2', '2-3', '2-2', '2-1', '토론학습실Ⅲ', '|.6', '3-12', '3-11'] },
      3: { n: ['학생자치회실|2', '~화장실', '|2.2', '~승강기|.7', '~계단|.7', '~연결통로', '~화장실', '|1.6', '수학교과실(Cloud)|3', '~화장실', '~계단|.7'],
           s: ['2-6', '2-7', '2-8', '2-9', '진로역량부(2학년)|2.2', '2-10', '2-11', '2-12', '토론학습실Ⅰ', '1-1', '1-2', '1-3'] },
      2: { n: ['학생생활안전부|2', '~화장실', '|2.2', '~승강기|.7', '~계단|.7', '~연결통로', '~화장실', '|1.6', '교육평가부|3', '~화장실', '~계단|.7'],
           s: ['1-13', '1-12', '1-11', '1-10', '진로비전부(1학년)|2.2', '1-9', '1-8', '1-7', '토론학습실', '1-6', '1-5', '1-4'] },
      1: { n: ['~현관|.7', '동아리실|2', '~화장실', '|1.5', '~승강기|.7', '~계단|.7', '~연결통로', '~화장실', '|1.6', 'BTL관리실|3', '~화장실', '~계단|.7'],
           s: ['Wee클래스', 'Wi카페(세미나실)', '인쇄실', '보건실', '홈베이스(1층)|2.2', '행정실', '교장실', '방송실', '교무실|2', '평가관리실'] },
    },
  },
  rear: {
    label: '후관',
    floors: {
      5: { n: ['|7.5', '~계단|.7', '~화장실|1.4', '~옥상|1.4'],
           s: ['미술준비실', '미술실|2', '음악준비실', '음악실|2', '준비실', '~복도|.8', '친환경교육공간|1.6', '~옥상정원|1.4'] },
      4: { n: ['창의1강의실|1.4', '창의2강의실', '창의3강의실', '영어교과실', '|2', '~계단|.7', '~화장실|1.4', '|2.4'],
           s: ['물리실|2', '융합활동운영부', '생물실|2', '상담실(위클래스)|1.4', '~복도|.8', '교직원휴게실(여)', '지구과학실', '지구준비실'] },
      3: { n: ['몽지1강의실|1.4', '몽지2강의실', '몽지3강의실', '사회교과실', '|2', '~계단|.7', '~화장실|1.4', '|2.4'],
           s: ['몽지학습실1|2', '몽지학습실2|2', '비품실', '교직원휴게실(남)', '~복도|.8', '화학실', '화학준비실', '강당(3층)|1.4'] },
      2: { n: ['챌린지활동실|3', '준비실', '|2.4', '~계단|.7', '~화장실|1.4', '|2.4'],
           s: ['구름샘 라운지|1.4', '구름샘(도서관)|2.6', '~복도|.8', '컴퓨터실', '컴퓨터준비실', '강당(2층)', '창의활동운영부'] },
      1: { n: ['|7.4', '~계단|.7', '~화장실|1.4', '|2.4'],
           s: ['시청각실|4', '~복도|.8', '사무실', '~외부통로|.8', '급식실|2', '학생휴게실'] },
    },
  },
};
const FLOOR_NUMS = [1, 2, 3, 4, 5];

// 칸 문자열 → { name, w, fac(편의시설), gap(빈칸) }
function parseCell(str) {
  const [raw, w] = str.split('|');
  const fac = raw.startsWith('~');
  const name = fac ? raw.slice(1) : raw;
  return { name, w: Number(w) || 1, fac, gap: !name };
}
// 해당 층의 줄별 칸 목록
function floorRows(building, floor) {
  const f = BUILDINGS[building] && BUILDINGS[building].floors[floor];
  if (!f) return { n: [], s: [] };
  return { n: f.n.map(parseCell), s: f.s.map(parseCell) };
}
// 부스를 열 수 있는 교실 이름 목록
function bookableRooms(building, floor) {
  const r = floorRows(building, floor);
  return [...r.s, ...r.n].filter(c => !c.fac && !c.gap).map(c => c.name);
}
const buildingLabel = (id) => (BUILDINGS[id] ? BUILDINGS[id].label : '본관');

// ---------------------------------------------------------
// 부스 위치: booth.locations = [{ building, floor, room }, ...]
//   - 여러 곳을 쓸 수 있음 (예: 방탈출이 교실 2칸)
//   - 빈 배열이면 '위치 미정' → 층별 안내도에는 안 나오고, 부스 페이지·홍보는 그대로 공개
//   - 예전 데이터(building/floor/room 하나만 있는 부스)도 그대로 읽힘
// ---------------------------------------------------------
function locsOf(b) {
  if (!b) return [];
  if (Array.isArray(b.locations)) return b.locations.filter(l => l && l.room).map(l => ({ building: BUILDINGS[l.building] ? l.building : 'main', floor: Number(l.floor) || 1, room: String(l.room) }));
  return b.room ? [{ building: BUILDINGS[b.building] ? b.building : 'main', floor: Number(b.floor) || 1, room: String(b.room) }] : [];
}
const locKey = (l) => `${l.building || 'main'}|${l.floor}|${l.room}`;
const isUndecided = (b) => locsOf(b).length === 0;
const onFloor = (b, bid, f) => locsOf(b).some(l => l.building === bid && l.floor === f);
const locLabel = (l) => `${buildingLabel(l.building)} ${l.floor}층 ${l.room}`;
// 저장할 때: 위치 목록 + 첫 번째 위치를 예전 필드(building/floor/room)에도 넣어 둠 (예전 코드·엑셀과 호환)
function locPatch(locs) {
  const list = (locs || []).filter(l => l && l.room).map(l => ({ building: l.building || 'main', floor: Number(l.floor) || 1, room: String(l.room) }));
  const uniq = [...new Map(list.map(l => [locKey(l), l])).values()];
  const p = uniq[0];
  return { locations: uniq, building: p ? p.building : null, floor: p ? p.floor : null, room: p ? p.room : '' };
}

// 혼잡도 단계
const CROWD = {
  free:   { label: '여유',     color: '#3f8f6b', icon: '🟢' },
  normal: { label: '보통',     color: '#c08a2e', icon: '🟡' },
  busy:   { label: '혼잡',     color: '#c2554c', icon: '🔴' },
  closed: { label: '운영중단', color: '#8a8f9c', icon: '⚫' },
};

// 예시 부스 10개 (waiting = 당일 부스의 예시 대기 인원 → 번호표로 만들어짐)
const BOOTH_SEED = [
  { club: '미스터리 연구회', name: '사라진 교장선생님의 열쇠', emoji: '🔐', color: '#4f46e5', type: 'reserve', building: 'main', floor: 5, room: '탐구학습실Ⅰ',
    locs: [{ building: 'main', floor: 5, room: '탐구학습실Ⅰ' }, { building: 'main', floor: 5, room: '탐구학습실Ⅱ' }],   // 예시: 교실 2곳 사용
    themes: ['escape'], summary: '30분 안에 교장실의 비밀을 풀어라! 4~6인 팀 방탈출', crowd: 'busy', waiting: 0, min: 30 },
  { club: '바리스타부', name: '카페 운정', emoji: '☕', color: '#92400e', type: 'live', building: 'main', floor: 1, room: 'Wi카페(세미나실)',
    themes: ['cafe'], summary: '동아리원이 직접 내린 핸드드립 커피와 수제 레모네이드', crowd: 'normal', waiting: 8, min: 2 },
  { club: '과학탐구반', name: '실험실 매직쇼', emoji: '🧪', color: '#0891b2', type: 'reserve', building: 'rear', floor: 3, room: '화학실',
    themes: ['exp', 'show'], summary: '액체질소 아이스크림과 코끼리 치약 실험 체험', crowd: 'normal', waiting: 0, min: 20 },
  { club: '보드게임부', name: '보드게임 카페', emoji: '🎲', color: '#16a34a', type: 'live', building: 'main', floor: 3, room: '토론학습실Ⅰ',
    themes: ['game'], summary: '할리갈리부터 스플렌더까지, 30종 보드게임 자유 체험', crowd: 'free', waiting: 2, min: 3 },
  { club: '사진부', name: '운정의 사계절 사진전', emoji: '📷', color: '#475569', type: 'live', building: 'rear', floor: 5, room: '미술실',
    themes: ['exhibit'], summary: '1년간 담은 학교 풍경 전시 + 즉석 폴라로이드 촬영', crowd: 'free', waiting: 0, min: 1 },
  { club: '밴드부 소음', name: '미니 라이브 공연', emoji: '🎸', color: '#db2777', type: 'live', building: 'rear', floor: 1, room: '시청각실',
    themes: ['show'], summary: '매 정시 20분 라이브! 신청곡도 받아요', crowd: 'busy', waiting: 25, min: 1 },
  { club: '코딩동아리 바이트', name: '직접 만든 게임 체험관', emoji: '👾', color: '#7c3aed', type: 'live', building: 'rear', floor: 2, room: '컴퓨터실',
    themes: ['game', 'exp'], summary: '동아리원이 직접 개발한 게임 5종을 플레이해보세요', crowd: 'normal', waiting: 6, min: 4 },
  { club: '공예부', name: '나만의 키링 만들기', emoji: '🧶', color: '#ea580c', type: 'reserve', building: 'main', floor: 4, room: '2-1',
    themes: ['exp'], summary: '레진 키링을 직접 만들어 가져가세요 (재료비 무료)', crowd: 'normal', waiting: 0, min: 20 },
  { club: '제과제빵부', name: '쿠키 베이커리', emoji: '🍪', color: '#ca8a04', type: 'live', building: 'main', floor: 1, room: '동아리실',
    themes: ['cafe'], summary: '갓 구운 쿠키와 머핀 판매 (1개 500원)', crowd: 'busy', waiting: 15, min: 1 },
  { club: '방송부', name: '공포의 3층 복도', emoji: '👻', color: '#111827', type: 'reserve', building: 'main', floor: 3, room: '2-8',
    themes: ['escape', 'exp'], summary: '담력 테스트! 2인 1조 공포 체험 (심약자 주의)', crowd: 'busy', waiting: 0, min: 10 },
];

// 미리 준비된 계정
const ADMIN_ID = 'meyun';      // 관리자 아이디
const ADMIN_PW = '1234';       // 관리자 비밀번호
const OP_DEFAULT_PW = '1234';  // 부스 운영자 기본 비밀번호 (booth01 ~ booth10)

// ---------- 날짜 도우미 (예약 회차는 날짜 + 시간으로 구분) ----------
const pad2 = (n) => String(n).padStart(2, '0');
// 'YYYY-MM-DD' (이 기기의 현지 날짜)
function dateStr(ts = Date.now()) { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
// '10.19 (월)'
function dateLabel(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${m}.${pad2(d)} (${w})`;
}
// 날짜 + 'HH:MM' → 밀리초 (현지 시각)
function dateTimeTs(ds, hm) { const [y, m, d] = ds.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, d, h, mi).getTime(); }
const newToken = () => Math.random().toString(36).slice(2, 10);   // QR 코드용 무작위 값

// 행사 기본 설정
function defaultSettings() {
  return {
    festivalName: 'UJHS Festival', subtitle: '운정고등학교 동아리 발표회',
    heroPhotos: [],     // 홈 화면 활동 사진 [{ src, caption }] (관리자 > 설정에서 등록)
    openTime: '09:30', closeTime: '16:00',
    graceMin: 10,       // 예약 시간이 지나고 몇 분 뒤 노쇼 처리할지
    maxPerPerson: 2,    // 1인당 동시 예약 수
    festivalDates: [dateStr()],  // 예약을 받는 날짜들 (관리자 → 예약 탭에서 변경)
    resvCloseMin: 0,    // 회차 시작 몇 분 전에 예약을 마감할지 (0 = 시작 직전까지)
    maxParty: 4,        // 예약 1건당 최대 인원
    requireLogin: true, // 예약할 때 참여자 로그인(학번+이름) 필요 여부
    staleMin: 15,       // 대기자가 있는데 이 시간(분) 동안 호출이 없으면 경고
    timeOffset: 0,      // 데모용 가상 시각(ms 차이)
    // ---- QR 줄서기 (당일 부스) ----
    queueNormal: 5,        // 대기 인원이 이 이상이면 '보통'
    queueBusy: 15,         // 대기 인원이 이 이상이면 '혼잡'
    callGraceMin: 5,       // 호출 후 이 시간(분) 안에 오지 않으면 자동 노쇼
    maxQueuePerPerson: 2,  // 1인당 동시에 설 수 있는 줄 수
    // ---- 보안 · 서버 절약 ----
    autoBlock: true,        // 위험 점수가 높은 기기 자동 차단 (관리자 화면이 열려 있을 때 동작)
    autoBlockScore: 10,     // 1시간 위험 점수 기준 (로그인 실패 1 · 잠금 3 · 과다 요청 3 · 권한 거부 2)
    presenceVisitors: false, // 관람객 접속자 수 집계 (켜면 서버 쓰기·읽기가 크게 늘어요)
  };
}

// 처음 상태: 오늘 날짜 기준, 예약·번호표 없이 깨끗하게 시작 (부스 10개와 계정은 예시로 준비)
function createSeed() {
  const OPEN = '09:30', CLOSE = '16:00';
  const now = Date.now();
  const today = dateStr(now);

  const booths = [], slots = [], reservations = [], accounts = [], queues = [], tickets = [];
  accounts.push({ id: ADMIN_ID, pw: ADMIN_PW, role: 'admin' });

  BOOTH_SEED.forEach((s, i) => {
    const id = 'b' + String(i + 1).padStart(2, '0');
    const isReserve = s.type === 'reserve';
    const booth = {
      id, name: s.name, club: s.club, emoji: s.emoji, color: s.color, type: s.type,
      ...locPatch(s.locs || [{ building: s.building, floor: s.floor, room: s.room }]),
      themes: s.themes, summary: s.summary, cover: '',
      blocks: [
        { type: 'text', title: '부스 소개', body: s.summary + '\n' + s.club + '가 한 학기 동안 준비한 부스입니다. 많이 놀러 와 주세요!' },
        { type: 'info', title: '운영 정보', body:
          `운영 시간: 10:00 ~ 16:00\n소요 시간: 약 ${s.min}분\n${isReserve ? '입장 방법: 앱에서 예약 후 예약번호 제시' : '입장 방법: QR 줄서기'}\n위치: ${(s.locs || [s]).map(locLabel).join(', ')}` },
      ],
      status: 'approved',           // draft | pending | approved | hidden
      minPerPerson: Math.max(1, Math.round(s.min / 4)),
      crowdUpdatedAt: now,
      shortNotice: '',
      stopped: false,
      resvOpen: true,               // 예약 접수 중 (관리자가 마감 가능)
      // 당일 부스 혼잡도 방식: 'qr' = QR 줄서기 인원으로 자동 / 'manual' = 운영자가 직접 입력
      crowdMode: 'qr', crowd: 'free', waiting: 0, crowdOverride: '', waitAdjust: 0,
      qrToken: newToken(), qrCreatedAt: now,   // QR 코드 (관리자가 다시 만들거나 삭제 가능)
      slotConfig: isReserve ? { start: '10:00', end: '16:00', interval: s.min >= 30 ? 30 : 20, capacity: s.min >= 30 ? 6 : 8 } : null,
    };
    if (i === 0) booth.blocks.push({ type: 'notice', body: '팀원은 최대 6명까지! 늦으면 입장이 어려울 수 있어요.' });
    booths.push(booth);
    queues.push({ id, seq: 0, waiting: 0, nowServing: 0, open: true, createdAt: now, lastCallAt: now });
    accounts.push({ id: 'booth' + String(i + 1).padStart(2, '0'), pw: OP_DEFAULT_PW, role: 'op', boothId: id });
    if (isReserve) slots.push(...buildSlots(id, booth.slotConfig, [today]));
  });

  return {
    version: 5,
    settings: { ...defaultSettings(), openTime: OPEN, closeTime: CLOSE, festivalDates: [today], timeOffset: 0 },
    booths, slots, reservations, accounts, queues, tickets,
    notices: [
      { id: uid('n'), body: '예약 부스는 앱에서 날짜와 시간을 골라 미리 예약하세요. 당일 부스는 입구 QR로 줄을 서요.', urgent: true, boothId: null, createdAt: now },
      { id: uid('n'), body: '분실물은 본관 1층 행정실 옆 운영본부로 가져다주세요.', urgent: false, boothId: null, createdAt: now },
    ],
  };
}

// 회차 목록 만들기: 날짜마다 start~end 를 interval 분 간격으로 (정원 = 사람 수)
function buildSlots(boothId, cfg, dates) {
  const list = [];
  dates.forEach(date => {
    for (let t = toMin(cfg.start); t + cfg.interval <= toMin(cfg.end); t += cfg.interval) {
      list.push({ id: uid('s'), boothId, date, start: fromMin(t), end: fromMin(t + cfg.interval), capacity: cfg.capacity, blocked: false, count: 0 });
    }
  });
  return list;
}
