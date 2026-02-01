/**
 * 代码层规则组装器
 * 组装所有代码层规则（角色人设、响应格式、游戏逻辑等）
 */

import { CHARACTER_PROFILE_RULES } from './characterProfileRules';
import { BEHAVIOR_RULES } from './behaviorRules';
import { GAMEPLAY_LOGIC_RULES } from './gameplayLogicRules';
import { RESPONSE_FORMAT_RULES } from './responseFormatRules';
import { EMOTION_CLOTHING_RULES } from './emotionClothingRules';
import { LOCATION_INTERACTION_RULES } from './locationInteractionRules';
import { SOCIAL_MEDIA_RULES } from './socialMediaRules';
import { TIME_SCHEDULE_RULES } from './timeScheduleRules';

/**
 * 组装基础代码层规则
 * 这些规则是固定的，不随游戏状态变化
 * 注意：behaviorRules已经整合了好感度、堕落度和黄毛系统，替代了原来的弧光系统
 */
export function assembleCodeRules(): string {
  const rules = [
    CHARACTER_PROFILE_RULES,
    BEHAVIOR_RULES,  // 行为规则系统（整合好感度+堕落度+黄毛系统，已包含favorabilityRules的内容）
    TIME_SCHEDULE_RULES,
    LOCATION_INTERACTION_RULES,
    SOCIAL_MEDIA_RULES,
    GAMEPLAY_LOGIC_RULES,
    EMOTION_CLOTHING_RULES,
    RESPONSE_FORMAT_RULES,
  ];

  return rules.join('\n\n');
}

