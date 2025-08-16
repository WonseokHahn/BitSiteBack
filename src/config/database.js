const { Pool } = require('pg');

let pool;

const connectDB = async () => {
  try {
    const config = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      family: 4 // IPv4 강제

    };

    pool = new Pool(config);
    
    // 연결 테스트
    const client = await pool.connect();
    console.log('✅ PostgreSQL 데이터베이스 연결 성공');
    client.release();
    
    // 테이블 생성 및 업데이트
    await createTablesWithSafeUpdate();
  } catch (err) {
    console.error('❌ 데이터베이스 연결 실패:', err);
    process.exit(1);
  }
};

const createTablesWithSafeUpdate = async () => {
  try {
    const client = await pool.connect();
    
    console.log('🔍 기존 테이블 확인 및 안전한 업데이트...');

    // Users 테이블 생성 (IF NOT EXISTS 사용)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255),
        kakao_id VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        avatar VARCHAR(500),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users 테이블에 제약조건 추가 (존재하지 않을 경우만)
    try {
      await client.query(`
        ALTER TABLE users 
        ADD CONSTRAINT uq_users_google_id UNIQUE (google_id);
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('⚠️ users google_id 제약조건 추가 실패:', err.message);
      }
    }

    try {
      await client.query(`
        ALTER TABLE users 
        ADD CONSTRAINT uq_users_kakao_id UNIQUE (kakao_id);
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('⚠️ users kakao_id 제약조건 추가 실패:', err.message);
      }
    }

    try {
      await client.query(`
        ALTER TABLE users 
        ADD CONSTRAINT ck_users_oauth CHECK (
          (google_id IS NOT NULL) OR (kakao_id IS NOT NULL)
        );
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('⚠️ users oauth 체크 제약조건 추가 실패:', err.message);
      }
    }


    // 인덱스 생성 (존재하지 않을 경우만)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)', 
      'CREATE INDEX IF NOT EXISTS idx_users_kakao_id ON users(kakao_id)'
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (err) {
        console.log(`⚠️ 인덱스 생성 실패: ${err.message}`);
      }
    }

    client.release();
    console.log('✅ PostgreSQL 테이블 안전 업데이트 완료');
    
  } catch (err) {
    console.error('❌ 테이블 생성/업데이트 실패:', err);
    console.error('상세 오류:', err.message);
    throw err;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('데이터베이스가 연결되지 않았습니다.');
  }
  return pool;
};

// PostgreSQL 쿼리 헬퍼 함수들
const query = async (text, params) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

module.exports = {
  connectDB,
  getPool,
  query
};