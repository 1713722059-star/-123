// 预设服务 - 负责解析SillyTavern预设文件
// 屏蔽美化内容和思考过程，提取核心提示词内容

export interface SillyTavernPreset {
  prompts?: Array<{
    identifier?: string;
    name?: string;
    enabled?: boolean;
    role?: string;
    content?: string;
    system_prompt?: boolean;
    marker?: boolean;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * 清理内容：移除美化、思考过程、注释等
 */
function cleanContent(content: string): string {
  if (!content) return '';

  let cleaned = content;

  // 1. 移除HTML代码块（美化内容）
  // 匹配 ``` 开头的HTML代码块
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  
  // 2. 移除思考过程标签
  // <meow>...</meow>, <think_nya~>...</think_nya~>, <thought>...</thought>, <os>...</os>
  cleaned = cleaned.replace(/<(meow|think_nya~|thought|os)>[\s\S]*?<\/\1>/gi, '');
  
  // 3. 移除注释（{{// ...}} 或 {{//注释：...}}）
  cleaned = cleaned.replace(/\{\{\/\/[^}]*\}\}/g, '');
  cleaned = cleaned.replace(/\{\{注释[^}]*\}\}/g, '');
  
  // 4. 移除特殊标记和变量
  // {{setvar::...}}, {{getvar::...}}, {{random::...}}, {{user}}, {{char}}等
  cleaned = cleaned.replace(/\{\{[^}]+\}\}/g, '');
  
  // 5. 移除特殊格式标记
  // <game></game>, <summary></summary>, <details></details>, <background></background>等
  cleaned = cleaned.replace(/<(game|summary|details|background|tag_fixed)[^>]*>[\s\S]*?<\/\1>/gi, '');
  cleaned = cleaned.replace(/<(game|summary|details|background|tag_fixed)[^>]*\/?>/gi, '');
  
  // 6. 移除小猫之神相关的对话格式（|小猫之神|...）
  cleaned = cleaned.replace(/\|小猫之神[^|]*\|/g, '');
  cleaned = cleaned.replace(/\|用户[^|]*\|/g, '');
  cleaned = cleaned.replace(/\|游戏剧情[^|]*\|/g, '');
  
  // 7. 移除特殊分隔符和标记
  cleaned = cleaned.replace(/<\|sep\|>/g, '');
  cleaned = cleaned.replace(/<\|前置世界书\|>/g, '');
  cleaned = cleaned.replace(/<小猫之神世界书处理>/g, '');
  cleaned = cleaned.replace(/<\/小猫之神世界书处理>/g, '');
  cleaned = cleaned.replace(/<end>/g, '');
  cleaned = cleaned.replace(/<role>[^<]*<\/role>/g, '');
  
  // 8. 移除多余的空行和空白
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * 判断内容是否应该被包含
 */
function shouldIncludePrompt(prompt: any): boolean {
  // 只包含启用的提示词
  if (prompt.enabled === false) {
    return false;
  }

  // 排除标记为marker的（这些是占位符）
  if (prompt.marker === true) {
    return false;
  }

  // 排除特殊标识符
  const excludeIdentifiers = [
    'main', // 重定义标记
    'enhanceDefinitions', // 召唤术
    'worldInfoBefore',
    'worldInfoAfter',
    'personaDescription',
    'charDescription',
    'charPersonality',
    'scenario',
    'dialogueExamples',
    'chatHistory',
    'nsfw', // 上下文构造
    'jailbreak', // 预填
    'version_info', // 版本信息
    'SPresetSettings', // SPreset配置
  ];

  if (prompt.identifier && excludeIdentifiers.includes(prompt.identifier)) {
    return false;
  }

  // 排除包含大量HTML/JS代码的内容（美化内容）
  if (prompt.content) {
    const htmlPattern = /```[\s\S]*?(html|HTML|<!DOCTYPE|script|style)[\s\S]*?```/i;
    if (htmlPattern.test(prompt.content)) {
      return false;
    }
    
    // 排除主要是脚本代码的内容
    if (prompt.content.length > 1000 && /function|const |let |var |<script/i.test(prompt.content)) {
      return false;
    }
  }

  return true;
}

/**
 * 解析SillyTavern预设文件（改进版，确保读全）
 */
export function parsePresetFile(presetData: SillyTavernPreset): string {
  const extractedPrompts: string[] = [];

  // 方法1: 处理prompts数组（标准格式）
  if (presetData.prompts && Array.isArray(presetData.prompts)) {
    // 按injection_order排序（如果存在）
    const sortedPrompts = [...presetData.prompts].sort((a, b) => {
      const aOrder = a.injection_order ?? 999;
      const bOrder = b.injection_order ?? 999;
      return aOrder - bOrder;
    });

    for (const prompt of sortedPrompts) {
      // 检查是否应该包含
      if (!shouldIncludePrompt(prompt)) {
        continue;
      }

      // 只处理system角色的提示词
      if (prompt.role === 'system' || prompt.system_prompt === true) {
        if (prompt.content) {
          const cleaned = cleanContent(prompt.content);
          if (cleaned && cleaned.length > 10) { // 至少10个字符才保留
            extractedPrompts.push(cleaned);
          }
        }
      }
    }
  }

  // 方法2: 处理其他可能的字段（确保读全）
  // 检查是否有system_prompt字段
  if (presetData.system_prompt && typeof presetData.system_prompt === 'string') {
    const cleaned = cleanContent(presetData.system_prompt);
    if (cleaned && cleaned.length > 10) {
      extractedPrompts.push(cleaned);
    }
  }

  // 检查是否有prompt字段
  if (presetData.prompt && typeof presetData.prompt === 'string') {
    const cleaned = cleanContent(presetData.prompt);
    if (cleaned && cleaned.length > 10) {
      extractedPrompts.push(cleaned);
    }
  }

  // 方法3: 遍历所有字段，查找可能包含提示词的字段
  for (const key in presetData) {
    if (key === 'prompts' || key === 'system_prompt' || key === 'prompt') {
      continue; // 已经处理过
    }
    
    const value = presetData[key];
    // 如果是字符串且长度较长，可能是提示词内容
    if (typeof value === 'string' && value.length > 50) {
      // 检查是否包含常见的提示词关键词
      if (/角色|性格|场景|对话|回复|描述|规则|指令/i.test(value)) {
        const cleaned = cleanContent(value);
        if (cleaned && cleaned.length > 10) {
          extractedPrompts.push(cleaned);
        }
      }
    }
  }

  // 合并所有提示词，去重
  const uniquePrompts = Array.from(new Set(extractedPrompts));
  return uniquePrompts.join('\n\n');
}

/**
 * 从JSON文件读取预设
 */
export function loadPresetFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const presetData: SillyTavernPreset = JSON.parse(content);
        const extractedContent = parsePresetFile(presetData);
        resolve(extractedContent);
      } catch (error) {
        reject(new Error(`解析预设文件失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * 从JSON字符串解析预设
 */
export function parsePresetFromJSON(jsonString: string): string {
  try {
    const presetData: SillyTavernPreset = JSON.parse(jsonString);
    return parsePresetFile(presetData);
  } catch (error) {
    throw new Error(`解析预设JSON失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}




