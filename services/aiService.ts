// 通用AI服务模块 - 支持OpenAI兼容格式，支持流式和非流式响应
// 使用 reasoning_content 来表示思考内容

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIRequestOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    reasoning?: boolean; // 是否启用思考模式（使用reasoning_content）
}

export interface AIResponse {
    content: string;
    reasoning?: string; // 思考内容（如果启用）
    finishReason?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface AIStreamChunk {
    content?: string;
    reasoning?: string;
    done: boolean;
    finishReason?: string;
}

// OpenAI兼容的请求格式
interface OpenAICompatibleRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    reasoning?: boolean; // 扩展字段，用于启用思考模式
}

// OpenAI兼容的响应格式
interface OpenAICompatibleResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message?: {
            role: string;
            content: string;
            reasoning_content?: string; // 思考内容
        };
        delta?: {
            role?: string;
            content?: string;
            reasoning_content?: string; // 流式思考内容
        };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * 非流式调用AI
 * @param messages 对话消息列表
 * @param options 请求选项
 * @returns AI响应
 */
export async function callAI(
    messages: AIMessage[],
    options: AIRequestOptions = {}
): Promise<AIResponse> {
    const {
        model = 'gpt-4o-mini',
        temperature = 0.7,
        maxTokens = 2000,
        reasoning = false
    } = options;

    // 构建OpenAI兼容的请求
    const requestBody: OpenAICompatibleRequest = {
        model,
        messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
        })),
        temperature,
        max_tokens: maxTokens,
        stream: false,
        ...(reasoning && { reasoning: true }) // 如果启用思考模式，添加reasoning字段
    };

    // 获取API配置（支持浏览器和Node.js环境）
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_AI_API_KEY || 
                   (typeof process !== 'undefined' && (process.env?.OPENAI_API_KEY || process.env?.AI_API_KEY));
    const apiBase = import.meta.env.VITE_OPENAI_API_BASE || import.meta.env.VITE_AI_API_BASE ||
                    (typeof process !== 'undefined' && (process.env?.OPENAI_API_BASE || process.env?.AI_API_BASE)) ||
                    'https://api.openai.com/v1';

    if (!apiKey) {
        throw new Error('AI API Key not found. Please set OPENAI_API_KEY or AI_API_KEY environment variable.');
    }

    try {
        const response = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(error.error?.message || `API request failed with status ${response.status}`);
        }

        const data: OpenAICompatibleResponse = await response.json();

        // 提取响应内容
        const choice = data.choices[0];
        const message = choice.message;
        
        return {
            content: message?.content || '',
            reasoning: message?.reasoning_content || undefined, // 提取思考内容
            finishReason: choice.finish_reason || undefined,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    } catch (error) {
        console.error('AI Service Error:', error);
        throw error;
    }
}

/**
 * 流式调用AI
 * @param messages 对话消息列表
 * @param options 请求选项
 * @param onChunk 处理每个数据块的回调函数
 * @returns Promise，在流式传输完成后resolve
 */
export async function streamAI(
    messages: AIMessage[],
    options: AIRequestOptions = {},
    onChunk: (chunk: AIStreamChunk) => void
): Promise<void> {
    const {
        model = 'gpt-4o-mini',
        temperature = 0.7,
        maxTokens = 2000,
        reasoning = false
    } = options;

    // 构建OpenAI兼容的请求
    const requestBody: OpenAICompatibleRequest = {
        model,
        messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
        })),
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...(reasoning && { reasoning: true })
    };

    // 获取API配置（支持浏览器和Node.js环境）
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_AI_API_KEY || 
                   (typeof process !== 'undefined' && (process.env?.OPENAI_API_KEY || process.env?.AI_API_KEY));
    const apiBase = import.meta.env.VITE_OPENAI_API_BASE || import.meta.env.VITE_AI_API_BASE ||
                    (typeof process !== 'undefined' && (process.env?.OPENAI_API_BASE || process.env?.AI_API_BASE)) ||
                    'https://api.openai.com/v1';

    if (!apiKey) {
        throw new Error('AI API Key not found. Please set OPENAI_API_KEY or AI_API_KEY environment variable.');
    }

    try {
        const response = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(error.error?.message || `API request failed with status ${response.status}`);
        }

        // 处理流式响应
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                onChunk({ done: true });
                break;
            }

            // 解码数据
            buffer += decoder.decode(value, { stream: true });
            
            // 处理SSE格式的数据（每行以"data: "开头）
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一个不完整的行

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') {
                        onChunk({ done: true });
                        continue;
                    }

                    try {
                        const data: OpenAICompatibleResponse = JSON.parse(dataStr);
                        const choice = data.choices[0];
                        const delta = choice.delta;

                        if (delta) {
                            onChunk({
                                content: delta.content || undefined,
                                reasoning: delta.reasoning_content || undefined, // 流式思考内容
                                done: false,
                                finishReason: choice.finish_reason || undefined
                            });
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE data:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('AI Stream Service Error:', error);
        throw error;
    }
}

/**
 * 便捷方法：调用AI并自动处理流式或非流式
 * @param messages 对话消息列表
 * @param options 请求选项
 * @param onChunk 可选的回调函数，如果提供则使用流式，否则使用非流式
 * @returns 如果使用流式返回Promise<void>，否则返回Promise<AIResponse>
 */
export async function callAIFlexible(
    messages: AIMessage[],
    options: AIRequestOptions = {},
    onChunk?: (chunk: AIStreamChunk) => void
): Promise<AIResponse | void> {
    if (onChunk || options.stream) {
        // 使用流式
        await streamAI(messages, options, onChunk || (() => {}));
        return;
    } else {
        // 使用非流式
        return await callAI(messages, options);
    }
}

// 模型信息接口
export interface ModelInfo {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}

/**
 * 获取可用的模型列表
 * @param apiBase API基础地址
 * @param apiKey API密钥
 * @returns 模型列表
 */
export async function getModels(
    apiBase: string = 'https://api.openai.com/v1',
    apiKey?: string
): Promise<ModelInfo[]> {
    // 获取API配置（支持浏览器和Node.js环境）
    const finalApiKey = apiKey || 
                       import.meta.env.VITE_OPENAI_API_KEY || 
                       import.meta.env.VITE_AI_API_KEY || 
                       (typeof process !== 'undefined' && (process.env?.OPENAI_API_KEY || process.env?.AI_API_KEY));
    
    const finalApiBase = apiBase || 
                        import.meta.env.VITE_OPENAI_API_BASE || 
                        import.meta.env.VITE_AI_API_BASE ||
                        (typeof process !== 'undefined' && (process.env?.OPENAI_API_BASE || process.env?.AI_API_BASE)) ||
                        'https://api.openai.com/v1';

    if (!finalApiKey) {
        throw new Error('API Key not found. Please provide apiKey parameter or set environment variable.');
    }

    try {
        const response = await fetch(`${finalApiBase}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${finalApiKey}`
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(error.error?.message || `Failed to fetch models: ${response.status}`);
        }

        const data = await response.json();
        
        // OpenAI格式: { data: ModelInfo[] }
        // 兼容其他OpenAI兼容的API格式
        if (Array.isArray(data)) {
            return data;
        } else if (data.data && Array.isArray(data.data)) {
            return data.data;
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Get Models Error:', error);
        throw error;
    }
}

