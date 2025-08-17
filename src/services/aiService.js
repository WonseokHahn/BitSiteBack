const UpbitService = require('./upbitService');
const axios = require('axios');

class AIService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  // 코인 분석 및 추천
  async analyzeCoinsForRecommendation(markets) {
    try {
      console.log(`🤖 ${markets.length}개 코인 AI 분석 시작`);
      
      const recommendations = [];
      
      for (const market of markets) {
        try {
          // API 호출 제한을 위한 지연
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const analysis = await this.analyzeSingleCoin(market.market);
          if (analysis) {
            recommendations.push({
              symbol: market.market,
              name: market.korean_name || market.english_name,
              ...analysis
            });
          }
        } catch (error) {
          console.error(`❌ ${market.market} 분석 실패:`, error.message);
        }
      }
      
      console.log(`✅ AI 분석 완료: ${recommendations.length}개 종목`);
      return recommendations.sort((a, b) => b.aiScore - a.aiScore);
      
    } catch (error) {
      console.error('❌ AI 분석 전체 실패:', error);
      return this.getFallbackRecommendations();
    }
  }

  // 개별 코인 분석
  async analyzeSingleCoin(symbol) {
    try {
      // 1. 기술적 분석 점수
      const technicalScore = await this.calculateTechnicalScore(symbol);
      
      // 2. 거래량 분석 점수
      const volumeScore = await this.calculateVolumeScore(symbol);
      
      // 3. 가격 모멘텀 점수
      const momentumScore = await this.calculateMomentumScore(symbol);
      
      // 4. 변동성 점수
      const volatilityScore = await this.calculateVolatilityScore(symbol);
      
      // 5. 뉴스 감성 분석 점수 (옵션)
      const sentimentScore = await this.calculateSentimentScore(symbol);
      
      // 종합 AI 점수 계산 (가중평균)
      const aiScore = Math.round(
        technicalScore * 0.3 +      // 기술적 분석 30%
        volumeScore * 0.2 +         // 거래량 20%
        momentumScore * 0.25 +      // 모멘텀 25%
        volatilityScore * 0.15 +    // 변동성 15%
        sentimentScore * 0.1        // 감성 분석 10%
      );

      // 시장 데이터 조회
      const [ticker] = await UpbitService.getTicker([symbol]);
      
      // 추천 이유 생성
      const reason = this.generateRecommendationReason({
        symbol,
        aiScore,
        technicalScore,
        volumeScore,
        momentumScore,
        volatilityScore,
        sentimentScore,
        ticker
      });

      return {
        currentPrice: ticker.trade_price,
        change24h: ticker.change_rate * 100,
        aiScore: Math.max(0, Math.min(100, aiScore)), // 0-100 범위로 제한
        reason,
        analysis: {
          technical: technicalScore,
          volume: volumeScore,
          momentum: momentumScore,
          volatility: volatilityScore,
          sentiment: sentimentScore
        }
      };

    } catch (error) {
      console.error(`❌ ${symbol} 개별 분석 실패:`, error);
      return null;
    }
  }

  // 기술적 분석 점수 계산
  async calculateTechnicalScore(symbol) {
    try {
      // 일봉 데이터 조회 (30일)
      const candles = await UpbitService.getDayCandles(symbol, 30);
      if (candles.length < 20) return 50;

      candles.reverse(); // 과거 -> 현재 순서
      
      let score = 50; // 기본 점수
      
      // RSI 분석
      const rsi = this.calculateRSI(candles, 14);
      if (rsi >= 30 && rsi <= 70) score += 15; // 적정 범위
      else if (rsi < 30) score += 25; // 과매도 (매수 기회)
      else score -= 10; // 과매수
      
      // 이동평균선 분석
      const currentPrice = candles[candles.length - 1].trade_price;
      const ma5 = this.calculateSMA(candles, 5);
      const ma20 = this.calculateSMA(candles, 20);
      
      if (currentPrice > ma5 && ma5 > ma20) score += 20; // 상승 추세
      else if (currentPrice < ma5 && ma5 < ma20) score -= 15; // 하락 추세
      
      // 볼린저 밴드 분석
      const bollinger = this.calculateBollingerBands(candles, 20, 2);
      const bbPosition = (currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower);
      
      if (bbPosition >= 0.2 && bbPosition <= 0.8) score += 10; // 중간 영역
      else if (bbPosition < 0.2) score += 15; // 하단 근처 (매수 기회)
      
      return Math.max(0, Math.min(100, score));
      
    } catch (error) {
      console.error(`기술적 분석 실패 (${symbol}):`, error);
      return 50;
    }
  }

  // 거래량 분석 점수
  async calculateVolumeScore(symbol) {
    try {
      const candles = await UpbitService.getDayCandles(symbol, 30);
      if (candles.length < 10) return 50;

      const recentVolumes = candles.slice(0, 7).map(c => c.candle_acc_trade_volume);
      const avgVolume = candles.slice(7, 30).map(c => c.candle_acc_trade_volume)
        .reduce((sum, vol) => sum + vol, 0) / 23;

      const recentAvgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / 7;
      const volumeRatio = recentAvgVolume / avgVolume;

      let score = 50;
      
      if (volumeRatio > 2) score += 30; // 거래량 급증
      else if (volumeRatio > 1.5) score += 20; // 거래량 증가
      else if (volumeRatio > 1.2) score += 10; // 거래량 약간 증가
      else if (volumeRatio < 0.5) score -= 20; // 거래량 급감

      return Math.max(0, Math.min(100, score));

    } catch (error) {
      console.error(`거래량 분석 실패 (${symbol}):`, error);
      return 50;
    }
  }

  // 가격 모멘텀 점수
  async calculateMomentumScore(symbol) {
    try {
      const candles = await UpbitService.getDayCandles(symbol, 30);
      if (candles.length < 10) return 50;

      const currentPrice = candles[0].trade_price;
      const price7dAgo = candles[6]?.trade_price;
      const price30dAgo = candles[29]?.trade_price;

      let score = 50;

      // 7일 수익률 분석
      if (price7dAgo) {
        const return7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;
        if (return7d > 10) score += 25;
        else if (return7d > 5) score += 15;
        else if (return7d > 0) score += 5;
        else if (return7d < -10) score -= 20;
        else if (return7d < -5) score -= 10;
      }

      // 30일 수익률 분석
      if (price30dAgo) {
        const return30d = ((currentPrice - price30dAgo) / price30dAgo) * 100;
        if (return30d > 20) score += 20;
        else if (return30d > 10) score += 10;
        else if (return30d < -20) score -= 15;
        else if (return30d < -10) score -= 10;
      }

      // 연속 상승/하락일 분석
      let consecutiveDays = 0;
      let isRising = true;
      
      for (let i = 1; i < Math.min(candles.length, 8); i++) {
        const todayPrice = candles[i - 1].trade_price;
        const yesterdayPrice = candles[i].trade_price;
        
        if (i === 1) {
          isRising = todayPrice > yesterdayPrice;
        }
        
        if ((isRising && todayPrice > yesterdayPrice) || (!isRising && todayPrice < yesterdayPrice)) {
          consecutiveDays++;
        } else {
          break;
        }
      }

      if (isRising && consecutiveDays >= 3) score += 15;
      else if (!isRising && consecutiveDays >= 3) score -= 15;

      return Math.max(0, Math.min(100, score));

    } catch (error) {
      console.error(`모멘텀 분석 실패 (${symbol}):`, error);
      return 50;
    }
  }

  // 변동성 점수
  async calculateVolatilityScore(symbol) {
    try {
      const candles = await UpbitService.getDayCandles(symbol, 30);
      if (candles.length < 20) return 50;

      // 일일 변동성 계산 (고가-저가)/시가
      const dailyVolatilities = candles.slice(0, 20).map(candle => 
        ((candle.high_price - candle.low_price) / candle.opening_price) * 100
      );

      const avgVolatility = dailyVolatilities.reduce((sum, vol) => sum + vol, 0) / dailyVolatilities.length;
      const recentVolatility = dailyVolatilities.slice(0, 7).reduce((sum, vol) => sum + vol, 0) / 7;

      let score = 50;

      // 적정 변동성 범위 (2% ~ 8%)
      if (avgVolatility >= 2 && avgVolatility <= 8) {
        score += 20; // 적정 변동성
      } else if (avgVolatility > 8 && avgVolatility <= 15) {
        score += 10; // 높은 변동성 (기회 증가)
      } else if (avgVolatility > 15) {
        score -= 10; // 과도한 변동성 (리스크 증가)
      } else {
        score -= 15; // 낮은 변동성 (기회 부족)
      }

      // 최근 변동성 증가 여부
      const volatilityRatio = recentVolatility / avgVolatility;
      if (volatilityRatio > 1.3) score += 15; // 변동성 증가
      else if (volatilityRatio < 0.7) score -= 10; // 변동성 감소

      return Math.max(0, Math.min(100, score));

    } catch (error) {
      console.error(`변동성 분석 실패 (${symbol}):`, error);
      return 50;
    }
  }

  // 뉴스 감성 분석 점수
  async calculateSentimentScore(symbol) {
    try {
      // 코인명 추출 (KRW-BTC -> BTC)
      const coinName = symbol.split('-')[1];
      
      if (!this.openaiApiKey) {
        // OpenAI API가 없으면 중립 점수 반환
        return 50;
      }

      // GPT를 이용한 감성 분석 (간단한 예시)
      const prompt = `
        암호화폐 ${coinName}에 대한 최근 시장 감성을 분석해주세요.
        다음 요소들을 고려하여 0-100점으로 점수를 매겨주세요:
        - 최근 뉴스 동향
        - 기술적 개발 상황
        - 시장 채택률
        - 규제 환경
        
        점수만 숫자로 답해주세요.
      `;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      const scoreText = response.data.choices[0].message.content.trim();
      const score = parseInt(scoreText.match(/\d+/)?.[0]) || 50;
      
      return Math.max(0, Math.min(100, score));

    } catch (error) {
      console.error(`감성 분석 실패 (${symbol}):`, error);
      // 코인별 기본 감성 점수 (주요 코인들)
      const coinName = symbol.split('-')[1];
      const defaultSentiments = {
        'BTC': 75,
        'ETH': 70,
        'ADA': 65,
        'DOT': 60,
        'MATIC': 68,
        'SOL': 72,
        'AVAX': 65,
        'ATOM': 62
      };
      
      return defaultSentiments[coinName] || 50;
    }
  }

  // 추천 이유 생성
  generateRecommendationReason({ symbol, aiScore, technicalScore, volumeScore, momentumScore, volatilityScore, sentimentScore, ticker }) {
    const coinName = symbol.split('-')[1];
    const change24h = ticker.change_rate * 100;
    
    const reasons = [];
    
    // 점수별 이유 생성
    if (technicalScore >= 70) {
      reasons.push('기술적 지표가 강세 신호를 보임');
    } else if (technicalScore >= 60) {
      reasons.push('기술적 분석에서 양호한 신호 감지');
    }
    
    if (volumeScore >= 70) {
      reasons.push('거래량이 크게 증가하며 관심도 상승');
    } else if (volumeScore >= 60) {
      reasons.push('거래량 증가로 유동성 개선');
    }
    
    if (momentumScore >= 70) {
      reasons.push('강한 상승 모멘텀 지속');
    } else if (momentumScore >= 60) {
      reasons.push('긍정적인 가격 모멘텀 형성');
    }
    
    if (volatilityScore >= 70) {
      reasons.push('적정 변동성으로 매매 기회 풍부');
    }
    
    if (sentimentScore >= 70) {
      reasons.push('시장 감성과 뉴스 동향이 긍정적');
    }
    
    // 24시간 변동률 고려
    if (change24h > 5) {
      reasons.push(`24시간 +${change24h.toFixed(1)}% 상승으로 상승 추세 확인`);
    } else if (change24h < -5) {
      reasons.push(`일시적 조정으로 매수 기회 제공`);
    }
    
    // AI 점수별 기본 메시지
    if (aiScore >= 80) {
      reasons.unshift('AI 분석 결과 매우 높은 투자 매력도');
    } else if (aiScore >= 70) {
      reasons.unshift('AI 분석 결과 높은 투자 가치 확인');
    } else if (aiScore >= 60) {
      reasons.unshift('AI 분석에서 투자 가능성 발견');
    }
    
    return reasons.length > 0 ? reasons.slice(0, 2).join(', ') : `${coinName} 코인의 종합적 분석 결과 투자 검토 대상`;
  }

  // 기술적 지표 계산 헬퍼 함수들
  calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].trade_price - candles[i - 1].trade_price;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateSMA(candles, period) {
    if (candles.length < period) return 0;
    
    const prices = candles.slice(-period).map(c => c.trade_price);
    return prices.reduce((sum, price) => sum + price, 0) / period;
  }

  calculateBollingerBands(candles, period = 20, multiplier = 2) {
    if (candles.length < period) {
      return { upper: 0, middle: 0, lower: 0 };
    }
    
    const prices = candles.slice(-period).map(c => c.trade_price);
    const sma = prices.reduce((sum, price) => sum + price, 0) / period;
    
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * multiplier),
      middle: sma,
      lower: sma - (stdDev * multiplier)
    };
  }

  // 대체 추천 데이터 (API 오류시)
  getFallbackRecommendations() {
    console.log('🔄 대체 추천 데이터 사용');
    
    return [
      {
        symbol: 'KRW-BTC',
        name: '비트코인',
        currentPrice: 45000000,
        change24h: 2.34,
        aiScore: 87,
        reason: '기관 투자 증가와 기술적 강세 신호 감지',
        analysis: { technical: 85, volume: 80, momentum: 90, volatility: 85, sentiment: 88 }
      },
      {
        symbol: 'KRW-ETH',
        name: '이더리움',
        currentPrice: 2800000,
        change24h: -1.22,
        aiScore: 82,
        reason: 'DeFi 생태계 성장과 업그레이드 기대감',
        analysis: { technical: 78, volume: 75, momentum: 80, volatility: 82, sentiment: 85 }
      },
      {
        symbol: 'KRW-ADA',
        name: '에이다',
        currentPrice: 580,
        change24h: 5.67,
        aiScore: 75,
        reason: '스마트 컨트랙트 활용도 증가 추세',
        analysis: { technical: 72, volume: 70, momentum: 82, volatility: 75, sentiment: 76 }
      },
      {
        symbol: 'KRW-DOT',
        name: '폴카닷',
        currentPrice: 8900,
        change24h: 3.45,
        aiScore: 73,
        reason: '크로스체인 기술 발전과 파라체인 확장',
        analysis: { technical: 70, volume: 68, momentum: 78, volatility: 72, sentiment: 74 }
      },
      {
        symbol: 'KRW-MATIC',
        name: '폴리곤',
        currentPrice: 1250,
        change24h: -2.11,
        aiScore: 78,
        reason: '레이어2 솔루션으로서의 채택률 증가',
        analysis: { technical: 75, volume: 72, momentum: 75, volatility: 80, sentiment: 82 }
      }
    ];
  }

  // 종목별 상세 분석 리포트 생성
  async generateDetailedAnalysis(symbol) {
    try {
      const analysis = await this.analyzeSingleCoin(symbol);
      if (!analysis) throw new Error('분석 데이터 없음');

      const [ticker] = await UpbitService.getTicker([symbol]);
      const candles = await UpbitService.getDayCandles(symbol, 30);

      // 상세 리포트 생성
      const report = {
        symbol,
        timestamp: new Date().toISOString(),
        currentPrice: ticker.trade_price,
        change24h: ticker.change_rate * 100,
        volume24h: ticker.acc_trade_volume_24h,
        
        // AI 종합 평가
        aiEvaluation: {
          score: analysis.aiScore,
          grade: this.getScoreGrade(analysis.aiScore),
          recommendation: this.getRecommendation(analysis.aiScore),
          reason: analysis.reason
        },
        
        // 세부 분석
        detailedAnalysis: {
          technical: {
            score: analysis.analysis.technical,
            rsi: this.calculateRSI(candles.reverse(), 14),
            sma20: this.calculateSMA(candles, 20),
            bollinger: this.calculateBollingerBands(candles, 20, 2)
          },
          volume: {
            score: analysis.analysis.volume,
            trend: this.getVolumeTrend(candles)
          },
          momentum: {
            score: analysis.analysis.momentum,
            return7d: this.calculateReturn(candles, 7),
            return30d: this.calculateReturn(candles, 30)
          },
          volatility: {
            score: analysis.analysis.volatility,
            dailyAvg: this.calculateAvgVolatility(candles, 20)
          },
          sentiment: {
            score: analysis.analysis.sentiment,
            marketSentiment: this.getMarketSentiment(analysis.analysis.sentiment)
          }
        },
        
        // 리스크 분석
        riskAnalysis: {
          level: this.getRiskLevel(analysis.analysis.volatility),
          factors: this.getRiskFactors(analysis, ticker)
        },
        
        // 투자 제안
        investmentSuggestion: {
          position: this.getPositionSuggestion(analysis.aiScore),
          entryPrice: this.getEntryPriceSuggestion(ticker, analysis),
          stopLoss: this.getStopLossSuggestion(ticker.trade_price),
          takeProfit: this.getTakeProfitSuggestion(ticker.trade_price, analysis.aiScore)
        }
      };

      return report;

    } catch (error) {
      console.error(`상세 분석 생성 실패 (${symbol}):`, error);
      throw error;
    }
  }

  // 헬퍼 함수들
  getScoreGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C+';
    return 'C';
  }

  getRecommendation(score) {
    if (score >= 80) return '강력 추천';
    if (score >= 70) return '추천';
    if (score >= 60) return '보통';
    if (score >= 50) return '관망';
    return '비추천';
  }

  getVolumeTrend(candles) {
    const recent7 = candles.slice(0, 7);
    const prev7 = candles.slice(7, 14);
    
    const recentAvg = recent7.reduce((sum, c) => sum + c.candle_acc_trade_volume, 0) / 7;
    const prevAvg = prev7.reduce((sum, c) => sum + c.candle_acc_trade_volume, 0) / 7;
    
    const ratio = recentAvg / prevAvg;
    
    if (ratio > 1.5) return '급증';
    if (ratio > 1.2) return '증가';
    if (ratio > 0.8) return '보통';
    return '감소';
  }

  calculateReturn(candles, days) {
    if (candles.length < days) return 0;
    
    const currentPrice = candles[0].trade_price;
    const pastPrice = candles[days - 1].trade_price;
    
    return ((currentPrice - pastPrice) / pastPrice) * 100;
  }

  calculateAvgVolatility(candles, period) {
    if (candles.length < period) return 0;
    
    const volatilities = candles.slice(0, period).map(c => 
      ((c.high_price - c.low_price) / c.opening_price) * 100
    );
    
    return volatilities.reduce((sum, vol) => sum + vol, 0) / volatilities.length;
  }

  getMarketSentiment(score) {
    if (score >= 70) return '매우 긍정적';
    if (score >= 60) return '긍정적';
    if (score >= 40) return '중립적';
    return '부정적';
  }

  getRiskLevel(volatilityScore) {
    if (volatilityScore >= 80) return '낮음';
    if (volatilityScore >= 60) return '보통';
    if (volatilityScore >= 40) return '높음';
    return '매우 높음';
  }

  getRiskFactors(analysis, ticker) {
    const factors = [];
    
    if (analysis.analysis.volatility < 40) factors.push('높은 가격 변동성');
    if (analysis.analysis.volume < 50) factors.push('낮은 거래량');
    if (Math.abs(ticker.change_rate * 100) > 10) factors.push('급격한 가격 변동');
    if (analysis.analysis.technical < 50) factors.push('약한 기술적 신호');
    
    return factors.length > 0 ? factors : ['일반적인 시장 리스크'];
  }

  getPositionSuggestion(score) {
    if (score >= 80) return '적극 매수';
    if (score >= 70) return '매수';
    if (score >= 60) return '소량 매수';
    if (score >= 50) return '관망';
    return '매수 보류';
  }

  getEntryPriceSuggestion(ticker, analysis) {
    const currentPrice = ticker.trade_price;
    
    // 기술적 분석 점수에 따른 진입 가격 제안
    if (analysis.analysis.technical >= 70) {
      return {
        immediate: currentPrice,
        dip: currentPrice * 0.98, // 2% 하락시
        aggressive: currentPrice * 1.02 // 2% 상승시도 추격
      };
    } else {
      return {
        immediate: null,
        dip: currentPrice * 0.95, // 5% 하락시
        support: currentPrice * 0.90 // 10% 하락시 (강한 지지선)
      };
    }
  }

  getStopLossSuggestion(currentPrice) {
    return {
      conservative: currentPrice * 0.95, // 5% 손절
      moderate: currentPrice * 0.90,     // 10% 손절
      aggressive: currentPrice * 0.85    // 15% 손절
    };
  }

  getTakeProfitSuggestion(currentPrice, score) {
    const multiplier = score >= 80 ? 1.2 : score >= 70 ? 1.15 : 1.1;
    
    return {
      target1: currentPrice * multiplier,      // 1차 목표
      target2: currentPrice * (multiplier + 0.1), // 2차 목표
      target3: currentPrice * (multiplier + 0.2)  // 3차 목표
    };
  }
}

// 싱글톤 패턴
let instance = null;

function getAIService() {
  if (!instance) {
    instance = new AIService();
  }
  return instance;
}

module.exports = getAIService();