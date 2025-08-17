const UpbitService = require('./upbitService');
const { query } = require('../config/database');

// 매매 전략 구현
const strategies = {
  // 1. 모멘텀 전략 (RSI + MACD + 이동평균)
  momentum: {
    name: '모멘텀 전략',
    
    async shouldBuy(symbol, marketData, indicators) {
      const { rsi, macd, macdSignal, ema20, ema50 } = indicators;
      const { trade_price: currentPrice } = marketData;
      
      // 매수 조건:
      // 1. RSI가 30~70 사이 (과매도/과매수 아님)
      // 2. MACD가 시그널선 상향 돌파
      // 3. 현재가가 20일 이평선 위
      // 4. 20일 이평선이 50일 이평선 위 (상승 추세)
      const conditions = [
        rsi > 30 && rsi < 70,
        macd > macdSignal,
        currentPrice > ema20,
        ema20 > ema50
      ];
      
      const passedConditions = conditions.filter(Boolean).length;
      console.log(`[${symbol}] 모멘텀 매수 조건: ${passedConditions}/4 (RSI: ${rsi.toFixed(2)}, MACD: ${macd.toFixed(4)})`);
      
      return passedConditions >= 3; // 4개 중 3개 이상 만족
    },
    
    async shouldSell(symbol, position, marketData, indicators) {
      const { rsi, macd, macdSignal } = indicators;
      const { trade_price: currentPrice } = marketData;
      const profitRate = ((currentPrice - position.avg_price) / position.avg_price) * 100;
      
      // 매도 조건:
      // 1. RSI 과매수 (70 이상)
      // 2. MACD가 시그널선 하향 돌파
      // 3. 수익률 10% 이상 (익절)
      // 4. 손실률 -5% 이하 (손절)
      const conditions = [
        rsi > 70,
        macd < macdSignal,
        profitRate >= 10,
        profitRate <= -5
      ];
      
      const shouldSellReasons = [];
      if (rsi > 70) shouldSellReasons.push('RSI과매수');
      if (macd < macdSignal) shouldSellReasons.push('MACD하향');
      if (profitRate >= 10) shouldSellReasons.push('익절(10%)');
      if (profitRate <= -5) shouldSellReasons.push('손절(-5%)');
      
      const shouldSell = conditions.some(Boolean);
      if (shouldSell) {
        console.log(`[${symbol}] 모멘텀 매도 신호: ${shouldSellReasons.join(', ')} (수익률: ${profitRate.toFixed(2)}%)`);
      }
      
      return shouldSell;
    }
  },
  
  // 2. 평균회귀 전략 (볼린저 밴드 + RSI)
  meanReversion: {
    name: '평균회귀 전략',
    
    async shouldBuy(symbol, marketData, indicators) {
      const { rsi, bollingerUpper, bollingerMiddle, bollingerLower } = indicators;
      const { trade_price: currentPrice } = marketData;
      
      // 하단 밴드와의 거리 계산 (%)
      const distanceFromLower = ((currentPrice - bollingerLower) / bollingerLower) * 100;
      
      // 매수 조건:
      // 1. RSI 과매도 (30 이하)
      // 2. 가격이 하단 밴드 근처 (2% 이내)
      // 3. 가격이 중간선 아래
      const conditions = [
        rsi <= 30,
        distanceFromLower <= 2,
        currentPrice < bollingerMiddle
      ];
      
      const passedConditions = conditions.filter(Boolean).length;
      console.log(`[${symbol}] 평균회귀 매수 조건: ${passedConditions}/3 (RSI: ${rsi.toFixed(2)}, 하단밴드거리: ${distanceFromLower.toFixed(2)}%)`);
      
      return passedConditions >= 2; // 3개 중 2개 이상 만족
    },
    
    async shouldSell(symbol, position, marketData, indicators) {
      const { rsi, bollingerUpper, bollingerMiddle } = indicators;
      const { trade_price: currentPrice } = marketData;
      const profitRate = ((currentPrice - position.avg_price) / position.avg_price) * 100;
      
      // 상단 밴드와의 거리 계산 (%)
      const distanceFromUpper = ((bollingerUpper - currentPrice) / bollingerUpper) * 100;
      
      // 매도 조건:
      // 1. RSI 과매수 (70 이상)
      // 2. 가격이 상단 밴드 근처 (2% 이내)
      // 3. 가격이 중간선 위
      // 4. 수익률 8% 이상 (익절)
      // 5. 손실률 -4% 이하 (손절)
      const conditions = [
        rsi >= 70,
        distanceFromUpper <= 2,
        currentPrice > bollingerMiddle,
        profitRate >= 8,
        profitRate <= -4
      ];
      
      const shouldSellReasons = [];
      if (rsi >= 70) shouldSellReasons.push('RSI과매수');
      if (distanceFromUpper <= 2) shouldSellReasons.push('상단밴드근접');
      if (currentPrice > bollingerMiddle) shouldSellReasons.push('중간선돌파');
      if (profitRate >= 8) shouldSellReasons.push('익절(8%)');
      if (profitRate <= -4) shouldSellReasons.push('손절(-4%)');
      
      const shouldSell = conditions.some(Boolean);
      if (shouldSell) {
        console.log(`[${symbol}] 평균회귀 매도 신호: ${shouldSellReasons.join(', ')} (수익률: ${profitRate.toFixed(2)}%)`);
      }
      
      return shouldSell;
    }
  },
  
  // 3. 변동성 돌파 전략 (볼린저 밴드 폭 + 거래량 + RSI)
  volatilityBreakout: {
    name: '변동성 돌파 전략',
    
    async shouldBuy(symbol, marketData, indicators) {
      const { rsi, bollingerUpper, bollingerWidth, bollingerWidthMA, volumeMA, prevHigh } = indicators;
      const { trade_price: currentPrice, acc_trade_volume_24h: volume } = marketData;
      
      // 매수 조건:
      // 1. 변동성 확장 (볼린저 밴드 폭이 평균보다 20% 이상 큰 경우)
      // 2. 상향 돌파 (현재가가 상단 밴드 돌파)
      // 3. 거래량 증가 (평균 거래량의 150% 이상)
      // 4. RSI 모멘텀 (50 이상)
      // 5. 신고점 돌파
      const conditions = [
        bollingerWidth > bollingerWidthMA * 1.2,
        currentPrice > bollingerUpper,
        volume > volumeMA * 1.5,
        rsi > 50,
        prevHigh && currentPrice > prevHigh
      ];
      
      const passedConditions = conditions.filter(Boolean).length;
      console.log(`[${symbol}] 변동성돌파 매수 조건: ${passedConditions}/5 (RSI: ${rsi.toFixed(2)}, 변동성: ${(bollingerWidth/bollingerWidthMA).toFixed(2)}x)`);
      
      return passedConditions >= 3; // 5개 중 3개 이상 만족
    },
    
    async shouldSell(symbol, position, marketData, indicators) {
      const { rsi, bollingerLower, bollingerWidth, bollingerWidthMA } = indicators;
      const { trade_price: currentPrice } = marketData;
      const profitRate = ((currentPrice - position.avg_price) / position.avg_price) * 100;
      
      // 매도 조건:
      // 1. 하향 돌파 (하단 밴드 이탈)
      // 2. 변동성 축소 (볼린저 밴드 폭이 평균보다 20% 이상 작은 경우)
      // 3. RSI 과매도 (30 이하)
      // 4. 수익률 15% 이상 (익절)
      // 5. 손실률 -7% 이하 (손절)
      const conditions = [
        currentPrice < bollingerLower,
        bollingerWidth < bollingerWidthMA * 0.8,
        rsi <= 30,
        profitRate >= 15,
        profitRate <= -7
      ];
      
      const shouldSellReasons = [];
      if (currentPrice < bollingerLower) shouldSellReasons.push('하향돌파');
      if (bollingerWidth < bollingerWidthMA * 0.8) shouldSellReasons.push('변동성축소');
      if (rsi <= 30) shouldSellReasons.push('RSI과매도');
      if (profitRate >= 15) shouldSellReasons.push('익절(15%)');
      if (profitRate <= -7) shouldSellReasons.push('손절(-7%)');
      
      const shouldSell = conditions.some(Boolean);
      if (shouldSell) {
        console.log(`[${symbol}] 변동성돌파 매도 신호: ${shouldSellReasons.join(', ')} (수익률: ${profitRate.toFixed(2)}%)`);
      }
      
      return shouldSell;
    }
  }
};

class TradingService {
  constructor() {
    this.activeSessions = new Map(); // userId -> sessionData
    this.tradingIntervals = new Map(); // userId -> intervalId
  }
  
  // 매매 세션 생성
  async createTradingSession({ userId, strategy, coins, settings }) {
    const sessionId = `session_${userId}_${Date.now()}`;
    
    // 데이터베이스에 세션 저장
    await query(
      `INSERT INTO trading_sessions (session_id, user_id, strategy, coins, settings, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP)`,
      [sessionId, userId, strategy, JSON.stringify(coins), JSON.stringify(settings)]
    );
    
    // 메모리에 세션 데이터 저장
    this.activeSessions.set(userId, {
      sessionId,
      strategy,
      coins,
      settings,
      startTime: new Date(),
      isActive: true
    });
    
    console.log(`📊 매매 세션 생성: ${sessionId} (전략: ${strategy}, 종목: ${coins.length}개)`);
    return sessionId;
  }
  
  // 매매 루프 시작
  async startTradingLoop(sessionId) {
    const session = Array.from(this.activeSessions.values()).find(s => s.sessionId === sessionId);
    if (!session) {
      throw new Error('세션을 찾을 수 없습니다.');
    }
    
    const { userId } = session;
    const { coins, settings } = session;
    
    console.log(`🔄 매매 루프 시작: ${sessionId}`);
    
    // 이전 인터벌 정리
    if (this.tradingIntervals.has(userId)) {
      clearInterval(this.tradingIntervals.get(userId));
    }
    
    // 새 매매 루프 시작
    const intervalId = setInterval(async () => {
      try {
        if (!this.activeSessions.has(userId) || !this.activeSessions.get(userId).isActive) {
          console.log(`⏹️ 매매 루프 종료: ${sessionId}`);
          clearInterval(intervalId);
          this.tradingIntervals.delete(userId);
          return;
        }
        
        await this.executeTradingCycle(userId, session);
      } catch (error) {
        console.error(`❌ 매매 사이클 오류 (${sessionId}):`, error);
      }
    }, settings.tradingInterval * 1000);
    
    this.tradingIntervals.set(userId, intervalId);
  }
  
  // 매매 사이클 실행
  async executeTradingCycle(userId, session) {
    const { strategy, coins, settings } = session;
    
    for (const symbol of coins) {
      try {
        await this.executeTrading(userId, symbol, strategy, settings);
        
        // API 호출 제한을 위한 지연
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ ${symbol} 매매 실행 오류:`, error);
      }
    }
  }
  
  // 개별 종목 매매 실행
  async executeTrading(userId, symbol, strategyName, settings) {
    try {
      // 현재 시장 데이터 조회
      const [ticker] = await UpbitService.getTicker([symbol]);
      if (!ticker) return;
      
      // 기술적 지표 계산
      const indicators = await this.calculateIndicators(symbol);
      
      // 현재 포지션 확인
      const position = await this.getCurrentPosition(userId, symbol);
      
      // 전략 실행
      const strategy = strategies[strategyName];
      if (!strategy) {
        console.error(`❌ 알 수 없는 전략: ${strategyName}`);
        return;
      }
      
      if (!position) {
        // 포지션이 없는 경우 - 매수 검토
        const shouldBuy = await strategy.shouldBuy(symbol, ticker, indicators);
        if (shouldBuy) {
          await this.executeBuy(userId, symbol, ticker, settings);
        }
      } else {
        // 포지션이 있는 경우 - 매도 검토
        const shouldSell = await strategy.shouldSell(symbol, position, ticker, indicators);
        if (shouldSell) {
          await this.executeSell(userId, symbol, ticker, position);
        }
      }
    } catch (error) {
      console.error(`❌ ${symbol} 매매 실행 중 오류:`, error);
    }
  }
  
  // 매수 실행
  async executeBuy(userId, symbol, ticker, settings) {
    try {
      const investAmount = settings.investmentAmount / settings.maxPositions || 5;
      const currentPrice = ticker.trade_price;
      const quantity = (investAmount / currentPrice).toFixed(8);
      
      console.log(`💰 매수 시도: ${symbol} @ ${currentPrice} × ${quantity}`);
      
      // 업비트 매수 주문
      const order = await UpbitService.buyOrder(userId, {
        symbol,
        price: currentPrice,
        quantity: parseFloat(quantity)
      });
      
      // 포지션 기록
      await this.createPosition({
        userId,
        symbol,
        type: 'long',
        quantity: parseFloat(quantity),
        avgPrice: currentPrice,
        orderId: order.uuid
      });
      
      // 거래 기록
      await this.recordTrade({
        userId,
        symbol,
        type: 'buy',
        price: currentPrice,
        quantity: parseFloat(quantity),
        orderId: order.uuid
      });
      
      console.log(`✅ 매수 완료: ${symbol} @ ${currentPrice}`);
    } catch (error) {
      console.error(`❌ 매수 실행 실패 (${symbol}):`, error);
    }
  }
  
  // 매도 실행
  async executeSell(userId, symbol, ticker, position) {
    try {
      const currentPrice = ticker.trade_price;
      const quantity = position.quantity;
      
      console.log(`💸 매도 시도: ${symbol} @ ${currentPrice} × ${quantity}`);
      
      // 업비트 매도 주문
      const order = await UpbitService.sellOrder(userId, {
        symbol,
        price: currentPrice,
        quantity
      });
      
      // 수익률 계산
      const profit = ((currentPrice - position.avg_price) / position.avg_price) * 100;
      
      // 포지션 종료
      await this.closePositionRecord(userId, symbol, profit);
      
      // 거래 기록
      await this.recordTrade({
        userId,
        symbol,
        type: 'sell',
        price: currentPrice,
        quantity,
        profit,
        orderId: order.uuid
      });
      
      console.log(`✅ 매도 완료: ${symbol} @ ${currentPrice} (수익률: ${profit.toFixed(2)}%)`);
    } catch (error) {
      console.error(`❌ 매도 실행 실패 (${symbol}):`, error);
    }
  }
  
  // 기술적 지표 계산
  async calculateIndicators(symbol) {
    try {
      // 캔들 데이터 조회 (200개)
      const candles = await UpbitService.getMinuteCandles(symbol, 1, 200);
      if (candles.length < 50) {
        throw new Error('충분한 캔들 데이터가 없습니다.');
      }
      
      // 데이터 정렬 (과거 -> 현재)
      candles.reverse();
      
      const indicators = {
        // RSI 계산
        rsi: this.calculateRSI(candles, 14),
        
        // MACD 계산
        ...this.calculateMACD(candles, 12, 26, 9),
        
        // 볼린저 밴드 계산
        ...this.calculateBollingerBands(candles, 20, 2),
        
        // 이동평균선
        ema20: this.calculateEMA(candles, 20),
        ema50: this.calculateEMA(candles, 50),
        
        // 거래량 평균
        volumeMA: this.calculateVolumeMA(candles, 20),
        
        // 이전 고점
        prevHigh: candles.length > 1 ? candles[candles.length - 2].high_price : null
      };
      
      return indicators;
    } catch (error) {
      console.error(`❌ ${symbol} 지표 계산 실패:`, error);
      return this.getDefaultIndicators();
    }
  }
  
  // RSI 계산
  calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].trade_price - candles[i - 1].trade_price;
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  // MACD 계산
  calculateMACD(candles, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.calculateEMA(candles, fast);
    const emaSlow = this.calculateEMA(candles, slow);
    const macd = emaFast - emaSlow;
    
    // 시그널 라인 계산을 위한 MACD 값들
    const macdValues = [];
    for (let i = Math.max(fast, slow); i < candles.length; i++) {
      const fastEma = this.calculateEMAAtIndex(candles, fast, i);
      const slowEma = this.calculateEMAAtIndex(candles, slow, i);
      macdValues.push(fastEma - slowEma);
    }
    
    const macdSignal = this.calculateEMAFromValues(macdValues, signal);
    
    return {
      macd,
      macdSignal,
      macdHistogram: macd - macdSignal
    };
  }
  
  // 볼린저 밴드 계산
  calculateBollingerBands(candles, period = 20, multiplier = 2) {
    if (candles.length < period) {
      return {
        bollingerUpper: 0,
        bollingerMiddle: 0,
        bollingerLower: 0,
        bollingerWidth: 0,
        bollingerWidthMA: 0
      };
    }
    
    const closes = candles.slice(-period).map(c => c.trade_price);
    const sma = closes.reduce((sum, price) => sum + price, 0) / period;
    
    const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const bollingerUpper = sma + (stdDev * multiplier);
    const bollingerLower = sma - (stdDev * multiplier);
    const bollingerWidth = bollingerUpper - bollingerLower;
    
    // 볼린저 밴드 폭의 이동평균
    const widthValues = [];
    for (let i = period; i <= candles.length; i++) {
      const periodCloses = candles.slice(i - period, i).map(c => c.trade_price);
      const periodSma = periodCloses.reduce((sum, p) => sum + p, 0) / period;
      const periodVariance = periodCloses.reduce((sum, p) => sum + Math.pow(p - periodSma, 2), 0) / period;
      const periodStdDev = Math.sqrt(periodVariance);
      widthValues.push((periodSma + periodStdDev * multiplier) - (periodSma - periodStdDev * multiplier));
    }
    
    const bollingerWidthMA = widthValues.length > 0 
      ? widthValues.reduce((sum, w) => sum + w, 0) / widthValues.length
      : bollingerWidth;
    
    return {
      bollingerUpper,
      bollingerMiddle: sma,
      bollingerLower,
      bollingerWidth,
      bollingerWidthMA
    };
  }
  
  // EMA 계산
  calculateEMA(candles, period) {
    if (candles.length === 0) return 0;
    
    const multiplier = 2 / (period + 1);
    let ema = candles[0].trade_price;
    
    for (let i = 1; i < candles.length; i++) {
      ema = (candles[i].trade_price * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
  
  // 특정 인덱스에서의 EMA 계산
  calculateEMAAtIndex(candles, period, index) {
    if (index >= candles.length) return 0;
    
    const multiplier = 2 / (period + 1);
    let ema = candles[Math.max(0, index - period + 1)].trade_price;
    
    for (let i = Math.max(1, index - period + 2); i <= index; i++) {
      ema = (candles[i].trade_price * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
  
  // 값 배열로부터 EMA 계산
  calculateEMAFromValues(values, period) {
    if (values.length === 0) return 0;
    
    const multiplier = 2 / (period + 1);
    let ema = values[0];
    
    for (let i = 1; i < values.length; i++) {
      ema = (values[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
  
  // 거래량 이동평균 계산
  calculateVolumeMA(candles, period = 20) {
    if (candles.length < period) return 0;
    
    const volumes = candles.slice(-period).map(c => c.candle_acc_trade_volume);
    return volumes.reduce((sum, vol) => sum + vol, 0) / period;
  }
  
  // 기본 지표값 반환 (오류시)
  getDefaultIndicators() {
    return {
      rsi: 50,
      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,
      bollingerUpper: 0,
      bollingerMiddle: 0,
      bollingerLower: 0,
      bollingerWidth: 0,
      bollingerWidthMA: 0,
      ema20: 0,
      ema50: 0,
      volumeMA: 0,
      prevHigh: null
    };
  }
  
  // 현재 포지션 조회
  async getCurrentPosition(userId, symbol) {
    try {
      const result = await query(
        'SELECT * FROM positions WHERE user_id = $1 AND symbol = $2 AND status = $3',
        [userId, symbol, 'open']
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('포지션 조회 오류:', error);
      return null;
    }
  }
  
  // 포지션 생성
  async createPosition({ userId, symbol, type, quantity, avgPrice, orderId }) {
    try {
      await query(
        `INSERT INTO positions (user_id, symbol, type, quantity, avg_price, order_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', CURRENT_TIMESTAMP)`,
        [userId, symbol, type, quantity, avgPrice, orderId]
      );
    } catch (error) {
      console.error('포지션 생성 오류:', error);
    }
  }
  
  // 포지션 종료
  async closePositionRecord(userId, symbol, profit) {
    try {
      await query(
        `UPDATE positions 
         SET status = 'closed', profit = $3, closed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND symbol = $2 AND status = 'open'`,
        [userId, symbol, profit]
      );
    } catch (error) {
      console.error('포지션 종료 기록 오류:', error);
    }
  }
  
  // 거래 기록
  async recordTrade({ userId, symbol, type, price, quantity, profit = null, orderId }) {
    try {
      await query(
        `INSERT INTO trades (user_id, symbol, type, price, quantity, profit, order_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [userId, symbol, type, price, quantity, profit, orderId]
      );
    } catch (error) {
      console.error('거래 기록 오류:', error);
    }
  }
  
  // 매매 중지
  async stopTrading(userId) {
    try {
      // 메모리에서 세션 제거
      if (this.activeSessions.has(userId)) {
        const session = this.activeSessions.get(userId);
        session.isActive = false;
        this.activeSessions.delete(userId);
        
        // 데이터베이스 세션 상태 업데이트
        await query(
          `UPDATE trading_sessions 
           SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP
           WHERE session_id = $1`,
          [session.sessionId]
        );
      }
      
      // 인터벌 정리
      if (this.tradingIntervals.has(userId)) {
        clearInterval(this.tradingIntervals.get(userId));
        this.tradingIntervals.delete(userId);
      }
      
      console.log(`⏹️ 매매 중지 완료: 사용자 ${userId}`);
    } catch (error) {
      console.error('매매 중지 오류:', error);
    }
  }
  
  // 매매 상태 조회
  async getTradingStatus(userId) {
    try {
      const session = this.activeSessions.get(userId);
      
      if (!session || !session.isActive) {
        return {
          isTrading: false,
          strategy: null,
          coins: [],
          startTime: null
        };
      }
      
      return {
        isTrading: true,
        strategy: session.strategy,
        coins: session.coins,
        startTime: session.startTime,
        sessionId: session.sessionId
      };
    } catch (error) {
      console.error('매매 상태 조회 오류:', error);
      return { isTrading: false };
    }
  }
  
  // 포지션 목록 조회
  async getPositions(userId) {
    try {
      const result = await query(
        `SELECT * FROM positions 
         WHERE user_id = $1 AND status = 'open'
         ORDER BY created_at DESC`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      console.error('포지션 조회 오류:', error);
      return [];
    }
  }
  
  // 매매 기록 조회
  async getTradingHistory(userId, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      
      const result = await query(
        `SELECT * FROM trades 
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      
      const countResult = await query(
        'SELECT COUNT(*) FROM trades WHERE user_id = $1',
        [userId]
      );
      
      return {
        trades: result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      };
    } catch (error) {
      console.error('매매 기록 조회 오류:', error);
      return { trades: [], total: 0, page: 1, limit, totalPages: 0 };
    }
  }
  
  // 포지션 강제 종료
  async closePosition(userId, symbol) {
    try {
      const position = await this.getCurrentPosition(userId, symbol);
      if (!position) {
        throw new Error('해당 포지션을 찾을 수 없습니다.');
      }
      
      // 현재 시세 조회
      const [ticker] = await UpbitService.getTicker([symbol]);
      const currentPrice = ticker.trade_price;
      
      // 매도 주문 실행
      const order = await UpbitService.sellOrder(userId, {
        symbol,
        price: currentPrice,
        quantity: position.quantity
      });
      
      // 수익률 계산
      const profit = ((currentPrice - position.avg_price) / position.avg_price) * 100;
      
      // 포지션 종료 기록
      await this.closePositionRecord(userId, symbol, profit);
      
      // 거래 기록
      await this.recordTrade({
        userId,
        symbol,
        type: 'sell',
        price: currentPrice,
        quantity: position.quantity,
        profit,
        orderId: order.uuid
      });
      
      return {
        symbol,
        profit,
        closedPrice: currentPrice,
        quantity: position.quantity
      };
    } catch (error) {
      console.error('포지션 강제 종료 오류:', error);
      throw error;
    }
  }
  
  // 백테스팅 실행
  async runBacktest({ strategy, symbol, startDate, endDate, initialAmount }) {
    try {
      console.log(`📊 백테스팅 시작: ${strategy} - ${symbol} (${startDate} ~ ${endDate})`);
      
      // 캔들 데이터 조회 (일봉)
      const candles = await UpbitService.getDayCandles(symbol, 365); // 최대 1년
      
      // 날짜 필터링
      const filteredCandles = candles.filter(candle => {
        const candleDate = new Date(candle.candle_date_time_kst);
        return candleDate >= new Date(startDate) && candleDate <= new Date(endDate);
      }).reverse(); // 과거 -> 현재 순서
      
      if (filteredCandles.length < 30) {
        throw new Error('백테스팅을 위한 충분한 데이터가 없습니다.');
      }
      
      let balance = initialAmount;
      let position = null;
      let trades = [];
      let totalProfit = 0;
      let winCount = 0;
      let lossCount = 0;
      
      const strategyImpl = strategies[strategy];
      if (!strategyImpl) {
        throw new Error(`지원하지 않는 전략입니다: ${strategy}`);
      }
      
      // 백테스팅 실행
      for (let i = 50; i < filteredCandles.length; i++) { // 지표 계산을 위해 50일 후부터
        const candle = filteredCandles[i];
        const indicators = this.calculateIndicatorsForBacktest(filteredCandles.slice(0, i + 1));
        
        if (!position) {
          // 매수 검토
          const shouldBuy = await strategyImpl.shouldBuy(symbol, candle, indicators);
          if (shouldBuy && balance > candle.trade_price) {
            const quantity = Math.floor((balance * 0.95) / candle.trade_price); // 95% 투자
            const cost = quantity * candle.trade_price;
            
            position = {
              symbol,
              quantity,
              avg_price: candle.trade_price,
              entry_date: candle.candle_date_time_kst
            };
            
            balance -= cost;
            trades.push({
              type: 'buy',
              date: candle.candle_date_time_kst,
              price: candle.trade_price,
              quantity,
              balance: balance + (quantity * candle.trade_price)
            });
          }
        } else {
          // 매도 검토
          const shouldSell = await strategyImpl.shouldSell(symbol, position, candle, indicators);
          if (shouldSell) {
            const sellValue = position.quantity * candle.trade_price;
            const profit = ((candle.trade_price - position.avg_price) / position.avg_price) * 100;
            
            balance += sellValue;
            totalProfit += profit;
            
            if (profit > 0) winCount++;
            else lossCount++;
            
            trades.push({
              type: 'sell',
              date: candle.candle_date_time_kst,
              price: candle.trade_price,
              quantity: position.quantity,
              profit,
              balance
            });
            
            position = null;
          }
        }
      }
      
      // 마지막 포지션이 있으면 강제 매도
      if (position) {
        const lastCandle = filteredCandles[filteredCandles.length - 1];
        const sellValue = position.quantity * lastCandle.trade_price;
        const profit = ((lastCandle.trade_price - position.avg_price) / position.avg_price) * 100;
        
        balance += sellValue;
        totalProfit += profit;
        
        if (profit > 0) winCount++;
        else lossCount++;
        
        trades.push({
          type: 'sell',
          date: lastCandle.candle_date_time_kst,
          price: lastCandle.trade_price,
          quantity: position.quantity,
          profit,
          balance
        });
      }
      
      const totalReturn = ((balance - initialAmount) / initialAmount) * 100;
      const winRate = totalTrades > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
      const totalTrades = winCount + lossCount;
      
      return {
        strategy,
        symbol,
        period: { startDate, endDate },
        initialAmount,
        finalAmount: balance,
        totalReturn,
        totalProfit,
        totalTrades,
        winCount,
        lossCount,
        winRate,
        trades: trades.slice(-100) // 최근 100개 거래만 반환
      };
    } catch (error) {
      console.error('백테스팅 오류:', error);
      throw error;
    }
  }
  
  // 백테스팅용 지표 계산
  calculateIndicatorsForBacktest(candles) {
    return {
      rsi: this.calculateRSI(candles, 14),
      ...this.calculateMACD(candles, 12, 26, 9),
      ...this.calculateBollingerBands(candles, 20, 2),
      ema20: this.calculateEMA(candles, 20),
      ema50: this.calculateEMA(candles, 50),
      volumeMA: this.calculateVolumeMA(candles, 20),
      prevHigh: candles.length > 1 ? candles[candles.length - 2].high_price : null
    };
  }
}

// 싱글톤 패턴
let instance = null;

function getTradingService() {
  if (!instance) {
    instance = new TradingService();
  }
  return instance;
}

module.exports = getTradingService();