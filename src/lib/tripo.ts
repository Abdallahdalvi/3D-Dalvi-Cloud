import { categorizeTripoError, AppError, ErrorCategory } from "./errors";

const TRIPO_API_URL = '/api/tripo';

async function handleTripoResponse(response: Response, defaultError: string) {
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!response.ok || !isJson) {
    console.warn(`Tripo Response: Status ${response.status}, Content-Type: ${contentType}`);
  }

  if (response.ok) {
    if (isJson) {
      const data = await response.json();
      // Tripo sometimes returns 200 but with success: false in the body
      if (data.success === false || data.code !== 0 && data.code !== undefined) {
        const msg = data.message || data.error || defaultError;
        throw categorizeTripoError(new Error(msg), response.status);
      }
      return data;
    } else {
      const text = await response.text();
      if (text.includes("<!doctype html>") || text.includes("<html>")) {
        console.error("Received HTML instead of JSON. HTML preview:", text.substring(0, 500));
        if (text.includes("<title>Cookie check</title>")) {
          throw new AppError("The request was intercepted by the platform's security check. This usually happens when a session expires. Please refresh the page and try again.", ErrorCategory.NETWORK);
        }
        throw new AppError(`Received an HTML response (Status ${response.status}) instead of JSON. This usually means the server proxy is misconfigured, the route is missing, or the request was intercepted.`, ErrorCategory.NETWORK);
      }
      console.warn(`Tripo returned non-JSON success response: ${text.substring(0, 100)}`);
      return { data: { message: text }, success: true };
    }
  }

  let errorMessage = defaultError;
  if (isJson) {
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || `${defaultError} (Status ${response.status})`;
    } catch (e) {
      console.error("Failed to parse Tripo error JSON", e);
      errorMessage = `${defaultError} (Status ${response.status})`;
    }
  } else {
    const text = await response.text();
    // If we got HTML back, it's likely a proxy or server error
    if (text.includes("<!doctype html>") || text.includes("<html>")) {
      console.error("Received HTML instead of JSON in error path. HTML preview:", text.substring(0, 500));
      if (text.includes("<title>Cookie check</title>")) {
        errorMessage = "The request was intercepted by the platform's security check. Please refresh the page and try again.";
      } else {
        errorMessage = `Received an HTML response (Status ${response.status}) instead of JSON. This usually means the server proxy is misconfigured, the route is missing, or the request was intercepted.`;
      }
    } else {
      errorMessage = text || `${defaultError} (Status ${response.status})`;
    }
  }

  throw categorizeTripoError(new Error(errorMessage), response.status);
}

export type TripoOptions = {
  modelVersion?: string;
  pbr?: boolean;
  meshQuality?: 'low' | 'medium' | 'high';
  topology?: 'quad' | 'triangle';
  textureResolution?: 512 | 1024 | 2048 | 4096;
  faceLimit?: number;
}

export async function uploadToTripo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${TRIPO_API_URL}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const data = await handleTripoResponse(response, 'Failed to upload to Tripo');
    // Documentation says image_token, but we'll check both to be safe
    return data.data.image_token || data.data.file_token;
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error;
    throw categorizeTripoError(error);
  }
}

export async function createImageToModelTask(fileToken: string, fileType: string = 'png', options?: TripoOptions): Promise<string> {
  try {
    const body: any = {
      type: 'image_to_model',
      model_version: options?.modelVersion || 'v2.0-20240919',
      file: {
        type: fileType,
        file_token: fileToken
      },
      params: {
        pbr: options?.pbr ?? true,
        mesh_quality: options?.meshQuality || 'medium',
        topology: options?.topology || 'triangle',
        texture_resolution: options?.textureResolution || 1024,
      }
    };

    if (options?.faceLimit) {
      body.params.face_limit = options.faceLimit;
    }

    console.log(`[Tripo Task] Creating ${body.type} with version ${body.model_version}. Body:`, JSON.stringify(body));

    const response = await fetch(`${TRIPO_API_URL}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await handleTripoResponse(response, 'Failed to create Tripo task');
    return data.data.task_id;
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error;
    throw categorizeTripoError(error);
  }
}

export async function createMultiviewToModelTask(files: {token?: string, type: string}[], options?: TripoOptions): Promise<string> {
  if (files.length !== 4) {
    throw new AppError(`Tripo v3.1 Multiview requires exactly 4 items. Received ${files.length}.`, ErrorCategory.UNKNOWN);
  }

  try {
    const body: any = {
      type: 'multiview_to_model',
      model_version: options?.modelVersion || 'v2.0-20240919',
      files: files.map(f => {
        const item: any = { type: f.type };
        if (f.token) {
          item.file_token = f.token;
        }
        return item;
      }),
      params: {
        pbr: options?.pbr ?? true,
        mesh_quality: options?.meshQuality || 'medium',
        topology: options?.topology || 'triangle',
        texture_resolution: options?.textureResolution || 1024,
      }
    };

    if (options?.faceLimit) {
      body.params.face_limit = options.faceLimit;
    }

    console.log(`[Tripo Multiview Task] Creating ${body.type} with version ${body.model_version}. Body:`, JSON.stringify(body));

    const response = await fetch(`${TRIPO_API_URL}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await handleTripoResponse(response, 'Failed to create Tripo multiview task');
    return data.data.task_id;
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') throw error;
    throw categorizeTripoError(error);
  }
}

export async function pollTripoTask(taskId: string, onStatusUpdate?: (status: string) => void): Promise<any> {
  const maxAttempts = 240; // 20 minutes with 5s interval
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${TRIPO_API_URL}/task/${taskId}`, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const data = await handleTripoResponse(response, 'Failed to poll Tripo task');
      const taskData = data.data;
      const status = taskData.status;
      const progress = taskData.progress;

      console.log(`[Tripo Poll] Task: ${taskId}, Status: ${status}, Progress: ${progress}%`);

      if (onStatusUpdate && progress !== undefined) {
        onStatusUpdate(`Tripo: ${progress}%`);
      }

      if (status === 'success') {
        return taskData;
      } else if (status === 'failed' || status === 'error') {
        throw categorizeTripoError(new Error(`Tripo task failed: ${taskData.error || 'Unknown error'}`));
      } else if (status === 'cancelled') {
        throw new AppError('Tripo task was cancelled.', ErrorCategory.UNKNOWN);
      } else if (status === 'timeout') {
        throw new AppError('Tripo task timed out on the server side.', ErrorCategory.QUOTA);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw categorizeTripoError(error);
    }
  }

  throw new AppError('Tripo task timed out after 20 minutes of polling. Usually it takes about 5 minutes, so it might be stuck.', ErrorCategory.QUOTA);
}
