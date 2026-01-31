import React, { useEffect, useRef, useState } from 'react';
import { CharacterTachie } from './components/CharacterTachie';
import { DialogueInterface } from './components/DialogueInterface';
import { PhoneInterface } from './components/PhoneInterface';
import { SettingsPanel } from './components/SettingsPanel';
import { StartScreen } from './components/StartScreen';
import { Wallpaper } from './components/Wallpaper';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { isMobileBrowser as checkMobileBrowser } from './utils/deviceUtils';
import { useDialogue } from './hooks/useDialogue';
import { useGameTime } from './hooks/useGameTime';
import { useLocation } from './hooks/useLocation';
import { loadGame, saveGame, shouldAutoSave } from './services/saveService';
import { setupSillyTavernEventListeners } from './services/sillytavernApiService';
import { summarizeCharacterMessages } from './services/summaryService';
import { generateTimeSkipNarrative } from './services/timeSkipService';
import { AppID, BackpackItem, BodyStatus, CalendarEvent, GameTime, LocationID, Message, Tweet } from './types';

// --- Main App Logic ---

// 内部组件，需要使用SettingsContext
const AppContent: React.FC = () => {
  const { settings } = useSettings();
  // 手机模式下：null=关闭，'tachie'=显示立绘，AppID.HOME或其他=显示手机
  const [activeApp, setActiveApp] = useState<AppID | null>(AppID.HOME);
  const [gameStarted, setGameStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMidnightChoice, setShowMidnightChoice] = useState(false); // 半夜选择弹窗
  const AVATAR_URL = "https://files.catbox.moe/5883oe.jpeg";

  // Game State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      sender: 'character',
      text: '（周六的午后，温婉慵懒地躺在客厅的沙发上，手里拿着手机，眼神却时不时瞟向你的方向...）\n\n"哥哥...周末好无聊啊..."\n\n（她故意把腿搭在沙发扶手上，宽松的睡裙滑落，露出白皙的大腿。注意到你的视线，她脸微微泛红，却没有把腿收回去，反而轻轻晃了晃脚尖...）\n\n"哥哥...要不要...陪我聊聊天？"',
      timestamp: new Date()
    }
  ]);

  // Tweets State (Moved here to allow dynamic addition)
  const [tweets, setTweets] = useState<Tweet[]>([
    {
      id: '1',
      author: '婉婉酱_Ovo',
      handle: '@wenwan_cute',
      avatar: AVATAR_URL,
      content: '哥哥今天也好帅...偷偷拍了一张照片 (//▽//) #日常 #哥哥',
      hasImage: true,
      imageDescription: "照片是偷拍视角，从门缝里拍到的。哥哥正坐在书桌前认真工作，侧脸轮廓分明。阳光洒在他身上，显得格外温柔。",
      likes: 520,
      retweets: 13,
      time: '10分钟前',
      isPrivate: true,
      comments: 58
    },
    {
      id: '2',
      author: '婉婉酱_Ovo',
      handle: '@wenwan_cute',
      avatar: AVATAR_URL,
      content: '新买的裙子有点短...但是哥哥说好看的话就没关系吧？',
      hasImage: true,
      imageDescription: "对着卧室的全身镜自拍。她穿着一件淡蓝色的百褶短裙，裙摆很短，露出修长白皙的双腿。她一手拿着手机挡住脸，另一只手轻轻提着裙摆，姿势有些害羞。",
      likes: 128,
      retweets: 5,
      time: '3小时前',
      isPrivate: false,
      comments: 22
    }
  ]);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]); // New State for Memories
  const [todaySummary, setTodaySummary] = useState<string>(''); // 今日总结

  // 用于保存编辑点的状态快照
  const messageSnapshotsRef = useRef<Map<string, {
    messages: Message[];
    bodyStatus: BodyStatus;
    userLocation: LocationID;
    tweets: Tweet[];
    calendarEvents: CalendarEvent[];
    todaySummary: string;
    gameTime: GameTime;
  }>>(new Map());

  // 编辑消息处理函数
  const handleEditMessage = (messageId: string, newText: string) => {
    // 找到要编辑的消息
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // 保存编辑点的状态快照（用于重新生成时使用）
    const snapshot = {
      messages: messages.slice(0, messageIndex + 1), // 包含编辑后的消息
      bodyStatus: { ...bodyStatus },
      userLocation,
      tweets: [...tweets],
      calendarEvents: [...calendarEvents],
      todaySummary,
      gameTime: { ...gameTime }
    };
    messageSnapshotsRef.current.set(messageId, snapshot);

    // 更新消息内容
    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, text: newText } : m
    ));
  };

  // 偷内衣处理函数
  const handleStealUnderwear = async () => {
    // 确保温婉位置在次卧（偷内衣时）
    setBodyStatus(prev => ({
      ...prev,
      location: 'guest_bedroom' // 确保温婉在次卧
    }));

    // 根据好感度判断是否被发现
    const favorability = bodyStatus.favorability;
    let discoveryChance = 0;

    // 好感度越高，越不容易被发现
    if (favorability >= 80) {
      discoveryChance = 10; // 10%概率被发现
    } else if (favorability >= 60) {
      discoveryChance = 25; // 25%概率被发现
    } else if (favorability >= 40) {
      discoveryChance = 40; // 40%概率被发现
    } else {
      discoveryChance = 60; // 60%概率被发现
    }

    const isDiscovered = Math.random() * 100 < discoveryChance;

    if (isDiscovered) {
      // 被发现
      await handleAction('(System: User sneaks into Wenwan\'s room at midnight to steal underwear, but Wenwan wakes up and discovers him. Generate a dramatic scene where Wenwan confronts the user. The reaction should be based on favorability: high favorability = shocked but forgiving, low favorability = angry and disappointed. Update degradation if favorability is low.)', true);
    } else {
      // 成功偷到
      await handleAction('(System: User sneaks into Wenwan\'s room at midnight and successfully steals her underwear without being discovered. Generate a scene describing the action and Wenwan sleeping peacefully. Update favorability slightly down if this is a "creepy" action, or degradation up if favorability is already low.)', true);
    }

    // 偷完或被发现后，等待AI回复完成后再跳到第二天早上8点
    // 延迟时间更长，确保AI回复完成
    setTimeout(() => {
      const currentTime = gameTime;
      const nextMorning = { ...currentTime };
      nextMorning.hour = 8;
      nextMorning.minute = 0;
      const nextDay = new Date(nextMorning.year, nextMorning.month - 1, nextMorning.day + 1);
      nextMorning.year = nextDay.getFullYear();
      nextMorning.month = nextDay.getMonth() + 1;
      nextMorning.day = nextDay.getDate();
      nextMorning.weekday = nextDay.getDay();
      setGameTime(nextMorning);

      // 确保温婉位置在次卧（早上8点她应该还在房间）
      setBodyStatus(prev => ({
        ...prev,
        location: prev.location || 'guest_bedroom' // 如果位置丢失，恢复为次卧
      }));
    }, 2000);
  };

  // 重新生成消息处理函数
  const handleRegenerateMessage = (messageId: string) => {
    // 找到要重新生成的消息
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // 如果重新生成的是AI消息，删除该消息及之后的所有消息
    if (messages[messageIndex].sender === 'character') {
      const messageTime = messages[messageIndex].timestamp;

      // 找到该AI消息对应的用户消息（应该是前一条）
      const userMessageIndex = messageIndex - 1;
      if (userMessageIndex >= 0 && messages[userMessageIndex].sender === 'user') {
        const userMessage = messages[userMessageIndex];

        // 检查是否有该用户消息的编辑点快照
        const snapshot = messageSnapshotsRef.current.get(userMessage.id);

        if (snapshot) {
          // 使用编辑点的状态快照
          // 删除该AI消息及之后的所有消息
          setMessages(snapshot.messages);

          // 恢复编辑点的状态
          setBodyStatus(snapshot.bodyStatus);
          setUserLocation(snapshot.userLocation);
          setTweets(snapshot.tweets);
          setCalendarEvents(snapshot.calendarEvents);
          setTodaySummary(snapshot.todaySummary);
          setGameTime(snapshot.gameTime);

          // 重新触发AI回复（使用系统操作，不重复添加用户消息）
          setTimeout(() => {
            handleAction(userMessage.text, true);
          }, 100);
        } else {
          // 没有快照，使用当前状态（但删除后续消息）
          setMessages(prev => prev.slice(0, messageIndex));

          // 删除该时间点之后的所有记忆（根据消息时间戳）
          setCalendarEvents(prev => prev.filter(e => {
            const eventTime = parseInt(e.id);
            return eventTime < messageTime.getTime();
          }));

          // 重新触发AI回复（使用系统操作，不重复添加用户消息）
          setTimeout(() => {
            handleAction(userMessage.text, true);
          }, 100);
        }
      }
    }
  };

  // Wallet State - 钱包余额和消费记录
  const [walletBalance, setWalletBalance] = useState<number>(500); // 初始余额500元
  const [walletTransactions, setWalletTransactions] = useState<Array<{
    id: string;
    name: string;
    price: number;
    date: string;
    type: 'expense' | 'income';
  }>>([]);

  // Backpack State - 背包物品
  const [backpackItems, setBackpackItems] = useState<BackpackItem[]>([]);

  // 已解锁的立绘服装ID（用于控制左侧立绘可选服装）
  const defaultUnlockedOutfits = ['pajamas', 'jk', 'white_shirt', 'lingerie', 'nude'];
  const [unlockedOutfits, setUnlockedOutfits] = useState<string[]>(defaultUnlockedOutfits);

  // User Location State
  const [userLocation, setUserLocation] = useState<LocationID>('master_bedroom');

  // Game Time Management
  const { gameTime, advance, skipToday, skipTwoDays, skipWeek, formatTime, formatDate, setGameTime } = useGameTime();

  // 用于跟踪上次总结时的消息数量
  const lastSummaryMessageCount = useRef(0);

  // 用于跟踪上次自动存档的时间
  const lastAutoSaveTimeRef = useRef<GameTime | null>(null);

  // Status
  const [bodyStatus, setBodyStatus] = useState<BodyStatus>({
    location: 'master_bedroom',
    favorability: 30, // Initial Stage: 挑逗试探阶段 (30-39)
    libido: 0, // Initial Stage: 0
    degradation: 0, // Initial Stage: 0
    emotion: 'shy',
    arousal: 0, // Initial Stage: 0
    heartRate: 70, // Resting Heart Rate
    overallClothing: "宽松的普通睡衣", // Initial Clothing Match
    currentAction: "正趴在飘窗上晒着太阳，小腿轻轻晃动",
    innerThought: "哥哥终于不忙了...好想让他抱抱我呀...",
    mouth: { level: 0, usageCount: 0, status: "未开发", clothing: "润唇膏", lastUsedBy: "无", usageProcess: "暂无记录" },
    chest: { level: 0, usageCount: 0, status: "未开发", clothing: "真空", lastUsedBy: "无", usageProcess: "暂无记录" },
    nipples: { level: 0, usageCount: 0, status: "敏感度低", clothing: "乳贴", lastUsedBy: "无", usageProcess: "暂无记录" },
    groin: { level: 0, usageCount: 0, status: "未开发", clothing: "纯棉白色内裤", lastUsedBy: "无", usageProcess: "暂无记录" },
    posterior: { level: 0, usageCount: 0, status: "未开发", clothing: "无", lastUsedBy: "无", usageProcess: "暂无记录" },
    feet: { level: 0, usageCount: 0, status: "未开发", clothing: "赤足", lastUsedBy: "无", usageProcess: "暂无记录" },
    // 新增：弧光系统（初始为null，处于试探期）
    arcLight: null,
    trialPeriod: 0, // 试探期从0开始计数
    lastArcLightCheck: '', // 初始为空，第一次检查时设置
    // 新增：黄毛系统（初始为空）
    yellowHair1: null,
    yellowHair2: null,
    // 新增：身体改造（初始未完成）
    bodyModification: {
      completed: false,
      items: []
    }
  });

  const handleStartGame = () => {
    setGameStarted(true);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log("Error attempting to enable full-screen mode:", err.message);
      });
    }
  };

  const handleCloseApp = () => setActiveApp(AppID.HOME);

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
  };

  const handleBackToMain = () => {
    setShowSettings(false);
    setGameStarted(false);
  };

  // 从奢侈品店购买服装：扣钱+进背包（不直接解锁立绘）
  const handleBuyClothing = async (outfitId: string, name: string, description: string, price: number) => {
    if (walletBalance < price) {
      alert('余额不足，无法购买该服装。');
      return;
    }
    setWalletBalance(prev => prev - price);
    const now = formatTime(gameTime);
    const itemId = Date.now().toString();
    const newItem: BackpackItem = {
      id: itemId,
      name,
      description,
      price,
      date: now,
      type: 'clothing',
      outfitId,
    };
    setBackpackItems(prev => [newItem, ...prev]);
    setWalletTransactions(prev => [{
      id: itemId,
      name: `购买：${name}`,
      price,
      date: now,
      type: 'expense',
    }, ...prev]);

    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby) {
      // 温婉在身边，生成剧情对话
      await handleAction(`(System: 哥哥在奢侈品店购买了【${name}】，温婉就在身边看到了。根据当前好感度，生成温婉的反应和对话。她可能会询问、评论、或者表现出好奇/害羞等情绪。如果好感度高，她可能会期待哥哥送给她；如果好感度低，她可能会觉得奇怪或保持距离。)`, true);
    } else {
      // 温婉不在身边，简单描述即可
      setMessages(prev => [...prev, {
        id: itemId,
        sender: 'system',
        text: `你购买了【${name}】，已放入背包。`,
        timestamp: new Date()
      }]);
    }
  };

  // 使用物品（情趣用品等）：生成剧情
  // 注意：这个函数会被 useDialogue 调用，所以不能直接使用 handleAction
  // 需要返回一个标记，让 useDialogue 内部调用 handleAction
  const handleUseItem = async (itemId: string, name: string, description: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback) {
      // 温婉在身边，生成使用物品的剧情对话
      await handleActionCallback(`(System: 哥哥使用了【${name}】（${description}），温婉就在身边。根据当前好感度和物品类型，生成温婉的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会配合或接受；如果好感度低，她可能会觉得尴尬或拒绝。记得更新情绪、好感度、性欲等相关状态。)`, true);
    } else if (!isWenwanNearby) {
      // 温婉不在身边，提示不在
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `温婉不在身边，无法使用【${name}】。`,
        timestamp: new Date()
      }]);
    }
  };

  // 赠送物品给温婉：生成剧情
  const handleGiftItem = async (itemId: string, name: string, description: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback) {
      // 温婉在身边，生成赠送物品的剧情对话
      await handleActionCallback(`(System: 哥哥将【${name}】（${description}）赠送给了温婉。根据当前好感度和物品类型，生成温婉收到礼物后的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会接受并配合使用；如果好感度低，她可能会觉得尴尬或拒绝。记得更新情绪和好感度。)`, true);
      // 从背包中移除物品
      setBackpackItems(prev => prev.filter(item => item.id !== itemId));
    } else if (!isWenwanNearby) {
      // 温婉不在身边，提示不在
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `温婉不在身边，无法赠送【${name}】。`,
        timestamp: new Date()
      }]);
    }
  };

  // 在背包中赠送服装给温婉：移除背包条目+解锁对应立绘
  const handleGiftClothing = async (outfitId: string, itemId: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    if (!outfitId) {
      alert('这件物品没有绑定对应的服装ID，无法解锁立绘。');
      return;
    }

    // 找到要赠送的物品信息
    const itemToGift = backpackItems.find(item => item.id === itemId);
    if (!itemToGift) return;

    setBackpackItems(prev => prev.filter(item => item.id !== itemId));
    setUnlockedOutfits(prev => {
      if (prev.includes(outfitId)) return prev;
      return [...prev, outfitId];
    });

    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback) {
      // 温婉在身边，生成剧情对话
      await handleActionCallback(`(System: 哥哥将【${itemToGift.name}】赠送给了温婉。根据当前好感度，生成温婉收到礼物后的反应和对话。她可能会开心、害羞、感动等。如果好感度高，她可能会主动拥抱或亲吻；如果好感度低，她可能会礼貌地接受但保持距离。记得更新情绪和好感度。)`, true);
    } else if (!isWenwanNearby) {
      // 温婉不在身边，简单描述即可
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `你将【${itemToGift.name}】放在了温婉的房间，等她回来就能看到。对应立绘已解锁。`,
        timestamp: new Date()
      }]);
    }
  };

  // 存档功能
  const handleSaveGame = (slotId: number, customName?: string) => {
    const success = saveGame(
      slotId,
      gameTime,
      messages,
      bodyStatus,
      userLocation,
      tweets,
      calendarEvents,
      todaySummary,
      customName,
      walletBalance,
      walletTransactions,
      backpackItems,
      unlockedOutfits
    );
    if (success) {
      if (slotId === 0) {
        lastAutoSaveTimeRef.current = { ...gameTime };
      }
    }
  };

  // 读档功能
  const handleLoadGame = (slotId: number) => {
    const save = loadGame(slotId);
    if (save) {
      // 恢复游戏状态
      setMessages(save.messages);
      setBodyStatus(save.bodyStatus);
      setUserLocation(save.userLocation);
      setTweets(save.tweets);
      setCalendarEvents(save.calendarEvents);
      setTodaySummary(save.todaySummary);

      // 恢复钱包数据
      if (save.walletBalance !== undefined) {
        setWalletBalance(save.walletBalance);
      }
      if (save.walletTransactions) {
        setWalletTransactions(save.walletTransactions);
      }

      // 恢复背包数据
      if (save.backpackItems) {
        setBackpackItems(save.backpackItems);
      }

      // 恢复已解锁服装（如无则使用默认）
      if (save.unlockedOutfits && save.unlockedOutfits.length > 0) {
        setUnlockedOutfits(save.unlockedOutfits);
      } else {
        setUnlockedOutfits(defaultUnlockedOutfits);
      }

      // 恢复游戏时间
      setGameTime(save.gameTime);

      // 更新自动存档时间
      lastAutoSaveTimeRef.current = save.gameTime;

      // 开始游戏
      setGameStarted(true);

      alert('存档读取成功！');
    } else {
      alert('读取存档失败！');
    }
  };

  // 使用对话处理 Hook（现在在SettingsProvider内部，可以使用useSettings）
  const {
    input,
    isLoading,
    suggestedActions,
    setInput,
    handleAction,
    addMemory
  } = useDialogue({
    messages,
    bodyStatus,
    userLocation,
    tweets,
    calendarEvents,
    setMessages,
    setBodyStatus,
    setTweets,
    setCalendarEvents,
    avatarUrl: AVATAR_URL,
    todaySummary, // 传递今日记忆
    advance, // 传递时间推进函数
    gameTime, // 传递当前游戏时间
    setUserLocation, // 传递用户位置更新函数
    onSaveGame: handleSaveGame, // 传递保存游戏函数，用于AI回复后自动保存
    backpackItems, // 传递背包物品，用于检测对话中的使用/赠送
    onUseItem: handleUseItem, // 传递使用物品函数
    onGiftItem: handleGiftItem, // 传递赠送物品函数
    onGiftClothing: handleGiftClothing, // 传递赠送服装函数
  });

  // 创建包装函数，将 handleAction 传递给背包按钮点击时的函数调用
  const handleUseItemWithAction = async (itemId: string, name: string, description: string) => {
    await handleUseItem(itemId, name, description, handleAction);
  };

  const handleGiftItemWithAction = async (itemId: string, name: string, description: string) => {
    await handleGiftItem(itemId, name, description, handleAction);
  };

  const handleGiftClothingWithAction = async (outfitId: string, itemId: string) => {
    await handleGiftClothing(outfitId, itemId, handleAction);
  };

  // 使用位置移动 Hook
  const { handleMoveUser } = useLocation({
    userLocation,
    setUserLocation,
    handleAction,
    addMemory,
    advance // 传递时间推进函数
  });

  // 用于跟踪跳过时间操作
  const skipTimeDataRef = useRef<{ oldTime: GameTime; days: number; loadingMessageId: string } | null>(null);
  const previousTimeRef = useRef<GameTime>(gameTime);

  // 包装跳过时间函数，记录跳过操作并显示加载提示
  const handleSkipToday = () => {
    const loadingMessageId = Date.now().toString();
    // 立即显示"时间流逝中..."提示
    setMessages(prev => [...prev, {
      id: loadingMessageId,
      sender: 'system',
      text: '【时间流逝中...】\n\n正在生成剧情描述，请稍候...',
      timestamp: new Date()
    }]);
    skipTimeDataRef.current = { oldTime: { ...gameTime }, days: 1, loadingMessageId };
    skipToday();
  };

  const handleSkipTwoDays = () => {
    const loadingMessageId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: loadingMessageId,
      sender: 'system',
      text: '【时间流逝中...】\n\n正在生成剧情描述，请稍候...',
      timestamp: new Date()
    }]);
    skipTimeDataRef.current = { oldTime: { ...gameTime }, days: 2, loadingMessageId };
    skipTwoDays();
  };

  const handleSkipWeek = () => {
    const loadingMessageId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: loadingMessageId,
      sender: 'system',
      text: '【时间流逝中...】\n\n正在生成剧情描述，请稍候...',
      timestamp: new Date()
    }]);
    skipTimeDataRef.current = { oldTime: { ...gameTime }, days: 7, loadingMessageId };
    skipWeek();
  };

  // 监听时间变化，当检测到跳过操作时生成剧情
  useEffect(() => {
    const prevTime = previousTimeRef.current;
    const currentTime = gameTime;

    // 检查是否是跳过操作
    if (skipTimeDataRef.current) {
      const { oldTime, days, loadingMessageId } = skipTimeDataRef.current;

      // 计算实际跳过的天数
      const oldDate = new Date(oldTime.year, oldTime.month - 1, oldTime.day);
      const newDate = new Date(currentTime.year, currentTime.month - 1, currentTime.day);
      const actualDays = Math.floor((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24));

      if (actualDays > 0) {
        // 生成剧情
        // 定义重试函数
        const retryGenerateNarrative = () => {
          // 重新生成剧情
          generateTimeSkipNarrative(
            actualDays,
            oldTime,
            currentTime,
            bodyStatus,
            settings.mainAI
          ).then(narrative => {
            if (narrative && narrative.trim()) {
              // 替换消息为实际剧情
              setMessages(prev => prev.map(msg =>
                msg.id === loadingMessageId
                  ? {
                    ...msg,
                    text: `【时间流逝】\n\n${narrative}`,
                    isRetryable: false, // 成功后移除重试按钮
                    retryAction: undefined
                  }
                  : msg
              ));
            } else {
              // 如果生成失败，保留重试按钮
              setMessages(prev => prev.map(msg =>
                msg.id === loadingMessageId
                  ? {
                    ...msg,
                    text: '【时间流逝】\n\n时间已跳过，但剧情生成失败。点击下方按钮重试。',
                    isRetryable: true,
                    retryAction: retryGenerateNarrative
                  }
                  : msg
              ));
            }
          }).catch(err => {
            console.error('生成跳过时间剧情失败:', err);
            // 保留重试按钮
            setMessages(prev => prev.map(msg =>
              msg.id === loadingMessageId
                ? {
                  ...msg,
                  text: `【时间流逝】\n\n时间已跳过，但剧情生成失败：${err instanceof Error ? err.message : '未知错误'}。点击下方按钮重试。`,
                  isRetryable: true,
                  retryAction: retryGenerateNarrative
                }
                : msg
            ));
          });
        };

        // 首次生成
        retryGenerateNarrative();

        // 清除标记
        skipTimeDataRef.current = null;
      }
    }

    previousTimeRef.current = currentTime;
  }, [gameTime.year, gameTime.month, gameTime.day, bodyStatus, settings.mainAI]);

  // 监听消息变化，生成总结（不再自动推进时间）
  // 时间推进改为在用户发送消息时推进，而不是AI回复后
  useEffect(() => {
    const characterMessageCount = messages.filter(m => m.sender === 'character').length;

    // 每5条角色消息生成一次总结
    if (characterMessageCount >= 5 && characterMessageCount % 5 === 0 && characterMessageCount > lastSummaryMessageCount.current) {
      lastSummaryMessageCount.current = characterMessageCount;
      summarizeCharacterMessages(messages, settings.mainAI)
        .then(summary => {
          if (summary) {
            setTodaySummary(summary);
          }
        })
        .catch(err => {
          console.error('生成总结失败:', err);
        });
    }
  }, [messages, settings.mainAI]);

  // 自动存档：每天早上7点自动保存
  useEffect(() => {
    if (!gameStarted) return;

    const shouldSave = shouldAutoSave(gameTime, lastAutoSaveTimeRef.current);
    if (shouldSave && gameTime.hour >= 7) {
      handleSaveGame(0); // 自动存档到槽位0
      console.log('自动存档已触发');
    }
  }, [gameTime.year, gameTime.month, gameTime.day, gameTime.hour, gameStarted]);

  // 设置SillyTavern事件监听，自动同步世界书和预设更新
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cleanup = setupSillyTavernEventListeners(
      // 世界书更新回调
      (worldbookName: string, entries: any[]) => {
        console.log(`[SillyTavern] 世界书 "${worldbookName}" 已更新，清除缓存`);
        // 导入clearSystemInstructionCache函数
        import('./services/characterService').then(module => {
          module.clearSystemInstructionCache();
        });
      },
      // 预设变更回调
      (presetName: string) => {
        console.log(`[SillyTavern] 预设 "${presetName}" 已变更，清除缓存`);
        import('./services/characterService').then(module => {
          module.clearSystemInstructionCache();
        });
      }
    );

    return cleanup;
  }, []);

  // 自动检测是否为手机浏览器，并自动切换到手机模式
  const [isMobileBrowser, setIsMobileBrowser] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      if (typeof window === 'undefined') return;

      // 使用统一的移动端检测函数
      const isMobile = checkMobileBrowser();

      // 如果是手机设备或小屏幕竖屏，自动切换到手机模式
      if (isMobile && settings.displayMode === 'desktop') {
        setIsMobileBrowser(true);
        // 注意：这里不自动切换displayMode，让用户手动切换，但我们可以优化布局
      } else {
        setIsMobileBrowser(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, [settings.displayMode]);

  return (
    <div className="relative w-screen h-screen overflow-hidden text-slate-800 font-sans flex items-center justify-center" style={{
      height: '100dvh', // 使用动态视口高度，适配手机浏览器
      minHeight: '-webkit-fill-available' // iOS Safari支持
    } as React.CSSProperties}>
      <Wallpaper />

      {/* Start Screen Overlay */}
      {!gameStarted && <StartScreen onStart={handleStartGame} onOpenSettings={handleOpenSettings} onLoadGame={handleLoadGame} />}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          onClose={handleCloseSettings}
          onBackToMain={handleBackToMain}
        />
      )}

      {/* 半夜选择弹窗（是否潜入妹妹房间） */}
      {showMidnightChoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4">【晚上11点】</h3>
            <p className="text-gray-600 mb-6">你躺在床上，突然想到温婉就在隔壁房间...</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowMidnightChoice(false);
                  // 潜入妹妹房间，触发偷内衣剧情
                  handleStealUnderwear();
                }}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700"
              >
                潜入妹妹房间
              </button>
              <button
                onClick={() => {
                  setShowMidnightChoice(false);
                  // 继续睡，跳到第二天早上8点
                  const nightTime = gameTime;
                  const nextMorning = { ...nightTime };
                  nextMorning.hour = 8;
                  nextMorning.minute = 0;
                  const nextDay = new Date(nextMorning.year, nextMorning.month - 1, nextMorning.day + 1);
                  nextMorning.year = nextDay.getFullYear();
                  nextMorning.month = nextDay.getMonth() + 1;
                  nextMorning.day = nextDay.getDate();
                  nextMorning.weekday = nextDay.getDay();
                  setGameTime(nextMorning);

                  setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    sender: 'system',
                    text: '你沉沉睡去，直到第二天早上8点...',
                    timestamp: new Date()
                  }]);

                  // 确保温婉位置在次卧（早上8点）
                  setBodyStatus(prev => ({
                    ...prev,
                    location: prev.location || 'guest_bedroom'
                  }));
                }}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
              >
                继续睡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 根据显示模式切换布局 */}
      {settings.displayMode === 'desktop' ? (
        /* 电脑模式：3栏布局 */
        <div className={`flex w-full h-full max-w-[1800px] gap-6 p-6 transition-opacity duration-1000 ${gameStarted ? 'opacity-100' : 'opacity-0'}`}>

          {/* --- LEFT: Character Tachie (Fixed 380px) --- */}
          <div className="w-[380px] shrink-0 h-full animate-fade-in flex flex-col justify-center">
            <CharacterTachie status={bodyStatus} unlockedOutfits={unlockedOutfits} />
          </div>

          {/* --- CENTER: Dialogue Interface (Flexible) --- */}
          <DialogueInterface
            messages={messages}
            input={input}
            isLoading={isLoading}
            suggestedActions={suggestedActions}
            onInputChange={setInput}
            onAction={handleAction}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
          />

          {/* --- RIGHT: Phone Interface (Fixed 380px) --- */}
          <PhoneInterface
            activeApp={activeApp}
            onCloseApp={handleCloseApp}
            onSetActiveApp={setActiveApp}
            onOpenSettings={handleOpenSettings}
            messages={messages}
            tweets={tweets}
            bodyStatus={bodyStatus}
            userLocation={userLocation}
            sisterLocation={bodyStatus.location}
            onMoveUser={handleMoveUser}
            onAction={handleAction}
            calendarEvents={calendarEvents}
            gameTime={gameTime}
            onSkipToday={handleSkipToday}
            onSkipTwoDays={handleSkipTwoDays}
            onSkipWeek={handleSkipWeek}
            todaySummary={todaySummary}
            onSaveGame={handleSaveGame}
            onLoadGame={handleLoadGame}
            walletBalance={walletBalance}
            walletTransactions={walletTransactions}
            onSpendMoney={(amount: number, item: string) => {
              if (walletBalance >= amount) {
                setWalletBalance(prev => prev - amount);
                setWalletTransactions(prev => [{
                  id: Date.now().toString(),
                  name: item,
                  price: amount,
                  date: formatTime(gameTime),
                  type: 'expense'
                }, ...prev]);
              } else {
                alert('余额不足！');
              }
            }}
            onBuyItem={async (name: string, description: string, price: number) => {
              if (walletBalance < price) {
                alert('余额不足！');
                return;
              }
              setWalletBalance(prev => prev - price);
              const itemId = Date.now().toString();
              setBackpackItems(prev => [{
                id: itemId,
                name,
                description,
                price,
                date: formatTime(gameTime),
                type: 'item'
              }, ...prev]);
              setWalletTransactions(prev => [{
                id: itemId,
                name: `购买：${name}`,
                price,
                date: formatTime(gameTime),
                type: 'expense'
              }, ...prev]);

              // 检查温婉是否在身边
              const isWenwanNearby = bodyStatus.location === userLocation;
              if (isWenwanNearby) {
                // 温婉在身边，生成剧情对话
                await handleAction(`(System: 哥哥在情趣用品店购买了【${name}】，温婉就在身边看到了。根据当前好感度，生成温婉的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会脸红但接受；如果好感度低，她可能会觉得尴尬或保持距离。)`, true);
              } else {
                // 温婉不在身边，简单描述即可
                setMessages(prev => [...prev, {
                  id: itemId,
                  sender: 'system',
                  text: `你购买了【${name}】，已放入背包。`,
                  timestamp: new Date()
                }]);
              }
            }}
            onEarnMoney={(amount: number, source: string) => {
              setWalletBalance(prev => prev + amount);
              setWalletTransactions(prev => [{
                id: Date.now().toString(),
                name: source,
                price: amount,
                date: formatTime(gameTime),
                type: 'income'
              }, ...prev]);
              alert(`工作完成！获得¥${amount}`);
            }}
            onSleep={async () => {
              // 睡觉：跳到晚上11点，然后弹出选择
              const currentTime = gameTime;

              // 先跳到晚上11点
              const nightTime = { ...gameTime };
              nightTime.hour = 23;
              nightTime.minute = 0;
              setGameTime(nightTime);

              // 确保温婉在次卧（晚上11点她应该在自己的房间睡觉）
              setBodyStatus(prev => ({
                ...prev,
                location: 'guest_bedroom' // 温婉在次卧睡觉
              }));

              // 添加消息提示
              const sleepMessageId = Date.now().toString();
              setMessages(prev => [...prev, {
                id: sleepMessageId,
                sender: 'system',
                text: '【晚上11点】\n\n你躺在床上，准备入睡...',
                timestamp: new Date()
              }]);

              // 延迟一下再弹出选择（在游戏内弹窗，不是window.confirm）
              setTimeout(() => {
                setShowMidnightChoice(true);
              }, 800);
            }}
            onEnterGuestRoom={async () => {
              // 进入次卧
              await handleMoveUser('guest_bedroom', false);
            }}
            onStealUnderwear={handleStealUnderwear}
            status={bodyStatus}
            backpackItems={backpackItems}
            onBuyClothing={handleBuyClothing}
            onGiftClothing={handleGiftClothingWithAction}
            onUseItem={handleUseItemWithAction}
            onGiftItem={handleGiftItemWithAction}
            unlockedOutfits={unlockedOutfits}
            advance={advance}
          />
        </div>
      ) : (
        /* 手机模式：优化的侧边栏抽屉式设计 */
        <div className={`relative w-full h-full overflow-hidden transition-opacity duration-1000 ${gameStarted ? 'opacity-100' : 'opacity-0'}`} style={{
          height: '100dvh', // 使用动态视口高度
          minHeight: '-webkit-fill-available' // iOS Safari支持
        } as React.CSSProperties}>

          {/* --- 主聊天区域（全屏显示，可滚动） --- */}
          <div className="absolute inset-0 flex flex-col overflow-hidden bg-gradient-to-br from-pink-50/30 via-purple-50/20 to-blue-50/30" style={{
            height: '100dvh',
            minHeight: '-webkit-fill-available'
          } as React.CSSProperties}>
            <DialogueInterface
              messages={messages}
              input={input}
              isLoading={isLoading}
              suggestedActions={suggestedActions}
              onInputChange={setInput}
              onAction={handleAction}
              onEditMessage={handleEditMessage}
              onRegenerateMessage={handleRegenerateMessage}
            />
          </div>

          {/* --- 左侧浮动按钮栏（固定在左侧中间，更美观） --- */}
          <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
            {/* 立绘按钮 */}
            <button
              onClick={() => {
                // 如果当前显示的是立绘，则关闭；否则打开立绘并关闭手机
                if (activeApp === 'tachie') {
                  setActiveApp(null);
                } else {
                  setActiveApp('tachie' as any);
                }
              }}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-xl transition-all duration-300 active:scale-95 touch-manipulation backdrop-blur-md ${activeApp === 'tachie'
                ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-pink-600 text-white ring-4 ring-pink-300/50 scale-110'
                : 'bg-white/95 text-gray-700 border-2 border-gray-300/50 hover:bg-white hover:shadow-2xl hover:scale-105'
                }`}
              title="立绘"
            >
              🎨
            </button>

            {/* 手机按钮 */}
            <button
              onClick={() => {
                // 如果当前显示的是手机，则关闭；否则打开手机并关闭立绘
                const isPhoneOpen = activeApp !== null && activeApp !== 'tachie';
                if (isPhoneOpen) {
                  setActiveApp(null);
                } else {
                  setActiveApp(AppID.HOME);
                }
              }}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-xl transition-all duration-300 active:scale-95 touch-manipulation backdrop-blur-md ${activeApp !== null && activeApp !== 'tachie'
                ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-blue-600 text-white ring-4 ring-blue-300/50 scale-110'
                : 'bg-white/95 text-gray-700 border-2 border-gray-300/50 hover:bg-white hover:shadow-2xl hover:scale-105'
                }`}
              title="手机"
            >
              📱
            </button>
          </div>

          {/* --- 遮罩层（侧边栏打开时显示） --- */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm z-35 transition-opacity duration-300 ${activeApp !== null
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
              }`}
            onClick={() => setActiveApp(null)}
          />

          {/* --- 立绘侧边栏（从左侧滑入，优化动画和样式） --- */}
          <div className={`absolute left-0 top-0 bottom-0 w-[85vw] sm:w-[420px] max-w-[90vw] z-40 bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 backdrop-blur-2xl shadow-2xl transition-transform duration-300 ease-out border-r-2 border-pink-200/50 ${activeApp === 'tachie'
            ? 'translate-x-0'
            : '-translate-x-full'
            }`}>
            <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-pink-300 scrollbar-track-transparent">
              <CharacterTachie status={bodyStatus} unlockedOutfits={unlockedOutfits} />
            </div>
            {/* 关闭按钮（优化样式，确保手机端可点击） */}
            <button
              onClick={() => setActiveApp(null)}
              className="absolute top-2 sm:top-4 right-2 sm:right-4 w-12 h-12 sm:w-11 sm:h-11 rounded-full bg-white/95 backdrop-blur-md border-2 border-pink-200/50 flex items-center justify-center text-gray-600 shadow-xl active:scale-90 transition-all duration-200 touch-manipulation z-[100] hover:bg-pink-50 hover:border-pink-300 hover:text-pink-600"
              style={{
                minWidth: '48px',
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <span className="text-xl sm:text-xl font-bold">✕</span>
            </button>
          </div>

          {/* --- 手机侧边栏（从左侧滑入，优化动画和样式） --- */}
          <div className={`absolute left-0 top-0 bottom-0 w-[100vw] sm:w-[420px] max-w-[100vw] z-40 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 backdrop-blur-2xl shadow-2xl transition-transform duration-300 ease-out border-r-2 border-blue-200/50 ${activeApp !== null && activeApp !== 'tachie'
            ? 'translate-x-0'
            : '-translate-x-full'
            }`}>
            <div className="h-full w-full overflow-hidden flex flex-col touch-pan-y">
              {/* 手机侧边栏关闭按钮 */}
              <button
                onClick={() => setActiveApp(null)}
                className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/95 backdrop-blur-md border-2 border-blue-200/50 flex items-center justify-center text-gray-600 shadow-xl active:scale-90 transition-all duration-200 touch-manipulation z-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
              >
                <span className="text-xl font-bold">✕</span>
              </button>
              <div className="flex-1 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent">
                <PhoneInterface
                  activeApp={activeApp === AppID.HOME ? AppID.HOME : (activeApp as AppID)}
                  onCloseApp={() => setActiveApp(null)}
                  onSetActiveApp={setActiveApp}
                  onOpenSettings={handleOpenSettings}
                  messages={messages}
                  tweets={tweets}
                  bodyStatus={bodyStatus}
                  userLocation={userLocation}
                  sisterLocation={bodyStatus.location}
                  onMoveUser={handleMoveUser}
                  onAction={handleAction}
                  calendarEvents={calendarEvents}
                  gameTime={gameTime}
                  onSkipToday={handleSkipToday}
                  onSkipTwoDays={handleSkipTwoDays}
                  onSkipWeek={handleSkipWeek}
                  todaySummary={todaySummary}
                  onSaveGame={handleSaveGame}
                  onLoadGame={handleLoadGame}
                  walletBalance={walletBalance}
                  walletTransactions={walletTransactions}
                  onSpendMoney={(amount: number, item: string) => {
                    if (walletBalance >= amount) {
                      setWalletBalance(prev => prev - amount);
                      setWalletTransactions(prev => [{
                        id: Date.now().toString(),
                        name: item,
                        price: amount,
                        date: formatTime(gameTime),
                        type: 'expense'
                      }, ...prev]);
                    } else {
                      alert('余额不足！');
                    }
                  }}
                  onBuyItem={async (name: string, description: string, price: number) => {
                    if (walletBalance < price) {
                      alert('余额不足！');
                      return;
                    }
                    setWalletBalance(prev => prev - price);
                    const itemId = Date.now().toString();
                    setBackpackItems(prev => [{
                      id: itemId,
                      name,
                      description,
                      price,
                      date: formatTime(gameTime),
                      type: 'item',
                    }, ...prev]);
                    setWalletTransactions(prev => [{
                      id: itemId,
                      name: `购买：${name}`,
                      price,
                      date: formatTime(gameTime),
                      type: 'expense'
                    }, ...prev]);

                    // 检查温婉是否在身边
                    const isWenwanNearby = bodyStatus.location === userLocation;
                    if (isWenwanNearby) {
                      // 温婉在身边，生成剧情对话
                      await handleAction(`(System: 哥哥在情趣用品店购买了【${name}】，温婉就在身边看到了。根据当前好感度，生成温婉的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会脸红但接受；如果好感度低，她可能会觉得尴尬或保持距离。)`, true);
                    } else {
                      // 温婉不在身边，简单描述即可
                      setMessages(prev => [...prev, {
                        id: itemId,
                        sender: 'system',
                        text: `你购买了【${name}】，已放入背包。`,
                        timestamp: new Date()
                      }]);
                    }
                  }}
                  backpackItems={backpackItems}
                  onBuyClothing={handleBuyClothing}
                  onGiftClothing={handleGiftClothing}
                  unlockedOutfits={unlockedOutfits}
                  onEarnMoney={(amount: number, source: string) => {
                    setWalletBalance(prev => prev + amount);
                    setWalletTransactions(prev => [{
                      id: Date.now().toString(),
                      name: source,
                      price: amount,
                      date: formatTime(gameTime),
                      type: 'income'
                    }, ...prev]);
                    alert(`工作完成！获得¥${amount}`);
                  }}
                  onSleep={async () => {
                    // 睡觉：跳到晚上11点，然后弹出选择
                    const currentTime = gameTime;

                    // 先跳到晚上11点
                    const nightTime = { ...gameTime };
                    nightTime.hour = 23;
                    nightTime.minute = 0;
                    setGameTime(nightTime);

                    // 添加消息提示
                    const sleepMessageId = Date.now().toString();
                    setMessages(prev => [...prev, {
                      id: sleepMessageId,
                      sender: 'system',
                      text: '【晚上11点】\n\n你躺在床上，准备入睡...',
                      timestamp: new Date()
                    }]);

                    // 确保温婉在次卧（晚上11点她应该在自己的房间睡觉）
                    setBodyStatus(prev => ({
                      ...prev,
                      location: 'guest_bedroom' // 温婉在次卧睡觉
                    }));

                    // 延迟一下再弹出选择（在游戏内弹窗，不是window.confirm）
                    setTimeout(() => {
                      setShowMidnightChoice(true);
                    }, 800);
                  }}
                  onEnterGuestRoom={async () => {
                    // 进入次卧
                    await handleMoveUser('guest_bedroom', false);
                  }}
                  onStealUnderwear={handleStealUnderwear}
                  status={bodyStatus}
                  advance={advance}
                />
              </div>
            </div>
            {/* 关闭按钮（确保手机端可点击） */}
            <button
              onClick={() => setActiveApp(null)}
              className="absolute top-2 sm:top-4 right-2 sm:right-4 w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-white/90 backdrop-blur border-2 border-gray-200 flex items-center justify-center text-gray-600 shadow-lg active:scale-90 transition-all touch-manipulation z-[100]"
              style={{
                minWidth: '48px',
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              ✕
            </button>
          </div>

          {/* --- 遮罩层（点击关闭侧边栏） --- */}
          {(activeApp === 'tachie' || (activeApp !== null && activeApp !== 'tachie')) && (
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm z-30 transition-opacity duration-300"
              onClick={() => setActiveApp(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

// 主App组件，包裹SettingsProvider
const App: React.FC = () => {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
};

export default App;