import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 发送APP_READY信号给SillyTavern（如果存在）
if (typeof window !== 'undefined') {
  // 检测是否在SillyTavern环境中（安全检测，避免跨域错误）
  const isSillyTavern = (
    (window as any).SillyTavern !== undefined ||
    (window as any).st !== undefined ||
    (window as any).APP_READY !== undefined ||
    (() => {
      try {
        return window.parent !== window;
      } catch (e) {
        // 跨域时会抛出错误，说明在iframe中
        return true;
      }
    })()
  );

  if (isSillyTavern) {
    // 发送就绪信号
    try {
      // 设置APP_READY标识（确保设置成功）
      try {
        Object.defineProperty(window, 'APP_READY', {
          value: true,
          writable: true,
          configurable: true
        });
      } catch (e) {
        // 如果defineProperty失败，尝试直接赋值
        (window as any).APP_READY = true;
      }
      
      console.log('[SillyTavern] APP_READY已设置:', (window as any).APP_READY);
      
      // 通过postMessage通知父窗口（跨域安全）
      try {
        if (window.parent !== window) {
          // 发送多种格式的消息，确保SillyTavern能识别
          window.parent.postMessage({
            type: 'APP_READY',
            source: 'wenwan-game',
            ready: true
          }, '*');
          
          // 同时请求数据
          window.parent.postMessage({
            type: 'SILLYTAVERN_GET_DATA',
            request: {
              character: true,
              preset: true,
              lorebook: true
            }
          }, '*');
        }
      } catch (postError) {
        // 跨域postMessage可能失败，但不影响应用运行
        console.warn('[SillyTavern] Failed to send APP_READY via postMessage:', postError);
      }
      
      // 尝试从URL hash或query参数获取数据
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        
        // 检查URL参数
        const charParam = urlParams.get('character') || urlParams.get('char');
        const presetParam = urlParams.get('preset');
        const lorebookParam = urlParams.get('lorebook');
        
        if (charParam || presetParam || lorebookParam) {
          console.log('[SillyTavern] 从URL参数检测到数据');
        }
        
        // 检查hash中的JSON数据
        if (hash && hash.startsWith('#')) {
          try {
            const hashData = JSON.parse(decodeURIComponent(hash.substring(1)));
            if (hashData.character || hashData.preset || hashData.lorebook) {
              console.log('[SillyTavern] 从URL hash检测到数据');
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      } catch (urlError) {
        console.warn('[SillyTavern] 检查URL参数失败:', urlError);
      }
    } catch (error) {
      console.warn('[SillyTavern] Failed to send APP_READY signal:', error);
    }
  }
}