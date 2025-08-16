console.log('🔐 OAuth 설정 파일이 로딩되었습니다');

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const KakaoStrategy = require('passport-kakao').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const { query } = require('./database');

// 환경 변수 확인
console.log('🔍 OAuth 환경 변수 확인:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ 설정됨' : '❌ 미설정');
console.log('- GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ 설정됨' : '❌ 미설정');
console.log('- KAKAO_CLIENT_ID:', process.env.KAKAO_CLIENT_ID ? '✅ 설정됨' : '❌ 미설정');

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('🔧 Google OAuth 전략을 설정합니다...');
  
  // 콜백 URL을 환경에 따라 설정 (중요!)
  const googleCallbackURL = process.env.NODE_ENV === 'production' 
    ? "https://tradesiteback.onrender.com/api/auth/google/callback"  // 프로덕션: HTTPS
    : "http://localhost:3000/api/auth/google/callback";             // 개발: HTTP
  
  console.log('🔗 Google 콜백 URL:', googleCallbackURL);
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleCallbackURL  // 절대 URL 사용
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Google 사용자 정보 수신:', {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value
      });
      
      // 기존 사용자 확인
      const existingUser = await query(
        'SELECT * FROM users WHERE google_id = $1',
        [profile.id]
      );
      
      if (existingUser.rows.length > 0) {
        console.log('✅ 기존 Google 사용자 로그인:', existingUser.rows[0].email);
        
        // 마지막 로그인 시간 업데이트
        await query(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [existingUser.rows[0].id]
        );
        
        return done(null, existingUser.rows[0]);
      }
      
      // 새 사용자 생성
      console.log('🆕 새 Google 사용자 생성 중...');
      const newUser = await query(
        `INSERT INTO users (google_id, email, name, avatar, last_login_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          profile.id,
          profile.emails?.[0]?.value || null,
          profile.displayName,
          profile.photos?.[0]?.value || null
        ]
      );
      
      console.log('✅ 새 Google 사용자 생성 완료:', newUser.rows[0].email);
      done(null, newUser.rows[0]);
      
    } catch (error) {
      console.error('❌ Google OAuth 데이터베이스 처리 실패:', error);
      done(error, null);
    }
  }));
  
  console.log('✅ Google OAuth 전략 설정 완료');
}

// Kakao OAuth Strategy
if (process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET) {
  console.log('🔧 Kakao OAuth 전략을 설정합니다...');
  
  // 콜백 URL을 환경에 따라 설정 (중요!)
  const kakaoCallbackURL = process.env.NODE_ENV === 'production'
    ? "https://tradesiteback.onrender.com/api/auth/kakao/callback"   // 프로덕션: HTTPS
    : "http://localhost:3000/api/auth/kakao/callback";              // 개발: HTTP
  
  console.log('🔗 Kakao 콜백 URL:', kakaoCallbackURL);
  
  passport.use(new KakaoStrategy({
    clientID: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    callbackURL: kakaoCallbackURL  // 절대 URL 사용
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Kakao 사용자 정보 수신:', {
        id: profile.id,
        name: profile.displayName,
        email: profile._json.kakao_account?.email
      });
      
      // 기존 사용자 확인
      const existingUser = await query(
        'SELECT * FROM users WHERE kakao_id = $1',
        [profile.id.toString()]
      );
      
      if (existingUser.rows.length > 0) {
        console.log('✅ 기존 Kakao 사용자 로그인:', existingUser.rows[0].email);
        
        // 마지막 로그인 시간 업데이트
        await query(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [existingUser.rows[0].id]
        );
        
        return done(null, existingUser.rows[0]);
      }
      
      // 새 사용자 생성
      console.log('🆕 새 Kakao 사용자 생성 중...');
      const newUser = await query(
        `INSERT INTO users (kakao_id, email, name, avatar, last_login_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          profile.id.toString(),
          profile._json.kakao_account?.email || null,
          profile.displayName,
          profile._json.kakao_account?.profile?.profile_image_url || null
        ]
      );
      
      console.log('✅ 새 Kakao 사용자 생성 완료:', newUser.rows[0].email);
      done(null, newUser.rows[0]);
      
    } catch (error) {
      console.error('❌ Kakao OAuth 데이터베이스 처리 실패:', error);
      done(error, null);
    }
  }));
  
  console.log('✅ Kakao OAuth 전략 설정 완료');
}

// JWT Strategy
if (process.env.JWT_SECRET) {
  console.log('🔧 JWT 전략을 설정합니다...');
  
  passport.use(new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
  }, async (payload, done) => {
    try {
      console.log('🔍 JWT 페이로드 검증:', { id: payload.id, email: payload.email });
      
      const result = await query(
        'SELECT * FROM users WHERE id = $1',
        [payload.id]
      );
      
      if (result.rows.length > 0) {
        console.log('✅ JWT 사용자 인증 성공:', result.rows[0].email);
        return done(null, result.rows[0]);
      }
      
      console.log('❌ JWT 사용자를 찾을 수 없음');
      return done(null, false);
    } catch (error) {
      console.error('❌ JWT 검증 실패:', error);
      return done(error, false);
    }
  }));
  
  console.log('✅ JWT 전략 설정 완료');
}

console.log('✅ OAuth 설정 파일 로딩 완료');

module.exports = passport;