const express = require('express');
const { getNews } = require('../controllers/newsController');

const router = express.Router();

// 뉴스 검색 (비로그인도 접근 가능)
router.get('/search', getNews);
 
module.exports = router;