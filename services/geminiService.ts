import { GoogleGenAI, Type } from "@google/genai";
import { RiddleData, RiddleResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = 'gemini-2.5-flash';

export const generateRiddle = async (): Promise<RiddleData> => {
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "Generate a mysterious, magical riddle suitable for a Harry Potter themed maze. The riddle should guard the Triwizard Cup. Return a JSON object with 'question' and 'hint'. Do not provide the answer in the text.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            hint: { type: Type.STRING }
          },
          required: ["question", "hint"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as RiddleData;
  } catch (error) {
    console.error("Gemini Riddle Error:", error);
    return {
      question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
      hint: "It's a sound phenomenon."
    };
  }
};

export const validateAnswer = async (riddle: string, answer: string): Promise<RiddleResponse> => {
  try {
    const prompt = `
      Riddle: "${riddle}"
      User Answer: "${answer}"
      
      Is the user's answer correct? Be lenient with spelling and synonyms. 
      Return JSON: { "isCorrect": boolean, "feedback": string (magical flavor text explaining why it is right or wrong) }
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ["isCorrect", "feedback"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as RiddleResponse;
  } catch (error) {
    console.error("Gemini Validation Error:", error);
    // Fallback logic if API fails
    const normalized = answer.toLowerCase().trim();
    if (normalized.includes("echo")) {
      return { isCorrect: true, feedback: "The mist clears... you have spoken the truth." };
    }
    return { isCorrect: false, feedback: "The air grows colder. That is not the correct answer." };
  }
};