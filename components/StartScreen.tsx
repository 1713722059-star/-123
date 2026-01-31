import React, { useState } from 'react';
import { Play, FolderOpen, Settings, X, Download } from 'lucide-react';
import { Wallpaper } from './Wallpaper';
import { getAllSaves, loadGame } from '../services/saveService';
import { GameSave } from '../types';

// 心形图标组件
const HeartIconFilled = ({size, className}: {size: number, className?: string}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5C22 12.27 18.6 15.36 13.45 20.03L12 21.35Z"/>
    </svg>
);

// 开始界面组件 - 负责显示游戏开始界面，包含开始按钮、读取存档、游戏设置等
interface StartScreenProps {
    onStart: () => void;
    onOpenSettings?: () => void;
    onLoadGame?: (slotId: number) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onStart, onOpenSettings, onLoadGame }) => {
    const [showLoadMenu, setShowLoadMenu] = useState(false);
    const [saves, setSaves] = useState<(GameSave | null)[]>([]);

    const handleOpenLoadMenu = () => {
        setSaves(getAllSaves());
        setShowLoadMenu(true);
    };

    const handleLoad = (slotId: number) => {
        const save = loadGame(slotId);
        if (save && onLoadGame) {
            onLoadGame(slotId);
            setShowLoadMenu(false);
        } else {
            alert('该存档槽位为空！');
        }
    };

    const formatSaveTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (showLoadMenu) {
        return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md">
                <Wallpaper />
                <div className="bg-white/90 backdrop-blur-xl p-6 rounded-[3rem] shadow-2xl border border-white/50 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold text-gray-800">读取存档</h2>
                        <button
                            onClick={() => setShowLoadMenu(false)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X size={24} className="text-gray-600" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-3">
                            {saves.map((save, index) => (
                                <div
                                    key={index}
                                    className={`border-2 rounded-xl p-4 transition-all ${
                                        save
                                            ? 'border-blue-200 bg-blue-50/50 hover:bg-blue-50 cursor-pointer'
                                            : 'border-gray-200 bg-gray-50/50 opacity-50'
                                    }`}
                                    onClick={() => save && handleLoad(index)}
                                >
                                    <div className="font-bold text-sm text-gray-800 mb-2">
                                        {index === 0 ? '自动存档' : `存档 ${index}`}
                                    </div>
                                    {save ? (
                                        <>
                                            <div className="text-xs text-gray-600 mb-1">{save.name}</div>
                                            <div className="text-xs text-gray-400 mb-1">
                                                {formatSaveTime(save.timestamp)}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {save.gameTime.year}年{save.gameTime.month}月{save.gameTime.day}日
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleLoad(index);
                                                }}
                                                className="mt-2 w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Download size={14} />
                                                读取
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-xs text-gray-400">空存档</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md">
            <Wallpaper />
            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-[3rem] shadow-2xl border border-white/50 text-center flex flex-col items-center animate-slide-up max-w-lg mx-4">
                <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-pink-200">
                    <HeartIconFilled size={40} className="text-pink-500 animate-pulse" />
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600 mb-10 leading-tight tracking-tight">
                    我可爱的妹妹<br/>才不会这样对我
                </h1>
                <button 
                    onClick={onStart}
                    className="group relative px-10 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-full font-bold text-lg shadow-xl shadow-pink-300 hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-3 overflow-hidden mb-4"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <Play size={24} fill="currentColor" />
                    开始游戏
                </button>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={handleOpenLoadMenu}
                        className="group relative px-8 py-3 bg-white/60 hover:bg-white/80 text-gray-700 rounded-full font-semibold text-base shadow-md shadow-gray-200/50 hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 border border-gray-200/50"
                    >
                        <FolderOpen size={20} />
                        读取存档
                    </button>
                    <button 
                        onClick={onOpenSettings}
                        className="group relative px-8 py-3 bg-white/60 hover:bg-white/80 text-gray-700 rounded-full font-semibold text-base shadow-md shadow-gray-200/50 hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 border border-gray-200/50"
                    >
                        <Settings size={20} />
                        游戏设置
                    </button>
                </div>
            </div>
        </div>
    );
};

