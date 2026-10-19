/* =========================================================
   운정 페스티벌 - 백업 파일 만들기 / 읽기
   - 엑셀(.xlsx) : 사람이 열어 보고 고칠 수 있는 표 (사진 제외)
   - JSON(.json)  : 사진까지 포함한 완전한 백업
   엑셀 기능(SheetJS)은 무거워서, 버튼을 누를 때만 불러옵니다.
   ========================================================= */
const Backup = (() => {
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let loading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = XLSX_URL;
        s.onload = () => (window.XLSX ? resolve(window.XLSX) : (loading = null, reject(new Error('엑셀 기능을 불러오지 못했어요.'))));
        s.onerror = () => { loading = null; reject(new Error('엑셀 기능을 불러오지 못했어요. 인터넷 연결을 확인하세요.')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  // 시트별 열: [엑셀 머리글, 데이터 키, 형식(num | bool | list | json)]
  const SHEETS = {
    '부스': { key: 'booths', cols: [
      ['부스ID', 'id'], ['부스명', 'name'], ['동아리', 'club'], ['이모지', 'emoji'], ['색상', 'color'],
      ['유형(reserve=예약/live=당일)', 'type'], ['건물(main=본관/rear=후관)', 'building'], ['층', 'floor', 'num'], ['교실', 'room'],
      ['테마(쉼표로 구분)', 'themes', 'list'], ['한줄소개', 'summary'],
      ['상태(approved=공개/pending=승인대기/draft=작성중/hidden=비공개)', 'status'],
      ['1명당처리분', 'minPerPerson', 'num'], ['혼잡도방식(qr/manual)', 'crowdMode'], ['직접입력 혼잡도(free/normal/busy)', 'crowd'], ['직접입력 대기인원', 'waiting', 'num'],
      ['QR방식 조정 혼잡도(비우면 자동)', 'crowdOverride'], ['QR방식 대기 보정', 'waitAdjust', 'num'],
      ['운영중단', 'stopped', 'bool'], ['예약접수중', 'resvOpen', 'bool'], ['한줄공지', 'shortNotice'], ['QR값(비우면 QR 없음)', 'qrToken'],
      ['예약시간설정(JSON)', 'slotConfig', 'json'], ['페이지내용(JSON)', 'blocks', 'json'],
    ] },
    '회차': { key: 'slots', cols: [
      ['회차ID', 'id'], ['부스ID', 'boothId'], ['날짜(YYYY-MM-DD)', 'date'], ['시작', 'start'], ['종료', 'end'], ['정원(명)', 'capacity', 'num'], ['예약막힘', 'blocked', 'bool'],
    ] },
    '예약': { key: 'reservations', cols: [
      ['예약ID', 'id'], ['예약번호', 'code'], ['회차ID', 'slotId'], ['부스ID', 'boothId'], ['기기/계정', 'device'],
      ['이름', 'name'], ['인원', 'party', 'num'], ['전화번호', 'phone'], ['상태(reserved/checked/noshow/cancelled)', 'status'],
      ['예약시각(ms)', 'createdAt', 'num'], ['입장시각(ms)', 'checkedAt', 'num'],
    ] },
    '줄서기': { key: 'queues', cols: [
      ['부스ID', 'id'], ['마지막발급번호', 'seq', 'num'], ['현재호출번호', 'nowServing', 'num'], ['접수중', 'open', 'bool'], ['마지막호출시각(ms)', 'lastCallAt', 'num'],
    ] },
    '번호표': { key: 'tickets', cols: [
      ['번호표ID', 'id'], ['부스ID', 'boothId'], ['번호', 'no', 'num'], ['이름', 'name'], ['기기/계정', 'device'],
      ['상태(waiting/called/entered/noshow/cancelled)', 'status'], ['방식(qr/walkin)', 'source'],
      ['발급시각(ms)', 'createdAt', 'num'], ['호출시각(ms)', 'calledAt', 'num'], ['입장시각(ms)', 'enteredAt', 'num'],
    ] },
    '공지': { key: 'notices', cols: [
      ['공지ID', 'id'], ['내용', 'body'], ['긴급', 'urgent', 'bool'], ['부스ID(비우면 전체)', 'boothId'], ['작성시각(ms)', 'createdAt', 'num'],
    ] },
    '계정': { key: 'accounts', cols: [
      ['아이디', 'id'], ['비밀번호', 'pw'], ['역할(admin/op/student)', 'role'], ['부스ID', 'boothId'], ['학번', 'studentNo'], ['이름', 'name'],
    ] },
  };
  const NULLABLE = ['boothId', 'slotConfig', 'checkedAt', 'calledAt', 'enteredAt'];

  const toCell = (v, type) => {
    if (v === undefined || v === null) return '';
    if (type === 'list') return (v || []).join(', ');
    if (type === 'json') return JSON.stringify(v);
    if (type === 'bool') return !!v;
    return v;
  };
  const fromCell = (v, type, key) => {
    const empty = v === '' || v === undefined || v === null;
    if (type === 'num') return empty ? (NULLABLE.includes(key) ? null : 0) : Number(v);
    if (type === 'bool') return v === true || /^(true|o|y|yes|1|예)$/i.test(String(v).trim());
    if (type === 'list') return empty ? [] : String(v).split(',').map(x => x.trim()).filter(Boolean);
    if (type === 'json') {
      if (empty) return key === 'blocks' ? [] : null;
      try { return JSON.parse(v); } catch (e) { throw new Error(`'${key}' 칸의 JSON 형식이 잘못됐어요: ${String(v).slice(0, 40)}…`); }
    }
    if (empty) return NULLABLE.includes(key) ? null : '';
    return String(v);
  };

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- 만들기 ----------
  function downloadJSON(data = Store.exportData(), name = `UJHS_backup_${stamp()}.json`) {
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), name);
  }

  async function toWorkbook(data) {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const guide = [
      ['UJHS Festival 백업 파일'],
      ['만든 시각', new Date(data.exportedAt || Date.now()).toLocaleString('ko-KR')],
      [''],
      ['사용법'],
      ['1. 관리자 → 설정 → "백업 파일로 복구"에서 이 파일을 고르면 이 상태로 되돌아갑니다.'],
      ['2. 각 시트에서 글자를 고쳐서 올리면 고친 내용이 반영됩니다. 맨 위 머리글 줄은 바꾸지 마세요.'],
      ['3. 사진은 엑셀에 담을 수 없어 빠져 있습니다. 복구할 때 같은 부스ID의 지금 사진이 그대로 유지됩니다.'],
      ['4. 사진까지 완전히 백업하려면 JSON 백업 파일을 함께 보관하세요.'],
      ['5. 회차별 예약 인원은 "예약" 시트의 인원 합계로, 줄서기 대기 인원은 "번호표" 시트의 기록으로 자동 계산됩니다.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), '안내');
    const settings = Object.entries(data.settings || {}).filter(([k]) => k !== 'heroPhotos')
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['항목', '값'], ...settings]), '설정');
    for (const [title, def] of Object.entries(SHEETS)) {
      const rows = (data[def.key] || []).map(item => def.cols.map(([, key, type]) => toCell(item[key], type)));
      const ws = XLSX.utils.aoa_to_sheet([def.cols.map(c => c[0]), ...rows]);
      ws['!cols'] = def.cols.map(([h]) => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
      XLSX.utils.book_append_sheet(wb, ws, title);
    }
    return wb;
  }
  async function downloadExcel(data = Store.exportData({ images: false }), name = `UJHS_backup_${stamp()}.xlsx`) {
    const XLSX = await loadXLSX();
    const wb = await toWorkbook(data);
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  }

  // ---------- 읽기 ----------
  async function fromWorkbook(buf) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(buf, { type: 'array' });
    const data = { app: 'ujhs-festival', version: 5, settings: {} };
    const setWs = wb.Sheets['설정'];
    if (setWs) {
      XLSX.utils.sheet_to_json(setWs, { header: 1, defval: '' }).slice(1).forEach(([k, v]) => {
        if (!k) return;
        try { data.settings[k] = JSON.parse(v); } catch (e) { data.settings[k] = String(v); }
      });
    }
    for (const [title, def] of Object.entries(SHEETS)) {
      const ws = wb.Sheets[title];
      if (!ws) { data[def.key] = ['accounts', 'queues', 'tickets'].includes(def.key) ? [] : null; continue; }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      data[def.key] = rows
        .filter(r => Object.values(r).some(v => v !== ''))
        .map(r => {
          const o = {};
          def.cols.forEach(([h, key, type]) => { o[key] = fromCell(r[h], type, key); });
          // 엑셀이 전화번호를 숫자로 바꾸면 맨 앞 0이 사라지므로 되살림 (1012345678 → 01012345678)
          if ('phone' in o && o.phone) { o.phone = String(o.phone).replace(/\D/g, ''); if (/^1\d{8,9}$/.test(o.phone)) o.phone = '0' + o.phone; }
          return o;
        });
    }
    if (!data.booths) throw new Error("엑셀 파일에 '부스' 시트가 없어요. 이 앱에서 만든 백업 파일인지 확인하세요.");
    return data;
  }

  // .json 또는 .xlsx 파일 → 백업 데이터
  async function readFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) {
      try { return JSON.parse(await file.text()); }
      catch (e) { throw new Error('JSON 파일을 읽지 못했어요. 파일이 손상되었을 수 있어요.'); }
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return fromWorkbook(await file.arrayBuffer());
    throw new Error('.xlsx(엑셀) 또는 .json 백업 파일만 올릴 수 있어요.');
  }

  return { downloadJSON, downloadExcel, readFile, toWorkbook, fromWorkbook, loadXLSX, stamp };
})();
