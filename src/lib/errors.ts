export enum ErrorCategory {
  API_KEY = 'API_KEY',
  QUOTA = 'QUOTA',
  NETWORK = 'NETWORK',
  INVALID_INPUT = 'INVALID_INPUT',
  SAFETY = 'SAFETY',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  category: ErrorCategory;
  originalError?: any;

  constructor(message: string, category: ErrorCategory, originalError?: any) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.originalError = originalError;
  }
}

export function categorizeGeminiError(error: any): AppError {
  const message = error?.message || String(error);
  console.error("Gemini API Error:", error);

  if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
    return new AppError(
      "Invalid Gemini API key. Solution: Please check your Secrets in the Settings menu and ensure the Gemini API key is correct.",
      ErrorCategory.API_KEY,
      error
    );
  }

  if (message.includes("429") || message.includes("quota") || message.includes("Quota exceeded")) {
    return new AppError(
      "Gemini quota exceeded. Solution: This usually resets daily. Please try again later or upgrade your plan in the Google AI Studio console.",
      ErrorCategory.QUOTA,
      error
    );
  }

  if (message.includes("safety") || message.includes("blocked")) {
    return new AppError(
      "Request blocked by safety filters. Solution: Please try a different image or prompt. Avoid content that might violate safety guidelines.",
      ErrorCategory.SAFETY,
      error
    );
  }

  if (message.includes("fetch failed") || message.includes("network") || message.includes("Failed to fetch")) {
    return new AppError(
      "Network error connecting to Gemini. Solution: Please check your internet connection. The Gemini API might be temporarily unreachable.",
      ErrorCategory.NETWORK,
      error
    );
  }

  if (message.includes("400") || message.includes("invalid")) {
    return new AppError(
      "Invalid request sent to Gemini. Solution: Please check your input image and prompt. Ensure the image is not too large or in an unsupported format.",
      ErrorCategory.INVALID_INPUT,
      error
    );
  }

  return new AppError(
    `Gemini Error: ${message || "An unexpected error occurred"}. Solution: Try refreshing the page or re-uploading the image.`,
    ErrorCategory.SERVER,
    error
  );
}

export function categorizeTripoError(error: any, status?: number): AppError {
  const message = error?.message || String(error);
  console.error("Tripo API Error:", error);

  if (status === 401 || message.includes("API key")) {
    return new AppError(
      "Invalid Tripo API key. Solution: Please check your TRIPO_API_KEY in the Settings menu and ensure it is active on tripo3d.ai.",
      ErrorCategory.API_KEY,
      error
    );
  }

  if (status === 402 || message.includes("balance") || message.includes("insufficient")) {
    return new AppError(
      "Tripo balance insufficient. Solution: Please top up your credits at tripo3d.ai to continue generating 3D models.",
      ErrorCategory.QUOTA,
      error
    );
  }

  if (status === 429 || message.includes("rate limit")) {
    return new AppError(
      "Tripo rate limit exceeded. Solution: You're sending requests too fast. Please wait 30-60 seconds before trying again.",
      ErrorCategory.QUOTA,
      error
    );
  }

  if (status === 400 || message.includes("invalid")) {
    return new AppError(
      "Invalid request sent to Tripo. Solution: Ensure your images are in supported formats (PNG/JPG) and are not corrupted. Try a different image.",
      ErrorCategory.INVALID_INPUT,
      error
    );
  }

  if (status && status >= 500) {
    return new AppError(
      "Tripo server error. Solution: Their service might be down temporarily. Please check status.tripo3d.ai or try again in a few minutes.",
      ErrorCategory.SERVER,
      error
    );
  }

  if (message.includes("fetch failed") || message.includes("network") || message.includes("Failed to fetch")) {
    return new AppError(
      "Network error connecting to Tripo. Solution: Check your internet connection or firewall settings. The proxy server might be unreachable.",
      ErrorCategory.NETWORK,
      error
    );
  }

  if (message.includes("timed out")) {
    return new AppError(
      "Tripo task timed out. Solution: The model is taking too long to generate. This can happen with complex images. Try a simpler image or check your Tripo dashboard.",
      ErrorCategory.QUOTA,
      error
    );
  }

  return new AppError(
    `Tripo Error: ${message || "An unexpected error occurred"}. Solution: Try refreshing the page or re-uploading the image.`,
    ErrorCategory.UNKNOWN,
    error
  );
}
