const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const generateSummary = async (content) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return '요약 서비스가 설정되지 않았습니다.';
    }

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "당신은 주식 관련 뉴스를 요약하는 전문가입니다. 주어진 뉴스를 2-3문장으로 간결하고 핵심적인 내용만 요약해주세요."
        },
        {
          role: "user",
          content: `다음 뉴스를 요약해주세요: ${content}`
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('GPT 요약 생성 오류:', error);
    return '요약을 생성할 수 없습니다.';
  }
};

module.exports = {
  generateSummary
};