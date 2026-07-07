/**
 * 7天打卡活动 - Express 服务器
 * 兼容 Zeabur / 阿里云 / 腾讯云等 Node.js 平台
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());

// ========== 飞书 API 通用函数 ==========
async function getTenantToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`);
  return data.tenant_access_token;
}

// ========== 签到接口 /api/check-in ==========
async function getCheckinRecords(token, phone) {
  const tableId = process.env.FEISHU_CHECKIN_TABLE_ID;
  const baseToken = process.env.FEISHU_BASE_TOKEN;
  const filter = encodeURIComponent(`CurrentValue.[手机号]="${phone}"`);
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records?page_size=100&filter=${filter}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`查询签到记录失败: ${data.msg}`);
  return data.data?.items || [];
}

function calcConsecutiveDays(dates) {
  if (!dates.length) return 0;
  const sorted = [...dates].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i - 1]) - new Date(sorted[i])) / 86400000;
    if (diff === 1) count++;
    else break;
  }
  return count;
}

app.get('/api/check-in', async (req, res) => {
  try {
    const token = await getTenantToken();
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: '缺少手机号参数' });
    const records = await getCheckinRecords(token, phone);
    const dates = records.map(r => r.fields['签到日期']).filter(Boolean);
    res.json({
      success: true,
      total_days: dates.length,
      consecutive_days: calcConsecutiveDays(dates),
      checkin_dates: dates.sort(),
    });
  } catch (e) {
    console.error('GET /api/check-in error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/check-in', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }
    const token = await getTenantToken();
    const today = new Date().toISOString().slice(0, 10);
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

    const newDates = [...dates, today];
    const consecutive = calcConsecutiveDays(newDates);
    const ua = (req.headers['user-agent'] || '').substring(0, 50);

    const writeUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_BASE_TOKEN}/tables/${process.env.FEISHU_CHECKIN_TABLE_ID}/records`;
    const writeRes = await fetch(writeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        fields: {
          '手机号': phone, '签到日期': today, '签到时间': Date.now(),
          '连续天数': consecutive, '设备信息': ua,
        },
      }),
    });
    const writeData = await writeRes.json();
    if (writeData.code !== 0) throw new Error(`写入签到记录失败: ${writeData.msg}`);

    res.json({
      success: true, message: '签到成功',
      total_days: newDates.length,
      consecutive_days: consecutive,
      checkin_dates: newDates.sort(),
    });
  } catch (e) {
    console.error('POST /api/check-in error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== 奖品领取接口 /api/submit-reward ==========
app.post('/api/submit-reward', async (req, res) => {
  try {
    const { name, phone, address, prize, day, timestamp } = req.body;
    if (!name || !phone || !address || !prize) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    const token = await getTenantToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_BASE_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`;
    const writeRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        fields: {
          '姓名': name, '手机号': phone, '收货地址': address,
          '奖品名称': prize, '打卡天数': Number(day),
          '提交时间': new Date(timestamp || Date.now()).getTime(),
        },
      }),
    });
    const data = await writeRes.json();
    if (data.code !== 0) throw new Error(`写入记录失败: ${data.msg}`);

    res.json({ success: true, message: '提交成功', record_id: data.data?.record?.record_id });
  } catch (e) {
    console.error('POST /api/submit-reward error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== 静态文件 ==========
app.use(express.static(path.join(__dirname, 'public')));

// 启动
app.listen(PORT, () => {
  console.log(`打卡活动服务已启动: http://localhost:${PORT}`);
});
