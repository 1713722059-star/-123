// 自动总结服务 - 将妹妹的发言总结到今日记忆
import { Message } from '../types';

/**
 * 总结妹妹的发言（最近5条）
 * @param messages 所有消息
 * @param mainAIConfig 主AI配置
 * @returns 总结文本
 */
/**
 * 清理消息文本，移除标签和代码块，只保留纯文本正文
 */
function cleanMessageText(text: string): string {
    if (!text) return '';
    
    let cleaned = text;
    
    // 1. 移除 JSON 代码块
    cleaned = cleaned.replace(/```json[\s\S]*?```/gi, '');
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    
    // 2. 移除标签（但保留标签内的内容）
    // 注意：这里只移除标签本身，不删除标签内的内容
    // 因为正文已经从 <game> 标签中提取出来了，所以这里主要是防御性清理
    cleaned = cleaned.replace(/<game>([\s\S]*?)<\/game>/gi, '$1'); // 保留 <game> 标签内的内容
    cleaned = cleaned.replace(/<summary>[\s\S]*?<\/summary>/gi, ''); // 移除 <summary> 标签及其内容
    cleaned = cleaned.replace(/<details>[\s\S]*?<\/details>/gi, ''); // 移除 <details> 标签及其内容
    cleaned = cleaned.replace(/<[^>]+>/g, ''); // 移除其他HTML标签（但保留内容）
    
    // 3. 清理多余的空白行
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();
    
    return cleaned;
}

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
        // 如果没有配置API，使用简单总结（清理后）
        return characterMessages
            .map(m => cleanMessageText(m.text).substring(0, 50))
            .join('；');
    }
    
    // 清理消息文本，只保留纯文本正文
    const cleanedMessages = characterMessages.map(m => ({
        ...m,
        text: cleanMessageText(m.text)
    })).filter(m => m.text.length > 0); // 过滤掉空消息
    
    if (cleanedMessages.length === 0) {
        return '';
    }
    
    const summaryPrompt = `请将以下温婉（妹妹）的发言总结成一段简洁的文字（严格控制在50-100字之间），用于帮助AI回忆今天发生的事情。

**重要要求**：
1. **字数限制**：必须严格控制在50-100字之间，不要超过
2. **只总结关键信息**：只总结"发生了什么"、"谁说了什么"，不要总结详细的描写、动作、心理活动
3. **使用第三人称描述**：用"温婉"、"她"来描述
4. **简洁明了**：不要重复，不要包含正文的详细描写
5. **禁止包含**：不要包含具体的对话内容、详细的场景描写、身体动作细节

温婉的发言：
${cleanedMessages.map((m, i) => `${i + 1}. ${m.text.substring(0, 200)}${m.text.length > 200 ? '...' : ''}`).join('\n')}

总结（50-100字）：`;

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
                    { role: 'system', content: '你是一个专业的文本总结助手，擅长将对话内容总结成简洁的回忆片段。你必须严格遵守字数限制（50-100字），只总结关键信息，不要包含详细描写。' },
                    { role: 'user', content: summaryPrompt }
                ],
                temperature: 0.3, // 降低温度，让总结更简洁
                max_tokens: 150 // 限制最大token数，确保总结不会太长
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        let summary = data.choices[0]?.message?.content || '';
        
        // 清理总结文本（移除可能的引号等）
        summary = summary.trim().replace(/^["']|["']$/g, '');
        
        // 如果总结太长（超过150字），截断到100字
        if (summary.length > 150) {
            summary = summary.substring(0, 100) + '...';
            console.warn('[summaryService] 总结过长，已截断到100字');
        }
        
        // 如果总结太短（少于30字），可能是AI没有正确理解，使用备用总结
        if (summary.length < 30) {
            console.warn('[summaryService] 总结过短，使用备用总结');
            return cleanedMessages
                .map(m => m.text.substring(0, 30))
                .join('；') + '...';
        }
        
        return summary;
    } catch (error: any) {
        console.error('总结生成失败:', error);
        // 如果AI调用失败，返回简单总结（使用清理后的文本）
        return characterMessages
            .map(m => cleanMessageText(m.text).substring(0, 30))
            .join('；') + '...';
    }
}

