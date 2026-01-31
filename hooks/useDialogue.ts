import type React from "react";
import { useState, useRef } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { generateCharacterResponse } from "../services/characterService";
import { isMobileDevice } from "../utils/deviceUtils";
import {
  BackpackItem,
  BodyStatus,
  CalendarEvent,
  GameTime,
  LocationID,
  Message,
  Tweet,
} from "../types";

/**
 * 获取可访问的 ST_API 实例
 */
function getAccessibleSTAPI(): any | null {
  try {
    if (typeof window !== 'undefined' && (window as any).ST_API) {
      return (window as any).ST_API;
    }
  } catch {}
  
  try {
    if (window.parent && window.parent !== window && (window.parent as any).ST_API) {
      return (window.parent as any).ST_API;
    }
  } catch {}
  
  try {
    if (window.top && window.top !== window && (window.top as any).ST_API) {
      return (window.top as any).ST_API;
    }
  } catch {}
  
  return null;
}

/**
 * 通过 postMessage 调用 ST_API（跨域时使用）
 */
async function requestSTAPIViaPostMessage<T>(
  endpoint: string,
  params: any = {},
  timeout: number = 5000
): Promise<T | null> {
  if (typeof window === 'undefined' || window.parent === window) return null;

  return new Promise((resolve) => {
    const messageId = `st_api_${endpoint}_${Date.now()}_${Math.random()}`;
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;
      
      if (event.data && event.data.id === messageId) {
        resolved = true;
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);
        
        if (event.data.error) {
          console.warn(`[ST_API Proxy] ${endpoint} 错误:`, event.data.error);
          resolve(null);
        } else {
          const result = event.data.data !== undefined ? event.data.data : event.data;
          resolve(result as T);
        }
        return;
      }
    };

    window.addEventListener('message', messageHandler);

    try {
      window.parent.postMessage({
        type: 'ST_API_CALL',
        id: messageId,
        endpoint,
        params
      }, '*');
    } catch (error) {
      window.removeEventListener('message', messageHandler);
      resolve(null);
      return;
    }

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }
    }, timeout);
  });
}

// 对话处理 Hook - 负责处理所有对话相关的逻辑
// 包括发送消息、调用AI生成回复、更新状态、处理推特等
interface UseDialogueProps {
  messages: Message[];
  bodyStatus: BodyStatus;
  userLocation: LocationID;
  tweets: Tweet[];
  calendarEvents: CalendarEvent[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setBodyStatus: React.Dispatch<React.SetStateAction<BodyStatus>>;
  setTweets: React.Dispatch<React.SetStateAction<Tweet[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  avatarUrl: string;
  todaySummary: string; // 今日记忆总结
  advance?: (minutes: number) => void; // 时间推进函数（可选）
  gameTime?: GameTime; // 当前游戏时间（可选）
  setUserLocation?: (location: LocationID) => void; // 设置用户位置函数（可选）
  onSaveGame?: (slotId: number, customName?: string) => void; // 保存游戏函数（可选）
  backpackItems?: BackpackItem[]; // 背包物品列表（用于检测对话中的使用/赠送）
  onUseItem?: (itemId: string, name: string, description: string) => void; // 使用物品函数
  onGiftItem?: (itemId: string, name: string, description: string) => void; // 赠送物品函数
  onGiftClothing?: (outfitId: string, itemId: string) => void; // 赠送服装函数
}

export const useDialogue = ({
  messages,
  bodyStatus,
  userLocation,
  tweets,
  calendarEvents,
  setMessages,
  setBodyStatus,
  setTweets,
  setCalendarEvents,
  avatarUrl,
  todaySummary,
  advance,
  gameTime,
  setUserLocation,
  onSaveGame,
  backpackItems = [],
  onUseItem,
  onGiftItem,
  onGiftClothing,
}: UseDialogueProps) => {
  const { settings } = useSettings();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    "坐到她身边",
    "询问她在看什么",
    "递给她一杯水",
  ]);
  // 保存最后一次的操作，用于重新生成
  const lastActionRef = useRef<{ actionText: string; isSystemAction: boolean; userMessageId?: string } | null>(null);

  // 添加记忆到日历
  const addMemory = (
    title: string,
    description: string,
    color: string = "border-blue-400"
  ) => {
    const timeStr = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setCalendarEvents((prev) => [
      {
        id: Date.now().toString(),
        time: timeStr,
        title,
        description,
        color,
      },
      ...prev,
    ]);
  };

  // 处理用户操作 - 这是核心的对话处理函数
  const handleAction = async (actionText: string, isSystemAction = false) => {
    if (isLoading) return;

    // 保存当前操作，用于重新生成
    lastActionRef.current = { actionText, isSystemAction };

    // 检测购物操作
    if (actionText.includes("购买了商品")) {
      const item = actionText.split(":")[1]?.trim() || "物品";
      addMemory("购物", `在商城购买了 ${item}`, "border-orange-400");
    }

    // 如果不是系统操作，添加用户消息
    let userMessageId: string | undefined;
    if (!isSystemAction) {
      userMessageId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          sender: "user",
          text: actionText,
          timestamp: new Date(),
        },
      ]);
      // 更新最后一次操作记录，包含用户消息ID
      lastActionRef.current = { actionText, isSystemAction, userMessageId };
    } else {
      // 系统操作也更新记录
      lastActionRef.current = { actionText, isSystemAction };
    }

    // 如果不是系统操作，检测用户输入中是否包含使用/赠送物品的意图
    if (!isSystemAction && backpackItems.length > 0) {
      const actionLower = actionText.toLowerCase();
      
      // 检测赠送意图关键词
      const giftKeywords = ['送', '给你', '送给你', '送你了', '送给你了', '送你', '送给你吧', '送你了'];
      const isGiftIntent = giftKeywords.some(keyword => actionLower.includes(keyword));
      
      // 检测使用意图关键词
      const useKeywords = ['用', '使用', '用那个', '用这个', '用一下', '用吧', '用上', '用起来', '用起来吧'];
      const isUseIntent = useKeywords.some(keyword => actionLower.includes(keyword));
      
      // 如果检测到赠送或使用意图，尝试匹配背包物品
      if (isGiftIntent || isUseIntent) {
        // 匹配背包物品名称（支持部分匹配和关键词匹配）
        const matchedItem = backpackItems.find(item => {
          const itemNameLower = item.name.toLowerCase();
          // 完整匹配
          if (actionLower.includes(itemNameLower)) return true;
          // 部分匹配：如果物品名称包含多个字，检查是否包含关键部分
          const itemWords = itemNameLower.split(/[的、，,。.\s]+/).filter(w => w.length > 1);
          if (itemWords.length > 0) {
            // 检查是否包含物品名称的关键词
            const hasKeyWord = itemWords.some(word => actionLower.includes(word));
            if (hasKeyWord) return true;
          }
          // 特殊匹配：运动服、情趣内衣等常见物品的简化名称
          const simplifiedNames: Record<string, string[]> = {
            '运动服': ['运动', '运动服'],
            '黑色情趣内衣': ['情趣', '内衣', '黑色情趣'],
            '公主裙': ['公主', '公主裙'],
            '汉服': ['汉服'],
            '猫咪连体衣': ['猫咪', '连体', '连体衣'],
            '甜美毛衣': ['甜美', '毛衣'],
            '魔法少女装': ['魔法', '少女'],
            '旗袍': ['旗袍'],
          };
          const simplified = simplifiedNames[item.name];
          if (simplified) {
            return simplified.some(name => actionLower.includes(name));
          }
          return false;
        });
        
        if (matchedItem) {
          // 根据意图调用相应函数（传递 handleAction）
          if (isGiftIntent) {
            if (matchedItem.type === 'clothing' && onGiftClothing && matchedItem.outfitId) {
              // 赠送服装
              await onGiftClothing(matchedItem.outfitId, matchedItem.id, handleAction);
              return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
            } else if (matchedItem.type === 'item' && onGiftItem) {
              // 赠送物品
              await onGiftItem(matchedItem.id, matchedItem.name, matchedItem.description, handleAction);
              return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
            }
          } else if (isUseIntent && matchedItem.type === 'item' && onUseItem) {
            // 使用物品
            await onUseItem(matchedItem.id, matchedItem.name, matchedItem.description, handleAction);
            return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
          }
        }
      }
    }

    setInput("");
    setSuggestedActions([]);
    setIsLoading(true);
    
    // 智能时间推进：根据对话内容和动作类型推进不同时间
    if (!isSystemAction && advance) {
      // 检测是否为移动操作
      const actionLower = actionText.toLowerCase();
      const isLocationMove = actionLower.includes('去') || 
                            actionLower.includes('前往') || 
                            actionLower.includes('来到') ||
                            actionLower.includes('移动') ||
                            actionLower.includes('到') ||
                            actionLower.includes('去');
      
      // 检测移动类型
      const isIndoorMove = ['客厅', '卧室', '次卧', '厨房', '厕所', '走廊', '家'].some(keyword => 
        actionLower.includes(keyword)
      );
      const isOutdoorMove = ['电影院', '商城', '游乐园', '学校', '公司', '美食广场', '蛋糕店', '港口', '展会'].some(keyword =>
        actionLower.includes(keyword)
      );
      
      if (isLocationMove) {
        if (isIndoorMove) {
          // 家中位置转移：2-3分钟（随机）
          const minutes = 2 + Math.floor(Math.random() * 2); // 2-3分钟
          advance(minutes);
          console.log(`[useDialogue] 家中移动，推进${minutes}分钟`);
        } else if (isOutdoorMove) {
          // 外出：15-40分钟（随机，根据距离调整）
          const minutes = 15 + Math.floor(Math.random() * 26); // 15-40分钟
          advance(minutes);
          console.log(`[useDialogue] 外出移动，推进${minutes}分钟`);
        } else {
          // 其他移动，默认15分钟
          advance(15);
          console.log(`[useDialogue] 一般移动，推进15分钟`);
        }
      } else {
        // 普通对话：1分钟
        advance(1);
        console.log(`[useDialogue] 普通对话，推进1分钟`);
      }
    }

    // 构建对话历史（优化：使用总结替代旧消息）
    // 手机端使用更少的历史记录，避免prompt过长
    const isMobile = isMobileDevice();
    const historyLimit = isMobile ? 5 : 8; // 手机端5条，电脑端8条
    
    // 筛选非系统消息
    const nonSystemMessages = messages.filter((m) => m.sender !== "system");
    
    // 如果有总结且消息较多，使用总结替代旧消息
    let history: { role: string; content: string }[];
    if (todaySummary && nonSystemMessages.length > historyLimit + 3) {
      // 保留最近的消息，用总结替代更早的消息
      const recentMessages = nonSystemMessages.slice(-historyLimit);
      const olderMessages = nonSystemMessages.slice(0, -historyLimit);
      
      // 如果有旧消息，用总结替代
      if (olderMessages.length > 0) {
        history = [
          { role: "system", content: `[之前的对话总结] ${todaySummary}` },
          ...recentMessages.map((m) => ({
            role: m.sender === "user" ? "user" : "model",
            content: m.text,
          }))
        ];
      } else {
        // 如果没有旧消息，直接使用最近的消息
        history = recentMessages.map((m) => ({
          role: m.sender === "user" ? "user" : "model",
          content: m.text,
        }));
      }
    } else {
      // 没有总结或消息不多，直接使用最近的消息
      history = nonSystemMessages
        .slice(-historyLimit)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "model",
          content: m.text,
        }));
    }

    let promptText = actionText;
    const isWeChatMessage = actionText.startsWith("(发送微信)");
    const isRemoteWeChat =
      isWeChatMessage && userLocation !== bodyStatus.location;

    // 如果发送微信消息时在同一位置，添加特殊提示
    if (isWeChatMessage && userLocation === bodyStatus.location) {
      promptText = `${actionText} \n(System Hint: The user sent this WeChat message while standing right next to you in the ${userLocation}. You should react with confusion, amusement, or teasing: "Why are you texting me when I'm right here?" or "Looking at your phone instead of me?" or similar.)`;
    }

    // 如果是远程微信消息，提示AI这是通过微信发送的
    if (isRemoteWeChat) {
      promptText = `${actionText.replace(
        "(发送微信)",
        ""
      )} \n(System Hint: The user sent this message via WeChat while you are in different locations. You are currently at ${
        bodyStatus.location
      }, while the user is at ${userLocation}. 

**CRITICAL REMINDERS**:
1. Reply as Wenwan typing a WeChat message - use FIRST PERSON (我) or direct dialogue, NOT third-person descriptions.
2. DO NOT describe what Wenwan is doing physically - the user cannot see it.
3. Keep the reply SHORT and NATURAL - like a real WeChat message.
4. If Wenwan is in a compromising situation, she might reply briefly or awkwardly.
5. DO NOT update location in your response - user and Wenwan remain in different locations.)`;
    }

    // 调用AI生成回复（使用设置中的主AI配置）
    const statusWithContext = { ...bodyStatus, location: bodyStatus.location };

    try {
      // 调试：检查配置
      console.log("[useDialogue] 调用AI前的配置检查:", {
        apiBase: settings.mainAI.apiBase,
        hasApiKey: !!settings.mainAI.apiKey,
        model: settings.mainAI.model,
        apiKeyLength: settings.mainAI.apiKey?.length || 0,
      });

      const response = await generateCharacterResponse(
        history,
        promptText,
        statusWithContext,
        userLocation,
        settings.mainAI, // 使用设置中的主AI配置
        isRemoteWeChat, // 传递是否为远程微信消息
        {
          todaySummary,
          calendarEvents: calendarEvents.map((e) => ({
            time: e.time,
            title: e.title,
            description: e.description,
          })),
          gameTime, // 传递当前游戏时间，让AI知道时间并自主判断位置
          presetContent: settings.presetContent, // 传递预设内容
          writingStyle: settings.writingStyle, // 传递描写规范
          perspective: settings.perspective, // 传递人称描写
          nsfwStyle: settings.nsfwStyle, // 传递NFSW描写规范
          jailbreakPrompt: settings.jailbreakPrompt, // 传递破限制提示词
        },
        {
          useSillyTavernGenerate: settings.useSillyTavernGenerate,
        }
      );

      // 添加角色回复消息
      // 如果是远程微信消息，标记回复为微信消息，只在微聊界面显示
      // 检查回复内容，如果包含第三人称描述（说明AI没有遵循微信消息格式），强制添加(微信)标记
      let replyText = response.reply;
      
      // 使用酒馆的正则脚本处理AI回答（移除思考过程等）
      try {
        const stApi = getAccessibleSTAPI();
        if (stApi?.regexScript?.process) {
          const processedResult = await stApi.regexScript.process({
            text: replyText,
            placement: 2 // 2表示处理输出（AI回答）
          });
          if (processedResult?.text) {
            replyText = processedResult.text;
            console.log('[useDialogue] 正则脚本处理完成');
          }
        } else {
          // 尝试通过 postMessage 代理调用
          const processedResult = await requestSTAPIViaPostMessage<{ text?: string }>(
            'regexScript.process',
            {
              text: replyText,
              placement: 2
            },
            5000 // 5秒超时
          );
          if (processedResult?.text) {
            replyText = processedResult.text;
            console.log('[useDialogue] 正则脚本处理完成（通过代理）');
          }
        }
      } catch (error) {
        console.warn('[useDialogue] 正则脚本处理失败，使用原始文本:', error);
        // 处理失败时继续使用原始文本
      }
      const isThirdPersonDescription = replyText.includes('温婉') || 
                                       replyText.includes('她') || 
                                       replyText.includes('看到') ||
                                       replyText.includes('拿起') ||
                                       replyText.includes('回复道') ||
                                       replyText.includes('说道');
      
      // 如果是远程微信消息，但回复看起来像是第三人称描述，强制标记为微信消息并清理格式
      if (isRemoteWeChat) {
        if (isThirdPersonDescription) {
          // 尝试提取对话内容，移除第三人称描述
          const dialogueMatch = replyText.match(/[""]([^""]+)[""]|「([^」]+)」|'([^']+)'/);
          if (dialogueMatch) {
            replyText = dialogueMatch[1] || dialogueMatch[2] || dialogueMatch[3] || replyText;
          }
          // 确保标记为微信消息
          if (!replyText.startsWith('(微信)')) {
            replyText = `(微信) ${replyText}`;
          }
        } else if (!replyText.startsWith('(微信)')) {
          replyText = `(微信) ${replyText}`;
        }
      }
      
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "character",
          text: replyText,
          timestamp: new Date(),
          isWeChat: isRemoteWeChat, // 标记为微信消息，只在微聊界面显示
        },
      ]);

      // 更新身体状态（合并更新，确保不会丢失字段）
      // 远程微信消息时，不应该更新位置（用户和温婉不在同一位置）
      setBodyStatus((prev) => {
        // 如果是远程微信消息，保持位置不变
        if (isRemoteWeChat && response.status.location) {
          response.status.location = prev.location;
        }
        const newStatus = {
          ...prev,
          ...response.status,
          // 确保嵌套对象也被正确合并
          mouth: { ...prev.mouth, ...(response.status.mouth || {}) },
          chest: { ...prev.chest, ...(response.status.chest || {}) },
          nipples: { ...prev.nipples, ...(response.status.nipples || {}) },
          groin: { ...prev.groin, ...(response.status.groin || {}) },
          posterior: {
            ...prev.posterior,
            ...(response.status.posterior || {}),
          },
          feet: { ...prev.feet, ...(response.status.feet || {}) },
        };

        // 调试日志：记录状态更新
        if (
          prev.emotion !== newStatus.emotion ||
          prev.overallClothing !== newStatus.overallClothing
        ) {
          console.log("[useDialogue] 状态更新:", {
            旧情绪: prev.emotion,
            新情绪: newStatus.emotion,
            旧服装: prev.overallClothing,
            新服装: newStatus.overallClothing,
            AI返回的状态: response.status,
          });
        }

        return newStatus;
      });

      // 如果AI返回的位置与用户位置相同（说明一起去某个地方），自动更新用户位置
      // 或者如果对话内容暗示用户和温婉在一起，也更新用户位置
      // **重要**：远程微信消息时，不应该自动更新用户位置（用户和温婉不在同一位置）
      if (response.status.location && setUserLocation && !isRemoteWeChat) {
        // 检查对话内容是否暗示用户和温婉在一起（比如"一起"、"来到"、"到了"等）
        const replyText = response.reply.toLowerCase();
        const locationKeywords: Record<string, LocationID> = {
          '电影院': 'cinema',
          '影院': 'cinema',
          '放映厅': 'cinema',
          '商城': 'mall',
          '商场': 'mall',
          '购物中心': 'mall',
          '游乐园': 'amusement_park',
          '游乐场': 'amusement_park',
          '学校': 'school',
          '公司': 'company',
          '美食广场': 'food_court',
          '蛋糕店': 'cake_shop',
          '港口': 'port',
          '展会中心': 'exhibition_center',
          '展会': 'exhibition_center',
          '漫展': 'exhibition_center',
          '家': 'master_bedroom',
          '客厅': 'living_room',
          '卧室': 'master_bedroom',
          '次卧': 'guest_bedroom',
          '温婉的房间': 'guest_bedroom',
        };

        // 检查对话中是否提到位置移动
        let detectedLocation: LocationID | null = null;
        const moveKeywords = ['来到', '到了', '来到', '一起', '来到', '到达', '进入', '走进', '来到', '前往', '一路', '拉着', '挽住'];
        
        for (const [keyword, locationId] of Object.entries(locationKeywords)) {
          if (replyText.includes(keyword)) {
            // 检查是否有移动关键词
            for (const moveKeyword of moveKeywords) {
              if (replyText.includes(moveKeyword)) {
                detectedLocation = locationId;
                break;
              }
            }
            if (detectedLocation) break;
          }
        }

        // 如果AI返回的温婉位置与用户当前位置不同，且对话中提到"一起"或"和"，说明用户也一起移动了
        const isTogether = replyText.includes('一起') || 
                          replyText.includes('和') || 
                          replyText.includes('拉着') ||
                          replyText.includes('挽住') ||
                          replyText.includes('来到') ||
                          replyText.includes('到了') ||
                          replyText.includes('一路');

        // 如果检测到位置，且AI返回的温婉位置也是这个位置，更新用户位置
        if (detectedLocation && response.status.location === detectedLocation) {
          if (userLocation !== detectedLocation) {
            console.log(`[useDialogue] 自动更新用户位置: ${userLocation} → ${detectedLocation} (根据对话内容)`);
            setUserLocation(detectedLocation);
            
            // 如果位置变化，根据移动类型智能推进时间
            if (advance) {
              const isIndoorLocation = ['master_bedroom', 'guest_bedroom', 'living_room', 'dining_room', 'kitchen', 'toilet', 'hallway'].includes(detectedLocation);
              const isOutdoorLocation = !isIndoorLocation;
              
              if (isIndoorLocation) {
                // 家中位置转移：2-3分钟
                const minutes = 2 + Math.floor(Math.random() * 2); // 2-3分钟
                advance(minutes);
                console.log(`[useDialogue] 家中移动检测，额外推进${minutes}分钟`);
              } else if (isOutdoorLocation) {
                // 外出：15-40分钟
                const nearLocations = ['company', 'mall', 'cinema', 'food_court', 'cake_shop', 'school'];
                const isNearLocation = nearLocations.includes(detectedLocation);
                const minutes = isNearLocation 
                  ? 15 + Math.floor(Math.random() * 11) // 15-25分钟（近距离）
                  : 25 + Math.floor(Math.random() * 16); // 25-40分钟（远距离）
                advance(minutes);
                console.log(`[useDialogue] 外出移动检测，额外推进${minutes}分钟`);
              }
            }
          }
        } else if (isTogether && response.status.location) {
          // 如果对话中提到"一起"或"和"，且AI返回了温婉的位置，更新用户位置
          if (userLocation !== response.status.location) {
            console.log(`[useDialogue] 自动更新用户位置: ${userLocation} → ${response.status.location} (对话中提到"一起"或"和")`);
            setUserLocation(response.status.location);
            
            // 如果位置变化，根据移动类型智能推进时间
            if (advance) {
              const isIndoorLocation = ['master_bedroom', 'guest_bedroom', 'living_room', 'dining_room', 'kitchen', 'toilet', 'hallway'].includes(response.status.location);
              const isOutdoorLocation = !isIndoorLocation;
              
              if (isIndoorLocation) {
                // 家中位置转移：2-3分钟
                const minutes = 2 + Math.floor(Math.random() * 2); // 2-3分钟
                advance(minutes);
                console.log(`[useDialogue] 家中移动（一起），额外推进${minutes}分钟`);
              } else if (isOutdoorLocation) {
                // 外出：15-40分钟
                const nearLocations = ['company', 'mall', 'cinema', 'food_court', 'cake_shop', 'school'];
                const isNearLocation = nearLocations.includes(response.status.location);
                const minutes = isNearLocation 
                  ? 15 + Math.floor(Math.random() * 11) // 15-25分钟（近距离）
                  : 25 + Math.floor(Math.random() * 16); // 25-40分钟（远距离）
                advance(minutes);
                console.log(`[useDialogue] 外出移动（一起），额外推进${minutes}分钟`);
              }
            }
          }
        } else if (response.status.location === userLocation) {
          // 如果AI返回的位置和用户当前位置相同，确保用户位置正确
          // 这种情况通常表示用户和温婉在一起
          console.log(`[useDialogue] 确认用户位置: ${userLocation} (与温婉位置一致)`);
        }
      }

      // 处理生成的推特
      if (response.generatedTweet && response.generatedTweet.content) {
        const newTweet: Tweet = {
          id: Date.now().toString(),
          author: "婉婉酱_Ovo",
          handle: "@wenwan_cute",
          avatar: avatarUrl,
          content: response.generatedTweet.content,
          hasImage: true,
          imageDescription: response.generatedTweet.imageDescription,
          likes: 0,
          retweets: 0,
          time: "刚刚",
          isPrivate: false,
          comments: 0,
        };
        setTweets((prev) => [newTweet, ...prev]);
        const contentPreview =
          response.generatedTweet.content.length > 10
            ? response.generatedTweet.content.substring(0, 10) + "..."
            : response.generatedTweet.content;
        addMemory(
          "新推特",
          `温婉发布了一条新动态: "${contentPreview}"`,
          "border-pink-300"
        );
      }

      // 更新建议操作
      let actions = response.suggestedActions || [];
      // 如果不在同一位置，添加移动建议
      if (userLocation !== response.status.location) {
        const moveAction = `前往 ${response.status.location}`;
        if (!actions.includes(moveAction) && !actions.includes("找温婉")) {
          actions = [moveAction, ...actions];
        }
      }

      // 如果建议操作不足3个，补充默认操作
      const defaultActions = ["观察四周", "给温婉发微信", "思考", "休息一会"];
      while (actions.length < 3) {
        const randomAction =
          defaultActions[Math.floor(Math.random() * defaultActions.length)];
        if (!actions.includes(randomAction)) {
          actions.push(randomAction);
        }
      }
      setSuggestedActions(actions.slice(0, 5));

      // AI回复成功后自动保存（保存到槽位0）
      if (onSaveGame) {
        try {
          onSaveGame(0);
          console.log('[useDialogue] AI回复后自动保存成功');
        } catch (saveError) {
          console.error('[useDialogue] 自动保存失败:', saveError);
          // 保存失败不影响游戏流程，只记录错误
        }
      }
    } catch (error: any) {
      // 错误处理：显示错误消息并停止加载
      console.error("AI调用错误:", error);
      
      // 创建重新生成函数
      const retryAction = () => {
        if (lastActionRef.current) {
          // 移除错误消息和上一次的用户消息（如果存在）
          setMessages((prev) => {
            const filtered = prev.filter((msg) => {
              // 移除错误消息
              if (msg.sender === "system" && (msg.text.includes("AI调用失败") || msg.text.includes("❌"))) {
                return false;
              }
              // 如果是重新生成，移除上一次的用户消息（避免重复）
              if (lastActionRef.current?.userMessageId && msg.id === lastActionRef.current.userMessageId) {
                return false;
              }
              return true;
            });
            return filtered;
          });
          // 重新执行最后一次操作
          handleAction(lastActionRef.current.actionText, lastActionRef.current.isSystemAction);
        }
      };

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "system",
          text: `❌ AI调用失败: ${
            error.message || "未知错误"
          }。请检查设置中的API配置。`,
          timestamp: new Date(),
          isRetryable: true,
          retryAction: retryAction,
        },
      ]);
      // 恢复默认建议操作
      setSuggestedActions(["观察四周", "给温婉发微信", "思考"]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    input,
    isLoading,
    suggestedActions,
    setInput,
    handleAction,
    addMemory,
  };
};
