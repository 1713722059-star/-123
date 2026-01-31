import React from 'react';

// 背景组件 - 负责显示整个应用的背景效果
export const Wallpaper = () => (
  <div 
    className="absolute inset-0 -z-10 transition-all duration-1000 bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-100"
  >
    <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1618588507085-c79565432917?q=80&w=2548&auto=format&fit=crop")',
        }}
    ></div>
    <div className="absolute inset-0 bg-black/10 backdrop-blur-[0px]"></div>
  </div>
);





