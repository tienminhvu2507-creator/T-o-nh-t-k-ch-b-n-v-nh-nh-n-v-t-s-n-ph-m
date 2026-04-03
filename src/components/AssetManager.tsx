import React from 'react';
import { Star, Trash2, Plus, Upload, Info, User, Package } from 'lucide-react';
import { Character, Product } from '../types';
import { cn } from '../App';

import { translations, type Language } from '../translations';

interface Props {
  type: 'character' | 'product';
  items: (Character | Product)[];
  language: Language;
  onUpdate: (items: (Character | Product)[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const AssetManager: React.FC<Props> = ({ type, items, language, onUpdate, showToast }) => {
  const t = translations[language];

  const addItem = () => {
    const id = `${type === 'character' ? 'char' : 'prod'}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: Character | Product = {
      id,
      name: '',
      description: '',
      images: [],
      isDefault: false
    };
    onUpdate([...items, newItem]);
  };

  const removeItem = (id: string) => {
    onUpdate(items.filter(i => i.id !== id));
  };

  const handleImageUpload = (id: string, files: FileList | null) => {
    if (!files) return;
    const newItems = [...items];
    const itemIndex = newItems.findIndex(i => i.id === id);
    if (itemIndex === -1) return;

    const currentImages = newItems[itemIndex].images;
    if (currentImages.length >= 5) {
      showToast(t.maxImages, 'error');
      return;
    }

    Array.from(files).slice(0, 5 - currentImages.length).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        newItems[itemIndex].images.push(base64);
        onUpdate([...newItems]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (itemId: string, imgIndex: number) => {
    const newItems = [...items];
    const itemIndex = newItems.findIndex(i => i.id === itemId);
    newItems[itemIndex].images.splice(imgIndex, 1);
    onUpdate(newItems);
  };

  const toggleDefault = (id: string) => {
    const newItems = items.map(item => ({
      ...item,
      isDefault: item.id === id ? !item.isDefault : false
    }));
    onUpdate(newItems);
  };

  const updateField = (id: string, field: 'name' | 'description', value: string) => {
    const newItems = items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    onUpdate(newItems);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[#3667c5]">
          <Info size={18} />
          <p className="text-xs font-medium italic">
            {t.assetNote}
          </p>
        </div>
        <button 
          onClick={addItem}
          className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl shadow-lg shadow-[#3667c5]/20 self-start"
        >
          <Plus size={18} />
          {type === 'character' ? t.addCharacter : t.addProduct}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, index) => (
          <div key={item.id} className="bg-white rounded-2xl p-5 border border-blue-50 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-bold text-gray-700 uppercase text-sm">
                {type === 'character' ? t.charPrefix : t.prodPrefix} {index + 1}
              </h4>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-all"
                >
                  <Trash2 size={16} />
                </button>
                <button 
                  onClick={() => toggleDefault(item.id)}
                  className={cn(
                    "p-1.5 rounded-full transition-all",
                    item.isDefault ? "bg-yellow-400 text-white" : "bg-gray-100 text-gray-400 hover:bg-yellow-100"
                  )}
                  title={t.default}
                >
                  <Star size={16} fill={item.isDefault ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <input 
                type="text"
                placeholder={t.placeholderName}
                value={item.name}
                onChange={(e) => updateField(item.id, 'name', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:ring-1 focus:ring-[#3667c5] outline-none"
              />
              <textarea 
                placeholder={t.placeholderDescription}
                value={item.description}
                onChange={(e) => updateField(item.id, 'description', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:ring-1 focus:ring-[#3667c5] outline-none h-20 resize-none"
              />
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {item.images.map((img, idx) => (
                  <div key={idx} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 group/img">
                    <img src={img} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(item.id, idx)}
                      className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {item.images.length < 5 && (
                  <label className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-[#3667c5] hover:text-[#3667c5] cursor-pointer transition-all">
                    <Plus size={16} />
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => handleImageUpload(item.id, e.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full py-12 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
              {type === 'character' ? <User size={32} /> : <Package size={32} />}
            </div>
            <p className="font-bold">{type === 'character' ? t.addCharacter : t.addProduct}</p>
          </div>
        )}
      </div>
    </div>
  );
};
