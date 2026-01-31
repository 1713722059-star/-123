// 自动总结服务 - 将妹妹的发言总结到今日记忆
import { Message } from '../types';

/**
 * 总结妹妹的发言（最近5条）
 * @param messages 所有消息
 * @param mainAIConfig 主AI配置
 * @returns 总结文本
 */
export async function summarizeCharacterMessages(
    messages: Message[],
    mainAIConfig: { apiBase: string; apiKey: string; model: string }
): Promise<string> {
    // 筛选出妹妹的发言（最近5条）
    const characterMessages = messages
        .filter(m => m.sender === 'character')
        .slice(-5);
    
    if (characterMessages.length === 0) {
        return '';
    }
    
    // 检查API配置
    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        // 如果没有配置API，使用简单总结
        return characterMessages.map(m => m.text).join('；');
    }
    
    const summaryPrompt = `请将以下温婉（妹妹）的发言总结成一段简洁的文字（50-100字），用于帮助AI回忆今天发生的事情。要求：
1. 保留关键信息和情感
2. 使用第三人称描述
3. 简洁明了，不要重复

温婉的发言：
${characterMessages.map((m, i) => `${i + 1}. ${m.text}`).join('\n')}

总结：`;

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
                    { role: 'system', content: '你是一个专业的文本总结助手，擅长将对话内容总结成简洁的回忆片段。' },
                    { role: 'user', content: summaryPrompt }
                ],
                temperature: 0.5,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.choices[0]?.message?.content || '';
        
        // 清理总结文本（移除可能的引号等）
        return summary.trim().replace(/^["']|["']$/g, '');
    } catch (error: any) {
        console.error('总结生成失败:', error);
        // 如果AI调用失败，返回简单总结
        return characterMessages.map(m => m.text.substring(0, 30)).join('；') + '...';
    }
}

