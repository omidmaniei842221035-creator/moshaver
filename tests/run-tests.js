#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const enh = require(path.join(ROOT, 'js', 'enhancements.js'));
const superPdf = require(path.join(ROOT, 'js', 'super-pdf-advisor.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('✓ ' + name);
  } catch (err) {
    failed++;
    console.error('✗ ' + name);
    console.error('  ' + (err && err.stack ? err.stack : err));
  }
}

/* 1. Asset & Path Integrity */
test('All required offline assets and lib/ files exist', () => {
  const required = [
    'index.html',
    'sw.js',
    'manifest.webmanifest',
    'icon.svg',
    'css/enhancements.css',
    'js/enhancements.js',
    'js/super-pdf-advisor.js',
    'lib/pdf.min.js',
    'lib/pdf.worker.min.js',
    'lib/ocr-core.js',
    'lib/ocr-fas.js'
  ];
  for (const rel of required) {
    const p = path.join(ROOT, rel);
    assert.ok(fs.existsSync(p), 'Missing required file: ' + rel);
    assert.ok(fs.statSync(p).size > 0, 'Empty file: ' + rel);
  }
  for (const oldRoot of ['pdf.min.js', 'pdf.worker.min.js', 'ocr-core.js', 'ocr-fas.js']) {
    assert.ok(!fs.existsSync(path.join(ROOT, oldRoot)), 'Old root duplicate should not exist: ' + oldRoot);
  }
});

test('index.html references enhancements CSS/JS and lib/ paths cleanly', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('href="css/enhancements.css"'), 'index.html missing css/enhancements.css');
  assert.ok(html.includes('src="js/enhancements.js"'), 'index.html missing js/enhancements.js');
  assert.ok(html.includes('src="js/super-pdf-advisor.js"'), 'index.html missing js/super-pdf-advisor.js');
  assert.ok(html.includes("lib/pdf.min.js"), 'index.html missing lib/pdf.min.js');
  assert.ok(html.includes("lib/pdf.worker.min.js"), 'index.html missing lib/pdf.worker.min.js');
  assert.ok(html.includes("lib/ocr-core.js"), 'index.html missing lib/ocr-core.js');
  assert.ok(html.includes("lib/ocr-fas.js"), 'index.html missing lib/ocr-fas.js');
});

test('sw.js precaches all offline assets including enhancements and lib/', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const expected = [
    './index.html',
    './css/enhancements.css',
    './js/enhancements.js',
    './js/super-pdf-advisor.js',
    './lib/pdf.min.js',
    './lib/pdf.worker.min.js',
    './lib/ocr-core.js',
    './lib/ocr-fas.js'
  ];
  for (const asset of expected) {
    assert.ok(sw.includes(asset), 'sw.js missing asset: ' + asset);
  }
  // Syntax check for sw.js
  new vm.Script(sw, { filename: 'sw.js' });
});

/* 2. Unit Tests for Pure Utilities */
test('normSearchText normalizes Persian/Arabic digits, Yeh/Kaf, and ZWNJ', () => {
  assert.strictEqual(enh.normSearchText('سرمايه\u200cگذاری ۱۲۳ و ٤٥٦ شركت'), 'سرمایه گذاری 123 و 456 شرکت');
  assert.strictEqual(enh.normSearchText('  تسهیلات   بانک\tشهر  '), 'تسهیلات بانک شهر');
});

test('calcDSCRMetrics computes accurate monthly DSCR and stress test', () => {
  const res = enh.calcDSCRMetrics({
    annualCashflow: 120,
    existingMonthly: 2,
    loanAmount: 60,
    rate: 23,
    months: 36,
    mode: 'm'
  });
  assert.ok(res.newMonthlyEq > 2.3 && res.newMonthlyEq < 2.35, 'Expected monthly installment ~2.32B, got ' + res.newMonthlyEq);
  assert.ok(res.dscr > 2.2 && res.dscr < 2.4, 'Expected DSCR ~2.31, got ' + res.dscr);
  assert.ok(res.dscrStressed < res.dscr, 'Stressed DSCR should be lower than base DSCR');
  assert.strictEqual(res.status, 'ok');
});

test('calcDSCRMetrics maxSustainableLoan yields DSCR ≈ 1.25 when fed back', () => {
  const first = enh.calcDSCRMetrics({
    annualCashflow: 60,
    existingMonthly: 1,
    loanAmount: 100,
    rate: 23,
    months: 24,
    mode: 'm'
  });
  assert.strictEqual(first.status, 'bad');
  assert.ok(first.maxSustainableLoan > 0);

  const check = enh.calcDSCRMetrics({
    annualCashflow: 60,
    existingMonthly: 1,
    loanAmount: first.maxSustainableLoan,
    rate: 23,
    months: 24,
    mode: 'm'
  });
  assert.ok(Math.abs(check.dscr - 1.25) < 0.01, 'Expected DSCR ≈ 1.25, got ' + check.dscr);
});

test('calcDSCRMetrics supports bullet repayment mode', () => {
  const res = enh.calcDSCRMetrics({
    annualCashflow: 100,
    existingMonthly: 0,
    loanAmount: 100,
    rate: 23,
    months: 12,
    mode: 'bul'
  });
  assert.ok(Math.abs(res.newTotalPayback - 123) < 1e-6);
  assert.ok(Math.abs(res.dscr - (100 / 123)) < 1e-6);
  assert.strictEqual(res.status, 'bad');
});

test('casesToCSV exports UTF-8 BOM and properly escaped Persian/English cells', () => {
  const csv = enh.casesToCSV([
    {
      id: 1,
      no: '1405-01',
      date: '2026-04-01T00:00:00Z',
      cust: 'شرکت "آلفا", واحد صنعتی',
      amount: 50,
      top: 'تسهیلات سرمایه در گردش',
      rf: ['a', 'b'],
      p: { ptype: 'legal', sector: 'ind', rating: 'A', coll: '1' }
    }
  ], {
    fmtDate: () => '۱۴۰۵/۰۱/۱۲',
    sectorMap: { ind: 'صنعت' }
  });
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM');
  assert.ok(csv.includes('"شرکت ""آلفا"", واحد صنعتی"'), 'Comma and quotes in customer name should be CSV-escaped');
  assert.ok(csv.includes('حقوقی - صنعت'));
  assert.ok(csv.includes('تسهیلات سرمایه در گردش'));
});

test('validateBackupBundle validates structure and filters only sca_* keys', () => {
  const good = enh.validateBackupBundle(JSON.stringify({
    app: 'shahr-credit-advisor',
    type: 'full-backup',
    version: '3.9',
    keys: {
      sca_cases: '[]',
      sca_profile: '{"name":"علی"}',
      malicious_key: 'ignored'
    }
  }));
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.count, 2);
  assert.ok(!('malicious_key' in good.keys));

  const bad = enh.validateBackupBundle('{"app":"other","keys":{}}');
  assert.strictEqual(bad.ok, false);
});

/* 3. Browser Bootstrap Smoke Test in VM */
test('enhancements.js boots cleanly against mocked browser DOM & app globals', () => {
  const code = fs.readFileSync(path.join(ROOT, 'js', 'enhancements.js'), 'utf8');
  function makeEl(tag) {
    return {
      tagName: String(tag || 'div').toUpperCase(),
      id: '',
      className: '',
      innerHTML: '',
      textContent: '',
      value: '',
      dataset: {},
      style: {},
      children: [],
      attributes: {},
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, f) { if (f === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
        contains(c) { return this._set.has(c); }
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      append(...nodes) { this.children.push(...nodes); },
      appendChild(n) { this.children.push(n); return n; },
      insertBefore(n) { this.children.unshift(n); return n; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };
  }
  const elements = {};
  const ls = new Map();
  const appbar = makeEl('div');
  const screen = makeEl('div');
  const nav = makeEl('div');
  const growthBtn = makeEl('button');
  growthBtn.parentNode = nav;
  nav.querySelector = sel => (sel === 'button[data-go="growth"]' ? growthBtn : null);

  const sandbox = {
    console,
    Math,
    JSON,
    Date,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    setTimeout,
    document: {
      readyState: 'complete',
      documentElement: makeEl('html'),
      body: makeEl('body'),
      createElement: makeEl,
      getElementById: id => elements[id] || null,
      querySelector: sel => sel === '.appbar' ? appbar : sel === '.nav' ? nav : null,
      addEventListener() {}
    },
    localStorage: {
      getItem: k => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: k => ls.delete(k),
      key: i => Array.from(ls.keys())[i],
      get length() { return ls.size; }
    },
    IC: { search: '<circle/>', chart: '<path/>' },
    ICON: (n) => `<svg data-ic="${n}"></svg>`,
    TOOLS: [
      { id: 'inst', t: 'محاسبه قسط', d: '...', ic: 'calc', col: '#111' },
      { id: 'dep', t: 'معدل', d: '...', ic: 'calc', col: '#222' }
    ],
    P: [{ id: 'wc', t: 'سرمایه در گردش', s: '...', cats: ['wc'], cond: [], coll: [], docs: [], auth: 'شعبه' }],
    DOCS2: [],
    HIST: [],
    CUR: 'home',
    TOOL: null,
    $: sel => (sel.startsWith('#') ? elements[sel.slice(1)] || null : null),
    fa: v => String(v),
    toEn: v => String(v),
    todayS: () => '1405/09/01',
    pnum: v => Number(v),
    num: v => String(v),
    bn: v => String(v) + ' میلیارد',
    pv: () => 23,
    toast() {},
    show() {},
    openTool() {},
    calcTool() {},
    renderCatalog() {},
    renderCases() {},
    renderProfile() {},
    store: { get: (_, d) => d }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  elements.screen = screen;
  elements.toolBody = makeEl('div');
  elements.toolOut = makeEl('div');
  elements.ds_cf = { value: '120' };
  elements.ds_ex = { value: '3' };
  elements.ds_amt = { value: '80' };
  elements.ds_rate = { value: '23' };
  elements.ds_mon = { value: '36' };
  elements.ds_mode = { value: 'm' };

  vm.runInNewContext(code, sandbox, { filename: 'js/enhancements.js' });

  assert.ok(sandbox.TOOLS.some(t => t.id === 'prod_compare'), 'prod_compare should be registered in TOOLS');
  assert.ok(sandbox.TOOLS.some(t => t.id === 'dscr'), 'dscr should be registered in TOOLS');
  sandbox.openTool('dscr');
  assert.strictEqual(sandbox.TOOL, 'dscr');
  assert.ok(elements.toolOut.innerHTML.includes('نسبت پوشش بدهی'), 'dscr tool should render DSCR output');
  sandbox.openTool('prod_compare');
  assert.strictEqual(sandbox.TOOL, 'prod_compare');
  assert.ok(elements.toolBody.innerHTML.includes('مقایسه هم‌زمان طرح‌ها'), 'prod_compare should render comparator UI');

  const spCode = fs.readFileSync(path.join(ROOT, 'js', 'super-pdf-advisor.js'), 'utf8');
  sandbox.SM_TOOLS = [{ g: 'مشاوره', items: [] }];
  sandbox.SM_FN = {};
  sandbox.URL = { createObjectURL: () => 'blob:1', revokeObjectURL() {} };
  sandbox.Blob = function () {};
  vm.runInNewContext(spCode, sandbox, { filename: 'js/super-pdf-advisor.js' });
  assert.ok(sandbox.TOOLS.some(t => t.id === 'super_pdf'), 'super_pdf should be registered in TOOLS');
  sandbox.openTool('super_pdf');
  assert.strictEqual(sandbox.TOOL, 'super_pdf');
  assert.ok(elements.toolBody.innerHTML.includes('سوپر موتور تحلیلگر PDF'), 'super_pdf should render UI');
  sandbox.__spLoadSample();
  assert.ok(elements.toolBody.innerHTML.includes('طرح رشد پایدار'), 'sample circular report should render');
  sandbox.__spSwitchTab('advisor');
  assert.ok(elements.toolBody.innerHTML.includes('گفتگوی هوشمند با بخشنامه'), 'advisor tab should render');
});

/* 4. Super PDF Circular Analyzer & Super Smart Advisor Tests */
test('analyzeSuperCircular extracts metadata, pages, 6 insights, actions and rules', () => {
  const a = superPdf.analyzeSuperCircular(superPdf.SAMPLE_CIRCULAR_TEXT, {
    P: [{ id: 'wc', t: 'تسهیلات سرمایه در گردش', cats: ['wc', 'fac'], src: 'ضوابط' }],
    DOCS2: [{ id: 'd1', title: 'ضوابط عمومی', no: '1404/100' }],
    CP_DEF: { maxRate: { l: 'نرخ' }, branchAuth: { l: 'اختیار شعبه' } },
    pv: k => (k === 'maxRate' ? 23 : 15)
  });

  assert.strictEqual(a.pageCount, 2);
  assert.ok(a.meta.title.includes('طرح رشد پایدار'));
  assert.strictEqual(a.meta.no, '1405/324/810');
  assert.strictEqual(a.meta.date, '1405/07/18');
  assert.strictEqual(a.meta.expire, '1405/12/29');
  assert.strictEqual(a.meta.issuer, 'مدیریت امور اعتبارات بانک شهر');
  assert.ok(a.clauses.length >= 8, 'Expected >=8 segmented clauses');
  assert.ok(a.insights.limits.length >= 2);
  assert.ok(a.insights.rates.length >= 1);
  assert.ok(a.insights.terms.length >= 1);
  assert.ok(a.insights.ratios.length >= 1);
  assert.ok(a.insights.rules.length >= 1);
  assert.ok(a.insights.collateralDocs.length >= 1);
  assert.ok(a.actions.some(x => x.severity === 'critical'), 'Should detect prohibition as critical action');

  const r = a.extractedRules;
  assert.strictEqual(r.maxAmountBn, 200);
  assert.strictEqual(r.branchAuthBn, 30);
  assert.strictEqual(r.ratePct, 21);
  assert.strictEqual(r.maxMonths, 36);
  assert.strictEqual(r.graceMonths, 6);
  assert.strictEqual(r.avgMultiplier, 3);
  assert.strictEqual(r.avgSeasonMonths, 2);
  assert.ok(r.allowedRatings.includes('B2'));
  assert.ok(a.crossImpact.paramDeltas.length >= 1, 'Should detect rate/branchAuth deltas vs active params');
});

test('answerSuperQuestion provides accurate grounded answers with page citations', () => {
  const a = superPdf.analyzeSuperCircular(superPdf.SAMPLE_CIRCULAR_TEXT);
  const q1 = superPdf.answerSuperQuestion(a, 'نرخ سود تسهیلات چند درصد است؟');
  assert.strictEqual(q1.verdict, 'direct');
  assert.ok(q1.shortAnswer.includes('۲۱'), 'Expected ۲۱ in shortAnswer, got: ' + q1.shortAnswer);
  assert.strictEqual(q1.mainClause.page, 1);

  const q2 = superPdf.answerSuperQuestion(a, 'حداکثر مدت بازپرداخت چند ماه است؟');
  assert.strictEqual(q2.verdict, 'direct');
  assert.ok(q2.shortAnswer.includes('۳۶'), 'Expected ۳۶ in shortAnswer, got: ' + q2.shortAnswer);
  assert.strictEqual(q2.mainClause.page, 2);

  const q3 = superPdf.answerSuperQuestion(a, 'حد اختیار رئیس شعبه چقدر است؟');
  assert.strictEqual(q3.verdict, 'direct');
  assert.ok(q3.shortAnswer.includes('۳۰'), 'Expected ۳۰ in shortAnswer, got: ' + q3.shortAnswer);
});

test('evaluateCaseAgainstCircular evaluates compliant and non-compliant customer cases', () => {
  const a = superPdf.analyzeSuperCircular(superPdf.SAMPLE_CIRCULAR_TEXT);

  const good = superPdf.evaluateCaseAgainstCircular(a, {
    custName: 'شرکت پیشرو صنعت',
    ptype: 'legal',
    amount: 25,
    rating: 'B1',
    avgAmt: 10,
    avgMonths: 3,
    term: 24,
    bouncedCheque: false,
    overdue: false
  });
  assert.strictEqual(good.verdict, 'ok');
  assert.ok(good.predictedAuth.includes('شعبه'));
  assert.ok(good.customerReplyText.includes('پیشرو صنعت'));

  const bad = superPdf.evaluateCaseAgainstCircular(a, {
    custName: 'شرکت پرریسک',
    ptype: 'legal',
    amount: 250,
    rating: 'C2',
    avgAmt: 20,
    avgMonths: 1,
    term: 48,
    bouncedCheque: true,
    overdue: false
  });
  assert.strictEqual(bad.verdict, 'bad');
  assert.ok(bad.recommendations.length >= 3);
  assert.ok(bad.internalMemoText.includes('مغایر'));
});

console.log(`\nResult: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
