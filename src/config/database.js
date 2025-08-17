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

// 기존 database.js에 추가할 함수

const createTradingTables = async () => {
  try {
    const client = await pool.connect();
    
    console.log('📊 매매 관련 테이블 생성 중...');

    // 1. 매매 세션 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        strategy VARCHAR(50) NOT NULL,
        coins JSONB NOT NULL,
        settings JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        stopped_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. 포지션 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        type VARCHAR(10) NOT NULL,
        quantity DECIMAL(20, 8) NOT NULL,
        avg_price DECIMAL(20, 2) NOT NULL,
        current_price DECIMAL(20, 2),
        unrealized_pnl DECIMAL(15, 2) DEFAULT 0,
        profit DECIMAL(10, 4),
        order_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. 거래 기록 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        type VARCHAR(10) NOT NULL,
        price DECIMAL(20, 2) NOT NULL,
        quantity DECIMAL(20, 8) NOT NULL,
        amount DECIMAL(20, 2) GENERATED ALWAYS AS (price * quantity) STORED,
        profit DECIMAL(10, 4),
        fee DECIMAL(20, 8) DEFAULT 0,
        order_id VARCHAR(100),
        strategy VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. 업비트 API 키 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS upbit_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        access_key VARCHAR(255) NOT NULL,
        secret_key VARCHAR(500) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. 사용자 매매 설정 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_trading_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        default_strategy VARCHAR(50) DEFAULT 'momentum',
        investment_amount DECIMAL(20, 2) DEFAULT 1000000,
        stop_loss DECIMAL(5, 2) DEFAULT 5.0,
        take_profit DECIMAL(5, 2) DEFAULT 10.0,
        trading_interval INTEGER DEFAULT 60,
        max_positions INTEGER DEFAULT 5,
        risk_level VARCHAR(20) DEFAULT 'medium',
        auto_rebalance BOOLEAN DEFAULT false,
        notifications JSONB DEFAULT '{"email": true, "push": false}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. 매매 로그 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(100),
        level VARCHAR(10) NOT NULL,
        message TEXT NOT NULL,
        symbol VARCHAR(20),
        additional_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. 백테스팅 결과 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS backtest_results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        strategy VARCHAR(50) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        initial_amount DECIMAL(20, 2) NOT NULL,
        final_amount DECIMAL(20, 2) NOT NULL,
        total_return DECIMAL(10, 4) NOT NULL,
        total_trades INTEGER NOT NULL,
        win_count INTEGER NOT NULL,
        loss_count INTEGER NOT NULL,
        win_rate DECIMAL(5, 2) NOT NULL,
        max_drawdown DECIMAL(10, 4),
        sharpe_ratio DECIMAL(10, 4),
        result_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 인덱스 생성
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_trading_sessions_user_id ON trading_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)',
      'CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_trading_logs_user_id ON trading_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_positions_user_symbol_status ON positions(user_id, symbol, status)'
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.log(`⚠️ 인덱스 생성 실패: ${err.message}`);
        }
      }
    }

    // 트리거 함수 생성
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 트리거 적용
    const triggers = [
      'CREATE TRIGGER update_trading_sessions_updated_at BEFORE UPDATE ON trading_sessions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()',
      'CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()',
      'CREATE TRIGGER update_user_trading_settings_updated_at BEFORE UPDATE ON user_trading_settings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()',
      'CREATE TRIGGER update_upbit_api_keys_updated_at BEFORE UPDATE ON upbit_api_keys FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()'
    ];

    for (const triggerQuery of triggers) {
      try {
        await client.query(triggerQuery);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.log(`⚠️ 트리거 생성 실패: ${err.message}`);
        }
      }
    }

    // 기본 사용자 설정 생성 함수
    await client.query(`
      CREATE OR REPLACE FUNCTION create_default_trading_settings()
      RETURNS TRIGGER AS $$
      BEGIN
          INSERT INTO user_trading_settings (user_id)
          VALUES (NEW.id)
          ON CONFLICT (user_id) DO NOTHING;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 사용자 생성시 기본 설정 자동 생성 트리거
    try {
      await client.query(`
        CREATE TRIGGER trigger_create_default_trading_settings
            AFTER INSERT ON users
            FOR EACH ROW
            EXECUTE FUNCTION create_default_trading_settings();
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log(`⚠️ 기본 설정 트리거 생성 실패: ${err.message}`);
      }
    }

    // 기존 사용자들에게 기본 설정 추가
    await client.query(`
      INSERT INTO user_trading_settings (user_id, default_strategy, investment_amount, stop_loss, take_profit)
      SELECT id, 'momentum', 1000000, 5.0, 10.0
      FROM users 
      WHERE NOT EXISTS (
          SELECT 1 FROM user_trading_settings WHERE user_trading_settings.user_id = users.id
      );
    `);

    client.release();
    console.log('✅ 매매 관련 테이블 생성 및 설정 완료');
    
  } catch (err) {
    console.error('❌ 매매 테이블 생성 실패:', err);
    throw err;
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
  createTradingTables,  // 새로 추가
  query
};