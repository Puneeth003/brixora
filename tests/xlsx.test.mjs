// The .xlsx report writer (src/lib/xlsx.ts): the file must be a valid ZIP of well-formed
// parts, and cell text must never be able to act as a formula or break the XML.
// Needs Node 22.18+ (it imports the TypeScript module directly). Run: npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { columnLetter, crc32, excelDateTime, reportWorkbook } from "../src/lib/xlsx.ts";

/** Reads a ZIP through its central directory, checking sizes and checksums on the way. */
function unzip(buf) {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, "end of central directory");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  assert.equal(at + buf.readUInt32LE(end + 12), end, "central directory ends where the archive does");
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, "central entry");
    const crc = buf.readUInt32LE(at + 16);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString("ascii", at + 46, at + 46 + nameLen);
    assert.equal(buf.readUInt32LE(offset), 0x04034b50, `local header of ${name}`);
    assert.equal(buf.toString("ascii", offset + 30, offset + 30 + nameLen), name);
    const data = inflateRawSync(buf.subarray(offset + 30 + nameLen, offset + 30 + nameLen + packed));
    assert.equal(data.length, size, `size of ${name}`);
    assert.equal(crc32(data), crc, `checksum of ${name}`);
    files[name] = data.toString("utf8");
    at += 46 + nameLen;
  }
  return files;
}

/** Every tag closed in order, and no stray "<" or "&" in text or attributes. */
function assertWellFormed(xml, name) {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const stack = [];
  let pos = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    const between = body.slice(pos, m.index);
    assert.doesNotMatch(between, /</, `${name}: stray "<" before offset ${m.index}`);
    assert.doesNotMatch(between.replace(/&(amp|lt|gt|quot|apos);/g, ""), /&/, `${name}: bare "&" before offset ${m.index}`);
    pos = m.index + m[0].length;
    if (m[1]) assert.equal(stack.pop(), m[2], `${name}: </${m[2]}> closes the wrong tag`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.equal(body.slice(pos).trim(), "", `${name}: text after the root element`);
  assert.deepEqual(stack, [], `${name}: unclosed tags`);
}

const columns = [
  { header: "Date", width: 13, type: "date" },
  { header: "Time", width: 11, type: "time" },
  { header: "Person", width: 22 },
  { header: "Details", width: 60, type: "wrap" },
];
const build = (rows, over = {}) => unzip(reportWorkbook({ sheetName: "Activity", title: "Brixora · Activity report", subtitle: "2 entries", columns, rows, ...over }));

test("the workbook is a valid archive with every part Excel needs", () => {
  const files = build([[46322, 0.5, "Priya", "Called"]]);
  assert.deepEqual(Object.keys(files).sort(), [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
  ]);
  for (const [name, xml] of Object.entries(files)) assertWellFormed(xml, name);
  // Every part named in the content types and relationships exists.
  for (const part of files["[Content_Types].xml"].matchAll(/PartName="\/([^"]+)"/g)) assert.ok(files[part[1]], part[1]);
  for (const rel of files["xl/_rels/workbook.xml.rels"].matchAll(/Target="([^"]+)"/g)) assert.ok(files[`xl/${rel[1]}`], rel[1]);
});

test("the sheet is laid out as a report: title, frozen filtered header, sized columns", () => {
  const sheet = build([
    [46322, 0.5, "Priya", "Called"],
    [46321, 0.25, "Karthik", "Met"],
  ])["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Brixora · Activity report<\/t>/);
  assert.match(sheet, /<mergeCell ref="A1:D1"\/><mergeCell ref="A2:D2"\/>/);
  assert.match(sheet, /<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A4:D6"\/>/);
  assert.match(sheet, /<dimension ref="A1:D6"\/>/);
  assert.match(sheet, /<col min="4" max="4" width="60" customWidth="1"\/>/);
  assert.match(sheet, /showGridLines="0"/);
  assert.match(sheet, /orientation="landscape"/);
});

test("dates and times are numbers Excel can sort; text is text; alternate rows are shaded", () => {
  const sheet = build([
    [46322, 0.5, "Priya", "Called"],
    [46321, 0.25, "Karthik", null],
  ])["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="A5" s="6"><v>46322<\/v><\/c><c r="B5" s="7"><v>0\.5<\/v><\/c>/);
  assert.match(sheet, /<c r="C5" s="4" t="inlineStr">/);
  assert.match(sheet, /<c r="D5" s="5" t="inlineStr">/);
  // Second data row: the same styles on the zebra fill, and an empty cell stays styled.
  assert.match(sheet, /<c r="A6" s="10"><v>46321<\/v><\/c>/);
  assert.match(sheet, /<c r="D6" s="9"\/>/);
  const styles = build([])["xl/styles.xml"];
  assert.equal(styles.match(/<cellXfs count="(\d+)">/)[1], String([...styles.matchAll(/<xf /g)].length - 1), "cellXfs count matches (one more xf sits in cellStyleXfs)");
  for (const tag of ["fonts", "fills", "borders", "numFmts"]) {
    const block = styles.match(new RegExp(`<${tag} count="(\\d+)">([\\s\\S]*?)</${tag}>`));
    const child = { fonts: "font", fills: "fill", borders: "border", numFmts: "numFmt" }[tag];
    assert.equal([...block[2].matchAll(new RegExp(`<${child}[ >]`, "g"))].length, Number(block[1]), `${tag} count`);
  }
});

test("cell text can't become a formula or break the file", () => {
  const nasty = `=HYPERLINK("http://x","y") <b> & "quoted" \u0001\u000b bell`;
  const files = build([[46322, 0.5, "+91 98000 00000", nasty]], { title: "A & B <report>", sheetName: "Act/iv:ity [1]" });
  const sheet = files["xl/worksheets/sheet1.xml"];
  assertWellFormed(sheet, "sheet1.xml");
  assert.doesNotMatch(sheet, /<f>/, "no formula elements");
  assert.match(sheet, /=HYPERLINK\(&quot;http:\/\/x&quot;,&quot;y&quot;\) &lt;b&gt; &amp; &quot;quoted&quot;  bell/);
  assert.match(sheet, /<c r="C5" s="4" t="inlineStr"><is><t xml:space="preserve">\+91 98000 00000<\/t>/);
  assert.match(sheet, /A &amp; B &lt;report&gt;/);
  assert.match(files["xl/workbook.xml"], /<sheet name="Act iv ity  1" /);
});

test("an empty report still opens: header only", () => {
  const sheet = build([])["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<autoFilter ref="A4:D4"\/>/);
  assertWellFormed(sheet, "sheet1.xml");
});

test("the brand colour is used when valid and ignored otherwise", () => {
  assert.match(build([], { brandHex: "#1a2b3c" })["xl/styles.xml"], /<fgColor rgb="FF1A2B3C"\/>/);
  for (const bad of ["red", "#12345", '#12345"><x', null, undefined]) {
    assert.match(build([], { brandHex: bad })["xl/styles.xml"], /<fgColor rgb="FF0E5E44"\/>/, String(bad));
  }
});

test("timestamps become India wall-clock date and time", () => {
  const IST = 5.5 * 60 * 60 * 1000;
  // 27 Oct 2026 06:40 UTC = 12:10 pm IST. Excel day 46322 is 27 Oct 2026.
  const a = excelDateTime("2026-10-27T06:40:00.000Z", IST);
  assert.equal(a.date, 46322);
  assert.ok(Math.abs(a.time - (12 * 60 + 10) / 1440) < 1e-9);
  // 18:30 UTC is midnight in India: the next day, time zero.
  assert.deepEqual(excelDateTime("2026-10-27T18:30:00.000Z", IST), { date: 46323, time: 0 });
  assert.equal(excelDateTime("2026-10-27T18:29:59.000Z", IST).date, 46322);
});

test("column letters and checksums", () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});
