/* 轻量 Excel（.xlsx）导出：零依赖，遵守 OOXML 规范直接拼包为 ZIP。
   用法：WuduXlsx.download('订单清单_20261127.xlsx', [{ name: '订单清单', header: [...], rows: [[...]], widths: [12, 20] }])
   单元格值为 number 时按数值写入，其余按文本写入。 */
(function () {
  if (window.WuduXlsx) return;

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const encoder = new TextEncoder();

  function bytesOf(text) {
    return encoder.encode(text);
  }

  function xmlEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function colName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  /* ---------- ZIP（STORE，无压缩）---------- */
  function dosDateTime(date) {
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
    const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
    return { time: time & 0xffff, day: day & 0xffff };
  }

  function zip(files) {
    const now = new Date();
    const { time, day } = dosDateTime(now);
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = bytesOf(file.name);
      const dataBytes = file.data;
      const crc = crc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true); // UTF-8 文件名
      view.setUint16(8, 0, true); // STORE
      view.setUint16(10, time, true);
      view.setUint16(12, day, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, dataBytes.length, true);
      view.setUint32(22, dataBytes.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, dataBytes);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, time, true);
      cdv.setUint16(14, day, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, dataBytes.length, true);
      cdv.setUint32(24, dataBytes.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + dataBytes.length;
    });

    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, end], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ---------- 工作表 ---------- */
  function sheetXml(sheet) {
    const header = Array.isArray(sheet.header) ? sheet.header : [];
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const colCount = Math.max(header.length, ...rows.map((r) => r.length), 1);
    const widths = Array.isArray(sheet.widths) ? sheet.widths : [];

    let cols = '';
    if (widths.length) {
      cols = '<cols>' + widths.map((w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Number(w) || 14}" customWidth="1"/>`).join('') + '</cols>';
    }

    const rowsXml = [];
    const pushRow = (values, headerRow) => {
      const cells = [];
      for (let i = 0; i < colCount; i += 1) {
        const value = values[i];
        const ref = colName(i) + (rowsXml.length + 1);
        const isNumber = typeof value === 'number' && Number.isFinite(value);
        const style = headerRow ? ' s="1"' : (isNumber ? ' s="2"' : '');
        if (value === null || value === undefined || value === '') {
          cells.push(`<c r="${ref}"/>`);
        } else if (isNumber) {
          cells.push(`<c r="${ref}"${style}><v>${value}</v></c>`);
        } else {
          cells.push(`<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`);
        }
      }
      rowsXml.push(`<row r="${rowsXml.length + 1}">${cells.join('')}</row>`);
    };

    if (header.length) pushRow(header, true);
    rows.forEach((row) => pushRow(row, false));

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (cols ? `<sheetFormatPr defaultRowHeight="16"/>${cols}` : '<sheetFormatPr defaultRowHeight="16"/>') +
      `<sheetData>${rowsXml.join('')}</sheetData></worksheet>`;
  }

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="微软雅黑"/></font><font><b/><sz val="11"/><name val="微软雅黑"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function safeSheetName(name, index) {
    const cleaned = String(name || '').replace(/[\\\/?*\[\]:]/g, '').trim();
    return (cleaned || `Sheet${index + 1}`).slice(0, 31);
  }

  function buildSheets(sheets) {
    const files = [];
    const overrides = [];
    const rels = [];

    sheets.forEach((sheet, i) => {
      const id = i + 1;
      files.push({ name: `xl/worksheets/sheet${id}.xml`, data: bytesOf(sheetXml(sheet)) });
      overrides.push(`<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      rels.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`);
    });

    const styleId = sheets.length + 1;
    rels.push(`<Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    files.push({ name: 'xl/styles.xml', data: bytesOf(STYLES) });
    overrides.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((sheet, i) =>
        `<sheet name="${xmlEscape(safeSheetName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>';

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides.join('') + '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.join('') + '</Relationships>';

    return [
      { name: '[Content_Types].xml', data: bytesOf(contentTypes) },
      { name: '_rels/.rels', data: bytesOf(rootRels) },
      { name: 'xl/workbook.xml', data: bytesOf(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: bytesOf(workbookRels) },
      ...files
    ];
  }

  function download(filename, sheets) {
    const list = Array.isArray(sheets) ? sheets : [sheets];
    const blob = zip(buildSheets(list));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.WuduXlsx = { download };
})();
