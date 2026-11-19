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
    location.replace('index.html');
    return;
  }
  if (!currentUser.admin) {
    document.body.innerHTML = '<div class="admin-no-perm"><h2>暂无运营管理权限</h2><p>当前账号未开通运营管理后台功能，请联系平台管理员开通。</p><a class="admin-btn admin-btn-primary" href="index.html" style="text-decoration:none">返回前台</a></div>';
    return;
  }

  /* ---------- 工具 ---------- */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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
  $('#adminAccount').textContent = currentUser.username || currentUser.phone;
  $('#adminAvatar').textContent = (currentUser.username || currentUser.phone).slice(-2);
  $('#adminLogout').addEventListener('click', () => {
    localStorage.removeItem(USER_KEY);
    location.replace('index.html');
  });

  /* ---------- 导航切换（面包屑 + 页面动作） ---------- */
  const pageTitles = {
    'graph-display': '产业链展示',
    'graph-price': '产业链价格',
    home: '首页管理',
    users: '用户管理',
    perms: '权限管理'
  };
  const groupLabels = { graph: '图谱管理' };
  const pageActionRenderers = {
    'graph-display': () => '<button type="button" class="admin-btn" id="graphReset">恢复默认</button><button type="button" class="admin-btn admin-btn-primary" id="graphSave" disabled title="">保存</button>',
    'graph-price': () => '',
    home: () => '<button type="button" class="admin-btn" id="hotwordReset">恢复默认</button><button type="button" class="admin-btn admin-btn-primary" id="hotwordSave" disabled title="">保存</button>',
    users: () => '<button type="button" class="admin-btn admin-btn-primary" id="userAdd">+ 添加账号</button>',
    perms: () => '<button type="button" class="admin-btn admin-btn-primary" id="accountAdd">+ 新增账号</button>'
  };
  function bindPageActions(view) {
    const reset = $('#graphReset');
    if (reset) reset.addEventListener('click', resetGraphConfig);
    const save = $('#graphSave');
    if (save) save.addEventListener('click', saveGraphChanges);
    const hotwordReset = $('#hotwordReset');
    if (hotwordReset) hotwordReset.addEventListener('click', resetHotWords);
    const hotwordSave = $('#hotwordSave');
    if (hotwordSave) hotwordSave.addEventListener('click', saveHotWords);
    const add = $('#accountAdd');
    if (add) add.addEventListener('click', openAccountDialog);
    const userAdd = $('#userAdd');
    if (userAdd) userAdd.addEventListener('click', openUserAddDialog);
    if (view === 'graph-display') updateGraphSaveState();
    if (view === 'home') updateHotwordSaveState();
  }
  /* 面包屑：二级页面显示「运营管理后台 / 图谱管理 / 产业链展示」 */
  function updateBreadcrumb(view) {
    const breadcrumb = $('#adminBreadcrumb');
    if (!breadcrumb) return;
    const parentView = view.startsWith('graph') ? 'graph' : '';
    const parts = ['<em>运营管理后台</em>'];
    if (parentView) parts.push(`<i>/</i><span>${escapeHtml(groupLabels[parentView])}</span>`);
    parts.push(`<i>/</i><b>${escapeHtml(pageTitles[view] || '')}</b>`);
    breadcrumb.innerHTML = parts.join('');
  }
  /* 二级菜单分组：点击子项会同步展开父级并高亮 */
  const GRAPH_VIEWS = ['graph-display', 'graph-price'];
  function activateView(view) {
    $$('[data-admin-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.adminView === view));
    $$('.admin-view').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.adminPanel === view));
    const isGraph = GRAPH_VIEWS.includes(view);
    const parent = $('#adminNav').querySelector('[data-nav-group="graph"]');
    const sub = $('#graphSubNav');
    if (parent) {
      parent.classList.toggle('is-active', isGraph);
      // 进入图谱分组下的任一页面时自动展开二级菜单
      if (isGraph) {
        parent.classList.add('is-open');
        parent.setAttribute('aria-expanded', 'true');
        if (sub) sub.hidden = false;
      }
    }
    $('#adminPageTitle').textContent = pageTitles[view] || '';
    updateBreadcrumb(view);
    const actions = $('#adminPageActions');
    if (actions) { actions.innerHTML = (pageActionRenderers[view] || (() => ''))(); bindPageActions(view); }
    if (view === 'graph-price') renderPriceTable();
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
      const sub = $('#graphSubNav');
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
      ${hasIcon ? `<button type="button" class="admin-btn admin-btn-mini admin-btn-plain" data-icon-clear="${escapeHtml(name)}" title="恢复默认">清除</button>` : ''}
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
          toast('已恢复默认图标，点击「保存」后生效');
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

  function resetGraphConfig() {
    graphConfig = seedDefaultHot({ hiddenChains: [], hiddenGroups: [], chainHot: {}, chainIcon: {}, chainOrder: {}, groupOrder: [] });
    graphConfig.hotSeeded = true;
    renderGraphTables();
    updateGraphSaveState();
    toast('已恢复默认配置，点击「保存」后生效');
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
  function resetHotWords() {
    hotWords = [...DEFAULT_HOT_WORDS];
    updateHotwordSaveState();
    renderHotwords();
    toast('已恢复默认热词，点击「保存」后生效');
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
  let userPage = 1;

  const userChainList = (record) => (Array.isArray(record.chains) ? record.chains : []);
  const userStatus = (record) => (record.status === 'disabled' ? 'disabled' : 'active');

  function filteredPhones() {
    return Object.keys(users).filter((phone) => {
      const record = users[phone];
      if (userSearchText && !(phone.includes(userSearchText) || String(record.username || '').toLowerCase().includes(userSearchText))) return false;
      const created = String(record.createdAt || '').slice(0, 10);
      if (userRegStart && (!created || created < userRegStart)) return false;
      if (userRegEnd && (!created || created > userRegEnd)) return false;
      return true;
    }).sort((a, b) => String(users[a].uid || '').localeCompare(String(users[b].uid || '')));
  }

  function renderUsers() {
    const tbody = $('#userTableBody');
    const phones = filteredPhones();
    const totalPages = Math.max(1, Math.ceil(phones.length / USER_PAGE_SIZE));
    if (userPage > totalPages) userPage = totalPages;
    const pagePhones = phones.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
    $('#userEmpty').hidden = phones.length > 0;
    tbody.innerHTML = pagePhones.map((phone) => {
      const record = users[phone];
      const paid = record.type === 'paid';
      const chains = userChainList(record);
      const disabled = userStatus(record) === 'disabled';
      const serviceHtml = `<button type="button" class="admin-count-link${chains.length ? '' : ' is-zero'}" data-user-service="${escapeHtml(phone)}" title="查看并管理已开通产业链"><svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.36.36l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.7 1.7"/><path d="M14 10a4.5 4.5 0 0 0-6.36-.36l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.7-1.7"/></svg>${chains.length} 个</button>`;
      return `<tr>
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
  }

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
    chainPrices[name] = { price: Number(price), updatedAt: new Date().toISOString() };
    saveChainPrices();
  }
  /* 成交单价快照：开通时把当时的单价冻结在 record.chainPrice[链名]。
   * 调价只影响之后的新开通/续费，已开通服务与已生成订单一律按原价不变。 */
  function chainDealPrice(record, name) {
    const saved = record && record.chainPrice ? Number(record.chainPrice[name]) : NaN;
    return Number.isFinite(saved) && saved > 0 ? saved : servicePrice(name);
  }
  function ensureChainPrice(record, chains) {
    record.chainPrice = record.chainPrice || {};
    let changed = false;
    chains.forEach((name) => {
      const saved = Number(record.chainPrice[name]);
      if (Number.isFinite(saved) && saved > 0) return;
      // 历史数据没有快照，按当前价补齐（无法还原真实历史成交价，取当前价作为基线）
      record.chainPrice[name] = servicePrice(name);
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
      // 冻结本次成交单价：后续调价不影响这条已开通服务的价格
      record.chainPrice[item.name] = Number(item.price) || servicePrice(item.name);
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
      const total = [...selected].reduce((sum, name) => sum + servicePrice(name) * serviceBatchTerm, 0);
      openButton.disabled = count === 0;
      openButton.textContent = count ? `批量开通（${count}）` : '批量开通';
      $('#serviceFootInfo').innerHTML = count
        ? `已选 <b>${count}</b> 条产业链，预计开通金额 <b>${money(total)}</b>`
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

  /* ---------- 合计金额：价格调整（原价 / 现价） + 推送订单 ---------- */
  // null 表示未调整；数字表示运营手动改定的合计金额
  let serviceOpenAdjust = null;
  let serviceBatchAdjust = null;
  const ORDERS_KEY = 'wudu-admin-orders';

  /* 演示订单种子数据：首次进入且无订单记录时按已有开通数据生成历史订单 */
  (function seedDemoOrders() {
    const existing = readJson(ORDERS_KEY, null);
    if (Array.isArray(existing) && existing.length) return;
    const make = (phone, names, term, pushedAt, status, invoiceStatus, payMethod, discountRate) => {
      // 年限、单价都以用户实际开通记录为准（成交价在开通时已冻结），
      // 确保详情页订单与上方「开通服务」列表的年限、单价完全一致
      const record = users[phone] || {};
      const terms = ensureServiceTerm(record, names);
      const dealPrices = ensureChainPrice(record, names);
      const items = names.map((name) => ({ name, term: Number(terms[name]) || defaultServiceTerm(name), price: Number(dealPrices[name]) || servicePrice(name) }));
      const originAmount = items.reduce((sum, item) => sum + item.price * item.term, 0);
      const amount = Math.round(originAmount * (1 - (discountRate || 0)));
      return {
        id: `WD${new Date(pushedAt).getTime()}${String(100 + items.length * 7)}`,
        phone,
        username: (users[phone] || {}).username || '',
        items,
        originAmount,
        amount,
        status,
        payMethod: status === 'paid' ? payMethod : '',
        invoiceStatus,
        paidAt: status === 'paid' ? pushedAt : '',
        pushedAt,
        source: 'admin'
      };
    };
    const seeds = [
      make('13911112222', ['集成电路'], 1, '2026-09-02T16:00:00+08:00', 'paid', 'done', 'wechat', 0),
      make('13911112222', ['生物医药'], 2, '2026-10-11T10:20:00+08:00', 'paid', 'pending', 'alipay', 0.1),
      make('13722223333', ['航空航天'], 1, '2026-10-30T14:00:00+08:00', 'paid', 'none', 'bank', 0),
      make('13566667777', ['集成电路'], 2, '2026-11-01T09:30:00+08:00', 'pending', 'none', '', 0.05)
    ];
    writeJson(ORDERS_KEY, seeds);
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
    const price = servicePrice(target.name);
    const nowIso = new Date().toISOString();
    const baseTotal = price * target.term;
    $('#serviceOpenDialogUser').textContent = serviceUserLabel();
    $('#serviceOpenName').textContent = target.name;
    $('#serviceOpenCategory').textContent = serviceCategoryLabel(entry);
    $('#serviceOpenPrice').textContent = money(price);
    $('#serviceOpenExpire').textContent = `${fmtDay(serviceExpireAt(nowIso, target.term))} 到期`;
    $('#serviceOpenTermPicker').innerHTML = termPickerHtml(target.term);
    renderAdjustTotal(baseTotal, serviceOpenAdjust, $('#serviceOpenOrigin'), $('#serviceOpenTotal'), $('#serviceOpenReset'));
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
    // 年限变了，手工调价失效，回到按单价计算
    serviceOpenAdjust = null;
    $('#serviceOpenAdjustEditor').hidden = true;
    renderServiceOpenDialog();
  });
  /* 价格调整：展开行内输入 */
  $('#serviceOpenAdjust').addEventListener('click', () => {
    if (!serviceOpenTarget) return;
    const price = servicePrice(serviceOpenTarget.name);
    const editor = $('#serviceOpenAdjustEditor');
    editor.hidden = false;
    const input = $('#serviceOpenAdjustInput');
    input.value = serviceOpenAdjust != null ? serviceOpenAdjust : price * serviceOpenTarget.term;
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
    toast('已恢复按单价计算');
  });
  $('#serviceOpenDialogClose').addEventListener('click', closeServiceOpenDialog);
  $('#serviceOpenDialogCancel').addEventListener('click', closeServiceOpenDialog);
  $('#serviceOpenDialogSave').addEventListener('click', () => {
    const target = serviceOpenTarget;
    if (!target) return;
    const baseTotal = servicePrice(target.name) * target.term;
    const amount = serviceOpenAdjust != null ? serviceOpenAdjust : baseTotal;
    // 成交单价按实际支付金额折算（手改过合计则折算到单价），冻结后不受后续调价影响
    const dealPrice = Math.round(amount / Math.max(1, target.term));
    commitServiceChanges({ open: [{ name: target.name, term: target.term, price: dealPrice }] });
    closeServiceOpenDialog();
    toast(`已开通「${target.name}」${target.term} 年服务，合计 ${money(amount)}`);
  });
  $('#serviceOpenPushOrder').addEventListener('click', () => {
    const target = serviceOpenTarget;
    if (!target) return;
    const baseTotal = servicePrice(target.name) * target.term;
    const amount = serviceOpenAdjust != null ? serviceOpenAdjust : baseTotal;
    const order = pushServiceOrder([{ name: target.name, term: target.term, price: servicePrice(target.name) }], amount, baseTotal);
    closeServiceOpenDialog();
    toast(`订单 ${order.id} 已推送至用户端，待用户支付 ${money(amount)}`);
  });

  /* ---------- 批量开通弹窗 ---------- */
  function batchSelectedNames() {
    const graphIndex = graphChainOrderIndex();
    return [...serviceSelection.catalog].sort((a, b) => graphOrderOf(graphIndex, a) - graphOrderOf(graphIndex, b));
  }
  function renderServiceBatchOpen() {
    const names = batchSelectedNames();
    $('#serviceBatchOpenUser').textContent = serviceUserLabel();
    $('#serviceBatchTermPicker').innerHTML = termPickerHtml(serviceBatchTerm);
    $('#serviceBatchList').innerHTML = names.map((name) => {
      const price = servicePrice(name);
      return `<tr><td>${escapeHtml(name)}</td><td>${money(price)}</td><td>${serviceBatchTerm} 年</td><td class="admin-batch-subtotal">${money(price * serviceBatchTerm)}</td></tr>`;
    }).join('');
    const baseTotal = names.reduce((sum, name) => sum + servicePrice(name) * serviceBatchTerm, 0);
    renderAdjustTotal(baseTotal, serviceBatchAdjust, $('#serviceBatchOrigin'), $('#serviceBatchTotal'), $('#serviceBatchReset'));
    $('#serviceBatchOpenSave').disabled = names.length === 0;
    renderServiceFoot();
  }
  function openServiceBatchOpen() {
    if (!serviceSelection.catalog.size) { toast('请先勾选要开通的产业链'); return; }
    serviceBatchAdjust = null;
    $('#serviceBatchAdjustEditor').hidden = true;
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
    renderServiceBatchOpen();
  });
  $('#serviceBatchAdjust').addEventListener('click', () => {
    const names = batchSelectedNames();
    const baseTotal = names.reduce((sum, name) => sum + servicePrice(name) * serviceBatchTerm, 0);
    const editor = $('#serviceBatchAdjustEditor');
    editor.hidden = false;
    const input = $('#serviceBatchAdjustInput');
    input.value = serviceBatchAdjust != null ? serviceBatchAdjust : baseTotal;
    input.focus();
    input.select();
  });
  $('#serviceBatchAdjustCancel').addEventListener('click', () => { $('#serviceBatchAdjustEditor').hidden = true; });
  function applyBatchAdjust() {
    const result = manualPrice($('#serviceBatchAdjustInput').value);
    if (result.error) { toast(result.error); return; }
    serviceBatchAdjust = result.amount;
    $('#serviceBatchAdjustEditor').hidden = true;
    renderServiceBatchOpen();
  }
  $('#serviceBatchAdjustSave').addEventListener('click', applyBatchAdjust);
  $('#serviceBatchAdjustInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') applyBatchAdjust(); });
  $('#serviceBatchReset').addEventListener('click', () => {
    serviceBatchAdjust = null;
    $('#serviceBatchAdjustEditor').hidden = true;
    renderServiceBatchOpen();
    toast('已恢复按单价计算');
  });
  $('#serviceBatchOpenClose').addEventListener('click', closeServiceBatchOpen);
  $('#serviceBatchOpenCancel').addEventListener('click', closeServiceBatchOpen);
  $('#serviceBatchOpenSave').addEventListener('click', () => {
    const names = batchSelectedNames();
    if (!names.length) return;
    const baseTotal = names.reduce((sum, name) => sum + servicePrice(name) * serviceBatchTerm, 0);
    const amount = serviceBatchAdjust != null ? serviceBatchAdjust : baseTotal;
    serviceSelection.catalog.clear();
    // 单价按标价冻结；若整单改过价，按比例折算到每条服务的成交单价
    const rate = baseTotal > 0 ? amount / baseTotal : 1;
    commitServiceChanges({ open: names.map((name) => ({ name, term: serviceBatchTerm, price: Math.round(servicePrice(name) * rate) })) });
    closeServiceBatchOpen();
    toast(`已批量开通 ${names.length} 条产业链，合计 ${money(amount)}`);
  });
  $('#serviceBatchPushOrder').addEventListener('click', () => {
    const names = batchSelectedNames();
    if (!names.length) return;
    const baseTotal = names.reduce((sum, name) => sum + servicePrice(name) * serviceBatchTerm, 0);
    const amount = serviceBatchAdjust != null ? serviceBatchAdjust : baseTotal;
    const items = names.map((name) => ({ name, term: serviceBatchTerm, price: servicePrice(name) }));
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
    const dealPrices = ensureChainPrice(record, chains);
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
      // 已开通服务展示「成交价」（开通时冻结），与后续调价解耦
      const dealPrice = Number(dealPrices[entry.name]) || servicePrice(entry.name);
      const nowPrice = servicePrice(entry.name);
      const priceCell = nowPrice === dealPrice
        ? `¥${dealPrice.toLocaleString('zh-CN')}`
        : `<span class="admin-deal-price">¥${dealPrice.toLocaleString('zh-CN')}</span><em class="admin-deal-now" title="当前标价">现价 ¥${nowPrice.toLocaleString('zh-CN')}</em>`;
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
        <td>¥${servicePrice(entry.name).toLocaleString('zh-CN')}</td>
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
      const price = servicePrice(name);
      const updatedAt = servicePriceUpdatedAt(name);
      const count = chainOpenedUsers(name).length;
      const category = categoryOf.get(name) || '未分类';
      return `<tr>
        <td class="td-sub">${index + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td class="td-sub admin-price-category">${escapeHtml(category)}</td>
        <td class="admin-price-value">¥${price.toLocaleString('zh-CN')}</td>
        <td class="td-sub">${updatedAt ? fmtDate(updatedAt) : '<span class="admin-price-none">默认价</span>'}</td>
        <td>${count ? `<button type="button" class="admin-count-link" data-price-users="${escapeHtml(name)}">${count} 位</button>` : '<span class="admin-price-none">0 位</span>'}</td>
        <td><button type="button" class="admin-service-action" data-price-edit="${escapeHtml(name)}">价格调整</button></td>
      </tr>`;
    }).join('');
    $('#priceEmpty').hidden = rows.length > 0;
    $('#priceSummary').textContent = `共 ${rows.length} 条产业链，已开通用户合计 ${Object.keys(users).filter((phone) => userChainList(users[phone]).length).length} 位`;
    $$('[data-price-edit]', body).forEach((button) => button.addEventListener('click', () => openPriceDialog(button.dataset.priceEdit)));
    $$('[data-price-users]', body).forEach((button) => button.addEventListener('click', () => openPriceUsersDialog(button.dataset.priceUsers)));
  }

  /* 价格调整弹窗 */
  function openPriceDialog(name) {
    priceDialogTarget = name;
    const current = servicePrice(name);
    $('#priceDialogName').textContent = name;
    $('#priceDialogCurrent').textContent = money(current);
    $('#priceDialogInput').value = current;
    $('#priceDialogError').hidden = true;
    $('#priceDialogPreview').textContent = `调整后将按 ${money(current)} / 年计费`;
    // 说明影响范围：已开通/已下单的价格不变，只有后续购买走新价
    const affected = chainOpenedUsers(name).length;
    $('#priceDialogNote').innerHTML = affected
      ? `已开通该产业链的 <b>${affected}</b> 位用户按原成交价保持不变，调价仅对之后的续费和新开通生效。`
      : '调价将对之后的新开通与续费生效。';
    openDialogLayer($('#priceDialogLayer'));
    setTimeout(() => { const input = $('#priceDialogInput'); input.focus(); input.select(); }, 60);
  }
  function closePriceDialog() { closeDialogLayer($('#priceDialogLayer')); priceDialogTarget = ''; }
  function syncPricePreview() {
    const value = Number($('#priceDialogInput').value);
    const valid = Number.isFinite(value) && value > 0;
    const current = priceDialogTarget ? servicePrice(priceDialogTarget) : 0;
    const diff = valid ? value - current : 0;
    const diffText = diff === 0 ? '与当前一致' : diff > 0 ? `较当前上调 ${money(diff)}（+${((diff / current) * 100).toFixed(1)}%）` : `较当前下调 ${money(-diff)}（${((diff / current) * 100).toFixed(1)}%）`;
    $('#priceDialogPreview').innerHTML = valid
      ? `调整后将按 <b>${money(value)}</b> / 年计费，${diffText}`
      : '<span class="admin-price-warn">请输入大于 0 的价格</span>';
  }

  /* 开通用户列表弹窗 */
  function openPriceUsersDialog(name) {
    const openedAtOf = (record) => (record.chainOpenedAt && record.chainOpenedAt[name]) || '';
    const list = chainOpenedUsers(name)
      .sort((a, b) => new Date(openedAtOf(b.record) || 0) - new Date(openedAtOf(a.record) || 0));
    $('#priceUsersTitle').textContent = `${name} · 开通用户`;
    $('#priceUsersSub').textContent = `共 ${list.length} 位用户已开通，按开通时间倒序`;
    const nowPrice = servicePrice(name);
    $('#priceUsersList').innerHTML = list.length
      ? list.map((item) => {
        const term = (item.record.chainTerm && item.record.chainTerm[name]) || defaultServiceTerm(name);
        const disabled = userStatus(item.record) === 'disabled';
        // 每位用户的成交单价（开通时冻结），调价后这里仍然是原成交价
        const dealPrice = chainDealPrice(item.record, name);
        const priceTag = dealPrice === nowPrice
          ? `<span class="admin-price-user-price">${money(dealPrice)}</span>`
          : `<span class="admin-price-user-price is-frozen" title="开通时冻结的成交单价">${money(dealPrice)}</span>`;
        return `<div class="admin-price-user">
          <div class="admin-price-user-main"><b>${escapeHtml(item.phone)}</b><span>${item.record.username ? escapeHtml(item.record.username) : '未设用户名'}</span>${disabled ? '<em class="admin-price-user-tag">已停用</em>' : ''}</div>
          <div class="admin-price-user-meta">${priceTag}<span class="admin-price-user-term">${term} 年</span><span>${openedAtOf(item.record) ? fmtDate(openedAtOf(item.record)) : '—'} 开通</span></div>
        </div>`;
      }).join('')
      : '<p class="admin-empty">暂无用户开通该产业链</p>';
    openDialogLayer($('#priceUsersLayer'));
  }
  function closePriceUsersDialog() { closeDialogLayer($('#priceUsersLayer')); }
  $('#priceDialogClose').addEventListener('click', closePriceDialog);
  $('#priceDialogCancel').addEventListener('click', closePriceDialog);
  $('#priceDialogInput').addEventListener('input', syncPricePreview);
  $('#priceDialogSave').addEventListener('click', () => {
    const name = priceDialogTarget;
    if (!name) return;
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
    toast(`「${name}」价格已调整为 ${money(Math.round(value))} / 年`);
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
    alipay: '支付宝',
    bank: '对公转账',
    offline: '线下汇款'
  };
  const PAY_STATUS_LABEL = {
    pending: { text: '待支付', cls: 'warn' },
    paid: { text: '已支付', cls: 'ok' },
    closed: { text: '已关闭', cls: 'off' },
    refunded: { text: '已退款', cls: 'off' }
  };
  const INVOICE_STATUS_LABEL = {
    none: { text: '未开票', cls: 'off' },
    pending: { text: '开票中', cls: 'warn' },
    done: { text: '已开票', cls: 'ok' }
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
    const dealPrices = ensureChainPrice(record, allChains);
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
      const dealPrice = Number(dealPrices[name]) || servicePrice(name);
      const nowPrice = servicePrice(name);
      const priceCell = nowPrice === dealPrice
        ? money(dealPrice)
        : `<span class="admin-deal-price">${money(dealPrice)}</span><em class="admin-deal-now" title="当前标价">现价 ${money(nowPrice)}</em>`;
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
      const pay = PAY_METHOD_LABEL[order.payMethod] || '<span class="admin-detail-none">—</span>';
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
    const pay = PAY_METHOD_LABEL[order.payMethod] || '—';
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
        <div class="admin-od-row"><span>订单时间</span><b>${fmtDate(order.pushedAt)}</b></div>
        <div class="admin-od-row"><span>支付方式</span><b>${escapeHtml(pay)}</b></div>
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
    openDialogLayer(orderDetailDialogLayer);
  }
  function closeOrderDetail() { closeDialogLayer(orderDetailDialogLayer); }
  $('#orderDetailClose').addEventListener('click', closeOrderDetail);
  $('#orderDetailOk').addEventListener('click', closeOrderDetail);
  orderDetailDialogLayer.addEventListener('click', (event) => { if (event.target === orderDetailDialogLayer) closeOrderDetail(); });

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
        // 开通即冻结当次成交单价
        record.chainPrice[name] = servicePrice(name);
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
  const MODULES = ['产业图谱管理', '首页管理', '用户管理', '权限管理'];
  let adminAccounts = readJson(ACCOUNTS_KEY, null);
  if (!Array.isArray(adminAccounts)) {
    adminAccounts = [
      { name: '宋家辉', account: 'songjh', role: '超级管理员', status: '启用', lastLoginAt: '2026-11-16T09:30:00+08:00' },
      { name: '运营专员', account: 'yunying01', role: '运营', status: '启用', lastLoginAt: '2026-11-15T18:04:00+08:00' },
      { name: '客服小五', account: 'kefu05', role: '客服', status: '停用', lastLoginAt: '2026-11-08T11:26:00+08:00' }
    ];
    writeJson(ACCOUNTS_KEY, adminAccounts);
  }
  let roles = readJson(ROLES_KEY, null);
  if (!Array.isArray(roles)) {
    roles = [
      { role: '超级管理员', perms: [...MODULES] },
      { role: '运营', perms: ['产业图谱管理', '首页管理', '用户管理'] },
      { role: '客服', perms: ['用户管理'] },
      { role: '数据维护', perms: ['产业图谱管理'] }
    ];
    writeJson(ROLES_KEY, roles);
  }

  function renderAccounts() {
    const tbody = $('#accountTableBody');
    tbody.innerHTML = adminAccounts.map((account, index) => `
      <tr>
        <td>${escapeHtml(account.name)}</td>
        <td>${escapeHtml(account.account)}</td>
        <td>${escapeHtml(account.role)}</td>
        <td><span class="admin-badge ${account.status === '启用' ? 'ok' : 'disabled'}">${escapeHtml(account.status)}</span></td>
        <td class="td-sub">${fmtDate(account.lastLoginAt)}</td>
        <td><span class="admin-cell-actions">
          <button type="button" class="admin-row-btn" title="${account.status === '启用' ? '停用' : '启用'}" data-account-toggle="${index}"><svg viewBox="0 0 24 24">${account.status === '启用' ? '<path d="M18.4 6.6a9 9 0 1 0 .5 8.4"/><path d="M21 4v5h-5"/>' : '<path d="M6 6l12 12M18 6 6 18"/>'}</svg></button>
          <button type="button" class="admin-row-btn is-danger" title="删除" data-account-remove="${index}"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>
        </span></td>
      </tr>`).join('');
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
        if (account.role === '超级管理员') return toast('超级管理员账号不可删除');
        adminAccounts.splice(index, 1);
        writeJson(ACCOUNTS_KEY, adminAccounts);
        renderAccounts();
        toast(`账号「${account.account}」已删除`);
      });
    });
  }
  renderAccounts();

  function renderRoles() {
    const tbody = $('#permTableBody');
    tbody.innerHTML = roles.map((role) => `
      <tr>
        <td><strong>${escapeHtml(role.role)}</strong></td>
        ${MODULES.map((module) => `<td><input type="checkbox" data-perm-role="${escapeHtml(role.role)}" data-perm-module="${module}" ${role.perms.includes(module) ? 'checked' : ''} /></td>`).join('')}
      </tr>`).join('');
  }
  renderRoles();

  $('#permSave').addEventListener('click', () => {
    $$('input[data-perm-role]').forEach((box) => {
      const role = roles.find((item) => item.role === box.dataset.permRole);
      if (!role) return;
      const module = box.dataset.permModule;
      if (box.checked && !role.perms.includes(module)) role.perms.push(module);
      if (!box.checked) role.perms = role.perms.filter((item) => item !== module);
    });
    // 超级管理员始终保留全部权限
    const superRole = roles.find((role) => role.role === '超级管理员');
    if (superRole) superRole.perms = [...MODULES];
    writeJson(ROLES_KEY, roles);
    toast('权限配置已保存');
  });

  /* 新增账号弹窗 */
  const accountDialogLayer = $('#accountDialogLayer');
  const roleSelect = $('#accountRoleSelect');
  roleSelect.innerHTML = roles.map((role) => `<option value="${escapeHtml(role.role)}">${escapeHtml(role.role)}</option>`).join('');
  function openAccountDialog() {
    ['accountNameInput', 'accountLoginInput', 'accountPwdInput'].forEach((id) => { $(`#${id}`).value = ''; });
    accountDialogLayer.classList.add('is-open');
    accountDialogLayer.setAttribute('aria-hidden', 'false');
  }
  function closeAccountDialog() {
    accountDialogLayer.classList.remove('is-open');
    accountDialogLayer.setAttribute('aria-hidden', 'true');
  }
  // 「+ 新增账号」按钮由视图切换时动态渲染并绑定（见 pageActions.perms），此处只绑定弹窗内控件
  $('#accountDialogClose').addEventListener('click', closeAccountDialog);
  $('#accountDialogCancel').addEventListener('click', closeAccountDialog);
  accountDialogLayer.addEventListener('click', (event) => { if (event.target === accountDialogLayer) closeAccountDialog(); });
  $('#accountDialogSave').addEventListener('click', () => {
    const name = $('#accountNameInput').value.trim();
    const account = $('#accountLoginInput').value.trim();
    const password = $('#accountPwdInput').value;
    if (!name) return toast('请输入姓名');
    if (!account) return toast('请输入登录账号');
    if (adminAccounts.some((item) => item.account === account)) return toast('登录账号已存在');
    if (password.length < 6 || password.length > 18) return toast('初始密码需为 6-18 位');
    adminAccounts.push({ name, account, role: roleSelect.value, status: '启用', lastLoginAt: null });
    writeJson(ACCOUNTS_KEY, adminAccounts);
    closeAccountDialog();
    renderAccounts();
    toast(`账号「${account}」已创建`);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // 服务相关子弹窗优先级最高，逐层关闭
    if ($('#serviceCancelLayer').classList.contains('is-open')) closeServiceCancelDialog();
    else if ($('#serviceBatchOpenLayer').classList.contains('is-open')) closeServiceBatchOpen();
    else if ($('#serviceOpenDialogLayer').classList.contains('is-open')) closeServiceOpenDialog();
    else if (groupChainsLayer.classList.contains('is-open')) cancelGroupChainsDialog();
    else if (serviceDialogLayer.classList.contains('is-open')) closeServiceDialog();
    else if (orderDetailDialogLayer.classList.contains('is-open')) closeOrderDetail();
    else if (userDetailDialogLayer.classList.contains('is-open')) closeUserDetailDialog();
    else if ($('#priceUsersLayer').classList.contains('is-open')) closePriceUsersDialog();
    else if ($('#priceDialogLayer').classList.contains('is-open')) closePriceDialog();
    else if (accountDialogLayer.classList.contains('is-open')) closeAccountDialog();
  });
})();
