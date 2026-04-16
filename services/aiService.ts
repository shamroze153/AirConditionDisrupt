import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const generateSecurityInsights = async (staffName: string, role: string, scores: any, remarks: string) => {
  if (!process.env.GEMINI_API_KEY) return "AI Insights unavailable: API Key missing.";

  const prompt = `
    Analyze the following security performance metrics for ${staffName} (${role}).
    Metrics (out of 5 stars):
    ${Object.entries(scores).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
    
    Manager Remarks: ${remarks || 'No specific remarks provided.'}
    
    Provide a concise (2-3 sentences), professional, and motivating performance insight. 
    Focus on strengths and areas for improvement. Use a "World Class" tone.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Unable to generate AI insights at this moment.";
  }
};
