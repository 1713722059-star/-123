/**
 * 规则组装器（简化版）
 * 根据当前游戏状态按需组装规则，减少规则内容
 * 注意：行为规则（好感度+堕落度+黄毛系统）已整合到 codeRules/behaviorRules.ts
 * 这里只保留身体开发、时间、互动等辅助规则
 */

import { BODY_DEVELOPMENT_RULES } from './bodyDevelopmentRules';
import { TIME_RULES } from './timeRules';
import { INTERACTION_RULES } from './interactionRules';

/**
 * 规则权重定义
 */
export const RULE_WEIGHTS = {
  bodyDevelopment: 7,  // 身体开发（重要）
  time: 6,            // 时间系统（中等）
  interaction: 5,      // 互动规则（中等）
} as const;

/**
 * 规则定义接口
 */
export interface RuleDefinition {
  key: string;
  name: string;
  content: string;
  weight: number;
  enabled: boolean;
  condition?: 'always' | 'degradation31+' | 'degradation65+'; // 条件加载（基于堕落度）
}

/**
 * 获取所有规则定义
 */
export function getAllRules(): RuleDefinition[] {
  return [
    {
      key: 'bodyDevelopment',
      name: '身体部位开发',
      content: BODY_DEVELOPMENT_RULES,
      weight: RULE_WEIGHTS.bodyDevelopment,
      enabled: true,
    },
    {
      key: 'time',
      name: '时间系统',
      content: TIME_RULES,
      weight: RULE_WEIGHTS.time,
      enabled: true,
    },
    {
      key: 'interaction',
      name: '互动规则',
      content: INTERACTION_RULES,
      weight: RULE_WEIGHTS.interaction,
      enabled: true,
    },
  ];
}

/**
 * 按需组装规则
 * @param options 组装选项
 */
export function assembleRules(options: {
  degradation?: number; // 当前堕落度（用于条件加载）
  enabledRules?: string[]; // 用户自定义启用的规则
  customRules?: Record<string, string>; // 用户自定义规则内容
}): string {
  const allRules = getAllRules();
  const { degradation, enabledRules, customRules } = options;

  // 过滤规则
  const filteredRules = allRules.filter(rule => {
    // 检查是否启用
    if (enabledRules && !enabledRules.includes(rule.key)) {
      return false;
    }
    if (!rule.enabled) {
      return false;
    }

    // 检查条件（基于堕落度）
    if (rule.condition) {
      if (rule.condition === 'degradation31+' && (degradation === undefined || degradation < 31)) {
        return false;
      }
      if (rule.condition === 'degradation65+' && (degradation === undefined || degradation < 65)) {
        return false;
      }
    }

    return true;
  });

  // 按权重排序
  filteredRules.sort((a, b) => b.weight - a.weight);

  // 组装规则内容
  const rulesContent = filteredRules.map(rule => {
    // 使用用户自定义内容（如果有）
    const content = customRules?.[rule.key] || rule.content;
    return `## ${rule.name}\n\n${content}`;
  }).join('\n\n---\n\n');

  return rulesContent;
}

/**
 * 获取精简版规则（用于AI交互）
 * 只包含当前场景相关的规则
 */
export function getMinimalRules(degradation?: number): string {
  return assembleRules({ degradation });
}

