import { LocationID } from '../types';

// 位置移动 Hook - 负责处理玩家位置移动相关的逻辑
// 包括判断移动类型、计算时间消耗、生成移动描述等
interface UseLocationProps {
    userLocation: LocationID;
    setUserLocation: React.Dispatch<React.SetStateAction<LocationID>>;
    handleAction: (actionText: string, isSystemAction?: boolean) => Promise<void>;
    addMemory: (title: string, description: string, color?: string) => void;
    advance?: (minutes: number) => void; // 时间推进函数（可选）
}

export const useLocation = ({
    userLocation,
    setUserLocation,
    handleAction,
    addMemory,
    advance
}: UseLocationProps) => {
    // 处理玩家位置移动
    const handleMoveUser = async (
        location: LocationID, 
        withSister: boolean, 
        isFacility = false, 
        facilityName = ''
    ) => {
        // 判断是否为室内移动
        const isInteriorMove = [
            'master_bedroom',
            'guest_bedroom',
            'living_room',
            'dining_room',
            'kitchen',
            'toilet',
            'hallway'
        ].includes(location);
        
        // 智能计算时间消耗：
        // - 设施使用：15分钟
        // - 室内移动：2-3分钟（随机）
        // - 室外移动：15-40分钟（随机，根据距离调整）
        let timeCost = 0;
        if (isFacility) {
            timeCost = 15; // 设施使用固定15分钟
        } else if (isInteriorMove) {
            timeCost = 2 + Math.floor(Math.random() * 2); // 2-3分钟
        } else {
            // 室外移动：根据距离调整
            // 近距离（公司、商城等）：15-25分钟
            // 远距离（港口、展会中心等）：25-40分钟
            const nearLocations = ['company', 'mall', 'cinema', 'food_court', 'cake_shop', 'school'];
            const isNearLocation = nearLocations.includes(location);
            if (isNearLocation) {
                timeCost = 15 + Math.floor(Math.random() * 11); // 15-25分钟
            } else {
                timeCost = 25 + Math.floor(Math.random() * 16); // 25-40分钟
            }
        }

        // 推进时间（如果提供了advance函数）
        if (advance) {
            if (isFacility) {
                advance(15);
                console.log(`[useLocation] 设施使用，推进15分钟`);
            } else {
                advance(timeCost);
                console.log(`[useLocation] 位置移动，推进${timeCost}分钟`);
            }
        }

        // 如果不是设施使用，更新玩家位置
        if (!isFacility) {
            setUserLocation(location);
        }
        
        // 构建移动描述（不再包含时间信息，因为时间已经在上面推进了）
        let narrative = `(System: User moved to ${location}. `;
        
        // 如果是设施使用，添加设施信息
        if (isFacility) {
            narrative = `(System: At ${location}, User decides to use facility: "${facilityName}". `;
            addMemory(
                `在${facilityName}`, 
                withSister ? '和温婉一起度过了难忘的时光。' : '独自一人的体验。',
                withSister ? 'border-pink-400' : 'border-blue-400'
            );
        }

        // 根据是否和妹妹一起，添加不同的状态描述
        if (withSister) {
            narrative += `Status: With Wenwan (Invited/Accompanied). Describe romantic interaction.)`;
        } else {
            narrative += `Status: Alone. Wenwan is not participating. If User location != Wenwan location, she is NOT here.)`;
        }

        // 调用对话处理函数来执行移动
        await handleAction(narrative, true); 
    };

    return {
        handleMoveUser
    };
};


