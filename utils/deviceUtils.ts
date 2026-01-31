/**
 * 设备检测工具函数
 */

/**
 * 检测是否为移动端（基于屏幕宽度）
 */
export function isMobileDevice(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/**
 * 检测是否为移动浏览器（基于User Agent和屏幕尺寸）
 */
export function isMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth < 1024;
  const isPortrait = window.innerHeight > window.innerWidth;
  
  return isMobileDevice || (isSmallScreen && isPortrait);
}

