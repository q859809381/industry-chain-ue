/* 五度易链 · 运营管理后台（演示原型）
 * 数据存储：localStorage（与前台共用 wudu-industry-users / wudu-industry-user）
 * 图谱配置键：wudu-admin-graph-config（前台 app.js 读取，控制卡片隐藏/热门标签/排序）
 * 热搜词键：wudu-admin-hot-searches
 */
(function () {
  'use strict';

  const USER_KEY = 'wudu-industry-user';
  const USERS_KEY = 'wudu-industry-users';
  const GRAPH_KEY = 'wudu-admin-graph-config';
  const HOTSEARCH_KEY = 'wudu-admin-hot-searches';
  const ACCOUNTS_KEY = 'wudu-admin-accounts';
  const ROLES_KEY = 'wudu-admin-roles';
  const PRICE_KEY = 'wudu-admin-chain-price';

  /* ---------- 登录 / 权限守卫 ---------- */
  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (error) { currentUser = null; }
  if (!currentUser || !currentUser.phone) {
    location.replace('../index.html');
    return;
  }
  if (!currentUser.admin) {
    document.body.innerHTML = '<div class="admin-no-perm"><h2>暂无运营管理权限</h2><p>当前账号未开通运营管理后台功能，请联系平台管理员开通。</p><a class="admin-btn admin-btn-primary" href="../index.html" style="text-decoration:none">返回前台</a></div>';
    return;
  }

  /* ---------- 工具 ---------- */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ---------- 列表时间列排序：默认 → 正序 → 倒序 → 默认 ---------- */
  const tableSortState = { 'price-updated': 'default', 'user-reg': 'default', 'account-login': 'default', 'role-created': 'default', 'order-time': 'desc' };
  const tableSortCycle = { default: 'asc', asc: 'desc', desc: 'default' };
  const sortDirection = (key) => (tableSortState[key] === 'asc' ? 1 : -1);
  function updateTableSortButtons() {
    $$('[data-table-sort]').forEach((button) => {
      const state = tableSortState[button.dataset.tableSort] || 'default';
      button.classList.toggle('is-default', state === 'default');
      button.classList.toggle('is-ascending', state === 'asc');
      button.classList.toggle('is-descending', state === 'desc');
      const th = button.closest('th');
      if (th) th.setAttribute('aria-sort', state === 'default' ? 'none' : state === 'asc' ? 'ascending' : 'descending');
      const label = button.textContent.trim();
      button.title = state === 'default' ? `${label}：默认顺序，点击按时间正序` : state === 'asc' ? `${label}：时间正序，点击倒序` : `${label}：时间倒序，点击恢复默认`;
    });
  }

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (error) { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  /* ---------- 产业图谱草稿配置（编辑只改草稿，点「保存」后写入、前端才生效） ---------- */
  // 默认热门：「六大未来产业」（最具前景·热门赛道）整组默认热门，后台未保存过配置时生效
  function seedDefaultHot(config) {
    (Array.isArray(nationalIndustryCatalog) ? nationalIndustryCatalog : []).forEach((entry) => {
      if (entry.type === '六大未来产业') config.chainHot[entry.name] = ['热门'];
    });
    return config;
  }
  let graphConfig = readJson(GRAPH_KEY, null);
  if (graphConfig) {
    graphConfig = Object.assign({ hiddenChains: [], hiddenGroups: [], chainHot: {}, chainIcon: {}, chainOrder: {}, groupOrder: [] }, graphConfig);
    // 旧配置迁移：无 hotSeeded 标记（热门功能上线前保存过）也补默认热门
    if (!graphConfig.hotSeeded) seedDefaultHot(graphConfig);
  } else {
    graphConfig = seedDefaultHot({ hiddenChains: [], hiddenGroups: [], chainHot: {}, chainIcon: {}, chainOrder: {}, groupOrder: [] });
  }
  const sortKeys = (obj) => { const out = {}; Object.keys(obj).sort().forEach((key) => { out[key] = obj[key]; }); return out; };
  function configSnapshot(config) {
    return JSON.stringify({
      hiddenChains: [...(config.hiddenChains || [])],
      hiddenGroups: [...(config.hiddenGroups || [])],
      chainHot: sortKeys(config.chainHot || {}),
      chainIcon: sortKeys(config.chainIcon || {}),
      chainOrder: sortKeys(config.chainOrder || {}),
      groupOrder: [...(config.groupOrder || [])]
    });
  }
  let savedGraphConfig = configSnapshot(graphConfig);
  function isGraphDraftDirty() { return configSnapshot(graphConfig) !== savedGraphConfig; }
  function updateGraphSaveState() {
    const button = $('#graphSave');
    if (!button) return;
    const dirty = isGraphDraftDirty();
    button.disabled = !dirty;
    button.title = dirty ? '有未保存的修改' : '';
  }
  function saveGraphChanges() {
    if (!isGraphDraftDirty()) return;
    graphConfig.hotSeeded = true; // 已保存过即以运营配置为准，默认热门不再播种
    writeJson(GRAPH_KEY, graphConfig);
    savedGraphConfig = configSnapshot(graphConfig);
    updateGraphSaveState();
    toast('已保存，前端产业图谱页生效');
  }

  let toastTimer = null;
  function toast(message) {
    const element = $('#adminToast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2200);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* ---------- 顶栏账号 ---------- */
  function resolveAdminName() {
    let accounts = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
      if (Array.isArray(parsed)) accounts = parsed;
    } catch (error) { accounts = []; }
    const matched = accounts.find((item) => item.phone && String(item.phone) === String(currentUser.phone))
      || accounts.find((item) => item.account && (item.account === currentUser.account || item.account === currentUser.username));
    return matched?.name || currentUser.name || currentUser.username || currentUser.phone;
  }
  function updateAdminHeader() {
    const name = resolveAdminName();
    $('#adminAccount').textContent = name;
    $('#adminAccount').title = name;
  }
  updateAdminHeader();

  const adminUserMenuBtn = $('#adminUserMenuBtn');
  const adminUserPopover = $('#adminUserPopover');
  function closeAdminUserMenu() {
    adminUserPopover.hidden = true;
    adminUserMenuBtn.setAttribute('aria-expanded', 'false');
  }
  adminUserMenuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = adminUserPopover.hidden;
    adminUserPopover.hidden = !willOpen;
    adminUserMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest && !event.target.closest('#adminUserMenu')) closeAdminUserMenu();
  });
  $('#adminLogout').addEventListener('click', () => {
    localStorage.removeItem(USER_KEY);
    location.replace('../index.html');
  });

  /* ---------- 导航切换（面包屑 + 页面动作） ---------- */
  const pageTitles = {
    'graph-display': '产业链展示',
    'graph-price': '产业链价格',
    home: '首页管理',
    users: '用户管理',
    orders: '订单管理',
    'account-manage': '管理员账号',
    'role-manage': '角色管理'
  };
  const groupLabels = { graph: '图谱管理', perms: '权限管理' };
  const pageActionRenderers = {
    'graph-display': () => '<button type="button" class="admin-btn admin-btn-primary" id="graphSave" disabled title="">保存</button>',
    'graph-price': () => '',
    home: () => '<button type="button" class="admin-btn admin-btn-primary" id="hotwordSave" disabled title="">保存</button>',
    users: () => '<button type="button" class="admin-btn admin-btn-primary" id="userAdd">+ 添加账号</button>',
    'account-manage': () => '<button type="button" class="admin-btn admin-btn-primary" id="accountAdd">+ 新增账号</button>',
    'role-manage': () => '<button type="button" class="admin-btn admin-btn-primary" id="roleAdd">+ 创建角色</button>'
  };
  function bindPageActions(view) {
    const save = $('#graphSave');
    if (save) save.addEventListener('click', saveGraphChanges);
    const hotwordSave = $('#hotwordSave');
    if (hotwordSave) hotwordSave.addEventListener('click', saveHotWords);
    const add = $('#accountAdd');
    if (add) add.addEventListener('click', openAccountDialog);
    const userAdd = $('#userAdd');
    if (userAdd) userAdd.addEventListener('click', openUserAddDialog);
    const roleAdd = $('#roleAdd');
    if (roleAdd) roleAdd.addEventListener('click', () => openRoleDialog());
    if (view === 'graph-display') updateGraphSaveState();
    if (view === 'home') updateHotwordSaveState();
  }
  /* 面包屑：二级页面显示「运营管理后台 / 图谱管理 / 产业链展示」或「运营管理后台 / 权限管理 / 管理员账号」 */
  function updateBreadcrumb(view) {
    const breadcrumb = $('#adminBreadcrumb');
    if (!breadcrumb) return;
    const parentView = view.startsWith('graph') ? 'graph' : (view === 'account-manage' || view === 'role-manage') ? 'perms' : '';
    const parts = ['<em>运营管理后台</em>'];
    if (parentView) parts.push(`<i>/</i><span>${escapeHtml(groupLabels[parentView])}</span>`);
    parts.push(`<i>/</i><b>${escapeHtml(pageTitles[view] || '')}</b>`);
    breadcrumb.innerHTML = parts.join('');
  }
  /* 二级菜单分组：点击子项会同步展开父级并高亮 */
  const GROUP_VIEWS = { graph: ['graph-display', 'graph-price'], perms: ['account-manage', 'role-manage'] };
  function activateView(view) {
    $$('[data-admin-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.adminView === view));
    $$('.admin-view').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.adminPanel === view));
    Object.entries(GROUP_VIEWS).forEach(([group, views]) => {
      const parent = $('#adminNav').querySelector(`[data-nav-group="${group}"]`);
      const sub = $(`#${group}SubNav`);
      const active = views.includes(view);
      if (!parent) return;
      parent.classList.toggle('is-active', active);
      // 进入分组下的任一页面时自动展开二级菜单
      if (active) {
        parent.classList.add('is-open');
        parent.setAttribute('aria-expanded', 'true');
        if (sub) sub.hidden = false;
      }
    });
    $('#adminPageTitle').textContent = pageTitles[view] || '';
    updateBreadcrumb(view);
    const actions = $('#adminPageActions');
    if (actions) { actions.innerHTML = (pageActionRenderers[view] || (() => ''))(); bindPageActions(view); }
    if (view === 'graph-price') renderPriceTable();
    if (view === 'orders') renderOrders();
  }
  $$('[data-admin-view]').forEach((button) => {
    button.addEventListener('click', () => activateView(button.dataset.adminView));
  });
  // 一级导航（图谱管理）：折叠 / 展开二级菜单
  $$('.admin-nav-parent').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.navGroup;
      if (!group) return;
      // 已展开则收起；收起时若当前就在该分组，不切换页面，仅折叠
      const sub = $(`#${group}SubNav`);
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.classList.toggle('is-open', !expanded);
      if (sub) sub.hidden = expanded;
    });
  });
  // 初始页面动作
  (function initPageActions() {
    activateView('graph-display');
  })();

  /* ============================================================
   * 一、产业图谱管理
   * ============================================================ */
  const INDUSTRY_TYPE_ORDER = ['六大未来产业', '六大新兴支柱产业', '六张网'];

  /* 卡片图标：本地上传图片（压缩为 96×96 PNG dataURL 存入配置） */
  const ICON_MAX_INPUT_SIZE = 5 * 1024 * 1024; // 原始文件上限 5MB
  function iconPreviewHtml(value) {
    if (value && String(value).startsWith('data:image/')) return `<img src="${value}" alt="" />`;
    return '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>';
  }
  function compressIconImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('请选择图片文件'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('图片文件不能超过 5MB'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('图片解析失败'));
        image.onload = () => {
          const size = 96;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / image.width, size / image.height);
          const drawWidth = image.width * scale;
          const drawHeight = image.height * scale;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
          resolve(canvas.toDataURL('image/png'));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function iconCellHtml(name, value, kind) {
    const hasIcon = Boolean(value && String(value).startsWith('data:image/'));
    return `<span class="admin-icon-cell" data-icon-cell="${escapeHtml(name)}" data-icon-kind="${kind}">
      <span class="admin-icon-preview">${iconPreviewHtml(value)}</span>
      <button type="button" class="admin-btn admin-btn-mini" data-icon-upload="${escapeHtml(name)}">上传</button>
      ${hasIcon ? `<button type="button" class="admin-btn admin-btn-mini admin-btn-plain" data-icon-clear="${escapeHtml(name)}" title="清除图标">清除</button>` : ''}
      <input type="file" accept="image/*" hidden data-icon-file="${escapeHtml(name)}" />
    </span>`;
  }
  function bindIconCells(root, kind) {
    $$(`[data-icon-kind="${kind}"]`, root).forEach((cell) => {
      const name = cell.dataset.iconCell;
      const fileInput = $('input[type="file"]', cell);
      $('[data-icon-upload]', cell).addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
          graphConfig.chainIcon[name] = await compressIconImage(file);
          updateGraphSaveState();
          renderGraphTables();
          if (kind === 'dialog' && groupChainsLayer.classList.contains('is-open')) renderGroupChainsDialog();
          toast('图标已上传，点击「保存」后生效');
        } catch (error) {
          toast(error.message || '图片处理失败');
        }
      });
      const clear = $('[data-icon-clear]', cell);
      if (clear) {
        clear.addEventListener('click', () => {
          delete graphConfig.chainIcon[name];
          updateGraphSaveState();
          renderGraphTables();
          if (kind === 'dialog' && groupChainsLayer.classList.contains('is-open')) renderGroupChainsDialog();
          toast('已清除图标，点击「保存」后生效');
        });
      }
    });
  }
  // 默认分组数据（与前端图谱页一致的顺序：三大体系 + 21 大类）
  const nationalCatalog = typeof nationalIndustryCatalog !== 'undefined' ? nationalIndustryCatalog : [];
  const categoryData = typeof industryCategoryGroups !== 'undefined' ? industryCategoryGroups : [];
  const defaultGroups = (() => {
    const groups = INDUSTRY_TYPE_ORDER.map((type) => ({ value: type, label: type, kind: 'system', chains: [] }));
    nationalCatalog.forEach((entry) => {
      const group = groups.find((item) => item.value === entry.type);
      if (group && !group.chains.includes(entry.name)) group.chains.push(entry.name);
    });
    categoryData.forEach((category) => {
      groups.push({ value: category.name, label: category.name, kind: 'category', chains: [...new Set(category.chains)] });
    });
    return groups;
  })();

  // 某分类当前的链顺序（未配置过时用默认顺序）
  function chainOrderOf(group) {
    const configured = graphConfig.chainOrder[group.value];
    if (Array.isArray(configured) && configured.length) {
      // 已删除/新增的链并入列表尾部
      return [...configured.filter((name) => group.chains.includes(name)), ...group.chains.filter((name) => !configured.includes(name))];
    }
    return [...group.chains];
  }

  function moveChain(group, name, offset) {
    const order = chainOrderOf(group);
    const index = order.indexOf(name);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= order.length) return;
    order.splice(target, 0, order.splice(index, 1)[0]);
    graphConfig.chainOrder[group.value] = order;
    updateGraphSaveState();
    renderGraphTables();
  }

  // 分类顺序规范化：三大产业体系固定占据前 3 位（内部可互换），其余分类排在其后
  function orderedGroupValues() {
    const configured = Array.isArray(graphConfig.groupOrder) && graphConfig.groupOrder.length
      ? [...graphConfig.groupOrder.filter((v) => defaultGroups.some((g) => g.value === v)), ...defaultGroups.filter((g) => !graphConfig.groupOrder.includes(g.value)).map((g) => g.value)]
      : defaultGroups.map((g) => g.value);
    // 三大产业体系在前 3 位，但内部顺序尊重配置（未配置的体系排在已配置之后）
    const systemValues = [
      ...configured.filter((value) => INDUSTRY_TYPE_ORDER.includes(value)),
      ...INDUSTRY_TYPE_ORDER.filter((value) => !configured.includes(value)),
    ];
    const restValues = configured.filter((value) => !INDUSTRY_TYPE_ORDER.includes(value));
    return [...systemValues, ...restValues];
  }
  function isSystemGroup(value) { return INDUSTRY_TYPE_ORDER.includes(value); }

  function moveGroup(value, offset) {
    const order = orderedGroupValues();
    const index = order.indexOf(value);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= order.length) return;
    // 三大产业体系限定在前 3 位互换；其他分类只能在第 4 位及以后
    if (isSystemGroup(value) && target > INDUSTRY_TYPE_ORDER.length - 1) { toast('三大产业体系固定在前 3 位，不能与其他分类互换'); return; }
    if (!isSystemGroup(value) && target < INDUSTRY_TYPE_ORDER.length) { toast('三大产业体系固定在前 3 位，其他分类不能排到其前面'); return; }
    order.splice(target, 0, order.splice(index, 1)[0]);
    graphConfig.groupOrder = order;
    updateGraphSaveState();
    renderGraphTables();
  }

  // 扁平表格渲染：分类顺序表 + 产业链卡片维护表（无分组大卡片）
  // minIndex/maxIndex 限定可移动范围（不传则按首尾判断）
  function orderBtns(kind, groupValue, name, index, total, minIndex, maxIndex) {
    const min = Number.isInteger(minIndex) ? minIndex : 0;
    const max = Number.isInteger(maxIndex) ? maxIndex : total - 1;
    return `<span class="admin-cell-actions">
      <button type="button" class="admin-row-btn" title="上移" data-${kind}-move="up" data-group="${escapeHtml(groupValue)}" data-name="${escapeHtml(name || '')}" ${index <= min ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>
      <button type="button" class="admin-row-btn" title="下移" data-${kind}-move="down" data-group="${escapeHtml(groupValue)}" data-name="${escapeHtml(name || '')}" ${index >= max ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg></button>
    </span>`;
  }

  function renderGraphTables() {
    // 组顺序：三大产业体系固定前 3 位
    const orderedGroups = orderedGroupValues().map((value) => defaultGroups.find((group) => group.value === value)).filter(Boolean);
    const systemCount = INDUSTRY_TYPE_ORDER.length;

    // 分类顺序表：序号 / 分类名称 / 产业链管理(数字+管理图标) / 可见性(开关) / 操作(上移、下移)
    $('#groupTableBody').innerHTML = orderedGroups.map((group, groupIndex) => {
      const hiddenGroup = (graphConfig.hiddenGroups || []).includes(group.value);
      const isSystem = isSystemGroup(group.value);
      // 三大体系只能在 0~2 区间移动，其他分类只能在 systemCount~末尾
      const minIndex = isSystem ? 0 : systemCount;
      const maxIndex = isSystem ? systemCount - 1 : orderedGroups.length - 1;
      return `<tr class="${hiddenGroup ? 'admin-chain-hidden' : ''}">
        <td class="td-sub">${groupIndex + 1}</td>
        <td><strong>${escapeHtml(group.label)}</strong>${isSystem ? '<span class="admin-group-badge">产业体系</span>' : ''}</td>
        <td><span class="admin-count-num">${group.chains.length}</span> 条 <button type="button" class="admin-row-btn" title="管理产业链" data-group-manage="${escapeHtml(group.value)}"><svg viewBox="0 0 24 24"><path d="M4 6h10M4 12h10M4 18h10"/><circle cx="18" cy="6" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg></button></td>
        <td>
          <label class="admin-switch"><input type="checkbox" data-group-visible-switch="${escapeHtml(group.value)}" ${hiddenGroup ? '' : 'checked'} /><i></i></label>
          <span class="admin-switch-label" data-group-switch-label="${escapeHtml(group.value)}">${hiddenGroup ? '隐藏' : '显示'}</span>
        </td>
        <td>${orderBtns('group', group.value, '', groupIndex, orderedGroups.length, minIndex, maxIndex)}</td>
      </tr>`;
    }).join('');

    // 图谱列表（按分类顺序展开为扁平行，仅展示顺序、不提供排序操作）
    let chainSeq = 0;
    $('#chainTableBody').innerHTML = orderedGroups.map((group) => {
      const order = chainOrderOf(group);
      return order.map((name) => {
        chainSeq += 1;
        const hidden = graphConfig.hiddenChains.includes(name);
        const iconId = graphConfig.chainIcon[name] || '';
        const isHot = (graphConfig.chainHot[name] || []).length > 0;
        return `<tr class="${hidden ? 'admin-chain-hidden' : ''}">
          <td class="td-sub">${chainSeq}</td>
          <td><span class="admin-chain-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span></td>
          <td class="td-sub">${escapeHtml(group.label)}</td>
          <td>
            ${iconCellHtml(name, iconId, 'main')}
          </td>
          <td>
            <label class="admin-switch"><input type="checkbox" data-hot-switch="${escapeHtml(name)}" ${isHot ? 'checked' : ''} /><i></i></label>
            <span class="admin-switch-label" data-hot-switch-label="${escapeHtml(name)}">${isHot ? '热门' : '常规'}</span>
          </td>
          <td>
            <label class="admin-switch"><input type="checkbox" data-visible-switch="${escapeHtml(name)}" ${hidden ? '' : 'checked'} /><i></i></label>
            <span class="admin-switch-label" data-switch-label="${escapeHtml(name)}">${hidden ? '隐藏' : '显示'}</span>
          </td>
        </tr>`;
      }).join('');
    }).join('');
    bindGraphEvents();
  }

  // 图谱管理页签切换：分类列表 / 图谱列表
  $$('#graphTabs .admin-tab').forEach((button) => {
    button.addEventListener('click', () => {
      $$('#graphTabs .admin-tab').forEach((item) => item.classList.toggle('is-active', item === button));
      const tab = button.dataset.graphTab;
      $('#graphGroupsBlock').hidden = tab !== 'groups';
      $('#graphChainsBlock').hidden = tab !== 'chains';
    });
  });

  function bindGraphEvents() {
    const chainBody = $('#chainTableBody');
    // 分类排序
    $$('[data-group-move]', $('#groupTableBody')).forEach((button) => {
      button.addEventListener('click', () => moveGroup(button.dataset.group, button.dataset.groupMove === 'up' ? -1 : 1));
    });
    // 分类可见性开关（整组对前端隐藏）
    $$('[data-group-visible-switch]', $('#groupTableBody')).forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const value = checkbox.dataset.groupVisibleSwitch;
        const list = graphConfig.hiddenGroups || (graphConfig.hiddenGroups = []);
        const hidden = !checkbox.checked;
        if (hidden && !list.includes(value)) list.push(value);
        if (!hidden) {
          const index = list.indexOf(value);
          if (index !== -1) list.splice(index, 1);
        }
        updateGraphSaveState();
        const row = checkbox.closest('tr');
        if (row) row.classList.toggle('admin-chain-hidden', hidden);
        const label = $(`[data-group-switch-label="${CSS.escape(value)}"]`, $('#groupTableBody'));
        if (label) label.textContent = hidden ? '隐藏' : '显示';
      });
    });
    // 分类产业链管理弹窗
    $$('[data-group-manage]', $('#groupTableBody')).forEach((button) => {
      button.addEventListener('click', () => openGroupChainsDialog(button.dataset.groupManage));
    });
    // 图标上传（本地图片）
    bindIconCells(chainBody, 'main');
    // 热门开关（与弹窗、前台热门角标共用 chainHot 数据：有标签即热门）
    $$('[data-hot-switch]', chainBody).forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const name = checkbox.dataset.hotSwitch;
        if (checkbox.checked) graphConfig.chainHot[name] = ['热门'];
        else delete graphConfig.chainHot[name];
        updateGraphSaveState();
        const label = $(`[data-hot-switch-label="${CSS.escape(name)}"]`, chainBody);
        if (label) label.textContent = checkbox.checked ? '热门' : '常规';
      });
    });
    // 展示 / 隐藏
    $$('[data-visible-switch]', chainBody).forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const name = checkbox.dataset.visibleSwitch;
        const hidden = !checkbox.checked;
        const list = graphConfig.hiddenChains;
        if (hidden && !list.includes(name)) list.push(name);
        if (!hidden) {
          const index = list.indexOf(name);
          if (index !== -1) list.splice(index, 1);
        }
        updateGraphSaveState();
        const row = checkbox.closest('tr');
        if (row) row.classList.toggle('admin-chain-hidden', hidden);
        const label = $(`[data-switch-label="${CSS.escape(name)}"]`, chainBody);
        if (label) label.textContent = hidden ? '隐藏' : '显示';
      });
    });
  }

  /* 分类产业链管理弹窗：序号 / 链名 / 图标 / 可见性 / 操作 */
  const groupChainsLayer = $('#groupChainsDialogLayer');
  let groupChainsCurrent = '';
  function renderGroupChainsDialog() {
    const group = defaultGroups.find((item) => item.value === groupChainsCurrent);
    if (!group) return;
    const order = chainOrderOf(group);
    $('#groupChainsDialogTitle').textContent = `「${group.label}」产业链管理（${order.length} 条）`;
    $('#groupChainsList').innerHTML = order.map((name, index) => {
      const hidden = graphConfig.hiddenChains.includes(name);
      const iconId = graphConfig.chainIcon[name] || '';
      const isHot = (graphConfig.chainHot[name] || []).length > 0;
      return `<tr class="${hidden ? 'admin-chain-hidden' : ''}">
        <td class="td-sub">${index + 1}</td>
        <td><span class="admin-chain-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span></td>
        <td>
          ${iconCellHtml(name, iconId, 'dialog')}
        </td>
        <td>
          <label class="admin-switch"><input type="checkbox" data-dialog-visible="${escapeHtml(name)}" ${hidden ? '' : 'checked'} /><i></i></label>
          <span class="admin-switch-label" data-dialog-visible-label="${escapeHtml(name)}">${hidden ? '隐藏' : '显示'}</span>
        </td>
        <td>
          <label class="admin-switch"><input type="checkbox" data-dialog-hot="${escapeHtml(name)}" ${isHot ? 'checked' : ''} /><i></i></label>
          <span class="admin-switch-label" data-dialog-hot-label="${escapeHtml(name)}">${isHot ? '热门' : '常规'}</span>
        </td>
        <td>${orderBtns('dialogchain', group.value, name, index, order.length)}</td>
      </tr>`;
    }).join('');
    const dialogBody = $('#groupChainsList');
    // 上移 / 下移
    $$('[data-dialogchain-move]', dialogBody).forEach((button) => {
      button.addEventListener('click', () => {
        moveChain(group, button.dataset.name, button.dataset.dialogchainMove === 'up' ? -1 : 1);
        renderGroupChainsDialog();
      });
    });
    // 图标上传（本地图片）
    bindIconCells(dialogBody, 'dialog');
    // 可见性开关
    $$('[data-dialog-visible]', dialogBody).forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const name = checkbox.dataset.dialogVisible;
        const hidden = !checkbox.checked;
        const list = graphConfig.hiddenChains;
        if (hidden && !list.includes(name)) list.push(name);
        if (!hidden) {
          const index = list.indexOf(name);
          if (index !== -1) list.splice(index, 1);
        }
        updateGraphSaveState();
        const row = checkbox.closest('tr');
        if (row) row.classList.toggle('admin-chain-hidden', hidden);
        const label = $(`[data-dialog-visible-label="${CSS.escape(name)}"]`, dialogBody);
        if (label) label.textContent = hidden ? '隐藏' : '显示';
        renderGraphTables();
      });
    });
    // 热门标签开关（与主表热门开关、前台热门角标共用 chainHot 数据：有标签即热门）
    $$('[data-dialog-hot]', dialogBody).forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const name = checkbox.dataset.dialogHot;
        if (checkbox.checked) graphConfig.chainHot[name] = ['热门'];
        else delete graphConfig.chainHot[name];
        updateGraphSaveState();
        const label = $(`[data-dialog-hot-label="${CSS.escape(name)}"]`, dialogBody);
        if (label) label.textContent = checkbox.checked ? '热门' : '常规';
        renderGraphTables();
      });
    });
  }
  let groupChainsBackup = null; // 打开弹窗时的配置快照，用于「取消」回滚
  function openGroupChainsDialog(value) {
    groupChainsCurrent = value;
    groupChainsBackup = JSON.parse(JSON.stringify(graphConfig));
    renderGroupChainsDialog();
    groupChainsLayer.classList.add('is-open');
    groupChainsLayer.setAttribute('aria-hidden', 'false');
  }
  function closeGroupChainsDialog() {
    groupChainsLayer.classList.remove('is-open');
    groupChainsLayer.setAttribute('aria-hidden', 'true');
    renderGraphTables();
  }
  // 取消：回滚到打开弹窗前的状态
  function cancelGroupChainsDialog() {
    if (groupChainsBackup) {
      graphConfig = JSON.parse(JSON.stringify(groupChainsBackup));
      groupChainsBackup = null;
      updateGraphSaveState();
      toast('已取消本次修改');
    }
    closeGroupChainsDialog();
  }
  // 保存：保留本次弹窗内的修改（仍需主页面右上角「保存」发布）
  function saveGroupChainsDialog() {
    groupChainsBackup = null;
    closeGroupChainsDialog();
    toast('修改已保留，点击右上角「保存」后发布生效');
  }
  $('#groupChainsDialogClose').addEventListener('click', cancelGroupChainsDialog);
  $('#groupChainsDialogCancel').addEventListener('click', cancelGroupChainsDialog);
  $('#groupChainsDialogSave').addEventListener('click', saveGroupChainsDialog);
  groupChainsLayer.addEventListener('click', (event) => { if (event.target === groupChainsLayer) cancelGroupChainsDialog(); });

  renderGraphTables();

  /* ============================================================
   * 二、首页管理（热门搜索词）
   * ============================================================ */
  const DEFAULT_HOT_WORDS = ['集成电路', '航空航天', '量子科技', '生物制造', '具身智能', '低空经济'];
  let hotWords = (() => {
    const config = readJson(HOTSEARCH_KEY, null);
    return config && Array.isArray(config.words) && config.words.length ? [...config.words] : [...DEFAULT_HOT_WORDS];
  })();
  // 草稿模式：编辑只改 hotWords（草稿），点右上角「保存」才发布
  let savedHotWords = JSON.stringify(hotWords);
  function isHotwordDraftDirty() { return JSON.stringify(hotWords) !== savedHotWords; }
  function updateHotwordSaveState() {
    const button = $('#hotwordSave');
    if (!button) return;
    const dirty = isHotwordDraftDirty();
    button.disabled = !dirty;
    button.title = dirty ? '有未保存的修改' : '';
  }

  function renderHotwords() {
    const tbody = $('#hotwordTableBody');
    tbody.innerHTML = hotWords.length ? hotWords.map((word, index) => `
      <tr>
        <td class="td-sub">${index + 1}</td>
        <td><span class="admin-chain-name" title="${escapeHtml(word)}">${escapeHtml(word)}</span></td>
        <td><span class="admin-cell-actions">
          ${orderBtns('hotword', '', word, index, hotWords.length)}
          <button type="button" class="admin-row-btn is-warn" title="删除" data-hotword-remove="${index}"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg></button>
        </span></td>
      </tr>`).join('') : '<tr><td colspan="3" class="admin-empty">暂无热门搜索词，请在下方添加</td></tr>';
    $$('[data-hotword-move]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const index = hotWords.indexOf(button.dataset.name);
        const target = index + (button.dataset.hotwordMove === 'up' ? -1 : 1);
        if (index === -1 || target < 0 || target >= hotWords.length) return;
        hotWords.splice(target, 0, hotWords.splice(index, 1)[0]);
        updateHotwordSaveState();
        renderHotwords();
      });
    });
    $$('[data-hotword-remove]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        hotWords.splice(Number(button.dataset.hotwordRemove), 1);
        updateHotwordSaveState();
        renderHotwords();
      });
    });
  }
  renderHotwords();

  $('#hotwordAdd').addEventListener('click', () => {
    const input = $('#hotwordInput');
    const value = input.value.trim();
    if (!value) return toast('请输入热门搜索词');
    if (hotWords.includes(value)) return toast('该热词已存在');
    if (hotWords.length >= 10) return toast('最多配置 10 个热门搜索词');
    hotWords.push(value);
    input.value = '';
    updateHotwordSaveState();
    renderHotwords();
  });
  $('#hotwordInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); $('#hotwordAdd').click(); }
  });
  function saveHotWords() {
    if (!isHotwordDraftDirty()) return;
    if (!hotWords.length) return toast('请至少保留一个热门搜索词');
    writeJson(HOTSEARCH_KEY, { words: [...hotWords], updatedAt: new Date().toISOString() });
    savedHotWords = JSON.stringify(hotWords);
    updateHotwordSaveState();
    toast('已保存，前端首页热门搜索生效');
  }
  /* ============================================================
   * 三、用户管理
   * ============================================================ */
  let users = readJson(USERS_KEY, {});
  if (!Object.keys(users).length) {
    // 演示种子数据：首次进入后台时初始化（chainOpenedAt 记录各产业链开通时间）
    users = {
      '13800001111': { type: 'registered', status: 'active', createdAt: '2026-10-21T09:20:00+08:00', lastLoginAt: '2026-11-14T10:05:00+08:00' },
      '13911112222': { type: 'paid', status: 'active', chains: ['集成电路', '生物医药'], chainOpenedAt: { '集成电路': '2026-09-02T16:00:00+08:00', '生物医药': '2026-10-11T10:20:00+08:00' }, createdAt: '2026-09-02T15:40:00+08:00', lastLoginAt: '2026-11-15T16:22:00+08:00' },
      '13722223333': { type: 'paid', status: 'disabled', chains: ['航空航天'], chainOpenedAt: { '航空航天': '2026-10-30T14:00:00+08:00' }, createdAt: '2026-10-30T11:12:00+08:00', lastLoginAt: '2026-11-12T09:47:00+08:00' },
      '13633334444': { type: 'registered', status: 'active', username: 'zhangsan2026', createdAt: '2026-11-05T14:08:00+08:00', lastLoginAt: '2026-11-15T20:31:00+08:00' },
      '13566667777': { type: 'paid', status: 'active', username: 'lily_wu', chains: ['集成电路'], chainOpenedAt: { '集成电路': '2026-11-01T09:30:00+08:00' }, createdAt: '2026-11-01T09:12:00+08:00', lastLoginAt: '2026-11-16T08:45:00+08:00' },
      '13455556666': { type: 'registered', status: 'disabled', username: 'demo_user', createdAt: '2026-10-12T18:26:00+08:00', lastLoginAt: '2026-10-19T11:02:00+08:00' }
    };
    writeJson(USERS_KEY, users);
  }

  function saveUsers() { writeJson(USERS_KEY, users); }

  /* 用户ID：格式 U + 6 位数字，按注册时间先后连续编号（注册越早编号越小），持久化在 record.uid */
  function ensureUserIds() {
    const ordered = Object.keys(users).sort((a, b) => {
      const diff = String(users[a].createdAt || '').localeCompare(String(users[b].createdAt || ''));
      return diff || a.localeCompare(b);
    });
    let changed = false;
    ordered.forEach((phone, index) => {
      const uid = `U${100001 + index}`;
      if (users[phone].uid !== uid) {
        users[phone].uid = uid;
        changed = true;
      }
    });
    if (changed) saveUsers();
    return users;
  }
  const userUid = (phone) => String((users[phone] || {}).uid || '') || '—';
  ensureUserIds();

  const USER_PAGE_SIZE = 10;
  let userSearchText = '';
  let userRegStart = '';
  let userRegEnd = '';
  let userServiceFilter = '';
  let userPage = 1;
  const userSelection = new Set();

  const userChainList = (record) => (Array.isArray(record.chains) ? record.chains : []);
  const userStatus = (record) => (record.status === 'disabled' ? 'disabled' : 'active');

  function filteredPhones() {
    const list = Object.keys(users).filter((phone) => {
      const record = users[phone];
      if (userSearchText && !(phone.includes(userSearchText) || String(record.username || '').toLowerCase().includes(userSearchText))) return false;
      const created = String(record.createdAt || '').slice(0, 10);
      if (userRegStart && (!created || created < userRegStart)) return false;
      if (userRegEnd && (!created || created > userRegEnd)) return false;
      // 按「已开通服务」筛选：保留开通了指定服务的用户
      if (userServiceFilter && !userChainList(record).includes(userServiceFilter)) return false;
      return true;
    });
    const byUid = (a, b) => String(users[a].uid || '').localeCompare(String(users[b].uid || ''));
    list.sort(byUid);
    if (tableSortState['user-reg'] !== 'default') {
      const dir = sortDirection('user-reg');
      list.sort((a, b) => dir * String(users[a].createdAt || '').localeCompare(String(users[b].createdAt || '')) || byUid(a, b));
    }
    return list;
  }

  function renderUsers() {
    const tbody = $('#userTableBody');
    const phones = filteredPhones();
    const totalPages = Math.max(1, Math.ceil(phones.length / USER_PAGE_SIZE));
    if (userPage > totalPages) userPage = totalPages;
    const pagePhones = phones.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
    const visiblePhones = new Set(phones);
    [...userSelection].forEach((value) => { if (!visiblePhones.has(value)) userSelection.delete(value); });
    $('#userEmpty').hidden = phones.length > 0;
    tbody.innerHTML = pagePhones.map((phone) => {
      const record = users[phone];
      const paid = record.type === 'paid';
      const chains = userChainList(record);
      const disabled = userStatus(record) === 'disabled';
      const serviceHtml = `<button type="button" class="admin-count-link${chains.length ? '' : ' is-zero'}" data-user-service="${escapeHtml(phone)}" title="查看并管理已开通产业链"><svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.36.36l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.7 1.7"/><path d="M14 10a4.5 4.5 0 0 0-6.36-.36l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.7-1.7"/></svg>${chains.length} 个</button>`;
      return `<tr>
        <td class="th-check"><input type="checkbox" class="admin-check" data-user-check="${escapeHtml(phone)}" ${userSelection.has(phone) ? 'checked' : ''} aria-label="选择用户${escapeHtml(phone)}" /></td>
        <td class="td-sub">${escapeHtml(userUid(phone))}</td>
        <td>${escapeHtml(phone)}</td>
        <td>${record.username ? escapeHtml(record.username) : '<span class="td-sub">未设置</span>'}</td>
        <td><span class="admin-badge ${paid ? 'paid' : 'registered'}">${paid ? '收费会员' : '注册用户'}</span></td>
        <td>${serviceHtml}</td>
        <td class="td-sub">${fmtDate(record.createdAt)}</td>
        <td><span class="admin-badge ${disabled ? 'disabled' : 'ok'}">${disabled ? '停用' : '正常'}</span></td>
        <td><span class="admin-cell-actions">
          <button type="button" class="admin-row-btn" title="查看用户详情" data-user-detail="${escapeHtml(phone)}"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg></button>
          <button type="button" class="admin-row-btn is-warn" title="密码重置" data-user-pwd="${escapeHtml(phone)}"><svg viewBox="0 0 24 24"><circle cx="7.5" cy="16.5" r="3.5"/><path d="M10 14 20 4"/><path d="M15.5 5.5 18 8"/></svg></button>
          <button type="button" class="admin-row-btn${disabled ? '' : ' is-danger'}" title="${disabled ? '启用账号' : '停用账号'}" data-user-status="${escapeHtml(phone)}"><svg viewBox="0 0 24 24">${disabled ? '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/>' : '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'}</svg></button>
        </span></td>
      </tr>`;
    }).join('');

    renderUserPager(phones.length, totalPages);

    $$('[data-user-service]', tbody).forEach((button) => {
      button.addEventListener('click', () => openServiceDialog(button.dataset.userService));
    });
    $$('[data-user-detail]', tbody).forEach((button) => {
      button.addEventListener('click', () => openUserDetail(button.dataset.userDetail));
    });
    $$('[data-user-pwd]', tbody).forEach((button) => {
      button.addEventListener('click', () => openPwdResetDialog(button.dataset.userPwd));
    });
    $$('[data-user-status]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const phone = button.dataset.userStatus;
        const record = users[phone];
        if (userStatus(record) === 'disabled') {
          record.status = 'active';
          toast(`${phone} 已启用，可正常登录使用`);
        } else {
          record.status = 'disabled';
          toast(`${phone} 已停用，停用后将无法登录前台`);
        }
        saveUsers();
        syncFrontUser(phone);
        renderUsers();
      });
    });
    $$('[data-user-check]', tbody).forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) userSelection.add(box.dataset.userCheck);
        else userSelection.delete(box.dataset.userCheck);
        updateUserBatchButtons();
        updateUserCheckAll();
      });
    });
    updateUserBatchButtons();
    updateUserCheckAll();
  }

  function updateUserBatchButtons() {
    const count = userSelection.size;
    ['userBatchEnable', 'userBatchDisable', 'userBatchDelete'].forEach((id) => {
      const button = $(`#${id}`);
      if (button) button.disabled = count === 0;
    });
  }

  function updateUserCheckAll() {
    const allBox = $('#userCheckAll');
    if (!allBox) return;
    const phones = filteredPhones().slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
    allBox.checked = phones.length > 0 && phones.every((phone) => userSelection.has(phone));
    allBox.indeterminate = !allBox.checked && phones.some((phone) => userSelection.has(phone));
  }

  function batchUserStatus(status) {
    const targets = [...userSelection].filter((phone) => users[phone]);
    if (!targets.length) return toast('请先选择用户');
    targets.forEach((phone) => {
      users[phone].status = status;
      syncFrontUser(phone);
    });
    saveUsers();
    userSelection.clear();
    renderUsers();
    toast(`已${status === 'disabled' ? '停用' : '启用'} ${targets.length} 个用户`);
  }

  function batchUserDelete() {
    const targets = [...userSelection].filter((phone) => users[phone]);
    if (!targets.length) return toast('请先选择用户');
    const currentPhone = (currentUser && currentUser.phone) || '';
    const deletable = targets.filter((phone) => phone !== currentPhone);
    if (!deletable.length) return toast('不能删除当前登录的用户');
    deletable.forEach((phone) => { delete users[phone]; userSelection.delete(phone); });
    saveUsers();
    renderUsers();
    const skipped = targets.length - deletable.length;
    toast(`已删除 ${deletable.length} 个用户${skipped ? `，跳过当前登录用户 ${skipped} 个` : ''}`);
  }

  $('#userCheckAll').addEventListener('change', (event) => {
    const phones = filteredPhones().slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
    phones.forEach((phone) => {
      if (event.target.checked) userSelection.add(phone);
      else userSelection.delete(phone);
    });
    renderUsers();
  });
  $('#userBatchEnable').addEventListener('click', () => batchUserStatus('active'));
  $('#userBatchDisable').addEventListener('click', () => batchUserStatus('disabled'));
  $('#userBatchDelete').addEventListener('click', batchUserDelete);

  function renderUserPager(total, totalPages) {
    const pager = $('#userPager');
    pager.hidden = total === 0;
    $('#userPagerTotal').textContent = `共 ${total} 条`;
    const buttons = $('#userPagerBtns');
    let html = `<button type="button" class="admin-pager-btn" data-page="prev" ${userPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let p = 1; p <= totalPages; p += 1) {
      html += `<button type="button" class="admin-pager-btn${p === userPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`;
    }
    html += `<button type="button" class="admin-pager-btn" data-page="next" ${userPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    buttons.innerHTML = html;
    $$('[data-page]', buttons).forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.page === 'prev') userPage -= 1;
        else if (button.dataset.page === 'next') userPage += 1;
        else userPage = Number(button.dataset.page);
        renderUsers();
      });
    });
  }

  function syncFrontUser(phone) {
    // 当前登录账号在被管理时，同步其前台会话数据
    if (currentUser && currentUser.phone === phone) {
      const record = users[phone];
      const merged = { ...currentUser, type: record.type, chains: userChainList(record), status: userStatus(record), admin: currentUser.admin };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
    }
  }

  $('#userSearchInput').addEventListener('input', (event) => {
    userSearchText = event.target.value.trim().toLowerCase();
    userPage = 1;
    renderUsers();
  });
  $('#userRegStart').addEventListener('change', (event) => { userRegStart = event.target.value; userPage = 1; renderUsers(); });
  $('#userRegEnd').addEventListener('change', (event) => { userRegEnd = event.target.value; userPage = 1; renderUsers(); });

  /* ---------- 弹窗通用开关 ---------- */
  function openDialogLayer(layer) { layer.classList.add('is-open'); layer.setAttribute('aria-hidden', 'false'); }
  function closeDialogLayer(layer) { layer.classList.remove('is-open'); layer.setAttribute('aria-hidden', 'true'); }

  const INDUSTRY_SYSTEM_CATEGORIES = [
    { name: '六大新兴支柱产业', chains: ['集成电路', '航空航天', '生物医药', '低空经济', '新型储能', '智能机器人'] },
    { name: '六大未来产业', chains: ['量子科技', '生物制造', '绿色氢能和核聚变能', '脑机接口', '具身智能', '6G'] },
    { name: '六张网', chains: ['水网', '新型电网', '算力网', '新一代通信网', '城市地下管网', '物联网'] }
  ];

  /* 用户列表「已开通服务」筛选：两级选择（左侧产业分类 → 右侧具体服务） */
  (function initUserServiceFilter() {
    const picker = $('#userServicePicker');
    const trigger = $('#userServiceTrigger');
    const menu = $('.admin-category-menu', picker);
    const level1 = $('.admin-category-level1', picker);
    const level2 = $('.admin-category-level2', picker);
    const catalogNames = serviceCatalog().map((entry) => entry.name);
    const openedNames = Object.values(users).flatMap((record) => userChainList(record));
    const allNames = [...new Set([...catalogNames, ...openedNames])];
    const serviceGroups = INDUSTRY_SYSTEM_CATEGORIES
      .map((group) => ({ key: group.name, names: group.chains.filter((name) => allNames.includes(name)) }))
      .filter((group) => group.names.length);
    const groupedNames = new Set(serviceGroups.flatMap((group) => group.names));
    const rest = allNames.filter((name) => !groupedNames.has(name));
    if (rest.length) serviceGroups.push({ key: '其他服务', names: rest });

    let activeGroup = '';
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const positionMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(460, window.innerWidth - 48);
      menu.style.left = `${Math.max(24, Math.min(rect.left, window.innerWidth - width - 24))}px`;
      menu.style.top = `${Math.max(24, Math.min(rect.bottom + 4, window.innerHeight - 292))}px`;
      menu.style.width = `${width}px`;
    };
    const renderLevel1 = () => {
      level1.innerHTML = `<button type="button" class="admin-category-option ${!userServiceFilter && !activeGroup ? 'is-active' : ''}" data-service-group="">全部服务</button>`
        + serviceGroups.map((group) => `<button type="button" class="admin-category-option ${activeGroup === group.key ? 'is-active' : ''}" data-service-group="${escapeHtml(group.key)}">${escapeHtml(group.key)}<span>›</span></button>`).join('');
    };
    const renderLevel2 = () => {
      const group = serviceGroups.find((item) => item.key === activeGroup);
      level2.innerHTML = group
        ? group.names.map((name) => `<button type="button" class="admin-category-option ${userServiceFilter === name ? 'is-active' : ''}" data-service-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')
        : '<div class="admin-category-hint">选择左侧产业分类</div>';
    };
    const applyFilter = (name) => {
      userServiceFilter = name;
      userPage = 1;
      trigger.childNodes[0].textContent = name || '全部服务';
      renderUsers();
      close();
    };
    trigger.addEventListener('click', () => {
      if (!menu.hidden) return close();
      const selectedGroup = serviceGroups.find((group) => group.names.includes(userServiceFilter));
      activeGroup = selectedGroup ? selectedGroup.key : '';
      renderLevel1();
      renderLevel2();
      menu.hidden = false;
      positionMenu();
      trigger.setAttribute('aria-expanded', 'true');
    });
    level1.addEventListener('click', (event) => {
      const button = event.target.closest('[data-service-group]');
      if (!button) return;
      if (!button.dataset.serviceGroup) return applyFilter('');
      activeGroup = button.dataset.serviceGroup;
      renderLevel1();
      renderLevel2();
    });
    level2.addEventListener('click', (event) => {
      const button = event.target.closest('[data-service-name]');
      if (button) applyFilter(button.dataset.serviceName);
    });
    document.addEventListener('click', (event) => { if (!picker.contains(event.target)) close(); }, true);
    window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); });
    window.addEventListener('scroll', () => { if (!menu.hidden) positionMenu(); }, true);
    renderLevel1();
    renderLevel2();
  })();

  function serviceCatalog() {
    const byName = new Map();
    (typeof nationalIndustryCatalog !== 'undefined' ? nationalIndustryCatalog : []).forEach((entry) => {
      byName.set(entry.name, { ...entry, categories: [`system:${entry.type}`] });
    });
    (typeof industryCategoryGroups !== 'undefined' ? industryCategoryGroups : []).forEach((group) => {
      group.chains.forEach((name) => {
        const entry = byName.get(name) || { name, type: '产业大类', categories: [] };
        const categoryValue = `category:${group.name}`;
        if (!entry.categories.includes(categoryValue)) entry.categories.push(categoryValue);
        byName.set(name, entry);
      });
    });
    return [...byName.values()];
  }
  function categoryGroups() {
    return [
      { key: 'system', label: '三大产业体系', items: INDUSTRY_SYSTEM_CATEGORIES.map((group) => ({ name: group.name, value: `system:${group.name}` })) },
      { key: 'category', label: '产业大类', items: (typeof industryCategoryGroups !== 'undefined' ? industryCategoryGroups : []).map((group) => ({ name: group.name, value: `category:${group.name}` })) }
    ];
  }
  function setupCategoryPicker(pickerId, triggerId, getSelected, onSelect) {
    const picker = $(`#${pickerId}`);
    const trigger = $(`#${triggerId}`);
    const menu = $('.admin-category-menu', picker);
    const level1 = $('.admin-category-level1', picker);
    const level2 = $('.admin-category-level2', picker);
    let activeGroup = '';
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const positionMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(460, window.innerWidth - 48);
      menu.style.position = 'fixed';
      menu.style.left = `${Math.max(24, Math.min(rect.left, window.innerWidth - width - 24))}px`;
      menu.style.top = `${Math.max(24, Math.min(rect.bottom + 4, window.innerHeight - 292))}px`;
      menu.style.width = `${width}px`;
    };
    const updateLabel = () => {
      const value = getSelected();
      const selected = categoryGroups().flatMap((group) => group.items).find((item) => item.value === value);
      trigger.childNodes[0].textContent = selected ? selected.name : '全部分类';
    };
    const renderMenu = () => {
      const groups = categoryGroups();
      level1.innerHTML = `<button type="button" class="admin-category-option ${activeGroup === '' ? 'is-active' : ''}" data-category-group="">全部分类</button>`
        + groups.map((group) => `<button type="button" class="admin-category-option ${activeGroup === group.key ? 'is-active' : ''}" data-category-group="${group.key}">${group.label}<span>›</span></button>`).join('');
      const group = groups.find((item) => item.key === activeGroup);
      level2.innerHTML = group ? group.items.map((item) => `<button type="button" class="admin-category-option ${getSelected() === item.value ? 'is-active' : ''}" data-category-value="${escapeHtml(item.value)}">${escapeHtml(item.name)}</button>`).join('') : '<div class="admin-category-hint">选择分类类型</div>';
    };
    trigger.addEventListener('click', () => {
      if (!menu.hidden) return close();
      const selected = getSelected();
      activeGroup = selected.startsWith('system:') ? 'system' : selected.startsWith('category:') ? 'category' : '';
      renderMenu();
      menu.hidden = false;
      positionMenu();
      trigger.setAttribute('aria-expanded', 'true');
    });
    level1.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category-group]');
      if (!button) return;
      if (!button.dataset.categoryGroup) {
        onSelect('');
        updateLabel();
        close();
        return;
      }
      activeGroup = button.dataset.categoryGroup;
      renderMenu();
    });
    level2.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category-value]');
      if (!button) return;
      onSelect(button.dataset.categoryValue);
      updateLabel();
      close();
    });
    document.addEventListener('click', (event) => { if (!picker.contains(event.target)) close(); }, true);
    window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); });
    window.addEventListener('scroll', () => { if (!menu.hidden) positionMenu(); }, true);
    updateLabel();
    return updateLabel;
  }
  function renderChainChoices(list, catalog, selected, category, query) {
    const keyword = String(query || '').trim().toLowerCase();
    const visible = catalog.filter((entry) => {
      const isSelected = selected.has(entry.name);
      if (!isSelected && category && !entry.categories.includes(category)) return false;
      return isSelected || !keyword || entry.name.toLowerCase().includes(keyword);
    });
    list.innerHTML = visible.map((entry) => `
      <label><input type="checkbox" value="${escapeHtml(entry.name)}" ${selected.has(entry.name) ? 'checked' : ''} />${escapeHtml(entry.name)}</label>`).join('');
    return visible.length;
  }

  /* ---------- 已开通服务管理抽屉 ---------- */
  const serviceDialogLayer = $('#serviceDialogLayer');
  let serviceTargetPhone = '';
  const serviceFilters = {
    opened: { category: '', query: '', sort: 'desc' },
    catalog: { category: '', query: '', sort: 'graph' }
  };
  let activeServiceTab = 'opened';
  /* ---------- 产业链价格（运营可调整，开通服务与前台展示共用） ---------- */
  // 存储结构：{ [产业链名]: { price: 数字, updatedAt: ISO } }
  let chainPrices = readJson(PRICE_KEY, null);
  if (!chainPrices || typeof chainPrices !== 'object') chainPrices = {};
  function saveChainPrices() { writeJson(PRICE_KEY, chainPrices); }
  // 默认价格：按链名哈希稳定生成，覆盖 6800 ~ 16400 区间
  function defaultServicePrice(name) {
    const hash = [...name].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    return 6800 + (hash % 9) * 1200;
  }
  function servicePrice(name) {
    const record = chainPrices[name];
    const value = record && Number(record.price);
    return Number.isFinite(value) && value > 0 ? value : defaultServicePrice(name);
  }
  function servicePriceUpdatedAt(name) {
    return chainPrices[name] && chainPrices[name].updatedAt ? chainPrices[name].updatedAt : '';
  }
  function setServicePrice(name, price) {
    chainPrices[name] = { mode: 'price', price: Number(price), updatedAt: new Date().toISOString() };
    saveChainPrices();
  }
  /* 开通方式：未配置、历史数据或明确设为 contact 时一律「仅联系客服」——
   * 产业链价格通常难以固定，默认只走人工沟通；只有运营明确设了固定价格才允许前台在线开通。 */
  function serviceSaleMode(name) {
    const record = chainPrices[name];
    if (record && record.mode === 'price') {
      const value = Number(record.price);
      if (Number.isFinite(value) && value > 0) return { mode: 'price', price: Math.round(value) };
    }
    return { mode: 'contact', price: 0 };
  }
  function setServiceSaleContact(name) {
    chainPrices[name] = { mode: 'contact', price: null, updatedAt: new Date().toISOString() };
    saveChainPrices();
  }
  // 用户管理侧的计费单价与「产业链价格」保持一致：仅联系客服时不生成默认价格
  function serviceBillablePrice(name) {
    const sale = serviceSaleMode(name);
    return sale.mode === 'price' ? sale.price : 0;
  }
  function salePriceHtml(name, price) {
    if (serviceSaleMode(name).mode === 'contact') return '<span class="admin-price-contact">仅联系客服</span>';
    const value = Number(price);
    return money(Number.isFinite(value) && value >= 0 ? value : serviceBillablePrice(name));
  }
  /* 成交单价快照：开通时把当时的单价冻结在 record.chainPrice[链名]。
   * 无论前台付款还是后台人工开通，凡是已开通的服务都必须有成交价记录。 */
  function chainDealPrice(record, name) {
    const saved = record && record.chainPrice ? Number(record.chainPrice[name]) : NaN;
    if (Number.isFinite(saved) && saved > 0) return saved;
    return serviceBillablePrice(name);
  }
  function ensureChainPrice(record, chains) {
    record.chainPrice = record.chainPrice || {};
    let changed = false;
    chains.forEach((name) => {
      const saved = Number(record.chainPrice[name]);
      if (Number.isFinite(saved) && saved > 0) return;
      // 历史数据没有快照：以当前配置价或稳定基准价补齐，保证每条已开通服务都有价格记录
      record.chainPrice[name] = serviceBillablePrice(name) || servicePrice(name);
      changed = true;
    });
    if (changed) saveUsers();
    return record.chainPrice;
  }
  /* 开通用户数：遍历所有用户已开通的产业链统计 */
  function chainOpenedUsers(name) {
    return Object.keys(users)
      .filter((phone) => userChainList(users[phone]).includes(name))
      .map((phone) => ({ phone, record: users[phone] }));
  }
  function serviceCategoryLabel(entry) {
    const names = entry.categories.map((value) => value.replace(/^(system|category):/, ''));
    return names.length ? [...new Set(names)].join('、') : '未分类';
  }
  /* 服务期（年）：记录用户购买的年限，到期日为开通时间顺延相应年数 */
  const SERVICE_TERM_OPTIONS = [1, 2, 3];
  function defaultServiceTerm(name) {
    const hash = [...name].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 11);
    return SERVICE_TERM_OPTIONS[hash % SERVICE_TERM_OPTIONS.length];
  }
  function ensureServiceTerm(record, chains) {
    record.chainTerm = record.chainTerm || {};
    let changed = false;
    chains.forEach((name) => {
      const term = Number(record.chainTerm[name]);
      if (SERVICE_TERM_OPTIONS.includes(term)) return;
      record.chainTerm[name] = defaultServiceTerm(name);
      changed = true;
    });
    if (changed) saveUsers();
    return record.chainTerm;
  }
  function fmtDay(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function serviceExpireAt(openedAtIso, term) {
    const start = new Date(openedAtIso);
    if (!openedAtIso || Number.isNaN(start.getTime())) return '';
    const expire = new Date(start.getTime());
    expire.setFullYear(expire.getFullYear() + (Number(term) || 1));
    return expire.toISOString();
  }
  function serviceTermHtml(name, openedAt, terms) {
    const term = Number(terms[name]) || defaultServiceTerm(name);
    const expire = serviceExpireAt(openedAt[name], term);
    return `${term} 年${expire ? `<span class="admin-service-expire">（${fmtDay(expire)} 到期）</span>` : ''}`;
  }
  /* 服务状态：按到期时间判断，绿点=生效中、红点=已到期（开通服务管理与用户详情共用同一套样式） */
  function serviceStatusHtml(name, openedAt, terms) {
    const term = Number(terms[name]) || defaultServiceTerm(name);
    const expire = serviceExpireAt(openedAt[name], term);
    const expired = expire ? new Date(expire).getTime() < Date.now() : false;
    return `<span class="admin-svc-status${expired ? ' is-expired' : ''}"><i aria-hidden="true"></i>${expired ? '已到期' : '生效中'}</span>`;
  }
  function ensureOpenedAt(record, chains) {
    record.chainOpenedAt = record.chainOpenedAt || {};
    let changed = false;
    const createdAt = new Date(record.createdAt || Date.now());
    const base = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
    chains.forEach((name, index) => {
      if (record.chainOpenedAt[name] && !Number.isNaN(new Date(record.chainOpenedAt[name]).getTime())) return;
      const openedAt = new Date(base.getTime() + (index + 1) * 60 * 60 * 1000);
      record.chainOpenedAt[name] = openedAt.toISOString();
      changed = true;
    });
    if (changed) saveUsers();
    return record.chainOpenedAt;
  }
  function compareServiceTime(a, b, sort, openedAt) {
    const aTime = openedAt[a.name] ? new Date(openedAt[a.name]).getTime() : 0;
    const bTime = openedAt[b.name] ? new Date(openedAt[b.name]).getTime() : 0;
    return sort === 'asc' ? aTime - bTime : bTime - aTime;
  }
  /* 图谱顺序：与「图谱管理 → 图谱列表」完全一致（分类顺序 + 分类内产业链顺序，读运营保存的排序配置） */
  function graphChainOrderIndex() {
    const index = new Map();
    let seq = 0;
    orderedGroupValues().forEach((value) => {
      const group = defaultGroups.find((item) => item.value === value);
      if (!group) return;
      chainOrderOf(group).forEach((name) => {
        if (index.has(name)) return;
        index.set(name, seq);
        seq += 1;
      });
    });
    return index;
  }
  function graphOrderOf(index, name) {
    return index.has(name) ? index.get(name) : Number.MAX_SAFE_INTEGER;
  }
  function currentServiceCategory(tab) { return serviceFilters[tab].category; }
  const updateOpenedCategoryLabel = setupCategoryPicker('serviceOpenedCategoryPicker', 'serviceOpenedCategory', () => currentServiceCategory('opened'), (value) => {
    serviceFilters.opened.category = value;
    renderServiceDialog();
  });
  const updateCatalogCategoryLabel = setupCategoryPicker('serviceCatalogCategoryPicker', 'serviceCatalogCategory', () => currentServiceCategory('catalog'), (value) => {
    serviceFilters.catalog.category = value;
    renderServiceDialog();
  });
  function setServiceTab(tab) {
    activeServiceTab = tab;
    $$('[data-service-tab]').forEach((button) => {
      const active = button.dataset.serviceTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('[data-service-panel]').forEach((panel) => {
      const active = panel.dataset.servicePanel === tab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    $$('[data-service-filter]').forEach((filters) => {
      filters.hidden = filters.dataset.serviceFilter !== tab;
      filters.classList.toggle('is-active', !filters.hidden);
    });
    renderServiceDialog();
    renderServiceFoot();
  }
  /* ---------- 服务勾选与批量操作 ---------- */
  const serviceSelection = { opened: new Set(), catalog: new Set() };
  let serviceOpenTarget = null;    // 单个开通：{ name, term }
  let serviceBatchTerm = 1;        // 批量开通统一服务期
  let serviceCancelTargets = [];   // 取消对象（单个或批量）

  function serviceUserLabel() {
    const record = users[serviceTargetPhone] || {};
    return `用户：${serviceTargetPhone}${record.username ? `（${record.username}）` : ''}`;
  }
  function termPickerHtml(active) {
    return SERVICE_TERM_OPTIONS.map((year) => `<button type="button" class="admin-term-option${year === Number(active) ? ' is-active' : ''}" data-term-option="${year}" role="radio" aria-checked="${year === Number(active)}">${year} 年</button>`).join('');
  }
  function money(value) { return `¥${Number(value).toLocaleString('zh-CN')}`; }

  /* 统一写库：open 为 [{ name, term }]，cancel 为链名数组 */
  function commitServiceChanges(input) {
    const record = users[serviceTargetPhone];
    if (!record) return;
    const chains = userChainList(record);
    record.chainOpenedAt = record.chainOpenedAt || {};
    record.chainTerm = record.chainTerm || {};
    record.chainPrice = record.chainPrice || {};
    const now = new Date().toISOString();
    (input.open || []).forEach((item) => {
      if (!chains.includes(item.name)) chains.push(item.name);
      record.chainOpenedAt[item.name] = now;
      record.chainTerm[item.name] = Number(item.term) || defaultServiceTerm(item.name);
      // 冻结本次成交单价：后续调价不影响这条已开通服务的价格；人工开通必须录入大于 0 的成交价
      const dealPrice = Number(item.price);
      record.chainPrice[item.name] = Number.isFinite(dealPrice) && dealPrice > 0
        ? Math.round(dealPrice)
        : serviceBillablePrice(item.name) || servicePrice(item.name);
    });
    (input.cancel || []).forEach((name) => {
      const index = chains.indexOf(name);
      if (index > -1) chains.splice(index, 1);
      delete record.chainOpenedAt[name];
      delete record.chainTerm[name];
      delete record.chainPrice[name];
    });
    record.chains = chains;
    record.type = chains.length ? 'paid' : 'registered';
    saveUsers();
    syncFrontUser(serviceTargetPhone);
    renderServiceDialog();
    renderUsers();
    // 用户详情抽屉正打开同一用户时，同步刷新概览与开通服务/订单页签
    if (userDetailPhone === serviceTargetPhone && $('#userDetailDialogLayer').classList.contains('is-open')) {
      const detailRecord = users[serviceTargetPhone] || {};
      const detailOrders = userOrders(serviceTargetPhone);
      const detailPaidSum = detailOrders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
      $('#userDetailStats').innerHTML = `
      <div class="admin-user-stat is-primary"><span>已开通服务</span><b>${userChainList(detailRecord).length}<em>条</em></b></div>
      <div class="admin-user-stat"><span>累计订单</span><b>${detailOrders.length}<em>笔</em></b></div>
      <div class="admin-user-stat"><span>累计实付</span><b>${money(detailPaidSum)}</b></div>`;
      renderUserDetailChains(detailRecord);
      renderUserDetailOrders(serviceTargetPhone);
    }
  }

  /* 页脚：已选统计 + 批量按钮（按页签切换） */
  function renderServiceFoot() {
    const tab = activeServiceTab;
    const selected = serviceSelection[tab];
    const openButton = $('#serviceBatchOpen');
    const cancelButton = $('#serviceBatchCancel');
    openButton.hidden = tab !== 'catalog';
    cancelButton.hidden = tab !== 'opened';
    const count = selected.size;
    if (tab === 'catalog') {
      const names = [...selected];
      const total = names.reduce((sum, name) => sum + serviceBillablePrice(name) * serviceBatchTerm, 0);
      const needsManual = names.some((name) => serviceSaleMode(name).mode === 'contact');
      openButton.disabled = count === 0;
      openButton.textContent = count ? `批量开通（${count}）` : '批量开通';
      $('#serviceFootInfo').innerHTML = count
        ? `已选 <b>${count}</b> 条产业链，${needsManual ? '<b>需设置开通金额</b>' : `预计开通金额 <b>${money(total)}</b>`}`
        : '勾选产业链后可批量开通，支持统一选择服务期';
    } else {
      cancelButton.disabled = count === 0;
      cancelButton.textContent = count ? `批量取消（${count}）` : '批量取消';
      $('#serviceFootInfo').innerHTML = count
        ? `已选 <b>${count}</b> 条已开通服务，取消后客户立即失去访问权限`
        : '勾选已开通服务后可批量取消';
    }
  }
  function syncSelectionCheckAll(tab, visibleNames) {
    const box = tab === 'opened' ? $('#serviceOpenedCheckAll') : $('#serviceCatalogCheckAll');
    const selected = serviceSelection[tab];
    const chosen = visibleNames.filter((name) => selected.has(name)).length;
    box.checked = visibleNames.length > 0 && chosen === visibleNames.length;
    box.indeterminate = chosen > 0 && chosen < visibleNames.length;
    box.disabled = visibleNames.length === 0;
  }

  /* ---------- 合计金额：价格调整（原价 / 成交价） + 推送订单 ---------- */
  // null 表示未调整；数字表示运营手动改定的合计金额
  let serviceOpenAdjust = null;
  let serviceBatchAdjust = null;
  // 批量开通：每条产业链的开通小计（整体金额均分后可逐条调整）
  let serviceBatchItemAmounts = {};
  const ORDERS_KEY = 'wudu-admin-orders';

  /* 演示订单种子数据：首次进入生成完整订单；已有数据补齐发票申请信息并追加演示订单 */
  (function seedDemoOrders() {
    // A：可合并的申请中组；B：已开票合并组；C：不同抬头（合并候选应排除）
    const applyBase = {
      invoiceType: '普通发票', invoiceFormat: 'PDF格式',
      invoiceAddress: '--', invoicePhone: '--', invoiceBank: '--', invoiceBankNo: '--',
      invoiceRemark: '用户提交多笔订单合并开票申请，请统一开具一张发票。'
    };
    const APPLY_A = Object.assign({}, applyBase, { invoiceCompany: '杭州云图数据服务有限公司', invoiceTaxNo: '91330106MA2KQCT15H' });
    const APPLY_B = Object.assign({}, applyBase, { invoiceCompany: '北京启明数据科技有限公司', invoiceTaxNo: '91110108MA01QCT15H' });
    const APPLY_C = Object.assign({}, applyBase, { invoiceCompany: '上海衡芯信息技术有限公司', invoiceTaxNo: '91310115MA1K3QCT2X', invoiceRemark: '用户单独提交的发票申请。' });
    const GROUP_A = 'INV-REQ-20261028-001';
    const GROUP_B = 'INV-REQ-20260905-002';
    const ISSUED_TIME = '2026-09-12 10:18:36';
    const ISSUED_FILES = ['合并订单电子发票.pdf', '发票明细清单.ofd'];

    const make = (phone, names, pushedAt, status, invoiceStatus, payMethod, discountRate, apply, groupId, invoiceTime, files, salt) => {
      // 年限、单价都以用户实际开通记录为准（成交价在开通时已冻结）
      const record = users[phone] || {};
      const terms = ensureServiceTerm(record, names);
      const dealPrices = ensureChainPrice(record, names);
      const items = names.map((name) => ({ name, term: Number(terms[name]) || defaultServiceTerm(name), price: Number(dealPrices[name]) || servicePrice(name) }));
      const originAmount = items.reduce((sum, item) => sum + item.price * item.term, 0);
      const amount = Math.round(originAmount * (1 - (discountRate || 0)));
      const id = `WD${new Date(pushedAt).getTime()}${String(100 + items.length * 7 + (salt || 0))}`;
      const order = {
        id, phone, username: record.username || '', items, originAmount, amount, status,
        payMethod: status === 'paid' ? payMethod : '',
        invoiceStatus,
        paidAt: status === 'paid' ? pushedAt : '',
        pushedAt,
        source: 'admin'
      };
      if (apply) Object.assign(order, apply);
      if (groupId) order.invoiceGroupId = groupId;
      if (invoiceTime) order.invoiceTime = invoiceTime;
      if (files) order.invoiceFiles = files;
      return order;
    };

    const buildSeeds = () => [
      make('13566667777', ['集成电路'], '2026-11-12T09:30:00+08:00', 'pending', 'none', '', 0.05, null, '', '', null, 11),
      make('13722223333', ['航空航天'], '2026-11-08T14:00:00+08:00', 'paid', 'none', 'offline', 0, null, '', '', null, 12),
      make('13911112222', ['集成电路'], '2026-11-05T11:20:00+08:00', 'paid', 'none', 'wechat', 0, null, '', '', null, 13),
      make('13911112222', ['集成电路'], '2026-10-30T16:00:00+08:00', 'paid', 'pending', 'offline', 0.1, APPLY_A, GROUP_A, '', null, 21),
      make('13722223333', ['生物医药'], '2026-10-25T10:20:00+08:00', 'paid', 'pending', 'wechat', 0, APPLY_A, GROUP_A, '', null, 22),
      make('13566667777', ['航空航天'], '2026-10-20T15:40:00+08:00', 'paid', 'pending', 'offline', 0, APPLY_A, GROUP_A, '', null, 23),
      make('13800001111', ['集成电路'], '2026-10-18T09:10:00+08:00', 'paid', 'pending', 'offline', 0, APPLY_C, '', '', null, 24),
      make('13911112222', ['生物医药'], '2026-09-12T16:00:00+08:00', 'paid', 'done', 'offline', 0, APPLY_B, GROUP_B, ISSUED_TIME, ISSUED_FILES, 31),
      make('13722223333', ['集成电路'], '2026-09-02T10:18:00+08:00', 'paid', 'done', 'wechat', 0, APPLY_B, GROUP_B, ISSUED_TIME, ISSUED_FILES, 32),
      make('13566667777', ['生物医药'], '2026-08-20T13:25:00+08:00', 'paid', 'done', 'offline', 0.1, APPLY_B, '', '2026-08-22 09:36:12', ['订单电子发票.pdf'], 33)
    ];

    const existing = readJson(ORDERS_KEY, null);
    if (Array.isArray(existing) && existing.length) {
      // 旧数据迁移：补齐发票申请信息、开票时间与附件名，保留此前操作结果
      let changed = false;
      existing.forEach((order) => {
        if (!order || typeof order !== 'object') return;
        if (!order.invoiceCompany) {
          Object.assign(order, order.invoiceStatus === 'done' ? APPLY_B : APPLY_A);
          changed = true;
        }
        if (order.invoiceStatus === 'done' && !Array.isArray(order.invoiceFiles)) {
          const legacy = Array.isArray(order.invoiceRecords) ? order.invoiceRecords.map((item) => item && item.fileName).filter(Boolean) : [];
          order.invoiceFiles = legacy.length ? legacy : [`订单${order.id}-电子发票.pdf`];
          order.invoiceTime = order.invoiceTime || fmtDate(order.paidAt || order.pushedAt);
          changed = true;
        }
        if (order.invoiceStatus === 'done' && !order.invoiceGroupId) {
          order.invoiceGroupId = GROUP_B; // 历史已开票订单归为同一合并组，便于演示整组查看
          changed = true;
        }
      });
      // 订单不足 10 笔时追加演示订单，保证「添加合并订单」有可演示候选
      if (existing.length < 10) {
        const extras = buildSeeds().filter((seed) => !existing.some((item) => item && item.id === seed.id));
        existing.push(...extras.slice(0, 10 - existing.length));
        changed = true;
      }
      if (changed) writeJson(ORDERS_KEY, existing);
      return;
    }
    writeJson(ORDERS_KEY, buildSeeds());
  })();

  function renderAdjustTotal(baseTotal, adjust, originEl, totalEl, resetButton) {
    const adjusted = adjust != null && adjust > 0;
    // 调价后原价划线展示，金额没变时不显示划线避免重复
    const changed = adjusted && adjust !== baseTotal;
    originEl.hidden = !changed;
    originEl.textContent = changed ? money(baseTotal) : '';
    totalEl.textContent = money(adjusted ? adjust : baseTotal);
    resetButton.hidden = !adjusted;
    return adjusted ? adjust : baseTotal;
  }
  function manualPrice(value) {
    const amount = Math.round(Number(value));
    if (!Number.isFinite(amount) || amount <= 0) return { error: '请输入大于 0 的有效金额' };
    if (amount > 99999999) return { error: '金额不能超过 99,999,999 元' };
    return { amount };
  }

  /* 推送订单至用户端（用户端订单功能未上线，此处仅落库，不联动开通） */
  function pushServiceOrder(items, amount, originAmount) {
    const orders = readJson(ORDERS_KEY, []);
    const order = {
      id: `WD${Date.now()}${String(Math.floor(Math.random() * 900) + 100)}`,
      phone: serviceTargetPhone,
      username: (users[serviceTargetPhone] || {}).username || '',
      items,
      originAmount: Number(originAmount),
      amount: Number(amount),
      status: 'pending',
      payMethod: '',
      invoiceStatus: 'none',
      operator: resolveAdminName(),
      pushedAt: new Date().toISOString(),
      source: 'admin'
    };
    orders.unshift(order);
    writeJson(ORDERS_KEY, orders);
    return order;
  }

  /* ---------- 单个开通确认弹窗 ---------- */
  function renderServiceOpenDialog() {
    const target = serviceOpenTarget;
    if (!target) return;
    const entry = serviceCatalog().find((item) => item.name === target.name) || { name: target.name, categories: [] };
    const sale = serviceSaleMode(target.name);
    const price = sale.mode === 'price' ? sale.price : 0;
    const nowIso = new Date().toISOString();
    const baseTotal = price * target.term;
    $('#serviceOpenDialogUser').textContent = serviceUserLabel();
    $('#serviceOpenName').textContent = target.name;
    $('#serviceOpenCategory').textContent = serviceCategoryLabel(entry);
    $('#serviceOpenPrice').innerHTML = salePriceHtml(target.name, price);
    $('#serviceOpenExpire').textContent = `${fmtDay(serviceExpireAt(nowIso, target.term))} 到期`;
    $('#serviceOpenTermPicker').innerHTML = termPickerHtml(target.term);
    const manual = sale.mode === 'contact';
    $('#serviceOpenManualTip').hidden = !manual;
    $('#serviceOpenAdjust').textContent = manual ? '设置开通金额' : '价格调整';
    $('#serviceOpenReset').textContent = manual ? '清除金额' : '恢复原价';
    renderAdjustTotal(baseTotal, serviceOpenAdjust, $('#serviceOpenOrigin'), $('#serviceOpenTotal'), $('#serviceOpenReset'));
    if (manual && serviceOpenAdjust == null) $('#serviceOpenTotal').textContent = '请设置开通金额';
    // 人工开通必须录入大于 0 的成交价，未设定前不允许确认/推送订单
    const amount = serviceOpenAdjust != null ? serviceOpenAdjust : baseTotal;
    $('#serviceOpenDialogSave').disabled = !(Number(amount) > 0);
    $('#serviceOpenPushOrder').disabled = !(Number(amount) > 0);
  }
  function openServiceOpenDialog(name) {
    serviceOpenTarget = { name, term: defaultServiceTerm(name) };
    serviceOpenAdjust = null;
    $('#serviceOpenAdjustEditor').hidden = true;
    renderServiceOpenDialog();
    openDialogLayer($('#serviceOpenDialogLayer'));
  }
  function closeServiceOpenDialog() {
    closeDialogLayer($('#serviceOpenDialogLayer'));
    $('#serviceOpenAdjustEditor').hidden = true;
  }
  $('#serviceOpenTermPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-term-option]');
    if (!button || !serviceOpenTarget) return;
    serviceOpenTarget.term = Number(button.dataset.termOption);
    // 固定价链：年限变了，手工调价失效；仅联系客服：整体金额由运营设定，不随年限变化
    if (serviceSaleMode(serviceOpenTarget.name).mode === 'price') {
      serviceOpenAdjust = null;
      $('#serviceOpenAdjustEditor').hidden = true;
    }
    renderServiceOpenDialog();
  });
  /* 价格调整：展开行内输入 */
  $('#serviceOpenAdjust').addEventListener('click', () => {
    if (!serviceOpenTarget) return;
    const price = serviceBillablePrice(serviceOpenTarget.name);
    const editor = $('#serviceOpenAdjustEditor');
    editor.hidden = false;
    const input = $('#serviceOpenAdjustInput');
    input.placeholder = price > 0 ? '请输入调整后的合计金额' : '请输入整体开通金额';
    input.value = serviceOpenAdjust != null ? serviceOpenAdjust : (price * serviceOpenTarget.term || '');
    input.focus();
    input.select();
  });
  $('#serviceOpenAdjustCancel').addEventListener('click', () => { $('#serviceOpenAdjustEditor').hidden = true; });
  function applyOpenAdjust() {
    const result = manualPrice($('#serviceOpenAdjustInput').value);
    if (result.error) { toast(result.error); return; }
    serviceOpenAdjust = result.amount;
    $('#serviceOpenAdjustEditor').hidden = true;
    renderServiceOpenDialog();
  }
  $('#serviceOpenAdjustSave').addEventListener('click', applyOpenAdjust);
  $('#serviceOpenAdjustInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyOpenAdjust(); });
  $('#serviceOpenReset').addEventListener('click', () => {
    serviceOpenAdjust = null;
    $('#serviceOpenAdjustEditor').hidden = true;
    renderServiceOpenDialog();
    toast(serviceSaleMode(serviceOpenTarget.name).mode === 'contact' ? '已清除设定金额' : '已恢复按单价计算');
  });
  $('#serviceOpenDialogClose').addEventListener('click', closeServiceOpenDialog);
  $('#serviceOpenDialogCancel').addEventListener('click', closeServiceOpenDialog);
  $('#serviceOpenDialogSave').addEventListener('click', () => {
    const target = serviceOpenTarget;
    if (!target) return;
    const baseTotal = serviceBillablePrice(target.name) * target.term;
    const amount = serviceOpenAdjust != null ? serviceOpenAdjust : baseTotal;
    if (!(Number(amount) > 0)) { toast('请先设置开通金额'); return; }
    // 成交单价按实际支付金额折算（手改过合计则折算到单价），冻结后不受后续调价影响
    const dealPrice = Math.round(amount / Math.max(1, target.term));
    commitServiceChanges({ open: [{ name: target.name, term: target.term, price: dealPrice }] });
    closeServiceOpenDialog();
    toast(`已开通「${target.name}」${target.term} 年服务，合计 ${money(amount)}`);
  });
  $('#serviceOpenPushOrder').addEventListener('click', () => {
    const target = serviceOpenTarget;
    if (!target) return;
    const baseTotal = serviceBillablePrice(target.name) * target.term;
    const amount = serviceOpenAdjust != null ? serviceOpenAdjust : baseTotal;
    if (!(Number(amount) > 0)) { toast('请先设置开通金额'); return; }
    const dealPrice = Math.round(amount / Math.max(1, target.term));
    const order = pushServiceOrder([{ name: target.name, term: target.term, price: dealPrice }], amount, baseTotal);
    closeServiceOpenDialog();
    toast(`订单 ${order.id} 已推送至用户端，待用户支付 ${money(amount)}`);
  });

  /* ---------- 批量开通弹窗 ---------- */
  function batchSelectedNames() {
    const graphIndex = graphChainOrderIndex();
    return [...serviceSelection.catalog].sort((a, b) => graphOrderOf(graphIndex, a) - graphOrderOf(graphIndex, b));
  }
  function batchDefaultAmount(name) {
    const amount = serviceBillablePrice(name) * serviceBatchTerm;
    return amount > 0 ? amount : null;
  }
  function resetBatchItemAmounts() {
    serviceBatchItemAmounts = {};
    batchSelectedNames().forEach((name) => {
      const amount = batchDefaultAmount(name);
      if (amount != null) serviceBatchItemAmounts[name] = amount;
    });
  }
  // 整体金额均分：余数依次分给前几条，保证各条之和严格等于整体金额
  function distributeBatchTotal(total, names) {
    if (!names.length || !(total > 0)) return;
    const base = Math.floor(total / names.length);
    const remainder = total - base * names.length;
    serviceBatchItemAmounts = {};
    names.forEach((name, index) => { serviceBatchItemAmounts[name] = base + (index < remainder ? 1 : 0); });
  }
  function batchTotalFromItems(names) {
    return names.reduce((sum, name) => sum + (Number(serviceBatchItemAmounts[name]) || 0), 0);
  }
  function batchAllPriced(names) {
    return names.length > 0 && names.every((name) => Number(serviceBatchItemAmounts[name]) > 0);
  }
  function updateBatchTotalUi() {
    const names = batchSelectedNames();
    const ready = batchAllPriced(names);
    $('#serviceBatchTotal').textContent = ready ? money(batchTotalFromItems(names)) : '请设置开通金额';
    $('#serviceBatchOpenSave').disabled = !ready;
    $('#serviceBatchPushOrder').disabled = !ready;
  }
  function renderServiceBatchOpen() {
    const names = batchSelectedNames();
    $('#serviceBatchOpenUser').textContent = serviceUserLabel();
    $('#serviceBatchTermPicker').innerHTML = termPickerHtml(serviceBatchTerm);
    const baseTotal = names.reduce((sum, name) => sum + serviceBillablePrice(name) * serviceBatchTerm, 0);
    $('#serviceBatchList').innerHTML = names.map((name) => {
      const price = serviceBillablePrice(name);
      const subtotal = Number(serviceBatchItemAmounts[name]) || 0;
      const defaultSubtotal = price * serviceBatchTerm;
      const changed = subtotal > 0 && defaultSubtotal > 0 && subtotal !== defaultSubtotal;
      const subtotalHtml = `<label class="admin-batch-price"><span>¥</span><input type="number" min="1" step="100" data-batch-price="${escapeHtml(name)}" value="${subtotal > 0 ? subtotal : ''}" placeholder="请输入" aria-label="${escapeHtml(name)}开通金额" /></label>${changed ? `<em class="admin-batch-hint">默认 ${money(defaultSubtotal)}</em>` : ''}`;
      return `<tr><td>${escapeHtml(name)}</td><td>${salePriceHtml(name, price)}</td><td>${serviceBatchTerm} 年</td><td class="admin-batch-subtotal">${subtotalHtml}</td></tr>`;
    }).join('');
    const ready = batchAllPriced(names);
    const total = batchTotalFromItems(names);
    $('#serviceBatchReset').textContent = names.every((name) => serviceSaleMode(name).mode === 'contact') ? '清除金额' : '恢复原价';
    $('#serviceBatchOrigin').hidden = !(ready && total !== baseTotal);
    $('#serviceBatchOrigin').textContent = ready && total !== baseTotal ? money(baseTotal) : '';
    $('#serviceBatchReset').hidden = !ready;
    $('#serviceBatchTotal').textContent = ready ? money(total) : '请设置开通金额';
    $('#serviceBatchOpenSave').disabled = !ready;
    $('#serviceBatchPushOrder').disabled = !ready;
    renderServiceFoot();
  }
  function openServiceBatchOpen() {
    if (!serviceSelection.catalog.size) { toast('请先勾选要开通的产业链'); return; }
    serviceBatchAdjust = null;
    $('#serviceBatchAdjustEditor').hidden = true;
    resetBatchItemAmounts();
    renderServiceBatchOpen();
    openDialogLayer($('#serviceBatchOpenLayer'));
  }
  function closeServiceBatchOpen() {
    closeDialogLayer($('#serviceBatchOpenLayer'));
    $('#serviceBatchAdjustEditor').hidden = true;
  }
  $('#serviceBatchTermPicker').addEventListener('click', (event) => {
    const button = event.target.closest('[data-term-option]');
    if (!button) return;
    serviceBatchTerm = Number(button.dataset.termOption);
    serviceBatchAdjust = null;
    $('#serviceBatchAdjustEditor').hidden = true;
    // 已录入整体金额则不随年限变化，否则按新年限重算有配置价产业链的默认小计
    if (serviceBatchAdjust == null) resetBatchItemAmounts();
    renderServiceBatchOpen();
  });
  $('#serviceBatchAdjust').addEventListener('click', () => {
    const names = batchSelectedNames();
    const editor = $('#serviceBatchAdjustEditor');
    editor.hidden = false;
    const input = $('#serviceBatchAdjustInput');
    input.placeholder = names.length > 1 ? '输入总价后均分到各产业链，可再单独调整' : '请输入开通金额';
    input.value = serviceBatchAdjust != null ? serviceBatchAdjust : (batchTotalFromItems(names) || '');
    input.focus();
    input.select();
  });
  $('#serviceBatchAdjustCancel').addEventListener('click', () => { $('#serviceBatchAdjustEditor').hidden = true; });
  function applyBatchAdjust() {
    const result = manualPrice($('#serviceBatchAdjustInput').value);
    if (result.error) { toast(result.error); return; }
    serviceBatchAdjust = result.amount;
    distributeBatchTotal(serviceBatchAdjust, batchSelectedNames());
    $('#serviceBatchAdjustEditor').hidden = true;
    renderServiceBatchOpen();
  }
  $('#serviceBatchAdjustSave').addEventListener('click', applyBatchAdjust);
  $('#serviceBatchAdjustInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyBatchAdjust(); });
  $('#serviceBatchReset').addEventListener('click', () => {
    serviceBatchAdjust = null;
    $('#serviceBatchAdjustEditor').hidden = true;
    resetBatchItemAmounts();
    renderServiceBatchOpen();
    toast('已恢复默认金额');
  });
  // 逐条调整金额：只更新合计与按钮状态，不重绘输入框以免打断输入
  $('#serviceBatchList').addEventListener('input', (event) => {
    const input = event.target.closest('[data-batch-price]');
    if (!input) return;
    const name = input.dataset.batchPrice;
    const amount = Math.round(Number(input.value));
    if (Number.isFinite(amount) && amount > 0) serviceBatchItemAmounts[name] = amount;
    else delete serviceBatchItemAmounts[name];
    serviceBatchAdjust = batchTotalFromItems(batchSelectedNames()) || null;
    updateBatchTotalUi();
  });
  $('#serviceBatchOpenClose').addEventListener('click', closeServiceBatchOpen);
  $('#serviceBatchOpenCancel').addEventListener('click', closeServiceBatchOpen);
  $('#serviceBatchOpenSave').addEventListener('click', () => {
    const names = batchSelectedNames();
    if (!names.length) return;
    const invalid = names.find((name) => !(Number(serviceBatchItemAmounts[name]) > 0));
    if (invalid) { toast(`请为「${invalid}」设置开通金额`); return; }
    const amount = batchTotalFromItems(names);
    serviceSelection.catalog.clear();
    // 每条产业链按自身开通金额折算并冻结成交单价，保证所有开通服务都有价格记录
    commitServiceChanges({ open: names.map((name) => ({
      name,
      term: serviceBatchTerm,
      price: Math.round(Number(serviceBatchItemAmounts[name]) / Math.max(1, serviceBatchTerm))
    })) });
    closeServiceBatchOpen();
    toast(`已批量开通 ${names.length} 条产业链，合计 ${money(amount)}`);
  });
  $('#serviceBatchPushOrder').addEventListener('click', () => {
    const names = batchSelectedNames();
    if (!names.length) return;
    if (!batchAllPriced(names)) { toast('请先为每条产业链设置开通金额'); return; }
    const baseTotal = names.reduce((sum, name) => sum + serviceBillablePrice(name) * serviceBatchTerm, 0);
    const amount = batchTotalFromItems(names);
    const items = names.map((name) => ({
      name,
      term: serviceBatchTerm,
      price: Math.round(Number(serviceBatchItemAmounts[name]) / Math.max(1, serviceBatchTerm))
    }));
    const order = pushServiceOrder(items, amount, baseTotal);
    serviceSelection.catalog.clear();
    closeServiceBatchOpen();
    renderServiceDialog();
    toast(`订单 ${order.id} 已推送至用户端（${names.length} 条产业链），待用户支付 ${money(amount)}`);
  });

  /* ---------- 取消服务确认弹窗（单个 / 批量共用） ---------- */
  function renderServiceCancelDialog() {
    const names = serviceCancelTargets;
    const record = users[serviceTargetPhone] || {};
    const openedAt = record.chainOpenedAt || {};
    const terms = record.chainTerm || {};
    $('#serviceCancelTitle').textContent = names.length > 1 ? `批量取消服务（${names.length} 条）` : '确认取消服务';
    $('#serviceCancelUser').textContent = serviceUserLabel();
    $('#serviceCancelText').textContent = names.length > 1
      ? '取消后客户将立即失去以上产业链的查看权限，操作不可撤销。'
      : '取消后客户将立即失去该产业链的查看权限，操作不可撤销。';
    $('#serviceCancelList').innerHTML = names.map((name) => {
      const entry = serviceCatalog().find((item) => item.name === name);
      const term = Number(terms[name]) || defaultServiceTerm(name);
      return `<div class="admin-cancel-item">
        <div><b>${escapeHtml(name)}</b><span>${escapeHtml(entry ? serviceCategoryLabel(entry) : '未分类')}</span></div>
        <div class="admin-cancel-meta">${term} 年${openedAt[name] ? `（${fmtDay(openedAt[name])} 开通）` : ''}</div>
      </div>`;
    }).join('');
    $('#serviceCancelConfirm').textContent = names.length > 1 ? `确认取消（${names.length}）` : '确认取消';
  }
  function openServiceCancelDialog(names) {
    serviceCancelTargets = names.filter(Boolean);
    if (!serviceCancelTargets.length) return;
    renderServiceCancelDialog();
    openDialogLayer($('#serviceCancelLayer'));
  }
  function closeServiceCancelDialog() { closeDialogLayer($('#serviceCancelLayer')); }
  $('#serviceCancelClose').addEventListener('click', closeServiceCancelDialog);
  $('#serviceCancelBack').addEventListener('click', closeServiceCancelDialog);
  $('#serviceCancelConfirm').addEventListener('click', () => {
    const names = [...serviceCancelTargets];
    if (!names.length) return;
    serviceSelection.opened.clear();
    serviceSelection.catalog.clear();
    commitServiceChanges({ cancel: names });
    closeServiceCancelDialog();
    toast(names.length > 1 ? `已批量取消 ${names.length} 条产业链服务` : `已取消「${names[0]}」服务`);
  });

  /* 表格行内操作：开通走确认弹窗，取消走二次确认 */
  function bindServiceActions(root) {
    $$('[data-service-action]', root).forEach((button) => button.addEventListener('click', () => {
      const name = button.dataset.serviceAction;
      if (button.dataset.serviceOpen === 'true') openServiceOpenDialog(name);
      else openServiceCancelDialog([name]);
    }));
  }
  /* 行勾选 */
  function bindServiceChecks(root, tab) {
    $$('[data-service-check]', root).forEach((box) => box.addEventListener('change', () => {
      const name = box.dataset.serviceCheck;
      if (box.checked) serviceSelection[tab].add(name);
      else serviceSelection[tab].delete(name);
      renderServiceFoot();
      // 已开通行不可勾选，全选的比较基准只取可选行
      syncSelectionCheckAll(tab, tab === 'opened' ? openedVisibleNames : catalogSelectableNames);
    }));
  }
  let openedVisibleNames = [];
  let catalogVisibleNames = [];
  let catalogSelectableNames = [];
  function renderServiceDialog() {
    const record = users[serviceTargetPhone] || {};
    const chains = userChainList(record);
    const openedAt = ensureOpenedAt(record, chains);
    const terms = ensureServiceTerm(record, chains);
    ensureChainPrice(record, chains);
    const catalog = serviceCatalog();
    const byName = new Map(catalog.map((entry) => [entry.name, entry]));
    const openedSet = new Set(chains);
    $('#serviceDialogUser').textContent = `用户：${serviceTargetPhone}${record.username ? `（${record.username}）` : ''}`;

    const openedFilter = serviceFilters.opened;
    const openedItems = chains.map((name) => byName.get(name) || { name, categories: [] })
      .filter((entry) => (!openedFilter.category || entry.categories.includes(openedFilter.category)) && (!openedFilter.query || entry.name.toLowerCase().includes(openedFilter.query.trim().toLowerCase())))
      .sort((a, b) => compareServiceTime(a, b, openedFilter.sort, openedAt));
    // 勾选集合同步：过滤/取消后清掉已不可见的选中项
    openedVisibleNames = openedItems.map((entry) => entry.name);
    [...serviceSelection.opened].forEach((name) => { if (!openedVisibleNames.includes(name)) serviceSelection.opened.delete(name); });
    $('#serviceOpenedList').innerHTML = openedItems.map((entry, index) => {
      // 已开通服务展示成交价：前台付款或后台人工开通，均保留开通时的价格记录
      const sale = serviceSaleMode(entry.name);
      const dealPrice = chainDealPrice(record, entry.name);
      const nowPrice = sale.mode === 'price' ? sale.price : 0;
      const priceCell = nowPrice > 0 && nowPrice !== dealPrice
        ? `<span class="admin-deal-price">${money(dealPrice)}</span><em class="admin-deal-now" title="原价">原价 ${money(nowPrice)}</em>`
        : `${money(dealPrice)}${sale.mode === 'contact' ? '<em class="admin-deal-now" title="开通时冻结的成交价">成交价</em>' : ''}`;
      return `<tr>
      <td class="th-check"><input type="checkbox" class="admin-check" data-service-check="${escapeHtml(entry.name)}" ${serviceSelection.opened.has(entry.name) ? 'checked' : ''} aria-label="选择${escapeHtml(entry.name)}" /></td>
      <td class="td-sub">${index + 1}</td><td>${escapeHtml(entry.name)}</td><td>${escapeHtml(serviceCategoryLabel(entry))}</td>
      <td class="admin-deal-cell">${priceCell}</td>
      <td>${serviceStatusHtml(entry.name, openedAt, terms)}</td>
      <td class="admin-service-term">${serviceTermHtml(entry.name, openedAt, terms)}</td>
      <td class="td-sub">${fmtDate(openedAt[entry.name])}</td>
      <td><button type="button" class="admin-service-action is-danger" data-service-action="${escapeHtml(entry.name)}" data-service-open="false">取消</button></td>
    </tr>`;
    }).join('');
    $('#serviceOpenedEmpty').hidden = openedItems.length > 0;
    $('#serviceOpenedSummary').textContent = `共 ${chains.length} 条已开通服务`;
    updateOpenedCategoryLabel();
    $('#serviceOpenedSearch').value = openedFilter.query;
    updateServiceSortButton('serviceOpenedSort', openedFilter.sort);
    bindServiceActions($('#serviceOpenedList'));
    bindServiceChecks($('#serviceOpenedList'), 'opened');
    syncSelectionCheckAll('opened', openedVisibleNames);

    const catalogFilter = serviceFilters.catalog;
    const graphIndex = graphChainOrderIndex();
    const catalogItems = catalog.filter((entry) => (!catalogFilter.category || entry.categories.includes(catalogFilter.category)) && (!catalogFilter.query || entry.name.toLowerCase().includes(catalogFilter.query.trim().toLowerCase())))
      .sort((a, b) => {
        const graphDiff = graphOrderOf(graphIndex, a.name) - graphOrderOf(graphIndex, b.name);
        // 默认按「图谱管理 → 图谱列表」的分类与链顺序排列
        if (catalogFilter.sort === 'graph') return graphDiff;
        return compareServiceTime(a, b, catalogFilter.sort, openedAt) || graphDiff;
      });
    catalogVisibleNames = catalogItems.map((entry) => entry.name);
    [...serviceSelection.catalog].forEach((name) => { if (!catalogVisibleNames.includes(name)) serviceSelection.catalog.delete(name); });
    $('#serviceCatalogList').innerHTML = catalogItems.map((entry, index) => {
      const isOpened = openedSet.has(entry.name);
      const checked = serviceSelection.catalog.has(entry.name);
      // 已开通的行不参与批量开通，勾选位展示为不可选的复选框
      const checkCell = isOpened
        ? `<td class="th-check"><input type="checkbox" class="admin-check" disabled aria-label="${escapeHtml(entry.name)}已开通，不可选择" /></td>`
        : `<td class="th-check"><input type="checkbox" class="admin-check" data-service-check="${escapeHtml(entry.name)}" ${checked ? 'checked' : ''} aria-label="选择${escapeHtml(entry.name)}" /></td>`;
      return `<tr>${checkCell}<td class="td-sub">${index + 1}</td><td>${escapeHtml(entry.name)}</td><td>${escapeHtml(serviceCategoryLabel(entry))}</td>
        <td>${salePriceHtml(entry.name, serviceBillablePrice(entry.name))}</td>
        <td><span class="admin-service-status${isOpened ? ' is-opened' : ''}">${isOpened ? '已开通' : '未开通'}</span></td>
        <td class="td-sub">${isOpened ? fmtDate(openedAt[entry.name]) : '—'}</td>
        <td><button type="button" class="admin-service-action${isOpened ? ' is-danger' : ''}" data-service-action="${escapeHtml(entry.name)}" data-service-open="${!isOpened}">${isOpened ? '取消' : '开通'}</button></td></tr>`;
    }).join('');
    $('#serviceCatalogEmpty').hidden = catalogItems.length > 0;
    $('#serviceCatalogSummary').textContent = `共 ${catalogItems.length} 条产业链，已开通 ${chains.length} 条`;
    updateCatalogCategoryLabel();
    $('#serviceCatalogSearch').value = catalogFilter.query;
    updateServiceSortButton('serviceCatalogSort', catalogFilter.sort);
    bindServiceActions($('#serviceCatalogList'));
    bindServiceChecks($('#serviceCatalogList'), 'catalog');
    catalogSelectableNames = catalogItems.filter((entry) => !openedSet.has(entry.name)).map((entry) => entry.name);
    syncSelectionCheckAll('catalog', catalogSelectableNames);
    renderServiceFoot();
  }
  function openServiceDialog(phone) {
    serviceTargetPhone = phone;
    activeServiceTab = 'opened';
    serviceSelection.opened.clear();
    serviceSelection.catalog.clear();
    serviceBatchTerm = 1;
    Object.assign(serviceFilters.opened, { category: '', query: '', sort: 'desc' });
    Object.assign(serviceFilters.catalog, { category: '', query: '', sort: 'graph' });
    renderServiceDialog();
    setServiceTab('opened');
    openDialogLayer(serviceDialogLayer);
  }
  function closeServiceDialog() {
    closeDialogLayer(serviceDialogLayer);
    closeServiceOpenDialog();
    closeServiceBatchOpen();
    closeServiceCancelDialog();
  }
  $$('[data-service-tab]').forEach((button) => button.addEventListener('click', () => setServiceTab(button.dataset.serviceTab)));
  $('#serviceOpenedSearch').addEventListener('input', (event) => { serviceFilters.opened.query = event.target.value; renderServiceDialog(); });
  $('#serviceCatalogSearch').addEventListener('input', (event) => { serviceFilters.catalog.query = event.target.value; renderServiceDialog(); });
  function updateServiceSortButton(id, direction) {
    const button = $('#' + id);
    const ascending = direction === 'asc';
    const byGraph = direction === 'graph';
    button.classList.toggle('is-ascending', ascending);
    button.classList.toggle('is-graph', byGraph);
    button.closest('th').setAttribute('aria-sort', byGraph ? 'none' : ascending ? 'ascending' : 'descending');
    button.setAttribute('aria-label', `开通时间：${byGraph ? '当前按图谱顺序排列' : ascending ? '最早优先' : '最新优先'}，点击切换排序`);
    button.title = byGraph ? '当前按图谱顺序排列，点击按开通时间最新优先' : ascending ? '当前最早优先，点击恢复图谱顺序' : '当前最新优先，点击最早优先';
  }
  $('#serviceOpenedSort').addEventListener('click', () => { serviceFilters.opened.sort = serviceFilters.opened.sort === 'desc' ? 'asc' : 'desc'; renderServiceDialog(); });
  // 服务列表：图谱顺序（默认）→ 最新优先 → 最早优先 → 图谱顺序
  $('#serviceCatalogSort').addEventListener('click', () => {
    const next = { graph: 'desc', desc: 'asc', asc: 'graph' };
    serviceFilters.catalog.sort = next[serviceFilters.catalog.sort] || 'desc';
    renderServiceDialog();
  });
  $('#serviceDialogClose').addEventListener('click', closeServiceDialog);
  // 关闭按钮已移除，改为页脚的批量操作；点击遮罩仍可关闭
  serviceDialogLayer.addEventListener('click', (event) => { if (event.target === serviceDialogLayer) closeServiceDialog(); });

  /* 全选 / 批量按钮 */
  $('#serviceOpenedCheckAll').addEventListener('change', (event) => {
    if (event.target.checked) openedVisibleNames.forEach((name) => serviceSelection.opened.add(name));
    else serviceSelection.opened.clear();
    renderServiceDialog();
  });
  $('#serviceCatalogCheckAll').addEventListener('change', (event) => {
    if (event.target.checked) catalogSelectableNames.forEach((name) => serviceSelection.catalog.add(name));
    else serviceSelection.catalog.clear();
    renderServiceDialog();
  });
  $('#serviceBatchOpen').addEventListener('click', openServiceBatchOpen);
  $('#serviceBatchCancel').addEventListener('click', () => {
    if (!serviceSelection.opened.size) { toast('请先勾选要取消的已开通服务'); return; }
    openServiceCancelDialog([...serviceSelection.opened]);
  });

  /* ---------- 产业链价格 ---------- */
  let priceDialogTarget = '';
  function renderPriceTable() {
    const body = $('#priceTableBody');
    if (!body) return;
    // 严格按「图谱管理 → 图谱列表」顺序
    const graphIndex = graphChainOrderIndex();
    const rows = [...graphIndex.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
    if (tableSortState['price-updated'] !== 'default') {
      const dir = sortDirection('price-updated');
      rows.sort((a, b) => dir * String(servicePriceUpdatedAt(a) || '').localeCompare(String(servicePriceUpdatedAt(b) || '')) || a.localeCompare(b, 'zh-Hans-CN'));
    }
    // 所属分类：与「图谱列表」的分类归属保持一致（取图谱顺序中第一个包含该链的分类）
    const categoryOf = new Map();
    orderedGroupValues().forEach((value) => {
      const group = defaultGroups.find((item) => item.value === value);
      if (!group) return;
      chainOrderOf(group).forEach((name) => {
        if (!categoryOf.has(name)) categoryOf.set(name, group.label);
      });
    });
    body.innerHTML = rows.map((name, index) => {
      const sale = serviceSaleMode(name);
      const updatedAt = servicePriceUpdatedAt(name);
      const count = chainOpenedUsers(name).length;
      const category = categoryOf.get(name) || '未分类';
      const saleText = sale.mode === 'contact'
        ? '<span class="admin-price-contact">仅联系客服</span>'
        : `¥${sale.price.toLocaleString('zh-CN')} <small>/ 年</small>`;
      return `<tr>
        <td class="td-sub">${index + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td class="td-sub admin-price-category">${escapeHtml(category)}</td>
        <td class="admin-price-value">${saleText}</td>
        <td class="td-sub">${updatedAt ? fmtDate(updatedAt) : '<span class="admin-price-none">默认</span>'}</td>
        <td>${count ? `<button type="button" class="admin-count-link" data-price-users="${escapeHtml(name)}">${count} 位</button>` : '<span class="admin-price-none">0 位</span>'}</td>
        <td><button type="button" class="admin-service-action" data-price-edit="${escapeHtml(name)}">开通方式</button></td>
      </tr>`;
    }).join('');
    $('#priceEmpty').hidden = rows.length > 0;
    const contactCount = rows.filter((name) => serviceSaleMode(name).mode === 'contact').length;
    $('#priceSummary').textContent = `共 ${rows.length} 条产业链，其中 ${contactCount} 条仅联系客服，已开通用户合计 ${Object.keys(users).filter((phone) => userChainList(users[phone]).length).length} 位`;
    $$('[data-price-edit]', body).forEach((button) => button.addEventListener('click', () => openPriceDialog(button.dataset.priceEdit)));
    $$('[data-price-users]', body).forEach((button) => button.addEventListener('click', () => openPriceUsersDialog(button.dataset.priceUsers)));
  }

  /* 价格调整弹窗 */
  function openPriceDialog(name) {
    priceDialogTarget = name;
    const sale = serviceSaleMode(name);
    const contact = sale.mode === 'contact';
    $('#priceDialogName').textContent = name;
    $('#priceDialogCurrent').textContent = contact ? '仅联系客服' : money(sale.price);
    $('#priceDialogModeContact').checked = contact;
    $('#priceDialogModePrice').checked = !contact;
    $('#priceDialogInput').value = contact ? '' : sale.price;
    $('#priceDialogError').hidden = true;
    // 说明影响范围：已开通/已下单的价格不变，只有后续购买走新价
    const affected = chainOpenedUsers(name).length;
    $('#priceDialogNote').innerHTML = affected
      ? `已开通该产业链的 <b>${affected}</b> 位用户按原成交价保持不变，调整仅对之后的新开通与续费生效。`
      : '调整仅对之后的新开通与续费生效。';
    syncPriceDialogMode();
    openDialogLayer($('#priceDialogLayer'));
    if (!contact) setTimeout(() => { const input = $('#priceDialogInput'); input.focus(); input.select(); }, 60);
  }
  function closePriceDialog() { closeDialogLayer($('#priceDialogLayer')); priceDialogTarget = ''; }
  // 按开通方式切换输入区：仅联系客服时隐藏价格输入、不做价格校验
  function syncPriceDialogMode() {
    const contact = $('#priceDialogModeContact').checked;
    $('#priceDialogPriceRow').hidden = contact;
    $('#priceDialogError').hidden = true;
    if (contact) {
      $('#priceDialogPreview').textContent = '该产业链仅支持联系客服沟通开通，前台不展示价格，也不提供在线开通按钮。';
    } else {
      syncPricePreview();
    }
  }
  function syncPricePreview() {
    if ($('#priceDialogModeContact').checked) return;
    const value = Number($('#priceDialogInput').value);
    const valid = Number.isFinite(value) && value > 0;
    const current = priceDialogTarget ? serviceSaleMode(priceDialogTarget).price : 0;
    const diffText = !current ? '首次设置价格'
      : diffTextOf(value - current, current);
    $('#priceDialogPreview').innerHTML = valid
      ? `调整后将按 <b>${money(value)}</b> / 年计费，${diffText}`
      : '<span class="admin-price-warn">请输入大于 0 的价格</span>';
  }
  function diffTextOf(diff, current) {
    if (!current) return '首次设置价格';
    return diff === 0 ? '与当前一致'
      : diff > 0 ? `较当前上调 ${money(diff)}（+${((diff / current) * 100).toFixed(1)}%）`
        : `较当前下调 ${money(-diff)}（${((diff / current) * 100).toFixed(1)}%）`;
  }

  /* 开通用户列表弹窗 */
  function openPriceUsersDialog(name) {
    const openedAtOf = (record) => (record.chainOpenedAt && record.chainOpenedAt[name]) || '';
    const list = chainOpenedUsers(name)
      .sort((a, b) => new Date(openedAtOf(b.record) || 0) - new Date(openedAtOf(a.record) || 0));
    $('#priceUsersTitle').textContent = `${name} · 开通用户`;
    $('#priceUsersSub').textContent = `共 ${list.length} 位用户已开通，按开通时间倒序`;
    const sale = serviceSaleMode(name);
    const nowPrice = sale.mode === 'price' ? sale.price : 0;
    $('#priceUsersList').innerHTML = list.length
      ? list.map((item) => {
        const term = (item.record.chainTerm && item.record.chainTerm[name]) || defaultServiceTerm(name);
        const disabled = userStatus(item.record) === 'disabled';
        // 每位用户的成交单价（开通时冻结），调价后这里仍然是原成交价；后台人工开通也有价格记录
        const dealPrice = chainDealPrice(item.record, name);
        const priceTag = dealPrice === nowPrice
          ? `<span class="admin-price-user-price">${money(dealPrice)}</span>`
          : `<span class="admin-price-user-price is-frozen" title="开通时冻结的成交单价">${money(dealPrice)}</span>`;
        const sourceTag = sale.mode === 'contact' && dealPrice > 0 ? '<em class="admin-price-user-tag">成交价</em>' : '';
        return `<div class="admin-price-user">
          <div class="admin-price-user-main"><b>${escapeHtml(item.phone)}</b><span>${item.record.username ? escapeHtml(item.record.username) : '未设用户名'}</span>${disabled ? '<em class="admin-price-user-tag">已停用</em>' : ''}</div>
          <div class="admin-price-user-meta">${priceTag}${sourceTag}<span class="admin-price-user-term">${term} 年</span><span>${openedAtOf(item.record) ? fmtDate(openedAtOf(item.record)) : '—'} 开通</span></div>
        </div>`;
      }).join('')
      : '<p class="admin-empty">暂无用户开通该产业链</p>';
    openDialogLayer($('#priceUsersLayer'));
  }
  function closePriceUsersDialog() { closeDialogLayer($('#priceUsersLayer')); }
  $('#priceDialogClose').addEventListener('click', closePriceDialog);
  $('#priceDialogCancel').addEventListener('click', closePriceDialog);
  $('#priceDialogInput').addEventListener('input', syncPricePreview);
  $('#priceDialogModeContact').addEventListener('change', syncPriceDialogMode);
  $('#priceDialogModePrice').addEventListener('change', syncPriceDialogMode);
  $('#priceDialogSave').addEventListener('click', () => {
    const name = priceDialogTarget;
    if (!name) return;
    if ($('#priceDialogModeContact').checked) {
      setServiceSaleContact(name);
      closePriceDialog();
      renderPriceTable();
      toast(`「${name}」已设为仅联系客服，前台只展示联系客服入口`);
      return;
    }
    const value = Number($('#priceDialogInput').value);
    if (!Number.isFinite(value) || value <= 0) {
      $('#priceDialogError').hidden = false;
      $('#priceDialogError').textContent = '请输入大于 0 的有效价格';
      return;
    }
    if (value > 9999999) {
      $('#priceDialogError').hidden = false;
      $('#priceDialogError').textContent = '价格不能超过 9,999,999 元/年';
      return;
    }
    setServicePrice(name, Math.round(value));
    closePriceDialog();
    renderPriceTable();
    toast(`「${name}」价格已调整为 ${money(Math.round(value))} / 年，前台可在线开通`);
  });
  $('#priceUsersClose').addEventListener('click', closePriceUsersDialog);
  $('#priceUsersOk').addEventListener('click', closePriceUsersDialog);
  $('#priceUsersLayer').addEventListener('click', (event) => { if (event.target === $('#priceUsersLayer')) closePriceUsersDialog(); });
  $('#priceDialogLayer').addEventListener('click', (event) => { if (event.target === $('#priceDialogLayer')) closePriceDialog(); });
  /* ---------- 用户详情弹窗 ---------- */
  const userDetailDialogLayer = $('#userDetailDialogLayer');

  /* 订单支付方式 / 发票状态的展示映射（订单落库时可能为空，给出演示默认值） */
  const PAY_METHOD_LABEL = {
    wechat: '微信支付',
    offline: '线下支付',
    // 兼容历史数据：旧值统一归入「线下支付」
    alipay: '线下支付',
    bank: '线下支付'
  };
  const orderPayMethod = (order) => {
    const raw = order.payMethod || '';
    if (!raw) return '';
    return raw === 'wechat' ? 'wechat' : 'offline';
  };
  const PAY_STATUS_LABEL = {
    pending: { text: '待支付', cls: 'warn' },
    paid: { text: '已支付', cls: 'ok' },
    closed: { text: '已关闭', cls: 'off' },
    refunded: { text: '已退款', cls: 'off' }
  };
  const INVOICE_STATUS_LABEL = {
    none: { text: '未申请', cls: 'off' },
    pending: { text: '申请中', cls: 'warn' },
    done: { text: '已开票', cls: 'off' }
  };

  function userOrders(phone) {
    const all = readJson(ORDERS_KEY, []);
    if (!Array.isArray(all)) return [];
    return all
      .filter((order) => order && order.phone === phone)
      .sort((a, b) => String(b.pushedAt || '').localeCompare(String(a.pushedAt || '')));
  }

  /* 用户详情抽屉：当前用户 / 当前页签 / 已开通列表展开状态与搜索词 */
  let userDetailPhone = '';
  let userDetailTab = 'basic';
  let userDetailChainExpanded = false;
  let userDetailChainQuery = '';
  const USER_CHAIN_PREVIEW = 6;

  function setUserTab(tab) {
    userDetailTab = tab;
    $$('[data-user-tab]').forEach((button) => {
      const active = button.dataset.userTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('[data-user-panel]').forEach((panel) => {
      const active = panel.dataset.userPanel === tab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    $$('[data-user-filter]').forEach((filters) => {
      filters.hidden = filters.dataset.userFilter !== tab;
      filters.classList.toggle('is-active', !filters.hidden);
    });
  }
  $$('[data-user-tab]').forEach((button) => button.addEventListener('click', () => setUserTab(button.dataset.userTab)));
  $('#userDetailChainSearch').addEventListener('input', (event) => {
    userDetailChainQuery = event.target.value;
    userDetailChainExpanded = false;
    renderUserDetailChains(users[userDetailPhone] || {});
  });

  function renderUserDetailChains(record) {
    const allChains = userChainList(record);
    const openedAt = record.chainOpenedAt || {};
    const terms = ensureServiceTerm(record, allChains);
    ensureChainPrice(record, allChains);
    const byName = new Map(serviceCatalog().map((entry) => [entry.name, entry]));
    const query = userDetailChainQuery.trim().toLowerCase();
    const chains = query ? allChains.filter((name) => name.toLowerCase().includes(query)) : allChains;
    // 数量过多时默认只展示前 N 条，其余折叠，避免抽屉被拉得过长
    const collapsible = !query && chains.length > USER_CHAIN_PREVIEW;
    const visible = collapsible && !userDetailChainExpanded ? chains.slice(0, USER_CHAIN_PREVIEW) : chains;

    $('#userDetailChainCount').textContent = String(allChains.length);
    const tip = $('#userDetailChainTip');
    if (collapsible) {
      tip.hidden = false;
      tip.innerHTML = `该用户共开通 <b>${chains.length}</b> 条产业链，${userDetailChainExpanded ? '已展开全部' : `默认展示前 ${USER_CHAIN_PREVIEW} 条`}。`;
    } else {
      tip.hidden = true;
      tip.innerHTML = '';
    }

    const rows = visible.map((name, index) => {
      const entry = byName.get(name) || { name, categories: [] };
      const expire = serviceExpireAt(openedAt[name], Number(terms[name]) || defaultServiceTerm(name));
      // 展示项与「开通服务管理」保持一致：产业分类 / 价格（成交价）/ 状态 / 服务期 / 开通时间 / 操作
      const sale = serviceSaleMode(name);
      const dealPrice = chainDealPrice(record, name);
      const nowPrice = sale.mode === 'price' ? sale.price : 0;
      const priceCell = nowPrice > 0 && nowPrice !== dealPrice
        ? `<span class="admin-deal-price">${money(dealPrice)}</span><em class="admin-deal-now" title="原价">原价 ${money(nowPrice)}</em>`
        : `${money(dealPrice)}${sale.mode === 'contact' ? '<em class="admin-deal-now" title="开通时冻结的成交价">成交价</em>' : ''}`;
      return `<tr>
        <td class="td-sub">${index + 1}</td>
        <td class="admin-chain-name">${escapeHtml(name)}</td>
        <td class="td-sub">${escapeHtml(serviceCategoryLabel(entry))}</td>
        <td>${priceCell}</td>
        <td>${serviceStatusHtml(name, openedAt, terms)}</td>
        <td>${serviceTermHtml(name, openedAt, terms)}</td>
        <td class="td-sub">${fmtDate(openedAt[name])}</td>
        <td><button type="button" class="admin-service-action is-danger" data-user-service-cancel="${escapeHtml(name)}">取消</button></td>
      </tr>`;
    }).join('');

    // 折叠/展开控制行
    let moreRow = '';
    if (collapsible) {
      const rest = chains.length - USER_CHAIN_PREVIEW;
      moreRow = `<tr class="admin-chain-more-row"><td colspan="8">
        <button type="button" class="admin-chain-more${userDetailChainExpanded ? ' is-collapse' : ''}" id="userDetailChainMore">
          <span>${userDetailChainExpanded ? '收起，只看前 ' + USER_CHAIN_PREVIEW + ' 条' : `展开全部 ${chains.length} 条（还有 ${rest} 条）`}</span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button></td></tr>`;
    }
    $('#userDetailChainBody').innerHTML = (rows || '') + moreRow;
    const moreButton = $('#userDetailChainMore');
    if (moreButton) {
      moreButton.addEventListener('click', () => {
        userDetailChainExpanded = !userDetailChainExpanded;
        renderUserDetailChains(users[userDetailPhone] || {});
      });
    }
    // 详情页取消开通：与「开通服务管理」同一确认流程，目标用户切换为当前详情用户
    $$('[data-user-service-cancel]').forEach((button) => button.addEventListener('click', () => {
      serviceTargetPhone = userDetailPhone;
      openServiceCancelDialog([button.dataset.userServiceCancel]);
    }));
    // 空态：既包括用户没开通服务，也包括搜索无结果
    const emptyEl = $('#userDetailChainEmpty');
    emptyEl.hidden = visible.length > 0;
    emptyEl.textContent = query ? '没有匹配的已开通产业链' : '暂未开通产业链服务';
  }

  function renderUserDetailOrders(phone) {
    const orders = userOrders(phone);
    $('#userDetailOrderCount').textContent = String(orders.length);
    $('#userDetailOrderEmpty').hidden = orders.length > 0;
    $('#userDetailOrderBody').innerHTML = orders.map((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const tags = items.slice(0, 2).map((item) => `<span class="admin-svc-tag">${escapeHtml(item.name)}</span>`).join('');
      const more = items.length > 2 ? `<span class="admin-svc-tag is-more">+${items.length - 2}</span>` : '';
      const chainCell = items.length
        ? `<div class="admin-svc-tags" title="${escapeHtml(items.map((item) => item.name).join('、'))}">${tags}${more}</div>`
        : '<span class="admin-detail-none">—</span>';
      const terms = [...new Set(items.map((item) => Number(item.term) || 0))].filter((term) => term > 0);
      const termCell = terms.length ? (terms.length === 1 ? `${terms[0]} 年` : `${terms.join(' / ')} 年`) : '—';
      const origin = Number(order.originAmount) || Number(order.amount) || 0;
      const paid = Number(order.amount) || 0;
      const pay = PAY_METHOD_LABEL[orderPayMethod(order)] || '<span class="admin-detail-none">—</span>';
      const payStatus = PAY_STATUS_LABEL[order.status] || PAY_STATUS_LABEL.pending;
      const invoice = INVOICE_STATUS_LABEL[order.invoiceStatus] || INVOICE_STATUS_LABEL.none;
      const discount = origin > paid ? `<em class="admin-order-off">已优惠 ${money(origin - paid)}</em>` : '';
      return `<tr>
        <td class="admin-order-id">${escapeHtml(order.id || '—')}</td>
        <td>${chainCell}</td>
        <td>${termCell}</td>
        <td class="admin-order-money">${money(origin)}${discount}</td>
        <td class="admin-order-paid">${money(paid)}</td>
        <td>${pay}</td>
        <td><span class="admin-badge ${payStatus.cls}">${payStatus.text}</span></td>
        <td><span class="admin-badge ${invoice.cls}">${invoice.text}</span></td>
        <td class="td-sub">${fmtDate(order.pushedAt)}</td>
        <td><button type="button" class="admin-order-link" data-order-detail="${escapeHtml(order.id || '')}">查看详情</button></td>
      </tr>`;
    }).join('');
    $$('[data-order-detail]', $('#userDetailOrderBody')).forEach((button) => {
      button.addEventListener('click', () => openOrderDetail(button.dataset.orderDetail));
    });
  }

  /* ---------- 订单详情弹窗 ---------- */
  const orderDetailDialogLayer = $('#orderDetailDialogLayer');
  function openOrderDetail(orderId) {
    const order = userOrders(userDetailPhone).find((item) => item.id === orderId);
    if (!order) return;
    const items = Array.isArray(order.items) ? order.items : [];
    const origin = Number(order.originAmount) || Number(order.amount) || 0;
    const paid = Number(order.amount) || 0;
    const payStatus = PAY_STATUS_LABEL[order.status] || PAY_STATUS_LABEL.pending;
    const invoice = INVOICE_STATUS_LABEL[order.invoiceStatus] || INVOICE_STATUS_LABEL.none;
    const pay = PAY_METHOD_LABEL[orderPayMethod(order)] || '—';
    $('#orderDetailSub').textContent = `${order.phone || userDetailPhone}${order.username ? `（${order.username}）` : ''}`;
    const rows = items.map((item) => {
      const term = Number(item.term) || 1;
      const price = Number(item.price) || 0;
      return `<tr>
        <td>${escapeHtml(item.name || '—')}</td>
        <td class="is-num">${term} 年</td>
        <td class="is-num">${money(price)}</td>
        <td class="is-num">${money(price * term)}</td>
      </tr>`;
    }).join('');
    const discount = origin > paid
      ? `<span>原价 <del>${money(origin)}</del>，已优惠 ${money(origin - paid)}</span>`
      : '';
    $('#orderDetailBody').innerHTML = `
      <div class="admin-od-summary">
        <div class="admin-od-row"><span>订单编号</span><b class="is-mono">${escapeHtml(order.id || '—')}</b></div>
        <div class="admin-od-row"><span>用户ID</span><b class="is-mono">${escapeHtml((users[order.phone] || {}).uid || '—')}</b></div>
        <div class="admin-od-row"><span>订单时间</span><b>${fmtDate(order.pushedAt)}</b></div>
        <div class="admin-od-row"><span>支付方式</span><b>${escapeHtml(pay)}</b></div>
        <div class="admin-od-row"><span>经办人</span><b>${orderPayMethod(order) === 'offline' ? escapeHtml(orderOperator(order)) : '—'}</b></div>
        <div class="admin-od-row"><span>支付状态</span><b><span class="admin-badge ${payStatus.cls}">${payStatus.text}</span></b></div>
        <div class="admin-od-row"><span>发票状态</span><b><span class="admin-badge ${invoice.cls}">${invoice.text}</span></b></div>
        ${order.paidAt ? `<div class="admin-od-row"><span>支付时间</span><b>${fmtDate(order.paidAt)}</b></div>` : ''}
      </div>
      <h4 class="admin-od-title">服务明细<span>${items.length} 项</span></h4>
      <table class="admin-table admin-od-table">
        <thead><tr><th>产业链名称</th><th class="is-num">服务年限</th><th class="is-num">成交单价</th><th class="is-num">小计</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="admin-detail-empty">该订单无服务明细</td></tr>'}</tbody>
      </table>
      <div class="admin-od-total">${discount}<span>实付金额</span><b class="admin-od-paid">${money(paid)}</b></div>`;
    // 申请中的订单可在详情底部直接发起发票开具，其他状态仅提供关闭
    const uploadBtn = $('#orderDetailUploadInvoice');
    uploadBtn.hidden = (order.invoiceStatus || 'none') !== 'pending';
    uploadBtn.onclick = () => openInvoiceIssue(order.id);
    openDialogLayer(orderDetailDialogLayer);
  }
  function closeOrderDetail() { closeDialogLayer(orderDetailDialogLayer); }
  $('#orderDetailClose').addEventListener('click', closeOrderDetail);
  $('#orderDetailOk').addEventListener('click', closeOrderDetail);
  orderDetailDialogLayer.addEventListener('click', (event) => { if (event.target === orderDetailDialogLayer) closeOrderDetail(); });

  /* ---------- 订单管理：筛选 / 统计 / 列表 / 导出 ---------- */
  const ORDER_PAGE_SIZE = 10;
  const orderFilters = { pay: '', status: '', invoice: '', start: '', end: '', keyword: '' };
  let orderPage = 1;
  // 经办人：订单落库时未记录操作人，按来源演示回填；后续新订单由开通时写入 operator
  const orderOperator = (order) => order.operator || (order.source === 'admin' ? '管理员' : '用户');

  function allOrders() {
    const all = readJson(ORDERS_KEY, []);
    return Array.isArray(all) ? all : [];
  }

  function filteredOrders() {
    const key = orderFilters.keyword;
    const list = allOrders().filter((order) => {
      if (!order) return false;
      if (orderFilters.pay && orderPayMethod(order) !== orderFilters.pay) return false;
      if (orderFilters.status && (order.status || 'pending') !== orderFilters.status) return false;
      if (orderFilters.invoice && (order.invoiceStatus || 'none') !== orderFilters.invoice) return false;
      const day = String(order.pushedAt || '').slice(0, 10);
      if (orderFilters.start && (!day || day < orderFilters.start)) return false;
      if (orderFilters.end && (!day || day > orderFilters.end)) return false;
      if (key) {
        const uid = String((users[order.phone] || {}).uid || '');
        const haystack = [order.id, order.phone, uid, orderOperator(order), order.username].join(' ').toLowerCase();
        if (!haystack.includes(key)) return false;
      }
      return true;
    });
    if (tableSortState['order-time'] !== 'default') {
      const dir = sortDirection('order-time');
      list.sort((a, b) => dir * String(a.pushedAt || '').localeCompare(String(b.pushedAt || '')));
    } else {
      list.sort((a, b) => String(b.pushedAt || '').localeCompare(String(a.pushedAt || '')));
    }
    return list;
  }

  function renderOrderSummary(list) {
    const total = list.reduce((sum, order) => sum + (Number(order.originAmount) || Number(order.amount) || 0), 0);
    const paid = list.reduce((sum, order) => sum + (order.status === 'paid' ? (Number(order.amount) || 0) : 0), 0);
    $('#orderSummary').innerHTML = `
      <div class="admin-order-stat"><span>订单金额</span><b>${money(total)}<em>元</em></b></div>
      <div class="admin-order-stat is-paid"><span>实付金额</span><b>${money(paid)}<em>元</em></b></div>
      <div class="admin-order-stat"><span>订单笔数</span><b>${list.length}<em>笔</em></b></div>`;
  }

  function renderOrders() {
    const tbody = $('#orderTableBody');
    if (!tbody) return;
    const list = filteredOrders();
    const totalPages = Math.max(1, Math.ceil(list.length / ORDER_PAGE_SIZE));
    if (orderPage > totalPages) orderPage = totalPages;
    const pageRows = list.slice((orderPage - 1) * ORDER_PAGE_SIZE, orderPage * ORDER_PAGE_SIZE);
    renderOrderSummary(list);
    $('#orderEmpty').hidden = list.length > 0;
    tbody.innerHTML = pageRows.map((order) => {
      const pay = PAY_METHOD_LABEL[orderPayMethod(order)] || '—';
      const status = PAY_STATUS_LABEL[order.status] || PAY_STATUS_LABEL.pending;
      const invoice = INVOICE_STATUS_LABEL[order.invoiceStatus] || INVOICE_STATUS_LABEL.none;
      const origin = Number(order.originAmount) || Number(order.amount) || 0;
      const paid = Number(order.amount) || 0;
      const discount = origin > paid ? `<em class="admin-order-off">已优惠 ${money(origin - paid)}</em>` : '';
      const operatorCell = orderPayMethod(order) === 'offline' ? escapeHtml(orderOperator(order)) : '—';
      const invoiceState = order.invoiceStatus || 'none';
      let invoiceActions = '';
      if (invoiceState === 'pending') {
        invoiceActions = `<button type="button" class="admin-invoice-icon" title="上传发票" data-order-invoice-issue="${escapeHtml(order.id || '')}"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg></button>`;
      } else if (invoiceState === 'done') {
        invoiceActions = `<button type="button" class="admin-invoice-icon" title="查看发票" data-order-invoice-view="${escapeHtml(order.id || '')}"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg></button>`;
      }
      return `<tr>
        <td class="admin-order-id">${escapeHtml(order.id || '—')}</td>
        <td class="td-sub">${escapeHtml((users[order.phone] || {}).uid || '—')}</td>
        <td>${escapeHtml(order.phone || '—')}${order.username ? `<span class="admin-cell-sub">${escapeHtml(order.username)}</span>` : ''}</td>
        <td class="admin-order-money">${money(origin)}</td>
        <td class="admin-order-paid">${money(paid)}${discount}</td>
        <td class="td-sub">${fmtDate(order.pushedAt)}</td>
        <td>${pay}</td>
        <td>${operatorCell}</td>
        <td><span class="admin-badge ${status.cls}">${status.text}</span></td>
        <td><span class="admin-invoice-cell"><span class="admin-badge ${invoice.cls}">${invoice.text}</span>${invoiceActions}</span></td>
        <td><button type="button" class="admin-order-link" data-order-manage-detail="${escapeHtml(order.id || '')}">详情</button></td>
      </tr>`;
    }).join('');
    $$('[data-order-manage-detail]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const order = allOrders().find((item) => item && item.id === button.dataset.orderManageDetail);
        if (!order) return;
        // 复用用户详情的订单详情弹窗
        userDetailPhone = order.phone || userDetailPhone;
        openOrderDetail(order.id);
      });
    });
    $$('[data-order-invoice-issue]', tbody).forEach((button) => {
      button.addEventListener('click', () => openInvoiceIssue(button.dataset.orderInvoiceIssue));
    });
    $$('[data-order-invoice-view]', tbody).forEach((button) => {
      button.addEventListener('click', () => openInvoiceView(button.dataset.orderInvoiceView));
    });
    renderOrderPager(list.length, totalPages);
  }

  function renderOrderPager(total, totalPages) {
    const pager = $('#orderPager');
    if (!pager) return;
    pager.hidden = total === 0;
    $('#orderPagerTotal').textContent = `共 ${total} 条`;
    const buttons = $('#orderPagerBtns');
    let html = `<button type="button" class="admin-pager-btn" data-order-page="prev" ${orderPage <= 1 ? 'disabled' : ''}>上一页</button>`;
    for (let p = 1; p <= totalPages; p += 1) {
      html += `<button type="button" class="admin-pager-btn${p === orderPage ? ' is-active' : ''}" data-order-page="${p}">${p}</button>`;
    }
    html += `<button type="button" class="admin-pager-btn" data-order-page="next" ${orderPage >= totalPages ? 'disabled' : ''}>下一页</button>`;
    buttons.innerHTML = html;
    $$('[data-order-page]', buttons).forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.orderPage === 'prev') orderPage -= 1;
        else if (button.dataset.orderPage === 'next') orderPage += 1;
        else orderPage = Number(button.dataset.orderPage);
        renderOrders();
      });
    });
  }

  function exportOrders() {
    const list = filteredOrders();
    if (!list.length) return toast('暂无可导出的订单');
    const header = ['订单编号', '用户ID', '账号/手机号', '用户名', '订单金额(元)', '实付金额(元)', '订单时间', '支付方式', '经办人', '支付状态', '发票状态', '开通服务'];
    const rows = list.map((order) => {
      const names = (Array.isArray(order.items) ? order.items : []).map((item) => `${item.name}(${item.term}年)`).join('、');
      return [
        order.id, (users[order.phone] || {}).uid || '', order.phone || '', order.username || '',
        Number((Number(order.originAmount) || Number(order.amount) || 0).toFixed(2)),
        Number((Number(order.amount) || 0).toFixed(2)),
        fmtDate(order.pushedAt), PAY_METHOD_LABEL[orderPayMethod(order)] || '',
        orderPayMethod(order) === 'offline' ? orderOperator(order) : '—',
        (PAY_STATUS_LABEL[order.status] || PAY_STATUS_LABEL.pending).text,
        (INVOICE_STATUS_LABEL[order.invoiceStatus] || INVOICE_STATUS_LABEL.none).text, names
      ];
    });
    if (!window.WuduXlsx) return toast('导出组件未加载，请刷新页面重试');
    const stamp = new Date().toISOString().slice(0, 10);
    window.WuduXlsx.download(`订单清单_${stamp}.xlsx`, {
      name: '订单清单',
      header,
      rows,
      widths: [22, 10, 16, 14, 14, 14, 22, 12, 12, 12, 12, 30]
    });
    toast(`已导出 ${list.length} 条订单`);
  }

  $('#orderPayFilter').addEventListener('change', (event) => { orderFilters.pay = event.target.value; orderPage = 1; renderOrders(); });
  $('#orderStatusFilter').addEventListener('change', (event) => { orderFilters.status = event.target.value; orderPage = 1; renderOrders(); });
  $('#orderInvoiceFilter').addEventListener('change', (event) => { orderFilters.invoice = event.target.value; orderPage = 1; renderOrders(); });
  $('#orderStart').addEventListener('change', (event) => { orderFilters.start = event.target.value; orderPage = 1; renderOrders(); });
  $('#orderEnd').addEventListener('change', (event) => { orderFilters.end = event.target.value; orderPage = 1; renderOrders(); });
  $('#orderSearchInput').addEventListener('input', (event) => { orderFilters.keyword = event.target.value.trim().toLowerCase(); orderPage = 1; renderOrders(); });
  $('#orderExport').addEventListener('click', exportOrders);

  /* ---------- 发票：开具 / 合并订单 / 查看发票 ---------- */
  const invoiceIssueLayer = $('#invoiceIssueDialogLayer');
  const invoiceMergeLayer = $('#invoiceMergeDialogLayer');
  const invoiceViewLayer = $('#invoiceViewDialogLayer');
  let invoiceIssueOrders = []; // 当前发票开具弹窗关联订单
  let invoiceIssueFiles = [];  // 已选择的附件

  function findOrder(orderId) {
    return allOrders().find((item) => item && item.id === orderId);
  }
  function invoiceMoney(value) {
    return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function invoiceStamp(iso) {
    const d = new Date(iso || Date.now());
    if (Number.isNaN(d.getTime())) return fmtDate(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  const invoiceStatusOf = (order) => order.invoiceStatus || 'none';
  function uniqueOrders(orders) {
    const seen = new Set();
    return (Array.isArray(orders) ? orders : [orders]).filter((o) => {
      if (!o || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }
  function invoiceApplyOf(order) {
    return {
      type: order.invoiceType || '普通发票',
      company: order.invoiceCompany || '未填写',
      taxNo: order.invoiceTaxNo || '—',
      format: order.invoiceFormat || 'PDF格式',
      address: order.invoiceAddress || '--',
      phone: order.invoicePhone || '--',
      bank: order.invoiceBank || '--',
      bankNo: order.invoiceBankNo || '--',
      remark: order.invoiceRemark || '--'
    };
  }
  function invoiceApplyKey(order) {
    const a = invoiceApplyOf(order);
    return [a.company, a.taxNo, a.format].join('|');
  }
  const invoiceAmount = (order) => Number(order.amount) || Number(order.originAmount) || 0;
  const invoiceGroupAmount = (orders) => orders.reduce((sum, o) => sum + invoiceAmount(o), 0);
  function invoiceServiceLabel(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item) => item.name).join('、') || '—';
  }
  function invoiceGroupOrders(order) {
    if (invoiceStatusOf(order) !== 'done' || !order.invoiceGroupId) return [order];
    const group = allOrders().filter((item) => item.invoiceGroupId === order.invoiceGroupId && invoiceStatusOf(item) === 'done');
    return group.length > 1 ? group : [order];
  }
  function invoiceFileNamesOf(orders) {
    const withFiles = orders.find((o) => Array.isArray(o.invoiceFiles) && o.invoiceFiles.length);
    return withFiles ? withFiles.invoiceFiles : [`订单${orders[0] ? orders[0].id : ''}-电子发票.pdf`];
  }
  function invoiceIssuedTimeOf(orders) {
    const issued = orders.find((o) => o.invoiceTime);
    if (issued) return issued.invoiceTime;
    const paid = orders.find((o) => o.paidAt);
    return paid ? fmtDate(paid.paidAt) : fmtDate(orders[0] && orders[0].pushedAt);
  }
  const invoiceInfoRow = (label, value) => `<div class="admin-invoice-info-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || '—')}</b></div>`;
  function invoiceApplyInfoHtml(orders, mode) {
    const apply = invoiceApplyOf(orders[0] || {});
    return `
      ${mode === 'view' ? `<div class="admin-invoice-issued-time">开票时间：${escapeHtml(invoiceIssuedTimeOf(orders))}</div>` : ''}
      <section class="admin-invoice-panel">
        <h4 class="admin-invoice-section-title">发票申请信息</h4>
        <div class="admin-invoice-info-grid">
          ${invoiceInfoRow('发票类型', apply.type)}
          ${invoiceInfoRow('公司名称', apply.company)}
          ${invoiceInfoRow('纳税人识别号', apply.taxNo)}
          ${invoiceInfoRow('发票格式', apply.format)}
          <details class="admin-invoice-extra">
            <summary><span>选填信息</span><em>地址、电话、备注等</em><i><svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></i></summary>
            <div class="admin-invoice-extra-grid">
              ${invoiceInfoRow('公司地址', apply.address)}
              ${invoiceInfoRow('公司电话', apply.phone)}
              ${invoiceInfoRow('开户行', apply.bank)}
              ${invoiceInfoRow('开户行账号', apply.bankNo)}
              ${invoiceInfoRow('备注', apply.remark)}
            </div>
          </details>
        </div>
        <div class="admin-invoice-amount-row"><span>开票金额：</span><b>¥${invoiceMoney(invoiceGroupAmount(orders))}</b><em>共1张发票${orders.length > 1 ? ` · 关联${orders.length}笔订单` : ''}</em></div>
      </section>`;
  }
  function invoiceOrderTableHtml(orders) {
    const rows = orders.map((o) => `<tr>
      <td class="is-mono">${escapeHtml(o.id || '—')}</td>
      <td>${escapeHtml(invoiceServiceLabel(o))}</td>
      <td class="is-amount">¥${invoiceMoney(invoiceAmount(o))}</td>
    </tr>`).join('');
    const totalRow = orders.length > 1 ? `<tr class="is-total"><td colspan="2">合计</td><td class="is-amount">¥${invoiceMoney(invoiceGroupAmount(orders))}</td></tr>` : '';
    return `<div class="admin-invoice-table-wrap"><table class="admin-table admin-invoice-order-table">
      <thead><tr><th>订单编号</th><th>已开通服务</th><th>实付金额</th></tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table></div>`;
  }
  function invoiceMergeCandidates(orders) {
    const selected = new Set(orders.map((o) => o.id));
    const key = invoiceApplyKey(orders[0] || {});
    return allOrders().filter((o) => !selected.has(o.id) && invoiceStatusOf(o) === 'pending' && invoiceApplyKey(o) === key);
  }
  function invoiceMergeButtonHtml(orders) {
    const count = invoiceMergeCandidates(orders).length;
    return `<div class="admin-invoice-order-head">
      <h4 class="admin-invoice-section-title">关联订单</h4>
      <button type="button" class="admin-invoice-merge-btn" id="invoiceIssueMergeBtn">+ 添加合并订单${count ? `<span>${count}笔可选</span>` : ''}</button>
    </div>`;
  }
  function invoiceAttachmentListHtml(orders) {
    return `<div class="admin-invoice-attachment-list">${invoiceFileNamesOf(orders).map((name, index) => `
      <div class="admin-invoice-attachment-row">
        <span class="admin-invoice-file-icon"><svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/></svg></span>
        <span class="admin-invoice-attachment-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <span class="admin-invoice-attachment-actions">
          <button type="button" class="admin-invoice-file-action" data-invoice-preview="${index}" title="预览"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg></button>
          <button type="button" class="admin-invoice-file-action" data-invoice-download="${index}" title="下载"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5"/><path d="M4 19h16"/></svg></button>
        </span>
      </div>`).join('')}</div>`;
  }
  function invoiceUploadPanelHtml() {
    return `<section class="admin-invoice-panel">
      <div class="admin-invoice-upload-head"><h4 class="admin-invoice-section-title">附件回执</h4><button type="button" class="admin-btn admin-btn-mini" id="invoiceIssueAddFile" hidden>上传附件</button></div>
      <p class="admin-invoice-requirement">请按用户提交的发票信息开具，可上传发票及随票票据，附件支持 PDF、XML、OFD 格式。</p>
      <input type="file" id="invoiceIssueFile" accept=".pdf,.xml,.ofd" multiple hidden />
      <div class="admin-invoice-upload-box" id="invoiceIssueDrop">
        <span class="admin-invoice-upload-plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>
        <span class="admin-invoice-upload-text" id="invoiceIssueFileName">点击添加，或拖拽至此处</span>
        <em>可上传多个文件，支持 PDF、XML、OFD 格式</em>
      </div>
      <div class="admin-invoice-file-list" id="invoiceIssueFileList"></div>
    </section>`;
  }
  function renderInvoiceIssueBody() {
    $('#invoiceIssueBody').innerHTML = `<div class="admin-invoice-layout">
      ${invoiceApplyInfoHtml(invoiceIssueOrders, 'issue')}
      ${invoiceMergeButtonHtml(invoiceIssueOrders)}
      ${invoiceOrderTableHtml(invoiceIssueOrders)}
      ${invoiceUploadPanelHtml()}
    </div>`;
    $('#invoiceIssueMergeBtn').addEventListener('click', openInvoiceMerge);
    bindInvoiceUploadControls();
  }
  function bindInvoiceUploadControls() {
    const fileInput = $('#invoiceIssueFile');
    const drop = $('#invoiceIssueDrop');
    const addBtn = $('#invoiceIssueAddFile');
    const renderFiles = () => {
      $('#invoiceIssueFileList').innerHTML = invoiceIssueFiles.map((file, index) => `
        <div class="admin-invoice-file-row">
          <span class="admin-invoice-file-icon"><svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/></svg></span>
          <span class="admin-invoice-file-name">${escapeHtml(file.name)}</span>
          <button type="button" class="admin-invoice-file-remove" data-invoice-file-remove="${index}" title="删除附件"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg></button>
        </div>`).join('');
      $('#invoiceIssueFileName').textContent = invoiceIssueFiles.length ? `已选择 ${invoiceIssueFiles.length} 个文件` : '点击添加，或拖拽至此处';
      drop.hidden = invoiceIssueFiles.length > 0;
      addBtn.hidden = invoiceIssueFiles.length === 0;
    };
    const addFiles = (files) => {
      const incoming = Array.from(files || []);
      const valid = incoming.filter((file) => /\.(pdf|xml|ofd)$/i.test(file.name || ''));
      if (incoming.length && valid.length !== incoming.length) toast('仅支持 PDF、XML、OFD 格式');
      invoiceIssueFiles = invoiceIssueFiles.concat(valid.map((file) => ({ name: file.name, size: file.size })));
      renderFiles();
      if (fileInput) fileInput.value = '';
    };
    fileInput.addEventListener('change', () => addFiles(fileInput.files));
    drop.addEventListener('click', () => fileInput.click());
    addBtn.addEventListener('click', () => fileInput.click());
    $('#invoiceIssueFileList').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-invoice-file-remove]');
      if (!btn) return;
      invoiceIssueFiles.splice(Number(btn.dataset.invoiceFileRemove), 1);
      renderFiles();
    });
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove('is-dragover'); }));
    drop.addEventListener('drop', (event) => addFiles(event.dataTransfer && event.dataTransfer.files));
    renderFiles();
  }
  function openInvoiceIssue(target) {
    const orders = Array.isArray(target) ? uniqueOrders(target) : uniqueOrders([findOrder(target)]);
    if (!orders.length) return toast('订单不存在');
    invoiceIssueOrders = orders;
    invoiceIssueFiles = [];
    renderInvoiceIssueBody();
    openDialogLayer(invoiceIssueLayer);
  }
  function closeInvoiceIssue() { closeDialogLayer(invoiceIssueLayer); invoiceIssueOrders = []; invoiceIssueFiles = []; }
  function renderUserDetailOrdersIfOpen() {
    if (userDetailDialogLayer.classList.contains('is-open') && userDetailPhone) renderUserDetailOrders(userDetailPhone);
  }
  function submitInvoiceIssue() {
    if (!invoiceIssueFiles.length) return toast('请选择发票附件');
    const orders = allOrders();
    const groupId = invoiceIssueOrders.length > 1
      ? (invoiceIssueOrders.find((o) => o.invoiceGroupId) || {}).invoiceGroupId || `INV-MERGE-${String(Date.now()).slice(-8)}`
      : '';
    const apply = invoiceApplyOf(invoiceIssueOrders[0]);
    const fileNames = invoiceIssueFiles.map((file) => file.name);
    const time = invoiceStamp(new Date().toISOString());
    invoiceIssueOrders.forEach((linked) => {
      const order = orders.find((item) => item && item.id === linked.id);
      if (!order) return;
      order.invoiceStatus = 'done';
      order.invoiceTime = time;
      order.invoiceFiles = [...fileNames];
      Object.assign(order, {
        invoiceType: apply.type, invoiceCompany: apply.company, invoiceTaxNo: apply.taxNo,
        invoiceFormat: apply.format, invoiceAddress: apply.address, invoicePhone: apply.phone,
        invoiceBank: apply.bank, invoiceBankNo: apply.bankNo, invoiceRemark: apply.remark
      });
      if (groupId) order.invoiceGroupId = groupId;
    });
    writeJson(ORDERS_KEY, orders);
    closeInvoiceIssue();
    renderOrders();
    renderUserDetailOrdersIfOpen();
    toast('发票已上传');
  }
  function openInvoiceMerge() {
    const candidates = invoiceMergeCandidates(invoiceIssueOrders);
    $('#invoiceMergeTableBody').innerHTML = candidates.length ? candidates.map((o) => `
      <tr>
        <td class="th-check"><input type="checkbox" class="admin-check" data-invoice-merge-check="${escapeHtml(o.id)}" aria-label="选择订单 ${escapeHtml(o.id)}" /></td>
        <td class="is-mono">${escapeHtml(o.id)}</td>
        <td>${escapeHtml(o.phone || '—')}</td>
        <td>${escapeHtml(invoiceServiceLabel(o))}</td>
        <td class="is-amount">¥${invoiceMoney(invoiceAmount(o))}</td>
        <td class="td-sub">${fmtDate(o.pushedAt)}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="admin-detail-empty">暂无可合并订单</td></tr>';
    openDialogLayer(invoiceMergeLayer);
  }
  function closeInvoiceMerge() { closeDialogLayer(invoiceMergeLayer); }
  function confirmInvoiceMerge() {
    const selected = $$('[data-invoice-merge-check]:checked', $('#invoiceMergeTableBody'))
      .map((box) => findOrder(box.dataset.invoiceMergeCheck)).filter(Boolean);
    if (!selected.length) return toast('请选择需要合并的订单');
    invoiceIssueOrders = uniqueOrders(invoiceIssueOrders.concat(selected));
    closeInvoiceMerge();
    renderInvoiceIssueBody();
  }
  function openInvoiceView(orderId) {
    const order = findOrder(orderId);
    if (!order) return toast('订单不存在');
    const orders = invoiceGroupOrders(order);
    $('#invoiceViewBody').innerHTML = `<div class="admin-invoice-layout">
      ${invoiceApplyInfoHtml(orders, 'view')}
      <section class="admin-invoice-panel">
        <div class="admin-invoice-order-head"><h4 class="admin-invoice-section-title">关联订单</h4></div>
        ${invoiceOrderTableHtml(orders)}
      </section>
      <section class="admin-invoice-panel">
        <h4 class="admin-invoice-section-title">发票附件</h4>
        ${invoiceAttachmentListHtml(orders)}
      </section>
    </div>`;
    $$('[data-invoice-preview]', $('#invoiceViewBody')).forEach((button) => button.addEventListener('click', () => toast('发票预览已打开')));
    $$('[data-invoice-download]', $('#invoiceViewBody')).forEach((button) => button.addEventListener('click', () => toast('发票下载任务已创建')));
    openDialogLayer(invoiceViewLayer);
  }
  function closeInvoiceView() { closeDialogLayer(invoiceViewLayer); }

  $('#invoiceIssueClose').addEventListener('click', closeInvoiceIssue);
  $('#invoiceIssueCancel').addEventListener('click', closeInvoiceIssue);
  $('#invoiceIssueConfirm').addEventListener('click', submitInvoiceIssue);
  invoiceIssueLayer.addEventListener('click', (event) => { if (event.target === invoiceIssueLayer) closeInvoiceIssue(); });
  $('#invoiceMergeClose').addEventListener('click', closeInvoiceMerge);
  $('#invoiceMergeCancel').addEventListener('click', closeInvoiceMerge);
  $('#invoiceMergeConfirm').addEventListener('click', confirmInvoiceMerge);
  invoiceMergeLayer.addEventListener('click', (event) => { if (event.target === invoiceMergeLayer) closeInvoiceMerge(); });
  $('#invoiceViewClose').addEventListener('click', closeInvoiceView);
  $('#invoiceViewOk').addEventListener('click', closeInvoiceView);
  invoiceViewLayer.addEventListener('click', (event) => { if (event.target === invoiceViewLayer) closeInvoiceView(); });

  function openUserDetail(phone) {
    const record = users[phone] || {};
    const paid = record.type === 'paid';
    const disabled = userStatus(record) === 'disabled';
    userDetailPhone = phone;
    userDetailChainExpanded = false;
    userDetailChainQuery = '';
    $('#userDetailChainSearch').value = '';
    $('#userDetailSub').textContent = `${phone}${record.username ? `（${record.username}）` : ''}`;
    // 顶部概览：开通服务数 / 累计订单 / 累计实付
    const chainsCount = userChainList(record).length;
    const orders = userOrders(phone);
    const paidSum = orders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    $('#userDetailStats').innerHTML = `
      <div class="admin-user-stat is-primary"><span>已开通服务</span><b>${chainsCount}<em>条</em></b></div>
      <div class="admin-user-stat"><span>累计订单</span><b>${orders.length}<em>笔</em></b></div>
      <div class="admin-user-stat"><span>累计实付</span><b>${money(paidSum)}</b></div>`;
    $('#userDetailList').innerHTML = `
      <div class="admin-detail-row"><span>用户ID</span><b>${escapeHtml(userUid(phone))}</b></div>
      <div class="admin-detail-row"><span>手机号</span><b>${escapeHtml(phone)}</b></div>
      <div class="admin-detail-row"><span>用户名</span><b>${record.username ? escapeHtml(record.username) : '未设置'}</b></div>
      <div class="admin-detail-row"><span>账号类型</span><b>${paid ? '收费会员' : '注册用户'}</b></div>
      <div class="admin-detail-row"><span>状态</span><b>${disabled ? '停用' : '正常'}</b></div>
      <div class="admin-detail-row"><span>注册时间</span><b>${fmtDate(record.createdAt)}</b></div>
      <div class="admin-detail-row"><span>最近登录</span><b>${fmtDate(record.lastLoginAt)}</b></div>`;
    renderUserDetailChains(record);
    renderUserDetailOrders(phone);
    setUserTab('basic');
    openDialogLayer(userDetailDialogLayer);
  }
  function closeUserDetailDialog() { closeDialogLayer(userDetailDialogLayer); }
  $('#userDetailDialogClose').addEventListener('click', closeUserDetailDialog);
  $('#userDetailDialogOk').addEventListener('click', closeUserDetailDialog);
  userDetailDialogLayer.addEventListener('click', (event) => { if (event.target === userDetailDialogLayer) closeUserDetailDialog(); });

  /* ---------- 密码重置确认弹窗 ---------- */
  const pwdResetDialogLayer = $('#pwdResetDialogLayer');
  let pwdResetTarget = '';
  function openPwdResetDialog(phone) {
    pwdResetTarget = phone;
    const record = users[phone] || {};
    $('#pwdResetDialogText').innerHTML = `确认将用户 <b>${escapeHtml(record.username || phone)}</b>（${escapeHtml(phone)}）的登录密码重置为初始密码？重置后请及时通知客户重新登录并修改密码。`;
    openDialogLayer(pwdResetDialogLayer);
  }
  function closePwdResetDialog() { closeDialogLayer(pwdResetDialogLayer); }
  $('#pwdResetDialogClose').addEventListener('click', closePwdResetDialog);
  $('#pwdResetDialogCancel').addEventListener('click', closePwdResetDialog);
  pwdResetDialogLayer.addEventListener('click', (event) => { if (event.target === pwdResetDialogLayer) closePwdResetDialog(); });
  // 重置为随机初始密码（2 位大写字母 + @ + 6 位数字），仅在重置成功提示中出现一次
  function randomResetPwd() {
    const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const digit = () => String.fromCharCode(48 + Math.floor(Math.random() * 10));
    return `${letter()}${letter()}@${digit()}${digit()}${digit()}${digit()}${digit()}${digit()}`;
  }
  $('#pwdResetDialogSave').addEventListener('click', () => {
    const record = users[pwdResetTarget];
    if (!record) return closePwdResetDialog();
    const initialPwd = randomResetPwd();
    record.password = initialPwd;
    saveUsers();
    closePwdResetDialog();
    toast(`密码已重置为初始密码：${initialPwd}`);
  });

  /* ---------- 添加账号弹窗 ---------- */
  const userAddDialogLayer = $('#userAddDialogLayer');
  function showUserAddError(message) {
    const box = $('#userAddError');
    box.hidden = false;
    box.textContent = message;
  }
  let userAddSelectedChains = new Set();
  let userAddCategory = '';
  let userAddQuery = '';
  const updateUserAddCategoryLabel = setupCategoryPicker('userAddCategoryPicker', 'userAddChainCategory', () => userAddCategory, (value) => {
    userAddCategory = value;
    renderUserAddChoices();
  });
  function renderUserAddChoices() {
    const catalog = serviceCatalog();
    const visibleCount = renderChainChoices($('#userAddChainList'), catalog, userAddSelectedChains, userAddCategory, userAddQuery);
    $('#userAddChainEmpty').hidden = visibleCount > 0;
    $('#userAddPriceRow').hidden = userAddSelectedChains.size === 0;
  }
  function openUserAddDialog() {
    $('#userAddPhone').value = '';
    $('#userAddUsername').value = '';
    $('#userAddPwd').value = randomResetPwd();
    $('#userAddError').hidden = true;
    $('#userAddError').textContent = '';
    userAddSelectedChains = new Set();
    userAddCategory = '';
    userAddQuery = '';
    $('#userAddTotalPrice').value = '';
    updateUserAddCategoryLabel();
    $('#userAddChainSearch').value = '';
    renderUserAddChoices();
    openDialogLayer(userAddDialogLayer);
    setTimeout(() => $('#userAddPhone').focus(), 60);
  }
  function closeUserAddDialog() { closeDialogLayer(userAddDialogLayer); }
  $('#userAddDialogClose').addEventListener('click', closeUserAddDialog);
  $('#userAddDialogCancel').addEventListener('click', closeUserAddDialog);
  $('#userAddChainSearch').addEventListener('input', (event) => {
    userAddQuery = event.target.value;
    renderUserAddChoices();
  });
  $('#userAddChainList').addEventListener('change', (event) => {
    const box = event.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) userAddSelectedChains.add(box.value);
    else userAddSelectedChains.delete(box.value);
    renderUserAddChoices();
  });
  userAddDialogLayer.addEventListener('click', (event) => { if (event.target === userAddDialogLayer) closeUserAddDialog(); });
  $('#userAddDialogSave').addEventListener('click', () => {
    const phone = $('#userAddPhone').value.trim();
    const username = $('#userAddUsername').value.trim();
    const pwdInput = $('#userAddPwd').value.trim();
    if (!/^1\d{10}$/.test(phone)) return showUserAddError('请输入有效的11位手机号');
    if (users[phone]) return showUserAddError('该手机号已存在，请勿重复添加');
    if (username) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return showUserAddError('用户名需为3-16位字母、数字或下划线');
      const duplicated = Object.keys(users).some((item) => String(users[item].username || '').toLowerCase() === username.toLowerCase());
      if (duplicated) return showUserAddError('该用户名已被使用，请更换');
    }
    if (pwdInput && (pwdInput.length < 6 || pwdInput.length > 18)) return showUserAddError('初始密码长度需为 6-18 位');
    const chains = [...userAddSelectedChains];
    // 添加账号时若同时开通服务，必须录入整体开通金额；多条产业链均分，逐条保留成交价
    let addPrices = {};
    if (chains.length) {
      const result = manualPrice($('#userAddTotalPrice').value);
      if (result.error) return showUserAddError(result.error);
      const base = Math.floor(result.amount / chains.length);
      const remainder = result.amount - base * chains.length;
      chains.forEach((name, index) => { addPrices[name] = base + (index < remainder ? 1 : 0); });
    }
    const now = new Date().toISOString();
    const record = { type: chains.length ? 'paid' : 'registered', status: 'active', createdAt: now, password: pwdInput || randomResetPwd() };
    if (username) record.username = username;
    if (chains.length) {
      record.chains = chains;
      record.chainOpenedAt = {};
      record.chainTerm = {};
      record.chainPrice = {};
      chains.forEach((name) => {
        record.chainOpenedAt[name] = now;
        record.chainTerm[name] = defaultServiceTerm(name);
        // 开通即冻结当次成交单价，所有已开通服务均有价格记录
        record.chainPrice[name] = Math.max(1, Math.round(addPrices[name] / Math.max(1, record.chainTerm[name])));
      });
    }
    users[phone] = record;
    ensureUserIds();
    saveUsers();
    closeUserAddDialog();
    renderUsers();
    toast(`已添加账号 ${phone}${chains.length ? `，并开通 ${chains.length} 条产业链` : ''}，用户ID ${userUid(phone)}，初始密码：${record.password}`);
  });

  renderUsers();

  /* ============================================================
   * 四、权限管理
   * ============================================================ */
  let adminAccounts = readJson(ACCOUNTS_KEY, null);
  if (!Array.isArray(adminAccounts)) {
    adminAccounts = [
      { name: '宋家辉', phone: '13800138000', account: 'admin', role: '超级管理员', status: '启用', builtin: true, lastLoginAt: '2026-11-16T09:30:00+08:00' },
      { name: '运营专员', phone: '13900139000', account: 'yunying01', role: '运营', status: '启用', lastLoginAt: '2026-11-15T18:04:00+08:00' },
      { name: '客服小五', phone: '13700137000', account: 'kefu05', role: '客服', status: '停用', lastLoginAt: '2026-11-08T11:26:00+08:00' }
    ];
    writeJson(ACCOUNTS_KEY, adminAccounts);
  } else {
    // 兼容旧数据：默认超级管理员唯一且不可删除，取现有第一条超管标记；账号固定为 admin
    let defaultSuper = adminAccounts.find((item) => item.builtin) || adminAccounts.find((item) => item.role === '超级管理员');
    let changed = false;
    if (defaultSuper && !defaultSuper.builtin) { defaultSuper.builtin = true; changed = true; }
    if (defaultSuper && defaultSuper.account !== 'admin' && !adminAccounts.some((item) => item !== defaultSuper && item.account === 'admin')) {
      defaultSuper.account = 'admin';
      changed = true;
    }
    if (changed) writeJson(ACCOUNTS_KEY, adminAccounts);
  }
  /* 权限树：六个业务模块，每个模块划分「仅查看 / 可管理」两级 */
  const PERM_MODULES = [
    { id: 'graph-display', label: '产业链展示', manageDesc: '含产业链管理、可见性、移动、标签管理、保存等操作' },
    { id: 'graph-price', label: '产业链价格', manageDesc: '含价格调整等操作' },
    { id: 'home', label: '首页管理', manageDesc: '含添加热词、移动、删除等操作' },
    { id: 'users', label: '用户管理', manageDesc: '含账号新增、编辑、删除等操作' },
    { id: 'account-manage', label: '管理员账号', manageDesc: '含账号新增、编辑、删除等操作' },
    { id: 'role-manage', label: '角色管理', manageDesc: '含角色新增、编辑、删除等操作' }
  ];
  const PERM_TREE = PERM_MODULES.map((module) => ({
    id: module.id,
    label: module.label,
    children: [
      { id: `${module.id}-view`, label: '仅查看' },
      { id: `${module.id}-manage`, label: '可管理', desc: module.manageDesc }
    ]
  }));
  const PERM_LEAVES_BY_MODULE = Object.fromEntries(PERM_MODULES.map((module) => [module.id, [`${module.id}-view`, `${module.id}-manage`]]));
  const PERM_LEAVES = PERM_MODULES.flatMap((module) => PERM_LEAVES_BY_MODULE[module.id]);
  const leavesOfModules = (...ids) => ids.flatMap((id) => PERM_LEAVES_BY_MODULE[id] || []);
  // 旧版本按模块/功能点授权，统一升级为对应模块的「仅查看 + 可管理」
  const legacyPermMap = {
    '产业图谱管理': ['graph-display', 'graph-price'], graph: ['graph-display', 'graph-price'],
    '产业链展示': ['graph-display'], 'graph-display': ['graph-display'],
    '产业链价格': ['graph-price'], 'graph-price': ['graph-price'],
    '首页管理': ['home'], home: ['home'], 'home-hot': ['home'],
    '用户管理': ['users'], users: ['users'],
    'users-list': ['users'], 'users-detail': ['users'], 'users-pwd': ['users'],
    'users-status': ['users'], 'users-service': ['users'], 'users-export': ['users'], 'users-orders': ['users'],
    '权限管理': ['account-manage', 'role-manage'], perms: ['account-manage', 'role-manage'],
    '管理员账号': ['account-manage'], 'account-manage': ['account-manage'], accounts: ['account-manage'],
    '角色管理': ['role-manage'], 'role-manage': ['role-manage'], roles: ['role-manage']
  };
  const legacyPermToLeaves = (item) => {
    if (PERM_LEAVES.includes(item)) return [item];
    return leavesOfModules(...(legacyPermMap[item] || []));
  };
  let roles = readJson(ROLES_KEY, null);
  if (!Array.isArray(roles)) {
    roles = [
      { role: '超级管理员', perms: [...PERM_LEAVES], status: '正常', createdAt: '2026-11-01T09:12:40+08:00', builtin: true },
      { role: '运营', perms: leavesOfModules('graph-display', 'graph-price', 'home', 'users'), status: '正常', createdAt: '2026-11-05T14:23:10+08:00' },
      { role: '客服', perms: leavesOfModules('users'), status: '正常', createdAt: '2026-11-08T11:45:17+08:00' },
      { role: '数据维护', perms: leavesOfModules('graph-display', 'graph-price'), status: '正常', createdAt: '2026-11-10T16:30:21+08:00' }
    ];
    writeJson(ROLES_KEY, roles);
  } else {
    // 兼容旧数据：旧权限 id 展开为新叶子 id；可管理自动补齐仅查看；补状态与创建时间
    let changed = false;
    roles.forEach((role, index) => {
      const expanded = [];
      (role.perms || []).forEach((item) => {
        legacyPermToLeaves(item).forEach((leaf) => { if (!expanded.includes(leaf)) expanded.push(leaf); });
      });
      PERM_MODULES.forEach((module) => {
        const view = `${module.id}-view`;
        if (expanded.includes(`${module.id}-manage`) && !expanded.includes(view)) expanded.push(view);
      });
      if (expanded.join('|') !== (role.perms || []).join('|')) { role.perms = expanded; changed = true; }
      if (!role.status) { role.status = '正常'; changed = true; }
      if (!role.createdAt) { role.createdAt = new Date(Date.now() - (roles.length - index) * 86400000).toISOString(); changed = true; }
    });
    const superRole = roles.find((item) => item.role === '超级管理员');
    if (superRole) {
      if (!superRole.builtin) { superRole.builtin = true; changed = true; }
      if (superRole.perms.join('|') !== PERM_LEAVES.join('|')) { superRole.perms = [...PERM_LEAVES]; changed = true; }
      if (superRole.status !== '正常') { superRole.status = '正常'; changed = true; }
    }
    if (changed) writeJson(ROLES_KEY, roles);
  }

  const accountFilters = { keyword: '', role: '', status: '', loginStart: '', loginEnd: '' };
  const accountSelection = new Set();
  function syncAccountRoleFilter() {
    const select = $('#accountRoleFilter');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">全部角色</option>' + roles.map((role) => `<option value="${escapeHtml(role.role)}">${escapeHtml(role.role)}</option>`).join('');
    if ([...select.options].some((option) => option.value === current)) select.value = current;
    else { select.value = ''; accountFilters.role = ''; }
  }
  function filteredAccounts() {
    const list = adminAccounts.filter((account) => {
      if (accountFilters.keyword && ![account.name, account.phone, account.account].some((value) => String(value || '').toLowerCase().includes(accountFilters.keyword))) return false;
      if (accountFilters.role && account.role !== accountFilters.role) return false;
      if (accountFilters.status && (account.status || '启用') !== accountFilters.status) return false;
      const loginDay = String(account.lastLoginAt || '').slice(0, 10);
      if (accountFilters.loginStart && (!loginDay || loginDay < accountFilters.loginStart)) return false;
      if (accountFilters.loginEnd && (!loginDay || loginDay > accountFilters.loginEnd)) return false;
      return true;
    });
    if (tableSortState['account-login'] !== 'default') {
      const dir = sortDirection('account-login');
      list.sort((a, b) => dir * String(a.lastLoginAt || '').localeCompare(String(b.lastLoginAt || '')));
    }
    return list;
  }

  function renderAccounts() {
    const tbody = $('#accountTableBody');
    const list = filteredAccounts();
    const visibleAccounts = new Set(list.map((account) => account.account));
    [...accountSelection].forEach((value) => { if (!visibleAccounts.has(value)) accountSelection.delete(value); });
    $('#accountEmpty').hidden = list.length > 0;
    tbody.innerHTML = list.map((account) => {
      const index = adminAccounts.indexOf(account);
      const locked = !!account.builtin;
      return `
      <tr>
        <td class="th-check"><input type="checkbox" class="admin-check" data-account-check="${escapeHtml(account.account)}" ${accountSelection.has(account.account) ? 'checked' : ''} ${locked ? 'disabled title="默认超级管理员不可批量操作"' : ''} aria-label="选择账号${escapeHtml(account.account)}" /></td>
        <td>${escapeHtml(account.name)}</td>
        <td>${account.phone ? escapeHtml(account.phone) : '<span class="td-sub">未绑定</span>'}</td>
        <td>${escapeHtml(account.account)}</td>
        <td>${escapeHtml(account.role)}</td>
        <td><span class="admin-badge ${account.status === '启用' ? 'ok' : 'disabled'}">${escapeHtml(account.status)}</span></td>
        <td class="td-sub">${fmtDate(account.lastLoginAt)}</td>
        <td><span class="admin-cell-actions">
          <button type="button" class="admin-row-btn" title="编辑" data-account-edit="${index}"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button type="button" class="admin-row-btn" title="${account.builtin ? '默认超级管理员不可停用' : (account.status === '启用' ? '停用' : '启用')}" data-account-toggle="${index}" ${account.builtin ? 'disabled' : ''}><svg viewBox="0 0 24 24">${account.status === '启用' ? '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>' : '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/>'}</svg></button>
          <button type="button" class="admin-row-btn" title="修改密码" data-account-pwd="${index}"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></button>
          <button type="button" class="admin-row-btn is-danger" title="${account.builtin ? '默认超级管理员不可删除' : '删除'}" data-account-remove="${index}" ${account.builtin ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>
        </span></td>
      </tr>`;
    }).join('');
    $$('[data-account-edit]', tbody).forEach((button) => {
      button.addEventListener('click', () => openAccountDialog(Number(button.dataset.accountEdit)));
    });
    $$('[data-account-pwd]', tbody).forEach((button) => {
      button.addEventListener('click', () => openAccountPwdDialog(Number(button.dataset.accountPwd)));
    });
    $$('[data-account-toggle]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const account = adminAccounts[Number(button.dataset.accountToggle)];
        account.status = account.status === '启用' ? '停用' : '启用';
        writeJson(ACCOUNTS_KEY, adminAccounts);
        renderAccounts();
        toast(`账号「${account.account}」已${account.status}`);
      });
    });
    $$('[data-account-remove]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.accountRemove);
        const account = adminAccounts[index];
        // 仅默认超级管理员不可删除；后建的超管（含后赋予超管角色）可正常删除
        if (account.builtin) return toast('默认超级管理员账号不可删除');
        adminAccounts.splice(index, 1);
        writeJson(ACCOUNTS_KEY, adminAccounts);
        renderAccounts();
        toast(`账号「${account.account}」已删除`);
      });
    });
    $$('[data-account-check]', tbody).forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) accountSelection.add(box.dataset.accountCheck);
        else accountSelection.delete(box.dataset.accountCheck);
        updateAccountBatchButtons();
        updateAccountCheckAll();
      });
    });
    updateAccountBatchButtons();
    updateAccountCheckAll();
    updateAdminHeader();
  }

  function updateAccountBatchButtons() {
    const count = accountSelection.size;
    ['accountBatchEnable', 'accountBatchDisable', 'accountBatchDelete'].forEach((id) => {
      const button = $(`#${id}`);
      if (button) button.disabled = count === 0;
    });
  }

  function updateAccountCheckAll() {
    const allBox = $('#accountCheckAll');
    if (!allBox) return;
    const selectable = filteredAccounts().filter((account) => !account.builtin).map((account) => account.account);
    allBox.checked = selectable.length > 0 && selectable.every((name) => accountSelection.has(name));
    allBox.indeterminate = !allBox.checked && selectable.some((name) => accountSelection.has(name));
  }

  function batchAccountStatus(status) {
    const targets = adminAccounts.filter((account) => !account.builtin && accountSelection.has(account.account));
    if (!targets.length) return toast('请先选择可操作的账号');
    targets.forEach((account) => { account.status = status; });
    writeJson(ACCOUNTS_KEY, adminAccounts);
    accountSelection.clear();
    renderAccounts();
    toast(`已${status === '停用' ? '停用' : '启用'} ${targets.length} 个账号`);
  }

  function batchAccountDelete() {
    const targets = adminAccounts.filter((account) => !account.builtin && accountSelection.has(account.account));
    if (!targets.length) return toast('请先选择可删除的账号');
    adminAccounts = adminAccounts.filter((account) => !targets.includes(account));
    targets.forEach((account) => accountSelection.delete(account.account));
    writeJson(ACCOUNTS_KEY, adminAccounts);
    syncAccountRoleFilter();
    syncRoleSelect();
    renderAccounts();
    toast(`已删除 ${targets.length} 个账号`);
  }

  $('#accountCheckAll').addEventListener('change', (event) => {
    const selectable = filteredAccounts().filter((account) => !account.builtin).map((account) => account.account);
    selectable.forEach((name) => {
      if (event.target.checked) accountSelection.add(name);
      else accountSelection.delete(name);
    });
    renderAccounts();
  });
  $('#accountBatchEnable').addEventListener('click', () => batchAccountStatus('启用'));
  $('#accountBatchDisable').addEventListener('click', () => batchAccountStatus('停用'));
  $('#accountBatchDelete').addEventListener('click', batchAccountDelete);
  syncAccountRoleFilter();
  $('#accountSearchInput').addEventListener('input', (event) => { accountFilters.keyword = event.target.value.trim().toLowerCase(); renderAccounts(); });
  $('#accountRoleFilter').addEventListener('change', (event) => { accountFilters.role = event.target.value; renderAccounts(); });
  $('#accountStatusFilter').addEventListener('change', (event) => { accountFilters.status = event.target.value; renderAccounts(); });
  $('#accountLoginStart').addEventListener('change', (event) => { accountFilters.loginStart = event.target.value; renderAccounts(); });
  $('#accountLoginEnd').addEventListener('change', (event) => { accountFilters.loginEnd = event.target.value; renderAccounts(); });
  renderAccounts();

  /* ---------- 角色管理：筛选 / 勾选 / 增删改 ---------- */
  const roleSelection = new Set();
  let roleSearchText = '';
  let roleStatusFilter = '';
  let roleStart = '';
  let roleEnd = '';

  const roleStatus = (role) => (role.status === '停用' ? '停用' : '正常');
  const roleCreated = (role) => String(role.createdAt || '').slice(0, 10);

  function filteredRoles() {
    const list = roles.filter((role) => {
      if (roleSearchText && !role.role.toLowerCase().includes(roleSearchText)) return false;
      if (roleStatusFilter && roleStatus(role) !== roleStatusFilter) return false;
      const created = roleCreated(role);
      if (roleStart && (!created || created < roleStart)) return false;
      if (roleEnd && (!created || created > roleEnd)) return false;
      return true;
    });
    if (tableSortState['role-created'] !== 'default') {
      const dir = sortDirection('role-created');
      list.sort((a, b) => dir * roleCreated(a).localeCompare(roleCreated(b)));
    }
    return list;
  }

  function renderRoles() {
    const tbody = $('#roleTableBody');
    const list = filteredRoles();
    const visibleNames = list.map((role) => role.role);
    [...roleSelection].forEach((name) => { if (!visibleNames.includes(name)) roleSelection.delete(name); });
    $('#roleEmpty').hidden = list.length > 0;
    tbody.innerHTML = list.map((role) => {
      const disabled = roleStatus(role) === '停用';
      return `<tr>
        <td class="th-check"><input type="checkbox" class="admin-check" data-role-check="${escapeHtml(role.role)}" ${roleSelection.has(role.role) ? 'checked' : ''} aria-label="选择${escapeHtml(role.role)}" /></td>
        <td><strong>${escapeHtml(role.role)}</strong>${role.builtin ? '<span class="admin-form-hint" style="margin-left:6px">默认</span>' : ''}</td>
        <td><span class="admin-badge ${disabled ? 'disabled' : 'ok'}">${escapeHtml(roleStatus(role))}</span></td>
        <td class="td-sub">${fmtDate(role.createdAt)}</td>
        <td class="admin-role-actions">
          <span class="admin-cell-actions">
            <button type="button" class="admin-row-btn" title="编辑" data-role-edit="${escapeHtml(role.role)}"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button type="button" class="admin-row-btn" title="${role.builtin ? '默认角色不可停用' : (disabled ? '启用' : '停用')}" data-role-toggle="${escapeHtml(role.role)}" ${role.builtin ? 'disabled' : ''}><svg viewBox="0 0 24 24">${disabled ? '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/>' : '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'}</svg></button>
            <button type="button" class="admin-row-btn is-danger" title="${role.builtin ? '默认角色不可删除' : '删除'}" data-role-remove="${escapeHtml(role.role)}" ${role.builtin ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>
          </span>
        </td>
      </tr>`;
    }).join('');
    const allBox = $('#roleCheckAll');
    allBox.checked = list.length > 0 && list.every((role) => roleSelection.has(role.role));
    allBox.indeterminate = !allBox.checked && list.some((role) => roleSelection.has(role.role));
    updateRoleBatchButtons();

    $$('[data-role-check]', tbody).forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) roleSelection.add(box.dataset.roleCheck);
        else roleSelection.delete(box.dataset.roleCheck);
        renderRoles();
      });
    });
    $$('[data-role-edit]', tbody).forEach((button) => {
      button.addEventListener('click', () => openRoleDialog(button.dataset.roleEdit));
    });
    $$('[data-role-toggle]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const target = roles.find((item) => item.role === button.dataset.roleToggle);
        if (!target || target.builtin) return;
        target.status = roleStatus(target) === '正常' ? '停用' : '正常';
        writeJson(ROLES_KEY, roles);
        syncRoleSelect();
        renderRoles();
        toast(`角色「${target.role}」已${target.status}`);
      });
    });
    $$('[data-role-remove]', tbody).forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.roleRemove;
        const target = roles.find((item) => item.role === name);
        if (!target || target.builtin) return;
        const used = adminAccounts.filter((account) => account.role === name);
        if (used.length) return toast(`角色「${name}」下仍有 ${used.length} 个管理员账号，不可删除`);
        roles = roles.filter((item) => item.role !== name);
        roleSelection.delete(name);
        writeJson(ROLES_KEY, roles);
        syncRoleSelect();
        renderRoles();
        toast(`角色「${name}」已删除`);
      });
    });
  }

  function updateRoleBatchButtons() {
    const selected = [...roleSelection];
    const editable = selected.filter((name) => {
      const role = roles.find((item) => item.role === name);
      return role && !role.builtin;
    });
    $('#roleBatchEnable').disabled = !editable.some((name) => roleStatus(roles.find((r) => r.role === name)) === '停用');
    $('#roleBatchDisable').disabled = !editable.some((name) => roleStatus(roles.find((r) => r.role === name)) === '正常');
    $('#roleBatchDelete').disabled = !editable.some((name) => !adminAccounts.some((account) => account.role === name));
  }

  function batchRoleStatus(status) {
    const targets = roles.filter((role) => roleSelection.has(role.role) && !role.builtin && roleStatus(role) !== status);
    if (!targets.length) return toast(`所选角色均已${status}`);
    targets.forEach((role) => { role.status = status; });
    writeJson(ROLES_KEY, roles);
    renderRoles();
    toast(`已${status} ${targets.length} 个角色`);
  }

  $('#roleCheckAll').addEventListener('change', (event) => {
    const list = filteredRoles();
    list.forEach((role) => {
      if (event.target.checked) roleSelection.add(role.role);
      else roleSelection.delete(role.role);
    });
    renderRoles();
  });
  $('#roleBatchEnable').addEventListener('click', () => batchRoleStatus('正常'));
  $('#roleBatchDisable').addEventListener('click', () => batchRoleStatus('停用'));
  $('#roleBatchDelete').addEventListener('click', () => {
    const deletable = roles.filter((role) => roleSelection.has(role.role) && !role.builtin && !adminAccounts.some((account) => account.role === role.role));
    if (!deletable.length) return toast('所选角色不可删除（默认角色或仍有账号使用）');
    deletable.forEach((role) => { roleSelection.delete(role.role); });
    roles = roles.filter((role) => !deletable.includes(role));
    writeJson(ROLES_KEY, roles);
    syncRoleSelect();
    renderRoles();
    toast(`已删除 ${deletable.length} 个角色`);
  });
  $('#roleSearchInput').addEventListener('input', (event) => { roleSearchText = event.target.value.trim().toLowerCase(); renderRoles(); });
  $('#roleStatusSelect').addEventListener('change', (event) => { roleStatusFilter = event.target.value; renderRoles(); });
  $('#roleStart').addEventListener('change', (event) => { roleStart = event.target.value; renderRoles(); });
  $('#roleEnd').addEventListener('change', (event) => { roleEnd = event.target.value; renderRoles(); });
  renderRoles();

  /* ---------- 角色弹窗：树形权限配置 ---------- */
  const roleDialogLayer = $('#roleDialogLayer');
  const rolePermTree = $('#rolePermTree');
  let roleEditName = null;
  const collapsedNodes = new Set();
  // 权限勾选的唯一数据源：叶子 id 集合。用独立的 Set 而非 DOM checked 作为来源，
  // 否则取消子节点勾选时，父节点在 DOM 中仍为 checked，重绘会把子节点又勾回来（只能勾不能取消）。
  let rolePermSelected = new Set();
  let rolePermLocked = false;

  function allLeafIds(node) {
    if (!node.children) return [node.id];
    return node.children.reduce((ids, child) => ids.concat(allLeafIds(child)), []);
  }
  // 「可管理」是「仅查看」的超集：勾选管理自动带上查看，取消查看同步取消管理
  function normalizeRolePerms(selected) {
    PERM_MODULES.forEach((module) => {
      if (selected.has(`${module.id}-manage`)) selected.add(`${module.id}-view`);
    });
    return selected;
  }
  function renderPermTree() {
    const renderNode = (node, depth) => {
      const leaves = allLeafIds(node);
      const checkedCount = leaves.filter((id) => rolePermSelected.has(id)).length;
      const checked = rolePermLocked || checkedCount === leaves.length;
      const partial = !rolePermLocked && checkedCount > 0 && !checked;
      const collapsed = collapsedNodes.has(node.id);
      return `<div class="admin-role-tree-group">
        <div class="admin-role-tree-row ${depth === 0 ? 'is-module' : ''}">
          ${node.children ? `<svg class="admin-role-tree-caret ${collapsed ? 'is-collapsed' : ''}" data-perm-toggle="${node.id}" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg>` : '<span style="width:14px"></span>'}
          <input type="checkbox" class="admin-check" data-perm-check="${node.id}" ${checked ? 'checked' : ''} ${partial ? 'data-partial="true"' : ''} ${rolePermLocked ? 'data-locked="true"' : ''} aria-label="${escapeHtml(node.label)}" />
          <span class="admin-role-tree-name">${escapeHtml(node.label)}${node.desc ? `<i>${escapeHtml(node.desc)}</i>` : ''}</span>
        </div>
        ${node.children ? `<div class="admin-role-tree-children" data-perm-children="${node.id}" ${collapsed ? 'hidden' : ''}>${node.children.map((child) => renderNode(child, depth + 1)).join('')}</div>` : ''}
      </div>`;
    };
    rolePermTree.innerHTML = PERM_TREE.map((node) => renderNode(node, 0)).join('');
    $$('[data-partial]', rolePermTree).forEach((box) => { box.indeterminate = true; });
  }

  function openRoleDialog(name = null) {
    roleEditName = name;
    const editing = name !== null;
    const target = editing ? roles.find((item) => item.role === name) : null;
    $('#roleDialogTitle').textContent = editing ? '编辑角色' : '创建角色';
    $('#roleNameInput').value = editing ? target.role : '';
    $('#roleNameInput').disabled = editing;
    $('#roleNameCount').textContent = `${(target?.role || '').length} / 20`;
    // 超级管理员：权限全选且灰显不可取消，状态字段隐藏（角色不可停用）
    rolePermLocked = editing && !!target?.builtin;
    rolePermSelected = new Set();
    (editing ? target.perms : []).forEach((id) => {
      const node = findPermNode(PERM_TREE, id);
      (node ? allLeafIds(node) : [id]).forEach((leaf) => rolePermSelected.add(leaf));
    });
    normalizeRolePerms(rolePermSelected);
    $('#roleStatusField').hidden = rolePermLocked;
    $(`input[name="roleStatus"][value="${editing ? roleStatus(target) : '正常'}"]`).checked = true;
    renderPermTree();
    roleDialogLayer.classList.add('is-open');
    roleDialogLayer.setAttribute('aria-hidden', 'false');
  }
  function closeRoleDialog() {
    roleDialogLayer.classList.remove('is-open');
    roleDialogLayer.setAttribute('aria-hidden', 'true');
  }
  $('#roleDialogClose').addEventListener('click', closeRoleDialog);
  $('#roleDialogCancel').addEventListener('click', closeRoleDialog);
  roleDialogLayer.addEventListener('click', (event) => { if (event.target === roleDialogLayer) closeRoleDialog(); });
  $('#roleNameInput').addEventListener('input', (event) => { $('#roleNameCount').textContent = `${event.target.value.length} / 20`; });

  rolePermTree.addEventListener('click', (event) => {
    const caret = event.target.closest('[data-perm-toggle]');
    if (!caret) return;
    const id = caret.dataset.permToggle;
    if (collapsedNodes.has(id)) collapsedNodes.delete(id);
    else collapsedNodes.add(id);
    const children = $(`[data-perm-children="${id}"]`, rolePermTree);
    if (children) children.hidden = collapsedNodes.has(id);
    caret.classList.toggle('is-collapsed', collapsedNodes.has(id));
  });

  rolePermTree.addEventListener('change', (event) => {
    const box = event.target.closest('[data-perm-check]');
    if (!box) return;
    if (box.hasAttribute('data-locked')) { box.checked = true; return; }
    const node = findPermNode(PERM_TREE, box.dataset.permCheck) || { id: box.dataset.permCheck };
    const leaves = allLeafIds(node);
    if (box.checked) {
      leaves.forEach((id) => rolePermSelected.add(id));
      PERM_MODULES.forEach((module) => { if (leaves.includes(`${module.id}-manage`)) rolePermSelected.add(`${module.id}-view`); });
    } else {
      leaves.forEach((id) => rolePermSelected.delete(id));
      PERM_MODULES.forEach((module) => { if (leaves.includes(`${module.id}-view`)) rolePermSelected.delete(`${module.id}-manage`); });
    }
    normalizeRolePerms(rolePermSelected);
    renderPermTree();
  });
  function findPermNode(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) { const found = findPermNode(node.children, id); if (found) return found; }
    }
    return null;
  }

  $('#roleDialogSave').addEventListener('click', () => {
    const name = $('#roleNameInput').value.trim();
    const editing = roleEditName !== null;
    if (!name) return toast('请输入角色名称');
    if (!editing && roles.some((item) => item.role === name)) return toast('角色名称已存在');
    const selectedIds = normalizeRolePerms(new Set(rolePermSelected));
    const target = editing ? roles.find((item) => item.role === roleEditName) : null;
    if (target?.builtin) selectedIds.add(...PERM_LEAVES); // 超级管理员始终全权限
    const status = ($('input[name="roleStatus"]:checked') || {}).value || '正常';
    if (editing) {
      target.perms = [...selectedIds];
      target.status = status;
      toast(`角色「${name}」已更新`);
    } else {
      roles.push({ role: name, perms: [...selectedIds], status, createdAt: new Date().toISOString() });
      toast(`角色「${name}」已创建`);
    }
    writeJson(ROLES_KEY, roles);
    syncRoleSelect();
    closeRoleDialog();
    renderRoles();
  });

  const roleSelect = $('#accountRoleSelect');
  function syncRoleSelect() {
    const current = roleSelect.value;
    roleSelect.innerHTML = '<option value="">请选择角色</option>' + roles.filter((role) => roleStatus(role) === '正常').map((role) => `<option value="${escapeHtml(role.role)}">${escapeHtml(role.role)}</option>`).join('');
    if ([...roleSelect.options].some((option) => option.value === current)) roleSelect.value = current;
    syncAccountRoleFilter();
  }
  syncRoleSelect();

  /* 新增/编辑账号弹窗：editIndex 为 null 时新增，否则编辑对应账号 */
  const accountDialogLayer = $('#accountDialogLayer');
  let accountEditIndex = null;
  function openAccountDialog(index = null) {
    accountEditIndex = Number.isInteger(index) ? index : null;
    const editing = accountEditIndex !== null;
    const account = editing ? adminAccounts[accountEditIndex] : null;
    ['accountNameInput', 'accountPhoneInput', 'accountLoginInput', 'accountPwdInput'].forEach((id) => { $(`#${id}`).value = ''; });
    $('#accountNameInput').value = editing ? account.name : '';
    $('#accountPhoneInput').value = editing ? (account.phone || '') : '';
    $('#accountLoginInput').value = editing ? account.account : '';
    roleSelect.value = editing ? account.role : '';
    // 默认超级管理员账号为认领制：姓名/手机号/密码可改，但角色固定为「超级管理员」，不可改派其他角色；角色与状态字段直接隐藏
    const isBuiltinSuper = editing && !!account.builtin;
    roleSelect.disabled = isBuiltinSuper;
    roleSelect.title = isBuiltinSuper ? '默认超级管理员账号不可修改角色' : '';
    $('#accountRoleField').hidden = isBuiltinSuper;
    $('#accountStatusField').hidden = isBuiltinSuper;
    const status = editing ? (account.status || '启用') : '启用';
    $$('input[name="accountStatus"]').forEach((radio) => { radio.checked = radio.value === status; });
    $('#accountLoginInput').disabled = editing;
    // 编辑模式下不提供密码修改入口，改由列表「修改密码」操作单独处理
    $('#accountPwdField').hidden = editing;
    $('#accountDialogTitle').textContent = editing ? '编辑管理员账号' : '新增管理员账号';
    $('#accountDialogSave').textContent = editing ? '确认修改' : '确认新增';
    accountDialogLayer.classList.add('is-open');
    accountDialogLayer.setAttribute('aria-hidden', 'false');
  }
  function closeAccountDialog() {
    accountDialogLayer.classList.remove('is-open');
    accountDialogLayer.setAttribute('aria-hidden', 'true');
  }
  // 「+ 新增账号」按钮由视图切换时动态渲染并绑定（见 pageActionRenderers['account-manage']），此处只绑定弹窗内控件
  $('#accountDialogClose').addEventListener('click', closeAccountDialog);
  $('#accountDialogCancel').addEventListener('click', closeAccountDialog);
  accountDialogLayer.addEventListener('click', (event) => { if (event.target === accountDialogLayer) closeAccountDialog(); });
  $('#accountDialogSave').addEventListener('click', () => {
    const name = $('#accountNameInput').value.trim();
    const phone = $('#accountPhoneInput').value.trim();
    const inputAccount = $('#accountLoginInput').value.trim();
    const password = $('#accountPwdInput').value;
    const editing = accountEditIndex !== null;
    const status = ($('input[name="accountStatus"]:checked') || {}).value || '启用';
    // 账号可留空：未填写时默认以绑定手机号作为登录账号
    const account = inputAccount || phone;
    if (!name) return toast('请输入管理员姓名');
    if (!editing && !phone) return toast('请输入绑定手机号');
    if (phone && !/^1\d{10}$/.test(phone)) return toast('手机号需为 11 位数字');
    if (!account) return toast('请输入账号或绑定手机号');
    if (inputAccount && (inputAccount.length < 5 || inputAccount.length > 18)) return toast('账号需为 5-18 位');
    if (adminAccounts.some((item, i) => item.account === account && i !== accountEditIndex)) return toast('登录账号已存在');
    if (!editing && password && (password.length < 6 || password.length > 18)) return toast('密码需为 6-18 位');
    if (!roleSelect.value) return toast('请选择角色');
    if (editing) {
      const target = adminAccounts[accountEditIndex];
      target.name = name;
      target.phone = phone || target.phone || '';
      target.role = target.builtin ? '超级管理员' : roleSelect.value;
      target.status = status;
      writeJson(ACCOUNTS_KEY, adminAccounts);
      closeAccountDialog();
      renderAccounts();
      toast(`账号「${account}」已更新`);
      return;
    }
    if (!password) return toast('请输入初始密码');
    adminAccounts.push({ name, phone, account, role: roleSelect.value, status, lastLoginAt: null });
    writeJson(ACCOUNTS_KEY, adminAccounts);
    closeAccountDialog();
    renderAccounts();
    toast(`账号「${account}」已创建`);
  });

  /* 修改密码弹窗：仅用于管理员重设新密码，不影响账号其他信息 */
  const accountPwdDialogLayer = $('#accountPwdDialogLayer');
  let accountPwdIndex = null;
  function openAccountPwdDialog(index) {
    accountPwdIndex = index;
    const target = adminAccounts[index];
    if (!target) return;
    $('#accountPwdName').value = target.name;
    $('#accountPwdAccount').value = target.account;
    $('#accountNewPwdInput').value = '';
    $('#accountConfirmPwdInput').value = '';
    accountPwdDialogLayer.classList.add('is-open');
    accountPwdDialogLayer.setAttribute('aria-hidden', 'false');
  }
  function closeAccountPwdDialog() {
    accountPwdDialogLayer.classList.remove('is-open');
    accountPwdDialogLayer.setAttribute('aria-hidden', 'true');
  }
  $('#accountPwdDialogClose').addEventListener('click', closeAccountPwdDialog);
  $('#accountPwdDialogCancel').addEventListener('click', closeAccountPwdDialog);
  accountPwdDialogLayer.addEventListener('click', (event) => { if (event.target === accountPwdDialogLayer) closeAccountPwdDialog(); });
  $('#accountPwdDialogSave').addEventListener('click', () => {
    const password = $('#accountNewPwdInput').value;
    const confirm = $('#accountConfirmPwdInput').value;
    if (password.length < 6 || password.length > 18) return toast('新密码需为 6-18 位');
    if (password !== confirm) return toast('两次输入的新密码不一致');
    const target = adminAccounts[accountPwdIndex];
    if (!target) return closeAccountPwdDialog();
    target.password = password;
    writeJson(ACCOUNTS_KEY, adminAccounts);
    closeAccountPwdDialog();
    toast(`账号「${target.account}」的密码已修改`);
  });

  /* 列表时间列：点击表头在默认 / 正序 / 倒序之间切换 */
  const tableSortRenderers = {
    'price-updated': () => renderPriceTable(),
    'user-reg': () => renderUsers(),
    'account-login': () => renderAccounts(),
    'role-created': () => renderRoles(),
    'order-time': () => renderOrders()
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-table-sort]');
    if (!button) return;
    const key = button.dataset.tableSort;
    if (!(key in tableSortState)) return;
    tableSortState[key] = tableSortCycle[tableSortState[key]] || 'default';
    updateTableSortButtons();
    if (tableSortRenderers[key]) tableSortRenderers[key]();
  });
  updateTableSortButtons();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // 服务相关子弹窗优先级最高，逐层关闭
    if ($('#serviceCancelLayer').classList.contains('is-open')) closeServiceCancelDialog();
    else if ($('#serviceBatchOpenLayer').classList.contains('is-open')) closeServiceBatchOpen();
    else if ($('#serviceOpenDialogLayer').classList.contains('is-open')) closeServiceOpenDialog();
    else if (groupChainsLayer.classList.contains('is-open')) cancelGroupChainsDialog();
    else if (serviceDialogLayer.classList.contains('is-open')) closeServiceDialog();
    else if (orderDetailDialogLayer.classList.contains('is-open')) closeOrderDetail();
    else if (invoiceMergeLayer.classList.contains('is-open')) closeInvoiceMerge();
    else if (invoiceIssueLayer.classList.contains('is-open')) closeInvoiceIssue();
    else if (invoiceViewLayer.classList.contains('is-open')) closeInvoiceView();
    else if (userDetailDialogLayer.classList.contains('is-open')) closeUserDetailDialog();
    else if ($('#priceUsersLayer').classList.contains('is-open')) closePriceUsersDialog();
    else if ($('#priceDialogLayer').classList.contains('is-open')) closePriceDialog();
    else if (accountDialogLayer.classList.contains('is-open')) closeAccountDialog();
    else if (accountPwdDialogLayer.classList.contains('is-open')) closeAccountPwdDialog();
    else if (!adminUserPopover.hidden) closeAdminUserMenu();
  });
})();
