# Chatbot Setup Guide

## Quick Start

Your AI-powered chatbot is now integrated into the app! Here's how to set it up:

### 1. Get Your OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Sign in to your OpenAI account (create one if needed)
3. Click "Create new secret key"
4. Copy the key (you won't see it again!)

### 2. Configure the API Key
1. In the root directory of the project, create a file named `.env.local`
2. Add this line:
   ```
   VITE_OPENAI_API_KEY=your_actual_api_key_here
   ```
   Replace `your_actual_api_key_here` with your actual OpenAI API key

3. Save the file
4. Restart your development server (`npm run dev`)

### 3. Use the Chatbot
- Look for the **💬** button in the bottom-center of the page
- Click to open the chatbot
- Type your message and hit Enter or click the send button
- The AI assistant will help answer questions about the tools and workflows

## Features
- **Floating Widget**: Minimally intrusive design
- **Persistent Conversation**: Chat history is maintained during the session
- **AI-Powered**: Uses OpenAI's GPT-3.5-turbo model
- **Responsive**: Works on desktop and mobile
- **Clear Conversation**: Click the 🔄 button to reset the chat

## Security Notes
⚠️ **Important Security Considerations:**

1. **Development Only**: The current setup keeps the API key on the client-side, which is suitable for development but not production
2. **API Key Protection**: The `.env.local` file is in `.gitignore` - never commit it to version control
3. **Production Recommendation**: For production deployments:
   - Create a backend API endpoint that proxies requests to OpenAI
   - Store your API key on the server only
   - This prevents exposing your API key to users

## Troubleshooting

### "API key is not configured" Error
- Make sure you created `.env.local` in the project root
- Verify the key name is exactly: `VITE_OPENAI_API_KEY`
- Restart your dev server after creating the file

### Chatbot not responding
- Check browser console for error messages (F12)
- Verify your API key is valid and has available credits
- Check your OpenAI account has sufficient usage quota

### High API costs
- Be mindful of API usage
- The chatbot uses GPT-3.5-turbo (cheaper) by default
- Each message costs a small amount based on tokens used

## Customization

You can customize the chatbot by editing:
- `src/components/Chatbot.jsx` - Main component and logic
- `src/components/Chatbot.css` - Styling and appearance
- `src/api/openai.js` - API integration (e.g., change model, temperature, max tokens)

### Change the AI Model
In `src/api/openai.js`, line ~52:
```javascript
model: "gpt-3.5-turbo",  // Change to "gpt-4" for better responses
```

### Adjust AI Behavior
In `src/api/openai.js`, modify the system prompt or parameters:
```javascript
temperature: 0.7,      // Lower = more focused, Higher = more creative
max_tokens: 500,       // Maximum response length
```
