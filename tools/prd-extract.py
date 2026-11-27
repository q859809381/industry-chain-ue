# -*- coding: utf-8 -*-
"""从多份 PRD docx 提取结构化内容，生成带版本正文的 docs/prd-content.js。

页签结构：全局介绍（1 引言 / 2 用户角色 / 3 产品概述 / 4 全局业务规则）
         + 页面与功能描述（5.1-5.7 各模块），两个页签均带左侧锚点导航。
编号在页签内从 1 重排：一级「一、二、三」，二级「1、2」，三级「1.1」。
封面、文档信息与修订记录、目录不入抽屉。

版本：V1.2.0 从图谱补全版 docx 生成；V1.1.0 使用 prd-v1.1.0-snapshot.json 原样保留；
      V1.0.0 从 20261111 的初版 docx 生成。三个版本均可在原型抽屉内切换查看。
"""
import re, html, json, zipfile

BASE = r'D:/projects/AI_dowell_2.0/五度产业链'
OUT = BASE + r'/docs/prd-content.js'
SNAP_V110 = BASE + r'/tools/prd-v1.1.0-snapshot.json'
DOCX_V120 = BASE + r'/output/prd-industry-chain-20261126/stage3/产业链全景图谱平台PRD文档_v1.2.0_图谱补全版.docx'
DOCX_V100 = BASE + r'/output/prd-industry-chain-20261111/stage3/产业链全景图谱平台PRD文档.docx'

H_STYLE = {'000005': 1, '000001': 2, '000004': 3}

# 正文交叉引用重写：抽屉内编号已按页签重排，正文中引用旧编号需映射到新编号表达
REF_RULES = [
    ('对应 5.2 节', '对应「二、产业图谱（核心模块）」'),
    ('（详见 4.2）', '（详见全局业务规则-2、产业链查看与开通权限）'),
    ('受 4.2 权限规则约束', '受产业链查看与开通权限规则约束（全局业务规则-2）'),
    ('按 4.2 权限规则执行', '按产业链查看与开通权限规则执行（全局业务规则-2）'),
    ('（见 4.2）', '（见产业链查看与开通权限规则，全局业务规则-2）'),
    ('（见 5.2.4）', '（见 4、环节企业清单抽屉）'),
    ('（见 5.2.7）', '（见 6、企业详情）'),
    ('权限规则同 5.2.4', '权限规则同「4、环节企业清单抽屉」'),
    # V1.2.0 新增模块带来的交叉引用（抽屉内编号已重排）
    ('（详见 5.7）', '（详见「七、运营管理后台」）'),
    ('详见 5.6。', '详见「六、个人中心」。'),
    ('（见 5.7.4）', '（见 七、运营管理后台-4、产业链价格）'),
    ('（见 5.7.5）', '（见 七、运营管理后台-5、首页管理）'),
    ('（见 5.7.3）', '（见 七、运营管理后台-3、产业链展示）'),
]

# V1.1.0 相对 V1.0.0 的章节高亮注记（快照正文已带，不再重新生成）
# V1.2.0 相对 V1.1.0 变更的章节（原编号 -> 悬浮说明）
# 说明文字均以「当前版本正文 vs V1.1.0 快照正文逐字比对」为依据；
# 两版实质相同（仅标点/语气差异）的章节不标注，避免误报。
UPDATE_NOTES_V120 = [
    ('1.1', '编写目的：补充个人中心与运营管理后台说明范围，首页、AI 助手、通用组件调整为支撑模块。'),
    ('1.2', '适用范围：将个人中心、运营管理后台纳入文档范围，明确原型页面清单。'),
    ('1.3', '术语与约定：新增「开通方式」「成交价」「服务期」「权限项」四项术语；开通服务价格由占位 ¥xxx 改为 ¥199/条。'),
    ('2', '用户角色：新增「管理员」角色，明确其通过头像浮窗进入运营管理后台的权限。'),
    ('3.2', '产品目标：补充运营侧通过后台配置图谱展示、价格、用户与订单的目标。'),
    ('3.3', '总体业务流程：补充「服务沉淀」环节，明确订单与服务期沉淀到个人中心，以及运营侧后台配置职责。'),
    ('3.4', '功能架构：新增「个人中心」「运营管理后台」两个模块，并调整首页、开通服务、AI 助手、通用组件的优先级。'),
    ('4.1.3', '个人中心入口：补充头像浮窗入口、面板内操作项与退出登录后回到产业链选择页的规则。'),
    ('4.2', '产业链查看与开通权限：按 ¥199/条 展示价格；未开通产业链改为弹窗提示且不进入详情。'),
    ('5.1.2', '首页功能说明：补充热门搜索词与产业列表分组由运营管理后台配置的规则。'),
    ('5.2.3', '产业链图谱看板：正文与 V1.1.0 保持一致，仅补充未接入图谱明细产业链的空态提示说明。'),
    ('5.3', '解决方案：由「内容待定」改为页面定位、业务逻辑与待完善项说明，明确咨询转化路径。'),
    ('5.6', '新增章节：个人中心——服务、订单、通知、账号设置与服务协议的功能及数据规则。'),
    ('5.7', '新增章节：运营管理后台——图谱、价格、首页热词、用户、订单、管理员与角色权限。'),
]

# V1.2.0 相对 V1.1.0 变更的表格行（表名 -> 首列文本 -> 悬浮说明）
TABLE_NOTES_V120 = {
    '术语': {
        '开通服务': '价格由占位 ¥xxx/条 明确为 ¥199/条。',
        '开通方式': 'V1.2.0 新增术语：运营后台配置「仅联系客服」或「固定价格」。',
        '成交价': 'V1.2.0 新增术语：开通时冻结单价，后续调价不影响已开通用户。',
        '服务期': 'V1.2.0 新增术语：支持 1 / 2 / 3 年，到期进入「已过期」。',
        '权限项': 'V1.2.0 新增术语：角色授权的「仅查看 / 可管理」两级单元。',
    },
    '用户角色': {
        '注册用户': '补充「可使用个人中心」。',
        '收费用户': '补充「可在个人中心查看服务、订单与发票」。',
        '管理员': 'V1.2.0 新增角色：通过头像浮窗进入运营管理后台。',
    },
    '功能模块': {
        '首页': '优先级由 P1 调整为 P0。',
        '开通服务': '优先级由 P1 调整为 P0。',
        '解决方案': '补充 Hero、痛点、架构、优势、案例与定制需求入口。',
        '个人中心': 'V1.2.0 新增模块。',
        '运营管理后台': 'V1.2.0 新增模块。',
        'AI 助手': '优先级由 P1 调整为 P2。',
        '通用组件': '优先级由 P0 调整为 P1。',
    },
    '用户状态': {
        '收费用户': '开通价格由占位 ¥xxxx/条 明确为 ¥199/条。',
    },
}

UPDATE_NOTES_V110 = [
    ('5.2.2', '关键词检索：检索结果改为「产业图谱 / 产业环节 / 企业清单」三组分类展示，每组默认 5 条并提供「查看全部」二级页。'),
    ('5.2.4', '环节企业清单抽屉：企业列表字段与筛选器按实际实现对齐（地区树形多选、是否上市、企业荣誉、成立日期、注册资本等 7 项筛选）。'),
    ('5.2.5', '产业分析：整体重写为分析筛选、上链企业分布、数量趋势、注册资本、融资统计、企业资质六大模块。'),
    ('5.2.6', '上链企业清单：改为全量分页展示，每页 20 家，序号跨页连续编号。'),
    ('5.2.7', '企业详情：明确 8 个分类页签与知识产权 AI 尽调报告（收费专属）。'),
    ('5.3', '解决方案：重写为「常见痛点 — 四步交付 — 核心能力 — 方案对比」结构。'),
    ('5.4', 'AI 助手：对话窗口补充新建对话 / 历史记录，明确收费用户专属权限。'),
]

PRD_VERSIONS = [
    {
        'version': 'V1.2.0',
        'date': '2026-11-26',
        'changes': [
            '术语与约定：新增「开通方式」「成交价」「服务期」「权限项」四项术语，开通价格由占位 ¥xxx 明确为 ¥199/条；',
            '用户角色：新增管理员角色，明确其通过头像浮窗进入运营管理后台的权限；',
            '产品概述：补充运营侧配置目标，功能架构新增个人中心、运营管理后台两个模块并调整优先级；',
            '全局业务规则：补充个人中心入口及未开通产业链弹窗提示规则；',
            '解决方案：由「内容待定」改为页面定位、业务逻辑与待完善项说明，明确咨询转化路径；',
            '产业图谱：链条选择页、环节企业清单抽屉正文与 V1.1.0 保持一致；图谱看板在原有规则基础上补充未接入图谱明细的空态说明；',
            '个人中心：新增服务期聚合、合并开票校验、通知已读、账号设置与服务协议的功能与数据规则说明；',
            '运营管理后台：新增图谱展示、产业链价格、首页热词、用户与服务开通、订单、管理员账号与角色权限说明；',
            '数据规则：明确成交价冻结、订单按手机号合并去重、本地存储按手机号隔离及配置生效口径；',
            '版本管理：抽屉新增 V1.2.0，并支持切换 V1.1.0 / V1.0.0 历史版本查看。',
        ],
    },
    {
        'version': 'V1.1.0',
        'date': '2026-11-12',
        'changes': [
            '链条选择页：关键词检索结果改为「产业图谱 / 产业环节 / 企业清单」三组分类展示，每组默认 5 条并提供「查看全部」二级页；',
            '环节企业清单抽屉：企业列表字段与筛选器按实际实现对齐（地区树形多选、是否上市、企业荣誉、成立日期、注册资本等 7 项筛选）；',
            '产业分析：整体重写为分析筛选、上链企业分布、数量趋势、注册资本、融资统计、企业资质六大模块；',
            '上链企业清单：改为全量分页展示，每页 20 家，序号跨页连续编号；',
            '企业详情：明确 8 个分类页签与知识产权 AI 尽调报告（收费专属）；',
            '解决方案：重写为「常见痛点 — 四步交付 — 核心能力 — 方案对比」结构；',
            'AI 助手：对话窗口补充新建对话 / 历史记录，明确收费用户专属权限；',
        ],
    },
    {
        'version': 'V1.0.0',
        'date': '2026-11-11',
        'changes': ['初版发布。'],
    },
]

CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']


def rewrite_refs(t):
    for old, new in REF_RULES:
        t = t.replace(old, new)
    return t


def para_text(p):
    parts = []
    for m in re.finditer(r'<w:t(?: [^>]*)?>(.*?)</w:t>|<w:br\s*/?>', p, re.S):
        parts.append('\n' if m.group(0).startswith('<w:br') else m.group(1))
    t = html.unescape(''.join(parts))
    # 清理域代码/样式 XML 泄漏（文档里目录域等被双重转义成可见文本）
    t = re.sub(r'</?w:[a-zA-Z]+[^>]*>', '', t)
    t = re.sub(r'</?v:[a-zA-Z]+[^>]*>', '', t)
    t = re.sub(r'</?o:[a-zA-Z]+[^>]*>', '', t)
    t = re.sub(r'HYPERLINK\s+\\l\s+"[^"]*"', '', t)
    t = re.sub(r'PAGEREF\s+[^ ]+\s+\\h', '', t)
    t = re.sub(r'xml:space=\\"preserve\\"', '', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip()


def para_num(p):
    m = re.search(r'<w:numPr>.*?<w:ilvl w:val="(\d+)"/>.*?<w:numId w:val="(\d+)"', p, re.S)
    if not m:
        m2 = re.search(r'<w:numPr>.*?<w:numId w:val="(\d+)"', p, re.S)
        if m2:
            return 0, m2.group(1)
        return None
    return int(m.group(1)), m.group(2)


def is_heading(p, text, by_number=False):
    """by_number=True 时按编号点数判层级（用于样式 ID 不统一的拼接版 docx）。"""
    if not re.match(r'^\d+(\.\d+)*\.?\s+\S', text):
        return None
    if by_number:
        # 目录条目末尾带页码数字（如「1.1 编写目的1」），不入正文
        if re.search(r'\d$', text):
            return 'TOC'
        num = re.match(r'^(\d+(?:\.\d+)*)', text).group(1)
        return num.count('.') + 1
    m = re.search(r'<w:pStyle w:val="([^"]+)"', p)
    if m and m.group(1) in ('000003', '000007'):
        return 'TOC'  # 目录条目，不入正文
    if m and m.group(1) in H_STYLE:
        return H_STYLE[m.group(1)]
    if para_num(p):
        return None
    if len(text) > 40:
        return None
    return 1 if re.match(r'^\d+\.\s', text) else (2 if re.match(r'^\d+\.\d+\s', text) else 3)


def strip_num(t):
    return re.sub(r'^\d+(?:\.\d+)*\.?\s+', '', t)


def orig_num(t):
    m = re.match(r'^(\d+(?:\.\d+)*)\.?\s+', t)
    return m.group(1) if m else ''


def sec_id(orig, fallback):
    return 'prd-sec-' + orig.replace('.', '-') if orig else fallback


def clean_clause(s):
    """分句归一化：压缩空白并忽略句末标点，避免仅标点差异被误判为新增。"""
    return ' '.join(s.split()).rstrip('；。，、')


def split_clauses(text):
    """按中文句号/分号切分，保留句读符号。"""
    return [c for c in re.split(r'(?<=[；。])', text) if c.strip()]


def v110_clause_set(snapshot):
    """从 V1.1.0 正文快照提取 li/p 分句集合，作为新增内容标黄的比对基准。"""
    clauses = set()
    for tab in ('globalHtml', 'pagesHtml'):
        for m in re.finditer(r'<(?:li|p)[^>]*>(.*?)</(?:li|p)>', snapshot[tab], re.S):
            plain = html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1)))
            for c in split_clauses(plain):
                if clean_clause(c):
                    clauses.add(clean_clause(c))
    return clauses


def extract_docx(docx_path, update_notes=(), by_number=False, table_notes=None, new_clauses=None):
    """提取单份 docx 的抽屉内容。update_notes 为 (原编号, 说明) 列表，用于章节高亮；
    table_notes 为 表名 -> {首列文本: 说明}，用于表格行高亮；
    new_clauses 为上一版分句集合，V1.2.0 中不在集合内的正文分句标黄。"""
    updated_sections = {o for o, _ in update_notes}
    note_text = dict(update_notes)
    table_notes = table_notes or {}
    new_clauses = new_clauses or set()

    def text_html(text):
        """渲染正文文本：按分句比对上一版，新增/修改的分句包 span 标黄。"""
        text = rewrite_refs(text)
        if not new_clauses:
            return html.escape(text)
        parts = split_clauses(text)
        if not parts:
            return html.escape(text)
        out = []
        for c in parts:
            if clean_clause(c) in new_clauses:
                out.append(html.escape(c))
            else:
                out.append('<span class="prd-new">' + html.escape(c) + '</span>')
        return ''.join(out)

    def upd_note_attr(orig):
        note = note_text.get(orig)
        if not note:
            return ''
        return f' data-note="{html.escape(note, quote=True)}"'

    with zipfile.ZipFile(docx_path) as z:
        xml = z.read('word/document.xml').decode('utf-8')
    body = re.search(r'<w:body>(.*)</w:body>', xml, re.S).group(1)

    token = re.compile(r'<w:tbl>.*?</w:tbl>|<w:p [^>]*>.*?</w:p>|<w:p/>', re.S)
    items = []
    for m in token.finditer(body):
        frag = m.group(0)
        if frag.startswith('<w:tbl'):
            rows = re.findall(r'<w:tr[ >].*?</w:tr>', frag, re.S)
            cells_by_row = []
            for tr in rows:
                cells_by_row.append([' '.join(para_text(tc).split())
                                     for tc in re.findall(r'<w:tc>.*?</w:tc>', tr, re.S)])
            table_name = cells_by_row[0][0] if cells_by_row and cells_by_row[0] else ''
            row_notes = table_notes.get(table_name, {})
            out = ['<table class="prd-doc-table"><tbody>']
            for ri, (tr, cells) in enumerate(zip(rows, cells_by_row)):
                tag = 'th' if ri == 0 else 'td'
                tds = []
                for t in cells:
                    if t:
                        tds.append(f'<{tag}>{html.escape(rewrite_refs(t))}</{tag}>')
                if tds:
                    note = row_notes.get(cells[0], '') if ri > 0 and cells else ''
                    tr_attr = f' class="prd-updated" data-note="{html.escape(note, quote=True)}"' if note else ''
                    out.append(f'<tr{tr_attr}>' + ''.join(tds) + '</tr>')
            out.append('</tbody></table>')
            items.append(('table', 0, ''.join(out)))
            continue
        text = para_text(frag)
        if not text:
            continue
        # 差异标注版遗留的纯「修订/新增」堆叠噪声段落（如「新增新增新增新增新增」）不入正文
        if re.fullmatch(r'(?:修订|新增)+', text):
            continue
        if by_number:
            # 差异标注版遗留的「修订/新增」文字前缀：仅剥离，不据此自动加标注。
            # 是否标注、说明写什么，一律以 UPDATE_NOTES_V120 中逐字比对确认的差异为准。
            pm = re.match(r'^((?:修订|新增)+)(\d+(?:\.\d+)*\.?\s+\S.*)$', text)
            if pm:
                text = pm.group(2)
        lvl = is_heading(frag, text, by_number=by_number)
        if lvl == 'TOC':
            continue
        if lvl:
            items.append((f'h{lvl}', lvl, text))
        else:
            n = para_num(frag)
            if n:
                items.append(('li', min(n[0], 2), text))
            else:
                items.append(('p', 0, text))

    sections = []
    cur = None
    for kind, lvl, content in items:
        if kind in ('h1', 'h2', 'h3'):
            if kind == 'h3' and cur is not None:
                cur['blocks'].append((kind, content))
                continue
            cur = {'level': lvl, 'title': content, 'blocks': []}
            sections.append(cur)
        elif cur is not None:
            cur['blocks'].append((kind, content))

    tree = []
    cur1 = None
    for sec in sections:
        if sec['level'] == 1:
            cur1 = {'sec': sec, 'subs': []}
            tree.append(cur1)
        elif sec['level'] == 2 and cur1 is not None:
            cur1['subs'].append(sec)

    def render_blocks(blocks):
        out = []
        for item in blocks:
            kind, content = item[0], item[1]
            orig = item[2] if len(item) > 2 else ''
            if kind == 'table':
                out.append(content)
            elif kind == 'li':
                out.append(f'<li>{text_html(content)}</li>')
            elif kind == 'h3':
                cls = ' prd-updated' if orig else ''
                out.append(f'<h4 class="prd-doc-h3{cls}"{upd_note_attr(orig)}>{html.escape(rewrite_refs(content))}</h4>')
            else:
                out.append(f'<p>{text_html(content)}</p>')
        html_out = []
        in_ul = False
        for piece in out:
            if piece.startswith('<li>'):
                if not in_ul:
                    html_out.append('<ul class="prd-doc-list">')
                    in_ul = True
                html_out.append(piece)
            else:
                if in_ul:
                    html_out.append('</ul>')
                    in_ul = False
                html_out.append(piece)
        if in_ul:
            html_out.append('</ul>')
        return ''.join(html_out)

    def renumber_blocks(blocks, mode, base):
        out = []
        k = 0
        for item in blocks:
            kind, content = item[0], item[1]
            if kind == 'h3':
                k += 1
                orig = orig_num(content)
                updated = orig in updated_sections
                content = (f'{base}.{k}、' if mode == 'dot' else f'{k}、') + strip_num(content)
                out.append((kind, content, orig) if updated else (kind, content))
            else:
                out.append(item if len(item) > 2 else (kind, content))
        return out

    def h1_html(t, orig=''):
        cls = ' prd-updated' if orig in updated_sections else ''
        return f'<h2 class="prd-doc-h1{cls}"{upd_note_attr(orig)}>{html.escape(t)}</h2>'

    # 全局介绍
    global_parts, global_nav = [], []
    g_nodes = [n for n in tree if re.match(r'^[1-4]\.', n['sec']['title'])]
    for i, node in enumerate(g_nodes):
        sid = sec_id(orig_num(node['sec']['title']), f'prd-sec-g{i + 1}')
        t1 = f'{CN_NUM[i]}、{strip_num(node["sec"]["title"])}'
        global_nav.append({'id': sid, 'title': t1})
        inner = [h1_html(t1, orig=orig_num(node['sec']['title'])), render_blocks(node['sec']['blocks'])]
        for j, sub in enumerate(node['subs'], 1):
            suborig = orig_num(sub['title'])
            subcls = ' prd-updated' if suborig in updated_sections else ''
            subnote = upd_note_attr(suborig)
            inner.append(f'<h3 class="prd-doc-h2{subcls}"{subnote}>{j}、{strip_num(sub["title"])}</h3>')
            inner.append(render_blocks(renumber_blocks(sub['blocks'], 'dot', j)))
        global_parts.append(f'<div class="prd-module-sec" id="{sid}">' + ''.join(inner) + '</div>')

    # 页面与功能描述
    pages_parts, pages_nav = [], []
    n5 = next((n for n in tree if re.match(r'^5\.', n['sec']['title'])), None)
    if n5 and n5['sec']['blocks']:
        pages_parts.append(render_blocks(n5['sec']['blocks']))
    for i, sub in enumerate(n5['subs'] if n5 else [], 1):
        orig = orig_num(sub['title'])
        sid = sec_id(orig, f'prd-sec-p{i}')
        t1 = f'{CN_NUM[i - 1]}、{strip_num(sub["title"])}'
        pages_nav.append({'id': sid, 'title': t1})
        inner = [h1_html(t1, orig=orig), render_blocks(renumber_blocks(sub['blocks'], 'flat', None))]
        pages_parts.append(f'<div class="prd-module-sec" id="{sid}">' + ''.join(inner) + '</div>')

    return {
        'globalHtml': ''.join(global_parts),
        'pagesHtml': ''.join(pages_parts),
        'globalNav': global_nav,
        'pagesNav': pages_nav,
    }


def main():
    with open(SNAP_V110, encoding='utf-8') as f:
        v110 = json.load(f)
    base_clauses = v110_clause_set(v110)
    v120 = extract_docx(DOCX_V120, by_number=True, update_notes=UPDATE_NOTES_V120,
                        table_notes=TABLE_NOTES_V120, new_clauses=base_clauses)
    v100 = extract_docx(DOCX_V100)

    contents = {
        'V1.2.0': v120,
        'V1.1.0': {k: v110[k] for k in ('globalHtml', 'pagesHtml', 'globalNav', 'pagesNav')},
        'V1.0.0': v100,
    }
    versions = []
    for v in PRD_VERSIONS:
        item = dict(v)
        item['content'] = contents[v['version']]
        versions.append(item)

    data = {
        'title': '产业链全景图谱平台产品需求文档（PRD）',
        'tabs': [
            {'id': 'global', 'label': '全局介绍'},
            {'id': 'pages', 'label': '页面与功能描述'},
        ],
        # 顶层保留最新版本正文，兼容旧调用方
        'globalHtml': v120['globalHtml'],
        'pagesHtml': v120['pagesHtml'],
        'globalNav': v120['globalNav'],
        'pagesNav': v120['pagesNav'],
        'versions': versions,
    }
    js = '/* 由 tools/prd-extract.py 从多版本 PRD docx 自动生成，勿手工编辑 */\nwindow.WUDU_PRD = ' + json.dumps(data, ensure_ascii=False) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)

    for ver, c in contents.items():
        bad = [kw for kw in ('<w:', 'w:val', 'HYPERLINK', 'PAGEREF') if kw in c['globalHtml'] or kw in c['pagesHtml']]
        print(ver, 'global', len(c['globalHtml']), 'pages', len(c['pagesHtml']),
              'nav', len(c['globalNav']), len(c['pagesNav']), 'leak', bad or 'clean')
    print('output:', OUT)


if __name__ == '__main__':
    main()
