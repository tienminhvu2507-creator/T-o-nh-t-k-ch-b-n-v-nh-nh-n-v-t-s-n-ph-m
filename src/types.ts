export interface ImageVersion {
  id: string;
  url: string;
  timestamp: number;
  prompt?: string;
  refineHistory?: string[];
}

export interface Character {
  id: string;
  name: string;
  description: string;
  images: string[]; // base64
  isDefault: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  images: string[]; // base64
  isDefault: boolean;
}

export interface Scene {
  id: string;
  sceneName: string; // Column A
  script: string; // Column B (Phân cảnh)
  promptName: string; // Column C
  contextDescription: string; // Column D
  characterIds: string[];
  productIds: string[];
  imageUrl?: string;
  imageHistory: ImageVersion[];
  mainImageId?: string;
  isGenerating?: boolean;
  progress?: number;
  error?: string;
}

export interface Script {
  id: string;
  title: string;
  createdAt: number;
  scenes: Scene[];
  stylePrompt: string;
  characters: Character[];
  products: Product[];
}

export interface ProjectState {
  projectName: string;
  activeTab: string;
  language: 'vi' | 'en' | 'zh' | 'th' | 'ja' | 'ko';
  scripts: Script[];
  activeScriptId: string | null;
  userApiKey?: string;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
}
