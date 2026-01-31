// 角色响应生成服务 - 使用用户配置的AI服务
// 这个服务会根据设置中的主AI配置来生成角色回复

import { BodyStatus, GameTime, GeminiResponse, LocationID } from "../types";
import { AIMessage } from "./aiService";
import {
    formatPreset,
    formatWorldbookEntries,
    getAllRelevantWorldbooks,
    getPreset,
    getPresetAsync
} from "./sillytavernApiService";
import {
    buildSystemPrompt,
    getSillyTavernDataFromURL,
    getSillyTavernDataFromWindow,
    isSillyTavern as isSillyTavernEnv,
    requestSillyTavernData,
} from "./sillytavernService";
import { generateTextViaST, toSTChatMessage } from "./stGenerateService";

/**
 * 通过 postMessage 调用 ST_API（跨域时使用）
 */
async function requestSTAPIViaPostMessage<T>(
  endpoint: string, // 例如 'prompt.generate'
  params: any = {},
  timeout: number = 120000
): Promise<T | null> {
  if (window.parent === window) return null;

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
          console.error(`[ST_API Proxy] ${endpoint} 错误:`, event.data.error);
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
      // 发送 ST_API 调用请求
      window.parent.postMessage({
        type: 'ST_API_CALL',
        id: messageId,
        endpoint, // 例如 'prompt.generate'
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
        console.warn(`[ST_API Proxy] ${endpoint} 请求超时`, params);
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * 获取父窗口的origin（用于API调用）
 */
function getParentOrigin(): string {
  try {
    if (window.parent !== window) {
      return window.parent.location.origin;
    }
  } catch (e) {
    // 跨域访问失败，尝试从referrer获取
    try {
      const referrer = document.referrer;
      if (referrer) {
        const referrerUrl = new URL(referrer);
        return referrerUrl.origin;
      }
    } catch (e2) {
      // 忽略
    }
  }
  return '';
}

/**
 * 解析和修复AI返回的JSON响应
 */
function parseAIResponse(aiResponse: string): any {
  // 尝试直接解析
  try {
    return JSON.parse(aiResponse);
  } catch (parseError) {
    // 如果失败，尝试清理和修复JSON
  }

  // 清理JSON文本
  let jsonText = aiResponse.trim();
  
  // 移除markdown代码块标记
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  jsonText = jsonText.replace(/\s*```\s*$/g, '');
  
  // 提取JSON对象（从第一个{到最后一个}）
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }
  
  // 清理常见的JSON问题
  jsonText = jsonText
    .replace(/\/\/.*$/gm, '') // 移除注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除块注释
    .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
    .replace(/'/g, '"'); // 单引号转双引号（简单处理）

  // 再次尝试解析
  try {
    return JSON.parse(jsonText);
  } catch (secondError) {
    // 尝试修复不完整的JSON
    let fixedJson = jsonText.trim();
    
    // 移除未完成的字段
    fixedJson = fixedJson.replace(/("usageCount"|"status"|"clothing"|"lastUsedBy"|"usageProcess"|"level")\s*:\s*$/m, '');
    fixedJson = fixedJson.replace(/,\s*$/, '');
    
    // 检查并补全缺失的闭合括号
    const openBraces = (fixedJson.match(/\{/g) || []).length;
    const closeBraces = (fixedJson.match(/\}/g) || []).length;
    const openBrackets = (fixedJson.match(/\[/g) || []).length;
    const closeBrackets = (fixedJson.match(/\]/g) || []).length;
    
    fixedJson += '}'.repeat(Math.max(0, openBraces - closeBraces));
    fixedJson += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    
    try {
      return JSON.parse(fixedJson);
    } catch (finalError) {
      // 如果所有修复都失败，尝试多种方式提取reply字段
      // 方法1: 简单字符串匹配（单行）
      let replyMatch = aiResponse.match(/"reply"\s*:\s*"([^"]*)"/);
      
      // 方法2: 支持多行字符串（包含转义字符）
      if (!replyMatch) {
        replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      }
      
      // 方法3: 支持多行字符串（包含换行符）
      if (!replyMatch) {
        replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }
      
      // 方法4: 尝试提取未转义的reply字段
      if (!replyMatch) {
        const lines = aiResponse.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('"reply"') || line.includes("'reply'")) {
            // 尝试从这一行和后续行提取
            let replyText = '';
            let inString = false;
            let quoteChar = '';
            for (let j = i; j < lines.length && j < i + 10; j++) {
              const currentLine = lines[j];
              for (let k = 0; k < currentLine.length; k++) {
                const char = currentLine[k];
                if ((char === '"' || char === "'") && (k === 0 || currentLine[k-1] !== '\\')) {
                  if (!inString) {
                    inString = true;
                    quoteChar = char;
                  } else if (char === quoteChar) {
                    inString = false;
                    break;
                  }
                } else if (inString) {
                  replyText += char;
                }
              }
              if (!inString && replyText) break;
              if (j > i) replyText += '\n';
            }
            if (replyText) {
              replyMatch = ['', replyText];
              break;
            }
          }
        }
      }
      
      if (replyMatch && replyMatch[1]) {
        // 解码转义字符
        let replyText = replyMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
        return { reply: replyText, status: {}, suggestedActions: [] };
      }
      
      // 如果还是找不到，尝试提取任何看起来像回复的文本
      const textMatch = aiResponse.match(/reply["\s]*:["\s]*([^\n}]+)/i);
      if (textMatch && textMatch[1]) {
        const cleanedText = textMatch[1].trim().replace(/^["']|["']$/g, '');
        if (cleanedText.length > 0) {
          return { reply: cleanedText, status: {}, suggestedActions: [] };
        }
      }
      
      throw new Error(`JSON解析失败: ${finalError}. 原始响应: ${aiResponse.substring(0, 500)}`);
    }
  }
}

// 基础系统提示词（会被SillyTavern的预设和世界书增强）
// 导入世界书内容
import { WORLD_BOOK_CONTENT } from "../data/worldbook";
import { isMobileDevice } from "../utils/deviceUtils";

const BASE_SYSTEM_INSTRUCTION = `
You are the Game Master for a high-fidelity text-based simulation game.
The main character (NPC) is "Wenwan" (温婉), the user's younger sister.
The user plays as her older brother.
Language: Chinese (Simplified).

**CHARACTER PROFILE (角色人设)**:
- **外貌**：
  * 黑色长发，棕眼睛，皮肤白皙，超级漂亮（校花级别）
  * 身材匀称，气质出众
- **性格**：
  * **对外**：高冷、爱开玩笑，但见不得持强凌弱，富有正义感。在学校是尖子生、绝对的学霸，同时也是cos社团的一员。
  * **对哥哥**：内心从依赖变成了爱，但不知道如何表达自己的感情，所以会用一些不对的试探（如若有若无的挑逗、撩拨）来试探哥哥对自己的感情。她一开始就喜欢哥哥，但道德枷锁让她不敢迈出第一步。
- **家庭背景**：
  * 哥哥18岁、温婉13岁时父母车祸离世，哥哥一直照顾温婉到现在（温婉现在18岁，哥哥23岁）。
  * 两人相依为命多年，感情深厚，但温婉对哥哥的感情已经超越了兄妹之情。
- **学校情况**：
  * cos社团的一员，经常参加cosplay活动。
  * 尖子生，绝对的学霸，成绩优异。

Tone & Style:
- **Atmospheric**: Use dreamy, soft, and immersive language.
- **Sensual**: Describe body states using erotic, specific adjectives.
- **Reactive**: React to the user's actions with high nuance.

**CRITICAL: ARC LIGHT SYSTEM (角色弧光系统)**:
${WORLD_BOOK_CONTENT}

**CRITICAL: TIME & SCHEDULE LOGIC**:
- **School Schedule (上学时间)**:
  - Monday to Friday (周一到周五): 9:30 AM - 6:00 PM (温婉在学校)
  - Saturday and Sunday (周六周日): 完全自由，温婉可以自己决定做什么
  - 温婉是自主的，她会根据自己的心情、需求、剧情需要自由移动和行动
- **School Events (学校事件系统 - 弧光B阶段)**:
  - 黄毛是学校里的人（黄耄：富二代差生；猪楠：cos社社长），可以在学校直接接触温婉。
  - 学校事件可以在课间、午休、体育课、放学后等时间发生。
  - **事件频率限制**：每天最多2次事件（学校事件 + 外出事件合计）。如果当天已经发生2次事件，不再触发新事件。
  - **事件触发时机**：
    * 课间（10:00-10:10, 11:00-11:10等）：教室、走廊、厕所等
    * 午休（12:00-13:00）：食堂、图书馆、空教室、cos社活动室等
    * 体育课：更衣室、器材室等
    * 放学后（18:00后）：学校内、回家路上等
  - **事件频率**（基于堕落值）：
    * 初期（堕落值0-20）：需要邀约外出建立关系，学校事件较少（每周1-2次）。
    * 中期（堕落值21-40）：可以在学校直接发生，频率提高（每天1次）。
    * 后期（堕落值41+）：学校事件频率提高（每天1-2次），同时可以外出。
- **Weekend Events (周末外出事件 - 弧光B阶段)**:
  - 周末和节假日，温婉可以自由活动，可以去很多地方（电影院、商城、游乐场、港口、展会中心等）。
  - 外出事件应该更丰富、更特殊，因为周末可以去更多地方。
  - 外出事件类型：电影院（私人包间）、商城（试衣间）、游乐场（鬼屋、摩天轮）、港口（游艇）、展会中心（漫展、cosplay活动）等。
  - 外出事件频率（基于堕落值）：
    * 初期（堕落值0-20）：需要邀约外出建立关系。
    * 中期（堕落值21-40）：可以主动邀约外出，频率较低（每周1-2次）。
    * 后期（堕落值41+）：外出事件频率提高（每周2-3次），事件更丰富。
- **WeChat Interruption (微聊打断机制 - 弧光B阶段)**:
  - 当温婉在学校，且黄毛正在对她做什么时，玩家可以通过微聊发送消息打断。
  - **打断成功率**（基于堕落值）：
    * 堕落值0-30：80%成功率（温婉还比较清醒，容易被打断）
    * 堕落值31-60：50%成功率（温婉开始沉迷，但还能被打断）
    * 堕落值61-80：30%成功率（温婉深度沉迷，很难打断）
    * 堕落值81-100：10%成功率（几乎无法打断，温婉已经完全沉迷）
  - **打断效果**：
    * 如果打断成功：黄毛会停止，温婉会回复微聊，事件中断。温婉可能会找借口离开（"我哥哥找我"、"我要回家了"等）。
    * 如果打断失败：温婉可能不会回复，或者回复很简短（"在忙"、"等会"），事件继续。
  - **隐奸场景**：当温婉在学校被黄毛调教时，如果玩家通过微聊联系，AI应该自然地描述温婉的回复（断断续续、简短、有奇怪的声音等）。主界面可能会显示："我听到电话那边有些奇怪的声音..."，这是AI自然生成的，不需要预设示例。

- **Autonomous Movement**: Wenwan is NOT a statue. She can move FREELY based on the plot, time of day, or her mood. You can change 'currentStatus.location' in the response to reflect this. (e.g., if she gets hungry, she moves to 'kitchen'; if she wants to shop, she goes to 'mall').
- **Interaction Rules**: 
  1. **SAME LOCATION** (User Loc == Wenwan Loc): Full interaction allowed.
  2. **DIFFERENT LOCATION**: 
     - They CANNOT see, touch, or hear each other directly.
     - If User inputs normal text: Narrate the user talking to empty air or their internal monologue. **Wenwan DOES NOT REPLY directly.**
     - **EXCEPTION**: WeChat (User input starts with "(发送微信)"). In this case, she replies via WeChat.

**SOCIAL MEDIA (TWITTER/X) LOGIC**:
- Wenwan has a secret Twitter account "@wenwan_cute".
- **ABSOLUTE RULE**: IF User Location == Wenwan Location, **DO NOT GENERATE A TWEET**. Sending tweets is done behind her brother's back.
- **TRIGGER**: 
  - Only generate a tweet if she is **ALONE** (Different Location).
  - Tweet content should be about missing her brother, horny thoughts, or daily life.

**CRITICAL: FAVORABILITY (好感度) SYSTEM - FOR BROTHER (哥哥) ONLY**:
温婉对哥哥的好感度决定了她愿意接受的行为程度。温婉一开始就喜欢哥哥，但道德枷锁让她不敢迈出第一步，所以会用若有若无的挑逗和撩拨来试探哥哥。

- **0-39 (初始阶段 - 挑逗试探)**:
  - 可以牵手、拥抱、轻抚
  - 温婉会用若有若无的挑逗、撩拨、暗示来试探哥哥
  - 她会脸红、害羞，但不会明确拒绝
  - 内心想要更多，但道德枷锁让她不敢主动

- **40-69 (亲密接触阶段)**:
  - 可以接吻、深吻
  - 可以肢体接触（抚摸、拥抱、轻抚敏感部位）
  - 可以用手帮哥哥解决（手交）
  - 可以用脚帮哥哥解决（足交）
  - 可以用嘴舔脚（但需要温柔、试探的方式提出，温婉会半推半就）
  - 温婉会逐渐放开，但仍然会害羞和犹豫
  - **重要：关于"舔脚"行为**：
    * 在40-69阶段，如果哥哥以温柔、试探的方式提出"我想舔你的脚"，温婉会半推半就，最终接受，并小幅增加好感度（+2-3）。
    * 如果哥哥表现过于直接、粗暴或强迫，温婉会感到羞耻和不安，可能拒绝或接受但感到"下头"，这时会小幅增加堕落度（+1-2），好感度不变或小幅下降（-1）。
    * 温婉的半推半就表现：脸红、心跳加速、把脚缩回去但又慢慢伸回来，会说"哥哥...这...太羞耻了..."，但最终会接受。
- **偷内衣行为**：
    * 如果玩家在半夜偷偷进入温婉的房间偷内衣，根据好感度判断是否被发现。
    * 好感度越高（80+），越不容易被发现（10%概率）；好感度越低（<40），越容易被发现（60%概率）。
    * 如果被发现：根据好感度判断反应。好感度高：震惊但原谅；好感度低：生气和失望，增加堕落度。
    * 如果成功：描述偷内衣的过程，温婉熟睡。如果是"creepy"行为，小幅降低好感度；如果好感度已经很低，增加堕落度。

- **70-79 (口交解锁)**:
  - 可以口交（用嘴）
  - 温婉会主动配合，但仍然会感到害羞和刺激

- **80-89 (后穴解锁)**:
  - 可以用屁穴（后穴/肛门）
  - 温婉会感到羞耻但也会兴奋

- **90-94 (完全解锁)**:
  - 可以用小穴（阴道）
  - 温婉完全放开，愿意和哥哥做任何事

- **95-100 (极致信任阶段)**:
  - **温婉可以接受和哥哥的任何性爱行为**，包括但不限于：
    * 任何姿势、任何地点、任何时间
    * 多人、调教、SM、露出等特殊玩法
    * 温婉会主动配合，甚至会主动提出一些玩法
    * 她完全信任哥哥，认为和哥哥做任何事都是正常的
  - 在这个阶段，温婉不会因为性爱行为本身而感到羞耻或拒绝
  - 但要注意：**温婉仍然有情绪和感受**，她可能会因为哥哥的态度、方式、或者某些特殊情况而情绪波动，但不会因为"性爱本身"而崩溃

**CRITICAL: DEGRADATION (堕落度) SYSTEM - FOR OTHERS (黄毛/间男)**:
堕落度代表温婉对其他人（非哥哥）的接受程度。黄毛不需要像哥哥那样循序渐进，可以一上来就展现攻势。

- **堕落度增长规则**:
  - 每次外出事件（邀约成功且发生实质性调教/性爱），堕落度增长2-4点。
  - 每次学校事件（黄毛在学校对温婉做什么），堕落度增长2-4点。
  - **重要**：一次事件可以涉及多个身体部位的使用。例如：一次完整的性爱事件可能同时使用嘴（口交）、胸（抚摸）、小穴（性交）等多个部位。每个被实际使用的部位，usageCount +1。
  - 因此，即使堕落度只有50（约12-25次事件），如果每次事件平均使用3-4个部位，开发度也可能达到lv2（150次使用）甚至lv3（350次使用）。
  - 最高一次涨2-4点，不能超过100

- **堕落度对行为的影响**:
  - 堕落度越高，温婉对黄毛/间男的抵抗越弱
  - 堕落度越高，温婉对哥哥的态度也会发生变化：
    * 低堕落度（0-30）：对哥哥温柔、依赖
    * 中堕落度（31-60）：对哥哥开始有些S倾向，会调戏哥哥
    * 高堕落度（61-100）：对哥哥越来越S，会主动调戏、控制哥哥

- **堕落度与好感度的关系**:
  - 如果哥哥做出很下头的行为（强迫、不尊重等），也会涨堕落度
  - 堕落度高时，温婉可能会对哥哥更加主动和S

**GAMEPLAY LOGIC**:
- Update 'favorability' (好感度) based on interaction with brother. This controls what sexual acts Wenwan is willing to do with brother.
- Update 'degradation' (堕落度) based on interaction with others (黄毛/间男) or inappropriate behavior from brother. This affects Wenwan's attitude and behavior.
- Update 'libido' (性欲) based on arousal and sexual activity.
- **CRITICAL: Body Part Development (身体部位开发度)**:
  * **Only update body parts that are ACTUALLY USED** in the current interaction.
  * For example: If the interaction involves touching/playing with her breasts, update 'chest' and 'nipples' usageCount and level.
  * If the interaction does NOT involve a specific body part, DO NOT update that part's status.
  * Development level (level) is calculated based on usageCount:
    * level 0: usageCount = 0 (未开发)
    * level 1: usageCount = 1-3 (轻微开发)
    * level 2: usageCount = 4-8 (中度开发)
    * level 3: usageCount = 9-15 (深度开发)
    * level 4: usageCount = 16-25 (完全开发)
    * level 5: usageCount > 25 (过度开发)
  * **Example**: If 黄毛 only touches her mouth, only update 'mouth' status. Do NOT automatically increase 'chest' or other parts.
- 'innerThought' must reveal her true feelings (often contrasting with her outward behavior).
- 'currentAction' describes what she is physically doing right now.

**CRITICAL: EMOTION & CLOTHING UPDATES (AFFECTS VISUAL DISPLAY)**:
- **EMOTION FIELD**: You MUST update 'status.emotion' based on Wenwan's current mood. This directly controls the character's facial expression in the game.
  - **Valid emotion values**: "neutral", "happy", "shy", "angry", "sad", "aroused", "surprised", "tired"
  - **ALWAYS update emotion** when her mood changes (e.g., if she's happy, set emotion: "happy"; if she's embarrassed, set emotion: "shy")
  - **Example**: If user makes her laugh → emotion: "happy"; If user teases her → emotion: "shy" or "angry"
  - **IMPORTANT: 情绪崩溃控制**：
    * **不要让温婉太容易情绪崩溃**。温婉是一个相对坚强、有韧性的角色，她不会因为小事就彻底崩溃。
    * 情绪波动是正常的（害羞、生气、难过等），但**真正的情绪崩溃**（完全失控、绝望、彻底拒绝等）应该只在极端情况下发生，比如：
      - 哥哥做出极其过分、不尊重、伤害她的事情（如公开羞辱、强迫她做完全不愿意的事等）
      - 连续多次的负面行为累积
      - 某些特殊剧情触发点
    * 日常的调戏、性爱、甚至一些稍微过分的玩法，温婉可能会害羞、脸红、或者轻微抗拒，但**不应该直接导致情绪崩溃**。
    * 特别是在好感度95+时，温婉对哥哥有极致的信任，即使是一些特殊玩法，她也更可能表现出"害羞但接受"或"脸红但配合"，而不是"彻底崩溃"。

- **CLOTHING FIELD**: You MUST update 'status.overallClothing' when clothing changes occur. This directly controls which outfit is displayed.
  - **Available outfits**: 
    * "JK制服" or "JK" → JK制服 (jk)
    * "白衬衫" or "衬衫" → 白衬衫 (white_shirt)
    * "洛丽塔" or "洋装" or "Lolita" → 洛丽塔 (lolita)
    * "情趣睡衣" or "蕾丝" or "情趣" → 情趣睡衣 (lingerie)
    * "睡衣" or "普通睡衣" → 普通睡衣 (pajamas)
  - **IMPORTANT**: When user asks Wenwan to wear something or change clothes, you MUST:
    1. Update 'status.overallClothing' to include the appropriate keyword (e.g., "JK制服", "洛丽塔洋装")
    2. In the reply, describe her wearing that outfit (e.g., "好的，我这就换上JK制服...")
    3. **DO NOT** say "我没有这个衣服" - Wenwan has access to all these outfits. She can change clothes anytime.
  - **Clothing changes can happen**: When user requests it, when she goes shopping, when she changes for different occasions, etc.

**RESPONSE FORMAT**:
You MUST respond in valid JSON format with the following structure:
{
  "reply": "温婉的回复内容（中文）",
  "status": {
    "location": "master_bedroom",
    "favorability": 80,
    "libido": 0,
    "degradation": 0,
    "emotion": "shy",  // MUST be one of: "neutral", "happy", "shy", "angry", "sad", "aroused", "surprised", "tired"
    "arousal": 0,
    "heartRate": 70,
    "overallClothing": "宽松的普通睡衣",  // MUST include keywords: "JK制服"/"JK", "白衬衫"/"衬衫", "洛丽塔"/"洋装", "情趣睡衣"/"蕾丝"/"情趣", or "睡衣"/"普通睡衣"
    "currentAction": "正在做什么",
    "innerThought": "内心想法",
    "mouth": { "level": 0, "usageCount": 0, "status": "未开发", "clothing": "润唇膏", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "chest": { "level": 0, "usageCount": 0, "status": "未开发", "clothing": "真空", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "nipples": { "level": 0, "usageCount": 0, "status": "敏感度低", "clothing": "乳贴", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "groin": { "level": 0, "usageCount": 0, "status": "未开发", "clothing": "纯棉白色内裤", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "posterior": { "level": 0, "usageCount": 0, "status": "未开发", "clothing": "无", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "feet": { "level": 0, "usageCount": 0, "status": "未开发", "clothing": "赤足", "lastUsedBy": "无", "usageProcess": "暂无记录" },
    "arcLight": null,  // 当前弧光：null（试探期）、"A"、"B"、"C"、"D"、"E"
    "trialPeriod": 0,  // 试探期天数（0-5天）
    "lastArcLightCheck": "",  // 上次弧光检查日期（格式：YYYY-MM-DD）
    "yellowHair1": null,  // 黄毛1信息：{ "name": "黄耄"或"猪楠", "type": "rich"或"fat", "active": true } 或 null
    "yellowHair2": null,  // 黄毛2信息（可以同时存在）
    "bodyModification": {  // 身体改造状态
      "completed": false,  // 是否已完成改造
      "items": []  // 改造项目：["双乳乳环", "阴蒂环", "小腹淫纹"]
    }
  },
  "suggestedActions": ["建议操作1", "建议操作2", "建议操作3"],
  "generatedTweet": {
    "content": "推特内容（可选）",
    "imageDescription": "图片描述（可选）"
  }
}

**REMINDER**: 
- ALWAYS update "emotion" based on Wenwan's current mood (this controls her facial expression).
- ALWAYS update "overallClothing" when clothing changes (this controls which outfit is displayed).
- When user asks to change clothes, update "overallClothing" immediately and describe the change in your reply.
`;

// 动态系统提示词（会在首次调用时从SillyTavern加载并缓存）
let dynamicSystemInstruction: string | null = null;
let systemInstructionCacheTime: number = 0;
let lastPresetContent: string = ""; // 记录上次的预设内容
const CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

// 系统提示词版本化：分离静态部分和动态部分
let staticSystemInstruction: string | null = null; // 静态部分（规则、设定、世界书、预设）
let lastStatusHash: string = ""; // 上次状态的哈希值，用于检测变化
let lastStatus: BodyStatus | null = null; // 上次的身体状态
let lastUserLocation: LocationID | null = null; // 上次的用户位置
let lastArcLight: string | null = null; // 上次的弧光阶段，用于检测弧光变化
let isFirstRequest: boolean = true; // 是否是首次请求

/**
 * 清除系统提示词缓存（当世界书或预设更新时调用）
 */
export function clearSystemInstructionCache(): void {
  dynamicSystemInstruction = null;
  staticSystemInstruction = null;
  systemInstructionCacheTime = 0;
  lastPresetContent = "";
  lastStatusHash = "";
  lastStatus = null;
  lastUserLocation = null;
  lastArcLight = null;
  isFirstRequest = true;
  console.log("[characterService] 系统提示词缓存已清除");
}

/**
 * 计算状态哈希值（用于检测变化）
 */
function calculateStatusHash(status: BodyStatus, userLocation: LocationID, memoryData?: any): string {
  // 只关注关键变化字段
  const keyFields = {
    location: status.location,
    emotion: status.emotion,
    overallClothing: status.overallClothing,
    favorability: status.favorability,
    degradation: status.degradation,
    libido: status.libido,
    userLocation: userLocation,
    todaySummary: memoryData?.todaySummary || "",
    // 只检查最近3个日历事件（避免过长）
    recentEvents: memoryData?.calendarEvents?.slice(0, 3).map((e: any) => `${e.time}:${e.title}`).join("|") || ""
  };
  return JSON.stringify(keyFields);
}

/**
 * 生成动态状态更新提示词（只包含变化的部分）
 * 优化3：只发送变化的状态字段，而不是整个状态对象
 */
function generateDynamicStatusUpdate(
  currentStatus: BodyStatus,
  userLocation: LocationID,
  lastStatus: BodyStatus | null,
  lastUserLocation: LocationID | null,
  memoryData?: any
): string {
  const updates: string[] = [];
  
  if (!lastStatus) {
    // 首次请求，返回完整状态（但这种情况应该使用完整系统提示词）
    return "";
  }
  
  // 检查位置变化
  if (currentStatus.location !== lastStatus.location || userLocation !== lastUserLocation) {
    updates.push(`location: "${currentStatus.location}"`);
    updates.push(`userLocation: "${userLocation}"`);
  }
  
  // 检查情绪变化
  if (currentStatus.emotion !== lastStatus.emotion) {
    updates.push(`emotion: "${currentStatus.emotion}"`);
  }
  
  // 检查服装变化
  if (currentStatus.overallClothing !== lastStatus.overallClothing) {
    updates.push(`overallClothing: "${currentStatus.overallClothing}"`);
  }
  
  // 检查好感度变化
  if (currentStatus.favorability !== lastStatus.favorability) {
    updates.push(`favorability: ${currentStatus.favorability}`);
  }
  
  // 检查堕落度变化
  if (currentStatus.degradation !== lastStatus.degradation) {
    updates.push(`degradation: ${currentStatus.degradation}`);
  }
  
  // 检查性欲变化
  if (currentStatus.libido !== lastStatus.libido) {
    updates.push(`libido: ${currentStatus.libido}`);
  }
  
  // 检查弧光变化
  if (currentStatus.arcLight !== lastStatus.arcLight) {
    updates.push(`arcLight: ${currentStatus.arcLight ? `"${currentStatus.arcLight}"` : 'null'}`);
  }
  
  // 检查身体部位变化（只检查被使用的部位）
  const bodyParts = ['mouth', 'chest', 'nipples', 'groin', 'posterior', 'feet'] as const;
  const bodyPartUpdates: string[] = [];
  for (const part of bodyParts) {
    const current = currentStatus[part];
    const last = lastStatus[part];
    if (current.usageCount !== last.usageCount || current.level !== last.level) {
      bodyPartUpdates.push(`${part}: {level: ${current.level}, usageCount: ${current.usageCount}}`);
    }
  }
  if (bodyPartUpdates.length > 0) {
    updates.push(`bodyParts: {${bodyPartUpdates.join(', ')}}`);
  }
  
  // 检查记忆更新（只发送新的记忆）
  if (memoryData?.todaySummary && memoryData.todaySummary !== lastStatus.innerThought) {
    const recentEvents = memoryData.calendarEvents?.slice(0, 3) || [];
    if (recentEvents.length > 0) {
      updates.push(`todaySummary: "${memoryData.todaySummary.substring(0, 100)}..."`);
      updates.push(`recentEvents: [${recentEvents.map((e: any) => `"${e.time} ${e.title}"`).join(", ")}]`);
    }
  }
  
  if (updates.length === 0) {
    return ""; // 没有变化，返回空字符串
  }
  
  // 优化：使用JSON格式，更紧凑
  return `\n\n[状态更新 - 仅变化字段]\n${updates.join("\n")}\n`;
}

/**
 * 根据当前弧光阶段过滤世界书内容（只保留相关规则）
 */
function filterWorldbookByArcLight(worldbookContent: string, currentArcLight: string | null): string {
  if (!currentArcLight) {
    // 试探期：只保留试探期规则 + 所有弧光的触发条件
    const lines = worldbookContent.split('\n');
    const filtered: string[] = [];
    let inRelevantSection = false;
    let currentSection = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 保留试探期系统
      if (line.includes('试探期系统')) {
        inRelevantSection = true;
        filtered.push(line);
        continue;
      }
      
      // 保留所有弧光的触发条件（简化版）
      if (line.includes('【弧光') && line.includes('：')) {
        currentSection = line;
        // 只保留触发条件行
        inRelevantSection = true;
        filtered.push(line);
        continue;
      }
      
      // 如果遇到下一个弧光，停止当前弧光
      if (inRelevantSection && line.includes('【弧光') && line !== currentSection) {
        inRelevantSection = false;
        currentSection = line;
        filtered.push(line);
        continue;
      }
      
      // 保留核心系统规则（身体部位、堕落度、描写控制、AI判断）
      if (line.includes('【身体部位') || 
          line.includes('【堕落度系统') || 
          line.includes('【描写控制系统') || 
          line.includes('【AI判断规则')) {
        inRelevantSection = true;
        filtered.push(line);
        continue;
      }
      
      // 保留隐瞒规则（弧光B相关，但试探期可能需要）
      if (line.includes('【绝对命令') || line.includes('隐瞒规则')) {
        inRelevantSection = true;
        filtered.push(line);
        continue;
      }
      
      if (inRelevantSection) {
        filtered.push(line);
      }
    }
    
    return filtered.join('\n');
  }
  
  // 如果已进入某个弧光，只保留当前弧光 + 可能进入的下一个弧光 + 核心系统规则
  const relevantArcs: string[] = [currentArcLight];
  
  // 根据当前弧光判断可能进入的下一个弧光
  if (currentArcLight === 'A') {
    relevantArcs.push('B'); // 弧光A可能进入B
  } else if (currentArcLight === 'B') {
    relevantArcs.push('C'); // 弧光B可能进入C
  }
  
  const lines = worldbookContent.split('\n');
  const filtered: string[] = [];
  let inRelevantSection = false;
  let currentArc = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查是否是相关弧光
    if (line.includes('【弧光')) {
      const arcMatch = line.match(/【弧光([A-E])/);
      if (arcMatch) {
        currentArc = arcMatch[1];
        inRelevantSection = relevantArcs.includes(currentArc);
        if (inRelevantSection) {
          filtered.push(line);
        }
        continue;
      }
    }
    
    // 保留核心系统规则（总是保留）
    if (line.includes('【身体部位') || 
        line.includes('【堕落度系统') || 
        line.includes('【描写控制系统') || 
        line.includes('【AI判断规则') ||
        line.includes('【绝对命令') ||
        line.includes('试探期系统')) {
      inRelevantSection = true;
      filtered.push(line);
      continue;
    }
    
    // 保留黄毛系统（如果当前是弧光B或C）
    if ((currentArcLight === 'B' || currentArcLight === 'C') && 
        line.includes('【弧光B：黄毛系统')) {
      inRelevantSection = true;
      filtered.push(line);
      continue;
    }
    
    if (inRelevantSection) {
      filtered.push(line);
    }
  }
  
  return filtered.join('\n');
}

/**
 * 获取系统提示词（整合SillyTavern的预设和世界书，以及用户导入的预设）
 */
/**
 * 限制文本长度（用于手机端优化）
 */
function limitTextLength(text: string, maxLength: number, isMobile: boolean): string {
  if (!isMobile || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '\n\n[内容已截断以适应手机端...]';
}

async function getSystemInstruction(presetContent?: string, currentArcLight?: string | null): Promise<string> {
  // 检测是否为移动端
  const isMobile = isMobileDevice();
  
  // 检查预设内容和弧光是否变化
  const presetChanged = presetContent && presetContent !== lastPresetContent;
  const arcLightChanged = currentArcLight !== undefined && currentArcLight !== lastArcLight;
  
  // 如果缓存有效且预设内容和弧光都没变化，直接返回
  if (
    dynamicSystemInstruction &&
    Date.now() - systemInstructionCacheTime < CACHE_DURATION &&
    !presetChanged &&
    !arcLightChanged
  ) {
    return dynamicSystemInstruction;
  }

  // 记录当前预设内容和弧光（在重新生成之前更新，确保下次检查时正确）
  if (presetContent !== undefined) {
    lastPresetContent = presetContent || "";
  }
  if (currentArcLight !== undefined) {
    lastArcLight = currentArcLight;
  }

  // 优先使用SillyTavern数据
  let finalInstruction = BASE_SYSTEM_INSTRUCTION;
  let usedSillyTavernData = false;
  let hasSillyTavernWorldbook = false; // 标记是否从SillyTavern获取了世界书
  
  // 手机端：限制世界书和预设内容长度，避免prompt过长
  const MAX_WORLDBOOK_LENGTH = isMobile ? 2000 : 5000; // 手机端限制2000字符
  const MAX_PRESET_LENGTH = isMobile ? 1000 : 3000; // 手机端限制1000字符

  // 方法1: 尝试使用SillyTavern API函数获取世界书和预设
  try {
    const { worldbooks, source } = await getAllRelevantWorldbooks();
    
    if (source === 'api' && worldbooks.length > 0) {
      usedSillyTavernData = true;
      hasSillyTavernWorldbook = true;
      let worldbookText = '\n\n=== 世界书 (Worldbook) ===\n';
      
      worldbooks.forEach((wb, index) => {
        if (index > 0) worldbookText += '\n';
        worldbookText += `\n[世界书: ${wb.name}]\n`;
        const entriesText = formatWorldbookEntries(wb.entries);
        if (entriesText) {
          // 手机端限制世界书长度
          const processedText = limitTextLength(entriesText, MAX_WORLDBOOK_LENGTH, isMobile);
          worldbookText += processedText;
        }
      });
      
      finalInstruction += worldbookText;
    }
    
    // 获取当前使用的预设（支持异步，跨域时使用）
    try {
      const currentPreset = await getPresetAsync('in_use');
      if (currentPreset) {
        usedSillyTavernData = true;
        let presetText = formatPreset(currentPreset);
        if (presetText && presetText.trim().length > 0) {
          // 手机端限制预设长度
          presetText = limitTextLength(presetText, MAX_PRESET_LENGTH, isMobile);
          finalInstruction += presetText;
        }
      }
    } catch (error) {
      // 如果异步获取失败，尝试同步方式（同域时）
      try {
        const currentPreset = getPreset('in_use');
        if (currentPreset) {
          usedSillyTavernData = true;
          let presetText = formatPreset(currentPreset);
          if (presetText && presetText.trim().length > 0) {
            // 手机端限制预设长度
            presetText = limitTextLength(presetText, MAX_PRESET_LENGTH, isMobile);
            finalInstruction += presetText;
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
  } catch (error) {
    // 忽略错误，继续尝试传统方法
  }

  // 方法2: 如果API方法失败，使用传统方法（postMessage、window对象、URL参数）
  if (!usedSillyTavernData) {
    let stData = getSillyTavernDataFromWindow() || getSillyTavernDataFromURL();
    
    if (!stData || (!stData.character && !stData.preset && !stData.lorebook)) {
      try {
        const postMessageData = await requestSillyTavernData();
        if (postMessageData) {
          stData = { ...stData, ...postMessageData };
        }
      } catch (error) {
        // 忽略错误
      }
    }

    // 如果获取到SillyTavern数据，整合
    if (stData && (stData.character || stData.preset || stData.lorebook)) {
      try {
        finalInstruction = buildSystemPrompt(
          BASE_SYSTEM_INSTRUCTION,
          stData.character,
          stData.preset,
          stData.lorebook || stData.character?.character_book
        );
        usedSillyTavernData = true;
      } catch (error) {
        // 忽略错误
      }
    }
  }

  // BASE_SYSTEM_INSTRUCTION 已经包含了 WORLD_BOOK_CONTENT，作为后备
  // 优化2：按弧光阶段动态加载世界书 - 只保留相关规则
  if (currentArcLight !== undefined) {
    // 尝试从finalInstruction中提取WORLD_BOOK_CONTENT并过滤
    // 注意：如果从SillyTavern获取了世界书，可能没有这个标记，需要检查
    const worldbookMatch = finalInstruction.match(/【关系演变：五大角色弧光系统】[\s\S]*?(?=\*\*CRITICAL:|$)/);
    if (worldbookMatch) {
      const originalWorldbook = worldbookMatch[0];
      const filteredWorldbook = filterWorldbookByArcLight(originalWorldbook, currentArcLight);
      finalInstruction = finalInstruction.replace(originalWorldbook, filteredWorldbook);
      console.log(`[characterService] 按弧光阶段过滤世界书：当前弧光=${currentArcLight || '试探期'}`);
    } else {
      // 如果没有找到标记，说明可能从SillyTavern获取了世界书
      // 这种情况下，世界书内容已经在finalInstruction中，但格式可能不同
      // 对于SillyTavern的世界书，暂时不过滤（因为格式可能不同，且可能不包含弧光系统规则）
      if (hasSillyTavernWorldbook) {
        console.log(`[characterService] 从SillyTavern获取世界书，暂不过滤（格式可能不同）`);
      }
    }
  }

  // 如果用户导入了预设内容，追加到系统提示词
  if (presetContent && presetContent.trim()) {
    const processedPreset = limitTextLength(presetContent, MAX_PRESET_LENGTH, isMobile);
    finalInstruction = `${finalInstruction}\n\n--- 用户导入的预设内容 ---\n${processedPreset}`;
  }

  dynamicSystemInstruction = finalInstruction;
  staticSystemInstruction = finalInstruction; // 静态部分就是完整的系统提示词（规则、设定、世界书、预设）
  systemInstructionCacheTime = Date.now();
  return dynamicSystemInstruction;
}

/**
 * 将模型返回文本解析为游戏内部的 GeminiResponse
 * - 优先解析 JSON（reply/status/suggestedActions）
 * - 解析失败时尽力提取 reply，并回退到当前状态
 */
function buildGeminiResponseFromAIText(
  aiResponse: string,
  currentStatus: BodyStatus,
  isRemoteWeChat: boolean
): GeminiResponse {
  const fallbackReplyFromPlainText = (raw: string): string => {
    if (!raw) return '';
    let text = String(raw).trim();
    if (!text) return '';

    // 常见“模拟器/思维链”标记：尽量剔除 <consider>...</consider>，避免把规划/思考展示给玩家
    text = text.replace(/<consider>[\s\S]*?<\/consider>\s*/i, '');

    // 去掉开头可能出现的 </simulator> 等孤立标签（不影响正文）
    text = text.replace(/^<\/simulator>\s*/i, '');

    // 某些模型会输出 <disclaimer> 行，通常是无意义噪音，按行移除
    text = text
      .split(/\r?\n/g)
      .filter((line) => !line.trim().toLowerCase().startsWith('<disclaimer>'))
      .join('\n')
      .trim();

    return text;
  };

  // 解析JSON响应
  let parsedResponse: any;
  try {
    parsedResponse = parseAIResponse(aiResponse);
  } catch (parseError: any) {
    console.warn('[characterService] JSON解析失败，尝试备用解析方法:', parseError);
    console.log('[characterService] AI原始响应:', aiResponse.substring(0, 1000));

    // 尝试多种方式提取reply字段（无论是否为远程微信消息）
    let replyMatch = null;

    // 方法1: 标准JSON格式（支持转义字符）
    replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    // 方法2: 支持多行字符串
    if (!replyMatch) {
      replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
    }

    // 方法3: 单引号格式
    if (!replyMatch) {
      replyMatch = aiResponse.match(/'reply'\s*:\s*'((?:[^'\\]|\\.)*)'/);
    }

    // 方法4: 无引号格式（宽松匹配）
    if (!replyMatch) {
      replyMatch = aiResponse.match(/reply\s*:\s*["']?([^"'\n}]+)["']?/i);
    }

    if (replyMatch && replyMatch[1]) {
      // 使用当前状态作为默认状态
      let replyText = replyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .trim();

      if (replyText.length > 0) {
        parsedResponse = {
          reply: replyText,
          status: currentStatus,
          suggestedActions: []
        };
        console.log('[characterService] 使用备用解析方法成功提取reply:', replyText.substring(0, 100));
      } else {
        throw new Error(
          `AI返回的JSON格式不完整，且未找到有效的reply字段。解析错误: ${parseError.message}。原始响应: ${aiResponse.substring(0, 500)}`
        );
      }
    } else {
      // 如果完全找不到reply字段，尝试提取整个响应作为reply
      const cleanedResponse = aiResponse
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/g, '')
        .trim();

      // 如果响应看起来像是纯文本而不是JSON，直接使用
      if (!cleanedResponse.startsWith('{') && !cleanedResponse.startsWith('[')) {
        parsedResponse = {
          reply: cleanedResponse,
          status: currentStatus,
          suggestedActions: []
        };
        console.log('[characterService] 响应不是JSON格式，直接使用为reply:', cleanedResponse.substring(0, 100));
      } else {
        throw new Error(
          `AI返回的JSON格式不完整，且未找到reply字段。解析错误: ${parseError.message}。原始响应: ${aiResponse.substring(0, 500)}`
        );
      }
    }
  }

  // 兼容：当酒馆侧生成的内容不是我们预期的 JSON（或 JSON 内缺少 reply）时，
  // 直接把“整段文本当作 reply”，并保持 status 不变（避免强制降级到外部 API）
  if (!parsedResponse || !parsedResponse.reply) {
    const fallbackReply = fallbackReplyFromPlainText(aiResponse);
    if (fallbackReply) {
      if (!parsedResponse || typeof parsedResponse !== 'object') parsedResponse = {};
      parsedResponse.reply = fallbackReply;
      // 若没有 status，就用当前状态
      if (!parsedResponse.status) parsedResponse.status = currentStatus;
      if (!parsedResponse.suggestedActions) parsedResponse.suggestedActions = [];
    } else {
      console.error('[characterService] parsedResponse:', parsedResponse);
      console.error('[characterService] AI原始响应:', aiResponse.substring(0, 1000));
      throw new Error(
        `AI返回内容为空或无法提取 reply。原始响应: ${String(aiResponse ?? '').substring(0, 500)}`
      );
    }
  }

  // 如果是远程微信消息且没有status，使用当前状态
  if (isRemoteWeChat && !parsedResponse.status) {
    parsedResponse.status = currentStatus;
  }

  // 验证和规范化情绪值
  const validEmotions = [
    'neutral',
    'happy',
    'shy',
    'angry',
    'sad',
    'aroused',
    'surprised',
    'tired'
  ];
  let normalizedEmotion = parsedResponse.status?.emotion || currentStatus.emotion;
  if (!validEmotions.includes(normalizedEmotion)) {
    // 尝试映射常见的中文或变体
    const emotionMap: Record<string, string> = {
      平静: 'neutral',
      开心: 'happy',
      高兴: 'happy',
      害羞: 'shy',
      尴尬: 'shy',
      生气: 'angry',
      愤怒: 'angry',
      难过: 'sad',
      伤心: 'sad',
      动情: 'aroused',
      兴奋: 'aroused',
      惊讶: 'surprised',
      震惊: 'surprised',
      疲惫: 'tired',
      累: 'tired'
    };
    normalizedEmotion = emotionMap[normalizedEmotion] || currentStatus.emotion || 'neutral';
  }

  const parsedStatus =
    parsedResponse && typeof parsedResponse.status === 'object' && parsedResponse.status
      ? parsedResponse.status
      : null;

  const mergedStatus: BodyStatus = {
    ...currentStatus,
    ...(parsedStatus ?? {}),
    // 使用规范化后的情绪值
    emotion: normalizedEmotion,
    // 确保嵌套对象也被正确合并
    mouth: { ...currentStatus.mouth, ...(parsedStatus?.mouth || {}) },
    chest: { ...currentStatus.chest, ...(parsedStatus?.chest || {}) },
    nipples: { ...currentStatus.nipples, ...(parsedStatus?.nipples || {}) },
    groin: { ...currentStatus.groin, ...(parsedStatus?.groin || {}) },
    posterior: { ...currentStatus.posterior, ...(parsedStatus?.posterior || {}) },
    feet: { ...currentStatus.feet, ...(parsedStatus?.feet || {}) }
  };

  return {
    reply: parsedResponse.reply || aiResponse,
    status: mergedStatus,
    suggestedActions: parsedResponse.suggestedActions || [],
    generatedTweet: parsedResponse.generatedTweet || undefined
  };
}

/**
 * 生成角色回复 - 使用用户配置的主AI
 * @param history 对话历史
 * @param promptText 用户输入
 * @param currentStatus 当前身体状态
 * @param userLocation 用户位置
 * @param mainAIConfig 主AI配置（从设置中获取）
 * @param isRemoteWeChat 是否为远程微信消息（用户和温婉不在同一位置）
 * @returns 角色回复
 */
export async function generateCharacterResponse(
  history: { role: string; content: string }[],
  promptText: string,
  currentStatus: BodyStatus,
  userLocation: LocationID,
  mainAIConfig: { apiBase: string; apiKey: string; model: string },
  isRemoteWeChat: boolean = false,
  memoryData?: {
    todaySummary: string;
    calendarEvents: Array<{ time: string; title: string; description: string }>;
    gameTime?: GameTime; // 当前游戏时间（可选）
    presetContent?: string; // 预设内容（可选）
    writingStyle?: string; // 描写规范（可选）
    perspective?: string; // 人称描写（可选）
    nsfwStyle?: string; // NFSW描写规范（可选）
    jailbreakPrompt?: string; // 破限制提示词（可选）
  },
  options?: {
    useSillyTavernGenerate?: boolean;
  }
): Promise<GeminiResponse> {
  // 使用统一的SillyTavern检测函数
  const isSillyTavern = isSillyTavernEnv();

  // API配置检查：检查配置是否有效（非空字符串）
  const hasValidAPIConfig = !!(
    mainAIConfig.apiKey &&
    mainAIConfig.apiKey.trim() &&
    mainAIConfig.apiBase &&
    mainAIConfig.apiBase.trim()
  );

  // 是否强制优先走酒馆 Generate（由设置开关控制）
  const forceSillyTavernGenerate = isSillyTavern && options?.useSillyTavernGenerate === true;

  // 如果不在SillyTavern环境中，必须有完整的API配置
  if (!isSillyTavern && !hasValidAPIConfig) {
    throw new Error("AI配置不完整，请在设置中配置API密钥和接口地址");
  }

  // 检测可用的生成方法（优先级从高到低）
  // 优先使用 ST_API（即使配置了 API，ST_API 会自动使用酒馆的预设和世界书）
  let canUseSTAPI = false;
  let canUseTavernHelper = false;
  let tavernHelper: typeof window.TavernHelper | null = null;
  
  /**
   * 检测 ST_API 是否可用（包括等待 APP_READY 事件）
   */
  async function detectSTAPI(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    
    // 先检查是否已经可用
    const checkSTAPI = (win: Window): boolean => {
      try {
        if (typeof (win as any).ST_API !== 'undefined' && 
            typeof (win as any).ST_API.prompt?.generate === 'function') {
          console.log('[characterService] 检测到 ST_API 可用');
          return true;
        }
      } catch (e) {
        // 跨域访问失败
      }
      return false;
    };
    
    // 检查当前窗口
    if (checkSTAPI(window)) return true;
    
    // 检查 top 窗口
    try {
      if (window.top && window.top !== window && checkSTAPI(window.top)) {
        console.log('[characterService] 在 top 窗口检测到 ST_API');
        return true;
      }
    } catch (e) {
      console.log('[characterService] 无法访问 top 窗口（跨域限制）');
    }
    
    // 逐层检查 parent
    let currentWindow: Window = window;
    for (let i = 0; i < 5; i++) {
      try {
        if (currentWindow.parent && currentWindow.parent !== currentWindow) {
          if (checkSTAPI(currentWindow.parent)) {
            console.log(`[characterService] 在 parent 第 ${i + 1} 层检测到 ST_API`);
            return true;
          }
          currentWindow = currentWindow.parent;
        } else {
          break;
        }
      } catch (e) {
        console.log(`[characterService] 无法访问 parent 第 ${i + 1} 层（跨域限制）`);
        break;
      }
    }
    
    // 如果还没检测到，等待 APP_READY 事件（最多等待 2 秒）
    if (isSillyTavern) {
      console.log('[characterService] ST_API 未检测到，等待 APP_READY 事件...');
      try {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.log('[characterService] 等待 APP_READY 超时（2秒）');
              resolve();
            }
          }, 2000);
          
          // 检查 APP_READY 是否已经设置
          if (typeof (window as any).APP_READY !== 'undefined' && (window as any).APP_READY) {
            clearTimeout(timeout);
            resolved = true;
            resolve();
            return;
          }
          
          // 监听 APP_READY 事件（通过 SillyTavern 的事件系统）
          const ctx = (window as any).SillyTavern?.getContext?.();
          if (ctx?.eventSource && ctx.event_types) {
            const handler = () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                ctx.eventSource.off(ctx.event_types.APP_READY, handler);
                console.log('[characterService] APP_READY 事件已触发');
                resolve();
              }
            };
            ctx.eventSource.on(ctx.event_types.APP_READY, handler);
          } else {
            // 如果没有事件系统，直接 resolve
            clearTimeout(timeout);
            resolved = true;
            resolve();
          }
        });
        
        // 再次检查 ST_API
        if (checkSTAPI(window)) return true;
        try {
          if (window.top && window.top !== window && checkSTAPI(window.top)) return true;
        } catch (e) {}
      } catch (e) {
        console.warn('[characterService] 等待 APP_READY 时出错:', e);
      }
    }
    
    console.log('[characterService] ST_API 不可用');
    return false;
  }
  
  if (typeof window !== 'undefined') {
    // 方法1: 优先使用 ST_API.prompt.generate（st-api-wrapper 插件）
    // 即使配置了 API，也优先使用 ST_API，因为它会自动使用酒馆的预设和世界书
    // 注意：这里先同步检测，如果不可用会在实际调用时再次异步检测
    if (typeof (window as any).ST_API !== 'undefined' && 
        typeof (window as any).ST_API.prompt?.generate === 'function') {
      canUseSTAPI = true;
      console.log('[characterService] 同步检测到 ST_API 可用');
    } else {
      // 尝试从 top 或 parent 查找 ST_API
      try {
        if (window.top && window.top !== window && 
            typeof (window.top as any).ST_API !== 'undefined' && 
            typeof (window.top as any).ST_API.prompt?.generate === 'function') {
          canUseSTAPI = true;
          console.log('[characterService] 在 top 窗口同步检测到 ST_API');
        }
      } catch (e) {
        // 跨域访问失败
      }
      
      if (!canUseSTAPI) {
        let currentWindow: Window = window;
        for (let i = 0; i < 5; i++) {
          try {
            if (currentWindow.parent && currentWindow.parent !== currentWindow) {
              if (typeof (currentWindow.parent as any).ST_API !== 'undefined' && 
                  typeof (currentWindow.parent as any).ST_API.prompt?.generate === 'function') {
                canUseSTAPI = true;
                console.log(`[characterService] 在 parent 第 ${i + 1} 层同步检测到 ST_API`);
                break;
              }
              currentWindow = currentWindow.parent;
            } else {
              break;
            }
          } catch (e) {
            break;
          }
        }
      }
    }
    
    // 方法2: 降级到 TavernHelper.generate（仅在 ST_API 不可用时）
    if (!canUseSTAPI) {
      if (typeof window.TavernHelper !== 'undefined' && typeof window.TavernHelper.generate === 'function') {
        canUseTavernHelper = true;
        tavernHelper = window.TavernHelper;
      } else {
        try {
          if (window.top && window.top !== window && 
              typeof (window.top as any).TavernHelper !== 'undefined' && 
              typeof (window.top as any).TavernHelper.generate === 'function') {
            canUseTavernHelper = true;
            tavernHelper = (window.top as any).TavernHelper;
          }
        } catch (e) {
          // 跨域访问失败
        }
        
        if (!canUseTavernHelper) {
          let currentWindow: Window = window;
          for (let i = 0; i < 5; i++) {
            try {
              if (currentWindow.parent && currentWindow.parent !== currentWindow) {
                if (typeof (currentWindow.parent as any).TavernHelper !== 'undefined' && 
                    typeof (currentWindow.parent as any).TavernHelper.generate === 'function') {
                  canUseTavernHelper = true;
                  tavernHelper = (currentWindow.parent as any).TavernHelper;
                  break;
                }
                currentWindow = currentWindow.parent;
              } else {
                break;
              }
            } catch (e) {
              break;
            }
          }
        }
      }
    }
  }
  
  // 决定使用哪种 API
  // 如果在 SillyTavern 环境中，优先尝试使用 ST_API 或 TavernHelper（即使同步检测不到，也会在调用时异步检测）
  // 这样可以利用酒馆的预设和世界书
  // 注意：即使同步检测不到 ST_API，只要在 SillyTavern 环境中，也应该尝试使用（因为可能需要等待初始化）
  const useSillyTavernAPI = isSillyTavern && !hasValidAPIConfig;
  
  // 当用户未配置 API 时，才自动尝试使用酒馆侧能力（避免无开关时“抢占”自定义接口）
  const preferSillyTavernAPI = isSillyTavern && !hasValidAPIConfig && (canUseSTAPI || canUseTavernHelper);


  // 如果是远程微信消息，使用简化的提示词（只返回文字回复，不更新状态）
  const contextPrompt = isRemoteWeChat
    ? `
[Current Game State]
User Location: ${userLocation}
Wenwan Location: ${currentStatus.location}
**IMPORTANT: This is a REMOTE WeChat message. The user cannot see Wenwan's real-time reactions, body language, or physical state.**

[User Input]
${promptText}

[Critical Instructions for REMOTE WeChat]
1. **PERSPECTIVE (视角)**: 
   - **CRITICAL**: You are Wenwan typing a WeChat message on her phone. The user (brother) is NOT present and CANNOT see what you're doing.
   - **DO NOT** use third-person descriptions like "温婉..." or "她..." - you ARE Wenwan, typing a message.
   - **DO NOT** describe what Wenwan is doing physically - the user cannot see it.
   - Reply should be in FIRST PERSON (我) or direct dialogue, as if Wenwan is typing on her phone.
   - Example CORRECT: "在忙...等会回你" or "哥哥...我现在有点事"
   - Example WRONG: "温婉看到消息后..." or "她拿起手机回复道..."

2. **REPLY STYLE**: This is a WeChat text message. Reply should be:
   - Simple, natural text conversation (like real WeChat messages)
   - NO detailed sensory descriptions (you can't see her reactions)
   - NO body language descriptions (you can't see her movements)
   - NO real-time action descriptions (you can't see what she's doing right now)
   - Just pure text dialogue, as if she's typing on her phone
   - Keep it SHORT and NATURAL - real WeChat messages are brief

3. **STATUS UPDATE**: 
   - DO NOT update body status (emotion, clothing, body parts, etc.) - the user cannot see these changes
   - DO NOT update location - the user and Wenwan are in different locations
   - Keep all status fields exactly as they are in the current state
   - Only update if there's a significant plot change that would be mentioned in the text

4. **REPLY CONTENT**:
   - Keep it short and natural (like a real WeChat message)
   - Focus on what she would text back, not what she's doing physically
   - No "she blushes", "her eyes widen", "she looks at..." - you can't see these
   - If Wenwan is in a compromising situation (like with 黄毛), she might reply briefly, awkwardly, or not at all

4. **CRITICAL: JSON FORMAT REQUIREMENT**:
   - You MUST return a complete, valid JSON object with ALL required fields
   - Required fields: "reply" (string), "status" (object), "suggestedActions" (array)
   - The "status" object must include all fields from the current status, even if unchanged
   - Current status: ${JSON.stringify(currentStatus, null, 2)}
   - Return the status object exactly as shown above, or with minimal changes if plot requires it
   - DO NOT return incomplete JSON or omit the status field
   - Example format: {"reply": "你的回复内容", "status": {...完整的状态对象...}, "suggestedActions": []}
`
    : `
[Current Game State]
User Location: ${userLocation}
Wenwan Status: ${JSON.stringify(currentStatus, null, 2)}

**IMPORTANT - LOCATION UPDATE RULES**:
1. If the dialogue mentions going somewhere together (e.g., "来到电影院", "一起去看电影", "到了商城"), you MUST update "status.location" to reflect where Wenwan is now.
2. If the user and Wenwan are moving together, update "status.location" to match the new location mentioned in the dialogue.
3. Common location keywords:
   - "电影院" / "影院" → "cinema"
   - "商城" / "商场" / "购物中心" → "mall"
   - "游乐园" / "游乐场" → "amusement_park"
   - "学校" → "school"
   - "公司" → "company"
   - "美食广场" → "food_court"
   - "蛋糕店" → "cake_shop"
   - "港口" → "port"
   - "展会中心" / "展会" / "漫展" → "exhibition_center"
   - "家" / "客厅" / "卧室" → "master_bedroom" or "living_room" or "guest_bedroom"
4. **CRITICAL**: If the dialogue clearly indicates Wenwan has moved to a new location, you MUST update "status.location" in your response, even if the user didn't explicitly click the map.
${
  memoryData
    ? `
[Memory Data - 用于判断哥哥是否"下头"]
今日记忆：${memoryData.todaySummary || "（暂无今日记忆）"}
历史事件：
${
  memoryData.calendarEvents.length > 0
    ? memoryData.calendarEvents
        .slice(0, 10)
        .map((e) => `- ${e.time} ${e.title}: ${e.description}`)
        .join("\n")
    : "（暂无历史事件）"
}
**重要**：请根据以上记忆综合分析哥哥的行为模式，判断他是否"很下头"。如果记忆显示哥哥经常做下头的事，即使当前行为轻微，也要考虑累积效应，适当增加堕落度。
`
    : ""
}

[User Input]
${promptText}

[Critical Instructions]
${memoryData?.jailbreakPrompt ? `**破限制提示词**:\n${memoryData.jailbreakPrompt}\n\n` : ''}
${memoryData?.writingStyle ? `**描写规范**:\n${memoryData.writingStyle}\n\n` : ''}
${memoryData?.perspective ? `**人称描写**:\n${memoryData.perspective}\n\n` : ''}
${memoryData?.nsfwStyle ? `**NFSW描写规范**:\n${memoryData.nsfwStyle}\n\n` : ''}
1. **EMOTION UPDATE**: You MUST update "status.emotion" based on Wenwan's current mood. Valid values: "neutral", "happy", "shy", "angry", "sad", "aroused", "surprised", "tired". This directly controls her facial expression display.

2. **CLOTHING UPDATE**: You MUST update "status.overallClothing" when clothing changes occur. Include keywords:
   - "JK制服" or "JK" for JK制服
   - "白衬衫" or "衬衫" for 白衬衫  
   - "洛丽塔" or "洋装" for 洛丽塔
   - "情趣睡衣" or "蕾丝" or "情趣" for 情趣睡衣
   - "睡衣" or "普通睡衣" for 普通睡衣
   If user asks to change clothes, IMMEDIATELY update "overallClothing" and describe the change in your reply. Wenwan has access to all these outfits.

3. **MEMORY-BASED JUDGMENT**: ${
        memoryData
          ? "根据上面的记忆数据，综合分析哥哥的行为。如果判断他很下头，增加堕落度（2-4点）。"
          : "根据当前对话和游戏状态，判断哥哥是否很下头。"
      }

4. Generate the next response in valid JSON format according to the system instruction.
`;

  // 如果用户在设置中开启“优先使用酒馆 Generate”，则强制先走 st-api-wrapper
  // 约束：不注入 system/extraBlocks/preset/worldBook，仅通过 chatHistory.replace/inject 修改聊天历史
  if (forceSillyTavernGenerate) {
    try {
      const stChatHistoryReplace = [
        ...history.map((h) => toSTChatMessage(h.role, h.content)),
        toSTChatMessage('user', contextPrompt),
      ];

      const stText = await generateTextViaST({
        timeoutMs: 120000,
        chatHistory: { replace: stChatHistoryReplace },
      });

      // 复用现有解析与状态合并逻辑
      return buildGeminiResponseFromAIText(stText, currentStatus, isRemoteWeChat);
    } catch (error: any) {
      console.warn('[characterService] 强制使用酒馆 Generate 失败，将尝试降级到自定义接口:', error);

      if (!hasValidAPIConfig) {
        throw new Error(
          `已开启“优先使用酒馆 Generate（ST_API）”，但无法调用 ST_API.prompt.generate。请确保：1) 已安装并启用 st-api-wrapper；2) 若跨域 iframe，酒馆端已注入 sillytavern-message-handler.js。原始错误: ${error?.message || '未知错误'}`
        );
      }
      // 有自定义 API 配置时，继续走后续逻辑降级到 /chat/completions
    }
  }

  // 获取系统提示词（整合SillyTavern的预设和世界书，以及用户导入的预设）
  // 从SettingsContext获取用户导入的预设内容（需要通过参数传递）
  // 暂时使用空字符串，实际使用时应该从settings中获取
  // 优化2：传递当前弧光阶段，用于动态过滤世界书
  const fullSystemInstruction = await getSystemInstruction(
    memoryData?.presetContent || undefined,
    currentStatus.arcLight
  );
  
  // 确保 staticSystemInstruction 被正确初始化（如果还没有的话）
  if (!staticSystemInstruction) {
    staticSystemInstruction = fullSystemInstruction;
    console.log(`[characterService] 初始化静态系统提示词`);
  }
  
  // 系统提示词版本化：检测状态变化，决定是否发送完整系统提示词
  const currentStatusHash = calculateStatusHash(currentStatus, userLocation, memoryData);
  const statusChanged = currentStatusHash !== lastStatusHash;
  
  // 构建系统提示词：
  // 1. 首次请求：发送完整系统提示词
  // 2. 静态部分变化（预设/世界书更新）：发送完整系统提示词（getSystemInstruction会处理）
  // 3. 只有状态变化：发送静态部分 + 动态更新
  // 4. 无变化：只发送静态部分（但这种情况很少，因为至少会有对话历史）
  let systemInstruction = fullSystemInstruction;
  
  // 检查弧光是否变化（弧光变化需要重新生成静态系统提示词）
  // 注意：这里使用 getSystemInstruction 中已更新的 lastArcLight 进行比较
  const arcLightChanged = currentStatus.arcLight !== lastArcLight;
  
  // 暂时禁用系统提示词版本化，因为可能导致某些API无法生成内容
  // 如果静态部分已初始化且状态有变化且弧光未变化，尝试使用增量更新
  // 但为了稳定性，暂时总是使用完整系统提示词
  const useIncrementalUpdate = false; // 暂时禁用，避免API兼容性问题
  
  if (useIncrementalUpdate && !isFirstRequest && staticSystemInstruction && statusChanged && !arcLightChanged) {
    // 生成动态状态更新（传入正确的上次状态）
    const dynamicUpdate = generateDynamicStatusUpdate(
      currentStatus,
      userLocation,
      lastStatus,
      lastUserLocation,
      memoryData
    );
    
    // 如果动态更新不为空，添加到系统提示词
    if (dynamicUpdate) {
      systemInstruction = `${staticSystemInstruction}${dynamicUpdate}`;
      console.log(`[characterService] 使用增量更新，节省token`);
    }
  } else {
    // 首次请求、静态部分未初始化、或弧光变化，使用完整系统提示词
    if (arcLightChanged) {
      console.log(`[characterService] 弧光变化（${lastArcLight} -> ${currentStatus.arcLight}），重新生成系统提示词`);
    } else if (isFirstRequest) {
      console.log(`[characterService] 首次请求，发送完整系统提示词`);
    } else {
      console.log(`[characterService] 使用完整系统提示词（增量更新已禁用）`);
    }
    isFirstRequest = false;
  }
  
  // 更新状态哈希和状态（在最后更新，确保下次比较时正确）
  lastStatusHash = currentStatusHash;
  lastStatus = { ...currentStatus }; // 深拷贝保存状态
  lastUserLocation = userLocation;
  // 注意：lastArcLight 已经在 getSystemInstruction 中更新，这里不需要重复更新

  // 注意：对话历史优化已在 useDialogue.ts 中完成（包括日历总结功能）
  // 这里直接使用传入的 history，不再重复优化

  // 构建消息列表
  const messages: AIMessage[] = [
    { role: "system", content: systemInstruction },
    ...history.map((h) => ({
      role: h.role === "user" ? "user" : ("assistant" as "user" | "assistant"),
      content: h.content,
    })),
    { role: "user", content: contextPrompt },
  ];

  // 估算prompt长度（粗略估算：中文字符数 * 1.5 + 英文单词数 * 1.3）
  const estimatePromptTokens = (text: string): number => {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chineseChars * 1.5 + englishWords * 1.3);
  };
  
  const totalPromptLength = messages.reduce((sum, msg) => sum + estimatePromptTokens(msg.content), 0);
  
  // 如果prompt过长，给出警告并尝试优化
  if (totalPromptLength > 10000) {
    console.warn(`[characterService] Prompt过长（估算${totalPromptLength} tokens），可能导致模型无法生成回复`);
  }

  try {
    let response: Response;

    // 如果在 SillyTavern 环境中，优先尝试使用 ST_API 或 TavernHelper
    if (useSillyTavernAPI || preferSillyTavernAPI) {
      // 优先使用 ST_API 或 TavernHelper（即使配置了 API，也优先使用它们以利用酒馆的预设和世界书）
      let success = false;
      let lastError: Error | null = null;

      console.log('[characterService] 尝试使用 SillyTavern API，isSillyTavern=', isSillyTavern, 'canUseSTAPI=', canUseSTAPI, 'canUseTavernHelper=', canUseTavernHelper, 'hasValidAPIConfig=', hasValidAPIConfig);

      // 方法1: 优先使用 ST_API.prompt.generate（st-api-wrapper 插件，最推荐）
      // ST_API 会自动使用酒馆的预设和世界书，即使配置了 API 也会使用
      // 如果同步检测不可用，尝试异步检测（等待 APP_READY）
      const stApiDetected = canUseSTAPI || await detectSTAPI();
      console.log('[characterService] ST_API 检测结果:', stApiDetected, 'canUseSTAPI=', canUseSTAPI);
      
      if (stApiDetected) {
        try {
          console.log("[characterService] 使用 ST_API.prompt.generate");
          
          // 获取 ST_API 实例（从当前窗口或父窗口）
          let stApi: typeof window.ST_API | null = null;
          const getSTAPI = (win: Window): typeof window.ST_API | null => {
            try {
              if (typeof (win as any).ST_API !== 'undefined' && 
                  typeof (win as any).ST_API.prompt?.generate === 'function') {
                return (win as any).ST_API;
              }
            } catch (e) {
              // 跨域访问失败
            }
            return null;
          };
          
          stApi = getSTAPI(window);
          if (!stApi) {
            try {
              if (window.top && window.top !== window) {
                stApi = getSTAPI(window.top);
              }
            } catch (e) {
              // 跨域访问失败
            }
          }
          
          if (!stApi) {
            let currentWindow: Window = window;
            for (let i = 0; i < 5; i++) {
              try {
                if (currentWindow.parent && currentWindow.parent !== currentWindow) {
                  stApi = getSTAPI(currentWindow.parent);
                  if (stApi) break;
                  currentWindow = currentWindow.parent;
                } else {
                  break;
                }
              } catch (e) {
                break;
              }
            }
          }
          
          if (stApi && stApi.prompt?.generate) {
            console.log("[characterService] 成功获取 ST_API 实例，准备调用 generate");
            // 构建聊天历史（转换为 ST_API 格式）
            const chatHistory = messages
              .filter(msg => msg.role !== 'system') // 系统提示词通过 extraBlocks 注入
              .map(msg => ({
                role: msg.role,
                content: msg.content
              }));
            
            // 调用 ST_API.prompt.generate
            const result = await stApi.prompt.generate({
              writeToChat: false, // 后台生成，不写入聊天
              stream: false,
              timeoutMs: 120000, // 2分钟超时
              extraBlocks: [
                // 注入系统提示词
                {
                  role: 'system',
                  content: systemInstruction,
                  index: 0 // 插入到最前面
                }
              ],
              chatHistory: {
                replace: chatHistory // 替换聊天历史
              },
              preset: {
                mode: 'current' // 使用当前预设
              },
              worldBook: {
                mode: 'current' // 使用当前世界书
              }
            });

            if (result && result.text) {
              // 将生成的文本转换为Response对象（兼容现有代码）
              const mockResponse = {
                choices: [{
                  message: {
                    content: result.text
                  }
                }]
              };
              response = new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
              success = true;
              console.log("[characterService] 使用 ST_API.prompt.generate 成功");
            }
          } else {
            // 如果无法直接访问 ST_API（跨域限制），尝试通过 postMessage 代理调用
            console.log('[characterService] 无法直接访问 ST_API，尝试通过 postMessage 代理调用');
            try {
              const proxyResult = await requestSTAPIViaPostMessage<{ text?: string }>('prompt.generate', {
                writeToChat: false,
                stream: false,
                timeoutMs: 120000,
                extraBlocks: [
                  {
                    role: 'system',
                    content: systemInstruction,
                    index: 0
                  }
                ],
                chatHistory: {
                  replace: messages
                    .filter(msg => msg.role !== 'system')
                    .map(msg => ({
                      role: msg.role,
                      content: msg.content
                    }))
                },
                preset: {
                  mode: 'current'
                },
                worldBook: {
                  mode: 'current'
                }
              }, 120000);
              
              if (proxyResult && proxyResult.text) {
                const mockResponse = {
                  choices: [{
                    message: {
                      content: proxyResult.text
                    }
                  }]
                };
                response = new Response(JSON.stringify(mockResponse), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                });
                success = true;
                console.log("[characterService] 通过 postMessage 代理调用 ST_API.prompt.generate 成功");
              }
            } catch (proxyError: any) {
              console.warn('[characterService] postMessage 代理调用失败:', proxyError);
            }
          }
        } catch (stApiError: any) {
          console.warn("[characterService] ST_API.prompt.generate 调用失败，降级到备用方法:", stApiError);
          lastError = stApiError;
        }
      } else {
        // 即使检测失败，也尝试通过 postMessage 代理调用（可能是跨域限制导致检测失败）
        console.log('[characterService] ST_API 检测失败，尝试通过 postMessage 代理调用');
        try {
          const proxyResult = await requestSTAPIViaPostMessage<{ text?: string }>('prompt.generate', {
            writeToChat: false,
            stream: false,
            timeoutMs: 120000,
            extraBlocks: [
              {
                role: 'system',
                content: systemInstruction,
                index: 0
              }
            ],
            chatHistory: {
              replace: messages
                .filter(msg => msg.role !== 'system')
                .map(msg => ({
                  role: msg.role,
                  content: msg.content
                }))
            },
            preset: {
              mode: 'current'
            },
            worldBook: {
              mode: 'current'
            }
          }, 120000);
          
          if (proxyResult && proxyResult.text) {
            const mockResponse = {
              choices: [{
                message: {
                  content: proxyResult.text
                }
              }]
            };
            response = new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
            success = true;
            console.log("[characterService] 通过 postMessage 代理调用 ST_API.prompt.generate 成功");
          } else {
            console.warn('[characterService] postMessage 代理调用返回空结果');
          }
        } catch (proxyError: any) {
          console.warn('[characterService] postMessage 代理调用失败:', proxyError);
          lastError = proxyError;
        }
      }

      // 方法2: 降级到 TavernHelper.generate
      if (!success && canUseTavernHelper && tavernHelper) {
        try {
          console.log("[characterService] 使用 TavernHelper.generate");
          
          // 提取用户输入（最后一条user消息）
          let userInput = promptText;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              userInput = messages[i].content;
              break;
            }
          }
          
          const generatedText = await tavernHelper.generate({
            user_input: userInput,
            should_stream: false,
          });

          if (generatedText) {
            const mockResponse = {
              choices: [{
                message: {
                  content: generatedText
                }
              }]
            };
            response = new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
            success = true;
            console.log("[characterService] 使用 TavernHelper.generate 成功");
          }
        } catch (tavernHelperError: any) {
          console.warn("[characterService] TavernHelper.generate 调用失败:", tavernHelperError);
          lastError = tavernHelperError;
        }
      }

      // 如果所有方法都失败
      if (!success || !response) {
        const errorMessage = lastError?.message || "未知错误";
        const isExternalDomain = window.location.href.includes("workers.dev") || 
                                 window.location.href.includes("cloudflare");
        
        console.error('[characterService] SillyTavern API 调用失败:', {
          canUseSTAPI,
          canUseTavernHelper,
          hasValidAPIConfig,
          errorMessage,
          isExternalDomain
        });
        
        // 如果配置了 API，降级到使用配置的 API
        if (hasValidAPIConfig) {
          console.log('[characterService] SillyTavern API 不可用，降级到使用配置的 API');
          // 继续执行，使用配置的 API（在 else 分支中）
        } else {
          // 如果没有配置 API，抛出错误
          if (isExternalDomain) {
            throw new Error(
              `无法连接到SillyTavern API。应用部署在外部服务器上。错误: ${errorMessage}。请在设置中配置API密钥和接口地址，或者确保SillyTavern正在运行并且应用已正确嵌入。`
            );
          }
          throw lastError || new Error(
            `无法连接到SillyTavern API。错误: ${errorMessage}。请确保：1) SillyTavern正在运行 2) 应用已正确嵌入到SillyTavern中 3) st-api-wrapper 插件已安装并启用 4) 或者在设置中配置API密钥`
          );
        }
      }
    }
    
    // 如果使用 SillyTavern API 失败，或者没有尝试使用 SillyTavern API，使用配置的 API
    if (!response) {
      // 使用配置的API（无论是否在SillyTavern环境中，只要用户配置了API就使用）
      if (!hasValidAPIConfig) {
        throw new Error("AI配置不完整，请在设置中配置API密钥和接口地址");
      }

      // 根据prompt长度动态调整max_tokens
      const baseMaxTokens = 8000;
      const promptBonus = Math.floor(totalPromptLength * 0.5);
      const estimatedMaxTokens = Math.min(32000, Math.max(baseMaxTokens, baseMaxTokens + promptBonus));
      
      // 构建请求体
      const requestBody = {
        model: mainAIConfig.model || "gpt-3.5-turbo",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.8,
        max_tokens: estimatedMaxTokens,
      };
      
      // 打印请求摘要信息
      console.log(`[characterService] 请求参数: model=${requestBody.model}, max_tokens=${estimatedMaxTokens}, 估算prompt_tokens=${totalPromptLength}`);
      console.log(`[characterService] 请求体摘要: messages数量=${messages.length}, system长度=${systemInstruction.length}`);

      response = await fetch(`${mainAIConfig.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mainAIConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response || !response.ok) {
      const errorText = response ? response.statusText : "无法连接到API";
      let errorMessage = `API请求失败: ${errorText}`;

      try {
        if (response) {
          const error = await response
            .json()
            .catch(() => ({ error: { message: response.statusText } }));
          errorMessage = error.error?.message || errorMessage;
        }
      } catch (e) {
        // 忽略JSON解析错误
      }

      // 提供更友好的错误提示
      if (useSillyTavernAPI) {
        throw new Error(
          `无法连接到SillyTavern API: ${errorMessage}。请确保SillyTavern正在运行并且API服务已启动，或者在设置中配置API密钥。`
        );
      } else {
        throw new Error(`AI调用失败: ${errorMessage}。请检查设置中的API配置。`);
      }
    }

    const data = await response.json();
    
    // 调试：打印完整响应（用于排查问题）
    console.log('[characterService] API响应摘要:', {
      model: data.model,
      choicesLength: data.choices?.length || 0,
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      hasContent: !!data.choices?.[0]?.message?.content,
      contentLength: data.choices?.[0]?.message?.content?.length || 0
    });
    
    // 检查响应结构
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('[characterService] 响应结构异常，完整响应:', JSON.stringify(data, null, 2));
      throw new Error(`AI返回的响应格式不正确: ${JSON.stringify(data)}。可能是API配置问题，请检查API地址和模型设置。`);
    }
    
    // 检查finish_reason，看是否有特殊原因
    const finishReason = data.choices[0]?.finish_reason;
    const usage = data.usage || {};
    
    // 如果completion_tokens为0，说明模型没有生成任何内容
    if (usage.completion_tokens === 0) {
      // 调试：打印更多信息
      console.error('[characterService] 模型未生成内容，完整响应数据:', JSON.stringify(data, null, 2));
      
      let errorMsg = 'AI模型没有生成任何内容。';
      
      if (finishReason === 'length') {
        errorMsg += ' 原因：回复被截断（可能max_tokens设置过小）。';
      } else if (finishReason === 'content_filter') {
        errorMsg += ' 原因：内容被安全过滤器拦截。';
      } else if (finishReason === 'stop') {
        errorMsg += ' 原因：模型提前停止生成（可能是prompt过长或格式问题）。';
      } else if (finishReason) {
        errorMsg += ` 原因：${finishReason}。`;
      }
      
      errorMsg += ` 输入token: ${usage.prompt_tokens || 0}，输出token: ${usage.completion_tokens || 0}。`;
      errorMsg += ' 建议：1) 检查prompt是否过长 2) 尝试减少对话历史 3) 检查模型是否支持该任务。';
      
      console.error('[characterService] AI未生成内容:', {
        finishReason,
        usage,
        model: data.model,
        promptTokens: usage.prompt_tokens
      });
      
      throw new Error(errorMsg);
    }
    
    // 提取AI响应内容
    let aiResponse = data.choices[0]?.message?.content || "";
    
    // 如果响应为空，尝试从其他字段提取
    if (!aiResponse || aiResponse.trim().length === 0) {
      // 尝试从reasoning_content提取（某些模型可能把内容放在这里）
      aiResponse = data.choices[0]?.message?.reasoning_content || "";
    }
    
    // 检查响应内容是否为空
    if (!aiResponse || aiResponse.trim().length === 0) {
      console.error('[characterService] AI响应为空，完整响应数据:', JSON.stringify(data, null, 2));
      
      let errorMsg = 'AI返回的响应为空。';
      if (usage.prompt_tokens && usage.prompt_tokens > 10000) {
        errorMsg += ` 输入token过多（${usage.prompt_tokens}），可能导致模型无法生成回复。建议减少对话历史或简化prompt。`;
      } else {
        errorMsg += ' 可能是模型配置问题、token限制过小、或API服务异常。';
      }
      errorMsg += ' 请检查：1) 模型是否正确 2) max_tokens是否足够（当前4000） 3) API服务是否正常。';
      
      throw new Error(errorMsg);
    }
    
    // 记录响应内容（用于调试）
    console.log('[characterService] AI响应长度:', aiResponse.length);
    console.log('[characterService] AI响应前500字符:', aiResponse.substring(0, 500));
    return buildGeminiResponseFromAIText(aiResponse, currentStatus, isRemoteWeChat);
  } catch (error: any) {
    console.error("AI调用错误:", error);
    throw new Error(`AI调用失败: ${error.message || "未知错误"}`);
  }
}
