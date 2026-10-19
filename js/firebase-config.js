/* =========================================================
   Firebase 연결 설정
   - 비워두면(apiKey: '') → 로컬 모드: 이 브라우저에만 저장 (연습/시연용)
   - 채우면              → 서버 모드: 모든 기기가 같은 데이터를 실시간 공유

   Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹 </>) > "SDK 설정 및 구성"의 firebaseConfig 값을
   아래에 그대로 붙여넣으세요. (README.md의 "서버 연결" 참고)
   이 값은 웹페이지에 공개되어도 괜찮습니다. 보안은 firestore.rules가 담당합니다.
   ========================================================= */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCdbq3vfnkSmfbABrfD9DfHj4Fvz1qh_7c',
  authDomain: 'unjeong-festival.firebaseapp.com',
  projectId: 'unjeong-festival',
  storageBucket: 'unjeong-festival.firebasestorage.app',
  messagingSenderId: '68307335488',
  appId: '1:68307335488:web:c0e001b93fbba0aeb722a5',
};
