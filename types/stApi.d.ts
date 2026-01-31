// ST_API 类型定义（st-api-wrapper）
declare global {
  interface Window {
    ST_API?: {
      prompt: {
        generate: (input: STAPIGenerateInput) => Promise<STAPIGenerateOutput>;
        buildRequest: (input: STAPIBuildRequestInput) => Promise<STAPIBuildRequestOutput>;
        get: (input: STAPIGetPromptInput) => Promise<STAPIGetPromptOutput>;
      };
      preset: {
        get: (input: { name: string }) => Promise<{ preset: any }>;
        list: () => Promise<string[]>;
      };
      worldbook: {
        get: (input: { name: string }) => Promise<{ worldbook: any }>;
        list: () => Promise<string[]>;
      };
    };
  }
}

export interface STAPIGenerateInput {
  writeToChat?: boolean;
  stream?: boolean;
  onToken?: (delta: string, full: string) => void;
  timeoutMs?: number;
  forceCharacterId?: number;
  preset?: {
    mode?: 'current' | 'disable';
    inject?: any;
    replace?: any;
  };
  worldBook?: {
    mode?: 'current' | 'disable';
    inject?: any;
    replace?: any;
  };
  chatHistory?: {
    replace?: Array<{ role: string; content: string }>;
    inject?: Array<{
      message: { role: string; content: string };
      depth?: number;
      order?: number;
    }>;
  };
  extraBlocks?: Array<{
    role: string;
    content: string;
    name?: string;
    index?: number;
  }>;
  includeRequest?: boolean;
}

export interface STAPIGenerateOutput {
  timestamp: number;
  characterId?: number;
  text: string;
  from: 'inChat' | 'background';
  request?: STAPIBuildRequestOutput;
}

export interface STAPIBuildRequestInput {
  timeoutMs?: number;
  forceCharacterId?: number;
  preset?: {
    mode?: 'current' | 'disable';
    inject?: any;
    replace?: any;
  };
  worldBook?: {
    mode?: 'current' | 'disable';
    inject?: any;
    replace?: any;
  };
  chatHistory?: {
    replace?: Array<{ role: string; content: string }>;
    inject?: Array<{
      message: { role: string; content: string };
      depth?: number;
      order?: number;
    }>;
  };
  extraBlocks?: Array<{
    role: string;
    content: string;
    name?: string;
    index?: number;
  }>;
  includeGenerateData?: boolean;
}

export interface STAPIBuildRequestOutput {
  timestamp: number;
  characterId?: number;
  chatCompletionMessages?: Array<{
    role: string;
    content: string;
    name?: string;
  }>;
  textPrompt?: string;
  generateData?: any;
}

export interface STAPIGetPromptInput {
  timeoutMs?: number;
  forceCharacterId?: number;
}

export interface STAPIGetPromptOutput {
  timestamp: number;
  characterId?: number;
  prompt: string;
}

export {};

