const axios = require('axios');
const cheerio = require('cheerio');

const searchNews = async (keyword) => {
  try {
    // 네이버 뉴스 검색 API 사용 (실제로는 네이버 API 키가 필요)
    // 여기서는 웹 스크래핑으로 대체 (실제 운영시에는 API 사용 권장)
    
    const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}&sort=1`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles = [];

    $('.news_area').each((index, element) => {
      if (index >= 10) return false; // 최대 10개만 수집

      const $element = $(element);
      const title = $element.find('.news_tit').text().trim();
      const description = $element.find('.news_dsc').text().trim();
      const link = $element.find('.news_tit').attr('href');
      const source = $element.find('.info_group .press').text().trim();
      const publishedAt = $element.find('.info_group .info').last().text().trim();

      if (title && description) {
        articles.push({
          title,
          description,
          link,
          source,
          publishedAt,
          keyword
        });
      }
    });

    return articles;
  } catch (error) {
    console.error('뉴스 검색 오류:', error);
    
    // 대체 데이터 (실제 서비스에서는 다른 뉴스 소스나 캐시된 데이터 사용)
    return [
      {
        title: `${keyword} 관련 뉴스`,
        description: '뉴스 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        link: '#',
        source: '시스템',
        publishedAt: new Date().toISOString(),
        keyword
      }
    ];
  }
};

module.exports = {
  searchNews
};