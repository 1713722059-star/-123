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
 * 判定是否触发黄毛登场（进入弧光B）
 * @param bodyStatus 当前身体状态
 * @returns 是否触发黄毛登场
 */
export function shouldTriggerYellowHair(bodyStatus: BodyStatus): boolean {
  // 必须在弧光B中
  if (bodyStatus.arcLight !== 'B') {
    return false;
  }

  // 如果已经有黄毛，不再触发
  if (bodyStatus.yellowHair1 !== null || bodyStatus.yellowHair2 !== null) {
    return false;
  }

  return true;
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
 * 判定是否生成弧光D结局（800字左右）
 * @param bodyStatus 当前身体状态
 * @returns 是否生成结局
 */
export function shouldGenerateArcLightDEnding(bodyStatus: BodyStatus): boolean {
  return bodyStatus.arcLight === 'D';
}




