const UpbitService = require('../services/upbitService');
const TradingService = require('../services/tradingService');
const AIService = require('../services/aiService');
const { query } = require('../config/database');

class TradingController {
  // 자동매매 시작
  static async startTrading(req, res) {
    try {
      const userId = req.user.id;
      const { strategy, coins, settings } = req.body;
      
      console.log(`🚀 사용자 ${userId}가 자동매매 시작 요청:`, { strategy, coins, settings });
      
      // 유효성 검사
      if (!strategy || !coins || coins.length === 0) {
        return res.status(400).json({
          success: false,
          message: '전략과 종목을 선택해주세요.'
        });
      }
      
      // 현재 매매 상태 확인
      const currentStatus = await TradingService.getTradingStatus(userId);
      if (currentStatus.isTrading) {
        return res.status(400).json({
          success: false,
          message: '이미 자동매매가 실행 중입니다.'
        });
      }
      
      // 계좌 잔고 확인
      const account = await UpbitService.getAccount(userId);
      if (!account || account.krw_balance < settings.investmentAmount) {
        return res.status(400).json({
          success: false,
          message: '투자 가능한 잔고가 부족합니다.'
        });
      }
      
      // 매매 세션 생성
      const sessionId = await TradingService.createTradingSession({
        userId,
        strategy,
        coins,
        settings
      });
      
      // 실시간 매매 시작
      TradingService.startTradingLoop(sessionId);
      
      res.json({
        success: true,
        message: '자동매매가 시작되었습니다.',
        sessionId
      });
      
    } catch (error) {
      console.error('매매 시작 오류:', error);
      res.status(500).json({
        success: false,
        message: '매매 시작 중 오류가 발생했습니다.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
  
  // 자동매매 중지
  static async stopTrading(req, res) {
    try {
      const userId = req.user.id;
      
      console.log(`⏹️ 사용자 ${userId}가 자동매매 중지 요청`);
      
      // 매매 중지
      await TradingService.stopTrading(userId);
      
      res.json({
        success: true,
        message: '자동매매가 중지되었습니다.'
      });
      
    } catch (error) {
      console.error('매매 중지 오류:', error);
      res.status(500).json({
        success: false,
        message: '매매 중지 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 매매 상태 조회
  static async getTradingStatus(req, res) {
    try {
      const userId = req.user.id;
      const status = await TradingService.getTradingStatus(userId);
      
      res.json({
        success: true,
        data: status
      });
      
    } catch (error) {
      console.error('매매 상태 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '매매 상태 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 포지션 조회
  static async getPositions(req, res) {
    try {
      const userId = req.user.id;
      const positions = await TradingService.getPositions(userId);
      
      res.json({
        success: true,
        data: positions
      });
      
    } catch (error) {
      console.error('포지션 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '포지션 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 매매 기록 조회
  static async getTradingHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 50 } = req.query;
      
      const history = await TradingService.getTradingHistory(userId, page, limit);
      
      res.json({
        success: true,
        data: history
      });
      
    } catch (error) {
      console.error('매매 기록 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '매매 기록 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 실시간 시세 조회
  static async getTicker(req, res) {
    try {
      const { symbol } = req.params;
      const ticker = await UpbitService.getTicker(symbol);
      
      res.json({
        success: true,
        data: ticker
      });
      
    } catch (error) {
      console.error('시세 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '시세 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 캔들 데이터 조회
  static async getCandles(req, res) {
    try {
      const { symbol } = req.params;
      const { count = 200, interval = 'minute1' } = req.query;
      
      const candles = await UpbitService.getCandles(symbol, interval, count);
      
      res.json({
        success: true,
        data: { candles }
      });
      
    } catch (error) {
      console.error('캔들 데이터 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '캔들 데이터 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // AI 종목 추천
  static async getAIRecommendations(req, res) {
    try {
      console.log('🤖 AI 종목 추천 요청');
      
      // 업비트 전체 마켓 조회
      const markets = await UpbitService.getMarkets();
      const krwMarkets = markets.filter(m => m.market.startsWith('KRW-'));
      
      // 각 종목에 대한 AI 분석
      const recommendations = await AIService.analyzeCoinsForRecommendation(krwMarkets.slice(0, 20)); // 상위 20개 종목만 분석
      
      // 점수순으로 정렬하여 상위 5개 추천
      const topRecommendations = recommendations
        .sort((a, b) => b.aiScore - a.aiScore)
        .slice(0, 5);
      
      res.json({
        success: true,
        data: { recommendations: topRecommendations }
      });
      
    } catch (error) {
      console.error('AI 추천 오류:', error);
      res.status(500).json({
        success: false,
        message: 'AI 추천 중 오류가 발생했습니다.',
        data: { recommendations: [] }
      });
    }
  }
  
  // 매수 주문
  static async buyOrder(req, res) {
    try {
      const userId = req.user.id;
      const { symbol, price, quantity } = req.body;
      
      console.log(`💰 매수 주문: ${symbol} @ ${price} × ${quantity}`);
      
      // 주문 실행
      const order = await UpbitService.buyOrder(userId, { symbol, price, quantity });
      
      // 주문 기록 저장
      await TradingService.recordTrade({
        userId,
        type: 'buy',
        symbol,
        price,
        quantity,
        orderId: order.uuid
      });
      
      res.json({
        success: true,
        data: order
      });
      
    } catch (error) {
      console.error('매수 주문 오류:', error);
      res.status(500).json({
        success: false,
        message: '매수 주문 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 매도 주문
  static async sellOrder(req, res) {
    try {
      const userId = req.user.id;
      const { symbol, price, quantity } = req.body;
      
      console.log(`💸 매도 주문: ${symbol} @ ${price} × ${quantity}`);
      
      // 주문 실행
      const order = await UpbitService.sellOrder(userId, { symbol, price, quantity });
      
      // 주문 기록 저장
      await TradingService.recordTrade({
        userId,
        type: 'sell',
        symbol,
        price,
        quantity,
        orderId: order.uuid
      });
      
      res.json({
        success: true,
        data: order
      });
      
    } catch (error) {
      console.error('매도 주문 오류:', error);
      res.status(500).json({
        success: false,
        message: '매도 주문 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 주문 내역 조회
  static async getOrders(req, res) {
    try {
      const userId = req.user.id;
      const { state = 'done', page = 1, limit = 50 } = req.query;
      
      const orders = await UpbitService.getOrders(userId, { state, page, limit });
      
      res.json({
        success: true,
        data: orders
      });
      
    } catch (error) {
      console.error('주문 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '주문 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 계좌 정보 조회
  static async getAccountInfo(req, res) {
    try {
      const userId = req.user.id;
      const account = await UpbitService.getAccount(userId);
      
      res.json({
        success: true,
        data: account
      });
      
    } catch (error) {
      console.error('계좌 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '계좌 조회 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 백테스팅 실행
  static async runBacktest(req, res) {
    try {
      const { strategy, symbol, startDate, endDate, initialAmount } = req.body;
      
      console.log(`📊 백테스팅 시작: ${strategy} - ${symbol} (${startDate} ~ ${endDate})`);
      
      // 백테스팅 실행
      const result = await TradingService.runBacktest({
        strategy,
        symbol,
        startDate,
        endDate,
        initialAmount
      });
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('백테스팅 오류:', error);
      res.status(500).json({
        success: false,
        message: '백테스팅 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 포지션 강제 종료
  static async closePosition(req, res) {
    try {
      const userId = req.user.id;
      const { symbol } = req.body;
      
      console.log(`🔚 포지션 강제 종료: ${symbol}`);
      
      const result = await TradingService.closePosition(userId, symbol);
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('포지션 종료 오류:', error);
      res.status(500).json({
        success: false,
        message: '포지션 종료 중 오류가 발생했습니다.'
      });
    }
  }
  
  // 주문 상세 조회
  static async getOrderDetail(req, res) {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      
      const order = await UpbitService.getOrderDetail(userId, orderId);
      
      res.json({
        success: true,
        data: order
      });
      
    } catch (error) {
      console.error('주문 상세 조회 오류:', error);
      res.status(500).json({
        success: false,
        message: '주문 상세 조회 중 오류가 발생했습니다.'
      });
    }
  }
}

module.exports = TradingController;