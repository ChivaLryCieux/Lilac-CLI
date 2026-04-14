/**
 * 这是一个高性能的 Token 估算工具，参考了 OpenAI 的通用估算准则。
 * 针对中英文混合场景进行了加权优化。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // 匹配中文字符
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const chineseCount = chineseChars.length;

  // 移除中文字符后计算剩余部分的单词数
  const remainingText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const words = remainingText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 估算逻辑：
  // 1. 每个中文字符约 1.2 tokens
  // 2. 英文单词约 1.3 tokens (考虑标点和空格)
  // 3. 基础字符兜底
  const estimate = Math.ceil(chineseCount * 1.2 + wordCount * 1.3);
  
  return Math.max(estimate, 1);
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count} tokens`;
  return `${(count / 1000).toFixed(1)}k tokens`;
}
