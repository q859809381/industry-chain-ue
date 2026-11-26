/* 个人中心模块：我的订单 / 通知中心 / 安全中心（账号设置、服务协议） / 线上申请发票 */
(function () {
  'use strict';

  const KEYS = {
    adminOrders: 'wudu-admin-orders',
    localOrders: 'wudu-user-orders',
    notices: 'wudu-user-notices',
    // 服务续费产生的本地记录（订单仍写到 localOrders，这里只补充服务期来源标记）
    renewals: 'wudu-user-renewals'
  };

  const state = {
    view: 'services',
    orderTab: 'all',
    // 我的服务只分「服务中 / 已过期」两块，默认进入即看服务中项目
    serviceTab: 'active',
    noticeTab: 'all',
    agreement: 'service',
    expandedNotice: null,
    detailOrder: null,
    detailService: null,
    invoiceOrders: [],
    invoiceType: '普通发票',
    invoiceExtraOpen: false,
    // 订单勾选（合并开票）：存订单 id
    selected: []
  };

  let panel;
  let wrap;
  let main;
  let nav;
  let detailLayer;
  let detailBody;
  let detailTitle;
  let formLayer;
  let formBody;
  let noticeBadge;

  /* ---------- 通用工具 ---------- */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function authKeys() {
    return window.WUDU_AUTH_KEYS || {
      USER_KEY: 'wudu-industry-user',
      USERS_KEY: 'wudu-industry-users'
    };
  }

  function currentUser() {
    try {
      return (window.WuduAuth && window.WuduAuth.getUser()) || readJson(authKeys().USER_KEY, null);
    } catch (error) {
      return readJson(authKeys().USER_KEY, null);
    }
  }

  function userProfile(phone) {
    const users = readJson(authKeys().USERS_KEY, {});
    return (users && users[phone]) || {};
  }

  function maskPhone(phone) {
    return String(phone || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }

  function typeLabel(user) {
    return user && user.type === 'paid' ? '收费会员' : '注册用户';
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function fmtTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    return String(value);
  }

  function money(value) {
    const number = Number(value) || 0;
    return `¥${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function notify(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }

  function icon(name, extra) {
    return `<svg class="ui-icon mini ${extra || ''}"><use href="#icon-${name}"></use></svg>`;
  }

  function setView(view) {
    if (typeof window.WuduSetView === 'function') window.WuduSetView(view);
    else notify('页面切换模块未加载，请刷新后重试');
  }

  /* ---------- 订单数据：后台推送订单 + 用户端支付订单 ---------- */
  // 演示数据覆盖多种场景：已支付/待支付、已开票/申请中/未申请、线上/线下支付、
  // 单服务/多服务、1年/2年/3年服务期、已续费历史，便于验证「我的订单」「我的服务」全部分支
  function demoOrders(phone) {
    const stamp = (text) => text;
    return [
      {
        id: 'WD2026112010320001', phone, username: '', source: 'demo',
        items: [{ name: '集成电路', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'none', pushedAt: stamp('2026-11-20T10:32:00+08:00'), paidAt: stamp('2026-11-20T10:34:12+08:00')
      },
      {
        id: 'WD2026111514080002', phone, username: '', source: 'demo',
        items: [{ name: '生物医药', term: 1, price: 199 }],
        originAmount: 199, amount: 179, status: 'paid', payMethod: 'offline',
        invoiceStatus: 'done', pushedAt: stamp('2026-11-15T14:08:00+08:00'), paidAt: stamp('2026-11-15T14:26:40+08:00'),
        operator: '客服专员', invoiceTime: '2026-11-16 15:42:03',
        invoiceType: '普通发票', invoiceCompany: '杭州云图数据服务有限公司', invoiceTaxNo: '91330106MA2KQCT15H',
        invoiceFormat: 'PDF格式', invoiceAddress: '浙江省杭州市西湖区文三路 478 号', invoicePhone: '0571-88012345',
        invoiceBank: '招商银行杭州分行', invoiceBankNo: '571900123456789', invoiceRemark: '客户要求开具企业抬头电子发票。'
      },
      {
        id: 'WD2026110809160003', phone, username: '', source: 'demo',
        items: [{ name: '低空经济', term: 2, price: 199 }],
        originAmount: 398, amount: 358, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'pending', pushedAt: stamp('2026-11-08T09:16:00+08:00'), paidAt: stamp('2026-11-08T09:18:55+08:00'),
        invoiceType: '普通发票', invoiceCompany: '北京启明数据科技有限公司', invoiceTaxNo: '91110108MA01QCT15H',
        invoiceFormat: 'PDF格式', invoiceAddress: '北京市海淀区中关村大街 27 号', invoicePhone: '010-62345678',
        invoiceBank: '--', invoiceBankNo: '--', invoiceRemark: '已提交电子发票申请，等待开具。',
        invoiceApplyTime: '2026-11-09 10:22:31'
      },
      {
        id: 'WD2026112409420004', phone, username: '', source: 'demo',
        items: [{ name: '量子科技', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'pending', payMethod: '',
        invoiceStatus: 'none', pushedAt: stamp('2026-11-24T09:42:00+08:00'), paidAt: ''
      },
      // 服务中、刚开通不久（进度条接近 0）
      {
        id: 'WD2026112315300005', phone, username: '', source: 'demo',
        items: [{ name: '新能源汽车', term: 1, price: 299 }],
        originAmount: 299, amount: 299, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'none', pushedAt: stamp('2026-11-23T15:30:00+08:00'), paidAt: stamp('2026-11-23T15:32:18+08:00')
      },
      // 多服务合并下单：一条订单开三个服务
      {
        id: 'WD2026111810190006', phone, username: '', source: 'demo',
        items: [
          { name: '人工智能', term: 1, price: 259 },
          { name: '高端装备', term: 1, price: 259 },
          { name: '新材料', term: 1, price: 259 }
        ],
        originAmount: 777, amount: 699, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'pending', pushedAt: stamp('2026-11-18T10:19:00+08:00'), paidAt: stamp('2026-11-18T10:21:36+08:00'),
        invoiceType: '专用发票', invoiceCompany: '北京笃威尔数字技术有限公司', invoiceTaxNo: '91110108MA01ABC23X',
        invoiceFormat: 'OFD格式', invoiceAddress: '北京市海淀区中关村南大街 6 号', invoicePhone: '010-68321050',
        invoiceBank: '中国工商银行北京中关村支行', invoiceBankNo: '0200004509089123456',
        invoiceRemark: '合并开票，需附服务清单。', invoiceApplyTime: '2026-11-19 09:05:12'
      },
      // 3 年期、服务中
      {
        id: 'WD2026090514120007', phone, username: '', source: 'demo',
        items: [{ name: '储能产业', term: 3, price: 199 }],
        originAmount: 597, amount: 520, status: 'paid', payMethod: 'offline',
        invoiceStatus: 'done', pushedAt: stamp('2026-09-05T14:12:00+08:00'), paidAt: stamp('2026-09-05T14:30:00+08:00'),
        operator: '客服专员', invoiceTime: '2026-09-07 10:18:44',
        invoiceType: '普通发票', invoiceCompany: '北京笃威尔数字技术有限公司', invoiceTaxNo: '91110108MA01ABC23X',
        invoiceFormat: 'PDF格式'
      },
      // 已过期服务（开通于一年多前）
      {
        id: 'WD2025082010450008', phone, username: '', source: 'demo',
        items: [{ name: '智能网联汽车', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'done', pushedAt: stamp('2025-08-20T10:45:00+08:00'), paidAt: stamp('2025-08-20T10:47:22+08:00'),
        invoiceTime: '2025-08-21 16:20:09',
        invoiceType: '普通发票', invoiceCompany: '北京笃威尔数字技术有限公司', invoiceTaxNo: '91110108MA01ABC23X',
        invoiceFormat: 'PDF格式'
      },
      // 再过 20 余天到期，用于「即将到期」与续费场景
      {
        id: 'WD2025121816300009', phone, username: '', source: 'demo',
        items: [{ name: '氢能产业', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'none', pushedAt: stamp('2025-12-18T16:30:00+08:00'), paidAt: stamp('2025-12-18T16:32:40+08:00')
      },
      // 待支付（刚下单未付款）
      {
        id: 'WD2026112509180010', phone, username: '', source: 'demo',
        items: [{ name: '商业航天', term: 1, price: 299 }],
        originAmount: 299, amount: 299, status: 'pending', payMethod: '',
        invoiceStatus: 'none', pushedAt: stamp('2026-11-25T09:18:00+08:00'), paidAt: ''
      },
      // 已续费过一次的服务：首次开通 + 续费单，合并后在「我的服务」显示「已续费 1 次」
      {
        id: 'WD2025091211000011', phone, username: '', source: 'demo',
        items: [{ name: '半导体材料', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'done', pushedAt: stamp('2025-09-12T11:00:00+08:00'), paidAt: stamp('2025-09-12T11:02:15+08:00'),
        invoiceTime: '2025-09-13 09:36:50',
        invoiceType: '普通发票', invoiceCompany: '北京笃威尔数字技术有限公司', invoiceTaxNo: '91110108MA01ABC23X',
        invoiceFormat: 'PDF格式'
      },
      {
        id: 'WD2026091215300012', phone, username: '', source: 'renew',
        items: [{ name: '半导体材料', term: 1, price: 199 }],
        originAmount: 199, amount: 199, status: 'paid', payMethod: 'wechat',
        invoiceStatus: 'none', pushedAt: stamp('2026-09-12T15:30:00+08:00'), paidAt: stamp('2026-09-12T15:30:00+08:00'),
        serviceStart: stamp('2026-09-12T11:02:15+08:00'), renewedFrom: 'WD2025091211000011',
        remark: '续费「半导体材料」，服务期自 2026-09-12 起顺延 1 年。'
      }
    ];
  }

  function localOrders() {
    const list = readJson(KEYS.localOrders, []);
    return Array.isArray(list) ? list : [];
  }

  // 演示数据的版本号：扩充样例数据后递增，老浏览器缓存里只有旧样例时自动换成新版
  // 只替换 source==='demo' 的样例订单，用户真实下单（user/renew）与后台推送的一律保留
  const DEMO_SEED_KEY = 'wudu-demo-seed-version';
  const DEMO_SEED_VERSION = 2;

  function ensureDemoOrders(phone) {
    const all = localOrders();
    const mine = all.filter((order) => order && order.phone === phone);
    const adminMine = readJson(KEYS.adminOrders, []).filter((order) => order && order.phone === phone);
    const storedVersion = Number(readJson(DEMO_SEED_KEY, 0)) || 0;

    // 已是最新版本且本人有数据 → 不动
    if (storedVersion >= DEMO_SEED_VERSION && (mine.length || adminMine.length)) return;

    // 清掉本手机号下的旧样例订单，保留真实下单与后台推送
    const kept = all.filter((order) => !(order && order.phone === phone && order.source === 'demo'));
    const fresh = demoOrders(phone).map((order) => ({ ...order, phone }));
    writeJson(KEYS.localOrders, fresh.concat(kept));
    writeJson(DEMO_SEED_KEY, DEMO_SEED_VERSION);
  }

  function allOrders() {
    const user = currentUser();
    if (!user) return [];
    const phone = user.phone;
    ensureDemoOrders(phone);
    const admin = readJson(KEYS.adminOrders, []);
    const local = localOrders();
    const merged = [];
    const seen = new Set();
    [].concat(Array.isArray(local) ? local : [], Array.isArray(admin) ? admin : []).forEach((order) => {
      if (!order || !order.id || order.phone !== phone || seen.has(order.id)) return;
      seen.add(order.id);
      merged.push(order);
    });
    return merged.sort((a, b) => String(b.pushedAt || '').localeCompare(String(a.pushedAt || '')));
  }

  // 订单可能来自后台推送（wudu-admin-orders）或用户端支付（wudu-user-orders），按 id 就地更新
  function saveOrder(patch) {
    let hit = false;
    [KEYS.localOrders, KEYS.adminOrders].forEach((key) => {
      const list = readJson(key, []);
      if (!Array.isArray(list)) return;
      let changed = false;
      list.forEach((order) => {
        if (order && order.id === patch.id) {
          Object.assign(order, patch);
          changed = true;
          hit = true;
        }
      });
      if (changed) writeJson(key, list);
    });
    return hit;
  }

  function recordPurchase(chainName, phone, price, years) {
    const target = phone || (currentUser() && currentUser().phone);
    if (!target) return;
    const now = new Date().toISOString();
    const name = chainName || '指定产业链';
    // 后台配置的是年价；订单按用户选择的 1/2/3 年记录成交单价与服务期
    const term = Math.max(1, Number(years) || 1);
    const unitPrice = Number(price) > 0 ? Math.round(Number(price)) : 0;
    const amount = unitPrice * term;
    const order = {
      id: `WD${Date.now()}${String(Math.floor(Math.random() * 900) + 100)}`,
      phone: target,
      username: userProfile(target).username || '',
      source: 'user',
      items: [{ name, term, price: unitPrice }],
      originAmount: amount,
      amount,
      status: 'paid',
      payMethod: 'wechat',
      invoiceStatus: 'none',
      pushedAt: now,
      paidAt: now
    };
    writeJson(KEYS.localOrders, [order].concat(localOrders()));
  }

  function orderStatusLabel(order) {
    return order.status === 'paid' ? '已完成' : '待支付';
  }

  function invoiceLabel(order) {
    const map = { none: '未申请', pending: '申请中', done: '已开票' };
    return map[order.invoiceStatus] || '未申请';
  }

  function payMethodLabel(order) {
    if (order.status !== 'paid') return '未支付';
    return order.payMethod === 'offline' ? '线下支付' : '微信支付';
  }

  function orderItemLabel(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return '产业链服务';
    const first = `${items[0].name} · ${items[0].term || 1}年`;
    return items.length > 1 ? `${first} 等 ${items.length} 项` : first;
  }

  // 可申请开票 = 已支付 + 未申请（申请中 / 已开票都不可再提交，避免重复开票）
  function isInvoiceSelectable(order) {
    return order.status === 'paid' && (order.invoiceStatus || 'none') === 'none';
  }

  function tag(text, kind) {
    return `<span class="uc-tag ${kind || 'is-muted'}">${esc(text)}</span>`;
  }

  /* ---------- 我的服务：由已支付订单的明细展开而来 ---------- */
  // 每笔已支付订单的每个 items 视为一条已开通服务，服务期从支付时间起算
  function addYears(date, years) {
    const next = new Date(date.getTime());
    next.setFullYear(next.getFullYear() + (Number(years) || 1));
    return next;
  }

  function daysBetween(from, to) {
    return Math.ceil((to.getTime() - from.getTime()) / 86400000);
  }

  function allServices() {
    const raw = [];
    allOrders().forEach((order) => {
      if (order.status !== 'paid') return;
      const items = Array.isArray(order.items) ? order.items : [];
      const startRaw = order.paidAt || order.pushedAt;
      const start = new Date(startRaw);
      if (Number.isNaN(start.getTime())) return;
      items.forEach((item, index) => {
        const term = Number(item.term) || 1;
        // 续费单带 serviceStart：服务期从原到期时间接续，而不是从支付时间起算
        const itemStart = order.serviceStart ? new Date(order.serviceStart) : start;
        const baseStart = Number.isNaN(itemStart.getTime()) ? start : itemStart;
        const end = addYears(baseStart, term);
        raw.push({
          key: `${order.id}::${index}`,
          orderId: order.id,
          name: item.name || '产业链服务',
          term,
          price: Number(item.price) || 0,
          start: baseStart,
          end,
          payMethod: order.payMethod,
          operator: order.operator || '',
          renewedFrom: order.renewedFrom || '',
          source: order.source || ''
        });
      });
    });

    // 同名服务合并为一条：取最晚到期时间为当前服务期，累计年限、最早开通时间
    // 避免「续费后同一服务出现已过期 + 服务中两条」的困惑，历史明细进 history
    const groups = new Map();
    raw.forEach((item) => {
      const group = groups.get(item.name);
      if (!group) {
        groups.set(item.name, { current: item, history: [item] });
        return;
      }
      group.history.push(item);
      if (item.end.getTime() > group.current.end.getTime()) group.current = item;
    });

    return [...groups.values()].map(({ current, history }) => {
      const sorted = history.slice().sort((a, b) => a.start.getTime() - b.start.getTime());
      const first = sorted[0];
      const start = first.start;
      const end = current.end;
      return {
        key: current.key,
        // 关联订单取首次开通那一单，续费单号在「服务期记录」里逐条列出，避免对账时口径混淆
        orderId: first.orderId,
        latestOrderId: current.orderId,
        name: current.name,
        // 有效服务期：最早开通时间 → 最晚到期时间
        start,
        end,
        term: history.reduce((sum, item) => sum + item.term, 0),
        price: current.price,
        daysLeft: daysBetween(new Date(), end),
        payMethod: current.payMethod,
        operator: current.operator,
        renewedFrom: current.renewedFrom,
        renewCount: Math.max(0, history.length - 1),
        history: sorted.map((item) => ({ orderId: item.orderId, start: item.start, end: item.end, term: item.term, source: item.source }))
      };
    }).sort((a, b) => a.end.getTime() - b.end.getTime());
  }

  // 服务只有「服务中 / 已过期」两种状态；临近到期不再单列一类，
  // 而是把进度条转成橙色作为提醒，状态标签仍归入「服务中」
  function serviceState(service) {
    if (service.daysLeft < 0) return { label: '已过期', kind: 'is-expired', tone: 'expired' };
    if (service.daysLeft <= 30) return { label: '服务中', kind: 'is-paid', tone: 'warn' };
    return { label: '服务中', kind: 'is-paid', tone: 'ok' };
  }

  function fmtDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // 服务期进度：已用天数 / 总天数，用于进度条
  function serviceProgress(service) {
    const total = Math.max(1, daysBetween(service.start, service.end));
    const used = Math.max(0, Math.min(total, daysBetween(service.start, new Date())));
    return Math.round((used / total) * 100);
  }

  function renderServices() {
    const services = allServices();
    const active = services.filter((item) => item.daysLeft >= 0);
    const expired = services.filter((item) => item.daysLeft < 0);
    // 服务中项目按「剩余天数升序」排，即将到期的排在最前，方便优先处理
    const activeSorted = active.slice().sort((a, b) => a.daysLeft - b.daysLeft);
    const expiredSorted = expired.slice().sort((a, b) => b.end.getTime() - a.end.getTime());
    const visible = state.serviceTab === 'expired' ? expiredSorted : activeSorted;

    const rows = visible.map((service) => {
      const status = serviceState(service);
      const progress = serviceProgress(service);
      const remaining = service.daysLeft < 0
        ? `已过期 ${Math.abs(service.daysLeft)} 天`
        : `剩余 ${service.daysLeft} 天`;
      const renewTag = service.renewCount ? `<span class="uc-renew-tag">已续费 ${service.renewCount} 次</span>` : '';
      // 到期提醒：30 天内到期仍归「服务中」，仅在时效列加一行小字提示
      const dueHint = service.daysLeft >= 0 && service.daysLeft <= 30
        ? '<div class="uc-validity-hint">即将到期，可续费</div>'
        : '';
      // 续费按钮：服务中项目始终可续费（提前续费即顺延），已过期项目续费后自当日起算
      return [
        '<tr>',
        `<td><div class="uc-cell-main"><button type="button" class="uc-chain-link" data-uc-chain="${esc(service.name)}" title="查看${esc(service.name)}产业链图谱">${esc(service.name)}</button>${renewTag}</div><div class="uc-cell-sub">${esc(service.orderId)}</div></td>`,
        `<td>${service.term} 年</td>`,
        `<td><div class="uc-cell-main">${fmtDate(service.start)}</div><div class="uc-cell-sub">至 ${fmtDate(service.end)}</div></td>`,
        `<td class="uc-col-validity"><div class="uc-validity"><div class="uc-validity-bar"><i style="width:${progress}%" class="${status.tone === 'warn' ? 'is-warn' : (status.tone === 'expired' ? 'is-expired' : '')}"></i></div><span>${remaining}</span>${dueHint}</div></td>`,
        `<td>${tag(status.label, status.kind)}</td>`,
        `<td class="uc-col-actions"><button type="button" class="uc-act" data-uc-service-detail="${esc(service.key)}">查看详情</button><button type="button" class="uc-act is-primary" data-uc-service-renew="${esc(service.key)}">${service.daysLeft < 0 ? '重新开通' : '续费'}</button></td>`,
        '</tr>'
      ].join('');
    }).join('');

    main.innerHTML = [
      '<section class="uc-panel">',
      // 一级导航已标明当前模块，主体内不再重复标题，保证各视图正文起点一致
      '<div class="uc-stat-row">',
      `<div class="uc-stat"><span>服务中</span><strong>${active.length}</strong><small>当前可正常访问</small></div>`,
      `<div class="uc-stat"><span>已过期</span><strong>${expired.length}</strong><small>续费后可恢复访问</small></div>`,
      '</div>',
      '<div class="uc-card">',
      '<div class="uc-tabs" id="ucServiceTabs">',
      `<button type="button" data-uc-service-tab="active" class="${state.serviceTab === 'expired' ? '' : 'is-active'}">服务中<span class="uc-tab-count">${active.length}</span></button>`,
      `<button type="button" data-uc-service-tab="expired" class="${state.serviceTab === 'expired' ? 'is-active' : ''}">已过期<span class="uc-tab-count">${expired.length}</span></button>`,
      `<span class="uc-tabs-extra">共 ${visible.length} 项服务</span>`,
      '</div>',
      visible.length ? [
        '<div class="uc-table-wrap"><table class="uc-table uc-service-table"><thead><tr>',
        '<th>服务名称</th><th>服务期限</th><th>有效期</th><th>服务时效</th><th>状态</th><th>操作</th>',
        '</tr></thead><tbody>', rows, '</tbody></table></div>',
        '<div class="uc-table-note">',
        `${icon('info')}<span>服务期自支付成功之日起算，续费后服务期在原到期时间基础上顺延一年；已过期服务续费后自续费当日起重新计算一年并立即恢复访问。同一服务的多次开通与续费合并展示，明细见「查看详情 · 服务期记录」。</span>`,
        '</div>'
      ].join('') : `<div class="uc-empty">暂无${state.serviceTab === 'expired' ? '已过期' : '服务中'}的服务</div>`,
      '</div></section>'
    ].join('');
  }

  /* ---------- 通知数据 ---------- */
  const NOTICE_SEEDS = [
    {
      id: 'notice-7', kind: '服务通知', icon: 'clock', time: '2026-11-26 09:30',
      title: '「氢能产业」服务即将到期',
      summary: '您的氢能产业链服务将于 2026年12月18日 到期，可提前续费避免影响使用。',
      content: '您开通的「氢能产业」产业链服务将于 2026年12月18日 到期，当前剩余 22 天。到期后该产业链的完整图谱与上链企业数据将无法访问。您可在「我的服务」中查看服务期并办理续费，续费后服务期自原到期时间顺延。'
    },
    {
      id: 'notice-8', kind: '平台公告', icon: 'spark', time: '2026-11-25 14:20',
      title: '「低空经济」产业链新上线',
      summary: '平台新增低空经济产业链图谱，覆盖整机制造、基础设施与运营服务等节点。',
      content: '平台于 2026年11月25日 上线「低空经济」产业链图谱，新增无人机整机制造、核心零部件、低空基础设施、运营服务等环节，并补充相关企业与产业统计数据。您可在产业图谱中浏览新链条，已开通服务的用户可直接查看完整结构。'
    },
    {
      id: 'notice-2', kind: '服务通知', icon: 'check', time: '2026-11-20 10:34',
      title: '「集成电路」产业链开通成功',
      summary: '您已成功开通集成电路产业链服务，可查看完整图谱与上链企业。',
      content: '您于 2026年11月20日 完成「集成电路」产业链服务的开通，服务期限 1 年。可前往产业图谱查看完整产业链结构、链上企业清单与产业统计数据。对应订单可在「我的订单」中查询。'
    },
    {
      id: 'notice-3', kind: '服务通知', icon: 'file', time: '2026-11-16 15:42',
      title: '电子发票已开具',
      summary: '您申请的电子发票已开具，可在订单详情中查看开票信息。',
      content: '您提交的发票申请已开具完成，开票时间为 2026年11月16日 15:42。电子发票文件与开票明细可在对应订单的详情中查看，如需重新开具请联系客服。'
    },
    {
      id: 'notice-6', kind: '平台公告', icon: 'database', time: '2026-11-01 10:00',
      title: '11月产业数据更新完成',
      summary: '本月新增 12 条重点产业链节点数据，覆盖 3.8 亿+ 企业信息。',
      content: '平台已完成 2026年11月 产业数据更新，本次新增 12 条重点产业链节点数据，补充链上企业关联关系与产业统计指标。数据更新至 2026年11月24日，您可在产业图谱中查看最新结果。'
    }
  ];
  const DEFAULT_READ = ['notice-3', 'notice-6'];

  function readIds() {
    const user = currentUser();
    if (!user) return [];
    const store = readJson(KEYS.notices, {});
    const list = store && store[user.phone];
    return Array.isArray(list) ? list : DEFAULT_READ.slice();
  }

  function saveReadIds(ids) {
    const user = currentUser();
    if (!user) return;
    const store = readJson(KEYS.notices, {}) || {};
    store[user.phone] = ids;
    writeJson(KEYS.notices, store);
  }

  function isRead(id) {
    return readIds().indexOf(id) >= 0;
  }

  function unreadCount() {
    return NOTICE_SEEDS.filter((item) => !isRead(item.id)).length;
  }

  function markRead(id) {
    const ids = readIds();
    if (ids.indexOf(id) < 0) {
      ids.push(id);
      saveReadIds(ids);
    }
  }

  /* ---------- 服务协议文本：见 agreements.js，与登录注册弹窗共用同一份法务定稿 ---------- */

  /* ---------- 身份信息 ---------- */
  function refreshIdentity() {
    const user = currentUser();
    if (!user) return;
    const profile = userProfile(user.phone);
    const masked = maskPhone(user.phone);
    const initial = profile.username ? profile.username.slice(0, 1).toUpperCase() : user.phone.slice(-4);
    wrap.querySelector('#ucSideAvatar').textContent = initial;
    wrap.querySelector('#ucSideName').textContent = profile.username || masked;
    wrap.querySelector('#ucSideType').textContent = typeLabel(user);
  }

  function refreshNav() {
    nav.querySelectorAll('[data-uc-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.ucView === state.view);
    });
    const count = unreadCount();
    noticeBadge.hidden = count === 0;
    noticeBadge.textContent = String(count);
  }

  function renderPanel() {
    if (state.view === 'services') return renderServices();
    if (state.view === 'orders') return renderOrders();
    if (state.view === 'notices') return renderNotices();
    if (state.view === 'account') return renderAccount();
    if (state.view === 'agreement') return renderAgreement();
  }

  // 切换个人中心内部视图时，把滚动容器（.main-content）归零。
  // 之前用 wrap.scrollIntoView() 会把内容顶到吸顶导航下方，
  // 导致不同视图的首块内容距顶部忽大忽小（76px / 92px 来回跳）。
  function resetScroll() {
    const scroller = document.querySelector('.main-content');
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ---------- 我的订单 ---------- */
  function renderOrders() {
    const orders = allOrders();
    const paid = orders.filter((order) => order.status === 'paid');
    const totalPaid = paid.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    const chainNames = new Set();
    paid.forEach((order) => (Array.isArray(order.items) ? order.items : []).forEach((item) => chainNames.add(item.name)));
    const pendingInvoice = orders.filter((order) => order.status === 'paid' && (order.invoiceStatus || 'none') === 'none');
    const visible = orders.filter((order) => {
      if (state.orderTab === 'pending') return order.status !== 'paid';
      if (state.orderTab === 'paid') return order.status === 'paid';
      if (state.orderTab === 'invoice') return order.status === 'paid' && (order.invoiceStatus || 'none') !== 'done';
      return true;
    });
    // 可勾选 = 已支付且未申请发票（发票申请中的订单不可再选，避免重复提交）
    const selectable = visible.filter(isInvoiceSelectable);
    const selectableIds = selectable.map((order) => order.id);
    // 已选集合按当前可见范围收敛，切换页签后不残留
    state.selected = state.selected.filter((id) => selectableIds.indexOf(id) >= 0);
    const selectedIds = state.selected;
    const selectedOrders = selectable.filter((order) => selectedIds.indexOf(order.id) >= 0);
    const selectedTotal = selectedOrders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    const allChecked = selectableIds.length > 0 && selectedIds.length === selectableIds.length;

    const rows = visible.map((order) => {
      const invoice = invoiceLabel(order);
      const invoiceKind = invoice === '已开票' ? 'is-paid' : (invoice === '申请中' ? 'is-info' : 'is-muted');
      const statusTag = order.status === 'paid' ? tag('已完成', 'is-paid') : tag('待支付', 'is-pending');
      // 已支付且未申请发票 → 提供线上申请入口；申请中 / 已开票 → 查看申请信息
      let actions = `<button type="button" class="uc-act" data-uc-order-detail="${esc(order.id)}">查看详情</button>`;
      if (order.status !== 'paid') {
        actions += `<button type="button" class="uc-act is-primary" data-uc-order-pay="${esc(order.id)}">支付订单</button>`;
      } else if ((order.invoiceStatus || 'none') === 'none') {
        actions += `<button type="button" class="uc-act is-primary" data-uc-invoice-apply="${esc(order.id)}">申请发票</button>`;
      } else {
        actions += `<button type="button" class="uc-act" data-uc-order-invoice="${esc(order.id)}">发票信息</button>`;
      }
      const canPick = isInvoiceSelectable(order);
      const picked = selectedIds.indexOf(order.id) >= 0;
      return [
        `<tr${picked ? ' class="is-selected"' : ''}>`,
        `<td class="uc-col-check">${canPick ? `<input type="checkbox" class="uc-check" data-uc-order-pick="${esc(order.id)}"${picked ? ' checked' : ''} aria-label="选择订单 ${esc(order.id)}">` : '<span class="uc-check-disabled" title="仅已支付且未申请发票的订单可合并开票">—</span>'}</td>`,
        `<td><div class="uc-cell-main">${esc(order.id)}</div><div class="uc-cell-sub">${fmtTime(order.pushedAt)}</div></td>`,
        `<td class="uc-col-service"><div class="uc-cell-main">${esc(orderItemLabel(order))}</div><div class="uc-cell-sub">${(Array.isArray(order.items) ? order.items : []).length > 1 ? '多条产业链服务' : '单条产业链服务'}</div></td>`,
        `<td>${money(order.originAmount)}</td>`,
        `<td class="uc-amount">${order.status === 'paid' ? money(order.amount) : '—'}</td>`,
        `<td>${statusTag}</td>`,
        `<td>${tag(invoice, invoiceKind)}</td>`,
        `<td class="uc-col-actions">${actions}</td>`,
        '</tr>'
      ].join('');
    }).join('');

    const batchBar = [
      '<div class="uc-batch" id="ucBatchBar">',
      `<span class="uc-batch-count">已选 <b>${selectedIds.length}</b> 笔订单</span>`,
      `<span class="uc-batch-amount">合计可开票金额 <b>${money(selectedTotal)}</b></span>`,
      `<button type="button" class="uc-btn ghost sm" id="ucBatchClear"${selectedIds.length ? '' : ' disabled'}>清空</button>`,
      `<button type="button" class="uc-btn primary sm" id="ucBatchInvoice"${selectedIds.length ? '' : ' disabled'}>合并申请发票</button>`,
      '</div>'
    ].join('');

    main.innerHTML = [
      '<section class="uc-panel">',
      // 一级导航已标明当前模块，主体内不再重复标题
      '<div class="uc-stat-row">',
      `<div class="uc-stat"><span>累计订单</span><strong>${orders.length}</strong><small>含待支付订单</small></div>`,
      `<div class="uc-stat"><span>累计实付金额</span><strong>${money(totalPaid)}</strong><small>仅统计已完成订单</small></div>`,
      `<div class="uc-stat"><span>待申请发票</span><strong>${pendingInvoice.length}</strong><small>已支付订单可在线申请</small></div>`,
      '</div>',
      '<div class="uc-card">',
      '<div class="uc-tabs" id="ucOrderTabs">',
      `<button type="button" data-uc-order-tab="all" class="${state.orderTab === 'all' ? 'is-active' : ''}">全部订单</button>`,
      `<button type="button" data-uc-order-tab="pending" class="${state.orderTab === 'pending' ? 'is-active' : ''}">待支付</button>`,
      `<button type="button" data-uc-order-tab="paid" class="${state.orderTab === 'paid' ? 'is-active' : ''}">已完成</button>`,
      `<button type="button" data-uc-order-tab="invoice" class="${state.orderTab === 'invoice' ? 'is-active' : ''}">发票管理</button>`,
      `<span class="uc-tabs-extra">共 ${visible.length} 笔订单</span>`,
      '</div>',
      visible.length ? [
        batchBar,
        '<div class="uc-table-wrap"><table class="uc-table"><thead><tr>',
        `<th class="uc-col-check"><input type="checkbox" class="uc-check" id="ucPickAll"${allChecked ? ' checked' : ''}${selectableIds.length ? '' : ' disabled'} aria-label="全选可开票订单"></th>`,
        '<th>订单编号</th><th>服务内容</th><th>订单金额</th><th>实付金额</th><th>支付状态</th><th>发票状态</th><th>操作</th>',
        '</tr></thead><tbody>', rows, '</tbody></table></div>',
        '<div class="uc-table-note">',
        `${icon('info')}<span>已支付订单可在线申请开具增值税发票，支持普票与专票；可勾选多笔订单合并申请。提交后状态为「申请中」，财务开具完成后更新为「已开票」。如需修改开票信息请联系客服 010-68321050。</span>`,
        '</div>'
      ].join('') : '<div class="uc-empty">暂无相关订单</div>',
      '</div></section>'
    ].join('');
  }

  function renderNotices() {
    const readList = readIds();
    const visible = NOTICE_SEEDS.filter((item) => state.noticeTab === 'all' || readList.indexOf(item.id) < 0);
    const items = visible.map((item) => {
      const read = readList.indexOf(item.id) >= 0;
      const kindClass = item.kind === '服务通知' ? 'is-service' : (item.kind === '账号安全' ? 'is-security' : '');
      const expanded = state.expandedNotice === item.id;
      return [
        `<div class="uc-notice-item ${read ? 'is-read' : ''}">`,
        `<div class="uc-notice-row" data-uc-notice="${item.id}">`,
        `<span class="uc-notice-icon ${kindClass}">${icon(item.icon)}</span>`,
        '<div class="uc-notice-content">',
        `<div class="uc-notice-title">${read ? '' : '<i class="uc-notice-dot"></i>'}${esc(item.title)}</div>`,
        `<p class="uc-notice-summary">${esc(item.summary)}</p>`,
        '</div>',
        // 类型 / 时间 / 操作提示靠右成列，让条目左右都有内容，
        // 整块视觉宽度与「我的服务」「我的订单」的表格对齐
        '<div class="uc-notice-side">',
        `<span class="uc-notice-kind">${esc(item.kind)}</span>`,
        `<span class="uc-notice-time">${esc(item.time)}</span>`,
        `<span class="uc-notice-toggle">${expanded ? '收起详情' : '点击查看'}</span>`,
        '</div></div>',
        `<div class="uc-notice-detail" ${expanded ? '' : 'hidden'}>${esc(item.content)}</div>`,
        '</div>'
      ].join('');
    }).join('');

    main.innerHTML = [
      '<section class="uc-panel">',
      '<div class="uc-card">',
      '<div class="uc-tabs" id="ucNoticeTabs">',
      `<button type="button" data-uc-notice-tab="all" class="${state.noticeTab === 'all' ? 'is-active' : ''}">全部通知</button>`,
      `<button type="button" data-uc-notice-tab="unread" class="${state.noticeTab === 'unread' ? 'is-active' : ''}">未读通知</button>`,
      `<span class="uc-tabs-extra">共 ${visible.length} 条通知</span>`,
      // 「全部标为已读」是操作入口，放进页签行右侧，避免额外占一行把卡片整体下压
      `<button type="button" class="uc-read-button" id="ucReadAll">全部标为已读${unreadCount() ? `（${unreadCount()} 条未读）` : ''}</button>`,
      '</div>',
      visible.length ? `<div class="uc-notice-list">${items}</div>` : '<div class="uc-empty">暂无未读通知</div>',
      '</div></section>'
    ].join('');
  }

  /* ---------- 安全中心 · 账号设置 ---------- */
  function renderAccount() {
    const user = currentUser();
    if (!user) return;
    const profile = userProfile(user.phone);
    const hasPassword = Boolean(profile.password);
    const username = profile.username || '';
    const registered = profile.createdAt ? fmtTime(profile.createdAt).slice(0, 10) : '—';
    const rows = [
      {
        key: 'username', icon: 'book', title: '用户名管理',
        desc: '8-16 个字符，可以是字母和数字，设定后可用于用户名密码登录',
        value: username ? esc(username) : '未设定',
        action: username ? '修改' : '设置'
      },
      {
        key: 'phone', icon: 'phone', title: '变更手机号',
        desc: '更换后需使用新手机号登录，原手机号将不再绑定本账号',
        value: maskPhone(user.phone),
        action: '变更'
      },
      {
        key: 'password', icon: 'layers', title: '修改密码',
        desc: '6-18 位，可录入字母、数字及特殊字符，建议定期更换',
        value: hasPassword ? '已设置' : '未设置',
        action: hasPassword ? '修改' : '设置'
      }
    ].map((row) => [
      '<div class="uc-setting-row">',
      `<span class="uc-setting-icon">${icon(row.icon)}</span>`,
      `<div class="uc-setting-text"><strong>${row.title}</strong><p>${row.desc}</p></div>`,
      `<div class="uc-setting-value">${row.value}</div>`,
      `<button type="button" class="uc-setting-action" data-uc-account="${row.key}">${row.action}</button>`,
      '</div>'
    ].join('')).join('');

    main.innerHTML = [
      '<section class="uc-panel">',
      // 一级导航已标明当前模块，主体内不再重复标题
      '<div class="uc-account-card">',
      `<span class="uc-account-avatar">${esc(username ? username.slice(0, 1).toUpperCase() : user.phone.slice(-4))}</span>`,
      '<div class="uc-account-info">',
      `<strong>${esc(username || maskPhone(user.phone))}</strong>`,
      `<div class="uc-account-tags">${tag(typeLabel(user), user.type === 'paid' ? 'is-paid' : 'is-info')}${tag(hasPassword ? '已设置密码' : '未设置密码', hasPassword ? 'is-muted' : 'is-pending')}</div>`,
      '</div>',
      // 绑定手机号 / 注册时间靠右成列，横向铺满卡片，避免右侧半张留白
      '<div class="uc-account-side">',
      `<span>绑定手机号　<b>${maskPhone(user.phone)}</b></span>`,
      `<span>注册时间　<b>${registered}</b></span>`,
      '</div>',
      '</div>',
      `<div class="uc-setting-list">${rows}</div>`,
      '</section>'
    ].join('');
  }

  /* ---------- 安全中心 · 服务协议 ---------- */
  function renderAgreement() {
    main.innerHTML = [
      '<section class="uc-panel">',
      // 一级导航已标明当前模块，主体内不再重复标题
      '<div class="uc-agreement-layout">',
      '<div class="uc-agreement-menu" id="ucAgreementMenu">',
      `<button type="button" data-uc-agreement="service" class="${state.agreement === 'service' ? 'is-active' : ''}">${icon('file')}用户服务协议</button>`,
      `<button type="button" data-uc-agreement="privacy" class="${state.agreement === 'privacy' ? 'is-active' : ''}">${icon('book')}隐私政策</button>`,
      '</div>',
      '<div class="uc-agreement-doc">',
      (window.WuduAgreements && typeof window.WuduAgreements.render === 'function'
        ? window.WuduAgreements.render(state.agreement === 'privacy' ? 'privacy' : 'service')
        : '<p>协议内容加载失败，请刷新页面后重试。</p>'),
      '</div></div></section>'
    ].join('');
  }

  /* ---------- 服务详情弹窗 ---------- */
  function openServiceDetail(service) {
    state.detailService = service;
    state.detailOrder = null;
    const status = serviceState(service);
    const progress = serviceProgress(service);
    const total = Math.max(1, daysBetween(service.start, service.end));
    const history = Array.isArray(service.history) ? service.history : [];
    detailTitle.textContent = '服务详情';
    detailBody.innerHTML = [
      '<div class="uc-detail-grid">',
      `<span>服务名称</span><b>${esc(service.name)}</b>`,
      `<span>关联订单</span><b>${esc(service.orderId)}</b>`,
      `<span>服务期限</span><b>${service.term} 年${service.renewCount ? `（含续费 ${service.renewCount} 次）` : ''}</b>`,
      `<span>服务状态</span><b>${status.label}</b>`,
      `<span>开通时间</span><b>${fmtDate(service.start)}</b>`,
      `<span>到期时间</span><b>${fmtDate(service.end)}</b>`,
      `<span>支付方式</span><b>${service.payMethod === 'offline' ? '线下支付' : '微信支付'}</b>`,
      service.operator ? `<span>经办人</span><b>${esc(service.operator)}</b>` : '',
      '</div>',
      '<div class="uc-detail-section"><h5>服务时效</h5>',
      `<div class="uc-validity uc-validity-lg"><div class="uc-validity-bar"><i style="width:${progress}%" class="${status.tone === 'warn' ? 'is-warn' : (status.tone === 'expired' ? 'is-expired' : '')}"></i></div><span>${service.daysLeft < 0 ? `已过期 ${Math.abs(service.daysLeft)} 天` : `剩余 ${service.daysLeft} 天`}</span></div>`,
      `<div class="uc-detail-item"><span>服务起止</span><b>${fmtDate(service.start)} 至 ${fmtDate(service.end)}</b></div>`,
      `<div class="uc-detail-item"><span>服务总时长</span><b>${total} 天</b></div>`,
      '</div>',
      history.length > 1 ? [
        '<div class="uc-detail-section"><h5>服务期记录</h5>',
        '<div class="uc-term-list">',
        history.map((item, index) => [
          '<div class="uc-term-row">',
          `<span class="uc-term-index">${index === 0 ? '首次开通' : `第 ${index} 次续费`}</span>`,
          `<b>${fmtDate(item.start)} 至 ${fmtDate(item.end)}</b>`,
          `<span class="uc-term-order">${esc(item.orderId)}</span>`,
          '</div>'
        ].join('')).reverse().join(''),
        '</div></div>'
      ].join('') : '',
      '<div class="uc-detail-section"><h5>续费说明</h5>',
      '<p class="uc-detail-text">续费后在原到期时间基础上顺延，服务期按年计算；已过期服务续费后自续费当日起重新计算一年，并立即恢复访问权限。如需调整服务范围或批量开通，可联系客服 010-68321050。</p>',
      '</div>'
    ].join('');
    // 详情弹窗底部按钮：已过期 → 重新开通，服务中 → 续费（提前续费即顺延）
    const okButton = wrap.querySelector('#ucDetailOk');
    okButton.textContent = service.daysLeft < 0 ? '重新开通' : '续费一年';
    okButton.dataset.ucRenewFrom = service.key;
    detailLayer.classList.add('is-open');
    detailLayer.setAttribute('aria-hidden', 'false');
  }

  /* ---------- 服务续费 ---------- */
  // 续费 1 年：新开一笔续费订单，服务期从原到期时间接续
  // 已过期服务不再追溯空档期，直接从当前时间起算，续费后立即恢复访问
  function renewService(service) {
    const user = currentUser();
    if (!user) return;
    const now = new Date();
    const iso = now.toISOString();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const expired = service.daysLeft < 0;
    const startFrom = expired ? now : service.end;
    const newEnd = addYears(startFrom, 1);
    const order = {
      id: `WD${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`,
      phone: user.phone,
      username: userProfile(user.phone).username || '',
      source: 'renew',
      items: [{ name: service.name, term: 1, price: service.price || 199 }],
      originAmount: service.price || 199,
      amount: service.price || 199,
      status: 'paid',
      payMethod: 'wechat',
      invoiceStatus: 'none',
      pushedAt: iso,
      paidAt: iso,
      // 续费单：服务生效时间供「我的服务」计算时效（未过期接原到期时间，已过期从当前起算）
      serviceStart: startFrom.toISOString(),
      renewedFrom: service.orderId,
      remark: expired
        ? `续费「${service.name}」，原服务已于 ${fmtDate(service.end)} 到期，本次服务期自 ${fmtDate(now)} 起算 1 年。`
        : `续费「${service.name}」，服务期自 ${fmtDate(service.end)} 起顺延 1 年。`
    };
    writeJson(KEYS.localOrders, [order].concat(localOrders()));
    const renewals = readJson(KEYS.renewals, []);
    const list = Array.isArray(renewals) ? renewals : [];
    list.unshift({ key: service.key, orderId: order.id, time: stamp, name: service.name, fromEnd: fmtDate(service.end), expired });
    writeJson(KEYS.renewals, list);
    closeDetail();
    state.view = 'services';
    // 续费 / 重新开通完成后该服务已回到「服务中」，自动切回服务中列表
    state.serviceTab = 'active';
    refreshNav();
    renderPanel();
    notify(expired
      ? `「${service.name}」续费成功，服务期至 ${fmtDate(newEnd)}`
      : `「${service.name}」续费成功，服务期已顺延至 ${fmtDate(newEnd)}`);
  }

  /* ---------- 发票信息块（字段与运营管理后台「发票申请信息」保持一致） ---------- */
  function invoiceInfoRows(order) {
    const rows = [
      ['发票类型', esc(order.invoiceType || '普通发票')],
      ['公司名称', esc(order.invoiceCompany || '—')],
      ['纳税人识别号', esc(order.invoiceTaxNo || '—')],
      ['发票格式', esc(order.invoiceFormat || 'PDF格式')]
    ];
    const extra = [
      ['公司地址', order.invoiceAddress],
      ['公司电话', order.invoicePhone],
      ['开户行', order.invoiceBank],
      ['开户行账号', order.invoiceBankNo],
      ['备注', order.invoiceRemark]
    ].filter(([, value]) => value && value !== '--');
    return { rows, extra };
  }

  /* ---------- 订单详情弹窗（布局参考运营管理后台订单详情） ---------- */
  function openDetail(order) {
    state.detailOrder = order;
    const items = Array.isArray(order.items) ? order.items : [];
    const paid = order.status === 'paid';
    const origin = Number(order.originAmount) || 0;
    const amount = Number(order.amount) || 0;
    const invoice = order.invoiceStatus || 'none';
    const info = invoiceInfoRows(order);
    const invoiceKind = invoice === 'done' ? 'is-paid' : (invoice === 'pending' ? 'is-info' : 'is-muted');
    const invoiceHtml = invoice === 'none' ? '' : [
      '<div class="uc-detail-section"><h5>发票申请信息</h5>',
      '<div class="uc-detail-grid">',
      info.rows.map(([label, value]) => `<span>${label}</span><b>${value}</b>`).join(''),
      order.invoiceApplyTime ? `<span>申请时间</span><b>${esc(order.invoiceApplyTime)}</b>` : '',
      order.invoiceTime ? `<span>开票时间</span><b>${esc(order.invoiceTime)}</b>` : '',
      '</div>',
      // 选填信息同后台：默认折叠，弱化为告知类入口
      info.extra.length ? [
        '<details class="uc-form-extra">',
        '<summary><span>选填信息</span><em>地址、电话、备注等</em><i><svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></i></summary>',
        `<div class="uc-detail-extra-grid">${info.extra.map(([label, value]) => `<div><span>${label}</span><b>${esc(value)}</b></div>`).join('')}</div>`,
        '</details>'
      ].join('') : '',
      `<div class="uc-detail-invoice-amount"><span>开票金额</span><b>${money(paid ? amount : origin)}</b></div>`,
      '</div>'
    ].join('');

    detailTitle.textContent = '订单详情';
    detailBody.innerHTML = [
      '<div class="uc-detail-summary">',
      `<div><span>订单编号</span><b>${esc(order.id)}</b></div>`,
      `<div><span>订单时间</span><b>${fmtTime(order.pushedAt)}</b></div>`,
      `<div><span>支付方式</span><b>${payMethodLabel(order)}</b></div>`,
      order.payMethod === 'offline' ? `<div><span>经办人</span><b>${esc(order.operator || '客服专员')}</b></div>` : '',
      `<div><span>支付状态</span><b>${tag(orderStatusLabel(order), paid ? 'is-paid' : 'is-pending')}</b></div>`,
      `<div><span>发票状态</span><b>${tag(invoiceLabel(order), invoiceKind)}</b></div>`,
      paid ? `<div><span>支付时间</span><b>${fmtTime(order.paidAt || order.pushedAt)}</b></div>` : '',
      '</div>',
      '<div class="uc-detail-section"><h5>服务明细</h5>',
      '<table class="uc-detail-table"><thead><tr><th>产业链名称</th><th>服务年限</th><th>成交单价</th><th>小计</th></tr></thead><tbody>',
      items.map((item) => {
        const term = Number(item.term) || 1;
        const price = Number(item.price) || 0;
        return `<tr><td>${esc(item.name)}</td><td>${term} 年</td><td>${money(price)}</td><td>${money(price * term)}</td></tr>`;
      }).join(''),
      '</tbody></table>',
      `<div class="uc-detail-total">${origin > amount && paid ? `<span>原价 <del>${money(origin)}</del>，已优惠 ${money(origin - amount)}</span>` : ''}<em>实付金额</em><b>${paid ? money(amount) : '—'}</b></div>`,
      '</div>',
      invoiceHtml
    ].join('');
    const okButton = wrap.querySelector('#ucDetailOk');
    okButton.textContent = '知道了';
    okButton.dataset.ucRenewFrom = '';
    detailLayer.classList.add('is-open');
    detailLayer.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    state.detailOrder = null;
    state.detailService = null;
    // 复位底部按钮（可能刚从「立即续费」状态复用）
    const okButton = wrap.querySelector('#ucDetailOk');
    if (okButton) {
      okButton.textContent = '知道了';
      okButton.dataset.ucRenewFrom = '';
    }
    detailLayer.classList.remove('is-open');
    detailLayer.setAttribute('aria-hidden', 'true');
  }

  /* ---------- 线上申请发票 ---------- */
  function formField(options) {
    const {
      name, label, value = '', placeholder = '', required = false, hint = '', type = 'text', maxlength = 60
    } = options;
    return [
      `<label class="uc-field" data-field="${name}">`,
      `<span class="uc-field-label">${label}${required ? '<em>*</em>' : ''}</span>`,
      `<input type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${maxlength}" autocomplete="off">`,
      hint ? `<small class="uc-field-hint">${hint}</small>` : '',
      '</label>'
    ].join('');
  }

  function invoiceFormHtml(orders) {
    const list = Array.isArray(orders) ? orders : [orders];
    const total = list.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    const isSpecial = state.invoiceType === '专用发票';
    const multi = list.length > 1;
    const orderRows = list.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      return [
        '<div class="uc-form-order-row">',
        `<span class="uc-form-order-id">${esc(order.id)}</span>`,
        `<span class="uc-form-order-service">${esc(items.map((item) => `${item.name} · ${item.term || 1}年`).join('、') || '产业链服务')}</span>`,
        `<b class="uc-amount">${money(Number(order.amount) || 0)}</b>`,
        '</div>'
      ].join('');
    }).join('');
    return [
      '<div class="uc-form-order uc-form-order-list">',
      `<div class="uc-form-order-head"><span>关联订单</span><span>服务内容</span><span>可开票金额</span></div>`,
      orderRows,
      `<div class="uc-form-order-total"><span>共 ${list.length} 笔订单</span><b class="uc-amount">${money(total)}</b></div>`,
      '</div>',
      '<div class="uc-form-section">',
      '<div class="uc-form-section-title">发票类型<em>*</em></div>',
      '<div class="uc-invoice-type" id="ucInvoiceType">',
      `<label class="${state.invoiceType === '普通发票' ? 'is-checked' : ''}"><input type="radio" name="invoiceType" value="普通发票" ${state.invoiceType === '普通发票' ? 'checked' : ''}><span><b>普票</b><small>增值税电子普通发票，开具时效约 1-3 个工作日</small></span></label>`,
      `<label class="${isSpecial ? 'is-checked' : ''}"><input type="radio" name="invoiceType" value="专用发票" ${isSpecial ? 'checked' : ''}><span><b>专票</b><small>增值税专用发票，需填写公司名称与纳税人识别号</small></span></label>`,
      '</div>',
      '</div>',
      '<div class="uc-form-section">',
      '<div class="uc-form-section-title">抬头信息</div>',
      '<div class="uc-form-grid">',
      formField({ name: 'invoiceCompany', label: '公司名称', placeholder: '请输入开票公司全称', required: true, maxlength: 60 }),
      formField({ name: 'invoiceTaxNo', label: '纳税人识别号', placeholder: '请输入 15-20 位纳税人识别号', required: true, maxlength: 20 }),
      '</div>',
      '</div>',
      '<div class="uc-form-section">',
      '<div class="uc-form-section-title">发票格式</div>',
      '<div class="uc-form-grid">',
      '<label class="uc-field"><select name="invoiceFormat">',
      `<option value="PDF格式" ${(list[0].invoiceFormat || 'PDF格式') === 'PDF格式' ? 'selected' : ''}>PDF格式</option>`,
      `<option value="OFD格式" ${list[0].invoiceFormat === 'OFD格式' ? 'selected' : ''}>OFD格式</option>`,
      '</select>',
      '<small class="uc-field-hint">发票开具后可在「发票管理」中查看下载</small>',
      '</label>',
      '</div>',
      '</div>',
      // 选填信息：与运营管理后台「发票申请信息」一致，默认折叠、弱化为告知类入口
      '<details class="uc-form-extra">',
      '<summary><span>选填信息</span><em>地址、电话、备注等</em><i><svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></i></summary>',
      '<div class="uc-form-grid">',
      formField({ name: 'invoiceAddress', label: '公司地址', placeholder: '请输入营业执照登记地址', maxlength: 80 }),
      formField({ name: 'invoicePhone', label: '公司电话', placeholder: '请输入登记电话，如 010-62345678', maxlength: 24 }),
      formField({ name: 'invoiceBank', label: '开户银行', placeholder: '请输入开户银行全称', maxlength: 60 }),
      formField({ name: 'invoiceBankNo', label: '开户行账号', placeholder: '请输入开户行账号', maxlength: 32 }),
      '<label class="uc-field uc-field-wide"><textarea name="invoiceRemark" rows="2" maxlength="120" placeholder="如需指定开票要求，请在此说明"></textarea></label>',
      '</div>',
      '</details>',
      '<div class="uc-form-error" id="ucInvoiceError" hidden></div>'
    ].join('');
  }

  function openInvoiceForm(orders) {
    const list = Array.isArray(orders) ? orders.filter(Boolean) : [orders].filter(Boolean);
    if (!list.length) return;
    state.invoiceOrders = list;
    state.invoiceType = list[0].invoiceType === '专用发票' ? '专用发票' : '普通发票';
    formBody.innerHTML = invoiceFormHtml(list);
    // 回填已保存的申请信息（复用同一抬头再次申请的场景）
    ['invoiceCompany', 'invoiceTaxNo', 'invoiceAddress', 'invoicePhone', 'invoiceBank', 'invoiceBankNo', 'invoiceRemark'].forEach((name) => {
      const field = formBody.querySelector(`[name="${name}"]`);
      if (field && list[0][name] && list[0][name] !== '--') field.value = list[0][name];
    });
    setFormSubmitting(false);
    formLayer.classList.add('is-open');
    formLayer.setAttribute('aria-hidden', 'false');
    const first = formBody.querySelector('input[name="invoiceCompany"]');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function closeInvoiceForm() {
    state.invoiceOrders = [];
    formLayer.classList.remove('is-open');
    formLayer.setAttribute('aria-hidden', 'true');
  }

  function setFormSubmitting(value) {
    const button = formLayer.querySelector('#ucInvoiceSubmit');
    if (!button) return;
    button.disabled = value;
    button.textContent = value ? '提交中…' : '提交申请';
  }

  function showFormError(message) {
    const box = formBody.querySelector('#ucInvoiceError');
    if (!box) return;
    box.textContent = message;
    box.hidden = !message;
  }

  function readFormValues() {
    const values = {};
    formBody.querySelectorAll('[name]').forEach((field) => {
      if (field.type === 'radio' && !field.checked) return;
      values[field.name] = (field.value || '').trim();
    });
    return values;
  }

  function submitInvoice() {
    const list = state.invoiceOrders.length ? state.invoiceOrders : [];
    if (!list.length) return;
    const values = readFormValues();
    if (!values.invoiceCompany) { showFormError('请填写公司名称（发票抬头）'); return; }
    if (values.invoiceCompany.length < 4) { showFormError('公司名称至少 4 个字符，请填写营业执照上的完整名称'); return; }
    if (!values.invoiceTaxNo) { showFormError('请填写纳税人识别号'); return; }
    if (!/^[0-9A-Z]{15,20}$/i.test(values.invoiceTaxNo)) { showFormError('纳税人识别号应为 15-20 位数字或字母'); return; }
    showFormError('');
    setFormSubmitting(true);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // 多笔订单合并申请时共享同一个发票组号，后台可整组开具
    const groupId = list.length > 1 ? `INV-USER-${Date.now()}` : '';
    let failed = 0;
    list.forEach((order) => {
      const patch = {
        id: order.id,
        invoiceStatus: 'pending',
        invoiceType: values.invoiceType || '普通发票',
        invoiceCompany: values.invoiceCompany,
        invoiceTaxNo: values.invoiceTaxNo.toUpperCase(),
        invoiceFormat: values.invoiceFormat || 'PDF格式',
        invoiceAddress: values.invoiceAddress || '--',
        invoicePhone: values.invoicePhone || '--',
        invoiceBank: values.invoiceBank || '--',
        invoiceBankNo: values.invoiceBankNo || '--',
        invoiceRemark: values.invoiceRemark || (values.invoiceType === '专用发票' ? '用户在线申请增值税专用发票。' : '用户在线申请增值税普通发票。'),
        invoiceApplyTime: stamp
      };
      if (groupId) patch.invoiceGroupId = groupId;
      if (!saveOrder(patch)) failed += 1;
    });
    setFormSubmitting(false);
    if (failed) { showFormError('部分订单数据已变化，请关闭后刷新页面重试'); return; }
    closeInvoiceForm();
    closeDetail();
    state.selected = [];
    refreshNav();
    renderPanel();
    notify(list.length > 1 ? `已提交 ${list.length} 笔订单的发票申请，状态更新为「申请中」` : '发票申请已提交，状态更新为「申请中」');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    nav.addEventListener('click', (event) => {
      // 安全中心标题：仅展开 / 收起二级入口，不切换页面
      const toggle = event.target.closest('[data-uc-security-toggle]');
      if (toggle) {
        const list = wrap.querySelector('#ucSecurityList');
        const collapsed = !list.hidden;
        list.hidden = collapsed;
        toggle.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        return;
      }
      const button = event.target.closest('[data-uc-view]');
      if (!button) return;
      state.view = button.dataset.ucView;
      state.expandedNotice = null;
      closeDetail();
      closeInvoiceForm();
      refreshNav();
      renderPanel();
      // 切换左侧导航时回到内容区顶部：只重置滚动容器，不动页面偏移，
      // 否则 scrollIntoView 会把内容顶到吸顶导航下方，造成「间距忽大忽小」
      resetScroll();
    });

    main.addEventListener('click', (event) => {
      const orderTab = event.target.closest('[data-uc-order-tab]');
      if (orderTab) {
        state.orderTab = orderTab.dataset.ucOrderTab;
        state.selected = [];
        renderOrders();
        return;
      }
      const serviceTab = event.target.closest('[data-uc-service-tab]');
      if (serviceTab) {
        state.serviceTab = serviceTab.dataset.ucServiceTab;
        renderServices();
        return;
      }
      // 服务名称 = 产业链名称：点击后跳转到对应产业链图谱详情
      const chainLink = event.target.closest('[data-uc-chain]');
      if (chainLink) {
        if (typeof window.WuduOpenChainDetail === 'function') {
          // 「服务中」代表该链已开通，登记授权后不再弹开通服务窗；
          // 已过期项目仍按未开通处理，保留提示弹窗（弹窗用服务原名）
          const service = allServices().find((item) => item.name === chainLink.dataset.ucChain);
          const activeService = Boolean(service && service.daysLeft >= 0);
          window.WuduOpenChainDetail(chainLink.dataset.ucChain, { activeService });
        }
        return;
      }
      const serviceDetail = event.target.closest('[data-uc-service-detail]');
      if (serviceDetail) {
        const service = allServices().find((item) => item.key === serviceDetail.dataset.ucServiceDetail);
        if (service) openServiceDetail(service);
        return;
      }
      const serviceRenew = event.target.closest('[data-uc-service-renew]');
      if (serviceRenew) {
        const service = allServices().find((item) => item.key === serviceRenew.dataset.ucServiceRenew);
        if (service) renewService(service);
        return;
      }
      const noticeTab = event.target.closest('[data-uc-notice-tab]');
      if (noticeTab) {
        state.noticeTab = noticeTab.dataset.ucNoticeTab;
        state.expandedNotice = null;
        renderNotices();
        return;
      }
      const agreementTab = event.target.closest('[data-uc-agreement]');
      if (agreementTab) {
        state.agreement = agreementTab.dataset.ucAgreement;
        renderAgreement();
        return;
      }
      if (event.target.closest('#ucReadAll')) {
        saveReadIds(NOTICE_SEEDS.map((item) => item.id));
        refreshNav();
        renderNotices();
        notify('已将全部通知标为已读');
        return;
      }
      const noticeRow = event.target.closest('[data-uc-notice]');
      if (noticeRow) {
        const id = noticeRow.dataset.ucNotice;
        state.expandedNotice = state.expandedNotice === id ? null : id;
        markRead(id);
        refreshNav();
        renderNotices();
        return;
      }
      const detailButton = event.target.closest('[data-uc-order-detail]');
      if (detailButton) {
        const order = allOrders().find((item) => item.id === detailButton.dataset.ucOrderDetail);
        if (order) openDetail(order);
        return;
      }
      // 申请发票：仅「已支付 + 未申请」的订单会出现该入口
      const applyButton = event.target.closest('[data-uc-invoice-apply]');
      if (applyButton) {
        const order = allOrders().find((item) => item.id === applyButton.dataset.ucInvoiceApply);
        if (!order) return;
        if (order.status !== 'paid') { notify('订单完成支付后方可申请发票'); return; }
        if ((order.invoiceStatus || 'none') !== 'none') { notify('该订单已提交发票申请，请勿重复提交'); renderOrders(); return; }
        openInvoiceForm([order]);
        return;
      }
      // 批量合并申请发票
      if (event.target.closest('#ucBatchInvoice')) {
        const picked = allOrders().filter((order) => state.selected.indexOf(order.id) >= 0 && isInvoiceSelectable(order));
        if (!picked.length) { notify('请先勾选需要开票的订单'); return; }
        openInvoiceForm(picked);
        return;
      }
      if (event.target.closest('#ucBatchClear')) {
        state.selected = [];
        renderOrders();
        return;
      }
      const invoiceButton = event.target.closest('[data-uc-order-invoice]');
      if (invoiceButton) {
        const order = allOrders().find((item) => item.id === invoiceButton.dataset.ucOrderInvoice);
        if (order) openDetail(order);
        return;
      }
      const payButton = event.target.closest('[data-uc-order-pay]');
      if (payButton) {
        const order = allOrders().find((item) => item.id === payButton.dataset.ucOrderPay);
        if (!order) return;
        const name = (Array.isArray(order.items) && order.items[0] && order.items[0].name) || '';
        if (window.WuduAuth && typeof window.WuduAuth.payForChain === 'function') window.WuduAuth.payForChain(name);
        else notify('演示环境暂不支持在线支付，请联系客服');
        return;
      }
      const accountButton = event.target.closest('[data-uc-account]');
      if (accountButton) {
        if (window.WuduAuth && typeof window.WuduAuth.openAccountSetting === 'function') {
          window.WuduAuth.openAccountSetting(accountButton.dataset.ucAccount);
        } else {
          notify('账号设置弹窗未加载，请刷新后重试');
        }
      }
    });

    // 订单勾选：整行高亮 + 批量操作条实时更新
    main.addEventListener('change', (event) => {
      const pickAll = event.target.closest('#ucPickAll');
      if (pickAll) {
        const visible = allOrders().filter((order) => {
          if (state.orderTab === 'pending') return false;
          if (state.orderTab === 'invoice') return order.status === 'paid' && (order.invoiceStatus || 'none') !== 'done';
          return order.status === 'paid';
        }).filter(isInvoiceSelectable);
        state.selected = pickAll.checked ? visible.map((order) => order.id) : [];
        renderOrders();
        return;
      }
      const pick = event.target.closest('[data-uc-order-pick]');
      if (!pick) return;
      const id = pick.dataset.ucOrderPick;
      const index = state.selected.indexOf(id);
      if (pick.checked && index < 0) state.selected.push(id);
      if (!pick.checked && index >= 0) state.selected.splice(index, 1);
      renderOrders();
    });

    // 发票申请表单：切换普票 / 专票时重绘
    formBody.addEventListener('change', (event) => {
      const radio = event.target.closest('input[name="invoiceType"]');
      if (!radio) return;
      if (!state.invoiceOrders.length) return;
      const draft = readFormValues();
      state.invoiceType = radio.value;
      formBody.innerHTML = invoiceFormHtml(state.invoiceOrders);
      Object.keys(draft).forEach((name) => {
        if (name === 'invoiceType') return;
        const field = formBody.querySelector(`[name="${name}"]`);
        if (field && draft[name]) field.value = draft[name];
      });
      showFormError('');
    });

    formLayer.addEventListener('click', (event) => {
      if (event.target === formLayer) { closeInvoiceForm(); return; }
      if (event.target.closest('#ucInvoiceSubmit')) submitInvoice();
      if (event.target.closest('#ucInvoiceCancel')) closeInvoiceForm();
    });

    wrap.querySelector('#ucDetailClose').addEventListener('click', closeDetail);
    wrap.querySelector('#ucDetailOk').addEventListener('click', (event) => {
      // 服务详情里的「立即续费」按钮复用同一底部按钮
      const renewKey = event.currentTarget.dataset.ucRenewFrom;
      if (renewKey) {
        const service = allServices().find((item) => item.key === renewKey);
        event.currentTarget.dataset.ucRenewFrom = '';
        event.currentTarget.textContent = '知道了';
        if (service) { renewService(service); return; }
      }
      closeDetail();
    });
    detailLayer.addEventListener('click', (event) => {
      if (event.target === detailLayer) closeDetail();
    });

    // ESC：先关发票表单 → 再关详情弹窗（账号弹窗由登录模块自行处理，此处不拦截）
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      if (formLayer.classList.contains('is-open')) {
        closeInvoiceForm();
        event.stopImmediatePropagation();
        return;
      }
      if (detailLayer.classList.contains('is-open')) {
        closeDetail();
        event.stopImmediatePropagation();
        return;
      }
      const blocking = document.querySelector('.account-dialog-layer.is-open, .auth-login-view.is-open, .pay-dialog-layer.is-open');
      if (blocking) return;
      setView('home');
      event.stopImmediatePropagation();
    }, true);

    // 账号弹窗操作成功后同步刷新
    document.addEventListener('wudu-account-updated', () => {
      if (!isOpen()) return;
      refreshIdentity();
      refreshNav();
      renderPanel();
    });

    document.addEventListener('wudu-auth-change', (event) => {
      if (!isOpen()) return;
      if (!event.detail || !event.detail.phone) { setView('home'); return; }
      refreshIdentity();
      renderPanel();
    });

    // 使用顶部导航离开个人中心时关闭内部弹层
    document.querySelectorAll('.primary-nav-item[data-view]').forEach((item) => item.addEventListener('click', () => {
      closeDetail();
      closeInvoiceForm();
    }));
  }

  /* ---------- 开关 ---------- */
  function isOpen() {
    return Boolean(panel && panel.classList.contains('active'));
  }

  function open(view) {
    const user = currentUser();
    if (!user) {
      if (window.WuduAuth) window.WuduAuth.openLogin();
      return;
    }
    if (view) state.view = view;
    // 「我的服务」默认展示服务中项目（已过期是次要信息，需主动切换查看）
    if (state.view === 'services') state.serviceTab = 'active';
    state.expandedNotice = null;
    closeDetail();
    closeInvoiceForm();
    refreshIdentity();
    refreshNav();
    renderPanel();
    setView('user-center');
  }

  function close() {
    closeDetail();
    closeInvoiceForm();
    setView('home');
  }

  function boot() {
    panel = document.getElementById('userCenterView');
    if (!panel) return;
    wrap = panel.querySelector('#ucWrap');
    main = panel.querySelector('#ucMain');
    nav = panel.querySelector('#ucNav');
    detailLayer = panel.querySelector('#ucDetailLayer');
    detailBody = panel.querySelector('#ucDetailBody');
    detailTitle = panel.querySelector('#ucDetailTitle');
    noticeBadge = panel.querySelector('#ucNoticeBadge');

    // 发票申请表：浮于个人中心内容之上，但不高于登录 / 账号弹窗层级
    formLayer = document.createElement('div');
    formLayer.className = 'uc-form-layer';
    formLayer.id = 'ucInvoiceLayer';
    formLayer.setAttribute('aria-hidden', 'true');
    formLayer.innerHTML = [
      '<div class="uc-form-dialog" role="dialog" aria-modal="true" aria-labelledby="ucInvoiceTitle">',
      '<div class="uc-form-head"><div><strong id="ucInvoiceTitle">申请开具发票</strong><p>填写开票信息后提交，财务将在 1-3 个工作日内处理</p></div>',
      '<button type="button" class="uc-detail-close" id="ucInvoiceClose" aria-label="关闭">×</button></div>',
      '<div class="uc-form-body" id="ucInvoiceBody"></div>',
      '<div class="uc-form-foot"><span class="uc-form-tip">提交后可在「我的订单 · 发票管理」查看进度</span>',
      '<button type="button" class="uc-btn ghost" id="ucInvoiceCancel">取消</button>',
      '<button type="button" class="uc-btn primary" id="ucInvoiceSubmit">提交申请</button></div>',
      '</div>'
    ].join('');
    wrap.appendChild(formLayer);
    formBody = formLayer.querySelector('#ucInvoiceBody');
    formLayer.querySelector('#ucInvoiceClose').addEventListener('click', closeInvoiceForm);

    bindEvents();

    window.WuduUserCenter = {
      open,
      close,
      isOpen,
      recordPurchase,
      refresh: () => {
        if (!isOpen()) return;
        refreshIdentity();
        refreshNav();
        renderPanel();
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
