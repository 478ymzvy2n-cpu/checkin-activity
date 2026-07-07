/**
 * Vercel Serverless Function - 签到接口
 * POST: 签到（防重复，跨设备）
 * GET:  获取用户签到记录
 */

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_BASE_TOKEN = process.env.FEISHU_BASE_TOKEN;
const CHECKIN_TABLE_ID = process.env.FEISHU_CHECKIN_TABLE_ID; // tblSYwn6PEpYz5XM

// 获取飞书 tenant_access_token
async function getTenantToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`);
  return data.tenant_access_token;
}

// 查询某手机号的所有签到记录
async function getCheckinRecords(token, phone) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${CHECKIN_TABLE_ID}/records?page_size=100&filter=CurrentValue.[手机号]="${phone}"`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`查询签到记录失败: ${data.msg}`);
  return data.data?.items || [];
}

// 计算连续签到天数
function calcConsecutiveDays(dates) {
  if (!dates.length) return 0;
  const sorted = dates.sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 如果最近一次签到不是今天也不是昨天，连续天数从0开始
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (prev - curr) / 86400000;
    if (diff === 1) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// CORS
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !FEISHU_BASE_TOKEN || !CHECKIN_TABLE_ID) {
    return res.status(500).json({ error: '服务端配置缺失' });
  }

  try {
    const token = await getTenantToken();

    // GET - 查询签到记录
    if (req.method === 'GET') {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: '缺少手机号参数' });

      const records = await getCheckinRecords(token, phone);
      const dates = records.map(r => r.fields['签到日期']).filter(Boolean);
      const consecutive = calcConsecutiveDays(dates);

      return res.status(200).json({
        success: true,
        total_days: dates.length,
        consecutive_days: consecutive,
        checkin_dates: dates.sort(),
      });
    }

    // POST - 签到
    if (req.method === 'POST') {
      const { phone } = req.body;
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '手机号格式不正确' });
      }

      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();

      // 查询今天是否已签到
      const records = await getCheckinRecords(token, phone);
      const dates = records.map(r => r.fields['签到日期']).filter(Boolean);

      if (dates.includes(today)) {
        return res.status(400).json({
          error: '今天已经签到过了',
          already_checked_in: true,
          total_days: dates.length,
          consecutive_days: calcConsecutiveDays(dates),
        });
      }

      // 计算连续天数（加今天）
      const newDates = [...dates, today];
      const consecutive = calcConsecutiveDays(newDates);

      // 写入签到记录
      const ua = req.headers['user-agent'] || '';
      const shortUA = ua.length > 50 ? ua.substring(0, 50) : ua;

      const writeUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${CHECKIN_TABLE_ID}/records`;
      const writeRes = await fetch(writeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fields: {
            '手机号': phone,
            '签到日期': today,
            '签到时间': now,
            '连续天数': consecutive,
            '设备信息': shortUA,
          },
        }),
      });
      const writeData = await writeRes.json();
      if (writeData.code !== 0) {
        throw new Error(`写入签到记录失败: ${writeData.msg}`);
      }

      return res.status(200).json({
        success: true,
        message: '签到成功',
        total_days: newDates.length,
        consecutive_days: consecutive,
        checkin_dates: newDates.sort(),
      });
    }

    return res.status(405).json({ error: '仅支持 GET/POST 请求' });

  } catch (error) {
    console.error('签到接口错误:', error);
    res.status(500).json({ error: error.message || '服务器错误' });
  }
}
