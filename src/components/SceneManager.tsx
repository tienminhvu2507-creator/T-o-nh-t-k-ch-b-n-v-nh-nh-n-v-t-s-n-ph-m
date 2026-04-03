import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Play, Layers, User, Package, Image as ImageIcon, RefreshCw, Download, Maximize2, X, Star, CheckCircle2, FileSpreadsheet, HelpCircle, Trash2, AlertCircle } from 'lucide-react';
import { Scene, Character, Product } from '../types';
import { cn } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

import { translations, type Language } from '../translations';

interface Props {
  scenes: Scene[];
  characters: Character[];
  products: Product[];
  stylePrompt: string;
  language: Language;
  isTranslating: boolean;
  translationProgress: number;
  onUpdate: (scenes: Scene[]) => void;
  onStylePromptChange: (style: string) => void;
  onGenerate: (sceneId: string) => void;
  onGenerateAll: () => void;
  onTranslate: (lang: Language) => void;
  onViewImage: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
  onStop: (sceneId: string) => void;
}

export const SceneManager: React.FC<Props> = ({ 
  scenes, 
  characters, 
  products, 
  stylePrompt,
  language,
  isTranslating,
  translationProgress,
  onUpdate, 
  onStylePromptChange,
  onGenerate, 
  onGenerateAll,
  onTranslate,
  onViewImage,
  onDeleteScene,
  onStop
}) => {
  const t = translations[language];
  const [selectionModal, setSelectionModal] = useState<{
    sceneId: string;
    type: 'character' | 'product';
  } | null>(null);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [insertAfterId, setInsertAfterId] = useState<string | 'end'>('end');
  const [showTranslateDropdown, setShowTranslateDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectionModal) {
      const scene = scenes.find(s => s.id === selectionModal.sceneId);
      if (scene) {
        const field = selectionModal.type === 'character' ? 'characterIds' : 'productIds';
        setTempSelectedIds([...(scene[field] as string[])]);
      }
    }
  }, [selectionModal, scenes]);

  const handleConfirmSelection = () => {
    if (!selectionModal) return;
    const field = selectionModal.type === 'character' ? 'characterIds' : 'productIds';
    updateScene(selectionModal.sceneId, field, tempSelectedIds);
    setSelectionModal(null);
  };

  const toggleTempSelection = (itemId: string) => {
    if (itemId === 'none') {
      setTempSelectedIds([]);
      return;
    }

    setTempSelectedIds(prev => {
      const index = prev.indexOf(itemId);
      if (index > -1) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Skip header row
      const rows = data.slice(1);
      
      const defaultChars = characters.filter(c => c.isDefault).map(c => c.id);
      const defaultProds = products.filter(p => p.isDefault).map(p => p.id);

      const newScenes: Scene[] = rows.map((row, index) => {
        const sceneName = String(row[0] || '');
        const script = String(row[1] || '');
        const promptName = String(row[2] || '');
        const contextDescription = String(row[3] || '');

        // Logic for auto-selection
        const hasC = sceneName.toUpperCase().includes('C') || sceneName.toUpperCase().includes('CP');
        const hasP = sceneName.toUpperCase().includes('P') || sceneName.toUpperCase().includes('CP');

        return {
          id: Math.random().toString(36).substr(2, 9),
          sceneName,
          script,
          promptName,
          contextDescription,
          characterIds: hasC ? defaultChars : [],
          productIds: hasP ? defaultProds : [],
          imageHistory: [],
        };
      });

      onUpdate(newScenes);
    };
    reader.readAsBinaryString(file);
  };

  const handleExportExcel = () => {
    const data = [
      ['Scene', t.scene, t.promptName, t.contextDescription],
      ...scenes.map(s => [s.sceneName, s.script, s.promptName, s.contextDescription])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scenes");
    XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    XLSX.writeFile(wb, "kich-ban.xlsx");
  };

  const handleAddScene = () => {
    const defaultChar = characters.find(c => c.isDefault);
    const defaultProd = products.find(p => p.isDefault);
    
    const newScene: Scene = {
      id: Math.random().toString(36).substr(2, 9),
      sceneName: (scenes.length + 1).toString(),
      script: '',
      promptName: '',
      contextDescription: '',
      characterIds: defaultChar ? [defaultChar.id] : [],
      productIds: defaultProd ? [defaultProd.id] : [],
      imageHistory: [],
      progress: 0
    };

    if (insertAfterId === 'end') {
      onUpdate([...scenes, newScene]);
    } else {
      const index = scenes.findIndex(s => s.id === insertAfterId);
      const newScenes = [...scenes];
      newScenes.splice(index + 1, 0, newScene);
      
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
      onUpdate(reindexed);
    }
    setShowInsertModal(false);
  };

  const handleDownloadTemplate = () => {
    const data = [
      t.excelHeaders,
      ...t.excelInstructions.map(instruction => [instruction, '', '', ''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "mau-kich-ban.xlsx");
  };

  const handleCopyPrompt = () => {
    const prompt = t.promptText;
    
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateScene = (id: string, field: keyof Scene, value: any) => {
    onUpdate(scenes.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
          <Layers size={20} className="text-[#3667c5]" />
          {t.scriptTable}
        </h3>
        <div className="flex flex-wrap gap-2 md:gap-3 w-full lg:w-auto">
          <button 
            onClick={() => setShowExcelModal(true)}
            className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 border-amber-400 text-xs md:text-sm px-3 py-2 md:px-4 md:py-2"
          >
            <HelpCircle size={16} />
            <span className="hidden sm:inline">{t.excelTemplate}</span>
            <span className="sm:hidden">Template</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelUpload}
            accept=".xlsx, .xls"
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 border-green-500 text-xs md:text-sm px-3 py-2 md:px-4 md:py-2"
          >
            <FileSpreadsheet size={16} />
            <span className="hidden sm:inline">{t.uploadExcel}</span>
            <span className="sm:hidden">Upload</span>
          </button>
          <button 
            onClick={handleExportExcel}
            className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-xs md:text-sm px-3 py-2 md:px-4 md:py-2"
          >
            <Download size={16} />
            <span className="hidden sm:inline">{t.exportExcel}</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button onClick={onGenerateAll} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-400 text-xs md:text-sm px-3 py-2 md:px-4 md:py-2">
            <Play size={16} />
            <span className="hidden sm:inline">{t.generateAll}</span>
            <span className="sm:hidden">Run All</span>
          </button>
          
          <button onClick={() => setShowInsertModal(true)} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs md:text-sm px-3 py-2 md:px-4 md:py-2">
            <Plus size={16} />
            <span className="hidden sm:inline">{t.addScene}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden xl:block overflow-x-auto rounded-[32px] border border-blue-50 shadow-2xl shadow-blue-900/5 bg-white overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-blue-50/50 text-[#3667c5] text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="p-5 text-center w-24">
                <div className="flex items-center justify-center gap-1">
                  {t.stt}
                  <div className="group/tip relative">
                    <HelpCircle size={12} className="cursor-help text-blue-300" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-[10px] font-medium rounded-lg opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 normal-case tracking-normal">
                      {t.sceneTip}
                    </div>
                  </div>
                </div>
              </th>
              <th className="p-5 text-left w-32">{t.scene}</th>
              <th className="p-5 text-left w-32">
                <div className="flex items-center gap-1">
                  {t.promptName}
                  <div className="group/tip relative">
                    <HelpCircle size={12} className="cursor-help text-blue-300" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-[10px] font-medium rounded-lg opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 normal-case tracking-normal">
                      {t.promptTip}
                    </div>
                  </div>
                </div>
              </th>
              <th className="p-5 text-left min-w-[300px]">{t.contextDescription}</th>
              <th className="p-5 text-center w-32">{t.characters}</th>
              <th className="p-5 text-center w-32">{t.products}</th>
              <th className="p-5 text-center w-64">{t.image}</th>
              <th className="p-5 text-center w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {scenes.map((scene) => (
              <tr key={scene.id} className="hover:bg-blue-50/10 transition-colors group">
                <td className="p-5 text-center font-black text-gray-300 group-hover:text-[#3667c5] transition-colors">
                  <input
                    type="text"
                    value={scene.sceneName}
                    onChange={(e) => updateScene(scene.id, 'sceneName', e.target.value)}
                    className="w-full bg-transparent border-none text-center focus:ring-0 font-black"
                  />
                </td>
                <td className="p-5">
                  <textarea
                    value={scene.script}
                    onChange={(e) => updateScene(scene.id, 'script', e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-20 placeholder:text-gray-200 leading-relaxed"
                    placeholder={t.placeholderScript}
                  />
                </td>
                <td className="p-5">
                  <textarea
                    value={scene.promptName}
                    onChange={(e) => updateScene(scene.id, 'promptName', e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-20 placeholder:text-gray-200 leading-relaxed font-bold"
                    placeholder={t.placeholderPrompt}
                  />
                </td>
                <td className="p-5">
                  <textarea
                    value={scene.contextDescription}
                    onChange={(e) => updateScene(scene.id, 'contextDescription', e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-20 placeholder:text-gray-200 leading-relaxed"
                    placeholder={t.placeholderContext}
                  />
                </td>
                <td className="p-5 text-center">
                  <button 
                    onClick={() => setSelectionModal({ sceneId: scene.id, type: 'character' })}
                    className="w-full aspect-square bg-blue-50/50 rounded-2xl flex flex-col items-center justify-center gap-2 text-[#3667c5] hover:bg-[#3667c5] hover:text-white transition-all group/btn border border-blue-100/50"
                  >
                    <User size={20} className="group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      {scene.characterIds.length === 0 ? t.selectChar : `${scene.characterIds.length} ${t.charPrefix}`}
                    </span>
                  </button>
                </td>
                <td className="p-5 text-center">
                  <button 
                    onClick={() => setSelectionModal({ sceneId: scene.id, type: 'product' })}
                    className="w-full aspect-square bg-blue-50/50 rounded-2xl flex flex-col items-center justify-center gap-2 text-[#3667c5] hover:bg-[#3667c5] hover:text-white transition-all group/btn border border-blue-100/50"
                  >
                    <Package size={20} className="group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      {scene.productIds.length === 0 ? t.selectProd : `${scene.productIds.length} ${t.prodPrefix}`}
                    </span>
                  </button>
                </td>
                <td className="p-5 text-center">
                  <div className="flex flex-col items-center gap-2">
                    {scene.imageUrl ? (
                      <div className="relative group/img w-full aspect-video rounded-2xl overflow-hidden border border-blue-100 shadow-lg shadow-blue-900/5">
                        <img src={scene.imageUrl} className="w-full h-full object-cover block" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button onClick={() => onViewImage(scene)} className="p-2 bg-white rounded-xl text-[#3667c5] hover:scale-110 transition-transform shadow-xl">
                            <Maximize2 size={16} />
                          </button>
                          {scene.isGenerating ? (
                            <div className="p-2 bg-white rounded-xl text-[#3667c5] shadow-xl flex items-center justify-center">
                              <div className="relative flex flex-col items-center justify-center gap-1">
                                <RefreshCw size={16} className="animate-spin" />
                                <span className="text-[8px] font-black">{scene.progress || 0}%</span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onStop(scene.id);
                                  }}
                                  className="px-2 py-0.5 bg-red-500 text-white rounded-full text-[8px] font-black hover:bg-red-600 transition-all shadow-lg mt-1"
                                >
                                  DỪNG
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => onGenerate(scene.id)} 
                                className="p-2 bg-white rounded-xl text-[#3667c5] hover:scale-110 transition-transform shadow-xl flex items-center justify-center"
                              >
                                <RefreshCw size={16} />
                              </button>
                              {scene.error && (
                                <div className="p-2 bg-red-50 rounded-xl text-red-500 shadow-xl flex items-center justify-center group/err relative">
                                  <AlertCircle size={16} />
                                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-red-600 text-white text-[10px] rounded opacity-0 group-hover/err:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                    {scene.error}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      scene.isGenerating ? (
                        <div className={cn(
                          "w-full aspect-video rounded-2xl border-2 border-dashed border-blue-100 flex flex-col items-center justify-center text-blue-200 bg-blue-50/50 animate-pulse"
                        )}>
                          <div className="flex flex-col items-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-[#3667c5]" />
                            <span className="text-[10px] font-black text-[#3667c5]">{scene.progress || 0}%</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                onStop(scene.id);
                              }}
                              className="px-3 py-1 bg-red-500 text-white rounded-full text-[10px] font-black hover:bg-red-600 transition-all shadow-lg"
                            >
                              DỪNG LẠI
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 w-full">
                          <button 
                            onClick={() => onGenerate(scene.id)}
                            className="w-full aspect-video rounded-2xl border-2 border-dashed border-blue-100 flex flex-col items-center justify-center text-blue-200 hover:border-[#3667c5] hover:text-[#3667c5] hover:bg-blue-50/50 transition-all group/gen"
                          >
                            <ImageIcon size={24} className="group-hover/gen:scale-110 transition-transform" />
                            <span className="text-[10px] mt-2 font-black uppercase tracking-widest">{t.generateImage}</span>
                          </button>
                          {scene.error && (
                            <div className="flex items-center gap-1 text-red-500 text-[10px] font-bold px-2 text-center">
                              <AlertCircle size={12} className="flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{scene.error}</span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </td>
                <td className="p-5 text-center">
                  <button 
                    onClick={() => onDeleteScene(scene.id)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title={t.deleteScene}
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile/Tablet Card View */}
      <div className="xl:hidden space-y-4">
        {scenes.map((scene) => (
          <div key={scene.id} className="bg-white rounded-3xl border border-blue-50 shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#3667c5] bg-blue-50 px-2 py-1 rounded-lg uppercase">STT</span>
                <input
                  type="text"
                  value={scene.sceneName}
                  onChange={(e) => updateScene(scene.id, 'sceneName', e.target.value)}
                  className="w-12 bg-transparent border-none text-sm font-black focus:ring-0"
                />
              </div>
              <button 
                onClick={() => onDeleteScene(scene.id)}
                className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t.scene}</label>
                <textarea
                  value={scene.script}
                  onChange={(e) => updateScene(scene.id, 'script', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#3667c5] outline-none h-24 resize-none"
                  placeholder={t.placeholderScript}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t.promptName}</label>
                <textarea
                  value={scene.promptName}
                  onChange={(e) => updateScene(scene.id, 'promptName', e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#3667c5] outline-none h-24 resize-none font-bold"
                  placeholder={t.placeholderPrompt}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t.contextDescription}</label>
              <textarea
                value={scene.contextDescription}
                onChange={(e) => updateScene(scene.id, 'contextDescription', e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[#3667c5] outline-none h-24 resize-none"
                placeholder={t.placeholderContext}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setSelectionModal({ sceneId: scene.id, type: 'character' })}
                className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-[#3667c5] rounded-xl text-xs font-black uppercase tracking-wider border border-blue-100"
              >
                <User size={16} />
                {scene.characterIds.length === 0 ? t.selectChar : `${scene.characterIds.length} ${t.charPrefix}`}
              </button>
              <button 
                onClick={() => setSelectionModal({ sceneId: scene.id, type: 'product' })}
                className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-[#3667c5] rounded-xl text-xs font-black uppercase tracking-wider border border-blue-100"
              >
                <Package size={16} />
                {scene.productIds.length === 0 ? t.selectProd : `${scene.productIds.length} ${t.prodPrefix}`}
              </button>
            </div>

            <div className="relative aspect-video rounded-2xl overflow-hidden border border-blue-100 shadow-sm">
              {scene.imageUrl ? (
                <>
                  <img src={scene.imageUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center gap-4">
                    <button onClick={() => onViewImage(scene)} className="p-3 bg-white rounded-2xl text-[#3667c5] shadow-xl">
                      <Maximize2 size={20} />
                    </button>
                    {scene.isGenerating ? (
                      <div className="p-3 bg-white rounded-2xl text-[#3667c5] shadow-xl flex flex-col items-center justify-center gap-1">
                        <RefreshCw size={20} className="animate-spin" />
                        <span className="text-[8px] font-black">{scene.progress || 0}%</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onStop(scene.id);
                          }}
                          className="px-2 py-0.5 bg-red-500 text-white rounded-full text-[8px] font-black hover:bg-red-600 transition-all shadow-lg"
                        >
                          DỪNG
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => onGenerate(scene.id)} 
                          className="p-3 bg-white rounded-2xl text-[#3667c5] shadow-xl flex flex-col items-center justify-center gap-1"
                        >
                          <RefreshCw size={20} />
                        </button>
                        {scene.error && (
                          <div className="p-3 bg-red-50 rounded-2xl text-red-500 shadow-xl flex items-center justify-center group/err relative">
                            <AlertCircle size={20} />
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-red-600 text-white text-[10px] rounded opacity-0 group-hover/err:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                              {scene.error}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                scene.isGenerating ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-blue-200 bg-blue-50/30">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw size={32} className="animate-spin text-[#3667c5]" />
                      <span className="text-[10px] font-black text-[#3667c5]">{scene.progress || 0}%</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onStop(scene.id);
                        }}
                        className="px-4 py-1.5 bg-red-500 text-white rounded-full text-[10px] font-black hover:bg-red-600 transition-all shadow-lg"
                      >
                        DỪNG LẠI
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button 
                      onClick={() => onGenerate(scene.id)}
                      className="w-full h-full flex flex-col items-center justify-center text-blue-200 bg-blue-50/30"
                    >
                      <ImageIcon size={32} />
                      <span className="text-[10px] mt-2 font-black uppercase tracking-widest">{t.generateImage}</span>
                    </button>
                    {scene.error && (
                      <div className="flex items-center gap-1 text-red-500 text-[10px] font-bold px-2 text-center pb-2">
                        <AlertCircle size={12} className="flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{scene.error}</span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Selection Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectionModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectionModal(null)}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-6xl h-full bg-white rounded-[32px] md:rounded-[40px] shadow-2xl p-6 md:p-10 border border-gray-100 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-6 md:mb-10 flex-shrink-0">
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 rounded-[18px] md:rounded-[24px] flex items-center justify-center shadow-inner">
                      {selectionModal.type === 'character' ? <User className="text-[#3667c5]" size={24} /> : <Package className="text-[#3667c5]" size={24} />}
                    </div>
                    <div>
                      <h3 className="text-xl md:text-3xl font-black text-gray-800 uppercase tracking-tight">
                        {selectionModal.type === 'character' ? t.selectCharacter : t.selectProduct}
                      </h3>
                      <p className="text-[10px] md:text-xs text-[#3667c5] font-black uppercase tracking-[0.2em] opacity-60">{t.assetNote}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectionModal(null)} className="p-3 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={24} className="text-gray-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto pr-2 md:pr-4 custom-scrollbar flex-1 pb-6">
                  <button 
                    onClick={() => toggleTempSelection('none')}
                    className={cn(
                      "p-4 md:p-6 rounded-[24px] md:rounded-[32px] border-2 text-center transition-all flex flex-col items-center justify-center gap-2 md:gap-3 group/item h-full min-h-[140px] md:min-h-[180px]",
                      tempSelectedIds.length === 0
                        ? "bg-[#3667c5] text-white border-[#3667c5] shadow-2xl shadow-blue-900/30 scale-[1.02]"
                        : "bg-white text-gray-400 border-gray-100 hover:border-blue-200 hover:text-[#3667c5] hover:bg-blue-50/30"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex items-center justify-center transition-transform group-hover/item:scale-110",
                      tempSelectedIds.length === 0 ? "border-white" : "border-gray-200"
                    )}>
                      <X size={20} />
                    </div>
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.15em]">{t.noSelection}</span>
                  </button>

                  {(selectionModal.type === 'character' ? characters : products).map((item) => {
                    const isSelected = tempSelectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleTempSelection(item.id)}
                        className={cn(
                          "p-4 md:p-6 rounded-[24px] md:rounded-[32px] border-2 text-center transition-all flex flex-col items-center gap-2 md:gap-4 relative group/item overflow-hidden h-full min-h-[200px] md:min-h-[260px]",
                          isSelected
                            ? "bg-[#3667c5] text-white border-[#3667c5] shadow-2xl shadow-blue-900/30 scale-[1.02]"
                            : "bg-white text-gray-600 border-gray-100 hover:border-blue-200 hover:bg-blue-50/30"
                        )}
                      >
                        <div className="flex flex-col items-center gap-2 md:gap-3 w-full">
                          <div className="w-24 h-24 md:w-32 md:h-32 rounded-[18px] md:rounded-[24px] overflow-hidden bg-gray-100 border-4 border-white/20 flex-shrink-0 shadow-xl group-hover/item:scale-105 transition-transform">
                            {item.images[0] ? (
                              <img src={item.images[0]} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                {selectionModal.type === 'character' ? <User size={40} /> : <Package size={40} />}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2 md:top-3 md:right-3 bg-white text-[#3667c5] p-1 md:p-1.5 rounded-full shadow-lg z-10">
                              <CheckCircle2 size={16} fill="currentColor" className="text-white md:w-5 md:h-5" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 text-center w-full">
                          <p className={cn("text-sm md:text-base font-black break-words uppercase tracking-tight mb-1 px-2", isSelected ? "text-white" : "text-gray-800")}>
                            {item.name || t.placeholderName}
                          </p>
                          {item.isDefault && (
                            <div className="mb-2">
                              <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-0.5 rounded-full", isSelected ? "bg-white/20 text-white" : "bg-blue-50 text-[#3667c5]")}>
                                MẶC ĐỊNH
                              </span>
                            </div>
                          )}
                          {item.description && (
                            <p className={cn("text-[10px] line-clamp-2 leading-relaxed font-medium opacity-70 px-2", isSelected ? "text-white" : "text-gray-500")}>
                              {item.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 md:mt-10 flex-shrink-0">
                  <button 
                    onClick={handleConfirmSelection}
                    className="w-full py-4 md:py-6 bg-[#3667c5] text-white font-black text-sm md:text-lg rounded-[20px] md:rounded-[24px] shadow-2xl shadow-blue-900/30 uppercase tracking-[0.2em] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 md:gap-3"
                  >
                    <CheckCircle2 size={20} className="md:w-6 md:h-6" />
                    {t.confirmSelection}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Excel Template Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showExcelModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowExcelModal(null)}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl p-10 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                      <FileSpreadsheet className="text-amber-500" size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{t.excelTemplate}</h3>
                  </div>
                  <button onClick={() => setShowExcelModal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={24} className="text-gray-400" />
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <h4 className="text-sm font-black text-gray-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Download size={18} className="text-amber-500" />
                      1. {t.downloadTemplate}
                    </h4>
                    <p className="text-xs text-gray-500 mb-6 leading-relaxed font-medium">
                      Tải file Excel mẫu với cấu trúc chuẩn để nhập kịch bản nhanh chóng. File đã bao gồm các cột cần thiết và hướng dẫn chi tiết.
                    </p>
                    <button 
                      onClick={handleDownloadTemplate}
                      className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl shadow-lg shadow-amber-900/10 hover:bg-amber-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
                    >
                      <Download size={18} />
                      {t.downloadTemplate}
                    </button>
                  </div>

                  <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                    <h4 className="text-sm font-black text-[#3667c5] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <RefreshCw size={18} className="text-[#3667c5]" />
                      2. {t.promptDescription}
                    </h4>
                    <p className="text-xs text-gray-500 mb-6 leading-relaxed font-medium">
                      Sử dụng Prompt này với AI (như ChatGPT, Gemini) để chia nhỏ câu chuyện của bạn thành các phân cảnh ngắn phù hợp với kịch bản.
                    </p>
                    <div className="relative group">
                      <div className="w-full p-4 bg-white rounded-2xl border border-blue-100 text-[11px] text-gray-600 leading-relaxed italic max-h-[150px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                        {t.promptText}
                      </div>
                      <button 
                        onClick={handleCopyPrompt}
                        className="absolute top-2 right-2 p-2 bg-[#3667c5] text-white rounded-xl shadow-lg hover:scale-110 transition-transform flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                      >
                        {copied ? <CheckCircle2 size={14} /> : <Plus size={14} className="rotate-45" />}
                        {copied ? t.copied : t.copyPrompt}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Insert Scene Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showInsertModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowInsertModal(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">{t.addScene}</h3>
                  <button onClick={() => setShowInsertModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-black text-[#3667c5] uppercase tracking-widest">{t.insertAfter}</label>
                  <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    <button
                      onClick={() => setInsertAfterId('end')}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl text-left font-bold transition-all border-2",
                        insertAfterId === 'end' 
                          ? "bg-blue-50 border-[#3667c5] text-[#3667c5]" 
                          : "bg-gray-50 border-transparent hover:border-blue-100"
                      )}
                    >
                      {t.atEnd}
                    </button>
                    {scenes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setInsertAfterId(s.id)}
                        className={cn(
                          "w-full px-4 py-3 rounded-xl text-left font-bold transition-all border-2",
                          insertAfterId === s.id 
                            ? "bg-blue-50 border-[#3667c5] text-[#3667c5]" 
                            : "bg-gray-50 border-transparent hover:border-blue-100"
                        )}
                      >
                        {t.scene} {s.sceneName}: {s.script.substring(0, 30)}...
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={handleAddScene}
                    className="w-full btn-primary py-4 font-black text-base rounded-2xl shadow-xl shadow-blue-900/10 uppercase tracking-widest mt-4"
                  >
                    {t.addScene}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
