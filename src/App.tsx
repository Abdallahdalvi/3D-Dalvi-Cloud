import React, { useState, useCallback, useRef } from 'react';
import { Upload, Download, Image as ImageIcon, Trash2, Loader2, Sparkles, AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { generateGhostMannequin } from './lib/gemini';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

type ImageItem = {
  id: string;
  file: File;
  originalUrl: string;
  status: 'idle' | 'generating' | 'success' | 'error';
  generatedUrl?: string;
  error?: string;
  prompt?: string;
};

const CLOTHING_TYPES = [
  'shirt', 't-shirt', 'pants', 'jeans', 'shorts', 'cap', 'hat', 'jacket', 'hoodie', 'sweater', 'undergarments', 'dress', 'skirt'
];

function MainApp() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const addFiles = (files: File[]) => {
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    const newItems: ImageItem[] = validFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      originalUrl: URL.createObjectURL(file),
      status: 'idle'
    }));
    setImages(prev => [...prev, ...newItems]);
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

  const generateSingle = async (id: string) => {
    const item = images.find(img => img.id === id);
    if (!item || item.status === 'generating') return;

    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating', error: undefined } : img));

    try {
      const promptToUse = item.prompt !== undefined ? item.prompt : customPrompt;
      const generatedUrl = await generateGhostMannequin(item.file, promptToUse);
      setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'success', generatedUrl, prompt: promptToUse } : img));
    } catch (error) {
      console.error("Generation failed:", error);
      setImages(prev => prev.map(img => img.id === id ? { 
        ...img, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Failed to generate image' 
      } : img));
    }
  };

  const generateAll = async () => {
    const pendingImages = images.filter(img => img.status === 'idle' || img.status === 'error');
    if (pendingImages.length === 0) return;

    setIsGeneratingAll(true);
    
    // Process sequentially to avoid rate limits
    for (const img of pendingImages) {
      await generateSingle(img.id);
    }
    
    setIsGeneratingAll(false);
  };

  const downloadSingle = (url: string, filename: string) => {
    saveAs(url, filename);
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">3d dalvi cloud</h1>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Sidebar Settings */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 rounded-2xl p-6 shadow-sm border border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-zinc-400" />
                <h2 className="font-semibold text-zinc-100">Generation Settings</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Additional Prompt (Optional)</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateAll();
                      }
                    }}
                    placeholder="e.g., make it look like silk, add dramatic lighting..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-24 resize-none placeholder:text-zinc-600 mb-3"
                  />
                  <button
                    onClick={generateAll}
                    disabled={isGeneratingAll || images.filter(img => img.status === 'idle' || img.status === 'error').length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 disabled:text-white/50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                  >
                    {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Enter / Generate All
                  </button>
                </div>
              </div>
            </div>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {images.map((img) => (
                  <div key={img.id} className="bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-800 flex flex-col">
                    <div className="relative aspect-[4/3] bg-zinc-950 flex-1 flex flex-col">
                      {img.status === 'success' && img.generatedUrl ? (
                        <div className="flex flex-1 w-full h-full">
                          <div className="w-1/2 h-full relative border-r border-zinc-800">
                            <img src={img.originalUrl} alt="Original" className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">Original</div>
                          </div>
                          <div className="w-1/2 h-full relative">
                            <img src={img.generatedUrl} alt="Generated" className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 right-2 bg-indigo-500/80 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">3D Ghost</div>
                          </div>
                        </div>
                      ) : (
                        <img src={img.originalUrl} alt="Original" className="w-full h-full object-cover opacity-50" />
                      )}
                      
                      {/* Status Overlays */}
                      {img.status === 'generating' && (
                        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
                          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                          <span className="text-sm font-medium text-indigo-300">Generating 4K 3D...</span>
                        </div>
                      )}
                      
                      {img.status === 'error' && (
                        <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                          <span className="text-sm font-medium text-red-300 mb-1">Generation Failed</span>
                          <span className="text-xs text-red-400/80 line-clamp-3">{img.error}</span>
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
                        
                        {img.status === 'success' && img.generatedUrl ? (
                          <button 
                            onClick={() => downloadSingle(img.generatedUrl!, `${img.file.name.split('.')[0]}_3d.png`)}
                            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1"
                          >
                            <Download className="w-4 h-4" />
                            Save
                          </button>
                        ) : (
                          <button 
                            onClick={() => generateSingle(img.id)}
                            disabled={img.status === 'generating'}
                            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4" />
                            {img.status === 'error' ? 'Retry' : 'Generate'}
                          </button>
                        )}
                      </div>

                      {img.status === 'success' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={img.prompt !== undefined ? img.prompt : customPrompt}
                            onChange={(e) => updateImagePrompt(img.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                generateSingle(img.id);
                              }
                            }}
                            placeholder="Tweak prompt..."
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                          />
                          <button
                            onClick={() => generateSingle(img.id)}
                            disabled={img.status === 'generating'}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 shrink-0"
                            title="Regenerate with new prompt"
                          >
                            <Sparkles className="w-3 h-3" />
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
