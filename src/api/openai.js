/**
 * OpenAI API Integration
 * 
 * SECURITY NOTE:
 * - Store your OpenAI API key in a .env.local file (never commit this)
 * - For production, consider creating a backend proxy to keep API keys server-side
 * - This frontend implementation exposes the API key in client-side code
 * 
 * Setup:
 * 1. Create a .env.local file in the root directory
 * 2. Add: VITE_OPENAI_API_KEY=your_actual_api_key_here
 * 3. Restart your dev server
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/**
 * Validates that the API key is configured
 */
function validateApiKey() {
  if (!API_KEY) {
    throw new Error(
      "OpenAI API key is not configured. Local: add VITE_OPENAI_API_KEY to .env.local and restart the dev server. Vercel: set VITE_OPENAI_API_KEY in Project Settings > Environment Variables and redeploy."
    );
  }
}

/**
 * Calls OpenAI Chat API with conversation context
 * @param {Array} conversationHistory - Array of previous messages with role and content
 * @param {string} userMessage - The current user message
 * @returns {Promise<string>} - The AI response
 */
export async function callOpenAI(conversationHistory, userMessage) {
  validateApiKey();

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful AI assistant for a bioinformatics tools navigation application. You help users understand and navigate various scientific tools and workflows. Be concise, helpful, and professional.",
      },
      ...conversationHistory,
      {
        role: "user",
        content: userMessage,
      },
    ];

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage =
        errorData.error?.message || `API Error: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw error;
  }
}
