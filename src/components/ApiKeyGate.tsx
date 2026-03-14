import React, { useState, useEffect } from 'react';
import { Key } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const result = await window.aistudio.hasSelectedApiKey();
        setHasKey(result);
      } else {
        setHasKey(true); // Fallback for local dev
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true); // Assume success to mitigate race condition
      } catch (error) {
        console.error(error);
        if (error instanceof Error && error.message.includes("Requested entity was not found.")) {
           setHasKey(false);
        }
      }
    }
  };

  if (hasKey === null) return null; // Loading

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-3">API Key Required</h2>
          <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
            This application uses the high-quality <strong>gemini-3.1-flash-image-preview</strong> model for 4K 3D rendering. You must select a paid Google Cloud project API key to continue.
            <br /><br />
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Learn more about billing</a>
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
