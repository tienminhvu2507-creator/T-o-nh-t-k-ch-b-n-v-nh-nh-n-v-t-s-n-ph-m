/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Key, 
  Maximize2, 
  RotateCcw, 
  ExternalLink, 
  X,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Search,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Clock,
  FileText,
  Check,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { slugify } from './utils';
import { ProjectState, HistoryState, Scene, Character, Product, Script, ImageVersion } from './types';
import { AssetManager } from './components/AssetManager';
import { SceneManager } from './components/SceneManager';
import { ImageModal } from './components/ImageModal';
import { GoogleGenAI } from "@google/genai";

import { translations, type Language } from './translations';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_STATE: ProjectState = {
  projectName: '',
  activeTab: 'home',
  language: 'vi',
  scripts: [],
  activeScriptId: null,
  userApiKey: '',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000,
  signal?: AbortSignal,
  onRetry?: (attempt: number, delay: number, error: any) => void
): Promise<T> {
  let retries = 0;
  while (true) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }
    try {
      return await fn();
    } catch (error: any) {
      if (signal?.aborted) {
        throw new Error("Aborted");
      }
      const errorStr = JSON.stringify(error);
      const isQuotaError = 
        error?.status === 'RESOURCE_EXHAUSTED' || 
        error?.code === 429 || 
        (error?.message && error.message.includes('429')) ||
        errorStr.includes('429') ||
        errorStr.includes('RESOURCE_EXHAUSTED');

      const isInternalError = 
        error?.status === 'INTERNAL' || 
        error?.code === 500 || 
        (error?.message && error.message.includes('500')) ||
        errorStr.includes('500') ||
        errorStr.includes('INTERNAL');

      if ((isQuotaError || isInternalError) && retries < maxRetries) {
        const delay = initialDelay * Math.pow(2, retries);
        if (onRetry) onRetry(retries + 1, delay, error);
        console.warn(`${isQuotaError ? 'Quota exceeded' : 'Internal error'}. Retrying in ${delay}ms... (Attempt ${retries + 1}/${maxRetries})`);
        await sleep(delay);
        retries++;
        continue;
      }
      throw error;
    }
  }
}

export default function App() {
  // State
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: INITIAL_STATE,
    future: [],
  });
  const [zoom, setZoom] = useState(100);
  const [isSticky, setIsSticky] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [showWarningModal, setShowWarningModal] = useState<{ message: string, onConfirm?: () => void } | null>(null);
  const [scriptToDelete, setScriptToDelete] = useState<string | null>(null);
  const [viewingSceneId, setViewingSceneId] = useState<string | null>(null);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editingScriptTitle, setEditingScriptTitle] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const headerRef = useRef<HTMLDivElement>(null);

  const t = translations[history.present.language];

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const updateState = (newState: Partial<ProjectState>) => {
    setHistory(prev => ({
      past: [prev.present, ...prev.past].slice(0, 50),
      present: { ...prev.present, ...newState },
      future: [],
    }));
  };

  const undo = () => {
    if (history.past.length === 0) return;
    const previous = history.past[0];
    const newPast = history.past.slice(1);
    setHistory(prev => ({
      past: newPast,
      present: previous,
      future: [prev.present, ...prev.future],
    }));
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    setHistory(prev => ({
      past: [prev.present, ...prev.past],
      present: next,
      future: newFuture,
    }));
  };

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateState({ projectName: e.target.value });
  };

  // Helpers
  const activeScript = history.present.scripts.find(s => s.id === history.present.activeScriptId) || null;
  const viewingScene = activeScript?.scenes.find(s => s.id === viewingSceneId) || null;

  const updateActiveScript = useCallback((updates: Partial<Script>) => {
    setHistory(prev => {
      if (!prev.present.activeScriptId) return prev;
      const newScripts = prev.present.scripts.map(s => 
        s.id === prev.present.activeScriptId ? { ...s, ...updates } : s
      );
      return {
        ...prev,
        past: [prev.present, ...prev.past].slice(0, 50),
        present: { ...prev.present, scripts: newScripts },
        future: [],
      };
    });
  }, []);

  const handleAddScript = () => {
    const newScript: Script = {
      id: Math.random().toString(36).substr(2, 9),
      title: t.newScript,
      createdAt: Date.now(),
      scenes: [],
      stylePrompt: '',
      characters: [],
      products: [],
    };
    updateState({ 
      scripts: [...history.present.scripts, newScript],
      activeScriptId: newScript.id,
      activeTab: 'scenes'
    });
  };

  const handleDeleteScript = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setScriptToDelete(id);
  };

  const confirmDeleteScript = () => {
    if (!scriptToDelete) return;
    const newScripts = history.present.scripts.filter(s => s.id !== scriptToDelete);
    updateState({ 
      scripts: newScripts,
      activeScriptId: history.present.activeScriptId === scriptToDelete ? null : history.present.activeScriptId
    });
    setScriptToDelete(null);
  };

  const handleStartEditScript = (script: Script, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingScriptId(script.id);
    setEditingScriptTitle(script.title);
  };

  const handleSaveEditScript = () => {
    if (!editingScriptId) return;
    const newScripts = history.present.scripts.map(s => 
      s.id === editingScriptId ? { ...s, title: editingScriptTitle } : s
    );
    updateState({ scripts: newScripts });
    setEditingScriptId(null);
  };

  const handleSelectScript = (id: string) => {
    updateState({ activeScriptId: id, activeTab: 'scenes' });
  };

  // Generation Logic
  const generateStylePrompt = async (type: 'script' | 'image', source?: string) => {
    if (!activeScript) return;
    
    try {
      const currentApiKey = history.present.userApiKey || process.env.GEMINI_API_KEY;
      if (!currentApiKey) {
        showToast("GEMINI_API_KEY is not configured in the environment.", 'error');
        return;
      }
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      
      let prompt = "";
      const parts: any[] = [];

      if (type === 'script') {
        const scriptContent = activeScript.scenes.map(s => s.script).join('\n');
        prompt = `Dựa trên kịch bản sau đây, hãy viết một prompt mô tả phong cách vẽ ảnh (style prompt) phù hợp nhất để minh họa cho kịch bản này. 
        Phong cách cần độc đáo, nghệ thuật và nhất quán.
        
        KỊCH BẢN:
        ${scriptContent}
        
        YÊU CẦU ĐẦU RA:
        Chỉ trả về nội dung prompt mô tả phong cách, không thêm bất kỳ lời giải thích nào khác. Prompt nên bao gồm các yếu tố: phong cách nghệ thuật, ánh sáng, màu sắc, độ chi tiết, và cảm xúc chủ đạo.`;
      } else if (type === 'image' && source) {
        prompt = `Hãy phân tích phong cách nghệ thuật của hình ảnh này và viết một prompt mô tả phong cách vẽ đó để tôi có thể sử dụng cho các hình ảnh khác cùng bộ sưu tập.
        Tập trung vào: kỹ thuật vẽ, bảng màu, cách xử lý ánh sáng, độ tương phản, và các đặc điểm nhận dạng phong cách.
        
        YÊU CẦU ĐẦU RA:
        Chỉ trả về nội dung prompt mô tả phong cách, không thêm bất kỳ lời giải thích nào khác.`;
        parts.push({ inlineData: { data: source.split(',')[1], mimeType: "image/png" } });
      }

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts }
      });

      if (response.text) {
        updateActiveScript({ stylePrompt: response.text.trim() });
        showToast("Đã tạo mô tả phong cách thành công", 'success');
      }
    } catch (err) {
      console.error("Style generation failed:", err);
      showToast("Không thể tạo mô tả phong cách. Vui lòng thử lại.", 'error');
    }
  };

  const stopGeneration = (sceneId: string) => {
    if (abortControllersRef.current[sceneId]) {
      abortControllersRef.current[sceneId].abort();
      delete abortControllersRef.current[sceneId];
    }
    setHistory(prev => {
      if (!prev.present.activeScriptId) return prev;
      const newScripts = prev.present.scripts.map(s => {
        if (s.id === prev.present.activeScriptId) {
          return {
            ...s,
            scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, isGenerating: false, progress: 0 } : sc)
          };
        }
        return s;
      });
      return { ...prev, present: { ...prev.present, scripts: newScripts } };
    });
  };

  const generateImage = async (sceneId: string, customPrompt?: string, baseImageUrl?: string, previousHistory: string[] = []) => {
    if (!activeScript) return;
    const scene = activeScript.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Create abort controller for this generation
    const controller = new AbortController();
    abortControllersRef.current[sceneId] = controller;

    // Timeout after 60 seconds
    const timeoutId = setTimeout(() => {
      if (abortControllersRef.current[sceneId]) {
        console.warn(`Generation timed out for scene ${sceneId}`);
        controller.abort("Timeout");
      }
    }, 60000);

    // Always keep the original context description as the foundation
    const baseContext = scene.contextDescription;
    // The refinement prompt (from "Common Errors" or user input)
    const refinementPrompt = customPrompt || "";

    // Check if we have any reference image in the project if this scene is empty
    const hasAnyImage = activeScript.scenes.some(s => s.imageUrl);
    const hasAssets = scene.characterIds.length > 0 || scene.productIds.length > 0;

    if (!hasAnyImage && !hasAssets && !baseImageUrl) {
      const firstCP = activeScript.scenes.find(s => s.characterIds.length > 0 && s.productIds.length > 0);
      const firstAsset = activeScript.scenes.find(s => s.characterIds.length > 0 || s.productIds.length > 0);
      
      const targetX = firstCP ? firstCP.sceneName : (firstAsset ? firstAsset.sceneName : null);
      
      if (targetX) {
        setShowWarningModal({ message: `${t.importantNote}: ${targetX}` });
      } else {
        setShowWarningModal({ message: t.selectCharacter + " & " + t.selectProduct });
      }
      return;
    }

    // Update generating state
    const setGenerating = (isGen: boolean, prog: number, error?: string) => {
      setHistory(prev => {
        if (!prev.present.activeScriptId) return prev;
        const newScripts = prev.present.scripts.map(s => {
          if (s.id === prev.present.activeScriptId) {
            return {
              ...s,
              scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, isGenerating: isGen, progress: prog, error } : sc)
            };
          }
          return s;
        });
        return { ...prev, present: { ...prev.present, scripts: newScripts } };
      });
    };

    const currentApiKey = history.present.userApiKey || process.env.GEMINI_API_KEY;
    if (!currentApiKey) {
      showToast("GEMINI_API_KEY is not configured in the environment.", 'error');
      return;
    }

    setGenerating(true, 0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setHistory(prev => {
        const script = prev.present.scripts.find(s => s.id === prev.present.activeScriptId);
        if (!script) return prev;
        const scene = script.scenes.find(s => s.id === sceneId);
        if (!scene || !scene.isGenerating || (scene.progress || 0) >= 90) return prev;
        
        const newScripts = prev.present.scripts.map(s => {
          if (s.id === prev.present.activeScriptId) {
            return {
              ...s,
              scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, progress: (sc.progress || 0) + 10 } : sc)
            };
          }
          return s;
        });
        return { ...prev, present: { ...prev.present, scripts: newScripts } };
      });
    }, 500);

    try {
      const currentApiKey = history.present.userApiKey || process.env.GEMINI_API_KEY;
      if (!currentApiKey) {
        showToast("GEMINI_API_KEY is not configured in the environment.", 'error');
        setGenerating(false, 0);
        return;
      }
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      
      const parts: any[] = [];
      
      // Cinematic Camera Angles Logic
      const cameraAngles = [
        "góc sau vai nhân vật (over-the-shoulder shot) thấy cận cảnh hành động",
        "góc từ dưới gầm bàn chụp ra thấy rõ hành động và biểu cảm",
        "góc chụp từ trên xuống ở độ xa trung bình (high angle shot)",
        "góc chụp cao từ flycam xuống (bird's eye view)",
        "góc cận cảnh chỉ thấy bàn tay đang làm việc (extreme close-up)",
        "góc sau lưng từ trên xuống (high back angle)",
        "góc từ dưới lên (low angle shot)",
        "góc nhìn qua cửa sổ hoặc khung cửa (framed shot)",
        "góc nghiêng nghệ thuật (dutch angle)",
        "góc cận sát mặt biểu cảm (close-up shot)"
      ];

      const sceneIdx = activeScript.scenes.findIndex(s => s.id === sceneId);
      const prev2Scenes = activeScript.scenes.slice(Math.max(0, sceneIdx - 2), sceneIdx);
      
      // Simple heuristic to pick a different angle
      // In a real app, we might store the angle used in the scene metadata
      // For now, we'll just instruct the AI to be diverse
      let cameraInstruction = "Hãy sử dụng một góc quay điện ảnh nghệ thuật và độc đáo. ";
      if (prev2Scenes.length > 0) {
        cameraInstruction += "Đảm bảo góc quay này khác biệt hoàn toàn so với các phân cảnh trước đó để tạo sự đa dạng thị giác. ";
      }
      cameraInstruction += `Gợi ý các góc quay: ${cameraAngles.join(', ')}.`;

      // 1. Base Prompt with Strict Syntax
      const stylePart = activeScript.stylePrompt 
        ? `Hãy vẽ lại nhân vật tôi gửi, với chính xác ngoại hình, trang phục nhưng customize theo phong cách: ${activeScript.stylePrompt}`
        : "Hãy vẽ lại hình ảnh dựa trên mô tả.";

      let fullPrompt = `*YÊU CẦU QUAN TRỌNG (BẮT BUỘC TUÂN THỦ TUYỆT ĐỐI):
1. THAM CHIẾU CHÍNH XÁC 100% SẢN PHẨM: Nếu có sản phẩm đi kèm trong REFERENCE ASSETS, hãy vẽ chính xác 100% hình dáng, màu sắc và đặc biệt là CÁC NỘI DUNG VĂN BẢN (TEXT) trên sản phẩm đó. Không được làm sai lệch, mờ nhòe hay thay đổi bất kỳ ký tự nào trên sản phẩm.
2. Chỉ sử dụng hình ảnh tôi cung cấp để lấy thông tin về ngoại hình và trang phục của nhân vật. 
3. Toàn bộ bối cảnh, môi trường và hành động phải được tạo ra hoàn toàn dựa trên văn bản prompt dưới đây. 
4. Không được sao chép hay tái sử dụng bối cảnh từ hình ảnh gốc.

${stylePart}

*BỐI CẢNH CHÍNH CỦA PHÂN CẢNH: ${baseContext}*

${refinementPrompt ? `\n\nYÊU CẦU TINH CHỈNH BỔ SUNG (ƯU TIÊN SAU BỐI CẢNH CHÍNH): ${refinementPrompt}` : ""}

${cameraInstruction}

HƯỚNG DẪN ĐẦU RA: Không viết bất kỳ văn bản, tiêu đề hay mô tả nào bên ngoài hình ảnh. Toàn bộ phản hồi của bạn phải chỉ là hình ảnh được tạo ra.*`;

      // 2. Add Base Image for Refinement (if provided)
      if (baseImageUrl) {
        fullPrompt += "\n\nREFINE THIS IMAGE: Modify the provided image based on the prompt. Keep the overall composition, character identity, and style consistent. Only change the specific elements mentioned in the prompt.";
        const baseData = await fetch(baseImageUrl).then(r => r.blob()).then(b => {
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(b);
          });
        });
        parts.push({ inlineData: { data: baseData, mimeType: "image/png" } });
      }
      
      // 3. Add Character/Product Context
      const selectedChars = activeScript.characters.filter(c => scene.characterIds.includes(c.id));
      const selectedProds = activeScript.products.filter(p => scene.productIds.includes(p.id));

      if (selectedChars.length > 0 || selectedProds.length > 0) {
        fullPrompt += "\n\nREFERENCE ASSETS:";
        selectedChars.forEach(c => {
          fullPrompt += `\n- Character "${c.name}": ${c.description}`;
          // Limit to 2 reference images per character to avoid payload issues
          c.images.slice(0, 2).forEach(img => {
            parts.push({ inlineData: { data: img.split(',')[1], mimeType: "image/png" } });
          });
        });
        selectedProds.forEach(p => {
          fullPrompt += `\n- Product "${p.name}": ${p.description}`;
          // Limit to 2 reference images per product to avoid payload issues
          p.images.slice(0, 2).forEach(img => {
            parts.push({ inlineData: { data: img.split(',')[1], mimeType: "image/png" } });
          });
        });
      }

      // 4. Style Reference (if any and not refining)
      if (!baseImageUrl) {
        const refScene = activeScript.scenes.find(s => s.imageUrl && (s.characterIds.length > 0 || s.productIds.length > 0));
        if (refScene?.imageUrl) {
          fullPrompt += "\n\nMaintain the same visual style, lighting, and color palette as the reference image provided.";
          const refData = await fetch(refScene.imageUrl).then(r => r.blob()).then(b => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(b);
            });
          });
          parts.push({ inlineData: { data: refData, mimeType: "image/png" } });
        }
      }

      // 5. Context from previous scenes
      const prevScenes = activeScript.scenes.slice(Math.max(0, sceneIdx - 3), sceneIdx);
      const nextScenes = activeScript.scenes.slice(sceneIdx + 1, sceneIdx + 4);
      
      fullPrompt += "\n\nSTORY CONTEXT:";
      fullPrompt += "\nPREVIOUS SCENES (Maintain consistency in character appearance, clothing, and environment if location is the same):";
      prevScenes.forEach(ps => {
        fullPrompt += `\n- Scene ${ps.sceneName}: ${ps.contextDescription}`;
      });
      fullPrompt += "\nNEXT SCENES (FOR CONTEXT):";
      nextScenes.forEach(ns => {
        fullPrompt += `\n- Scene ${ns.sceneName}: ${ns.contextDescription}`;
      });

      fullPrompt += "\n\nINSTRUCTIONS:";
      fullPrompt += "\n- IMPORTANT: Content inside double quotes (e.g., \"object name\") is used ONLY to identify specific reference objects (characters or products) provided in the context. Do NOT render these names as text, labels, or watermarks within the image. Treat them as pointers to the visual reference data.";
      fullPrompt += "\n- Use the provided reference images as the SOLE visual source of truth for redrawing the character's face, features, and product details. The generated image must match the reference assets exactly in appearance.";
      fullPrompt += "\n- Ensure consistency in the environment if previous scenes were in the same location.";
      fullPrompt += "\n- Generate ONLY the image. Do NOT include any text, labels, or watermarks.";

      parts.push({ text: fullPrompt });

      // Determine Aspect Ratio
      let aspectRatio = "16:9";
      const supportedARs = ["1:1", "3:4", "4:3", "9:16", "16:9"];
      const arMatch = scene.contextDescription.match(/(\d+:\d+)/);
      if (arMatch && supportedARs.includes(arMatch[1])) {
        aspectRatio = arMatch[1];
      }

      const response = await retryWithBackoff(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any
          }
        }
      }), 3, 2000, controller.signal, (attempt, delay) => {
        console.log(`Retrying generation for scene ${sceneId}: attempt ${attempt}, delay ${delay}ms`);
        // We could update the progress or show a "Retrying..." message here if we had a dedicated field
      });

      // Check if still generating for this scene
      if (controller.signal.aborted) {
        clearInterval(progressInterval);
        return;
      }

      let imageUrl = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        clearTimeout(timeoutId);
        const newVersion: ImageVersion = {
          id: Math.random().toString(36).substr(2, 9),
          url: imageUrl,
          timestamp: Date.now(),
          prompt: fullPrompt,
          refineHistory: customPrompt ? [...previousHistory, customPrompt] : previousHistory
        };

        setHistory(prev => {
          if (!prev.present.activeScriptId) return prev;
          const newScripts = prev.present.scripts.map(s => {
            if (s.id === prev.present.activeScriptId) {
              const newScenes = s.scenes.map(sc => {
                if (sc.id === sceneId) {
                  const history = sc.imageHistory || [];
                  return { 
                    ...sc, 
                    imageUrl, 
                    imageHistory: [newVersion, ...history],
                    mainImageId: newVersion.id,
                    isGenerating: false,
                    progress: 100,
                    error: undefined
                  };
                }
                return sc;
              });
              return { ...s, scenes: newScenes };
            }
            return s;
          });
          return { ...prev, present: { ...prev.present, scripts: newScripts } };
        });
        clearInterval(progressInterval);
        delete abortControllersRef.current[sceneId];
      } else {
        throw new Error("No image generated");
      }

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.message === "Aborted" || err === "Timeout") {
        console.log("Generation aborted or timed out for scene:", sceneId);
        if (err === "Timeout") {
          showToast("Quá thời gian tạo ảnh. Vui lòng thử lại.", 'error');
          setGenerating(false, 0, "Timeout");
        }
        return;
      }
      console.error("Generation failed:", err);
      const errorStr = JSON.stringify(err);
      const isQuotaError = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED');

      clearInterval(progressInterval);
      delete abortControllersRef.current[sceneId];
      
      const errorMessage = isQuotaError 
        ? "Hết hạn mức sử dụng (Quota Exceeded). Vui lòng thử lại sau."
        : `${t.generationFailed}: ${err.message || "Lỗi không xác định"}`;

      setGenerating(false, 0, errorMessage);

      if (isQuotaError) {
        showToast("Hết hạn mức sử dụng (Quota Exceeded). Vui lòng thử lại sau.", 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    }
  };

  const generateAll = async () => {
    if (!activeScript) return;
    
    // Sort order: CP first, then C or P, then None
    const getQueue = () => {
      const currentScript = history.present.scripts.find(s => s.id === history.present.activeScriptId);
      if (!currentScript) return [];
      return [...currentScript.scenes].sort((a, b) => {
        const aScore = (a.characterIds.length > 0 ? 1 : 0) + (a.productIds.length > 0 ? 1 : 0);
        const bScore = (b.characterIds.length > 0 ? 1 : 0) + (b.productIds.length > 0 ? 1 : 0);
        return bScore - aScore;
      });
    };

    const queue = getQueue();
    if (queue.length === 0) return;

    for (const qItem of queue) {
      // Re-fetch the current scene state to see if it already has an image
      const currentScript = history.present.scripts.find(s => s.id === history.present.activeScriptId);
      const currentScene = currentScript?.scenes.find(s => s.id === qItem.id);
      
      if (currentScene && !currentScene.imageUrl) {
        await generateImage(currentScene.id);
        // Small delay between generations to allow state to settle and UI to breathe
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const setMainImage = (sceneId: string, versionId: string) => {
    if (!activeScript) return;
    const updatedScenes = activeScript.scenes.map(s => {
      if (s.id === sceneId) {
        const version = s.imageHistory.find(v => v.id === versionId);
        if (version) {
          return { ...s, imageUrl: version.url, mainImageId: versionId };
        }
      }
      return s;
    });
    updateActiveScript({ scenes: updatedScenes });
  };

  const deleteImageVersion = (sceneId: string, versionId: string) => {
    if (!activeScript) return;
    
    const updatedScenes = activeScript.scenes.map(s => {
      if (s.id === sceneId) {
        const newHistory = (s.imageHistory || []).filter(v => v.id !== versionId);
        let newImageUrl = s.imageUrl;
        let newMainId = s.mainImageId;
        
        if (s.mainImageId === versionId) {
          newMainId = newHistory[0]?.id || undefined;
          newImageUrl = newHistory[0]?.url || undefined;
        }
        
        return { 
          ...s, 
          imageHistory: newHistory, 
          imageUrl: newImageUrl, 
          mainImageId: newMainId 
        };
      }
      return s;
    });
    updateActiveScript({ scenes: updatedScenes });
  };

  const deleteRefineHistory = (sceneId: string, versionId: string, idx: number) => {
    if (!activeScript) return;
    const updatedScenes = activeScript.scenes.map(s => {
      if (s.id === sceneId) {
        const newHistory = s.imageHistory.map(v => {
          if (v.id === versionId) {
            const newRefine = [...(v.refineHistory || [])];
            newRefine.splice(idx, 1);
            return { ...v, refineHistory: newRefine };
          }
          return v;
        });
        return { ...s, imageHistory: newHistory };
      }
      return s;
    });
    updateActiveScript({ scenes: updatedScenes });
  };

  const upscaleImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  return (
    <div className="min-h-screen bg-[#f8faff] bg-glow selection:bg-[#3667c5]/20">
      {/* Header */}
      <header 
        ref={headerRef}
        className={cn(
          "w-full transition-all duration-500 z-40",
          isSticky 
            ? "fixed top-0 bg-white/70 backdrop-blur-md shadow-sm py-2" 
            : "relative bg-transparent py-4 md:py-6"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-[#3667c5] rounded-xl flex items-center justify-center shadow-lg shadow-[#3667c5]/20">
              <ImageIcon className="text-white w-5 h-5 md:w-6 md:h-6" />
            </div>
            <h1 className="text-base md:text-xl font-bold text-[#3667c5] tracking-tight uppercase">
              TẠO ẢNH TỪ KỊCH BẢN
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto justify-center sm:justify-end">
            <div className="h-6 w-px bg-gray-200 mx-1 md:mx-2" />
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowApiKeyModal(true)}
                className={cn(
                  "p-1.5 md:p-2 rounded-lg transition-all",
                  history.present.userApiKey ? "text-green-500 bg-green-50" : "text-[#3667c5] hover:bg-blue-50"
                )}
                title={t.apiKey}
              >
                <Key size={18} className="md:w-5 md:h-5" />
              </button>
              <div className="h-6 w-px bg-gray-200 mx-1 md:mx-2" />
              <button 
                onClick={undo} 
                disabled={!canUndo}
                className={cn("p-1.5 md:p-2 rounded-lg transition-colors", canUndo ? "text-[#3667c5] hover:bg-blue-50" : "text-gray-300")}
                title={`${t.undo} (Ctrl+Z)`}
              >
                <Undo2 size={18} className="md:w-5 md:h-5" />
              </button>
              <button 
                onClick={redo} 
                disabled={!canRedo}
                className={cn("p-1.5 md:p-2 rounded-lg transition-colors", canRedo ? "text-[#3667c5] hover:bg-blue-50" : "text-gray-300")}
                title={`${t.redo} (Ctrl+Shift+Z)`}
              >
                <Redo2 size={18} className="md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Zoom */}
      <main 
        className="transition-transform duration-200 origin-top"
        style={{ transform: `scale(${zoom / 100})` }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 md:gap-8 mb-8 md:mb-12">
            {['home', 'assets', 'scenes', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => updateState({ activeTab: tab })}
                className={cn(
                  "px-4 py-2 md:px-6 md:py-2 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 uppercase tracking-wider",
                  history.present.activeTab === tab 
                    ? "bg-[#3667c5] text-white shadow-lg shadow-[#3667c5]/30" 
                    : "text-gray-500 hover:text-[#3667c5] hover:bg-white"
                )}
              >
                {tab === 'home' ? t.home : tab === 'assets' ? t.assets : tab === 'scenes' ? t.scenes : t.settings}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px] md:min-h-[600px] bg-white/50 backdrop-blur-sm rounded-[24px] md:rounded-[40px] shadow-2xl shadow-blue-900/5 p-4 sm:p-6 md:p-10 border border-white/40">
            {history.present.activeTab === 'home' && (
              <div className="space-y-6 md:space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-[#3667c5] tracking-tight uppercase">{t.scriptList}</h2>
                    <p className="text-[#3667c5] opacity-80 font-medium uppercase text-[10px] md:text-xs tracking-widest">{t.manageScripts}</p>
                  </div>
                  <button 
                    onClick={handleAddScript}
                    className="btn-primary flex items-center justify-center gap-2 px-6 py-3 md:px-8 md:py-4 rounded-xl md:rounded-2xl shadow-xl shadow-[#3667c5]/20"
                  >
                    <Plus size={18} className="md:w-5 md:h-5" />
                    {t.addScript}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.present.scripts.map((script) => (
                    <motion.div
                      key={script.id}
                      layoutId={script.id}
                      onClick={() => handleSelectScript(script.id)}
                      className={cn(
                        "group relative p-6 rounded-3xl border-2 transition-all duration-300 cursor-pointer overflow-hidden",
                        history.present.activeScriptId === script.id
                          ? "bg-white border-[#3667c5] shadow-xl shadow-blue-900/5"
                          : "bg-white/40 border-transparent hover:border-blue-100 hover:bg-white hover:shadow-lg"
                      )}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-blue-50 rounded-2xl text-[#3667c5]">
                          <FileText size={24} />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleStartEditScript(script, e)}
                            className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteScript(script.id, e)}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      {editingScriptId === script.id ? (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            value={editingScriptTitle}
                            onChange={(e) => setEditingScriptTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEditScript()}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3667c5] outline-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={handleSaveEditScript} className="flex-1 py-2 bg-[#3667c5] text-white rounded-xl text-sm font-bold">{t.save}</button>
                            <button onClick={() => setEditingScriptId(null)} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold">{t.cancel}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold text-gray-800 mb-2 line-clamp-1">{script.title}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Clock size={14} />
                            {new Date(script.createdAt).toLocaleString(history.present.language === 'vi' ? 'vi-VN' : 'en-US')}
                          </div>
                        </>
                      )}

                      <div className="mt-6 flex items-center justify-between">
                        <div className="text-xs font-bold text-[#3667c5] bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider">
                          {script.scenes.length} {t.numScenes}
                        </div>
                        <div className="text-[#3667c5] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                          <Plus size={20} />
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {history.present.scripts.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mb-6 text-gray-300">
                        <FileText size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-400">{t.noScripts}</h3>
                      <p className="text-gray-400 mt-2">{t.createFirstScript}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {history.present.activeTab === 'assets' && (
              <div className="space-y-12">
                {!activeScript ? (
                  <div className="py-20 text-center">
                    <p className="text-gray-500">{t.selectScriptFirst}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 className="text-xl font-black text-[#3667c5] mb-6 uppercase tracking-widest">{t.characters}</h3>
                      <AssetManager 
                        type="character" 
                        items={activeScript.characters} 
                        language={history.present.language}
                        onUpdate={(chars) => updateActiveScript({ characters: chars as Character[] })} 
                        showToast={showToast}
                      />
                    </div>
                    <div className="h-px bg-blue-50" />
                    <div>
                      <h3 className="text-xl font-black text-[#3667c5] mb-6 uppercase tracking-widest">{t.products}</h3>
                      <AssetManager 
                        type="product" 
                        items={activeScript.products} 
                        language={history.present.language}
                        onUpdate={(prods) => updateActiveScript({ products: prods as Product[] })} 
                        showToast={showToast}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {history.present.activeTab === 'scenes' && (
              !activeScript ? (
                <div className="py-20 text-center">
                  <p className="text-gray-500">{t.selectScriptFirst}</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-white/80 backdrop-blur-md p-8 rounded-[32px] border border-blue-50 shadow-xl shadow-blue-900/5">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black text-[#3667c5] uppercase tracking-widest flex items-center gap-2">
                        <ImageIcon size={24} />
                        Mô tả phong cách vẽ
                      </h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => generateStylePrompt('script')}
                          className="px-4 py-2 bg-blue-50 text-[#3667c5] rounded-xl text-xs font-black hover:bg-blue-100 transition-all flex items-center gap-2"
                        >
                          <RefreshCw size={14} />
                          Tạo từ kịch bản
                        </button>
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                generateStylePrompt('image', evt.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            };
                            input.click();
                          }}
                          className="px-4 py-2 bg-blue-50 text-[#3667c5] rounded-xl text-xs font-black hover:bg-blue-100 transition-all flex items-center gap-2"
                        >
                          <ImageIcon size={14} />
                          Phân tích từ ảnh
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={activeScript.stylePrompt}
                      onChange={(e) => updateActiveScript({ stylePrompt: e.target.value })}
                      placeholder="Nhập mô tả phong cách vẽ tại đây (ví dụ: phong cách hoạt hình 3D, ánh sáng điện ảnh, màu sắc rực rỡ...)"
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#3667c5] outline-none h-32 resize-none transition-all font-medium leading-relaxed"
                    />
                  </div>

                  <SceneManager 
                    scenes={activeScript.scenes}
                    characters={activeScript.characters}
                    products={activeScript.products}
                    stylePrompt={activeScript.stylePrompt}
                    language={history.present.language}
                    onUpdate={(scenes) => updateActiveScript({ scenes })}
                    onStylePromptChange={(style) => updateActiveScript({ stylePrompt: style })}
                    onGenerate={generateImage}
                    onGenerateAll={generateAll}
                    onStop={stopGeneration}
                    onViewImage={(scene) => setViewingSceneId(scene.id)}
                    onDeleteScene={(sceneId) => {
                      const newScenes = activeScript.scenes.filter(s => s.id !== sceneId);
                      // Re-index scene names if they have a numeric part
                      const reindexed = newScenes.map((s, i) => {
                        const match = s.sceneName.match(/^(.*?)(\d+)(.*)$/);
                        if (match) {
                          return {
                            ...s,
                            sceneName: `${match[1]}${i + 1}${match[3]}`
                          };
                        }
                        return {
                          ...s,
                          sceneName: (i + 1).toString()
                        };
                      });
                      updateActiveScript({ scenes: reindexed });
                    }}
                  />
                </div>
              )
            )}

            {history.present.activeTab === 'settings' && (
              <div className="space-y-12 max-w-2xl mx-auto">
                <div className="space-y-8">
                  {/* Language Selection */}
                  <div className="space-y-6">
                    <label className="text-sm font-black text-[#3667c5] uppercase tracking-widest block text-center">{t.selectLanguage}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[
                        { id: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
                        { id: 'en', label: 'English', flag: '🇺🇸' },
                        { id: 'zh', label: '中文', flag: '🇨🇳' },
                        { id: 'th', label: 'ไทย', flag: '🇹🇭' },
                        { id: 'ja', label: '日本語', flag: '🇯🇵' },
                        { id: 'ko', label: '한국어', flag: '🇰🇷' },
                      ].map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => updateState({ language: lang.id as any })}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-2xl font-bold transition-all border-2",
                            history.present.language === lang.id
                              ? "bg-[#3667c5] text-white border-[#3667c5] shadow-lg shadow-blue-900/20"
                              : "bg-white text-gray-600 border-gray-100 hover:border-blue-200"
                          )}
                        >
                          <span className="text-2xl">{lang.flag}</span>
                          <span className="text-sm">{lang.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-blue-50 my-8" />

                  <div className="space-y-6">
                    <div className="flex flex-col items-center gap-2">
                      <label className="text-sm font-black text-[#3667c5] uppercase tracking-widest block text-center">{t.apiKey}</label>
                      <p className="text-xs text-gray-500 text-center max-w-md">{t.apiKeyNote}</p>
                    </div>
                    <div className="relative">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400">
                        <Key size={18} />
                      </div>
                      <input 
                        type="password"
                        value={history.present.userApiKey || ''}
                        onChange={(e) => updateState({ userApiKey: e.target.value })}
                        placeholder={t.apiKeyPlaceholder}
                        className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#3667c5] outline-none transition-all font-medium shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </main>

      {/* Modals */}
      <AnimatePresence>
        {viewingScene && (
          <ImageModal 
            scene={viewingScene}
            onClose={() => setViewingSceneId(null)}
            onRegenerate={(prompt, baseImageUrl) => {
              const currentVersion = viewingScene.imageHistory?.find(v => v.url === baseImageUrl);
              generateImage(viewingScene.id, prompt, baseImageUrl, currentVersion?.refineHistory || []);
            }}
            onStop={stopGeneration}
            onSetMainImage={(versionId) => setMainImage(viewingScene.id, versionId)}
            onDeleteVersion={(versionId) => deleteImageVersion(viewingScene.id, versionId)}
            onDeleteRefineHistory={(versionId, idx) => deleteRefineHistory(viewingScene.id, versionId, idx)}
            onDownload={async (highRes) => {
              const currentVersion = viewingScene.imageHistory?.find(v => v.id === viewingSceneId);
              let url = currentVersion?.url || viewingScene.imageUrl!;
              if (highRes) {
                url = await upscaleImage(url);
              }
              const link = document.createElement('a');
              link.href = url;
              link.download = `${viewingScene.sceneName}.png`;
              link.click();
            }}
            onDownloadVersion={async (url, name, highRes) => {
              let finalUrl = url;
              if (highRes) {
                finalUrl = await upscaleImage(url);
              }
              const link = document.createElement('a');
              link.href = finalUrl;
              link.download = `${viewingScene.sceneName}.png`;
              link.click();
            }}
          />
        )}

        {/* Toast Container */}
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 pointer-events-none w-full max-w-md px-4">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={cn(
                  "pointer-events-auto flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-md",
                  toast.type === 'success' ? "bg-white/90 border-green-100 text-green-800" :
                  toast.type === 'error' ? "bg-white/90 border-red-100 text-red-800" :
                  "bg-white/90 border-blue-100 text-blue-800"
                )}
              >
                {toast.type === 'success' && <CheckCircle2 size={20} className="text-green-500 shrink-0" />}
                {toast.type === 'error' && <AlertCircle size={20} className="text-red-500 shrink-0" />}
                {toast.type === 'info' && <Info size={20} className="text-blue-500 shrink-0" />}
                <p className="text-sm font-bold leading-tight">{toast.message}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {showWarningModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWarningModal(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="text-amber-500 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 mb-4">{t.importantNote}</h3>
              <p className="text-gray-500 leading-relaxed mb-8">{showWarningModal.message}</p>
              <button 
                onClick={() => {
                  if (showWarningModal.onConfirm) showWarningModal.onConfirm();
                  setShowWarningModal(null);
                }}
                className="w-full btn-primary py-4 font-bold text-lg"
              >
                {t.understand}
              </button>
            </motion.div>
          </div>
        )}

        {showApiKeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowApiKeyModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10"
            >
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Key className="text-[#3667c5] w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 mb-2 text-center">{t.apiKey}</h3>
              <p className="text-gray-500 text-sm mb-8 text-center">{t.apiKeyNote}</p>
              
              <div className="space-y-4">
                <input 
                  type="password"
                  value={history.present.userApiKey || ''}
                  onChange={(e) => updateState({ userApiKey: e.target.value })}
                  placeholder={t.apiKeyPlaceholder}
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#3667c5] outline-none transition-all font-medium"
                />
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-full btn-primary py-4 font-bold text-lg"
                >
                  {t.save}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {scriptToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setScriptToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-800 mb-4">{t.confirmDeleteScript}</h3>
              <p className="text-gray-500 leading-relaxed mb-8">
                {history.present.scripts.find(s => s.id === scriptToDelete)?.title}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setScriptToDelete(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold text-lg hover:bg-gray-200 transition-colors"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={confirmDeleteScript}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold text-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20"
                >
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Zoom Reset Indicator */}
      {zoom !== 100 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-6 z-50"
        >
          <button 
            onClick={() => setZoom(100)}
            className="flex items-center gap-2 bg-[#3667c5] text-white px-4 py-2 rounded-full shadow-lg hover:scale-105 transition-transform text-sm font-bold"
          >
            <RotateCcw size={16} />
            {zoom}% - Reset
          </button>
        </motion.div>
      )}

      {/* Background Glow Elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3667c5]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3667c5]/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
