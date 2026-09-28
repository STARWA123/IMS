export const MINIMUM_PASSWORD_LENGTH = 6;
export const MAXIMUM_PASSWORD_LENGTH = 128;
export const PASSWORD_REQUIREMENT_TEXT = `至少 ${MINIMUM_PASSWORD_LENGTH} 位，同时包含字母和数字。`;

export function validatePassword(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new TypeError(`密码至少需要 ${MINIMUM_PASSWORD_LENGTH} 个字符。`);
  }
  if (password.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new TypeError(`密码不能超过 ${MAXIMUM_PASSWORD_LENGTH} 个字符。`);
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new TypeError("密码必须同时包含字母和数字。");
  }
}
