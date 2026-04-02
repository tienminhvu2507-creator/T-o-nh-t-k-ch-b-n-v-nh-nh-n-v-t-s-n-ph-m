import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, RefreshCw, Download, Send, Star, Trash2 } from 'lucide-react';
import { Scene } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../App';

interface Props {
  scene: Scene;
  onClose: () => void;
  onRegenerate: (prompt: string, baseImageUrl?: string) => void;
  onDownload: (highRes?: boolean) => void;
  onSetMainImage: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onDeleteRefineHistory: (versionId: string, idx: number) => void;
  onDownloadVersion: (url: string, name: string, highRes?: boolean) => void;
}

export const ImageModal: React.FC<Props> = ({ 
  scene, 
  onClose, 
  onRegenerate,
  onDownload,
  onSetMainImage,
  onDeleteVersion,
  onDeleteRefineHistory,
  onDownloadVersion
}) => {
  const [refinePrompt, setRefinePrompt] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(scene.mainImageId || (scene.imageHistory?.[0]?.id) || null);
  const [isEnlarged, setIsEnlarged] = useState(false);

  const commonErrors = [
    { 
      id: 'consistency', 
      label: 'Đồng nhất nhân vật', 
      prompt: 'Ảnh tạo ra chưa đồng nhất chính xác ngoại hình nhân vật tôi gửi. Xem lại chính xác các ảnh tôi gửi và sử dụng ngoại hình của nhân vật tôi gửi để sửa lại ảnh vừa tạo ra' 
    },
    { 
      id: 'style', 
      label: 'Sai phong cách', 
      prompt: 'Ảnh tạo ra vẽ không dựa trên mô tả phong cách. Đọc lại mô tả phong cách người dùng nhập trên ô mô tả phong cách hoặc mô tả phong cách được cài đặt sẵn trên app, bên cạnh đó cũng xem lại 3 ảnh đã tạo gần nhất trên app để phân tích chi tiết phong cách, sau đó sửa lại ảnh này cùng nội dung nhưng phong cách đã được chuẩn lại' 
    },
    { 
      id: 'angle', 
      label: 'Đổi góc độ', 
      prompt: 'Ảnh này vẽ ra có góc độ vẽ ảnh giống với ảnh trước đó hoặc ảnh sau đó. Hãy lựa chọn 1 góc độ khác với cả 2 ảnh đó để vẽ ảnh. Ví dụ: góc sau lưng nhân vật, góc qua vai nhân vật, góc cận cảnh hành động bàn tay, góc từ dưới lên, góc nghiêng cao, góc cao rộng toàn cảnh, góc cận sát mặt.' 
    },
    { 
      id: 'ratio', 
      label: 'Sai tỉ lệ ảnh', 
      prompt: 'Sửa lại ảnh này dựa trên 3 ảnh được tạo ra gần nhất của app và dựa trên các ảnh được người dùng up lên nếu có để đồng nhất tỉ lệ kích thước ảnh theo các ảnh trên nhưng với nội dung cũ' 
    },
    { 
      id: 'logic', 
      label: 'Chưa logic nội dung', 
      prompt: 'Đọc lại kịch bản (bao gồm cả những đoạn trước và sau đó) và đọc lại prompt vừa dùng để tạo ra ảnh để hình dung logic của kịch bản. Từ đó tinh chỉnh lại ảnh sao cho logic với nội dung, tránh trường hợp ảnh tạo ra khớp với prompt nhưng không liên quan gì tới nội dung' 
    },
    { 
      id: 'policy', 
      label: 'Lách chính sách', 
      prompt: 'Một số từ ngữ có thể vi phạm chính sách tạo ảnh. Thay vì tập trung vào ngôn từ hãy tập trung mô tả bối cảnh, vị trí, hành động, biểu cảm và các chi tiết trong ảnh để lách chính sách và nỗ lực tạo ra hình ảnh vẫn minh hoạ được cho nội dung nhưng không vi phạm chính sách.' 
    }
  ];

  const addErrorPrompt = (p: string) => {
    setRefinePrompt(prev => prev ? `${prev}\n${p}` : p);
  };

  const history = scene.imageHistory || [];

  React.useEffect(() => {
    if (selectedVersionId && !history.some(v => v.id === selectedVersionId)) {
      setSelectedVersionId(history[0]?.id || null);
    }
  }, [history, selectedVersionId]);

  const currentIndex = history.findIndex(v => v.id === selectedVersionId);
  const currentVersion = history[currentIndex];
  const currentImageUrl = currentVersion?.url || scene.imageUrl;

  const handleRegenerate = (prompt: string) => {
    onRegenerate(prompt, currentImageUrl);
    if (prompt) setRefinePrompt('');
  };

  const handlePrevVersion = () => {
    if (currentIndex < history.length - 1) {
      setSelectedVersionId(history[currentIndex + 1].id);
    }
  };

  const handleNextVersion = () => {
    if (currentIndex > 0) {
      setSelectedVersionId(history[currentIndex - 1].id);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-6xl h-full flex flex-col lg:flex-row bg-white rounded-[40px] overflow-hidden shadow-2xl"
      >
        {/* Image Section */}
        <div className="flex-1 bg-gray-100 relative group flex items-center justify-center overflow-hidden">
          {scene.isGenerating ? (
            <div className="flex flex-col items-center text-[#3667c5]">
              <div className="relative w-24 h-24 mb-6">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-blue-100 stroke-current"
                    strokeWidth="8"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                  ></circle>
                  <circle
                    className="text-[#3667c5] stroke-current transition-all duration-500"
                    strokeWidth="8"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * (scene.progress || 0)) / 100}
                    strokeLinecap="round"
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                  ></circle>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-xl">
                  {scene.progress || 0}%
                </div>
              </div>
              <p className="font-black tracking-widest animate-pulse uppercase">Đang tạo ảnh...</p>
            </div>
          ) : currentImageUrl ? (
            <img 
              src={currentImageUrl} 
              className={cn(
                "max-w-full max-h-full object-contain cursor-zoom-in transition-transform duration-300",
                isEnlarged ? "scale-150 z-50" : "scale-100"
              )}
              alt="Generated"
              onClick={() => setIsEnlarged(!isEnlarged)}
            />
          ) : (
            <div className="flex flex-col items-center text-gray-400">
              <RefreshCw size={48} className="animate-spin mb-4" />
              <p className="font-bold">KHÔNG CÓ ẢNH</p>
              <button 
                onClick={() => handleRegenerate('')}
                className="mt-4 px-6 py-2 bg-[#3667c5] text-white rounded-xl font-bold hover:bg-[#2d56a8] transition-all"
              >
                Tạo lại ảnh
              </button>
            </div>
          )}

          {/* Navigation */}
          {currentIndex < history.length - 1 && (
            <button 
              onClick={handlePrevVersion}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all shadow-xl"
            >
              <ChevronRight size={32} />
            </button>
          )}
          {currentIndex > 0 && (
            <button 
              onClick={handleNextVersion}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all shadow-xl"
            >
              <ChevronLeft size={32} />
            </button>
          )}
        </div>

        {/* Info Section */}
        <div className="w-full lg:w-[400px] bg-white p-8 flex flex-col border-l border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <div className="px-4 py-1 bg-blue-50 text-[#3667c5] rounded-full text-xs font-black">
              SCENE #{scene.sceneName}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X size={24} className="text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Phân cảnh</h4>
              <p className="text-sm text-gray-700 leading-relaxed italic">"{scene.script || 'Không có nội dung'}"</p>
            </div>
            
            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tên Prompt</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-bold">{scene.promptName || 'Không có tên prompt'}</p>
            </div>

            <div>
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Mô tả bối cảnh</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{scene.contextDescription || 'Không có mô tả bối cảnh'}</p>
            </div>

            {currentVersion?.prompt && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <h4 className="text-[10px] font-black text-[#3667c5] uppercase tracking-widest mb-2">Prompt đã dùng</h4>
                <p className="text-[11px] text-gray-600 leading-relaxed italic line-clamp-4">"{currentVersion.prompt}"</p>
              </div>
            )}

            {/* Command History */}
            {currentVersion?.refineHistory && currentVersion.refineHistory.length > 0 && (
              <div className="pt-4">
                <h4 className="text-[10px] font-black text-[#3667c5] uppercase tracking-widest mb-3">Lịch sử câu lệnh</h4>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                  {currentVersion.refineHistory.map((cmd, idx) => (
                    <div key={idx} className="group/cmd flex items-start gap-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100/50">
                      <p className="flex-1 text-[10px] text-gray-600 italic">"{cmd}"</p>
                      <button 
                        onClick={() => onDeleteRefineHistory(currentVersion.id, idx)}
                        className="opacity-0 group-hover/cmd:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Image History */}
            <div className="pt-6 border-t border-gray-50">
              <h4 className="text-[10px] font-black text-[#3667c5] uppercase tracking-widest mb-4 flex items-center justify-between">
                Lịch sử tạo ảnh
                <span className="bg-blue-50 px-2 py-0.5 rounded text-[8px]">{scene.imageHistory?.length || 0} phiên bản</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {scene.imageHistory?.map((version, idx) => (
                  <div key={version.id} className="relative group/v">
                    <button
                      onClick={() => setSelectedVersionId(version.id)}
                      className={cn(
                        "w-full aspect-square rounded-xl overflow-hidden border-2 transition-all",
                        selectedVersionId === version.id ? "border-[#3667c5] shadow-lg" : "border-transparent hover:border-blue-100"
                      )}
                      title={version.prompt || "Không có prompt"}
                    >
                      <img src={version.url} className="w-full h-full object-cover" />
                    </button>
                    {scene.mainImageId === version.id && (
                      <div className="absolute top-1 right-1 bg-[#3667c5] text-white p-1 rounded-full shadow-lg">
                        <Star size={8} fill="currentColor" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/v:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onSetMainImage(version.id); }}
                        className="p-1 bg-white rounded-lg text-[#3667c5] hover:scale-110 transition-transform"
                        title="Đặt làm ảnh chính"
                      >
                        <Star size={12} fill={scene.mainImageId === version.id ? "currentColor" : "none"} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteVersion(version.id); }}
                        className="p-1 bg-white rounded-lg text-red-500 hover:scale-110 transition-transform"
                        title="Xóa phiên bản này"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex flex-col gap-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lỗi thường gặp</h4>
              <div className="grid grid-cols-2 gap-2">
                {commonErrors.map(err => (
                  <button
                    key={err.id}
                    onClick={() => addErrorPrompt(err.prompt)}
                    className="px-3 py-2 text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-100 rounded-xl hover:bg-blue-50 hover:text-[#3667c5] hover:border-blue-100 transition-all text-left"
                  >
                    {err.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="Tinh chỉnh lại ảnh này..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-[#3667c5] outline-none h-24 resize-none transition-all"
                />
              </div>
              <button 
                onClick={() => handleRegenerate(refinePrompt)}
                disabled={scene.isGenerating}
                className="w-full py-3 bg-[#3667c5] text-white rounded-2xl hover:bg-[#2d56a8] transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 font-bold text-sm"
              >
                {scene.isGenerating ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw size={18} className="animate-spin" />
                    <span>{scene.progress || 0}%</span>
                  </div>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Gửi yêu cầu tinh chỉnh</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => onDownload(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#3667c5] text-white rounded-2xl font-bold text-sm hover:shadow-lg transition-all"
              >
                <Download size={18} />
                Tải về
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
