const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

console.log('🏗️ Express 앱을 생성합니다...');

const app = express();

// 미들웨어 설정
console.log('⚙️ 미들웨어를 설정합니다...');
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 로딩 (에러 처리 포함)
console.log('📂 라우터를 로딩합니다...');

try {
  // Auth 라우터
  console.log('🔐 Auth 라우터를 로딩합니다...');
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth 라우터 연결 완료');

  // News 라우터
  console.log('📰 News 라우터를 로딩합니다...');
  const newsRoutes = require('./routes/news');
  app.use('/api/news', newsRoutes);
  console.log('✅ News 라우터 연결 완료');

} catch (error) {
  console.error('❌ 라우터 로딩 실패:', error.message);
  console.log('⚠️ 기본 라우터로 폴백합니다...');
}

// 기본 라우트
app.get('/', (req, res) => {
  console.log('📍 기본 라우트 접근');
  res.json({ 
    message: '주식 자동매매 API 서버',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      news: '/api/news/*',
      trading: '/api/trading/*'
    }
  });
});

// API 요청 로깅 미들웨어
app.use('/api/*', (req, res, next) => {
  console.log(`🔍 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('📝 Headers:', req.headers);
  if (Object.keys(req.body).length > 0) {
    console.log('📦 Body:', req.body);
  }
  next();
});

// 404 핸들링
app.use('*', (req, res) => {
  console.log(`❌ 404 - 경로를 찾을 수 없음: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found',
    message: '요청한 리소스를 찾을 수 없습니다.',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
  console.error('💥 서버 에러:', err);
  console.error('📍 Error Stack:', err.stack);
  
  res.status(err.status || 500).json({ 
    error: 'Internal Server Error',
    message: '서버 오류가 발생했습니다.',
    details: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : {},
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Express 앱 설정 완료');

module.exports = app;