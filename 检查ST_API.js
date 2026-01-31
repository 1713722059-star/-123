// 在 SillyTavern 主窗口的控制台执行这段代码，检查 ST_API 是否可用

console.log('=== 检查 ST_API 状态 ===');
console.log('1. 当前窗口 ST_API:', typeof window.ST_API !== 'undefined' ? '✅ 可用' : '❌ 不可用');
if (typeof window.ST_API !== 'undefined') {
  console.log('   - ST_API 对象:', window.ST_API);
  console.log('   - prompt.generate:', typeof window.ST_API.prompt?.generate === 'function' ? '✅' : '❌');
  console.log('   - 可用端点:', window.ST_API.listEndpoints?.() || '无法列出');
}

console.log('\n2. 检查 APP_READY:', typeof window.APP_READY !== 'undefined' ? window.APP_READY : 'undefined');

console.log('\n3. 检查 SillyTavern 上下文:');
const ctx = window.SillyTavern?.getContext?.();
if (ctx) {
  console.log('   - 上下文可用:', '✅');
  console.log('   - eventSource:', ctx.eventSource ? '✅' : '❌');
  console.log('   - event_types:', ctx.event_types ? '✅' : '❌');
} else {
  console.log('   - 上下文不可用:', '❌');
}

console.log('\n4. 检查是否在 iframe 中:');
console.log('   - window.parent !== window:', window.parent !== window);
console.log('   - window.top !== window:', window.top !== window);

console.log('\n5. 检查 st-api-wrapper 扩展:');
// 检查扩展是否加载
const extensions = window.SillyTavern?.getContext?.()?.extensions || {};
console.log('   - 扩展列表:', Object.keys(extensions));

