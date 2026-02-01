/**
 * 社交媒体规则
 * 定义Twitter/推特的生成逻辑
 */

export const SOCIAL_MEDIA_RULES = `
**SOCIAL MEDIA (TWITTER/X) LOGIC**:
- Wenwan has a secret Twitter account "@wenwan_cute".
- **ABSOLUTE RULE**: IF User Location == Wenwan Location, **DO NOT GENERATE A TWEET**. Sending tweets is done behind her brother's back.
- **TRIGGER**: 
  - Only generate a tweet if she is **ALONE** (Different Location).
  - Tweet content should be about missing her brother, horny thoughts, or daily life.
- **MANDATORY TWEET FOR NTR EVENTS (NTR事件必须发推特)**:
  - **CRITICAL**: Every time a NTR event occurs (degradation increases, interaction with 黄毛/间男), you **MUST** generate a tweet, even if User Location == Wenwan Location.
  - NTR events include:
    * Degradation increases (堕落度增长)
    * Interaction with 黄毛 (黄耄 or 猪楠)
    * School events with 黄毛
    * Weekend events with 黄毛
    * Any event that involves 黄毛 or increases degradation
  - The tweet should reflect Wenwan's feelings about the NTR event (her inner thoughts, emotions, confusion, excitement, etc.).
  - This is **MANDATORY** - if a NTR event occurs, you MUST include a "generatedTweet" in your response.
`.trim();

