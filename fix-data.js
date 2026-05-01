const fs = require('fs');
const path = require('path');

let dataDir;

// 关键：Vercel 只能用 /tmp 文件夹
if (process.env.VERCEL) {
  dataDir = '/tmp';
} else {
  dataDir = path.join(__dirname, 'data');
}

// 自动创建
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log('✅ 数据文件夹已修复：', dataDir);