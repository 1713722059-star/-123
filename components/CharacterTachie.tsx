import React, { useEffect, useRef, useState } from 'react';
import { BodyStatus } from '../types';

// 角色立绘组件 - 负责显示角色的立绘图片，管理服装和表情的选择
// 会根据游戏状态自动匹配服装和表情，也支持手动切换查看
interface CharacterTachieProps {
  status: BodyStatus;
  unlockedOutfits?: string[]; // 已解锁服装ID，用于限制可选服装
}

export const CharacterTachie: React.FC<CharacterTachieProps> = ({ status, unlockedOutfits }) => {
  // 1. 定义允许的服装列表
  const allOutfits = [
    { id: 'pajamas', name: '普通睡衣', color: '#ddd6fe' },
    { id: 'jk', name: 'JK制服', color: '#bfdbfe' },
    { id: 'white_shirt', name: '白衬衫', color: '#f3f4f6' },
    { id: 'lolita', name: '洛丽塔', color: '#fbcfe8' },
    { id: 'lingerie', name: '情趣睡衣', color: '#fecaca' },

    // 新增立绘服装（图片URL暂留空，待后续补充）
    { id: 'princess_dress', name: '公主裙', color: '#e0f2fe' },        // 通体白色裙摆，蓝色点缀，冰雪公主风
    { id: 'hanfu', name: '汉服', color: '#fde68a' },        // 通体白色，粉色腰带和袖口
    { id: 'black_lingerie', name: '黑色情趣内衣', color: '#111827' }, // 深V薄纱半透
    { id: 'nude', name: '裸体', color: '#fed7aa' },        // 裸体（白虎）
    { id: 'cat_onesie', name: '猫咪连体衣', color: '#bfdbfe' },    // 蓝色猫咪连体衣，肚皮白色毛茸茸
    { id: 'sweet_sweater', name: '甜美毛衣', color: '#b45309' },      // 棕色毛衣+棕色格子裙
    { id: 'magical_girl', name: '魔法少女装', color: '#f9a8d4' },    // 粉白配色，白色过膝袜
    { id: 'qipao', name: '旗袍', color: '#111827' },        // 黑色旗袍带花纹，黑色过膝袜
    { id: 'sportswear', name: '运动服', color: '#6ee7b7' },        // 白色运动抹胸+运动短裤+过膝袜
  ];

  // 只展示已解锁的服装（如果未传入则默认全部可用）
  const outfits = unlockedOutfits && unlockedOutfits.length > 0
    ? allOutfits.filter(o => unlockedOutfits.includes(o.id))
    : allOutfits;

  // 2. 状态管理 - 本地选择的服装和表情（可以手动切换）
  const [localOutfitId, setLocalOutfitId] = useState<string>('pajamas');
  const [localEmotionId, setLocalEmotionId] = useState<string>('neutral');

  // 3. 自动匹配逻辑 - 根据游戏状态自动选择服装
  useEffect(() => {
    const desc = (status.overallClothing || "").toLowerCase();
    let newOutfitId = localOutfitId;

    // 更精确的匹配逻辑，按优先级匹配
    // 先匹配更具体的新服装
    if (desc.includes("公主裙") || desc.includes("公主") || desc.includes("冰雪")) {
      newOutfitId = 'princess_dress';
    } else if (desc.includes("汉服") || desc.includes("古风") || desc.includes("仙女")) {
      newOutfitId = 'hanfu';
    } else if (desc.includes("黑色情趣") || desc.includes("黑色内衣") || desc.includes("黑色 情趣") || desc.includes("黑色情趣")) {
      newOutfitId = 'black_lingerie';
    } else if (desc.includes("裸体") || desc.includes("全裸") || desc.includes("没穿衣")) {
      newOutfitId = 'nude';
    } else if (desc.includes("猫咪连体衣") || desc.includes("猫咪 连体") || desc.includes("猫咪连体")) {
      newOutfitId = 'cat_onesie';
    } else if (desc.includes("甜美毛衣") || (desc.includes("毛衣") && desc.includes("格子裙"))) {
      newOutfitId = 'sweet_sweater';
    } else if (desc.includes("魔法少女") || desc.includes("魔法 少女")) {
      newOutfitId = 'magical_girl';
    } else if (desc.includes("旗袍")) {
      newOutfitId = 'qipao';
    } else if (desc.includes("运动服") || desc.includes("运动 短裤") || desc.includes("运动短裤") || desc.includes("运动 抹胸")) {
      newOutfitId = 'sportswear';
    } else if (desc.includes("jk") || desc.includes("制服") || desc.includes("校服")) {
      newOutfitId = 'jk';
    } else if (desc.includes("洛丽塔") || desc.includes("lolita") || desc.includes("洋装") || desc.includes("lo裙")) {
      newOutfitId = 'lolita';
    } else if (desc.includes("衬衫") || desc.includes("白衬衫")) {
      newOutfitId = 'white_shirt';
    } else if (desc.includes("情趣") || desc.includes("蕾丝") || desc.includes("性感") || desc.includes("内衣")) {
      newOutfitId = 'lingerie';
    } else if (desc.includes("睡衣") || desc.includes("睡袍")) {
      newOutfitId = 'pajamas';
    }
    // 如果没有匹配到，保持当前服装不变

    if (newOutfitId !== localOutfitId) {
      console.log('[CharacterTachie] 服装更新:', {
        旧服装: localOutfitId,
        新服装: newOutfitId,
        服装描述: status.overallClothing,
        匹配结果: newOutfitId !== localOutfitId ? '已匹配' : '未匹配'
      });
      setLocalOutfitId(newOutfitId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.overallClothing]);

  // 4. 自动匹配表情 - 根据游戏状态自动选择表情
  useEffect(() => {
    const newEmotion = status.emotion || 'neutral';
    if (newEmotion !== localEmotionId) {
      console.log('[CharacterTachie] 情绪更新:', {
        旧情绪: localEmotionId,
        新情绪: newEmotion,
        状态中的emotion: status.emotion
      });
      setLocalEmotionId(newEmotion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.emotion]);

  const expressionScrollRef = useRef<HTMLDivElement>(null);
  const outfitScrollRef = useRef<HTMLDivElement>(null);

  // 处理鼠标滚轮横向滚动
  const handleWheel = (ref: React.RefObject<HTMLDivElement>, e: React.WheelEvent) => {
    if (ref.current) {
      ref.current.scrollLeft += e.deltaY;
    }
  };

  // 表情列表
  const expressions = [
    { id: 'neutral', emoji: '😐', label: '平静' },
    { id: 'happy', emoji: '😊', label: '开心' },
    { id: 'shy', emoji: '😳', label: '害羞' },
    { id: 'angry', emoji: '😠', label: '生气' },
    { id: 'sad', emoji: '😢', label: '难过' },
    { id: 'aroused', emoji: '🥵', label: '动情' },
    { id: 'surprised', emoji: '😮', label: '惊讶' },
    { id: 'tired', emoji: '😫', label: '疲惫' },
  ];

  // 立绘图片配置 - 根据服装和表情组合显示不同的图片
  // 新增服装的图片URL先留空，前端会显示“待填图片”占位
  const tachieConfig: Record<string, Record<string, string>> = {
    'jk': {
      'neutral': 'https://files.catbox.moe/2h3jk9.png',
      'happy': 'https://files.catbox.moe/dlc837.png',
      'shy': 'https://files.catbox.moe/wlqw5g.png',
      'angry': 'https://files.catbox.moe/v9o177.png',
      'sad': 'https://files.catbox.moe/1wybl6.png',
      'aroused': 'https://files.catbox.moe/anvlas.png',
      'surprised': 'https://files.catbox.moe/gtyvo4.png',
      'tired': 'https://files.catbox.moe/fsk8xr.png',
    },
    'pajamas': {
      'neutral': 'https://files.catbox.moe/f5wlxr.png',
      'happy': 'https://files.catbox.moe/7ibfej.png',
      'shy': 'https://files.catbox.moe/0mt17m.png',
      'angry': 'https://files.catbox.moe/mlhs6z.png',
      'sad': 'https://files.catbox.moe/p30lpf.png',
      'aroused': 'https://files.catbox.moe/69nuzm.png',
      'surprised': 'https://files.catbox.moe/mig488.png',
      'tired': 'https://files.catbox.moe/5yy7xf.png',
    },
    'white_shirt': {
      'neutral': 'https://files.catbox.moe/hfyfyn.png',
      'happy': 'https://files.catbox.moe/q1bx5b.png',
      'shy': 'https://files.catbox.moe/xz8jqv.png',
      'angry': 'https://files.catbox.moe/n66yk1.png',
      'sad': 'https://files.catbox.moe/xday4f.png',
      'aroused': 'https://files.catbox.moe/z2xj58.png',
      'surprised': 'https://files.catbox.moe/1zs6vk.png',
      'tired': 'https://files.catbox.moe/wexgbo.png',
    },
    'lolita': {
      'neutral': 'https://files.catbox.moe/5nlzuy.png',
      'happy': 'https://files.catbox.moe/699lm9.png',
      'shy': 'https://files.catbox.moe/hooge8.png',
      'angry': 'https://files.catbox.moe/mwpvz6.png',
      'sad': 'https://files.catbox.moe/ph7u3h.png',
      'aroused': 'https://files.catbox.moe/jv5m7e.png',
      'surprised': 'https://files.catbox.moe/d1hloc.png',
      'tired': 'https://files.catbox.moe/ibl3eh.png',
    },
    'lingerie': {
      'neutral': 'https://files.catbox.moe/uuwdc5.png',
      'happy': 'https://files.catbox.moe/km1x3m.png',
      'shy': 'https://files.catbox.moe/mp7y2g.png',
      'angry': 'https://files.catbox.moe/n4vfsp.png',
      'sad': 'https://files.catbox.moe/2zl8kj.png',
      'aroused': 'https://files.catbox.moe/8w0ysz.png',
      'surprised': 'https://files.catbox.moe/8udqv3.png',
      'tired': 'https://files.catbox.moe/0tw61s.png',
    },

    'princess_dress': {
      'neutral': 'https://files.catbox.moe/9q8bqm.png',
      'happy': 'https://files.catbox.moe/9x9bvl.png',
      'shy': 'https://files.catbox.moe/kdmvau.png',
      'angry': 'https://files.catbox.moe/zk9cu4.png',
      'sad': 'https://files.catbox.moe/w9y1x3.png',
      'aroused': 'https://files.catbox.moe/mf5ubd.png',
      'surprised': 'https://files.catbox.moe/7gjlvq.png',
      'tired': 'https://files.catbox.moe/zriq2o.png',
    },
    'hanfu': {
      'neutral': 'https://files.catbox.moe/3gdqak.png',
      'happy': 'https://files.catbox.moe/jhhitp.png',
      'shy': 'https://files.catbox.moe/w0bqh1.png',
      'angry': 'https://files.catbox.moe/h4z0yt.png',
      'sad': 'https://files.catbox.moe/fl6cbt.png',
      'aroused': 'https://files.catbox.moe/m8inec.png',
      'surprised': 'https://files.catbox.moe/f72w4w.png',
      'tired': 'https://files.catbox.moe/7xqkqb.png',
    },
    'black_lingerie': {
      'neutral': 'https://files.catbox.moe/u8h2fz.png',
      'happy': 'https://files.catbox.moe/jpiyd0.png',
      'shy': 'https://files.catbox.moe/43hjqn.png',
      'angry': 'https://files.catbox.moe/ggzcnj.png',
      'sad': 'https://files.catbox.moe/6njzbo.png',
      'aroused': 'https://files.catbox.moe/gwsitk.png',
      'surprised': 'https://files.catbox.moe/6n2zj4.png',
      'tired': 'https://files.catbox.moe/5kj733.png',
    },
    'nude': {
      'neutral': 'https://files.catbox.moe/x59fxm.png',
      'happy': 'https://files.catbox.moe/h4u8s8.png',
      'shy': 'https://files.catbox.moe/fmivzl.png',
      'angry': 'https://files.catbox.moe/pnjbib.png',
      'sad': 'https://files.catbox.moe/l9haka.png',
      'aroused': 'https://files.catbox.moe/hlo1ss.png',
      'surprised': 'https://files.catbox.moe/1ui48a.png',
      'tired': 'https://files.catbox.moe/oor4u9.png',
    },
    'cat_onesie': {
      'neutral': 'https://files.catbox.moe/nizems.png',
      'happy': 'https://files.catbox.moe/zteo8d.png',
      'shy': 'https://files.catbox.moe/4iz0ft.png',
      'angry': 'https://files.catbox.moe/mtu6m7.png',
      'sad': 'https://files.catbox.moe/9th1sc.png',
      'aroused': 'https://files.catbox.moe/lasyhl.png',
      'surprised': 'https://files.catbox.moe/osj0t9.png',
      'tired': 'https://files.catbox.moe/9th1sc.png',
    },
    'sweet_sweater': {
      'neutral': 'https://files.catbox.moe/8rbx9q.png',
      'happy': 'https://files.catbox.moe/naw6cc.png',
      'shy': 'https://files.catbox.moe/a5rj88.png',
      'angry': 'https://files.catbox.moe/oh5zmu.png',
      'sad': 'https://files.catbox.moe/sqrfmt.png',
      'aroused': 'https://files.catbox.moe/7hkrx0.png',
      'surprised': 'https://files.catbox.moe/1n5ca1.png',
      'tired': 'https://files.catbox.moe/3gnugq.png',
    },
    'magical_girl': {
      'neutral': 'https://files.catbox.moe/zjd7b4.png',
      'happy': 'https://files.catbox.moe/33vte2.png',
      'shy': 'https://files.catbox.moe/05rtqm.png',
      'angry': 'https://files.catbox.moe/yldfyb.png',
      'sad': 'https://files.catbox.moe/r1cdsu.png',
      'aroused': 'https://files.catbox.moe/d2596o.png',
      'surprised': 'https://files.catbox.moe/onkrae.png',
      'tired': 'https://files.catbox.moe/jo8itw.png',
    },
    'qipao': {
      'neutral': 'https://files.catbox.moe/onawxe.png',
      'happy': 'https://files.catbox.moe/05bs1u.png',
      'shy': 'https://files.catbox.moe/dshxze.png',
      'angry': 'https://files.catbox.moe/tv92j9.png',
      'sad': 'https://files.catbox.moe/v86dat.png',
      'aroused': 'https://files.catbox.moe/fy7wyh.png',
      'surprised': 'https://files.catbox.moe/53szt2.png',
      'tired': 'https://files.catbox.moe/zvp28w.png',
    },
    'sportswear': {
      'neutral': 'https://files.catbox.moe/af48fg.png',
      'happy': 'https://files.catbox.moe/l0uiry.png',
      'shy': 'https://files.catbox.moe/cuu1b2.png',
      'angry': 'https://files.catbox.moe/ritne2.png',
      'sad': 'https://files.catbox.moe/ub8m9k.png',
      'aroused': 'https://files.catbox.moe/c7k5ks.png',
      'surprised': 'https://files.catbox.moe/e6nwfa.png',
      'tired': 'https://files.catbox.moe/7t9rnv.png',
    },
  };

  const currentEmotion = localEmotionId;
  const currentOutfit = outfits.find(o => o.id === localOutfitId) || outfits[0];
  const imageUrl = tachieConfig[currentOutfit.id]?.[currentEmotion] || null;

  // 图片加载状态管理
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);

  // 当图片URL改变时，重置加载状态
  useEffect(() => {
    setImageLoading(true);
    setImageError(false);
  }, [imageUrl]);

  // 图片预加载：预加载当前服装的所有表情图片
  useEffect(() => {
    if (!currentOutfit.id || !tachieConfig[currentOutfit.id]) return;
    
    const preloadImages = () => {
      const outfitConfig = tachieConfig[currentOutfit.id];
      Object.values(outfitConfig).forEach((url) => {
        if (url) {
          const img = new Image();
          img.src = url;
        }
      });
    };
    
    preloadImages();
  }, [currentOutfit.id]);

  // 调试日志：当图片URL为null时，记录原因
  useEffect(() => {
    if (!imageUrl) {
      console.warn('[CharacterTachie] 图片URL为空:', {
        当前服装ID: currentOutfit.id,
        当前情绪: currentEmotion,
        配置中是否有该服装: !!tachieConfig[currentOutfit.id],
        配置中是否有该情绪: !!tachieConfig[currentOutfit.id]?.[currentEmotion],
        状态中的emotion: status.emotion,
        状态中的overallClothing: status.overallClothing
      });
    }
  }, [imageUrl, currentOutfit.id, currentEmotion, status.emotion, status.overallClothing]);

  return (
    <div className="h-full flex flex-col relative z-20">
      <div className="flex-1 border-[4px] sm:border-[6px] border-pink-200/50 rounded-[2rem] sm:rounded-[3rem] bg-white/30 backdrop-blur-xl shadow-2xl shadow-pink-100/20 overflow-hidden relative flex items-center justify-center transition-all">
        <div className="absolute inset-2 sm:inset-4 rounded-[1.5rem] sm:rounded-[2.5rem] bg-gradient-to-b from-transparent to-pink-500/10 flex flex-col items-center justify-end pb-4 sm:pb-10 overflow-hidden">
          {imageUrl ? (
            <>
              {imageLoading && !imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-white/20 gap-2 z-10">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-pink-300 border-t-pink-500"></div>
                  <div className="text-sm font-bold">加载中...</div>
                </div>
              )}
              {imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-white/20 gap-2 z-10">
                  <div className="text-4xl">⚠️</div>
                  <div className="font-bold text-sm bg-white/80 px-4 py-2 rounded-full shadow-sm">
                    图片加载失败
                  </div>
                </div>
              )}
              <img
                key={`${currentOutfit.id}-${currentEmotion}`}
                src={imageUrl}
                alt={`${currentOutfit.name} - ${expressions.find(e => e.id === currentEmotion)?.label}`}
                className={`w-full h-full object-cover object-top transition-opacity duration-300 ${imageLoading || imageError ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => {
                  setImageLoading(false);
                  setImageError(false);
                }}
                onError={(e) => {
                  console.error('图片加载失败:', imageUrl);
                  setImageLoading(false);
                  setImageError(true);
                  e.currentTarget.style.display = 'none';
                }}
              />
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-white/20 gap-2">
              <div className="text-4xl">{expressions.find(e => e.id === currentEmotion)?.emoji}</div>
              <div className="font-bold text-sm bg-white/80 px-4 py-2 rounded-full shadow-sm">
                [待填图片: {currentOutfit.name} - {expressions.find(e => e.id === currentEmotion)?.label}]
              </div>
            </div>
          )}
          <div className="absolute top-3 sm:top-6 left-3 sm:left-6 bg-white/80 backdrop-blur px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold text-pink-500 shadow-sm border border-pink-100 flex items-center gap-1 sm:gap-2">
            <span>当前状态:</span>
            <span className="text-gray-800">{expressions.find(e => e.id === currentEmotion)?.label}</span>
          </div>
        </div>
      </div>

      {/* 手机模式下隐藏服装和表情选择器，节省空间 */}
      <div className="hidden sm:block mt-2 sm:mt-4 space-y-2 sm:space-y-3">
        <div className="bg-white/40 backdrop-blur-md rounded-xl sm:rounded-2xl p-1.5 sm:p-2 border border-white/40 shadow-lg">
          <div className="text-[9px] sm:text-[10px] font-bold text-gray-500 mb-1 ml-2 uppercase flex justify-between pr-2">
            <span>服装浏览</span>
            <span className="text-pink-500 font-normal text-[8px] sm:text-[10px]">当前: {currentOutfit.name}</span>
          </div>
          <div
            ref={outfitScrollRef}
            onWheel={(e) => handleWheel(outfitScrollRef, e)}
            className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 px-1 scroll-smooth"
          >
            {outfits.map(outfit => (
              <button
                key={outfit.id}
                onClick={() => setLocalOutfitId(outfit.id)}
                className={`flex-shrink-0 w-12 sm:w-16 h-14 sm:h-20 rounded-lg bg-white shadow-sm border-2 p-1 flex flex-col items-center gap-1 cursor-pointer hover:scale-105 active:scale-95 transition-all touch-manipulation ${localOutfitId === outfit.id ? 'border-pink-400 ring-2 ring-pink-100' : 'border-transparent opacity-80'}`}
              >
                <div className="w-full flex-1 rounded-md" style={{ backgroundColor: outfit.color }}></div>
                <span className="text-[8px] sm:text-[10px] font-bold text-gray-600 leading-tight text-center mt-0.5 sm:mt-1">{outfit.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/40 backdrop-blur-md rounded-xl sm:rounded-2xl p-1.5 sm:p-2 border border-white/40 shadow-lg">
          <div className="text-[9px] sm:text-[10px] font-bold text-gray-500 mb-1 ml-2 uppercase">
            <span>表情预览</span>
          </div>
          <div
            ref={expressionScrollRef}
            className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 px-1 scroll-smooth"
          >
            {expressions.map(exp => (
              <button
                key={exp.id}
                onClick={() => setLocalEmotionId(exp.id)}
                className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm bg-white shadow-sm border-2 transition-all cursor-pointer hover:scale-110 active:scale-95 touch-manipulation ${currentEmotion === exp.id ? 'border-pink-500 scale-125 z-10' : 'border-transparent opacity-80'}`}
              >
                {exp.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

