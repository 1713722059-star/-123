// 跳过时间剧情生成服务
import { BodyStatus, GameTime } from '../types';

/**
 * 生成跳过时间的剧情描述
 * @param days 跳过的天数
 * @param oldTime 跳过前的时间
 * @param newTime 跳过后的时间
 * @param bodyStatus 当前身体状态
 * @param mainAIConfig 主AI配置
 * @returns 剧情描述文本
 */
export async function generateTimeSkipNarrative(
    days: number,
    oldTime: GameTime,
    newTime: GameTime,
    bodyStatus: BodyStatus,
    mainAIConfig: { apiBase: string; apiKey: string; model: string }
): Promise<string> {
    // 检查API配置
    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        // 如果没有配置API，使用简单描述
        return generateSimpleNarrative(days, oldTime, newTime);
    }
    
    // 根据跳过的天数动态调整字数要求和token限制
    const getWordCount = (days: number): { min: number; max: number } => {
        if (days === 1) return { min: 100, max: 200 };
        if (days <= 3) return { min: 150, max: 300 };
        if (days <= 7) return { min: 200, max: 400 };
        return { min: 300, max: 500 };
    };
    
    // 根据字数要求计算token限制（中文大约1字=1.5-2 tokens，留一些余量）
    const getMaxTokens = (days: number): number => {
        const { max } = getWordCount(days);
        // 为中文预留足够的token空间，max * 2.5 确保不会截断
        return Math.max(500, max * 3);
    };
    
    const wordCount = getWordCount(days);
    const maxTokens = getMaxTokens(days);
    
    const prompt = `请生成一段剧情描述（${wordCount.min}-${wordCount.max}字），描述温婉（妹妹）在跳过的${days}天里发生的事情。

背景信息：
- 跳过前：${oldTime.year}年${oldTime.month}月${oldTime.day}日
- 跳过后：${newTime.year}年${newTime.month}月${newTime.day}日
- 当前好感度：${bodyStatus.favorability}
- 当前情绪：${bodyStatus.emotion}
- 当前位置：${bodyStatus.location}
- 当前服装：${bodyStatus.overallClothing}
- 当前动作：${bodyStatus.currentAction}

要求：
1. 描述这${days}天里温婉的日常生活、心情变化、可能发生的事情
2. 可以包括：日常活动、心情变化、对哥哥的思念、生活细节等
3. 使用第三人称叙述，风格温馨、细腻
4. 根据跳过的天数，可以适当详细描述（${days}天可以描述更多细节）
5. 可以暗示一些情感变化或生活状态的变化
6. **重要：请确保生成完整的描述，不要中途截断**

剧情描述：`;

    try {
        const response = await fetch(`${mainAIConfig.apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mainAIConfig.apiKey}`
            },
            body: JSON.stringify({
                model: mainAIConfig.model,
                messages: [
                    { 
                        role: 'system', 
                        content: '你是一个专业的剧情叙述者，擅长用温馨细腻的文字描述角色的日常生活和情感变化。请确保生成完整的描述，不要中途截断。' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: maxTokens
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const narrative = data.choices[0]?.message?.content || '';
        
        // 清理文本
        const cleanedNarrative = narrative.trim().replace(/^["']|["']$/g, '');
        
        // 如果返回空字符串，抛出错误以便调用简单描述
        if (!cleanedNarrative || cleanedNarrative.length < 10) {
            throw new Error('AI返回的内容为空或过短');
        }
        
        return cleanedNarrative;
    } catch (error: any) {
        console.error('生成跳过时间剧情失败:', error);
        // 如果AI调用失败，返回简单描述
        const simpleNarrative = generateSimpleNarrative(days, oldTime, newTime);
        // 如果简单描述也失败，抛出错误
        if (!simpleNarrative || simpleNarrative.length < 10) {
            throw new Error('生成剧情失败，请检查API配置');
        }
        return simpleNarrative;
    }
}

// 简单描述生成（当AI不可用时）
function generateSimpleNarrative(days: number, oldTime: GameTime, newTime: GameTime): string {
    const dayText = days === 1 ? '一天' : days === 2 ? '两天' : `${days}天`;
    return `时间悄然流逝，${dayText}过去了...\n\n在这段时间里，温婉过着平静的日常生活。她可能在家里休息、看书、或者做一些日常琐事。日子就这样一天天过去，直到现在。`;
}

