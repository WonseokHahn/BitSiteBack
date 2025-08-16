const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const handleOAuthCallback = (req, res) => {
  try {
    const token = generateToken(req.user);
    
    // 프론트엔드로 토큰과 함께 리다이렉트
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('OAuth 콜백 오류:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }
};

const getProfile = (req, res) => {
  try {
    const { password, ...userProfile } = req.user;
    res.json({
      success: true,
      user: userProfile
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '프로필 조회 실패'
    });
  }
};

const logout = (req, res) => {
  res.json({
    success: true,
    message: '로그아웃 되었습니다.'
  });
};

module.exports = {
  handleOAuthCallback,
  getProfile,
  logout
};