(function () {
  'use strict';

  // 用户体系：游客（未登录）/ 注册用户 / 收费用户
  // - USER_KEY 保存当前登录用户（存在即视为已登录）
  // - USERS_KEY 保存注册过的手机号及会员类型，登录即注册、再次登录保留身份
  const AUTH_KEY = 'wudu-industry-auth'; // 密码登录演示账号
  const USER_KEY = 'wudu-industry-user';
  const USERS_KEY = 'wudu-industry-users';
  // 运营管理后台「产业链价格」共用的存储键：后台设为仅联系客服时前台不展示价格
  const CHAIN_PRICE_KEY = 'wudu-admin-chain-price';
  // 在线咨询统一入口：右侧悬浮按钮与开通弹窗「联系客服」共用同一页面
  const ONLINE_CONSULT_URL = 'https://affim.baidu.com/unique_64623122/chat?siteId=23037126&userId=64623122&siteToken=05cfe878b2e0ceed3e913161a3c4cdea&cp&cr&cw=www.datadowell.com';
  const DEFAULT_ACCOUNT = '13800138000';
  const DEFAULT_PASSWORD = '123456';
  const CAPTCHA_POOL = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

  let smsPending = null; // { phone, code, expire }
  let smsTimer = null;
  let smsCountdown = 0;
  let captchaCode = '';
  let currentView = 'sms';
  // 开通弹窗来源：从「我的服务」续费/重新开通进入时带续费标记，支付成功后走续费落库
  let upgradeRenew = null;

  /* 产业链开通方式：默认「仅联系客服」——后台没有明确设置固定价格时一律人工沟通，
   * 前台开通弹窗只保留联系客服入口，不展示任何价格示意。 */
  function getChainSaleMode(chainName) {
    try {
      const map = JSON.parse(localStorage.getItem(CHAIN_PRICE_KEY) || '{}');
      const record = chainName && map && map[chainName];
      const price = Number(record && record.price);
      if (record && record.mode === 'price' && Number.isFinite(price) && price > 0) {
        return { mode: 'price', price: Math.round(price) };
      }
    } catch (error) {
      // 配置损坏时按默认「仅联系客服」处理，不向用户展示错误
    }
    return { mode: 'contact', price: 0 };
  }

  function boot() {
    if (document.getElementById('authShell')) return;

    const authShell = document.createElement('div');
    authShell.id = 'authShell';
    authShell.className = 'auth-shell';
    authShell.innerHTML = [
      // 登录弹窗（短信登录 / 密码登录，登录即注册）
      '<div class="auth-login-view" id="loginView" aria-hidden="true"><div class="auth-login-panel">',
      '<button type="button" class="auth-modal-close" data-auth-close aria-label="关闭登录窗口">×</button>',
      '<div class="auth-brand-mark">W</div>',
      '<h1>五度易链</h1>',
      '<p class="auth-login-subtitle">产业链全景图谱平台</p>',
      '<div class="auth-tabs" role="tablist"><button type="button" class="auth-tab is-active" data-auth-tab="sms">短信登录</button><button type="button" class="auth-tab" data-auth-tab="password">密码登录</button></div>',
      '<form class="auth-form is-active" id="smsLoginForm" novalidate>',
      '<label class="auth-input-group"><input id="smsPhone" name="phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入手机号" required></label>',
      '<div class="auth-inline-row"><input id="imageCaptchaInput" type="text" maxlength="4" autocomplete="off" placeholder="请输入图形验证码"><canvas id="captchaCanvas" width="110" height="42" title="点击刷新图形验证码"></canvas></div>',
      '<div class="auth-inline-row"><input id="smsCodeInput" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="请输入验证码"><button type="button" class="auth-code-button" id="smsSendButton">获取验证码</button></div>',
      '<p class="auth-form-error" id="smsLoginError" role="alert"></p>',
      '<button class="auth-primary-button" type="submit">登录 / 注册</button>',
      '<label class="auth-check auth-agreement"><input id="smsAgreement" type="checkbox"><span>勾选并同意 <a href="javascript:void(0)" data-agreement="service">用户服务协议</a> 与 <a href="javascript:void(0)" data-agreement="privacy">隐私政策</a></span></label>',
      '<p class="auth-login-footnote">未注册账号？登录即自动注册</p>',
      '</form>',
      '<form class="auth-form" id="passwordLoginForm" novalidate>',
      '<label class="auth-input-group"><input id="loginAccount" name="account" type="text" inputmode="tel" autocomplete="username" placeholder="请输入手机号或登录账号" required></label>',
      '<label class="auth-input-group"><input id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="请输入登录密码" required></label>',
      '<p class="auth-form-error" id="loginError" role="alert"></p>',
      '<button class="auth-primary-button" type="submit">登录</button>',
      '<p class="auth-login-footnote">演示账号：13800138000 / 123456</p>',
      '</form>',
      '</div></div>',
      // 开通服务对话框（注册用户触发收费功能时提示）
      '<div class="account-dialog-layer" id="upgradeDialogLayer" aria-hidden="true"><div class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="upgradeDialogTitle">',
      '<div class="account-dialog-header"><div><h2 id="upgradeDialogTitle">开通服务</h2></div><button type="button" class="dialog-close" data-upgrade-close aria-label="关闭">×</button></div>',
      '<p class="dialog-description" id="upgradeDialogMessage"></p>',
      '<div class="upgrade-benefit-list">',
      '<span>收费用户专属权益</span>',
      '<ul><li id="upgradePriceBenefit">按产业链开通：开通哪条看哪条</li><li>开通后可查看该产业链完整图谱，含各环节细分情况</li><li>可查看 / 下载上链企业清单，查看上链企业详情</li></ul>',
      '</div>',
      '<div class="upgrade-actions"><button type="button" class="upgrade-secondary-button" id="upgradeContactButton">联系客服</button><button type="button" class="auth-primary-button upgrade-primary-button" id="upgradeBuyButton">开通服务</button></div>',
      '</div></div>',
      // 协议正文弹窗（与个人中心共用 agreements.js 中的法务定稿）
      '<div class="account-dialog-layer auth-agreement-layer" id="authAgreementLayer" aria-hidden="true">',
      '<div class="account-dialog auth-agreement-dialog" role="dialog" aria-modal="true" aria-labelledby="authAgreementTitle">',
      '<div class="account-dialog-header"><div><h2 id="authAgreementTitle">用户服务协议</h2></div><button type="button" class="dialog-close" data-auth-agreement-close aria-label="关闭">×</button></div>',
      '<div class="auth-agreement-body" id="authAgreementBody"></div>',
      '</div></div>',
      // 二维码付款弹窗 + 右下角客服咨询窗口
      '<style>',
      '.pay-dialog-layer{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;background:rgba(16,34,51,.5);pointer-events:auto;}',
      '.pay-dialog-layer.is-open{display:flex;}',
      '.pay-dialog{width:320px;max-width:calc(100vw - 32px);background:#fff;border-radius:12px;padding:20px;box-shadow:0 20px 50px rgba(16,34,51,.25);text-align:center;}',
      '.pay-dialog .account-dialog-header{text-align:left;}',
      '.pay-chain-line{margin:4px 0 10px;font-size:12px;color:#5b6b7c;}',
      '.pay-chain-line strong{color:#17232e;}',
      '.pay-amount{margin:2px 0 12px;color:#e8400f;font-size:13px;font-weight:600;}',
      '.pay-amount b{font-size:30px;letter-spacing:-.5px;margin:0 2px;}',
      '.pay-amount span{color:#8a97a5;font-weight:400;}',
      '#payQrCanvas{display:block;margin:0;border:1px solid #dfe7ee;border-radius:8px;}',
      '#payDialogLayer [hidden]{display:none!important;}',
      '.pay-term-row{display:flex;gap:8px;margin:8px 0 12px;}',
      '.pay-term-option{flex:1;height:36px;border:1px solid #dfe7ee;border-radius:6px;background:#fff;color:#42586b;font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer;}',
      '.pay-term-option:hover{border-color:#9fc7c4;}',
      '.pay-term-option.is-active{border-color:#0c7773;background:#eef7f6;color:#0c7773;}',
      '.pay-qr-wrap{position:relative;margin:0 auto 10px;width:max-content;}',
      '.pay-qr-wrap.is-locked #payQrCanvas{filter:blur(7px);opacity:.72;}',
      '.pay-qr-confirm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;min-width:72px;height:34px;padding:0 14px;border:0;border-radius:18px;background:#0c7773;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 3px 10px rgba(12,119,115,.28);}',
      '.pay-qr-confirm:hover{background:#075e5b;}',
      '.pay-method-mark{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 0 12px;color:#09a761;font-size:12px;font-weight:600;}',
      '.pay-method-mark svg{width:18px;height:18px;flex:0 0 auto;}',
      '.pay-actions{display:flex;justify-content:center;}',
      '.pay-note{margin:10px 0 0;font-size:11px;color:#8a97a5;}',
      '.auth-agreement-layer{z-index:10005;}',
      '.auth-agreement-dialog{width:min(720px,100%);max-height:min(82vh,820px);display:flex;flex-direction:column;padding:24px 28px 20px;}',
      '.auth-agreement-body{overflow-y:auto;overscroll-behavior:contain;padding-right:10px;color:#52697e;font-size:12.5px;line-height:1.9;}',
      '.auth-agreement-body h3{margin:2px 0 10px;color:#142e46;font-size:18px;text-align:center;}',
      '.auth-agreement-body h4{margin:18px 0 4px;color:#1d3a52;font-size:13.5px;}',
      '.auth-agreement-body p{margin:0 0 8px;color:#52697e;font-size:12.5px;line-height:1.9;}',
      '.auth-agreement-body .uc-agreement-meta{margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #eef2f6;color:#98a8b8;font-size:12px;text-align:center;}',
      '.side-widget{position:fixed;right:18px;top:62%;transform:translateY(-50%);z-index:1240;display:flex;flex-direction:column;align-items:center;width:66px;padding:8px 0 4px;border:1px solid #e7edf2;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(16,34,51,.14);pointer-events:auto;}',
      '.side-widget-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;width:100%;padding:10px 0;border:0;background:none;color:#42586b;font-size:11px;font-weight:600;text-decoration:none;cursor:pointer;transition:color .2s ease;}',
      '.side-widget-item svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}',
      '.side-widget-item:hover{color:#1e6f9f;}',
      '.side-widget-item + .side-widget-item{border-top:1px solid #eef3f7;}',
      '.side-widget-bubble{position:absolute;right:calc(100% + 14px);top:50%;transform:translateY(-50%) translateX(6px);display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:10px;background:#fff;box-shadow:0 6px 24px rgba(16,34,51,.18);white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,transform .2s ease,visibility .2s ease;}',
      '.side-widget-item:hover .side-widget-bubble{opacity:1;visibility:visible;transform:translateY(-50%) translateX(0);}',
      '.side-widget-bubble-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#eef3f8;color:#62798d;flex:0 0 auto;}',
      '.side-widget-bubble-icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}',
      '.side-widget-bubble small{display:block;color:#8aa0b2;font-size:12px;line-height:1.5;}',
      '.side-widget-bubble strong{display:block;color:#1d6fae;font-size:14px;line-height:1.4;letter-spacing:.3px;}',
      '.side-widget-backtop{display:none;}',
      '.side-widget-backtop.is-visible{display:flex;}',
      '</style>',
      '<div class="pay-dialog-layer" id="payDialogLayer" aria-hidden="true">',
      '<div class="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="payDialogTitle">',
      '<div class="account-dialog-header"><div><h2 id="payDialogTitle">扫码支付</h2></div><button type="button" class="dialog-close" data-pay-close aria-label="关闭">×</button></div>',
      '<p class="pay-chain-line">开通对象：<strong id="payChainName">—</strong></p>',
      '<div class="pay-term-row" id="payTermRow" role="radiogroup" aria-label="选择服务年限">',
      '<button type="button" class="pay-term-option is-active" data-pay-term="1" role="radio" aria-checked="true">1年</button>',
      '<button type="button" class="pay-term-option" data-pay-term="2" role="radio" aria-checked="false">2年</button>',
      '<button type="button" class="pay-term-option" data-pay-term="3" role="radio" aria-checked="false">3年</button>',
      '</div>',
      '<div class="pay-amount" id="payAmountRow">¥<b id="payAmountValue">1,999</b><span id="payAmountUnit">/ 年</span></div>',
      '<div class="pay-qr-wrap is-locked" id="payQrWrap">',
      '<canvas id="payQrCanvas" width="180" height="180" title="演示二维码"></canvas>',
      '<button type="button" class="pay-qr-confirm" id="payConfirmButton">确认</button>',
      '</div>',
      '<div class="pay-method-mark" id="payMethodMark" aria-label="仅支持微信支付">',
      '<svg viewBox="0 0 28 28" aria-hidden="true"><path fill="#07c160" d="M11.5 3.5C6.3 3.5 2 7.2 2 11.8c0 2.6 1.4 4.9 3.7 6.4l-.9 2.9 3.3-1.6c1 .3 2.1.5 3.2.5h.7c-.3-.8-.4-1.6-.4-2.5 0-4.3 4.2-7.8 9.4-7.8h.6c-.8-3.3-4.6-5.7-9.1-5.7Z"/><path fill="#09bb07" d="M26 16.7c0-3.4-3.3-6.2-7.4-6.2s-7.4 2.8-7.4 6.2 3.3 6.2 7.4 6.2c.9 0 1.8-.1 2.7-.4l3 1.5-.9-2.6c1.7-1.1 2.6-2.8 2.6-4.7Z"/><circle cx="8.1" cy="10.4" r="1" fill="#fff"/><circle cx="13.9" cy="10.4" r="1" fill="#fff"/><circle cx="11.2" cy="15.2" r=".9" fill="#fff"/><circle cx="16.2" cy="15.2" r=".9" fill="#fff"/></svg>',
      '<span>微信支付</span>',
      '</div>',
      '<div class="pay-actions">',
      '<button type="button" class="auth-primary-button" id="payDoneButton" hidden>已完成支付</button>',
      '</div>',
      '</div></div>',
      '<div class="side-widget" id="sideWidget" aria-label="咨询工具栏">',
      '<a class="side-widget-item" href="tel:010-68321050"><span class="side-widget-bubble" aria-hidden="true"><span class="side-widget-bubble-icon"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span><span><small>咨询请拨打电话</small><strong>010-68321050</strong></span></span><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>电话咨询</span></a>',
      '<a class="side-widget-item" href="' + ONLINE_CONSULT_URL + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.4-4.1-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8 10h8M8 13.5h5"/></svg><span>在线咨询</span></a>',
      '<button type="button" class="side-widget-item side-widget-backtop" id="backTopButton" aria-label="返回顶部" title="返回顶部"><svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg><span>返回顶部</span></button>',
      '</div>',
      // 头像菜单（点击头像或用户信息区进入个人中心，其余快捷功能保留在悬停菜单中）
      '<div class="account-menu" id="avatarMenu" role="menu" aria-hidden="true">',
      '<button type="button" class="account-menu-header account-menu-profile" data-account-action="profile" role="menuitem" title="进入个人中心"><span class="account-menu-avatar" id="menuAvatar">W</span><div><strong id="menuAccount">未登录</strong><small id="menuUserType">游客</small></div><svg class="ui-icon mini account-menu-header-caret"><use href="#icon-chevron-right"></use></svg></button>',
      '<div class="account-menu-divider"></div>',
      '<button type="button" class="account-menu-item" data-account-action="profile" role="menuitem"><svg class="ui-icon mini"><use href="#icon-file"></use></svg><span>个人中心</span></button>',
      '<button type="button" class="account-menu-item" data-account-action="admin" role="menuitem" id="menuAdminItem"><svg class="ui-icon mini"><use href="#icon-grid"></use></svg><span>运营管理后台</span></button>',
      '<div class="account-menu-group">',
      '<button type="button" class="account-menu-item account-menu-parent" data-account-action="demo-perms" role="menuitem" aria-expanded="false"><svg class="ui-icon mini"><use href="#icon-spark"></use></svg><span>演示账号权限（测试）</span><svg class="ui-icon mini account-menu-caret"><use href="#icon-chevron-down"></use></svg></button>',
      '<div class="account-menu-sub" id="demoPermsSub" hidden>',
      '<button type="button" class="account-menu-item account-menu-subitem" data-account-action="upgrade" role="menuitem" id="menuUpgradeItem"><svg class="ui-icon mini"><use href="#icon-plus"></use></svg><span>开通收费会员</span></button>',
      '<button type="button" class="account-menu-item account-menu-subitem" data-account-action="downgrade" role="menuitem" id="menuDowngradeItem" hidden><svg class="ui-icon mini"><use href="#icon-arrow-left"></use></svg><span>恢复注册用户</span></button>',
      '</div>',
      '</div>',
      '<button type="button" class="account-menu-item account-menu-logout" data-account-action="logout" role="menuitem"><svg class="ui-icon mini"><use href="#icon-arrow-left"></use></svg><span>退出登录</span></button>',
      '</div>',
      // —— 账号管理弹窗：用户名管理 ——
      '<div class="account-dialog-layer" id="usernameDialogLayer" aria-hidden="true">',
      '<div class="account-dialog account-dialog-compact" role="dialog" aria-modal="true" aria-labelledby="usernameDialogTitle">',
      '<div class="account-dialog-header"><h2 id="usernameDialogTitle">用户名管理</h2><button type="button" class="dialog-close" data-account-dialog-close="usernameDialogLayer" aria-label="关闭">×</button></div>',
      '<div class="account-dialog-body">',
      '<input type="text" class="account-dialog-input" id="usernameInput" maxlength="16" placeholder="还未设定（8-16个字符，可以是字母和数字）" autocomplete="off">',
      '<p class="account-dialog-hint">设定完成用户名后，可用于用户名密码登录</p>',
      '<p class="account-dialog-error" id="usernameError"></p>',
      '</div>',
      '<div class="account-dialog-footer"><button type="button" class="account-dialog-secondary" data-account-dialog-close="usernameDialogLayer">取消</button><button type="button" class="account-dialog-primary" id="usernameConfirm">确认</button></div>',
      '</div></div>',
      // —— 账号管理弹窗：变更手机号（两步） ——
      '<div class="account-dialog-layer" id="phoneDialogLayer" aria-hidden="true">',
      '<div class="account-dialog account-dialog-compact" role="dialog" aria-modal="true" aria-labelledby="phoneDialogTitle">',
      '<div class="account-dialog-header"><h2 id="phoneDialogTitle">变更手机号</h2><button type="button" class="dialog-close" data-account-dialog-close="phoneDialogLayer" aria-label="关闭">×</button></div>',
      '<div class="account-stepper" id="phoneStepper"><span data-step="1" class="is-current">验证当前手机号</span><i></i><span data-step="2">绑定新手机号</span></div>',
      '<div class="account-dialog-step" data-phone-step="1">',
      '<p class="account-bind-line">您当前账号绑定的手机号码为</p>',
      '<p class="account-bind-phone" id="phoneDialogCurrent">+86 —</p>',
      '<div class="account-captcha-row"><input type="text" id="phoneCaptchaInput" maxlength="4" placeholder="请输入图形验证码" autocomplete="off"><canvas id="phoneCaptchaCanvas" width="96" height="40" title="点击刷新图形验证码"></canvas></div>',
      '<div class="account-sms-row"><input type="tel" id="phoneSmsInput" maxlength="6" placeholder="请输入验证码" autocomplete="off"><button type="button" id="phoneSmsSend">获取验证码</button></div>',
      '<p class="account-dialog-error" id="phoneStep1Error"></p>',
      '<button type="button" class="account-dialog-primary account-dialog-block" id="phoneNextStep">下一步</button>',
      '</div>',
      '<div class="account-dialog-step" data-phone-step="2" hidden>',
      '<input type="tel" class="account-dialog-input" id="phoneNewInput" maxlength="11" placeholder="确认新手机号" autocomplete="off">',
      '<div class="account-sms-row"><input type="tel" id="phoneNewSmsInput" maxlength="6" placeholder="请输入验证码" autocomplete="off"><button type="button" id="phoneNewSmsSend">获取验证码</button></div>',
      '<p class="account-dialog-error" id="phoneStep2Error"></p>',
      '<button type="button" class="account-dialog-primary account-dialog-block" id="phoneConfirm">确认修改</button>',
      '</div>',
      '</div></div>',
      // —— 账号管理弹窗：修改密码（两步） ——
      '<div class="account-dialog-layer" id="passwordDialogLayer" aria-hidden="true">',
      '<div class="account-dialog account-dialog-compact" role="dialog" aria-modal="true" aria-labelledby="passwordDialogTitle">',
      '<div class="account-dialog-header"><h2 id="passwordDialogTitle">修改密码</h2><button type="button" class="dialog-close" data-account-dialog-close="passwordDialogLayer" aria-label="关闭">×</button></div>',
      '<div class="account-stepper" id="passwordStepper"><span data-step="1" class="is-current">验证当前手机号</span><i></i><span data-step="2">设置新密码</span></div>',
      '<div class="account-dialog-step" data-password-step="1">',
      '<p class="account-bind-line">您当前账号绑定的手机号码为</p>',
      '<p class="account-bind-phone" id="passwordDialogCurrent">+86 —</p>',
      '<div class="account-captcha-row"><input type="text" id="passwordCaptchaInput" maxlength="4" placeholder="请输入图形验证码" autocomplete="off"><canvas id="passwordCaptchaCanvas" width="96" height="40" title="点击刷新图形验证码"></canvas></div>',
      '<div class="account-sms-row"><input type="tel" id="passwordSmsInput" maxlength="6" placeholder="请输入验证码" autocomplete="off"><button type="button" id="passwordSmsSend">获取验证码</button></div>',
      '<p class="account-dialog-error" id="passwordStep1Error"></p>',
      '<button type="button" class="account-dialog-primary account-dialog-block" id="passwordNextStep">下一步</button>',
      '</div>',
      '<div class="account-dialog-step" data-password-step="2" hidden>',
      '<input type="text" class="account-dialog-input" id="passwordConfirmInput" placeholder="确认新密码" autocomplete="new-password">',
      '<input type="password" class="account-dialog-input" id="passwordNewInput" placeholder="请输入新密码" autocomplete="new-password">',
      '<p class="account-dialog-note">- 6位-18位<br>- 可录入字母、数字及特殊字符</p>',
      '<p class="account-dialog-error" id="passwordStep2Error"></p>',
      '<button type="button" class="account-dialog-primary account-dialog-block" id="passwordConfirm">确认修改</button>',
      '</div>',
      '</div></div>'
    ].join('');
    document.body.appendChild(authShell);

    const loginView = document.getElementById('loginView');
    const tabs = [...authShell.querySelectorAll('.auth-tab')];
    const smsForm = document.getElementById('smsLoginForm');
    const passwordForm = document.getElementById('passwordLoginForm');
    const smsPhone = document.getElementById('smsPhone');
    const captchaCanvas = document.getElementById('captchaCanvas');
    const imageCaptchaInput = document.getElementById('imageCaptchaInput');
    const smsCodeInput = document.getElementById('smsCodeInput');
    const smsSendButton = document.getElementById('smsSendButton');
    const smsError = document.getElementById('smsLoginError');
    const loginError = document.getElementById('loginError');
    const upgradeLayer = document.getElementById('upgradeDialogLayer');
    const upgradeMessage = document.getElementById('upgradeDialogMessage');
    const upgradePriceBenefit = document.getElementById('upgradePriceBenefit');
    const upgradeContactButton = document.getElementById('upgradeContactButton');
    const upgradeBuyButton = document.getElementById('upgradeBuyButton');
    const payDialogLayer = document.getElementById('payDialogLayer');
    const payChainName = document.getElementById('payChainName');
    const payQrCanvas = document.getElementById('payQrCanvas');
    const payAmountRow = document.getElementById('payAmountRow');
    const payAmountValue = document.getElementById('payAmountValue');
    const payAmountUnit = document.getElementById('payAmountUnit');
    const payTermRow = document.getElementById('payTermRow');
    const payTermButtons = [...authShell.querySelectorAll('[data-pay-term]')];
    const payQrWrap = document.getElementById('payQrWrap');
    const payConfirmButton = document.getElementById('payConfirmButton');
    const payDoneButton = document.getElementById('payDoneButton');
    let payYears = 1;
    let payUnitPrice = 0;
    let payStage = 'select';
    let upgradeChain = '';
    const avatarButton = document.getElementById('avatarButton') || document.querySelector('.avatar-button');
    const avatarMenu = document.getElementById('avatarMenu');

    /* ---------- 图形验证码（登录 / 账号弹窗共用） ---------- */
    function paintCaptcha(canvas) {
      const code = Array.from({ length: 4 }, () => CAPTCHA_POOL[Math.floor(Math.random() * CAPTCHA_POOL.length)]).join('');
      canvas.dataset.captcha = code; // 静态演示原型：供自动化验证读取
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#eef3f5';
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.translate(12 + i * (width - 24) / 4, height / 2 + 6);
        ctx.rotate((Math.random() - 0.5) * 0.5);
        ctx.font = `${16 + Math.floor(Math.random() * 5)}px bold sans-serif`;
        ctx.fillStyle = ['#2c6fb5', '#0c7773', '#b3543d', '#5a6f9c'][i % 4];
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
      }
      for (let i = 0; i < 4; i += 1) {
        ctx.strokeStyle = 'rgba(60, 90, 110, .25)';
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
      }
      for (let i = 0; i < 24; i += 1) {
        ctx.fillStyle = 'rgba(60, 90, 110, .3)';
        ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
      }
      return code;
    }
    function drawCaptcha() {
      captchaCode = paintCaptcha(captchaCanvas);
    }
    captchaCanvas.addEventListener('click', () => { drawCaptcha(); imageCaptchaInput.value = ''; });
    drawCaptcha();

    /* ---------- 页签切换 ---------- */
    function switchTab(tabName) {
      currentView = tabName;
      tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.authTab === tabName));
      smsForm.classList.toggle('is-active', tabName === 'sms');
      passwordForm.classList.toggle('is-active', tabName === 'password');
      clearErrors();
    }
    tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.authTab)));

    function clearErrors() {
      smsError.textContent = '';
      smsError.classList.remove('has-error');
      loginError.textContent = '';
      loginError.classList.remove('has-error');
    }

    function setError(element, message) {
      element.textContent = message;
      element.classList.toggle('has-error', Boolean(message));
    }

    /* ---------- 短信验证码（演示环境：直接在提示中回显验证码） ---------- */
    smsSendButton.addEventListener('click', () => {
      const phone = smsPhone.value.trim();
      if (!/^1\d{10}$/.test(phone)) return setError(smsError, '请输入有效的11位手机号');
      if (imageCaptchaInput.value.trim().toUpperCase() !== captchaCode) {
        drawCaptcha();
        imageCaptchaInput.value = '';
        return setError(smsError, '图形验证码不正确，请重新输入');
      }
      setError(smsError, '');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      smsPending = { phone, code, expire: Date.now() + 5 * 60 * 1000 };
      notify(`验证码已发送（演示环境验证码：${code}）`);
      smsCountdown = 60;
      smsSendButton.disabled = true;
      smsSendButton.classList.add('is-counting');
      clearInterval(smsTimer);
      smsTimer = setInterval(() => {
        smsCountdown -= 1;
        if (smsCountdown <= 0) {
          clearInterval(smsTimer);
          smsSendButton.disabled = false;
          smsSendButton.classList.remove('is-counting');
          smsSendButton.textContent = '获取验证码';
        } else {
          smsSendButton.textContent = `${smsCountdown}s 后重发`;
        }
      }, 1000);
    });

    /* ---------- 登录即注册 ---------- */
    function findOrRegisterUser(phone) {
      const users = readUsers();
      if (!users[phone]) {
        users[phone] = { type: 'registered', createdAt: new Date().toISOString() };
        saveUsers(users);
        notify('注册成功，已自动登录');
      }
      return users[phone];
    }

    function signIn(phone, type, options = {}) {
      const users = readUsers();
      const user = users[phone] || { type: 'registered', createdAt: new Date().toISOString() };
      const finalType = type || user.type || 'registered';
      // 收费用户按条开通产业链：登录 / 支付时保留已开通清单
      const chains = Array.isArray(options.chains) ? options.chains : (Array.isArray(user.chains) ? user.chains : []);
      // 后台管理权限：演示原型默认给当前账号开通，正式版本由权限管理系统分配
      const admin = user.admin === undefined ? true : Boolean(user.admin);
      users[phone] = { ...user, type: finalType, chains, admin, lastLoginAt: new Date().toISOString() };
      saveUsers(users);
      localStorage.setItem(USER_KEY, JSON.stringify({ phone, type: finalType, chains, admin, loginAt: Date.now() }));
      closeLogin();
      updateAuthUi();
      if (!options.silent) notify(type === 'paid' ? (chains.length ? `已开通 ${chains.length} 条产业链（演示）` : '已开通收费会员（演示）') : '登录成功，欢迎进入五度易链');
      document.dispatchEvent(new CustomEvent('wudu-auth-change', { detail: { phone, type: finalType, chains } }));
    }

    smsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const phone = smsPhone.value.trim();
      if (!/^1\d{10}$/.test(phone)) return setError(smsError, '请输入有效的11位手机号');
      if (!document.getElementById('smsAgreement').checked) return setError(smsError, '请先勾选同意用户服务协议与隐私政策');
      if (!smsPending || smsPending.phone !== phone) return setError(smsError, '请先获取短信验证码');
      if (Date.now() > smsPending.expire) return setError(smsError, '验证码已过期，请重新获取');
      if (smsCodeInput.value.trim() !== smsPending.code) return setError(smsError, '短信验证码不正确');
      // 后台停用账号拦截：停用后无法登录前台
      const blockedUser = readUsers()[phone];
      if (blockedUser && blockedUser.status === 'disabled') return setError(smsError, '该账号已被停用，如有疑问请联系平台客服');
      const isNew = !readUsers()[phone];
      setError(smsError, '');
      smsPending = null;
      smsCodeInput.value = '';
      signIn(phone);
      if (!isNew) notify('登录成功，欢迎进入五度易链');
    });

    passwordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const account = document.getElementById('loginAccount').value.trim();
      const password = document.getElementById('loginPassword').value;
      const saved = readAccount();
      if (!account || !password) return setError(loginError, '请输入登录账号和密码');
      // 支持手机号 / 用户名 + 密码登录（用户名管理设置后可用）
      const users = readUsers();
      const matchedPhone = Object.keys(users).find((phone) => (
        (phone === account && users[phone].password) ||
        (users[phone].username || '').toLowerCase() === account.toLowerCase()
      ));
      const okDemo = account === (saved.account || DEFAULT_ACCOUNT) && password === (saved.password || DEFAULT_PASSWORD);
      const okUser = matchedPhone && users[matchedPhone].password === password;
      if (!okDemo && !okUser) {
        return setError(loginError, '账号或密码不正确，请检查后重试');
      }
      // 后台停用账号拦截：停用后无法登录前台
      if (matchedPhone && users[matchedPhone].status === 'disabled') {
        return setError(loginError, '该账号已被停用，如有疑问请联系平台客服');
      }
      setError(loginError, '');
      document.getElementById('loginPassword').value = '';
      signIn(matchedPhone || account);
    });

    /* ---------- 弹窗开关 ---------- */
    function openLogin() {
      closeAvatarMenu();
      upgradeLayer.classList.remove('is-open');
      clearErrors();
      switchTab('sms');
      loginView.classList.add('is-open');
      loginView.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-open');
      setTimeout(() => { smsPhone.focus(); }, 60);
    }

    function closeLogin() {
      loginView.classList.remove('is-open');
      loginView.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('auth-open');
    }

    loginView.addEventListener('click', (event) => {
      if (event.target === loginView || event.target.closest('[data-auth-close]')) closeLogin();
    });

    /* 协议正文：与个人中心「服务协议」共用 agreements.js，点击链接查看对应法务定稿 */
    const authAgreementLayer = document.getElementById('authAgreementLayer');
    const authAgreementTitle = document.getElementById('authAgreementTitle');
    const authAgreementBody = document.getElementById('authAgreementBody');
    function openAgreement(key) {
      if (!window.WuduAgreements || typeof window.WuduAgreements.render !== 'function') {
        notify('协议内容加载失败，请刷新页面后重试');
        return;
      }
      const type = key === 'privacy' ? 'privacy' : 'service';
      authAgreementTitle.textContent = type === 'privacy' ? '隐私政策' : '用户服务协议';
      authAgreementBody.innerHTML = window.WuduAgreements.render(type);
      authAgreementBody.scrollTop = 0;
      authAgreementLayer.classList.add('is-open');
      authAgreementLayer.setAttribute('aria-hidden', 'false');
    }
    function closeAgreement() {
      authAgreementLayer.classList.remove('is-open');
      authAgreementLayer.setAttribute('aria-hidden', 'true');
    }
    authAgreementLayer.addEventListener('click', (event) => {
      if (event.target === authAgreementLayer || event.target.closest('[data-auth-agreement-close]')) closeAgreement();
    });
    authShell.querySelectorAll('[data-agreement]').forEach((link) => {
      link.addEventListener('click', () => openAgreement(link.dataset.agreement));
    });

    /* ---------- 开通服务对话框 ---------- */
    function openUpgrade(message, chainName, renewInfo) {
      closeLogin();
      closeAvatarMenu();
      upgradeChain = chainName || '';
      upgradeRenew = renewInfo || null;
      // 开通方式由运营管理后台配置：未配置固定价格时只走人工沟通
      const sale = getChainSaleMode(upgradeChain);
      const contactOnly = sale.mode === 'contact';
      const base = message || '开通产业链服务后即可查看对应产业链图谱与上链企业。';
      upgradeMessage.textContent = contactOnly
        ? `${base}该产业链开通需联系客服沟通，客服会根据您的需求提供开通方案。`
        : `${base}开通费用 ¥${sale.price.toLocaleString('zh-CN')} / 年，支持在线开通。`;
      // 仅联系客服：移除在线开通按钮与所有价格示意，只保留客服入口并突出显示
      upgradeBuyButton.hidden = contactOnly;
      upgradePriceBenefit.hidden = contactOnly;
      if (!contactOnly) upgradePriceBenefit.textContent = `按产业链开通：¥${sale.price.toLocaleString('zh-CN')} / 年，开通哪条看哪条`;
      upgradeContactButton.classList.toggle('upgrade-secondary-button', !contactOnly);
      upgradeContactButton.classList.toggle('auth-primary-button', contactOnly);
      upgradeContactButton.classList.toggle('upgrade-primary-button', contactOnly);
      upgradeLayer.classList.add('is-open');
      upgradeLayer.setAttribute('aria-hidden', 'false');
    }

    function closeUpgrade() {
      upgradeLayer.classList.remove('is-open');
      upgradeLayer.setAttribute('aria-hidden', 'true');
    }

    upgradeLayer.addEventListener('click', (event) => {
      if (event.target === upgradeLayer || event.target.closest('[data-upgrade-close]')) closeUpgrade();
    });
    document.getElementById('upgradeContactButton').addEventListener('click', () => {
      closeUpgrade();
      upgradeRenew = null;
      // 与右侧悬浮栏「在线咨询」打开同一个客服页面
      openOnlineConsult();
    });
    document.getElementById('upgradeBuyButton').addEventListener('click', () => {
      const user = getUser();
      if (!user) return openLogin('请先登录后再开通服务');
      openPayDialog(upgradeChain);
    });

    /* ---------- 账号管理弹窗（用户名 / 变更手机号 / 修改密码） ---------- */
    const usernameDialogLayer = document.getElementById('usernameDialogLayer');
    const phoneDialogLayer = document.getElementById('phoneDialogLayer');
    const passwordDialogLayer = document.getElementById('passwordDialogLayer');

    function openAccountDialog(layer) {
      closeAvatarMenu();
      closeLogin();
      closeUpgrade();
      layer.classList.add('is-open');
      layer.setAttribute('aria-hidden', 'false');
    }

    function closeAccountDialog(layer) {
      layer.classList.remove('is-open');
      layer.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('[data-account-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => closeAccountDialog(document.getElementById(button.dataset.accountDialogClose)));
    });
    [usernameDialogLayer, phoneDialogLayer, passwordDialogLayer].forEach((layer) => {
      layer.addEventListener('click', (event) => { if (event.target === layer) closeAccountDialog(layer); });
    });

    function setStepError(id, message) {
      const element = document.getElementById(id);
      element.textContent = message;
      element.classList.toggle('has-error', Boolean(message));
    }

    // 两步弹窗步骤切换：stepper 高亮 + 面板显隐
    function switchDialogStep(layer, stepKey, step) {
      layer.querySelectorAll('.account-dialog-step').forEach((panel) => {
        panel.hidden = panel.dataset[stepKey] !== String(step);
      });
      layer.querySelectorAll('.account-stepper span').forEach((label) => {
        label.classList.toggle('is-current', Number(label.dataset.step) === step);
        label.classList.toggle('is-done', Number(label.dataset.step) < step);
      });
    }

    function startSmsCountdown(button) {
      let seconds = 60;
      button.disabled = true;
      button.textContent = `${seconds}s 后重发`;
      const timer = setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) {
          clearInterval(timer);
          button.disabled = false;
          button.textContent = '获取验证码';
        } else {
          button.textContent = `${seconds}s 后重发`;
        }
      }, 1000);
    }

    /* —— 用户名管理 —— */
    function openUsernameDialog() {
      const user = getUser();
      const input = document.getElementById('usernameInput');
      input.value = (readUsers()[user.phone] || {}).username || '';
      setStepError('usernameError', '');
      openAccountDialog(usernameDialogLayer);
      setTimeout(() => input.focus(), 60);
    }
    document.getElementById('usernameConfirm').addEventListener('click', () => {
      const user = getUser();
      const value = document.getElementById('usernameInput').value.trim();
      if (!/^[A-Za-z0-9]{8,16}$/.test(value)) return setStepError('usernameError', '用户名需为 8-16 个字符，可以是字母和数字');
      const users = readUsers();
      users[user.phone] = { ...(users[user.phone] || { type: user.type }), username: value };
      saveUsers(users);
      setStepError('usernameError', '');
      closeAccountDialog(usernameDialogLayer);
      notify('用户名设置成功，可用于用户名密码登录');
      document.dispatchEvent(new CustomEvent('wudu-account-updated'));
    });

    /* —— 变更手机号（两步：验证当前 → 绑定新手机号） —— */
    let phoneSmsPending = null;
    let phoneNewSmsPending = null;
    function openPhoneDialog() {
      const user = getUser();
      document.getElementById('phoneDialogCurrent').textContent = `+86 ${user.phone}`;
      ['phoneCaptchaInput', 'phoneSmsInput', 'phoneNewInput', 'phoneNewSmsInput'].forEach((id) => { document.getElementById(id).value = ''; });
      setStepError('phoneStep1Error', '');
      setStepError('phoneStep2Error', '');
      phoneSmsPending = null;
      phoneNewSmsPending = null;
      switchDialogStep(phoneDialogLayer, 'phoneStep', 1);
      paintCaptcha(document.getElementById('phoneCaptchaCanvas'));
      openAccountDialog(phoneDialogLayer);
    }
    document.getElementById('phoneCaptchaCanvas').addEventListener('click', () => {
      paintCaptcha(document.getElementById('phoneCaptchaCanvas'));
      document.getElementById('phoneCaptchaInput').value = '';
    });
    // 获取验证码前必须先通过图形验证码
    document.getElementById('phoneSmsSend').addEventListener('click', () => {
      const canvas = document.getElementById('phoneCaptchaCanvas');
      if (document.getElementById('phoneCaptchaInput').value.trim().toUpperCase() !== canvas.dataset.captcha) {
        paintCaptcha(canvas);
        document.getElementById('phoneCaptchaInput').value = '';
        return setStepError('phoneStep1Error', '图形验证码不正确，请重新输入');
      }
      setStepError('phoneStep1Error', '');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      phoneSmsPending = { code, expire: Date.now() + 5 * 60 * 1000 };
      notify(`验证码已发送（演示环境验证码：${code}）`);
      startSmsCountdown(document.getElementById('phoneSmsSend'));
    });
    document.getElementById('phoneNextStep').addEventListener('click', () => {
      if (!phoneSmsPending || Date.now() > phoneSmsPending.expire) return setStepError('phoneStep1Error', '请先获取短信验证码');
      if (document.getElementById('phoneSmsInput').value.trim() !== phoneSmsPending.code) return setStepError('phoneStep1Error', '短信验证码不正确');
      setStepError('phoneStep1Error', '');
      phoneSmsPending = null;
      switchDialogStep(phoneDialogLayer, 'phoneStep', 2);
    });
    document.getElementById('phoneNewSmsSend').addEventListener('click', () => {
      const newPhone = document.getElementById('phoneNewInput').value.trim();
      if (!/^1\d{10}$/.test(newPhone)) return setStepError('phoneStep2Error', '请输入有效的新手机号');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      phoneNewSmsPending = { code, expire: Date.now() + 5 * 60 * 1000 };
      notify(`验证码已发送（演示环境验证码：${code}）`);
      startSmsCountdown(document.getElementById('phoneNewSmsSend'));
    });
    document.getElementById('phoneConfirm').addEventListener('click', () => {
      const user = getUser();
      const newPhone = document.getElementById('phoneNewInput').value.trim();
      if (!/^1\d{10}$/.test(newPhone)) return setStepError('phoneStep2Error', '请输入有效的新手机号');
      if (newPhone === user.phone) return setStepError('phoneStep2Error', '新手机号与当前手机号相同');
      if (!phoneNewSmsPending || Date.now() > phoneNewSmsPending.expire) return setStepError('phoneStep2Error', '请先获取短信验证码');
      if (document.getElementById('phoneNewSmsInput').value.trim() !== phoneNewSmsPending.code) return setStepError('phoneStep2Error', '短信验证码不正确');
      // 迁移账号记录到新手机号
      const users = readUsers();
      const record = users[user.phone] || { type: user.type };
      delete users[user.phone];
      users[newPhone] = { ...record, phone: newPhone };
      saveUsers(users);
      localStorage.setItem(USER_KEY, JSON.stringify({ ...user, phone: newPhone, loginAt: Date.now() }));
      phoneNewSmsPending = null;
      closeAccountDialog(phoneDialogLayer);
      updateAuthUi();
      notify('手机号变更成功，请使用新手机号登录');
      document.dispatchEvent(new CustomEvent('wudu-account-updated'));
      document.dispatchEvent(new CustomEvent('wudu-auth-change', { detail: { phone: newPhone, type: user.type, chains: user.chains || [] } }));
    });

    /* —— 修改密码（两步：验证当前 → 设置新密码） —— */
    let passwordSmsPending = null;
    function openPasswordDialog() {
      const user = getUser();
      document.getElementById('passwordDialogCurrent').textContent = `+86 ${user.phone}`;
      ['passwordCaptchaInput', 'passwordSmsInput', 'passwordConfirmInput', 'passwordNewInput'].forEach((id) => { document.getElementById(id).value = ''; });
      setStepError('passwordStep1Error', '');
      setStepError('passwordStep2Error', '');
      passwordSmsPending = null;
      switchDialogStep(passwordDialogLayer, 'passwordStep', 1);
      paintCaptcha(document.getElementById('passwordCaptchaCanvas'));
      openAccountDialog(passwordDialogLayer);
    }
    document.getElementById('passwordCaptchaCanvas').addEventListener('click', () => {
      paintCaptcha(document.getElementById('passwordCaptchaCanvas'));
      document.getElementById('passwordCaptchaInput').value = '';
    });
    document.getElementById('passwordSmsSend').addEventListener('click', () => {
      const canvas = document.getElementById('passwordCaptchaCanvas');
      if (document.getElementById('passwordCaptchaInput').value.trim().toUpperCase() !== canvas.dataset.captcha) {
        paintCaptcha(canvas);
        document.getElementById('passwordCaptchaInput').value = '';
        return setStepError('passwordStep1Error', '图形验证码不正确，请重新输入');
      }
      setStepError('passwordStep1Error', '');
      const code = String(Math.floor(100000 + Math.random() * 900000));
      passwordSmsPending = { code, expire: Date.now() + 5 * 60 * 1000 };
      notify(`验证码已发送（演示环境验证码：${code}）`);
      startSmsCountdown(document.getElementById('passwordSmsSend'));
    });
    document.getElementById('passwordNextStep').addEventListener('click', () => {
      if (!passwordSmsPending || Date.now() > passwordSmsPending.expire) return setStepError('passwordStep1Error', '请先获取短信验证码');
      if (document.getElementById('passwordSmsInput').value.trim() !== passwordSmsPending.code) return setStepError('passwordStep1Error', '短信验证码不正确');
      setStepError('passwordStep1Error', '');
      passwordSmsPending = null;
      switchDialogStep(passwordDialogLayer, 'passwordStep', 2);
    });
    document.getElementById('passwordConfirm').addEventListener('click', () => {
      const user = getUser();
      const confirmed = document.getElementById('passwordConfirmInput').value;
      const next = document.getElementById('passwordNewInput').value;
      if (next.length < 6 || next.length > 18) return setStepError('passwordStep2Error', '新密码长度需为 6-18 位');
      if (!confirmed) return setStepError('passwordStep2Error', '请再次确认新密码');
      if (confirmed !== next) return setStepError('passwordStep2Error', '两次输入的密码不一致');
      const users = readUsers();
      users[user.phone] = { ...(users[user.phone] || { type: user.type }), password: next };
      saveUsers(users);
      // 同步演示账号的密码登录记录
      const saved = readAccount();
      if (saved.account && saved.account === user.phone) {
        saved.password = next;
        localStorage.setItem(AUTH_KEY, JSON.stringify(saved));
      }
      setStepError('passwordStep2Error', '');
      closeAccountDialog(passwordDialogLayer);
      notify('密码修改成功，请使用新密码登录');
      document.dispatchEvent(new CustomEvent('wudu-account-updated'));
    });

    /* ---------- 二维码付款弹窗（年价取后台配置，支持 1/2/3 年） ---------- */
    function drawPayQr(seedText) {
      const ctx = payQrCanvas.getContext('2d');
      const size = payQrCanvas.width;
      const cell = 10;
      const cells = size / cell;
      let seed = [...String(seedText)].reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 7) || 7;
      const rand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#1f2d3d';
      for (let y = 0; y < cells; y += 1) {
        for (let x = 0; x < cells; x += 1) {
          if (rand() > 0.52) ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
      // 三个定位角
      [[0, 0], [cells - 7, 0], [0, cells - 7]].forEach(([gx, gy]) => {
        ctx.fillStyle = '#1f2d3d';
        ctx.fillRect(gx * cell, gy * cell, 7 * cell, 7 * cell);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx * cell + cell, gy * cell + cell, 5 * cell, 5 * cell);
        ctx.fillStyle = '#1f2d3d';
        ctx.fillRect(gx * cell + 2 * cell, gy * cell + 2 * cell, 3 * cell, 3 * cell);
      });
    }

    function updatePayAmount() {
      const total = Math.round(payUnitPrice * payYears);
      payAmountValue.textContent = total.toLocaleString('zh-CN');
      payAmountUnit.textContent = payYears === 1 ? '/ 年' : `/ ${payYears}年`;
    }

    function markPayTerm() {
      payTermButtons.forEach((button) => {
        const active = Number(button.dataset.payTerm) === payYears;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', String(active));
      });
    }

    function payQrSeed(suffix) {
      const user = getUser();
      const total = Math.round(payUnitPrice * payYears);
      return `${upgradeChain || 'chain'}|${user ? user.phone : 'guest'}|${payYears}|${total}|${suffix}`;
    }

    // 固定价格：二维码默认模糊并叠加「确认」；确认后去掉模糊与按钮，展示真实收款码
    function setPayStage(stage) {
      payStage = stage;
      const priceMode = getChainSaleMode(upgradeChain).mode === 'price';
      const confirmed = stage === 'qr';
      payTermRow.hidden = !priceMode;
      payAmountRow.hidden = !priceMode;
      payQrWrap.hidden = false;
      payQrWrap.classList.toggle('is-locked', priceMode && !confirmed);
      payConfirmButton.hidden = !priceMode || confirmed;
      payDoneButton.hidden = !confirmed;
      drawPayQr(payQrSeed(confirmed ? Date.now() : 'preview'));
    }

    function openPayDialog(chainName) {
      closeUpgrade();
      const sale = getChainSaleMode(chainName);
      payChainName.textContent = chainName ? `${chainName}产业链` : '指定产业链（开通后可联系客服指定）';
      payUnitPrice = sale.mode === 'price' ? sale.price : 0;
      payYears = 1;
      markPayTerm();
      updatePayAmount();
      payDialogLayer.classList.add('is-open');
      payDialogLayer.setAttribute('aria-hidden', 'false');
      // 仅联系客服的演示订单保留原扫码流程：无年限、无价格，直接展示二维码
      setPayStage(sale.mode === 'price' ? 'select' : 'qr');
    }

    function closePayDialog() {
      payDialogLayer.classList.remove('is-open');
      payDialogLayer.setAttribute('aria-hidden', 'true');
    }

    payDialogLayer.addEventListener('click', (event) => {
      if (event.target === payDialogLayer || event.target.closest('[data-pay-close]')) closePayDialog();
    });
    payTermButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const wasConfirmed = payStage === 'qr';
        payYears = Math.max(1, Number(button.dataset.payTerm) || 1);
        markPayTerm();
        updatePayAmount();
        // 已确认收款码后切换年限，需要重新确认，避免金额与二维码不一致
        if (wasConfirmed) setPayStage('select');
        else drawPayQr(payQrSeed('preview'));
      });
    });
    payConfirmButton.addEventListener('click', () => setPayStage('qr'));
    payDoneButton.addEventListener('click', () => purchaseChain(upgradeChain, payYears));

    // 演示支付成功：记录已开通的产业链（收费用户按条开通，不解锁全部）
    function purchaseChain(chainName, years = 1) {
      const user = getUser();
      if (!user) return openLogin('请先登录后再开通服务');
      const term = Math.max(1, Number(years) || 1);
      const chains = new Set(Array.isArray(user.chains) ? user.chains : []);
      if (chainName) chains.add(chainName);
      signIn(user.phone, 'paid', { chains: [...chains] });
      const sale = getChainSaleMode(chainName);
      const unitPrice = sale.mode === 'price' ? sale.price : 0;
      const renew = upgradeRenew;
      upgradeRenew = null;
      if (renew && window.WuduUserCenter && typeof window.WuduUserCenter.recordRenewal === 'function') {
        // 从「我的服务」续费/重新开通进入：按原服务到期时间顺延落库
        window.WuduUserCenter.recordRenewal(chainName, user.phone, unitPrice, term, renew);
      } else if (window.WuduUserCenter && typeof window.WuduUserCenter.recordPurchase === 'function') {
        // 首次开通：用户端「我的订单」同步生成一条支付完成的订单，服务期与扫码时选择的一致
        window.WuduUserCenter.recordPurchase(chainName, user.phone, unitPrice, term);
      }
      closePayDialog();
      notify(chainName ? `「${chainName}」${term}年服务已开通（演示支付），可查看该产业链图谱与上链企业` : '开通成功（演示支付）');
    }

    /* ---------- 右侧咨询工具栏（电话咨询 / 在线咨询 / 返回顶部） ---------- */
    // 开通弹窗的「联系客服」复用在线咨询入口：构造临时链接点击，行为与右侧按钮完全一致
    function openOnlineConsult() {
      const link = document.createElement('a');
      link.href = ONLINE_CONSULT_URL;
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    // 返回顶部：跟随页面滚动自动出现/隐藏（滚动超过一屏的 40% 时出现）
    const backTopButton = document.getElementById('backTopButton');
    const scrollRoot = document.querySelector('.main-content') || document.documentElement;
    function updateBackTopVisibility() {
      const scrollTop = Math.max(scrollRoot.scrollTop, window.scrollY || 0);
      backTopButton.classList.toggle('is-visible', scrollTop > 400);
    }
    scrollRoot.addEventListener('scroll', updateBackTopVisibility, { passive: true });
    window.addEventListener('scroll', updateBackTopVisibility, { passive: true });
    updateBackTopVisibility();
    backTopButton.addEventListener('click', () => {
      scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ---------- 头像按钮与菜单 ---------- */
    // 点击头像：直接进入个人中心；鼠标悬停：展开快捷菜单（个人中心 / 后台 / 演示权限 / 退出登录）
    let menuHoverTimer = null;
    function showAvatarMenuOnHover() {
      if (!getUser()) return;
      clearTimeout(menuHoverTimer);
      if (!avatarMenu.classList.contains('is-open')) toggleAvatarMenu();
    }
    function scheduleAvatarMenuClose() {
      clearTimeout(menuHoverTimer);
      menuHoverTimer = setTimeout(() => {
        if (avatarMenu.classList.contains('is-open')) closeAvatarMenu();
      }, 220);
    }
    if (avatarButton) {
      avatarButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!getUser()) { openLogin(); return; }
        closeLogin();
        closeAvatarMenu();
        if (window.WuduUserCenter) window.WuduUserCenter.open();
      });
      avatarButton.addEventListener('mouseenter', showAvatarMenuOnHover);
      avatarButton.addEventListener('mouseleave', scheduleAvatarMenuClose);
      avatarButton.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' && getUser()) {
          event.preventDefault();
          showAvatarMenuOnHover();
        }
      });
    }
    avatarMenu.addEventListener('mouseenter', () => clearTimeout(menuHoverTimer));
    avatarMenu.addEventListener('mouseleave', scheduleAvatarMenuClose);

    avatarMenu.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-account-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.accountAction;
      if (action === 'demo-perms') {
        // 二级子菜单：展开 / 收起，不关闭浮窗
        const sub = document.getElementById('demoPermsSub');
        const open = sub.hidden;
        sub.hidden = !open;
        actionButton.classList.toggle('is-expanded', open);
        actionButton.setAttribute('aria-expanded', String(open));
        return;
      }
      closeAvatarMenu();
      if (action === 'profile') {
        if (window.WuduUserCenter) window.WuduUserCenter.open();
        return;
      }
      if (action === 'upgrade') openUpgrade('开通产业链服务后即可查看对应产业链图谱与上链企业。');
      if (action === 'downgrade') {
        const user = getUser();
        if (user) signIn(user.phone, 'registered', { silent: true });
        notify('已恢复为注册用户（演示）');
      }
      if (action === 'admin') {
        const user = getUser();
        if (!user) return openLogin();
        if (!user.admin) return notify('当前账号未开通后台管理权限，请联系管理员');
        window.location.href = 'admin/admin.html';
      }
      if (action === 'logout') logout();
    });

    document.addEventListener('click', (event) => {
      if (!avatarMenu.contains(event.target) && event.target !== avatarButton && !event.target.closest('.avatar-button')) closeAvatarMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (phoneDialogLayer.classList.contains('is-open')) closeAccountDialog(phoneDialogLayer);
      else if (passwordDialogLayer.classList.contains('is-open')) closeAccountDialog(passwordDialogLayer);
      else if (usernameDialogLayer.classList.contains('is-open')) closeAccountDialog(usernameDialogLayer);
      else if (payDialogLayer.classList.contains('is-open')) closePayDialog();
      else if (upgradeLayer.classList.contains('is-open')) closeUpgrade();
      else if (loginView.classList.contains('is-open')) closeLogin();
      else closeAvatarMenu();
    });
    window.addEventListener('resize', () => {
      if (avatarMenu.classList.contains('is-open')) positionAvatarMenu();
    });

    function toggleAvatarMenu() {
      const open = avatarMenu.classList.toggle('is-open');
      avatarMenu.setAttribute('aria-hidden', String(!open));
      if (avatarButton) avatarButton.setAttribute('aria-expanded', String(open));
      if (open) positionAvatarMenu();
    }

    function closeAvatarMenu() {
      avatarMenu.classList.remove('is-open');
      avatarMenu.setAttribute('aria-hidden', 'true');
      if (avatarButton) avatarButton.setAttribute('aria-expanded', 'false');
    }

    function positionAvatarMenu() {
      if (!avatarButton) return;
      const rect = avatarButton.getBoundingClientRect();
      const menuWidth = Math.max(238, avatarMenu.offsetWidth);
      const left = Math.min(Math.max(16, rect.right - menuWidth), window.innerWidth - menuWidth - 16);
      avatarMenu.style.top = String(rect.bottom + 10) + 'px';
      avatarMenu.style.left = String(left) + 'px';
    }

    function logout() {
      localStorage.removeItem(USER_KEY);
      closeLogin();
      closeUpgrade();
      closeAvatarMenu();
      updateAuthUi();
      notify('已退出登录');
      document.dispatchEvent(new CustomEvent('wudu-auth-change', { detail: { phone: null, type: 'visitor' } }));
    }

    function updateAuthUi() {
      const user = getUser();
      const typeLabel = user ? (user.type === 'paid' ? '收费会员' : '注册用户') : '游客';
      document.getElementById('menuAccount').textContent = user ? user.phone : '未登录';
      document.getElementById('menuUserType').textContent = user ? typeLabel : '游客 — 登录后可查看更多';
      document.getElementById('menuAvatar').textContent = user ? user.phone.slice(-4) : 'W';
      document.getElementById('menuUpgradeItem').hidden = !user || user.type === 'paid';
      document.getElementById('menuDowngradeItem').hidden = !user || user.type !== 'paid';
      document.getElementById('menuAdminItem').hidden = !user || !user.admin;
      if (avatarButton) {
        // 未登录显示「登录/注册」胶囊按钮，登录后恢复圆形头像徽标
        avatarButton.textContent = user ? (user.type === 'paid' ? 'V' : '会') : '登录/注册';
        avatarButton.classList.toggle('login-pill', !user);
        avatarButton.title = user ? `${user.phone}（${typeLabel}）` : '点击登录/注册';
        avatarButton.setAttribute('aria-label', user ? `当前用户：${user.phone}（${typeLabel}）` : '点击登录/注册');
      }
    }

    updateAuthUi();

    /* ---------- 存取 ---------- */
    function readAccount() {
      try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}'); } catch (error) { return {}; }
    }
    function readUsers() {
      try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch (error) { return {}; }
    }
    function saveUsers(users) {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function notify(message) {
      if (typeof window.showToast === 'function') window.showToast(message);
    }

    /* ---------- 对外 API ---------- */
    window.WuduAuth = {
      isAuthenticated: () => Boolean(getUser()),
      getUser,
      getUserType,
      openLogin,
      openUpgrade,
      // 供前台其他模块读取后台配置的开通方式（默认仅联系客服）
      getChainSaleMode,
      logout,
      // 个人中心「账号设置」复用已有的三个账号管理弹窗
      openAccountSetting: (type) => {
        if (!getUser()) return openLogin();
        if (type === 'username') openUsernameDialog();
        else if (type === 'phone') openPhoneDialog();
        else if (type === 'password') openPasswordDialog();
      },
      // 个人中心「我的订单」待支付订单跳转支付
      payForChain: (chainName) => {
        upgradeChain = chainName || '';
        upgradeRenew = null;
        openPayDialog(chainName || '');
      },
      // 统一在线咨询入口：解决方案「提交定制需求」、开通弹窗「联系客服」复用
      openOnlineConsult
    };
    // 存储键名暴露：后台管理平台（admin.js）共用同一份账号数据
    window.WUDU_AUTH_KEYS = { USER_KEY, USERS_KEY, AUTH_KEY };

    function getUser() {
      try {
        const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        return user && user.phone ? user : null;
      } catch (error) {
        return null;
      }
    }
    function getUserType() {
      const user = getUser();
      if (!user) return 'visitor';
      return user.type === 'paid' ? 'paid' : 'registered';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
