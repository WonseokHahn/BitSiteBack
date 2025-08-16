const { searchNews } = require('../services/newsService');
const { generateSummary } = require('../services/gptService');

const getNews = async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: '검색 키워드가 필요합니다.'
      });
    }

    // 네이버 뉴스 검색
    const newsArticles = await searchNews(keyword);
    
    if (!newsArticles || newsArticles.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: '검색 결과가 없습니다.'
      });
    }

    // 각 뉴스에 대해 GPT 요약 생성
    const newsWithSummary = await Promise.all(
      newsArticles.map(async (article) => {
        try {
          const summary = await generateSummary(article.title + ' ' + article.description);
          return {
            ...article,
            summary
          };
        } catch (error) {
          console.error('요약 생성 실패:', error);
          return {
            ...article,
            summary: '요약을 생성할 수 없습니다.'
          };
        }
      })
    );

    res.json({
      success: true,
      data: newsWithSummary,
      total: newsWithSummary.length
    });

  } catch (error) {
    console.error('뉴스 검색 오류:', error);
    res.status(500).json({
      success: false,
      message: '뉴스 검색 중 오류가 발생했습니다.'
    });
  }
};

module.exports = {
  getNews
};