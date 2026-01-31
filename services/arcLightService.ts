// 弧光判定服务 - 负责判定和更新角色的弧光状态
// 根据试探期、玩家行为、堕落值等条件判定进入哪条弧光路线

import { ArcLight, BodyStatus, GameTime } from '../types';

/**
 * 判定弧光（试探期5天结束后）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @param playerBehavior 玩家行为记录（需要从对话历史中提取）
 * @returns 判定结果：进入哪条弧光，或继续试探期
 */
export function judgeArcLight(
  bodyStatus: BodyStatus,
  gameTime: GameTime,
  playerBehavior: {
    rejectedAll: boolean; // 是否拒绝了所有试探
    showedJealousy: boolean; // 是否表现出嫉妒/占有欲
    showedNormalLove: boolean; // 是否表现出正常恋爱
    showedSubmission: boolean; // 是否表现出服从/默许
  }
): ArcLight | null {
  // 如果已经在某条弧光中，不再判定
  if (bodyStatus.arcLight !== null) {
    return bodyStatus.arcLight;
  }

  // 试探期未满5天，继续试探
  if (bodyStatus.trialPeriod < 5) {
    return null;
  }

  // 试探期5天结束，开始判定
  // 1. 弧光D：平凡兄妹（拒绝所有试探）
  if (playerBehavior.rejectedAll) {
    return 'D';
  }

  // 2. 弧光E：纯爱恋人（正常恋爱，无SM）
  if (playerBehavior.showedNormalLove && !playerBehavior.showedSubmission) {
    return 'E';
  }

  // 3. 弧光A：秘密共犯（表现出嫉妒/占有欲）
  if (playerBehavior.showedJealousy) {
    return 'A';
  }

  // 4. 弧光B：支配与隐瞒（表现出服从/默许）
  if (playerBehavior.showedSubmission) {
    return 'B';
  }

  // 默认：继续试探期（延长）
  return null;
}

/**
 * 判定弧光A是否可以进入弧光B（每4天判断一次）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @param playerBehavior 玩家行为记录
 * @returns 是否进入弧光B
 */
export function judgeArcLightAtoB(
  bodyStatus: BodyStatus,
  gameTime: GameTime,
  playerBehavior: {
    showedSubmission: boolean; // 是否表现出服从/默许
  }
): boolean {
  // 必须在弧光A中
  if (bodyStatus.arcLight !== 'A') {
    return false;
  }

  // 检查上次判定日期
  const currentDate = `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`;
  const lastCheckDate = bodyStatus.lastArcLightCheck;

  // 如果今天已经检查过，不再检查
  if (lastCheckDate === currentDate) {
    return false;
  }

  // 计算距离上次检查的天数
  if (lastCheckDate) {
    const lastDate = new Date(lastCheckDate);
    const currentDateObj = new Date(currentDate);
    const daysDiff = Math.floor((currentDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // 每4天判断一次
    if (daysDiff < 4) {
      return false;
    }
  }

  // 判定条件：玩家表现出服从/默许
  if (playerBehavior.showedSubmission) {
    return true;
  }

  return false;
}

/**
 * 判定是否触发弧光C（堕落值65）
 * @param bodyStatus 当前身体状态
 * @returns 是否触发弧光C
 */
export function judgeArcLightC(bodyStatus: BodyStatus): boolean {
  // 必须在弧光B中
  if (bodyStatus.arcLight !== 'B') {
    return false;
  }

  // 堕落值达到65，触发弧光C+身体改造
  if (bodyStatus.degradation >= 65 && !bodyStatus.bodyModification.completed) {
    return true;
  }

  return false;
}

/**
 * 判定是否触发身体改造（堕落值65）
 * @param bodyStatus 当前身体状态
 * @returns 是否触发身体改造
 */
export function shouldTriggerBodyModification(bodyStatus: BodyStatus): boolean {
  // 必须在弧光B或C中
  if (bodyStatus.arcLight !== 'B' && bodyStatus.arcLight !== 'C') {
    return false;
  }

  // 已经完成改造，不再触发
  if (bodyStatus.bodyModification.completed) {
    return false;
  }

  // 堕落值达到65，触发身体改造
  if (bodyStatus.degradation >= 65) {
    return true;
  }

  return false;
}

/**
 * 判定是否触发黄毛登场（周三触发）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @returns 是否触发黄毛登场
 */
export function shouldTriggerYellowHair(bodyStatus: BodyStatus, gameTime: GameTime): boolean {
  // 周三时，黄毛首次出现
  // 检查是否是周三（weekday === 3）
  if (gameTime.weekday !== 3) {
    return false;
  }

  // 如果已经有黄毛，不再触发（周三已经触发过了）
  if (bodyStatus.yellowHair1 !== null || bodyStatus.yellowHair2 !== null) {
    return false;
  }

  return true;
}

/**
 * 判定今天是否有黄毛出现（周三之后，每天都可以出现）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @returns 今天是否有黄毛出现
 */
export function shouldYellowHairAppearToday(bodyStatus: BodyStatus, gameTime: GameTime): boolean {
  // 如果还没有黄毛，不能出现
  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 === null) {
    return false;
  }

  // 周三之后，每天都可以出现（随机决定，由AI控制）
  // 这里只返回true，让AI决定今天哪个黄毛出现
  if (gameTime.weekday >= 3) {
    return true;
  }

  return false;
}

/**
 * 计算黄毛的行为阶段值（基于堕落度）
 * @param degradation 当前堕落度
 * @returns 黄毛的行为阶段值
 */
export function calculateYellowHairBehaviorStage(degradation: number): number {
  // 初始值5，随着堕落度增长而增长
  // 但不能差距太大，必须与堕落度匹配
  const behaviorStage = Math.min(degradation + 5, 100);
  
  // 确保行为阶段值不会跳跃太大
  // 如果堕落度很低，行为阶段值也不能太高
  // 注意：温婉接受程度分段（0-25, 26-50, 51-70, 71-90, 91-100）与黄毛行为阶段值分段（0-20, 21-40, 41-60, 61-80, 81-100）错开
  if (degradation < 25 && behaviorStage > 20) {
    return 20;
  }
  if (degradation < 50 && behaviorStage > 40) {
    return 40;
  }
  if (degradation < 70 && behaviorStage > 60) {
    return 60;
  }
  if (degradation < 90 && behaviorStage > 80) {
    return 80;
  }
  
  return behaviorStage;
}

/**
 * 判断温婉是否会接受黄毛的要求（基于堕落度）
 * @param degradation 当前堕落度
 * @param yellowHairBehaviorStage 黄毛的行为阶段值
 * @returns 温婉是否会接受
 */
export function willWenwanAccept(degradation: number, yellowHairBehaviorStage: number): boolean {
  // 温婉接受程度分段：0-25, 26-50, 51-70, 71-90, 91-100
  // 黄毛行为阶段值分段：0-20, 21-40, 41-60, 61-80, 81-100
  
  if (yellowHairBehaviorStage <= 20) {
    // 黄毛邀请约会、看电影、拥抱
    return degradation >= 0; // 任何堕落度都可以接受
  } else if (yellowHairBehaviorStage <= 40) {
    // 黄毛要求接吻、轻度调教
    return degradation >= 26; // 需要堕落度26+
  } else if (yellowHairBehaviorStage <= 60) {
    // 黄毛要求中度调教、口交、手交
    return degradation >= 51; // 需要堕落度51+
  } else if (yellowHairBehaviorStage <= 80) {
    // 黄毛要求深度调教、性交
    return degradation >= 71; // 需要堕落度71+
  } else {
    // 黄毛要求完全恶堕、母狗化
    return degradation >= 91; // 需要堕落度91+
  }
}

/**
 * 生成黄毛信息（随机选择富二代或肥宅）
 * @returns 黄毛信息
 */
export function generateYellowHair(): { name: string; type: 'rich' | 'fat' } {
  const isRich = Math.random() < 0.45; // 45%概率富二代
  if (isRich) {
    return { name: '黄耄', type: 'rich' };
  } else {
    return { name: '猪楠', type: 'fat' };
  }
}

/**
 * 决定今天哪个黄毛出现（可以轮流出现）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @returns 今天出现的黄毛信息，或null
 */
export function decideTodayYellowHair(bodyStatus: BodyStatus, gameTime: GameTime): { name: string; type: 'rich' | 'fat' } | null {
  // 如果还没有黄毛，返回null
  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 === null) {
    return null;
  }

  // 如果只有一个黄毛，返回那个
  if (bodyStatus.yellowHair1 !== null && bodyStatus.yellowHair2 === null) {
    return { name: bodyStatus.yellowHair1.name, type: bodyStatus.yellowHair1.type };
  }
  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 !== null) {
    return { name: bodyStatus.yellowHair2.name, type: bodyStatus.yellowHair2.type };
  }

  // 如果两个黄毛都存在，可以轮流出现（根据日期决定）
  // 奇数天：黄毛1，偶数天：黄毛2
  if (bodyStatus.yellowHair1 !== null && bodyStatus.yellowHair2 !== null) {
    const isOddDay = gameTime.day % 2 === 1;
    if (isOddDay) {
      return { name: bodyStatus.yellowHair1.name, type: bodyStatus.yellowHair1.type };
    } else {
      return { name: bodyStatus.yellowHair2.name, type: bodyStatus.yellowHair2.type };
    }
  }

  return null;
}

/**
 * 判定是否生成弧光D结局（800字左右）
 * @param bodyStatus 当前身体状态
 * @returns 是否生成结局
 */
export function shouldGenerateArcLightDEnding(bodyStatus: BodyStatus): boolean {
  return bodyStatus.arcLight === 'D';
}




