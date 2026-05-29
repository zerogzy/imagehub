/**
 * 构造符合 RFC 5987/6266 的 Content-Disposition 头, 用于安全携带任意字符 (包括中文) 文件名。
 *
 * 直接把含中文/特殊字符的字符串塞进 HTTP header 会让 Fastify 抛 ERR_INVALID_CHAR
 * (HTTP header 只允许 ASCII)。需要:
 *   - filename="..."         ASCII 兜底 (老浏览器)
 *   - filename*=UTF-8''<percent-encoded>  现代浏览器优先采用
 */
export function buildContentDisposition(filename: string): string {
  const fallback = sanitizeAscii(filename);
  const encoded = encodeRfc5987(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function sanitizeAscii(input: string): string {
  // 去掉非 ASCII; 替换 header 不允许的字符 ("\ 控制字符)
  // 找不到 ASCII 字符则返回 "download"
  const ascii = input.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return ascii.trim() || 'download';
}

function encodeRfc5987(input: string): string {
  // RFC 5987 attribute char (token + 部分符号), 这里宽松保留 a-zA-Z0-9-._~
  return encodeURIComponent(input)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%(?:7C|60|5E)/g, (c) => c);
}
