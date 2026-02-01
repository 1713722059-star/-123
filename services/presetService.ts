/**
 * 预设管理服务
 * 用于独立运行时管理预设配置（破限、温度、top_p等）
 * 参考 XianTu 的 promptStorage.ts，但简化为只管理预设参数
 */

// 使用 localStorage 作为存储（如果未来需要更大容量，可以迁移到 IndexedDB）
const PRESET_STORAGE_KEY = 'wenwan_presets';
const DEFAULT_PRESET_NAME = 'default';

export interface PresetConfig {
  name: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  // 其他可能的预设参数
  [key: string]: any;
}

/**
 * 默认预设配置
 */
const DEFAULT_PRESET: PresetConfig = {
  name: 'default',
  temperature: 0.9,
  top_p: 0.95,
  max_tokens: 2000,
  frequency_penalty: 0.3,
  presence_penalty: 0.3,
};

/**
 * 预设管理类
 */
class PresetService {
  private presets: Record<string, PresetConfig> = {};

  /**
   * 初始化：从 localStorage 加载预设
   */
  init(): void {
    try {
      const stored = localStorage.getItem(PRESET_STORAGE_KEY);
      if (stored) {
        this.presets = JSON.parse(stored);
      } else {
        // 如果没有存储，使用默认预设
        this.presets[DEFAULT_PRESET_NAME] = DEFAULT_PRESET;
        this.save();
      }
    } catch (error) {
      console.warn('[PresetService] 加载预设失败，使用默认预设:', error);
      this.presets[DEFAULT_PRESET_NAME] = DEFAULT_PRESET;
    }
  }

  /**
   * 保存预设到 localStorage
   */
  private save(): void {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(this.presets));
    } catch (error) {
      console.error('[PresetService] 保存预设失败:', error);
    }
  }

  /**
   * 获取预设（如果不存在，返回默认预设）
   */
  getPreset(name: string = DEFAULT_PRESET_NAME): PresetConfig {
    if (!this.presets[name]) {
      return { ...DEFAULT_PRESET };
    }
    return { ...this.presets[name] };
  }

  /**
   * 保存预设
   */
  savePreset(preset: PresetConfig): void {
    this.presets[preset.name] = { ...preset };
    this.save();
    console.log(`[PresetService] 已保存预设: ${preset.name}`);
  }

  /**
   * 删除预设
   */
  deletePreset(name: string): boolean {
    if (name === DEFAULT_PRESET_NAME) {
      console.warn('[PresetService] 不能删除默认预设');
      return false;
    }
    if (this.presets[name]) {
      delete this.presets[name];
      this.save();
      console.log(`[PresetService] 已删除预设: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 获取所有预设名称
   */
  getAllPresetNames(): string[] {
    return Object.keys(this.presets);
  }

  /**
   * 获取所有预设
   */
  getAllPresets(): Record<string, PresetConfig> {
    return { ...this.presets };
  }

  /**
   * 导出预设（用于备份）
   */
  exportPresets(): string {
    return JSON.stringify(this.presets, null, 2);
  }

  /**
   * 导入预设（用于恢复）
   */
  importPresets(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      if (typeof imported === 'object' && imported !== null) {
        this.presets = { ...this.presets, ...imported };
        this.save();
        console.log('[PresetService] 已导入预设');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[PresetService] 导入预设失败:', error);
      return false;
    }
  }

  /**
   * 重置为默认预设
   */
  resetToDefault(): void {
    this.presets = {
      [DEFAULT_PRESET_NAME]: { ...DEFAULT_PRESET },
    };
    this.save();
    console.log('[PresetService] 已重置为默认预设');
  }
}

// 创建单例
export const presetService = new PresetService();

// 初始化
presetService.init();
