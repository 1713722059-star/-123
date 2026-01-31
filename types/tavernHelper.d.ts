// TavernHelper 类型定义
// 基于 tavern_helper_template 的 @types 定义

declare global {
  interface Window {
    /**
     * 酒馆助手提供的额外功能
     * 具体内容见于 https://n0vi028.github.io/JS-Slash-Runner-Doc
     */
    TavernHelper?: {
      // preset
      readonly getPreset: typeof getPreset;
      readonly getPresetNames: typeof getPresetNames;
      readonly getLoadedPresetName: typeof getLoadedPresetName;
      readonly loadPreset: typeof loadPreset;
      
      // worldbook
      readonly getWorldbook: typeof getWorldbook;
      readonly getWorldbookNames: typeof getWorldbookNames;
      readonly getCharWorldbookNames: typeof getCharWorldbookNames;
      readonly getGlobalWorldbookNames: typeof getGlobalWorldbookNames;
      
      // generate
      readonly generate: typeof generate;
      readonly generateRaw: typeof generateRaw;
      readonly builtin_prompt_default_order: typeof builtin_prompt_default_order;
    };
  }
}

// Preset 相关类型
type Preset = {
  settings: {
    max_context: number;
    max_completion_tokens: number;
    reply_count: number;
    should_stream: boolean;
    temperature: number;
    frequency_penalty: number;
    presence_penalty: number;
    top_p: number;
    repetition_penalty: number;
    min_p: number;
    top_k: number;
    top_a: number;
    seed: number;
    squash_system_messages: boolean;
    reasoning_effort: 'auto' | 'min' | 'low' | 'medium' | 'high' | 'max';
    request_thoughts: boolean;
    request_images: boolean;
    enable_function_calling: boolean;
    enable_web_search: boolean;
    allow_sending_images: 'disabled' | 'auto' | 'low' | 'high';
    allow_sending_videos: boolean;
    character_name_prefix: 'none' | 'default' | 'content' | 'completion';
    wrap_user_messages_in_quotes: boolean;
  };
  prompts: PresetPrompt[];
  prompts_unused: PresetPrompt[];
  extensions: Record<string, any>;
};

type PresetPrompt = {
  id: string;
  name: string;
  enabled: boolean;
  position: {
    type: 'relative';
  } | {
    type: 'in_chat';
    depth: number;
    order: number;
  };
  role: 'system' | 'user' | 'assistant';
  content?: string;
  extra?: Record<string, any>;
};

declare function getPreset(preset_name: 'in_use' | string): Preset;
declare function getPresetNames(): string[];
declare function getLoadedPresetName(): string;
declare function loadPreset(preset_name: Exclude<string, 'in_use'>): boolean;

// Worldbook 相关类型
type WorldbookEntry = {
  uid: number;
  name: string;
  enabled: boolean;
  strategy: {
    type: 'constant' | 'selective' | 'vectorized';
    keys: (string | RegExp)[];
    keys_secondary: { logic: 'and_any' | 'and_all' | 'not_all' | 'not_any'; keys: (string | RegExp)[] };
    scan_depth: 'same_as_global' | number;
  };
  position: {
    type: 'before_character_definition' | 'after_character_definition' | 'before_example_messages' | 'after_example_messages' | 'before_author_note' | 'after_author_note' | 'at_depth';
    role?: 'system' | 'assistant' | 'user';
    depth?: number;
    order: number;
  };
  content: string;
  probability: number;
  recursion: {
    prevent_incoming: boolean;
    prevent_outgoing: boolean;
    delay_until: null | number;
  };
  effect: {
    sticky: null | number;
    cooldown: null | number;
    delay: null | number;
  };
  extra?: Record<string, any>;
};

type CharWorldbooks = {
  primary: string | null;
  additional: string[];
};

declare function getWorldbook(worldbook_name: string): Promise<WorldbookEntry[]>;
declare function getWorldbookNames(): string[];
declare function getCharWorldbookNames(character_name: 'current' | string): CharWorldbooks;
declare function getGlobalWorldbookNames(): string[];

// Generate 相关类型
type CustomApiConfig = {
  apiurl: string;
  key?: string;
  model: string;
  source?: string;
  max_tokens?: 'same_as_preset' | 'unset' | number;
  temperature?: 'same_as_preset' | 'unset' | number;
  frequency_penalty?: 'same_as_preset' | 'unset' | number;
  presence_penalty?: 'same_as_preset' | 'unset' | number;
  top_p?: 'same_as_preset' | 'unset' | number;
  top_k?: 'same_as_preset' | 'unset' | number;
};

type GenerateConfig = {
  user_input?: string;
  image?: File | string | (File | string)[];
  should_stream?: boolean;
  overrides?: {
    world_info_before?: string;
    persona_description?: string;
    char_description?: string;
    char_personality?: string;
    scenario?: string;
    world_info_after?: string;
    dialogue_examples?: string;
    chat_history?: {
      with_depth_entries?: boolean;
      author_note?: string;
      prompts?: Array<{ role: 'system' | 'assistant' | 'user'; content: string; image?: File | string | (File | string)[] }>;
    };
  };
  injects?: Array<Omit<any, 'id'>>;
  max_chat_history?: 'all' | number;
  custom_api?: CustomApiConfig;
  generation_id?: string;
};

type BuiltinPrompt = 'world_info_before' | 'persona_description' | 'char_description' | 'char_personality' | 'scenario' | 'world_info_after' | 'dialogue_examples' | 'chat_history' | 'user_input';

type RolePrompt = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  image?: File | string | (File | string)[];
};

type GenerateRawConfig = {
  user_input?: string;
  image?: File | string | (File | string)[];
  should_stream?: boolean;
  overrides?: GenerateConfig['overrides'];
  injects?: GenerateConfig['injects'];
  ordered_prompts?: (BuiltinPrompt | RolePrompt)[];
  max_chat_history?: 'all' | number;
  custom_api?: CustomApiConfig;
  generation_id?: string;
};

declare const builtin_prompt_default_order: BuiltinPrompt[];
declare function generate(config: GenerateConfig): Promise<string>;
declare function generateRaw(config: GenerateRawConfig): Promise<string>;

export {};

