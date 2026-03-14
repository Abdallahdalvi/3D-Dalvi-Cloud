import { GoogleGenAI } from "@google/genai";

export async function generateGhostMannequin(
  file: File,
  customPrompt: string
): Promise<string> {
  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const mimeType = file.type;
  const base64String = base64Data.split(',')[1];

  // Use the platform-provided API key or Vite environment variable
  const apiKey = import.meta.env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is missing. Please add VITE_GEMINI_API_KEY to your .env file.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `give me a ghost manequin 3d of this cloth ${customPrompt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64String,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
}
