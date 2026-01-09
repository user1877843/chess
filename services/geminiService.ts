
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiResponse } from "../types";

const getAi = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'undefined') {
    return null;
  }
  return new (GoogleGenAI as any)(key);
};

export const getGeminiMove = async (
  fen: string,
  history: string[]
): Promise<GeminiResponse> => {
  try {
    const ai = getAi();
    if (!ai) {
      return {
        explanation: "Gemini API 키가 설정되지 않았습니다. .env.local 파일을 확인해주세요.",
        evaluation: "API 키 누락",
      };
    }

    const model = ai.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction: `You are a world-class Chess Grandmaster. 
        Analyze the current FEN board state. 
        If it is your turn (as specified by the FEN), suggest the best legal move in SAN (Standard Algebraic Notation) format.
        Provide a concise strategic explanation and a brief evaluation of the position.
        Return the result strictly in JSON format.`,
    });

    const response = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Current Chess Board (FEN): ${fen}\nMove History: ${history.join(", ")}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            move: {
              type: Type.STRING,
              description: "The best move in SAN format (e.g., 'e4', 'Nf3', 'O-O').",
            },
            explanation: {
              type: Type.STRING,
              description: "A brief strategic explanation for the move.",
            },
            evaluation: {
              type: Type.STRING,
              description: "An evaluation of the current position (e.g., 'White is slightly better (+0.5)').",
            },
          },
          required: ["explanation", "evaluation"],
        },
      },
    });

    const textOutput = response.response.text();
    return JSON.parse(textOutput.trim());
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      explanation: "I encountered an error analyzing this position.",
      evaluation: "Unknown",
    };
  }
};

export const getMoveAdvice = async (
  fen: string,
  lastMove: string
): Promise<string> => {
  try {
    const ai = getAi();
    if (!ai) return "API 키를 설정하면 실시간 코칭을 받을 수 있습니다.";

    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are a chess coach. Give short, punchy, helpful advice based on the last move and current board.",
    });

    const response = await model.generateContent(`The opponent just played ${lastMove}. Current FEN: ${fen}. Provide a 1-sentence strategic tip for the current player.`);

    return response.response.text() || "Keep controlling the center and develop your pieces!";
  } catch (error) {
    return "Keep controlling the center and develop your pieces!";
  }
};
