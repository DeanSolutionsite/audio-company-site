/**
 * 商用音响官网 - AI 智能销售助手 Worker
 *
 * 路由：
 *   POST /         → 聊天（调用 LLM）
 *   POST /save-lead → 保存客户线索到 KV 存储
 *   GET /get-leads  → 获取线索列表（admin 页面用）
 *
 * 系统提示词从外部 MD 文件加载（通过 PROMPT_URL 环境变量指定），
 * 修改沟通逻辑只需编辑 MD 文件，无需改代码。
 */

const CONFIG = {
  API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
  API_KEY: '',
  MODEL: 'gpt-4o-mini',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1024,
  COMPANY_NAME: '上海成焰电子科技有限公司',
  COMPANY_EMAIL: 'contact@chengyan.com',
  COMPANY_DOMAIN: 'chengyan.com',
  ADMIN_TOKEN: 'admin123',
  // 系统提示词 MD 文件的 URL（通过环境变量 PROMPT_URL 设置）
  PROMPT_URL: 'https://deansolutionsite.github.io/audio-company-site/SYSTEM_PROMPT.md',
};

// 简单的内容缓存（避免每次请求都重新拉取）
let promptCache = { content: '', timestamp: 0 };
const CACHE_TTL = 60000; // 缓存 60 秒

/** 从远程 MD 文件加载系统提示词，替换占位符 */
async function fetchSystemPrompt(url, companyName, companyEmail) {
  // 缓存有效期内直接用缓存
  const now = Date.now();
  if (promptCache.content && (now - promptCache.timestamp) < CACHE_TTL) {
    return promptCache.content;
  }

  try {
    const resp = await fetch(url, { cf: { cacheTtl: 60 } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    let text = await resp.text();

    // 替换占位符
    text = text.replace(/\{\{COMPANY_NAME\}\}/g, companyName);
    text = text.replace(/\{\{COMPANY_EMAIL\}\}/g, companyEmail);

    // 更新缓存
    promptCache = { content: text, timestamp: now };
    return text;
  } catch (err) {
    console.error('加载系统提示词失败:', err.message);
    // 如果缓存里有旧内容，返回旧内容
    if (promptCache.content) return promptCache.content;
    // 兜底：返回一个最基本的提示词
    return `你是 ${companyName} 的智能销售顾问。通过对话了解客户的门店信息、需求，最终生成需求档案并引导客户留下联系方式。公司邮箱：${companyEmail}`;
  }
}

// ===== 主入口 =====
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/save-lead') {
      return handleSaveLead(request, env);
    }
    if (request.method === 'GET' && path === '/get-leads') {
      return handleGetLeads(request, env);
    }
    if (request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  },
};

// ===== 聊天接口 =====
async function handleChat(request, env) {
  try {
    const body = await request.json();
    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      return jsonResponse({ error: '缺少 messages 参数' }, 400, request);
    }

    const config = {
      API_ENDPOINT: env.LLM_API_ENDPOINT || CONFIG.API_ENDPOINT,
      API_KEY: env.LLM_API_KEY || CONFIG.API_KEY,
      MODEL: env.LLM_MODEL || CONFIG.MODEL,
      TEMPERATURE: env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : CONFIG.TEMPERATURE,
      MAX_TOKENS: env.LLM_MAX_TOKENS ? parseInt(env.LLM_MAX_TOKENS) : CONFIG.MAX_TOKENS,
      COMPANY_NAME: env.COMPANY_NAME || CONFIG.COMPANY_NAME,
      COMPANY_EMAIL: env.COMPANY_EMAIL || CONFIG.COMPANY_EMAIL,
      PROMPT_URL: env.PROMPT_URL || CONFIG.PROMPT_URL,
    };

    if (!config.API_KEY) {
      return jsonResponse({ error: 'LLM API Key 未配置' }, 500, request);
    }

    // 从远程 MD 文件加载系统提示词
    const systemContent = await fetchSystemPrompt(
      config.PROMPT_URL,
      config.COMPANY_NAME,
      config.COMPANY_EMAIL
    );

    const llmMessages = [
      { role: 'system', content: systemContent },
      ...messages,
    ];

    const llmResponse = await fetch(config.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.API_KEY}`,
      },
      body: JSON.stringify({
        model: config.MODEL,
        messages: llmMessages,
        temperature: config.TEMPERATURE,
        max_tokens: config.MAX_TOKENS,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      return jsonResponse({ error: `LLM API 错误 (${llmResponse.status})`, detail: errorText }, 502, request);
    }

    const llmData = await llmResponse.json();
    const reply = llmData.choices?.[0]?.message?.content || '';
    return jsonResponse({ reply }, 200, request);
  } catch (err) {
    console.error('Worker 内部错误:', err);
    return jsonResponse({ error: '服务器内部错误', detail: err.message }, 500, request);
  }
}

// ===== 保存线索到 KV =====
async function handleSaveLead(request, env) {
  try {
    if (!env.LEADS) {
      return jsonResponse({ error: 'KV 存储未绑定' }, 500, request);
    }
    const body = await request.json();
    const { name, phone, email, summary } = body;
    if (!name || !phone) {
      return jsonResponse({ error: '缺少必填字段' }, 400, request);
    }
    const lead = {
      name, phone,
      email: email || '',
      summary: summary || '',
      timestamp: new Date().toISOString(),
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    };
    await env.LEADS.put(lead.id, JSON.stringify(lead));
    return jsonResponse({ success: true }, 200, request);
  } catch (err) {
    return jsonResponse({ error: '保存失败', detail: err.message }, 500, request);
  }
}

// ===== 获取线索列表 =====
async function handleGetLeads(request, env) {
  try {
    if (!env.LEADS) {
      return jsonResponse({ error: 'KV 存储未绑定' }, 500, request);
    }
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const expectedToken = env.ADMIN_TOKEN || CONFIG.ADMIN_TOKEN;
    if (token !== expectedToken) {
      return jsonResponse({ error: '密码错误' }, 403, request);
    }
    const listResult = await env.LEADS.list({ prefix: 'lead_' });
    const leads = [];
    for (const key of listResult.keys) {
      const value = await env.LEADS.get(key.name);
      if (value) leads.push(JSON.parse(value));
    }
    leads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return jsonResponse({ leads }, 200, request);
  } catch (err) {
    return jsonResponse({ error: '获取失败', detail: err.message }, 500, request);
  }
}

// ===== 辅助函数 =====
function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
