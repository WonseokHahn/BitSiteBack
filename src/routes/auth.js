console.log('🔐 auth.js 라우터 파일이 로딩되었습니다');

const express = require('express');
const router = express.Router();
 
console.log('✅ Auth 라우터가 생성되었습니다');

// 테스트 라우트
router.get('/test', (req, res) => {
  console.log('🧪 Auth 테스트 라우트 호출');
  res.json({ 
    message: 'Auth 라우터가 정상 작동합니다!',
    timestamp: new Date().toISOString(),
    routes: [
      'GET /api/auth/test',
      'GET /api/auth/google',
      'GET /api/auth/kakao',
      'GET /api/auth/profile'
    ]
  });
});

// 구글 로그인 라우트 (간단한 버전)
router.get('/google', (req, res) => {
  console.log('🔍 Google 로그인 요청 받음');
  
  // 실제로는 여기서 OAuth 리다이렉트를 해야 하지만, 
  // 지금은 테스트용으로 간단한 응답
  res.json({
    message: 'Google OAuth 로그인',
    status: 'development',
    note: 'OAuth 설정이 완료되면 Google 로그인 페이지로 리다이렉트됩니다',
    redirectUrl: 'https://accounts.google.com/oauth/authorize?...',
    timestamp: new Date().toISOString()
  });
});

// 카카오 로그인 라우트 (간단한 버전)
router.get('/kakao', (req, res) => {
  console.log('🔍 Kakao 로그인 요청 받음');
  
  res.json({
    message: 'Kakao OAuth 로그인',
    status: 'development', 
    note: 'OAuth 설정이 완료되면 Kakao 로그인 페이지로 리다이렉트됩니다',
    redirectUrl: 'https://kauth.kakao.com/oauth/authorize?...',
    timestamp: new Date().toISOString()
  });
});

// 프로필 조회 라우트
router.get('/profile', (req, res) => {
  console.log('👤 프로필 조회 요청');
  
  // 실제로는 JWT 토큰을 확인해야 하지만, 테스트용
  res.json({
    message: '사용자 프로필 조회',
    status: 'development',
    note: '로그인 구현 후 실제 사용자 정보가 반환됩니다',
    sampleUser: {
      id: 1,
      name: '테스트 사용자',
      email: 'test@example.com'
    },
    timestamp: new Date().toISOString()
  });
});

// 로그아웃 라우트
router.post('/logout', (req, res) => {
  console.log('👋 로그아웃 요청');
  
  res.json({
    message: '로그아웃 완료',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

// OAuth 콜백 라우트들 (개발용)
router.get('/google/callback', (req, res) => {
  console.log('🔄 Google OAuth 콜백');
  res.json({
    message: 'Google OAuth 콜백',
    status: 'development',
    query: req.query
  });
});

router.get('/kakao/callback', (req, res) => {
  console.log('🔄 Kakao OAuth 콜백');
  res.json({
    message: 'Kakao OAuth 콜백',
    status: 'development',
    query: req.query
  });
});

// 라우터 에러 핸들링
router.use((err, req, res, next) => {
  console.error('❌ Auth 라우터 에러:', err);
  res.status(500).json({
    error: 'Auth Router Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Auth 라우터 설정 완료');

module.exports = router;