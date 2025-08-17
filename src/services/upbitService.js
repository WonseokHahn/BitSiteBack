const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class UpbitService {
  constructor() {
    this.baseURL = 'https://api.upbit.com';
    this.accessKey = process.env.UPBIT_ACCESS_KEY;
    this.secretKey = process.env.UPBIT_SECRET_KEY;
  }
  
  // JWT 토큰 생성
  generateJWT(query = {}) {
    const payload = {
      access_key: this.accessKey,
      nonce: uuidv4()
    };
    
    if (Object.keys(query).length > 0) {
      const queryString = new URLSearchParams(query).toString();
      const hash = crypto.createHash('sha512');
      hash.update(queryString, 'utf-8');
      payload.query_hash = hash.digest('hex');
      payload.query_hash_alg = 'SHA512';
    }
    
    return jwt.sign(payload, this.secretKey);
  }
  
  // API 요청 헬퍼
  async request(method, endpoint, params = {}, needAuth = false) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {}
      };
      
      if (needAuth) {
        if (!this.accessKey || !this.secretKey) {
          throw new Error('업비트 API 키가 설정되지 않았습니다.');
        }
        
        const token = this.generateJWT(method === 'GET' ? params : {});
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      
      if (method === 'GET') {
        config.params = params;
      } else {
        config.data = params;
        config.headers['Content-Type'] = 'application/json';
      }
      
      const response = await axios(config);
      return response.data;
      
    } catch (error) {
      console.error(`업비트 API 오류 (${method} ${endpoint}):`, error.response?.data || error.message);
      throw new Error(`업비트 API 오류: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  // 마켓 목록 조회
  async getMarkets() {
    return await this.request('GET', '/v1/market/all');
  }
  
  // 현재가 조회
  async getTicker(markets) {
    const marketsParam = Array.isArray(markets) ? markets.join(',') : markets;
    return await this.request('GET', '/v1/ticker', { markets: marketsParam });
  }
  
  // 캔들 데이터 조회
  async getCandles(market, unit = 'minutes', count = 200, to = null) {
    const endpoint = `/v1/candles/${unit}/1`;
    const params = { market, count };
    if (to) params.to = to;
    
    return await this.request('GET', endpoint, params);
  }
  
  // 일봉 조회
  async getDayCandles(market, count = 200, to = null) {
    return await this.getCandles(market, 'days', count, to);
  }
  
  // 분봉 조회 (1분, 3분, 5분, 10분, 15분, 30분, 60분, 240분)
  async getMinuteCandles(market, unit = 1, count = 200, to = null) {
    const endpoint = `/v1/candles/minutes/${unit}`;
    const params = { market, count };
    if (to) params.to = to;
    
    return await this.request('GET', endpoint, params);
  }
  
  // 주봉 조회
  async getWeekCandles(market, count = 200, to = null) {
    return await this.getCandles(market, 'weeks', count, to);
  }
  
  // 월봉 조회
  async getMonthCandles(market, count = 200, to = null) {
    return await this.getCandles(market, 'months', count, to);
  }
  
  // 호가 정보 조회
  async getOrderbook(markets) {
    const marketsParam = Array.isArray(markets) ? markets.join(',') : markets;
    return await this.request('GET', '/v1/orderbook', { markets: marketsParam });
  }
  
  // 계좌 조회
  async getAccount(userId) {
    try {
      return await this.request('GET', '/v1/accounts', {}, true);
    } catch (error) {
      console.error('계좌 조회 실패:', error);
      // 개발/테스트 환경에서는 모의 데이터 반환
      if (process.env.NODE_ENV === 'development') {
        return [
          {
            currency: 'KRW',
            balance: '1000000.0',
            locked: '0.0',
            avg_buy_price: '0',
            avg_buy_price_modified: false,
            unit_currency: 'KRW'
          }
        ];
      }
      throw error;
    }
  }
  
  // 주문 가능 정보 조회
  async getOrderChance(market) {
    return await this.request('GET', '/v1/orders/chance', { market }, true);
  }
  
  // 주문하기
  async placeOrder(orderData) {
    const { market, side, volume, price, ord_type } = orderData;
    
    const params = {
      market,
      side, // 'bid' (매수) or 'ask' (매도)
      ord_type, // 'limit' (지정가) or 'market' (시장가)
    };
    
    if (volume) params.volume = volume.toString();
    if (price) params.price = price.toString();
    
    return await this.request('POST', '/v1/orders', params, true);
  }
  
  // 매수 주문
  async buyOrder(userId, { symbol, price, quantity }) {
    try {
      const orderData = {
        market: symbol,
        side: 'bid',
        volume: quantity.toString(),
        price: price.toString(),
        ord_type: 'limit'
      };
      
      return await this.placeOrder(orderData);
    } catch (error) {
      console.error('매수 주문 실패:', error);
      // 개발/테스트 환경에서는 모의 주문 반환
      if (process.env.NODE_ENV === 'development') {
        return {
          uuid: uuidv4(),
          side: 'bid',
          ord_type: 'limit',
          price: price.toString(),
          avg_price: '0.0',
          state: 'wait',
          market: symbol,
          created_at: new Date().toISOString(),
          volume: quantity.toString(),
          remaining_volume: quantity.toString(),
          reserved_fee: '0.0',
          remaining_fee: '0.0',
          paid_fee: '0.0',
          locked: (price * quantity).toString(),
          executed_volume: '0.0',
          trades_count: 0
        };
      }
      throw error;
    }
  }
  
  // 매도 주문
  async sellOrder(userId, { symbol, price, quantity }) {
    try {
      const orderData = {
        market: symbol,
        side: 'ask',
        volume: quantity.toString(),
        price: price.toString(),
        ord_type: 'limit'
      };
      
      return await this.placeOrder(orderData);
    } catch (error) {
      console.error('매도 주문 실패:', error);
      // 개발/테스트 환경에서는 모의 주문 반환
      if (process.env.NODE_ENV === 'development') {
        return {
          uuid: uuidv4(),
          side: 'ask',
          ord_type: 'limit',
          price: price.toString(),
          avg_price: '0.0',
          state: 'wait',
          market: symbol,
          created_at: new Date().toISOString(),
          volume: quantity.toString(),
          remaining_volume: quantity.toString(),
          reserved_fee: '0.0',
          remaining_fee: '0.0',
          paid_fee: '0.0',
          locked: quantity.toString(),
          executed_volume: '0.0',
          trades_count: 0
        };
      }
      throw error;
    }
  }
  
  // 주문 취소
  async cancelOrder(orderId) {
    return await this.request('DELETE', '/v1/order', { uuid: orderId }, true);
  }
  
  // 주문 리스트 조회
  async getOrders(userId, { state = 'wait', market = null, page = 1, limit = 100 } = {}) {
    try {
      const params = { state, page, limit };
      if (market) params.market = market;
      
      return await this.request('GET', '/v1/orders', params, true);
    } catch (error) {
      console.error('주문 조회 실패:', error);
      // 개발/테스트 환경에서는 빈 배열 반환
      if (process.env.NODE_ENV === 'development') {
        return [];
      }
      throw error;
    }
  }
  
  // 개별 주문 조회
  async getOrderDetail(userId, orderId) {
    try {
      return await this.request('GET', '/v1/order', { uuid: orderId }, true);
    } catch (error) {
      console.error('주문 상세 조회 실패:', error);
      throw error;
    }
  }
  
  // 시장가 매수
  async marketBuy(symbol, amount) {
    const orderData = {
      market: symbol,
      side: 'bid',
      price: amount.toString(),
      ord_type: 'price' // 시장가 매수 (원화로 매수)
    };
    
    return await this.placeOrder(orderData);
  }
  
  // 시장가 매도
  async marketSell(symbol, volume) {
    const orderData = {
      market: symbol,
      side: 'ask',
      volume: volume.toString(),
      ord_type: 'market' // 시장가 매도
    };
    
    return await this.placeOrder(orderData);
  }
  
  // 체결 대기 주문 조회
  async getWaitingOrders(market = null) {
    const params = { state: 'wait' };
    if (market) params.market = market;
    
    return await this.request('GET', '/v1/orders', params, true);
  }
  
  // 체결 완료 주문 조회
  async getFilledOrders(market = null, limit = 100) {
    const params = { state: 'done', limit };
    if (market) params.market = market;
    
    return await this.request('GET', '/v1/orders', params, true);
  }
  
  // 입금 주소 조회
  async getDepositAddress(currency) {
    return await this.request('GET', '/v1/deposits/coin_address', { currency }, true);
  }
  
  // 출금 주소 목록 조회
  async getWithdrawAddresses() {
    return await this.request('GET', '/v1/withdraws/coin_addresses', {}, true);
  }
  
  // 코인 출금
  async withdrawCoin({ currency, amount, address, secondary_address = null, transaction_type = 'default' }) {
    const params = {
      currency,
      amount: amount.toString(),
      address,
      transaction_type
    };
    
    if (secondary_address) {
      params.secondary_address = secondary_address;
    }
    
    return await this.request('POST', '/v1/withdraws/coin', params, true);
  }
  
  // 원화 출금
  async withdrawKRW(amount) {
    const params = {
      amount: amount.toString()
    };
    
    return await this.request('POST', '/v1/withdraws/krw', params, true);
  }
  
  // 입출금 현황 조회
  async getDeposits({ currency = null, state = null, limit = 100, page = 1 } = {}) {
    const params = { limit, page };
    if (currency) params.currency = currency;
    if (state) params.state = state;
    
    return await this.request('GET', '/v1/deposits', params, true);
  }
  
  async getWithdraws({ currency = null, state = null, limit = 100, page = 1 } = {}) {
    const params = { limit, page };
    if (currency) params.currency = currency;
    if (state) params.state = state;
    
    return await this.request('GET', '/v1/withdraws', params, true);
  }
  
  // WebSocket 연결을 위한 티켓 발급 (실시간 데이터용)
  async getWebSocketTicket() {
    try {
      return await this.request('POST', '/v1/websocket_ticket', {}, true);
    } catch (error) {
      console.error('WebSocket 티켓 발급 실패:', error);
      return null;
    }
  }
  
  // 거래량 기준 상위 종목 조회 (공개 API 활용)
  async getTopVolumeMarkets(limit = 20) {
    try {
      const markets = await this.getMarkets();
      const krwMarkets = markets
        .filter(m => m.market.startsWith('KRW-'))
        .map(m => m.market);
      
      if (krwMarkets.length === 0) return [];
      
      const tickers = await this.getTicker(krwMarkets);
      
      return tickers
        .sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
        .slice(0, limit)
        .map(ticker => ({
          market: ticker.market,
          korean_name: markets.find(m => m.market === ticker.market)?.korean_name || '',
          current_price: ticker.trade_price,
          change_rate: ticker.change_rate * 100,
          acc_trade_price_24h: ticker.acc_trade_price_24h,
          volume_24h: ticker.acc_trade_volume_24h
        }));
    } catch (error) {
      console.error('상위 거래량 종목 조회 실패:', error);
      return [];
    }
  }
  
  // 급등/급락 종목 조회
  async getTrendingMarkets(type = 'rising', limit = 10) {
    try {
      const markets = await this.getMarkets();
      const krwMarkets = markets
        .filter(m => m.market.startsWith('KRW-'))
        .map(m => m.market);
      
      if (krwMarkets.length === 0) return [];
      
      const tickers = await this.getTicker(krwMarkets);
      
      const sortField = type === 'rising' ? 'change_rate' : 'change_rate';
      const sortOrder = type === 'rising' ? -1 : 1;
      
      return tickers
        .filter(ticker => Math.abs(ticker.change_rate) >= 0.05) // 5% 이상 변동
        .sort((a, b) => (b.change_rate - a.change_rate) * sortOrder)
        .slice(0, limit)
        .map(ticker => ({
          market: ticker.market,
          korean_name: markets.find(m => m.market === ticker.market)?.korean_name || '',
          current_price: ticker.trade_price,
          change_rate: ticker.change_rate * 100,
          change_price: ticker.change_price,
          volume_24h: ticker.acc_trade_volume_24h
        }));
    } catch (error) {
      console.error('급등/급락 종목 조회 실패:', error);
      return [];
    }
  }
  
  // API 호출 제한 체크 (분당 600회, 초당 10회)
  checkRateLimit() {
    const now = Date.now();
    
    // 초당 제한 체크
    if (!this.lastSecondCalls) {
      this.lastSecondCalls = [];
    }
    this.lastSecondCalls = this.lastSecondCalls.filter(time => now - time < 1000);
    
    if (this.lastSecondCalls.length >= 10) {
      return { allowed: false, reason: '초당 호출 제한 (10회)' };
    }
    
    // 분당 제한 체크
    if (!this.lastMinuteCalls) {
      this.lastMinuteCalls = [];
    }
    this.lastMinuteCalls = this.lastMinuteCalls.filter(time => now - time < 60000);
    
    if (this.lastMinuteCalls.length >= 600) {
      return { allowed: false, reason: '분당 호출 제한 (600회)' };
    }
    
    // 호출 기록
    this.lastSecondCalls.push(now);
    this.lastMinuteCalls.push(now);
    
    return { allowed: true };
  }
}

// 싱글톤 패턴으로 인스턴스 관리
let instance = null;

function getUpbitService() {
  if (!instance) {
    instance = new UpbitService();
  }
  return instance;
}

module.exports = getUpbitService();