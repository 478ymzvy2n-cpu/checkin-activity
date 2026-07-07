/**
 * Vercel Serverless Function - 签到状态同步
 * 可选：用于多设备同步签到状态
 */

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_BASE_TOKEN = process.env.FEISHU_BASE_TOKEN;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;

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
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`);
  return data.tenant_access_token;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET 请求' });
  }

  try {
    const token = await getTenantToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_BASE_TOKEN}/tables/${FEISHU_TABLE_ID}/records?page_size=20`;

    const fetchRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await fetchRes.json();

    if (data.code !== 0) {
      return res.status(500).json({ error: data.msg });
    }

    res.status(200).json({
      success: true,
      records: data.data?.items || [],
      total: data.data?.total || 0,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
