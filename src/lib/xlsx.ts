// A small .xlsx writer for report-style exports: a title block, a styled header row with
// filters, frozen panes, zebra rows and real date/time cells. No dependencies beyond
// node:zlib, so it adds nothing to the install and tests can load it directly.

import { deflateRawSync } from "node:zlib";

export type ReportColumn = {
  header: string;
  /** Column width in Excel's character units. */
  width: number;
  /** "wrap": long text that wraps. "date" / "time": Excel serial numbers (see excelDateTime). */
  type?: "text" | "wrap" | "date" | "time";
};

export type ReportInput = {
  sheetName: string;
  title: string;
  /** One line under the title: filters, counts, when it was generated. */
  subtitle: string;
  columns: ReportColumn[];
  rows: (string | number | null)[][];
  /** Header colour as "#rrggbb"; anything else falls back to the default green. */
  brandHex?: string | null;
};

const DAY_MS = 86_400_000;
/** Days between Excel's day 0 (30 Dec 1899) and the Unix epoch. */
const EXCEL_EPOCH_DAYS = 25_569;

/**
 * An instant as Excel date and time-of-day numbers in a fixed UTC offset (Excel cells
 * carry no timezone, so the wall-clock time is baked in).
 */
export function excelDateTime(iso: string, offsetMs: number) {
  const local = new Date(iso).getTime() + offsetMs;
  const day = Math.floor(local / DAY_MS);
  return { date: day + EXCEL_EPOCH_DAYS, time: (local - day * DAY_MS) / DAY_MS };
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function xmlText(s: string) {
  return (
    s
      // Characters XML 1.0 cannot carry at all.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number) {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function textCell(ref: string, style: number, value: string) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

// Style ids (cellXfs order in stylesXml).
const S_TITLE = 1;
const S_SUBTITLE = 2;
const S_HEADER = 3;
/** Body styles: 4–7 on white, 8–11 on the zebra fill; order text, wrap, date, time. */
const BODY_STYLE: Record<NonNullable<ReportColumn["type"]>, number> = { text: 4, wrap: 5, date: 6, time: 7 };
const ZEBRA_OFFSET = 4;

const TITLE_ROWS = 3; // title, subtitle, spacer
const HEADER_ROW = TITLE_ROWS + 1;

function stylesXml(brand: string) {
  const body = (fill: number) =>
    [
      `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>`,
      `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`,
      `<xf numFmtId="164" fontId="0" fillId="${fill}" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>`,
      `<xf numFmtId="165" fontId="0" fillId="${fill}" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>`,
    ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/><numFmt numFmtId="165" formatCode="h:mm AM/PM"/></numFmts>
<fonts count="4">
<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF${brand}"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${brand}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF5F7F6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE3E7E5"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
${body(0)}${body(3)}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(input: ReportInput) {
  const cols = input.columns;
  const last = columnLetter(cols.length - 1);
  const lastRow = HEADER_ROW + input.rows.length;

  const out: string[] = [];
  out.push(`<row r="1" ht="28" customHeight="1">${textCell("A1", S_TITLE, input.title)}</row>`);
  out.push(`<row r="2" ht="18" customHeight="1">${textCell("A2", S_SUBTITLE, input.subtitle)}</row>`);
  out.push(`<row r="${HEADER_ROW}" ht="24" customHeight="1">${cols.map((c, i) => textCell(`${columnLetter(i)}${HEADER_ROW}`, S_HEADER, c.header)).join("")}</row>`);

  input.rows.forEach((row, r) => {
    const n = HEADER_ROW + 1 + r;
    const zebra = r % 2 === 1 ? ZEBRA_OFFSET : 0;
    const cells = cols.map((col, i) => {
      const ref = `${columnLetter(i)}${n}`;
      const style = BODY_STYLE[col.type ?? "text"] + zebra;
      const v = row[i];
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
      // An empty styled cell keeps the row's fill and border unbroken.
      if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${style}"/>`;
      return textCell(ref, style, String(v));
    });
    out.push(`<row r="${n}">${cells.join("")}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}${lastRow}"/>
<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEADER_ROW + 1}" sqref="A${HEADER_ROW + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("")}</cols>
<sheetData>${out.join("")}</sheetData>
<autoFilter ref="A${HEADER_ROW}:${last}${lastRow}"/>
<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// ---------------------------------------------------------------------------
// ZIP container
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP archive of deflated entries. Names must be ASCII. */
function zip(files: { name: string; data: Buffer }[]) {
  const DOS_DATE = 0x0021; // 1 Jan 1980: no real timestamp is leaked or needed
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "ascii");
    const packed = deflateRawSync(f.data);
    const crc = crc32(f.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra
    parts.push(local, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(f.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    // extra, comment, disk number, internal attrs, external attrs: all zero
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

// ---------------------------------------------------------------------------

/** Excel sheet names: at most 31 characters, none of \ / ? * [ ] : */
function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1";
}

/** A one-sheet workbook laid out as a report. */
export function reportWorkbook(input: ReportInput): Buffer {
  const brand = /^#[0-9a-f]{6}$/i.test(input.brandHex ?? "") ? input.brandHex!.slice(1).toUpperCase() : "0E5E44";
  const xml = (s: string) => Buffer.from(s, "utf8");
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    {
      name: "[Content_Types].xml",
      data: xml(
        `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: xml(
        `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlText(safeSheetName(input.sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(
        `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: xml(stylesXml(brand)) },
    { name: "xl/worksheets/sheet1.xml", data: xml(sheetXml(input)) },
  ]);
}
