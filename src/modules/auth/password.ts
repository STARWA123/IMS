import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const cost = 16_384;
const blockSize = 8;
const parallelization = 1;
const maxmem = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization, maxmem },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export function validatePassword(password: string): void {
  if (password.length < 12) {
    throw new TypeError("密码至少需要 12 个字符。");
  }
  if (password.length > 128) {
    throw new TypeError("密码不能超过 128 个字符。");
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new TypeError("密码必须同时包含字母和数字。");
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return [
    "scrypt",
    cost,
    blockSize,
    parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, encodedCost, encodedBlockSize, encodedParallelization, salt, key] =
    encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    Number(encodedCost) !== cost ||
    Number(encodedBlockSize) !== blockSize ||
    Number(encodedParallelization) !== parallelization ||
    !salt ||
    !key
  ) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(key, "base64url");
    const actualKey = await deriveKey(password, Buffer.from(salt, "base64url"));
    return (
      actualKey.length === expectedKey.length &&
      timingSafeEqual(actualKey, expectedKey)
    );
  } catch {
    return false;
  }
}
