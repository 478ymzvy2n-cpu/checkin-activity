/**
 * Vercel Serverless Function - 奖品领取数据写入飞书多维表格
 * 接收前端表单数据，调用飞书 Open API 写入多维表格
 */

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_BASE_TOKEN = process.env.FEISHU_BASE_TOKEN;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;

// 获取飞书 tenant_access_token
async function getTenantToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`获取 token 失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

// 写入飞书多维表格记录
async function writeRecord(token, record) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      fields: {
        '姓名': record.name,
        '手机号': record.phone,
        '收货地址': record.address,
        '奖品名称': record.prize,
        '打卡天数': Number(record.day),
        '提交时间': new Date(record.timestamp || Date.now()).getTime(),
      },
    }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`写入记录失败: ${data.msg}`);
  }
  return data;
}

// CORS 预检
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

// 主函数
export default async function handler(req, res) {
  // 处理 CORS
  if (handleCors(req, res)) return;

  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  // 校验环境变量
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !FEISHU_BASE_TOKEN || !FEISHU_TABLE_ID) {
    return res.status(500).json({ error: '服务端配置缺失，请检查环境变量' });
  }

  try {
    const { name, phone, address, prize, day, timestamp } = req.body;

    // 校验必填字段
    if (!name || !phone || !address || !prize) {
      return res.status(400).json({ error: '请填写完整信息' });
    }

    // 校验手机号
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 获取飞书 token
    const token = await getTenantToken();

    // 写入记录
    const result = await writeRecord(token, {
      name, phone, address, prize, day, timestamp,
    });

    res.status(200).json({
      success: true,
      message: '提交成功',
      record_id: result.data?.record?.record_id,
    });

  } catch (error) {
    console.error('提交失败:', error);
    res.status(500).json({ error: error.message || '服务器错误' });
  }
}
