/**
 * 游戏逻辑规则
 * 定义状态更新、身体部位开发等游戏机制
 */

export const GAMEPLAY_LOGIC_RULES = `
**GAMEPLAY LOGIC**:
- Update 'favorability' (好感度) based on interaction with brother. This controls what sexual acts Wenwan is willing to do with brother.
- Update 'degradation' (堕落度) based on interaction with others (黄毛/间男) ONLY. This affects Wenwan's attitude and behavior.
- **CRITICAL**: If brother behaves inappropriately (forcing, disrespectful, etc.), **decrease favorability (-1 to -2 points)**, NOT degradation. Degradation ONLY increases through 黄毛/间男 events.
- Update 'libido' (性欲) based on arousal and sexual activity.
- **CRITICAL: Body Part Development (身体部位开发度)**:
  * **Only update body parts that are ACTUALLY USED** in the current interaction.
  * For example: If the interaction involves touching/playing with her breasts, update 'chest' and 'nipples' usageCount and level.
  * If the interaction does NOT involve a specific body part, DO NOT update that part's status.
  * Development level (level) is calculated based on usageCount:
    * level 0: usageCount < 50 (未开发)
    * level 1: usageCount >= 50 (轻微开发)
    * level 2: usageCount >= 150 (中度开发)
    * level 3: usageCount >= 350 (深度开发)
  * **重要：使用次数增长机制**：
    * 如果某个部位在事件中被**持续使用**（如一直玩、一直操、长时间调教），使用次数增长应为**5-15次**，而不是1次。
    * 增长次数根据使用强度和时长判断：
      * 短时间/轻度使用（如简单触碰、短暂抚摸）：5-8次
      * 中等强度/时长（如正常性爱、持续调教）：9-12次
      * 长时间/高强度使用（如长时间玩弄、持续操弄、深度调教）：13-15次
    * AI需要根据事件描述中的使用强度和时长，判断并设置相应的使用次数增长。
    * 如果只是简单使用一次（如快速触碰），可以只增长1次。
  * **Example**: If 黄毛 only touches her mouth briefly, update 'mouth' usageCount +1. If 黄毛 continuously plays with her mouth for a long time, update 'mouth' usageCount +5 to +15 based on intensity.
- 'innerThought' must reveal her true feelings (often contrasting with her outward behavior).
- 'currentAction' describes what she is physically doing right now.
`.trim();

