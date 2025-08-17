const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const TradingController = require('../controllers/tradingController');

// 모든 trading 라우트는 인증 필요
router.use(authenticateJWT);

// 매매 시작/중지
router.post('/start', TradingController.startTrading);
router.post('/stop', TradingController.stopTrading);

// 매매 상태 조회
router.get('/status', TradingController.getTradingStatus);

// 포지션 관리
router.get('/positions', TradingController.getPositions);
router.post('/positions/close', TradingController.closePosition);

// 매매 기록
router.get('/history', TradingController.getTradingHistory);

// 실시간 시세 데이터
router.get('/ticker/:symbol', TradingController.getTicker);
router.get('/candles/:symbol', TradingController.getCandles);

// AI 종목 추천
router.get('/ai-recommendations', TradingController.getAIRecommendations);

// 매수/매도 주문
router.post('/buy', TradingController.buyOrder);
router.post('/sell', TradingController.sellOrder);

// 주문 내역 조회
router.get('/orders', TradingController.getOrders);
router.get('/orders/:orderId', TradingController.getOrderDetail);

// 계좌 정보
router.get('/account', TradingController.getAccountInfo);

// 백테스팅
router.post('/backtest', TradingController.runBacktest);

module.exports = router;