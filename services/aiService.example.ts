// AI服务使用示例

import { callAI, streamAI, callAIFlexible, AIMessage } from './aiService';

// ========== 示例1: 非流式调用 ==========
async function exampleNonStream() {
    const messages: AIMessage[] = [
        { role: 'system', content: '你是一个友好的助手' },
        { role: 'user', content: '你好，请介绍一下自己' }
    ];

    try {
        const response = await callAI(messages, {
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 500,
            reasoning: true // 启用思考模式
        });

        console.log('回复内容:', response.content);
        console.log('思考内容:', response.reasoning); // 如果有思考内容
        console.log('完成原因:', response.finishReason);
        console.log('Token使用:', response.usage);
    } catch (error) {
        console.error('调用失败:', error);
    }
}

// ========== 示例2: 流式调用 ==========
async function exampleStream() {
    const messages: AIMessage[] = [
        { role: 'system', content: '你是一个友好的助手' },
        { role: 'user', content: '请写一首关于春天的诗' }
    ];

    let fullContent = '';
    let fullReasoning = '';

    try {
        await streamAI(
            messages,
            {
                model: 'gpt-4o-mini',
                temperature: 0.8,
                reasoning: true // 启用思考模式
            },
            (chunk) => {
                // 处理每个数据块
                if (chunk.content) {
                    fullContent += chunk.content;
                    process.stdout.write(chunk.content); // 实时输出内容
                }
                
                if (chunk.reasoning) {
                    fullReasoning += chunk.reasoning;
                    // 可以单独处理思考内容
                }

                if (chunk.done) {
                    console.log('\n\n流式传输完成');
                    console.log('完整内容:', fullContent);
                    console.log('完整思考:', fullReasoning);
                    if (chunk.finishReason) {
                        console.log('完成原因:', chunk.finishReason);
                    }
                }
            }
        );
    } catch (error) {
        console.error('流式调用失败:', error);
    }
}

// ========== 示例3: 灵活调用（根据参数自动选择流式或非流式）==========
async function exampleFlexible() {
    const messages: AIMessage[] = [
        { role: 'user', content: '解释一下什么是量子计算' }
    ];

    // 方式1: 非流式（不提供onChunk回调）
    const response = await callAIFlexible(messages, {
        model: 'gpt-4o-mini',
        reasoning: true
    });
    console.log('非流式响应:', response);

    // 方式2: 流式（提供onChunk回调）
    await callAIFlexible(
        messages,
        { model: 'gpt-4o-mini', reasoning: true },
        (chunk) => {
            if (chunk.content) {
                process.stdout.write(chunk.content);
            }
            if (chunk.done) {
                console.log('\n完成');
            }
        }
    );
}

// ========== 示例4: 在React组件中使用 ==========
/*
import { useState } from 'react';
import { streamAI, AIMessage } from './services/aiService';

function ChatComponent() {
    const [messages, setMessages] = useState<AIMessage[]>([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async (userInput: string) => {
        const newMessages: AIMessage[] = [
            ...messages,
            { role: 'user', content: userInput }
        ];
        setMessages(newMessages);
        setIsLoading(true);
        setCurrentResponse('');

        await streamAI(
            newMessages,
            { model: 'gpt-4o-mini', reasoning: true },
            (chunk) => {
                if (chunk.content) {
                    setCurrentResponse(prev => prev + chunk.content);
                }
                if (chunk.done) {
                    setIsLoading(false);
                    setMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: currentResponse }
                    ]);
                    setCurrentResponse('');
                }
            }
        );
    };

    return (
        <div>
            {messages.map((msg, i) => (
                <div key={i}>{msg.role}: {msg.content}</div>
            ))}
            {isLoading && <div>{currentResponse}</div>}
        </div>
    );
}
*/

export { exampleNonStream, exampleStream, exampleFlexible };





