const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getServerApiKey() {
  return process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerApiKey();
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server API key is missing. Set OPENAI_API_KEY in Vercel." });
  }

  const { conversationHistory = [], userMessage = "" } = req.body || {};
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

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

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.error?.message || `OpenAI API Error: ${response.status}`;
      return res.status(response.status).json({ error: errorMessage });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: "Empty response from OpenAI" });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}
