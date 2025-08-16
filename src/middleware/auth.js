const passport = require('passport');
 
const authenticateJWT = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({ message: '인증 오류가 발생했습니다.' });
    }
    
    if (!user) {
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = {
  authenticateJWT
};
