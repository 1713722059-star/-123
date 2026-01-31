import { useCallback, useState } from "react";
import { GameTime } from "../types";

// 初始时间：2025年1月18日周六下午，晴天，15度（周六，完全自由）
const initialTime: GameTime = {
  year: 2025,
  month: 1,
  day: 18,
  weekday: 6, // 周六 (0=周日, 1=周一, ..., 6=周六)
  hour: 14,
  minute: 0,
  weather: {
    condition: "晴天",
    temperature: 15,
    wind: "2级微风",
    humidity: 60,
  },
};

// 星期名称映射
const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 月份天数（不考虑闰年）
const daysInMonth = (year: number, month: number): number => {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    return 29; // 闰年2月
  }
  return days[month - 1];
};

// 计算星期几
const calculateWeekday = (year: number, month: number, day: number): number => {
  const date = new Date(year, month - 1, day);
  return date.getDay();
};

// 推进时间（每次对话推进30分钟）
const advanceTime = (currentTime: GameTime, minutes: number = 30): GameTime => {
  let { year, month, day, hour, minute } = currentTime;

  minute += minutes;
  while (minute >= 60) {
    minute -= 60;
    hour += 1;
  }
  while (hour >= 24) {
    hour -= 24;
    day += 1;
  }

  const maxDays = daysInMonth(year, month);
  while (day > maxDays) {
    day -= maxDays;
    month += 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  const weekday = calculateWeekday(year, month, day);

  // 根据时间变化更新天气（简化逻辑）
  const weather = updateWeather(currentTime.weather, hour);

  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    weather,
  };
};

// 更新天气（根据时间和日期变化）
const updateWeather = (
  currentWeather: GameTime["weather"],
  hour: number
): GameTime["weather"] => {
  // 简化逻辑：可以根据时间、季节等变化
  // 这里保持相对稳定，但可以根据小时调整
  let condition = currentWeather.condition;
  
  // 根据小时计算温度（基于基准温度，而不是累加）
  // 基准温度：初始15度，根据小时调整
  let baseTemperature = 15; // 基准温度
  let temperature: number;
  
  if (hour >= 6 && hour < 18) {
    // 白天：6点最低，12点最高，18点又降低
    // 温度范围：10-25度
    const hourOffset = hour - 6; // 0-12
    const peakHour = 12; // 中午12点最热
    const distanceFromPeak = Math.abs(hour - peakHour);
    // 中午12点：25度，距离峰值越远温度越低
    temperature = Math.max(10, 25 - distanceFromPeak * 1.2);
  } else {
    // 夜晚：温度较低，范围：5-15度
    if (hour >= 18) {
      // 晚上：18点开始降温，23点最低
      const nightOffset = hour - 18; // 0-5
      temperature = Math.max(5, 15 - nightOffset * 1.5);
    } else {
      // 凌晨：0-6点，温度最低
      temperature = Math.max(3, 8 + hour * 0.5);
    }
  }

  // 天气变化逻辑（可以更复杂）
  // 这里保持当前天气条件

  return {
    ...currentWeather,
    condition,
    temperature: Math.round(temperature), // 四舍五入到整数
  };
};

export const useGameTime = () => {
  const [gameTime, setGameTimeState] = useState<GameTime>(initialTime);

  // 推进时间（默认30分钟）
  const advance = useCallback((minutes: number = 30) => {
    setGameTimeState((prev) => advanceTime(prev, minutes));
  }, []);

  // 跳过今天（跳到明天同一时间）
  const skipToday = useCallback(() => {
    setGameTimeState((prev) => {
      const tomorrow = advanceTime(
        prev,
        24 * 60 - (prev.hour * 60 + prev.minute)
      );
      return {
        ...tomorrow,
        hour: prev.hour,
        minute: prev.minute,
      };
    });
  }, []);

  // 跳过两天
  const skipTwoDays = useCallback(() => {
    setGameTimeState((prev) => {
      const afterTwoDays = advanceTime(
        prev,
        2 * 24 * 60 - (prev.hour * 60 + prev.minute)
      );
      return {
        ...afterTwoDays,
        hour: prev.hour,
        minute: prev.minute,
      };
    });
  }, []);

  // 跳过一周
  const skipWeek = useCallback(() => {
    setGameTimeState((prev) => {
      const afterWeek = advanceTime(
        prev,
        7 * 24 * 60 - (prev.hour * 60 + prev.minute)
      );
      return {
        ...afterWeek,
        hour: prev.hour,
        minute: prev.minute,
      };
    });
  }, []);

  // 格式化时间显示
  const formatTime = useCallback((time: GameTime) => {
    const period = time.hour < 12 ? "上午" : time.hour < 18 ? "下午" : "晚上";
    const displayHour =
      time.hour > 12 ? time.hour - 12 : time.hour === 0 ? 12 : time.hour;
    return `${period}${displayHour}点${
      time.minute === 0 ? "" : time.minute + "分"
    }`;
  }, []);

  // 格式化日期显示
  const formatDate = useCallback((time: GameTime) => {
    return `${time.year}年${time.month}月${time.day}日 ${
      weekdayNames[time.weekday]
    }`;
  }, []);

  // 设置游戏时间（用于读取存档）
  const setGameTime = useCallback((time: GameTime) => {
    setGameTimeState(time);
  }, []);

  return {
    gameTime,
    advance,
    skipToday,
    skipTwoDays,
    skipWeek,
    formatTime,
    formatDate,
    setGameTime,
  };
};
