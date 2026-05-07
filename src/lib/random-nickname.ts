const ADJ = [
  "忧伤的",
  "开心的",
  "慵懒的",
  "勇敢的",
  "安静的",
  "热烈的",
  "温柔的",
  "倔强的",
  "清醒的",
  "迷糊的",
];

const FRUITS = [
  "苹果",
  "香蕉",
  "葡萄",
  "草莓",
  "芒果",
  "柠檬",
  "西瓜",
  "樱桃",
  "菠萝",
  "柚子",
];

export function generateRandomNickname(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)] ?? "安静的";
  const f = FRUITS[Math.floor(Math.random() * FRUITS.length)] ?? "苹果";
  return `${a}${f}`;
}

/** 中文一字算 2 单位，英文/数字 1 单位；上限 14（即最多 7 个汉字或 14 个英文字符量级） */
export function nicknameUnitLength(s: string): number {
  let u = 0;
  for (const ch of s.trim()) {
    if (/[\u4e00-\u9fff]/.test(ch)) u += 2;
    else if (/[a-zA-Z0-9]/.test(ch)) u += 1;
    else u += 2;
  }
  return u;
}

export function isValidNickname(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const u = nicknameUnitLength(t);
  return u >= 2 && u <= 14;
}
