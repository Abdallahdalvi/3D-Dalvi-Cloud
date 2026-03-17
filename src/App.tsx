import React, { useState, useRef } from 'react';
import { Upload, Download, Image as ImageIcon, Trash2, Loader2, Sparkles, AlertCircle, CheckCircle2, Settings, Box, Shirt, Monitor, Plus, Send, Edit3, Zap, Eye, X, ExternalLink } from 'lucide-react';
import { generateGhostMannequin } from './lib/gemini';
import { uploadToTripo, createImageToModelTask, pollTripoTask, createMultiviewToModelTask } from './lib/tripo';
import { AppError, ErrorCategory } from './lib/errors';
import ErrorBoundary from './components/ErrorBoundary';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import '@google/model-viewer';

const ModelViewer = 'model-viewer' as any;

type Category = 'Clothes' | 'Device' | 'Others';

type ImageItem = {
  id: string;
  file: File;
  originalUrl: string;
  status: 'idle' | 'generating' | 'success' | 'error' | 'tripo-pending' | 'tripo-success';
  statusMessage?: string;
  generatedUrl?: string;
  tripoModelUrl?: string;
  tripoTaskId?: string;
  tripoModels?: {
    glb?: string;
    usdz?: string;
    obj?: string;
    fbx?: string;
    stl?: string;
  };
  error?: string;
  errorCategory?: ErrorCategory;
  prompt?: string;
  category: Category;
};

type DeviceAngle = 'Front' | 'Left' | 'Back' | 'Right';

const DEVICE_ANGLES: DeviceAngle[] = ['Front', 'Left', 'Back', 'Right'];

const extractModels = (result: any) => {
  const models: Record<string, string> = {};
  const output = result.output || result;
  
  const processObj = (obj: any) => {
    if (!obj) return;
    // GLB is often in model, glb, model_url, etc.
    const glbUrl = obj.model || obj.glb || obj.model_url || obj.pbr_model || obj.base_model || obj.url;
    if (glbUrl && typeof glbUrl === 'string') models.glb = glbUrl;
    
    // Other formats
    if (obj.usdz && typeof obj.usdz === 'string') models.usdz = obj.usdz;
    if (obj.obj && typeof obj.obj === 'string') models.obj = obj.obj;
    if (obj.fbx && typeof obj.fbx === 'string') models.fbx = obj.fbx;
    if (obj.stl && typeof obj.stl === 'string') models.stl = obj.stl;
  };

  if (Array.isArray(output)) {
    output.forEach(processObj);
  } else {
    processObj(output);
  }
  
  return models;
};

function MainApp() {
  const [activeCategory, setActiveCategory] = useState<Category>('Clothes');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [deviceImages, setDeviceImages] = useState<Partial<Record<DeviceAngle, File>>>({});
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [useTripoDirectly, setUseTripoDirectly] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [previewModelUrl, setPreviewModelUrl] = useState<string | null>(null);
  const [modelVersion, setModelVersion] = useState<string>('v2.0-20240919');
  const [pbr, setPbr] = useState(true);
  const [meshQuality, setMeshQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [topology, setTopology] = useState<'quad' | 'triangle'>('triangle');
  const [textureResolution, setTextureResolution] = useState<512 | 1024 | 2048 | 4096>(1024);
  const [faceLimit, setFaceLimit] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiStatus, setApiStatus] = useState<{ status: number; ok: boolean; data: any } | null>(null);
  const [isCheckingApi, setIsCheckingApi] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; onCancel: () => void } | null>(null);

  React.useEffect(() => {
    checkApiStatus();
  }, []);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const checkApiStatus = async (retryCount = 0) => {
    setIsCheckingApi(true);
    try {
      // Warm up with a simple health check first
      await fetch('/api/health', { credentials: 'include' }).catch(() => {});

      const response = await fetch('/api/tripo-check', {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        const text = await response.text();
        if (text.includes("<title>Cookie check</title>") && retryCount < 2) {
          console.log("Detected platform cookie check, retrying...");
          setTimeout(() => checkApiStatus(retryCount + 1), 1000);
          return;
        }
        throw new Error("Received HTML instead of JSON from API check");
      }

      const data = await response.json();
      setApiStatus(data);
    } catch (error) {
      console.error("API check failed:", error);
      if (retryCount < 1) {
        setTimeout(() => checkApiStatus(retryCount + 1), 2000);
        return;
      }
      setApiStatus({ 
        status: 0, 
        ok: false, 
        data: { 
          error: "Network Error: Failed to fetch",
          details: error instanceof Error ? error.message : String(error),
          suggestion: "The browser could not reach the server. Check if the dev server is running and not blocked by a firewall or ad-blocker."
        } 
      });
    } finally {
      setIsCheckingApi(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    const newItems: ImageItem[] = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      originalUrl: URL.createObjectURL(file),
      status: 'idle',
      category: activeCategory
    }));
    setImages(prev => [...prev, ...newItems]);
    return newItems.map(item => item.id);
  };

  const handleDeviceFileChange = (angle: DeviceAngle, file: File) => {
    setDeviceImages(prev => ({ ...prev, [angle]: file }));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      const removed = prev.find(img => img.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.originalUrl);
      }
      return filtered;
    });
  };

  const updateImagePrompt = (id: string, prompt: string) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, prompt } : img));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(images.map(img => img.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const generateSingle = async (id: string) => {
    const item = images.find(img => img.id === id);
    if (!item || item.status === 'generating') return;

    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating', error: undefined } : img));

    try {
      if (useTripoDirectly || item.category === 'Device') {
        await sendToTripo(id, item.file);
      } else {
        const promptToUse = item.prompt !== undefined ? item.prompt : customPrompt;
        
        const generatedUrl = await generateGhostMannequin(
          item.file, 
          promptToUse, 
          item.category,
          (msg) => setImages(prev => prev.map(img => img.id === id ? { ...img, statusMessage: msg } : img))
        );
        setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'success', statusMessage: undefined, generatedUrl, prompt: promptToUse } : img));
      }
    } catch (error) {
      console.error("Generation failed:", error);
      const appError = error instanceof AppError ? error : new AppError(String(error), ErrorCategory.UNKNOWN);
      setImages(prev => prev.map(img => img.id === id ? { 
        ...img, 
        status: 'error', 
        error: appError.message,
        errorCategory: appError.category
      } : img));
    }
  };

  const sendToTripo = async (id: string, file: File) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'tripo-pending', statusMessage: 'Uploading...', error: undefined } : img));
    try {
      // Use original file for highest quality
      const fileToken = await uploadToTripo(file);
      setImages(prev => prev.map(img => img.id === id ? { ...img, statusMessage: 'Creating task...' } : img));
      
      const mimeType = file.type;
      const fileType = mimeType === 'image/jpeg' ? 'jpg' : (mimeType === 'image/webp' ? 'webp' : 'png');
      
      const taskId = await createImageToModelTask(fileToken, fileType, {
        modelVersion,
        pbr,
        meshQuality,
        topology,
        textureResolution,
        faceLimit: faceLimit === '' ? undefined : faceLimit
      });
      
      setImages(prev => prev.map(img => img.id === id ? { ...img, tripoTaskId: taskId } : img));
      const result = await pollTripoTask(taskId, (msg) => {
        setImages(prev => prev.map(img => img.id === id ? { ...img, statusMessage: msg } : img));
      });
      
      // Tripo result usually contains a model URL (glb/usdz)
      console.log("Tripo task result:", JSON.stringify(result, null, 2));
      
      const models = extractModels(result);
      const modelUrl = models.glb;
      
      if (!modelUrl) {
        console.error("Tripo result missing model URL. Full result:", result);
        throw new AppError('Tripo task succeeded but no model URL was found in the response. Check console for details.', ErrorCategory.UNKNOWN);
      }
      
      setImages(prev => prev.map(img => img.id === id ? { 
        ...img, 
        status: 'tripo-success', 
        statusMessage: undefined,
        tripoModelUrl: modelUrl,
        tripoModels: models
      } : img));
      addNotification(`3D Model generated successfully for ${file.name}`, 'success');
    } catch (error) {
      console.error("Tripo failed:", error);
      const appError = error instanceof AppError ? error : new AppError(String(error), ErrorCategory.UNKNOWN);
      setImages(prev => prev.map(img => img.id === id ? { 
        ...img, 
        status: 'error', 
        error: appError.message,
        errorCategory: appError.category
      } : img));
    }
  };

  const handleSendGeneratedToTripo = async (id: string) => {
    const item = images.find(img => img.id === id);
    if (!item || !item.generatedUrl) return;

    // Convert base64 to File
    const res = await fetch(item.generatedUrl);
    const blob = await res.blob();
    const file = new File([blob], `generated_${id}.png`, { type: 'image/png' });

    await sendToTripo(id, file);
  };

  const handleDeviceMultiview = async () => {
    // Tripo API v3.1 expects exactly 4 items: Front, Left, Back, Right
    const TRIPO_ORDER: DeviceAngle[] = ['Front', 'Left', 'Back', 'Right'];
    
    // Check if the required Front is present
    if (!deviceImages['Front']) {
      addNotification("Tripo Multiview requires at least the Front angle.", 'error');
      return;
    }

    const filesToUpload: (File | null)[] = [];

    for (const angle of TRIPO_ORDER) {
      if (deviceImages[angle] instanceof File) {
        filesToUpload.push(deviceImages[angle] as File);
      } else {
        filesToUpload.push(null);
      }
    }

    // 1. Add files to the main list manually to have the items
    const newItems: ImageItem[] = filesToUpload.filter(f => f !== null).map(file => ({
      id: Math.random().toString(36).substring(7),
      file: file!,
      originalUrl: URL.createObjectURL(file!),
      status: 'idle',
      category: activeCategory
    }));
    setImages(prev => [...prev, ...newItems]);
    
    // 2. Clear device images
    setDeviceImages({});

    // 3. Trigger multiview generation for these specific items directly
    // We pass filesToUpload directly to maintain the exact 4-slot array with nulls
    handleBatchTripo('multiview', new Set(newItems.map(i => i.id)), newItems, filesToUpload);
  };

  const handleBatchTripo = async (mode: 'multiview' | 'individual', idsToProcess?: Set<string>, targetImages?: ImageItem[], exactFilesArray?: (File | null)[]) => {
    const targetIds = idsToProcess || selectedIds;
    const selectedImages = targetImages || images.filter(img => targetIds.has(img.id));
    if (selectedImages.length === 0) return;

    // If only one image is selected, just do a normal single generation
    if (selectedImages.length === 1 && mode !== 'multiview') {
      await generateSingle(selectedImages[0].id);
      return;
    }

    if (mode === 'multiview') {
      if (!exactFilesArray && selectedImages.length < 1) {
        addNotification("Multiview generation requires at least 1 front image.", 'error');
        return;
      }
    }

    setIsBatchProcessing(true);
    
    try {
      if (mode === 'multiview') {
        // Update status for all selected images
        setImages(prev => prev.map(img => 
          targetIds.has(img.id) ? { ...img, status: 'tripo-pending', statusMessage: 'Uploading views...' } : img
        ));

        // Prepare the exact 4-slot array for v3.1
        let filesArray = exactFilesArray;
        if (!filesArray) {
          // If triggered from gallery, just pad or truncate to 4
          filesArray = [
            selectedImages[0]?.file || null,
            selectedImages[1]?.file || null,
            selectedImages[2]?.file || null,
            selectedImages[3]?.file || null,
          ];
        }

        // Upload files and get tokens
        const fileTokens: {token?: string, type: string}[] = [];
        
        for (const fileToUpload of filesArray) {
          if (!fileToUpload) {
            fileTokens.push({ type: 'jpg' }); // Empty slot
            continue;
          }
          
          // Use original file for highest quality
          const token = await uploadToTripo(fileToUpload);
          const mimeType = fileToUpload.type;
          const fileType = mimeType === 'image/jpeg' ? 'jpg' : (mimeType === 'image/webp' ? 'webp' : 'png');
          
          fileTokens.push({ token, type: fileType });
        }

        // 2. Create multiview task
        const taskId = await createMultiviewToModelTask(fileTokens, {
          modelVersion,
          pbr,
          meshQuality,
          topology,
          textureResolution,
          faceLimit: faceLimit === '' ? undefined : faceLimit
        });
        
        setImages(prev => prev.map(img => 
          targetIds.has(img.id) ? { ...img, tripoTaskId: taskId } : img
        ));
        
        // 3. Update status
        setImages(prev => prev.map(img => 
          targetIds.has(img.id) ? { ...img, statusMessage: 'Processing Multiview...' } : img
        ));

        // 4. Poll for result
        const result = await pollTripoTask(taskId, (msg) => {
          setImages(prev => prev.map(img => 
            targetIds.has(img.id) ? { ...img, statusMessage: msg } : img
          ));
        });
        
        console.log("Tripo batch task result:", JSON.stringify(result, null, 2));
        
        const models = extractModels(result);
        const modelUrl = models.glb;

        if (!modelUrl) {
          console.error("Tripo batch result missing model URL. Full result:", result);
          throw new AppError('Tripo batch task succeeded but no model URL was found.', ErrorCategory.UNKNOWN);
        }

        // 5. Update all with success
        setImages(prev => prev.map(img => 
          targetIds.has(img.id) ? { 
            ...img, 
            status: 'tripo-success', 
            statusMessage: undefined, 
            tripoModelUrl: modelUrl,
            tripoModels: models
          } : img
        ));
        addNotification(`Batch Multiview model generated successfully!`, 'success');
        
        setSelectedIds(new Set());
      } else {
        // Individual Batch Mode
        // Process in small chunks to avoid hitting rate limits
        const chunkSize = 3; // Increased to 3 for faster processing of 10 images
        for (let i = 0; i < selectedImages.length; i += chunkSize) {
          const chunk = selectedImages.slice(i, i + chunkSize);
          await Promise.all(chunk.map(img => generateSingle(img.id)));
        }
        setSelectedIds(new Set());
      }
    } catch (error) {
      console.error("Batch Tripo failed:", error);
      const appError = error instanceof AppError ? error : new AppError(String(error), ErrorCategory.UNKNOWN);
      addNotification(appError.message, 'error');
      
      setImages(prev => prev.map(img => 
        targetIds.has(img.id) ? { 
          ...img, 
          status: 'error', 
          error: appError.message,
          errorCategory: appError.category
        } : img
      ));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const generateAll = async () => {
    const pendingImages = images.filter(img => img.status === 'idle' || img.status === 'error');
    if (pendingImages.length === 0) return;

    // Check if any pending image is a Device, or if useTripoDirectly is true
    const hasDevices = pendingImages.some(img => img.category === 'Device');
    
    if (useTripoDirectly || hasDevices) {
      // If direct Tripo is on, or we have devices (which don't use Ghost Mannequin), use batch processing
      const ids = new Set<string>(pendingImages.map(img => img.id));
      setSelectedIds(ids);
      
      // If 3 or more, ask for multiview
      if (ids.size >= 3) {
        setConfirmModal({
          title: "Generation Mode",
          message: `You have ${ids.size} pending images. Would you like to generate ONE 3D model using all images as different views (Multiview), or separate models for each?`,
          onConfirm: () => {
            setConfirmModal(null);
            handleBatchTripo('multiview', ids);
          },
          onCancel: () => {
            setConfirmModal(null);
            handleBatchTripo('individual', ids);
          }
        });
      } else {
        await handleBatchTripo('individual', ids);
      }
      return;
    }

    setIsGeneratingAll(true);
    
    // Process sequentially to avoid rate limits
    for (const img of pendingImages) {
      await generateSingle(img.id);
    }
    
    setIsGeneratingAll(false);
  };

  const downloadSingle = (url: string | undefined | null, filename: string) => {
    if (!url) {
      console.error("Download failed: URL is missing");
      return;
    }
    
    // Use saveAs directly for data URLs
    if (url.startsWith('data:')) {
      saveAs(url, filename);
      return;
    }

    // For external URLs, try to use saveAs which handles some cross-origin cases
    // or fallback to a direct link if needed
    try {
      saveAs(url, filename);
    } catch (err) {
      console.error("saveAs failed, falling back to link click", err);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadAllModels = async () => {
    const successfulModels = images.filter(img => img.status === 'tripo-success' && img.tripoModelUrl);
    if (successfulModels.length === 0) return;

    if (successfulModels.length === 1) {
      downloadSingle(successfulModels[0].tripoModelUrl!, `${successfulModels[0].file.name.split('.')[0]}.glb`);
      return;
    }

    const zip = new JSZip();
    
    for (let i = 0; i < successfulModels.length; i++) {
      const img = successfulModels[i];
      if (img.tripoModelUrl) {
        try {
          const response = await fetch(img.tripoModelUrl);
          const blob = await response.blob();
          const filename = `${img.file.name.split('.')[0]}.glb`;
          zip.file(filename, blob);
        } catch (err) {
          console.error(`Failed to add ${img.file.name} to zip:`, err);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, '3d_models.zip');
  };

  const downloadAll = async () => {
    const successfulImages = images.filter(img => img.status === 'success' && img.generatedUrl);
    if (successfulImages.length === 0) return;

    const zip = new JSZip();
    
    for (let i = 0; i < successfulImages.length; i++) {
      const img = successfulImages[i];
      if (img.generatedUrl) {
        // Extract base64 data
        const base64Data = img.generatedUrl.split(',')[1];
        // Determine extension from original file or default to png
        const ext = img.generatedUrl.includes('image/jpeg') ? 'jpg' : 'png';
        const filename = `${img.file.name.split('.')[0]}_3d_ghost.${ext}`;
        zip.file(filename, base64Data, { base64: true });
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'ghost_mannequin_images.zip');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white">3d dalvi cloud</h1>
            </div>
            
            <nav className="hidden md:flex items-center bg-zinc-950 rounded-full p-1 border border-zinc-800">
              {(['Clothes', 'Device', 'Others'] as Category[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    activeCategory === cat 
                      ? 'bg-indigo-500 text-white shadow-lg' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {cat === 'Clothes' && <Shirt className="w-4 h-4" />}
                  {cat === 'Device' && <Monitor className="w-4 h-4" />}
                  {cat === 'Others' && <Box className="w-4 h-4" />}
                  {cat}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => handleBatchTripo('individual')}
                  disabled={isBatchProcessing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                >
                  {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Box className="w-3 h-3" />}
                  Individual Batch ({selectedIds.size})
                </button>
                {selectedIds.size >= 3 && (
                  <button
                    onClick={() => handleBatchTripo('multiview')}
                    disabled={isBatchProcessing}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                  >
                    {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Multiview ({selectedIds.size})
                  </button>
                )}
              </div>
            )}
            {images.some(img => img.status === 'success') && (
              <button
                onClick={downloadAll}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download All
              </button>
            )}
            <button
              onClick={generateAll}
              disabled={isGeneratingAll || images.filter(img => img.status === 'idle' || img.status === 'error').length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 disabled:text-white/50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate All
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar Settings */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-zinc-400" />
                  <h2 className="font-semibold text-zinc-100">Generation Settings</h2>
                </div>
              </div>
              
              <div className="space-y-4">
                {(!apiStatus || !apiStatus.ok) && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-red-400 mb-1">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Configuration Required</span>
                    </div>
                    <p className="text-[10px] text-red-300/80 leading-relaxed">
                      {!apiStatus && "• Tripo API status unknown. Click 'Check Now' to verify. "}
                      {apiStatus && !apiStatus.ok && `• Tripo API Error: ${apiStatus.data?.error || 'Connection failed'}. `}
                      Make sure your Tripo API Key is set in your Secrets.
                    </p>
                  </div>
                )}

                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-400">Tripo API Status</span>
                    <button 
                      onClick={() => checkApiStatus()}
                      disabled={isCheckingApi}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                    >
                      {isCheckingApi ? 'Checking...' : 'Check Now'}
                    </button>
                  </div>
                  {apiStatus && (
                    <div className={`text-[10px] p-2 rounded ${apiStatus.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      <div className="font-bold mb-1">Status: {apiStatus.status} {apiStatus.ok ? '(OK)' : '(Error)'}</div>
                      <pre className="whitespace-pre-wrap break-all opacity-80">
                        {JSON.stringify(apiStatus.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${useTripoDirectly ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <span className="text-xs font-medium text-zinc-300">Direct Tripo AI</span>
                  </div>
                  <button
                    onClick={() => setUseTripoDirectly(!useTripoDirectly)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${useTripoDirectly ? 'bg-amber-500' : 'bg-zinc-800'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useTripoDirectly ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-zinc-400">Additional Prompt</label>
                    <button 
                      onClick={() => setCustomPrompt('')}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={activeCategory === 'Device' ? "Describe technical specs, materials..." : "e.g., make it look like silk..."}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-24 resize-none placeholder:text-zinc-600 mb-3"
                  />

                  <div className="space-y-4 pt-2 border-t border-zinc-800">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Model Version</label>
                        <span className="text-[10px] font-mono text-indigo-400">{modelVersion.split('-')[0].toUpperCase()}</span>
                      </div>
                      <div className="flex flex-col gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                        {[
                          { id: 'v3.1-20260211', label: 'V3.1 (Latest)' },
                          { id: 'v2.5-20250124', label: 'V2.5 (Fast)' },
                          { id: 'v2.0-20240919', label: 'V2.0 (Stable)' }
                        ].map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setModelVersion(v.id)}
                            className={`w-full py-1.5 rounded-md text-[9px] font-bold transition-all ${
                              modelVersion === v.id
                                ? 'bg-zinc-800 text-white'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-2 bg-zinc-950 rounded-lg border border-zinc-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">PBR</span>
                        <button
                          onClick={() => setPbr(!pbr)}
                          className={`w-8 h-4 rounded-full transition-colors relative ${pbr ? 'bg-indigo-500' : 'bg-zinc-800'}`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${pbr ? 'left-4.5' : 'left-0.5'}`} />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Mesh Quality</label>
                        <select
                          value={meshQuality}
                          onChange={(e) => setMeshQuality(e.target.value as any)}
                          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Topology</label>
                        <select
                          value={topology}
                          onChange={(e) => setTopology(e.target.value as any)}
                          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="triangle">Triangle</option>
                          <option value="quad">Quad</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Texture Res</label>
                        <select
                          value={textureResolution}
                          onChange={(e) => setTextureResolution(Number(e.target.value) as any)}
                          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value={512}>512</option>
                          <option value={1024}>1024</option>
                          <option value={2048}>2048</option>
                          <option value={4096}>4096</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Face Limit (Polygon Count)</label>
                      <input
                        type="number"
                        value={faceLimit}
                        onChange={(e) => setFaceLimit(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Auto"
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={generateAll}
                    disabled={isGeneratingAll || images.filter(img => img.status === 'idle' || img.status === 'error').length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 disabled:text-white/50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate All
                  </button>
                </div>
              </div>
            </div>

            {activeCategory === 'Device' && (
              <div className="bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  Kleon Device Angles
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {DEVICE_ANGLES.map((angle) => (
                    <div key={angle} className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{angle}</span>
                      <div 
                        className={`aspect-square rounded-lg border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                          deviceImages[angle] ? 'border-indigo-500 bg-indigo-500/5' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
                        }`}
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) handleDeviceFileChange(angle, file);
                          };
                          input.click();
                        }}
                      >
                        {deviceImages[angle] ? (
                          <img 
                            src={URL.createObjectURL(deviceImages[angle]!)} 
                            alt={angle} 
                            className="w-full h-full object-cover rounded-lg"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Plus className="w-4 h-4 text-zinc-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {Object.keys(deviceImages).length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    <button
                      onClick={handleDeviceMultiview}
                      disabled={Object.keys(deviceImages).length < 3 || isBatchProcessing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                    >
                      {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Box className="w-3 h-3" />}
                      Generate 3D Model ({Object.keys(deviceImages).length} angles)
                    </button>
                    <button
                      onClick={() => {
                        // Add all device images to the main list
                        Object.values(deviceImages).forEach(file => {
                          if (file instanceof File) addFiles([file]);
                        });
                        setDeviceImages({});
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                    >
                      Add to Queue Only
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Upload Zone */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="bg-zinc-900 rounded-2xl p-8 border-2 border-dashed border-zinc-700 hover:border-indigo-500 transition-colors text-center cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                multiple 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-zinc-200 mb-1">Click or drag images here</p>
              <p className="text-xs text-zinc-500">Supports JPG, PNG (Bulk upload enabled)</p>
            </div>
          </div>

          {/* Image Grid */}
          <div className="lg:col-span-3">
            {images.length === 0 ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900">
                <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium text-zinc-400">No images uploaded yet</p>
                <p className="text-sm">Upload some clothing images to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-zinc-400">{images.length} images uploaded</span>
                    <div className="h-4 w-px bg-zinc-800" />
                    <span className="text-sm text-indigo-400 font-medium">{selectedIds.size} selected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {images.some(img => img.status === 'tripo-success') && (
                      <button 
                        onClick={downloadAllModels}
                        className="text-xs text-amber-400 hover:text-amber-300 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3 h-3" />
                        Download All GLBs
                      </button>
                    )}
                    {images.some(img => img.status === 'success') && (
                      <button 
                        onClick={downloadAll}
                        className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3 h-3" />
                        Download All Images
                      </button>
                    )}
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-1.5 mr-2">
                        <button 
                          onClick={() => handleBatchTripo('individual')}
                          disabled={isBatchProcessing}
                          className="text-xs text-amber-400 hover:text-amber-300 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Box className="w-3 h-3" />}
                          Individual Batch ({selectedIds.size})
                        </button>
                        {selectedIds.size >= 3 && (
                          <button 
                            onClick={() => handleBatchTripo('multiview')}
                            disabled={isBatchProcessing}
                            className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isBatchProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Multiview ({selectedIds.size})
                          </button>
                        )}
                      </div>
                    )}
                    <button 
                      onClick={selectAll}
                      className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1 bg-zinc-800 rounded-md transition-colors"
                    >
                      Select All
                    </button>
                    <button 
                      onClick={deselectAll}
                      className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1 bg-zinc-800 rounded-md transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {images.map((img) => (
                    <div 
                      key={img.id} 
                      className={`bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border transition-all relative group ${
                        selectedIds.has(img.id) ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {/* Selection area wrapper */}
                      <div 
                        onClick={() => toggleSelection(img.id)}
                        className="relative aspect-[4/3] bg-zinc-950 flex-1 flex flex-col cursor-pointer"
                      >
                        {/* Selection Checkbox */}
                        <div className={`absolute top-3 left-3 z-20 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          selectedIds.has(img.id) ? 'bg-indigo-500 border-indigo-500' : 'bg-black/40 border-white/20'
                        }`}>
                          {selectedIds.has(img.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                      {img.status === 'success' && img.generatedUrl ? (
                        <div className="flex flex-1 w-full h-full">
                          <div className="w-1/2 h-full relative border-r border-zinc-800">
                            <img src={img.originalUrl} alt="Original" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">Original</div>
                          </div>
                          <div className="w-1/2 h-full relative">
                            <img src={img.generatedUrl} alt="Generated" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute bottom-2 right-2 bg-indigo-500/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">3D Ghost</div>
                          </div>
                        </div>
                      ) : (
                        <img src={img.originalUrl} alt="Original" className="w-full h-full object-cover opacity-50" referrerPolicy="no-referrer" />
                      )}
                      
                      {/* Status Overlays */}
                      {(img.status === 'generating' || img.status === 'tripo-pending') && (
                        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
                          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                          <span className="text-sm font-medium text-indigo-300">
                            {img.statusMessage || (img.status === 'generating' ? 'Generating 4K 3D...' : 'Tripo AI Processing...')}
                          </span>
                        </div>
                      )}
                      
                      {img.status === 'tripo-success' && (
                        <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                          <Box className="w-10 h-10 text-amber-400 mb-2" />
                          <span className="text-sm font-bold text-amber-300">3D Model Ready</span>
                        </div>
                      )}
                      
                      {img.status === 'error' && (
                        <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                          <span className="text-sm font-medium text-red-300 mb-1">
                            {img.errorCategory === ErrorCategory.API_KEY ? 'Configuration Error' : 
                             img.errorCategory === ErrorCategory.QUOTA ? 'Limit Reached' :
                             img.errorCategory === ErrorCategory.SAFETY ? 'Safety Block' :
                             img.errorCategory === ErrorCategory.NETWORK ? 'Network Error' :
                             'Generation Failed'}
                          </span>
                          <span className="text-xs text-red-400/80 line-clamp-4 px-2">
                            {img.error?.includes('Solution:') ? (
                              <>
                                <span className="block mb-1">{img.error.split('Solution:')[0]}</span>
                                <span className="block text-[10px] text-red-300/90 font-semibold bg-red-500/10 p-1 rounded border border-red-500/20">
                                  💡 {img.error.split('Solution:')[1]}
                                </span>
                              </>
                            ) : img.error}
                          </span>
                        </div>
                      )}

                      {img.status === 'success' && (
                        <div className="absolute top-3 left-3 bg-emerald-500/90 text-white text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1 shadow-sm backdrop-blur-sm">
                          <CheckCircle2 className="w-3 h-3" />
                          Done
                        </div>
                      )}

                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        className="absolute top-3 right-3 w-8 h-8 bg-zinc-900/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-full flex items-center justify-center shadow-sm transition-colors backdrop-blur-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400 truncate max-w-[120px]" title={img.file.name}>
                          {img.file.name}
                        </span>
                        
                      {img.status === 'tripo-success' ? (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex items-center justify-between gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewModelUrl(img.tripoModelUrl || null);
                              }}
                              className="flex-1 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview 3D
                            </button>
                            
                            {img.tripoTaskId && (
                              <a 
                                href={`https://www.tripo3d.ai/app/task/${img.tripoTaskId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-zinc-700"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View on Tripo
                              </a>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {img.tripoModels?.glb && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingle(img.tripoModels!.glb!, `${img.file.name.split('.')[0]}.glb`);
                                }}
                                className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                GLB
                              </button>
                            )}
                            {img.tripoModels?.usdz && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingle(img.tripoModels!.usdz!, `${img.file.name.split('.')[0]}.usdz`);
                                }}
                                className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                USDZ
                              </button>
                            )}
                            {img.tripoModels?.obj && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingle(img.tripoModels!.obj!, `${img.file.name.split('.')[0]}.obj`);
                                }}
                                className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                OBJ
                              </button>
                            )}
                            {img.tripoModels?.fbx && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingle(img.tripoModels!.fbx!, `${img.file.name.split('.')[0]}.fbx`);
                                }}
                                className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                FBX
                              </button>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              generateSingle(img.id);
                            }}
                            className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Regenerate 3D
                          </button>
                        </div>
                      ) : img.status === 'success' && img.generatedUrl ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadSingle(img.generatedUrl!, `${img.file.name.split('.')[0]}_3d.png`);
                              }}
                              className="text-indigo-400 hover:text-indigo-300 text-xs font-medium flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Save Image
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendGeneratedToTripo(img.id);
                              }}
                              className="text-amber-400 hover:text-amber-300 text-xs font-medium flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Send to Tripo
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPromptId(img.id);
                              }}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-[10px] font-medium transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                              Tweak Prompt
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generateSingle(img.id);
                              }}
                              className="px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md text-[10px] font-medium transition-colors"
                            >
                              Regenerate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => generateSingle(img.id)}
                          disabled={img.status === 'generating' || img.status === 'tripo-pending'}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          {img.status === 'error' ? 'Retry' : 'Generate 3D'}
                        </button>
                      )}
                    </div>

                    {editingPromptId === img.id && (
                      <div className="p-4 border-t border-zinc-800 bg-zinc-950">
                        <textarea
                          value={img.prompt !== undefined ? img.prompt : customPrompt}
                          onChange={(e) => updateImagePrompt(img.id, e.target.value)}
                          placeholder="Refine the prompt..."
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 h-20 resize-none mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingPromptId(null);
                              generateSingle(img.id);
                            }}
                            className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-1.5 rounded-md text-[10px] font-bold"
                          >
                            Apply & Regenerate
                          </button>
                          <button
                            onClick={() => setEditingPromptId(null)}
                            className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 py-1.5 rounded-md text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </ErrorBoundary>
    </main>
      {/* 3D Preview Modal */}
      {previewModelUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-4xl aspect-square md:aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
            <button 
              onClick={() => setPreviewModelUrl(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <ModelViewer
              src={previewModelUrl}
              camera-controls
              auto-rotate
              shadow-intensity="1"
              environment-image="neutral"
              exposure="1"
              style={{ width: '100%', height: '100%', backgroundColor: '#18181b' }}
            >
              <div slot="progress-bar" className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                  <span className="text-zinc-400 font-medium">Loading 3D Model...</span>
                </div>
              </div>
            </ModelViewer>

            <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center pointer-events-none">
              <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-auto">
                <span className="text-xs text-zinc-300 font-medium">Drag to rotate • Scroll to zoom</span>
              </div>
              <div className="flex gap-2 pointer-events-auto">
                {images.find(img => img.tripoModelUrl === previewModelUrl)?.tripoTaskId && (
                  <a 
                    href={`https://www.tripo3d.ai/app/task/${images.find(img => img.tripoModelUrl === previewModelUrl)?.tripoTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors shadow-lg flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in Tripo
                  </a>
                )}
                <button 
                  onClick={() => downloadSingle(previewModelUrl, 'model.glb')}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-bold transition-colors shadow-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download GLB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-md w-full">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-right-full duration-300 ${
              n.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' :
              n.type === 'error' ? 'bg-red-950/90 border-red-500/50 text-red-200' :
              'bg-zinc-900/90 border-zinc-700 text-zinc-200'
            }`}
          >
            {n.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> :
             n.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-400 shrink-0" /> :
             <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />}
            <p className="text-sm font-medium leading-tight">{n.message}</p>
            <button onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))} className="ml-auto text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2">{confirmModal.title}</h3>
            <p className="text-zinc-400 mb-8 leading-relaxed">{confirmModal.message}</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmModal.onConfirm}
                className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors shadow-lg"
              >
                Multiview (Recommended)
              </button>
              <button 
                onClick={confirmModal.onCancel}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-colors"
              >
                Individual Models
              </button>
              <button 
                onClick={() => setConfirmModal(null)}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
  </div>
);
}

export default function App() {
  return <MainApp />;
}
