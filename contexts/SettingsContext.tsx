import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// AI配置接口
export interface AIConfig {
    apiBase: string;
    apiKey: string;
    model: string;
}

// 显示模式
export type DisplayMode = 'desktop' | 'mobile';

// 设置接口
export interface Settings {
    mainAI: AIConfig;
    contentAI: AIConfig; // 副AI，用于生成手机内容
    useSillyTavernGenerate: boolean; // 是否优先使用酒馆 ST_API.prompt.generate
    displayMode: DisplayMode; // 显示模式：desktop（电脑模式）或 mobile（手机模式）
    presetContent: string; // 导入的预设内容
    writingStyle: string; // 描写规范（控制AI回复的字数）
    perspective: string; // 人称描写（控制是第几人称）
    nsfwStyle: string; // NFSW描写规范（告诉AI怎么写色色）
    jailbreakPrompt: string; // 破限制提示词（用来破限制）
}

// 默认配置
const defaultSettings: Settings = {
    mainAI: {
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini'
    },
    contentAI: {
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini'
    },
    useSillyTavernGenerate: false,
    displayMode: 'desktop', // 默认电脑模式
    presetContent: '', // 默认无预设
    writingStyle: '', // 默认无描写规范
    perspective: '', // 默认无人称描写
    nsfwStyle: '', // 默认无NFSW描写规范
    jailbreakPrompt: '' // 默认无破限制提示词
};

interface SettingsContextType {
    settings: Settings;
    updateSettings: (newSettings: Partial<Settings>) => void;
    updateMainAI: (config: Partial<AIConfig>) => void;
    updateContentAI: (config: Partial<AIConfig>) => void;
    updateUseSillyTavernGenerate: (enabled: boolean) => void;
    updateDisplayMode: (mode: DisplayMode) => void;
    updatePresetContent: (content: string) => void;
    updateWritingStyle: (style: string) => void;
    updatePerspective: (perspective: string) => void;
    updateNsfwStyle: (style: string) => void;
    updateJailbreakPrompt: (prompt: string) => void;
    resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 从localStorage加载设置
const loadSettings = (): Settings => {
    try {
        const saved = localStorage.getItem('game_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            // 深度合并，确保所有字段都存在
            const loaded: Settings = {
                mainAI: {
                    apiBase: parsed.mainAI?.apiBase || defaultSettings.mainAI.apiBase,
                    apiKey: parsed.mainAI?.apiKey || defaultSettings.mainAI.apiKey,
                    model: parsed.mainAI?.model || defaultSettings.mainAI.model
                },
                contentAI: {
                    apiBase: parsed.contentAI?.apiBase || defaultSettings.contentAI.apiBase,
                    apiKey: parsed.contentAI?.apiKey || defaultSettings.contentAI.apiKey,
                    model: parsed.contentAI?.model || defaultSettings.contentAI.model
                },
                useSillyTavernGenerate: parsed.useSillyTavernGenerate ?? defaultSettings.useSillyTavernGenerate,
                displayMode: parsed.displayMode || defaultSettings.displayMode,
                presetContent: parsed.presetContent ?? defaultSettings.presetContent,
                writingStyle: parsed.writingStyle ?? defaultSettings.writingStyle,
                perspective: parsed.perspective ?? defaultSettings.perspective,
                nsfwStyle: parsed.nsfwStyle ?? defaultSettings.nsfwStyle,
                jailbreakPrompt: parsed.jailbreakPrompt ?? defaultSettings.jailbreakPrompt
            };
            console.log('从localStorage加载设置:', loaded);
            return loaded;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return defaultSettings;
};

// 保存设置到localStorage
const saveSettings = (settings: Settings) => {
    try {
        localStorage.setItem('game_settings', JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<Settings>(loadSettings);

    // 当设置改变时自动保存
    useEffect(() => {
        saveSettings(settings);
    }, [settings]);

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const updateMainAI = (config: Partial<AIConfig>) => {
        setSettings(prev => ({
            ...prev,
            mainAI: { ...prev.mainAI, ...config }
        }));
    };

    const updateContentAI = (config: Partial<AIConfig>) => {
        setSettings(prev => ({
            ...prev,
            contentAI: { ...prev.contentAI, ...config }
        }));
    };

    const updateUseSillyTavernGenerate = (enabled: boolean) => {
        setSettings(prev => ({
            ...prev,
            useSillyTavernGenerate: enabled
        }));
    };

    const updateDisplayMode = (mode: DisplayMode) => {
        setSettings(prev => ({
            ...prev,
            displayMode: mode
        }));
    };

    const updatePresetContent = (content: string) => {
        setSettings(prev => ({
            ...prev,
            presetContent: content
        }));
    };

    const updateWritingStyle = (style: string) => {
        setSettings(prev => ({
            ...prev,
            writingStyle: style
        }));
    };

    const updatePerspective = (perspective: string) => {
        setSettings(prev => ({
            ...prev,
            perspective: perspective
        }));
    };

    const updateNsfwStyle = (style: string) => {
        setSettings(prev => ({
            ...prev,
            nsfwStyle: style
        }));
    };

    const updateJailbreakPrompt = (prompt: string) => {
        setSettings(prev => ({
            ...prev,
            jailbreakPrompt: prompt
        }));
    };

    const resetSettings = () => {
        setSettings(defaultSettings);
    };

    return (
        <SettingsContext.Provider
            value={{
                settings,
                updateSettings,
                updateMainAI,
                updateContentAI,
                updateUseSillyTavernGenerate,
                updateDisplayMode,
                updatePresetContent,
                updateWritingStyle,
                updatePerspective,
                updateNsfwStyle,
                updateJailbreakPrompt,
                resetSettings
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
};

// Hook用于在组件中使用设置
export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};


