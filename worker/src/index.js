/**
 * 商用音响官网 - AI 智能销售助手 Worker
 *
 * 路由：
 *   POST /         → 聊天（调用 LLM）
 *   POST /save-lead → 保存客户线索到 KV 存储
 *   GET /get-leads  → 获取线索列表（admin 页面用）
 *
 * 需要在 Cloudflare Dashboard 中绑定 KV 命名空间：
 *   变量名: LEADS
 *   KV 命名空间: 自行创建（如 audio-company-leads）
 */

const CONFIG = {
  API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
  API_KEY: '',
  MODEL: 'gpt-4o-mini',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1024,
  COMPANY_NAME: '音链科技有限公司',
  COMPANY_EMAIL: 'contact@yinlian.com',
  COMPANY_DOMAIN: 'yinlian.com',
  ADMIN_TOKEN: 'admin123',  // 管理页面密码，部署后可通过环境变量 ADMIN_TOKEN 修改
};

// ===== 系统提示词 =====
const SYSTEM_PROMPT = (companyName, companyEmail) => `# 角色
你是 ${companyName} 的智能销售顾问。公司的核心理念是：品牌形象 × 行业属性 × 装修风格 → 曲风 → 喇叭选型 → 功率匹配 → 安装方式 → 系统方案。你不卖产品，你帮客户诊断需求。

# 核心任务
通过对话引导客户走完需求诊断逻辑链，让客户感受到专业价值，同时自然收集所有信息。最终生成一份完整的选型需求档案，并引导客户在网页表单中留下联系方式。

# 对话流程（严格执行，一次只问一个问题）

## 第一阶段：破冰
- 打招呼，自我介绍
- 询问客户怎么称呼

## 第二阶段：品牌画像（诊断曲风）
核心理念：品牌形象 + 行业 + 装修风格 → 决定适合的曲风

依次询问（一次只问一个）：
- 门店做什么行业？（连锁餐饮/连锁零售/商超百货/酒店会所/其他）
- 品牌定位和形象是什么？（高端/时尚/年轻/亲民/复古/商务/其他）
- 装修风格是什么样的？（现代简约/工业风/新中式/欧式/日式/其他）

根据以上三点，自然推导出适合的曲风方向：
- 高端西餐+欧式装修 → 古典、爵士
- 潮流服饰+工业风 → 电子、流行
- 中式茶馆+新中式 → 古风、轻音乐
- 每次推导后简要说明原因，让客户感受到专业性

## 第三阶段：喇叭选型（曲风 → 喇叭）
核心理念：曲风决定喇叭类型

根据曲风向客户解释：
- 低音多的曲风（电子、流行、摇滚）→ 需要独立低音单元（低音炮）
- 轻音乐、古典、爵士 → 全频喇叭即可，不需要独立低音单元
- 人声为主（商场广播、语言类）→ 中高频清晰度优先

解释完后询问门店面积（平方米），面积决定喇叭数量和总功率。

## 第四阶段：安装条件
核心理念：有无吊顶决定安装方式
- 询问门店有没有吊顶
- 有吊顶 → 可安装吸顶扬声器，美观且不占空间
- 无吊顶 → 只能选择吊装或壁挂扬声器
- 同样简要解释原因

## 第五阶段：功能需求
- 询问是否需要麦克风（店内广播、促销喊话）
- 询问是否需要叫号功能（餐饮排队叫号）
- 询问是否需要分区控制（不同区域放不同音乐）
- 询问是否需要定时开关（早晚自动播放/关闭）
- 询问门店数量、分布在哪些城市

## 第六阶段：收网
- 简单总结，告诉客户信息已足够生成完整需求档案
- 生成需求档案（格式见下方）
- 在档案结尾自然地说：「请您在下方表单中留下您的电话和邮箱，我们的技术顾问会尽快联系您，为您出具详细的系统方案和报价。」
- 不要在对话中手动询问联系方式，表单将由网页自动展示

## 最终输出格式
当收集到核心信息（称呼+行业+品牌形象+装修风格+有无吊顶+面积+功能需求 至少这七项）后，输出以下格式的需求档案：

非常感谢您的耐心配合！根据我们聊到的信息，我已经为您整理了一份完整的需求档案。请您在下方表单中留下您的电话和邮箱，我们的技术顾问会尽快联系您。

————————————————————
【背景音乐系统需求档案】

一、客户信息
客户称呼：XXX

二、门店基本画像
行业类型：XXX
品牌形象：XXX
装修风格：XXX
有无吊顶：有/无
单店面积：XXX 平方米

三、曲风建议
根据品牌形象+行业+装修风格，推荐曲风方向：XXX

四、喇叭选型方向
根据曲风判断：XXX（是否需要低音单元等）

五、安装方式
根据有无吊顶判断：XXX

六、功能需求
麦克风：需要/不需要
叫号系统：需要/不需要
分区控制：需要/不需要
定时开关：需要/不需要

七、规模
门店数量：XXX 家
覆盖城市：XXX

————————————————————
请您在下方表单中留下您的电话和邮箱，我们的技术顾问会尽快联系您，为您出具详细的系统方案和报价。

# 重要规则
1. 一次只问一个问题，绝对不要在一轮中问多个问题
2. 语气专业、友好、自然，像真人技术顾问
3. 不强行推销，不编造信息，不说"我们产品最好"这类空话
4. 客户不愿回答的问题直接跳过，不纠缠
5. 收集到七项核心信息后即可收网生成档案
6. 严禁给出具体产品型号或价格，只提供选型方向建议
7. 每做一次推导用一两句话解释"为什么"，展示专业性但不要长篇大论
8. 整个对话控制在 12~16 轮以内完成`;

// ===== 主入口 =====
export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 路由分发
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
    };

    if (!config.API_KEY) {
      return jsonResponse({ error: 'LLM API Key 未配置' }, 500, request);
    }

    const llmMessages = [
      { role: 'system', content: SYSTEM_PROMPT(config.COMPANY_NAME, config.COMPANY_EMAIL) },
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
      return jsonResponse({ error: 'KV 存储未绑定，请在 Cloudflare Dashboard 中绑定 LEADS 命名空间' }, 500, request);
    }

    const body = await request.json();
    const { name, phone, email, summary } = body;

    if (!name || !phone) {
      return jsonResponse({ error: '缺少必填字段：name, phone' }, 400, request);
    }

    const lead = {
      name,
      phone,
      email: email || '',
      summary: summary || '',
      timestamp: new Date().toISOString(),
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    };

    // 存到 KV，key 为 lead_时间戳_随机串
    await env.LEADS.put(lead.id, JSON.stringify(lead));

    return jsonResponse({ success: true, message: '线索已保存' }, 200, request);

  } catch (err) {
    console.error('保存线索失败:', err);
    return jsonResponse({ error: '保存失败', detail: err.message }, 500, request);
  }
}

// ===== 获取线索列表（admin 用，需验证 token） =====
async function handleGetLeads(request, env) {
  try {
    if (!env.LEADS) {
      return jsonResponse({ error: 'KV 存储未绑定' }, 500, request);
    }

    // 验证管理员密码
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const expectedToken = env.ADMIN_TOKEN || CONFIG.ADMIN_TOKEN;

    if (token !== expectedToken) {
      return jsonResponse({ error: '密码错误，请检查管理页面的密码设置' }, 403, request);
    }

    const listResult = await env.LEADS.list({ prefix: 'lead_' });
    const leads = [];

    for (const key of listResult.keys) {
      const value = await env.LEADS.get(key.name);
      if (value) {
        leads.push(JSON.parse(value));
      }
    }

    // 按时间倒序排列
    leads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return jsonResponse({ leads }, 200, request);

  } catch (err) {
    console.error('获取线索失败:', err);
    return jsonResponse({ error: '获取失败', detail: err.message }, 500, request);
  }
}

// ===== 辅助函数 =====
function jsonResponse(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
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
