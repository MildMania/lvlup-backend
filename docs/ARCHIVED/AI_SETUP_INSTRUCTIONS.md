# OpenAI API Setup Instructions

## 1. Get Your OpenAI API Key

1. Go to https://platform.openai.com/
2. Sign up or log in to your account
3. Navigate to "API Keys" in your dashboard
4. Click "Create new secret key"
5. Copy the key (it starts with `sk-...`)

## 2. Configure Environment Variables

Update your `.env` file in the backend directory:

```bash
# Replace 'your-openai-api-key-here' with your actual API key
OPENAI_API_KEY=sk-your-actual-key-here
OPENAI_MODEL=gpt-4o-mini
```

## 3. Test the Integration

Once you've added your API key, restart the backend server:

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend && npm run dev
```

Then test with:

```bash
curl -X POST "http://localhost:3000/api/ai-analytics/query" \
-H "Content-Type: application/json" \
-d '{
  "query": "What insights can you provide about our user engagement?"
}'
```

## Cost Information

- **GPT-4o Mini**: ~$0.07 per 1000 queries
- **Free Credits**: $5 when you sign up
- **Development Cost**: Approximately $1-5 total for entire development process

## Features You'll Get

✅ **True AI Understanding** - Natural language comprehension like ChatGPT
✅ **Intelligent Analysis** - Real reasoning about your analytics data  
✅ **Conversational Memory** - Remembers context within sessions
✅ **Business Context Integration** - Considers releases and features
✅ **Actionable Insights** - Specific recommendations and follow-up questions

The system is now ready for real AI integration!
