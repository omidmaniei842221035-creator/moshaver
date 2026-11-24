/* =====================================================================
   سوپر موتور تحلیلگر PDF بخشنامه و سوپر مشاور هوشمند (نسخه ۱٫۰ — سامانه ۳٫۹)
   • استخراج ترکیبی PDF متنی + OCR فارسی آفلاین برای بخشنامه‌های اسکن‌شده
   • تفکیک ساختاری مواد، بندها، تبصره‌ها و استخراج ۶ محور تخصصی بانکی
   • چک‌لیست الزامات اجرایی و تحلیل تعارض/اثر بر ضوابط و طرح‌های فعلی بانک
   • سوپر مشاور هوشمند: پرسش و پاسخ مستند با شماره صفحه + شبیه‌ساز تطبیق پرونده
   کاملاً آفلاین، بدون Build و سازگار با file:// و http://
   ===================================================================== */
(function (root) {
  'use strict';

  const STORE_KEY = 'sca_superpdf';

  /* ---------- Persian Text & Number Normalization ---------- */
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  const WORD_NUMS = {
    'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10,
    'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14, 'پانزده': 15, 'شانزده': 16, 'هفده': 17,
    'هجده': 18, 'هیجده': 18, 'نوزده': 19, 'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50,
    'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90, 'صد': 100, 'یکصد': 100, 'دویست': 200,
    'سیصد': 300, 'چهارصد': 400, 'پانصد': 500, 'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900,
    'نیم': 0.5
  };

  function toEnDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d))
      .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  }

  function toFaDigits(s) {
    return String(s == null ? '' : s).replace(/\d/g, d => FA_DIGITS[+d]);
  }

  function fmtFaNum(n, dec) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    const d = dec == null ? 2 : dec;
    const r = Math.round(Number(n) * Math.pow(10, d)) / Math.pow(10, d);
    const parts = String(r).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return toFaDigits(parts[1] ? (intPart + '٫' + parts[1]) : intPart);
  }

  function fmtBn(n) {
    if (n === null || n === undefined || isNaN(Number(n)) || Number(n) <= 0) return '—';
    const v = Number(n);
    if (v >= 1000) return fmtFaNum(v / 1000, 2) + ' هزار میلیارد ریال';
    if (v < 1) return fmtFaNum(v * 1000, 0) + ' میلیون ریال';
    return fmtFaNum(v, 2) + ' میلیارد ریال';
  }

  function normSuperText(s) {
    let t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) {}
    if (typeof faFix === 'function') {
      try { t = faFix(t); } catch (e) {}
    }
    t = toEnDigits(t)
      .replace(/[يى\u06D2]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[ۀة]/g, 'ه')
      .replace(/[إأٱآ]/g, m => (m === 'آ' ? 'آ' : 'ا'))
      .replace(/ؤ/g, 'و')
      .replace(/(\d)[٫](\d)/g, '$1.$2')
      .replace(/(\d)[٬,](\d{3})/g, '$1$2')
      .replace(/[\u064B-\u0652\u0640\uFEFF\u200B\u2060\u00AD]/g, '')
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t\u00a0]+/g, ' ');
    // تبدیل اعداد حروفی قبل از واحدهای بانکی
    const keys = Object.keys(WORD_NUMS).sort((a, b) => b.length - a.length).join('|');
    try {
      const wre = new RegExp('(?<![\\u0600-\\u06FF])((?:' + keys + ')(?:\\s+و\\s+(?:' + keys + '))*)(?=\\s*(?:میلیارد|میلیون|درصد|برابر|ماه|سال|روز|٪))', 'g');
      t = t.replace(wre, m => String(m.split(/\s+و\s+/).reduce((a, w) => a + (WORD_NUMS[w.trim()] || 0), 0)));
    } catch (e) {}
    return t;
  }

  function cleanForSearch(s) {
    return normSuperText(s)
      .replace(/[\u200c\u200d]/g, ' ')
      .replace(/[.,،؛:!?؟()«»"'\-\/\[\]{}|…]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const STOP_WORDS = new Set([
    'از', 'به', 'در', 'با', 'برای', 'که', 'این', 'آن', 'است', 'هست', 'می', 'شود', 'شوند', 'شد', 'شده',
    'را', 'یا', 'و', 'تا', 'هم', 'نیز', 'بر', 'روی', 'توسط', 'جهت', 'طبق', 'موضوع', 'بند', 'ماده',
    'تبصره', 'آیا', 'چه', 'چند', 'چقدر', 'کدام', 'چگونه', 'باید', 'دارد', 'دارند', 'کرد', 'باشد', 'باشند',
    'های', 'ها', 'اینکه', 'اما', 'ولی', 'اگر', 'درصورت', 'صورت', 'عدم', 'فقط', 'تنها', 'کلیه', 'تمامی', 'همه'
  ]);

  const SYNONYMS = [
    ['سقف', 'حداکثر', 'حد', 'مبلغ', 'میزان', 'نصاب', 'پشتوانه'],
    ['نرخ', 'سود', 'کارمزد', 'بهره', 'هزینه', 'تعرفه', 'جریمه', 'وجه التزام'],
    ['مدت', 'بازپرداخت', 'اقساط', 'قسط', 'دوره', 'تنفس', 'مهلت', 'زمان', 'سررسید'],
    ['وثیقه', 'وثایق', 'تضمین', 'تضامین', 'ضامن', 'ضمانت', 'رهن', 'ترهین', 'سفته', 'چک'],
    ['میانگین', 'معدل', 'سپرده', 'رسوب', 'خواب', 'ضریب', 'امتیاز'],
    ['اختیار', 'اختیارات', 'مرجع', 'تصویب', 'رکن', 'ارکان', 'کمیته', 'شعبه', 'منطقه', 'هیأت'],
    ['رتبه', 'اعتباری', 'امتیاز', 'اعتبارسنجی', 'سمات', 'مکنا', 'چک برگشتی', 'معوق', 'سرفصل'],
    ['شرط', 'شرایط', 'ضابطه', 'ضوابط', 'الزام', 'مشمول', 'احراز', 'محدودیت', 'ممنوع', 'استثنا'],
    ['مدارک', 'مدرک', 'مستندات', 'استعلام', 'صورت مالی', 'حسابرسی', 'اساسنامه', 'مجوز'],
    ['حقیقی', 'فردی', 'شخصی', 'خانوار', 'کارکنان', 'مشتریان'],
    ['حقوقی', 'شرکت', 'بنگاه', 'تولیدی', 'صنعتی', 'بازرگانی', 'دانش بنیان', 'پیمانکار'],
    ['سرمایه در گردش', 'تأمین مالی', 'مرابحه', 'قرض الحسنه', 'مشارکت', 'گام', 'برات', 'ضمانت نامه', 'ال سی']
  ];

  const SYN_MAP = (function () {
    const map = {};
    SYNONYMS.forEach(grp => {
      const normGrp = grp.map(w => cleanForSearch(w));
      normGrp.forEach(w => {
        map[w] = normGrp.filter(x => x !== w);
      });
    });
    return map;
  })();

  function stemFa(w) {
    if (w.length <= 3) return w;
    return w.replace(/(?:هایی|های|ان|ات|ین|یم|ید|ند|ست)$/g, '') || w;
  }

  function tokenize(s) {
    const c = cleanForSearch(s);
    if (!c) return [];
    const raw = c.split(' ').filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    return raw.map(stemFa);
  }

  /* ---------- Parse Pages & Segment Clauses ---------- */
  function normalizePagesInput(input) {
    if (Array.isArray(input)) {
      return input.map((p, idx) => ({
        page: Number(p.page) || (idx + 1),
        text: String(p.text || ''),
        source: p.source || 'text'
      })).filter(p => p.text.trim().length > 0);
    }
    const raw = String(input || '').trim();
    if (!raw) return [];
    const marker = /-{3,}\s*صفحه\s*(\d+|[۰-۹]+)\s*(?:از\s*(?:\d+|[۰-۹]+))?\s*-{3,}/g;
    const matches = [];
    let m;
    while ((m = marker.exec(raw)) !== null) {
      matches.push({ idx: m.index, end: m.index + m[0].length, page: Number(toEnDigits(m[1])) || (matches.length + 1) });
    }
    if (!matches.length) {
      return [{ page: 1, text: raw, source: 'text' }];
    }
    const pages = [];
    const lead = matches[0].idx > 0 ? raw.slice(0, matches[0].idx).trim() : '';
    if (lead && matches[0].page > 1) {
      pages.push({ page: 1, text: lead, source: 'text' });
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].end;
      const stop = i + 1 < matches.length ? matches[i + 1].idx : raw.length;
      let txt = raw.slice(start, stop).trim();
      if (i === 0 && lead && matches[0].page === 1) {
        txt = lead + (txt ? '\n' + txt : '');
      }
      if (txt) pages.push({ page: matches[i].page, text: txt, source: 'text' });
    }
    return pages;
  }

  function extractNumbersFromClause(s) {
    const n = normSuperText(s);
    const out = [];
    const re = /(\d+(?:\.\d+)?)\s*(هزار\s*میلیارد|میلیارد|میلیون|هزار)?\s*(ریال|تومان|درصد|٪|%|ماه|سال|روز(?:\s*کاری)?|برابر)?/g;
    let m;
    while ((m = re.exec(n))) {
      const val = parseFloat(m[1]);
      if (isNaN(val)) continue;
      if (val >= 1300 && val <= 1500 && !m[2] && !m[3]) continue; // سال شمسی
      const mult = m[2] ? m[2].replace(/\s+/g, ' ') : '';
      const unit = m[3] ? m[3].replace(/\s+/g, ' ') : '';
      if (!mult && !unit) continue;
      let bnVal = null;
      if (unit === 'ریال' || unit === 'تومان' || mult.includes('میلیارد') || mult.includes('میلیون')) {
        const factor = mult === 'هزار میلیارد' ? 1000 : mult === 'میلیارد' ? 1 : mult === 'میلیون' ? 0.001 : mult === 'هزار' ? 0.000001 : 0.000000001;
        bnVal = val * factor * (unit === 'تومان' ? 10 : 1);
      }
      out.push({
        raw: m[0].trim(),
        val,
        mult,
        unit: unit === '%' ? '٪' : unit,
        bnVal
      });
    }
    return out;
  }

  const CAT_RULES = {
    limits: /سقف|حداکثر\s*تسهیلات|حداکثر\s*مبلغ|حدود\s*اختیار|اختیار\s*(?:شعبه|منطقه|کمیته|هیأت)|سقف\s*فردی|سقف\s*تجمیعی|مبلغ\s*پایه|بودجه|میلیارد\s*ریال/,
    rates: /نرخ\s*سود|نرخ\s*کارمزد|کارمزد|وجه\s*التزام|جریمه\s*تأخیر|سود\s*ترجیحی|سود\s*متعلقه|سپرده\s*نقدی|مسدودی/,
    terms: /مدت\s*بازپرداخت|دوره\s*بازپرداخت|اقساط|دوره\s*تنفس|مهلت\s*(?:اجرا|تمدید|ارسال|استفاده|تصویب)|اعتبار\s*مصوبه|ماه|قسط/,
    ratios: /میانگین|معدل|ضریب|برابر\s*معدل|نسبت\s*مالکانه|نسبت\s*جاری|پوشش\s*بدهی|فروش\s*سالانه|سقف\s*فروش|مدت\s*خواب|مانده\s*سپرده/,
    collateralDocs: /وثیقه|وثایق|تضمین|تضامین|ضامن|سفته|چک\s*صیادی|ترهین|گواهی\s*مالیات|مدارک|استعلام|صورت\s*مالی|حسابرسی|قرارداد/,
    rules: /مشمول|واجد\s*شرایط|رتبه\s*اعتباری|ممنوع|مجاز\s*نیست|فاقد\s*اعتبار|چک\s*برگشتی|بدهی\s*غیرجاری|معوق|ماده\s*۱۴۱|ماده\s*141|تبصره|استثنا|خط\s*قرمز|الزام/
  };

  function classifyClause(text) {
    const n = normSuperText(text);
    const cats = [];
    Object.keys(CAT_RULES).forEach(k => {
      if (CAT_RULES[k].test(n)) cats.push(k);
    });
    return cats.length ? cats : ['general'];
  }

  function segmentClauses(pages) {
    const clauses = [];
    let currentChapter = '';
    let cid = 0;

    pages.forEach(pgObj => {
      const rawLines = normSuperText(pgObj.text).split('\n').map(x => x.trim()).filter(Boolean);
      // فیلتر سطرهای تکراری سرصفحه/پاورقی ساده
      const lines = rawLines.filter(l => !/^صفحه\s*\d+\s*از\s*\d+$/.test(l));

      // ادغام خطوط شکسته شده در پاراگراف‌ها در حالی که سرآغازهای ماده/بند/تبصره جدا بمانند
      const blocks = [];
      let buf = '';
      const headingRe = /^(?:فصل\s+(?:اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|\d+)|ماده\s*\(?\d+\)?|تبصره(?:\s*\d+)?|بند\s*(?:\d+|[الف-ی])|\d{1,2}(?:\.\d{1,2}){0,2}\s*[-.)]|[\u0627-\u06CC]\s*[-.)])\s*/;

      lines.forEach(line => {
        if (/^فصل\s+/.test(line) && line.length < 90) {
          currentChapter = line;
        }
        const isStart = headingRe.test(line);
        if (isStart && buf) {
          blocks.push(buf.trim());
          buf = line;
        } else if (!buf) {
          buf = line;
        } else if (/[.!؟؛:]$/.test(buf) && line.length > 20) {
          blocks.push(buf.trim());
          buf = line;
        } else {
          buf += ' ' + line;
        }
      });
      if (buf.trim()) blocks.push(buf.trim());

      // شکستن بلوک‌های خیلی طولانی به جملات/زیربندها برای دقت بالای جستجو
      blocks.forEach(blk => {
        const parts = blk.length > 480
          ? blk.split(/(?<=[.!؟؛])\s+(?=(?:تبصره|ماده|\d{1,2}\s*[-.)]|[\u0627-\u06CC]\s*[-.)]|[\u0600-\u06FF]{4,}))/)
          : [blk];

        parts.forEach(part => {
          const text = part.replace(/\s+/g, ' ').trim();
          if (text.length < 18) return;
          if (/^(?:با\s*احترام|به\s*:|از\s*:|شماره\s*:|تاریخ\s*:|پیوست\s*:|رونوشت\s*:)/.test(text) && text.length < 70) return;

          let label = '';
          const lm = text.match(/^(ماده\s*\(?\d+\)?|تبصره(?:\s*\d+)?|بند\s*[\u0627-\u06CC\d\-.]+|\d{1,2}(?:\.\d{1,2}){0,2}\s*[-.)]|[\u0627-\u06CC]\s*[-.)])/);
          if (lm) label = lm[1].replace(/[-.)]+$/, '').trim();
          else if (currentChapter) label = currentChapter.slice(0, 42);
          else label = 'بند صفحه ' + toFaDigits(pgObj.page);

          const nums = extractNumbersFromClause(text);
          const cats = classifyClause(text);
          const isMandatory = /موظف\s*است|موظفند|مکلف\s*است|مکلفند|الزامی\s*است|الزام\s*دارد|باید|منوط\s*به|حداکثر\s*ظرف/.test(text);
          const isProhibition = /ممنوع|مجاز\s*نیست|فاقد\s*اعتبار|مشمول\s*نمی\s*شود|مستثنی|لغو|منسوخ/.test(text);

          let importance = 1;
          if (nums.length) importance += Math.min(3, nums.length);
          if (isMandatory) importance += 2;
          if (isProhibition) importance += 2;
          if (cats[0] !== 'general') importance += 2;
          if (text.length > 80 && text.length < 360) importance += 1;

          clauses.push({
            id: ++cid,
            page: pgObj.page,
            source: pgObj.source,
            label,
            chapter: currentChapter,
            text,
            tokens: tokenize(text),
            cats,
            numbers: nums,
            isMandatory,
            isProhibition,
            importance
          });
        });
      });
    });

    return clauses;
  }

  /* ---------- Extract Metadata, Insights, Rules, Cross-Impact ---------- */
  function detectIssuer(head) {
    const fromMatch = head.match(/(?:^|\n)\s*از\s*[:：]\s*([^\n]{3,80})/);
    const probe = fromMatch ? fromMatch[1] : head.slice(0, 650);
    const patterns = [
      [/مدیریت\s*امور\s*اعتبارات|اداره\s*کل\s*اعتبارات|امور\s*اعتبارات/, 'مدیریت امور اعتبارات بانک شهر'],
      [/هیأت\s*مدیره|هیات\s*مدیره/, 'هیأت مدیره بانک شهر'],
      [/هیأت\s*عامل|هیات\s*عامل/, 'هیأت عامل بانک شهر'],
      [/کمیسیون\s*اعتباری|کمیته\s*عالی\s*اعتباری/, 'کمیته / کمیسیون عالی اعتباری'],
      [/اداره\s*کل\s*ضوابط|اداره\s*تطبیق|سازمان\s*و\s*مقررات/, 'اداره ضوابط و مقررات'],
      [/بانک\s*مرکزی/, 'بانک مرکزی ج.ا.ا']
    ];
    for (const [re, name] of patterns) {
      if (re.test(probe)) return name;
    }
    if (fromMatch) return fromMatch[1].trim();
    return 'مراجع ذی‌صلاح بانک شهر';
  }

  function detectAudience(normAll) {
    const out = [];
    const checks = [
      [/حقوقی|شرکت\s*ها|بنگاه\s*ها/, 'اشخاص حقوقی'],
      [/حقیقی|افراد|خانوار|شهروندان/, 'اشخاص حقیقی'],
      [/تولیدی|صنعتی|کارگاه|کشاورزی/, 'بخش تولید و صنعت'],
      [/دانش\s*بنیان|فناور|خلاق/, 'شرکت‌های دانش‌بنیان'],
      [/کارکنان|پرسنل|سازمان\s*ها|حقوق\s*بگیر/, 'کارکنان و سازمان‌ها'],
      [/شعب|رؤسای\s*شعب|مناطق/, 'شعب و مناطق بانک'],
      [/ارزی|صادرات|واردات|گشایش/, 'عملیات ارزی / تجاری'],
      [/ضمانت\s*نامه|تعهدات|گام|برات/, 'تعهدات و ابزارهای نوین']
    ];
    checks.forEach(([re, label]) => {
      if (re.test(normAll)) out.push(label);
    });
    return out.length ? out : ['عموم متقاضیان و شعب'];
  }

  function extractQuantitativeRules(normAll, clauses) {
    const rules = {
      maxAmountBn: null,
      branchAuthBn: null,
      ratePct: null,
      penaltyRatePct: null,
      maxMonths: null,
      graceMonths: null,
      avgMultiplier: null,
      avgSeasonMonths: null,
      allowedRatings: [],
      customerTypes: [],
      collateralHints: []
    };

    if (/حقوقی|شرکت/.test(normAll)) rules.customerTypes.push('legal');
    if (/حقیقی/.test(normAll)) rules.customerTypes.push('real');
    if (!rules.customerTypes.length) rules.customerTypes = ['legal', 'real'];

    // سقف مبلغ تسهیلات و اختیار شعبه
    const amtCandidates = [];
    const branchCandidates = [];
    const rateCandidates = [];
    const penaltyCandidates = [];
    const monthCandidates = [];
    const graceCandidates = [];
    const multCandidates = [];
    const seasonCandidates = [];

    clauses.forEach(cl => {
      const txt = normSuperText(cl.text);
      let cursor = 0;
      cl.numbers.forEach(num => {
        const pos = txt.indexOf(num.raw, cursor);
        if (pos >= 0) cursor = pos + num.raw.length;
        const win = pos >= 0 ? txt.slice(Math.max(0, pos - 60), pos + num.raw.length + 40) : txt;

        if (num.bnVal !== null && num.bnVal > 0 && num.bnVal <= 500000) {
          const bnWin = pos >= 0 ? txt.slice(Math.max(0, pos - 110), pos + num.raw.length + 35) : txt;
          if (/اختیار\s*(?:شعبه|رئیس\s*شعبه)|حد\s*اختیار\s*شعبه/.test(bnWin)) {
            branchCandidates.push(num.bnVal);
          } else if (/سقف|حداکثر|تا\s*مبلغ|تسهیلات\s*به\s*میزان/.test(win)) {
            amtCandidates.push(num.bnVal);
          }
        }
        if (num.unit === '٪' || num.unit === 'درصد') {
          if (num.val >= 2 && num.val <= 45) {
            const preWin = pos >= 0 ? txt.slice(Math.max(0, pos - 50), pos) : txt;
            if (/وجه\s*التزام|جریمه/.test(preWin)) penaltyCandidates.push(num.val);
            else if (/نرخ\s*سود|کارمزد|سود\s*(?:تسهیلات|مرابحه|سالانه)/.test(win)) rateCandidates.push(num.val);
          }
        }
        if (num.unit === 'ماه' || num.unit === 'سال') {
          const m = num.unit === 'سال' ? num.val * 12 : num.val;
          if (/تنفس/.test(win) && m >= 1 && m <= 36) graceCandidates.push(m);
          else if (/میانگین|معدل|ماندگاری|خواب/.test(win) && m >= 1 && m <= 24) seasonCandidates.push(m);
          else if (/بازپرداخت|مدت|اقساط|حداکثر/.test(win) && m >= 3 && m <= 240) monthCandidates.push(m);
        }
        if (num.unit === 'برابر' && num.val > 0 && num.val <= 15 && /میانگین|معدل|سپرده/.test(win)) {
          multCandidates.push(num.val);
        }
      });

      const gm = txt.match(/\b([A-E])\s*([1-3])\b/g);
      if (gm) {
        gm.forEach(g => {
          const cleanG = g.replace(/\s/g, '');
          if (!rules.allowedRatings.includes(cleanG)) rules.allowedRatings.push(cleanG);
        });
      }
    });

    if (amtCandidates.length) rules.maxAmountBn = Math.max(...amtCandidates);
    if (branchCandidates.length) rules.branchAuthBn = Math.max(...branchCandidates);
    if (rateCandidates.length) rules.ratePct = rateCandidates[0];
    if (penaltyCandidates.length) rules.penaltyRatePct = penaltyCandidates[0];
    if (monthCandidates.length) rules.maxMonths = Math.max(...monthCandidates);
    if (graceCandidates.length) rules.graceMonths = Math.max(...graceCandidates);
    if (multCandidates.length) rules.avgMultiplier = Math.max(...multCandidates);
    if (seasonCandidates.length) rules.avgSeasonMonths = Math.min(...seasonCandidates);

    const collChecks = [
      [/سپرده|نقدی|اوراق\s*بهادار|صندوق/, 'وثیقه نوع ۱ (سپرده/اوراق)'],
      [/ملک|سند\s*رسمی|رهن|املاک/, 'وثیقه ملکی (غیرمنقول)'],
      [/ضمانت\s*نامه\s*بانکی/, 'ضمانت‌نامه بانکی'],
      [/سفته/, 'سفته'],
      [/چک\s*صیادی|چک/, 'چک صیادی'],
      [/ضامن\s*معتبر|ضامن/, 'ضامن معتبر']
    ];
    collChecks.forEach(([re, label]) => {
      if (re.test(normAll)) rules.collateralHints.push(label);
    });

    return rules;
  }

  function analyzeCrossImpact(analysis, ctx) {
    const products = (ctx && ctx.P) || (typeof P !== 'undefined' ? P : []);
    const docs = (ctx && ctx.DOCS2) || (typeof DOCS2 !== 'undefined' ? DOCS2 : []);
    const cpDef = (ctx && ctx.CP_DEF) || (typeof CP_DEF !== 'undefined' ? CP_DEF : null);
    const getPv = (ctx && ctx.pv) || (typeof pv === 'function' ? pv : null);

    const sqAll = cleanForSearch(analysis.fullText);
    const sqTitle = cleanForSearch(analysis.meta.title);

    // ۱) ارتباط با طرح‌های اعتباری موجود
    const affectedProducts = [];
    if (Array.isArray(products)) {
      products.forEach(pr => {
        const kws = [pr.t, ...(pr.cats || []), pr.src || ''].join(' ');
        const toks = [...new Set(tokenize(kws))].filter(t => t.length >= 3);
        let hits = 0;
        toks.forEach(t => { if (sqAll.includes(t)) hits++; });
        if (sqTitle.includes(cleanForSearch(pr.t))) hits += 4;
        if (hits >= 2) {
          affectedProducts.push({ id: pr.id, title: pr.t, expired: !!pr.expired, hits });
        }
      });
      affectedProducts.sort((a, b) => b.hits - a.hits);
    }

    // ۲) بخشنامه‌های منسوخ‌شده یا ارجاع‌شده
    const docRefs = [];
    const myDigits = toEnDigits(analysis.meta.no || '').replace(/\D/g, '');
    if (Array.isArray(docs)) {
      docs.forEach(d => {
        const dNo = toEnDigits(d.no || '').replace(/\D/g, '');
        if (!dNo || dNo.length < 4 || dNo === myDigits) return;
        if (sqAll.includes(dNo)) {
          const cl = analysis.clauses.find(c => toEnDigits(c.text).includes(dNo));
          const isCancel = cl && /لغو|منسوخ|ملغی|جایگزین|ابطال|بلااثر/.test(cl.text);
          docRefs.push({
            id: d.id,
            title: d.title,
            no: d.no,
            relation: isCancel ? 'لغو / جایگزینی' : 'ارجاع / عطف',
            page: cl ? cl.page : 1,
            excerpt: cl ? cl.text.slice(0, 180) : ''
          });
        }
      });
    }

    // ۳) مقایسه پارامترهای استخراج‌شده با ضوابط جاری سامانه
    const paramDeltas = [];
    const r = analysis.extractedRules;
    if (cpDef && getPv) {
      try {
        const curRate = getPv('maxRate');
        if (r.ratePct !== null && curRate != null && Math.abs(r.ratePct - curRate) >= 0.5) {
          paramDeltas.push({
            label: 'نرخ سود سالانه',
            currentVal: fmtFaNum(curRate, 1) + '٪',
            pdfVal: fmtFaNum(r.ratePct, 1) + '٪',
            note: r.ratePct < curRate ? 'نرخ بخشنامه کمتر از سقف مصوب جاری (نرخ ترجیحی/حمایتی)' : 'نرخ بخشنامه متفاوت با نرخ پیش‌فرض سامانه است'
          });
        }
        const curBr = getPv('branchAuth');
        if (r.branchAuthBn !== null && curBr != null && Math.abs(r.branchAuthBn - curBr) >= 0.5) {
          paramDeltas.push({
            label: 'حد اختیار شعبه',
            currentVal: fmtBn(curBr),
            pdfVal: fmtBn(r.branchAuthBn),
            note: 'تغییر یا تخصیص حد اختیار ویژه در این بخشنامه'
          });
        }
        const curWc = getPv('wcMax');
        if (r.maxAmountBn !== null && curWc != null && /سرمایه\s*در\s*گردش/.test(analysis.fullText)) {
          paramDeltas.push({
            label: 'سقف مبلغ تسهیلات',
            currentVal: fmtBn(curWc),
            pdfVal: fmtBn(r.maxAmountBn),
            note: 'سقف اعلامی بخشنامه با سقف سرمایه در گردش جاری مقایسه شود'
          });
        }
      } catch (e) {}
    }

    return {
      affectedProducts: affectedProducts.slice(0, 8),
      docRefs,
      paramDeltas
    };
  }

  function buildSuggestedQuestions(analysis) {
    const q = [];
    const ins = analysis.insights;
    if (ins.limits.length) q.push('حداکثر سقف مبلغ تسهیلات و حدود اختیارات تصویب چقدر است؟');
    if (ins.rates.length) q.push('نرخ سود، کارمزد و جریمه تأخیر در این بخشنامه چند درصد است؟');
    if (ins.terms.length) q.push('حداکثر مدت بازپرداخت، تنفس و مهلت اجرای بخشنامه چقدر است؟');
    if (ins.ratios.length) q.push('ضریب میانگین سپرده، مدت خواب و نسبت‌های مالی مورد نیاز چیست؟');
    if (ins.collateralDocs.length) q.push('چه وثایق، تضامین و مدارکی برای تشکیل پرونده الزامی است؟');
    if (ins.rules.length) q.push('مهم‌ترین محدودیت‌ها، ممنوعیت‌ها و شروط احراز متقاضی کدام‌اند؟');
    if (!q.length) {
      q.push('خلاصه مهم‌ترین الزامات اجرایی این بخشنامه چیست؟');
      q.push('مخاطبان و دامنه شمول این بخشنامه چه کسانی هستند؟');
    }
    return q.slice(0, 6);
  }

  function analyzeSuperCircular(rawOrPages, ctx) {
    const pages = normalizePagesInput(rawOrPages);
    const fullText = pages.map(p => p.text).join('\n\n');
    const normAll = normSuperText(fullText);
    const head = normSuperText(pages[0] ? pages[0].text : fullText).slice(0, 1800);

    // متادیتا
    const dm = head.match(/(1[34]\d\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/) || normAll.match(/(1[34]\d\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    const date = dm ? `${dm[1]}/${dm[2].padStart(2, '0')}/${dm[3].padStart(2, '0')}` : '';
    const isDate = x => /^1[34]\d\d[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(x);
    const h5 = head.slice(0, 700);
    const nm = [
      h5.match(/شماره\s*(?:بخشنامه|اطلاعیه|دستورالعمل|نامه)?\s*[:：]\s*([0-9][0-9\/\-\u0600-\u06FF]{2,24}[0-9])/),
      h5.match(/([0-9][0-9\/\-]{2,20}[0-9])\s*[:：]\s*شماره/),
      normAll.match(/شماره\s*(?:بخشنامه|اطلاعیه|دستورالعمل|نامه)?\s*[:：]?\s*([0-9][0-9\/\-]{3,}[0-9])/)
    ].find(m => m && !isDate(m[1]));
    const no = nm ? nm[1].trim() : '';

    const tm = head.match(/موضوع\s*[:：]\s*([^\n]{4,160})/) || head.match(/([^\n]{4,160})\s*[:：]\s*موضوع/);
    let title = tm ? tm[1].replace(/\s+/g, ' ').trim() : '';
    if (!title) {
      const firstLine = head.split('\n').map(x => x.trim()).find(x => x.length > 14 && !/^(?:شماره|تاریخ|پیوست|به\s*:|از\s*:|بسمه|با\s*سلام)/.test(x));
      title = (firstLine || 'بخشنامه بانکی').slice(0, 120);
    }
    title = title.replace(/^[«"“]|[»"”]$/g, '').trim();

    const ex1 = normAll.match(/(?:معتبر|اعتبار|مهلت|قابل\s*اجرا|اجرا)[^.\n]{0,45}?تا\s*(?:تاریخ\s*)?(1[34]\d\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    const ex2 = normAll.match(/(?:معتبر|اعتبار|مهلت)[^.\n]{0,45}?تا\s*پایان\s*(?:سال\s*)?(1[34]\d\d)/) || normAll.match(/تا\s*پایان\s*سال\s*(1[34]\d\d)/);
    const expire = ex1 ? `${ex1[1]}/${ex1[2].padStart(2, '0')}/${ex1[3].padStart(2, '0')}` : (ex2 ? `${ex2[1]}/12/29` : '');

    let kind = 'circ';
    let kindLabel = 'بخشنامه';
    if (/اطلاعیه/.test(h5) && !/بخشنامه/.test(h5.slice(0, 280))) { kind = 'notice'; kindLabel = 'اطلاعیه'; }
    else if (/اصلاحیه/.test(h5)) { kind = 'amend'; kindLabel = 'اصلاحیه بخشنامه'; }
    else if (/دستورالعمل/.test(h5)) { kind = 'directive'; kindLabel = 'دستورالعمل اجرایی'; }

    const clauses = segmentClauses(pages);
    const insights = { limits: [], rates: [], terms: [], ratios: [], rules: [], collateralDocs: [] };

    clauses.forEach(cl => {
      cl.cats.forEach(cat => {
        if (insights[cat]) {
          insights[cat].push(cl);
        }
      });
    });

    Object.keys(insights).forEach(k => {
      insights[k].sort((a, b) => b.importance - a.importance || a.page - b.page);
      insights[k] = insights[k].slice(0, 12);
    });

    // چک‌لیست الزامات اجرایی
    const actions = clauses
      .filter(cl => cl.isMandatory || cl.isProhibition)
      .sort((a, b) => b.importance - a.importance || a.page - b.page)
      .slice(0, 15)
      .map((cl, idx) => ({
        id: 'act_' + idx,
        page: cl.page,
        label: cl.label,
        text: cl.text,
        severity: cl.isProhibition ? 'critical' : (cl.numbers.length ? 'must' : 'check')
      }));

    // خلاصه اجرایی هوشمند
    const intro = clauses.find(c => /بدینوسیله|بدین\s*وسیله|ابلاغ|به\s*منظور|در\s*راستای|مصوب/.test(c.text)) || clauses[0];
    const topHighlight = clauses.slice().sort((a, b) => b.importance - a.importance)[0];
    const summaryParts = [];
    if (intro) summaryParts.push(intro.text.slice(0, 240));
    if (topHighlight && topHighlight !== intro) summaryParts.push(topHighlight.text.slice(0, 220));
    const summary = summaryParts.join(' — ') || normAll.slice(0, 280);

    const extractedRules = extractQuantitativeRules(normAll, clauses);

    const analysis = {
      id: 'sp_' + Date.now().toString(36),
      analyzedAt: new Date().toISOString(),
      pageCount: pages.length,
      ocrPages: pages.filter(p => p.source === 'ocr').length,
      charCount: fullText.length,
      pages,
      fullText,
      meta: {
        title,
        no,
        date,
        expire,
        kind,
        kindLabel,
        issuer: detectIssuer(head),
        audience: detectAudience(normAll),
        summary
      },
      clauses,
      insights,
      actions,
      extractedRules
    };

    analysis.crossImpact = analyzeCrossImpact(analysis, ctx);
    analysis.suggestedQuestions = buildSuggestedQuestions(analysis);

    return analysis;
  }

  /* ---------- Super Smart Advisor Q&A Engine ---------- */
  function answerSuperQuestion(analysis, question) {
    const qClean = String(question || '').trim();
    if (!analysis || !analysis.clauses || !analysis.clauses.length || qClean.length < 2) {
      return { verdict: 'not_found', shortAnswer: '', mainClause: null, supportingClauses: [], advice: 'لطفاً پرسش مشخص‌تری وارد کنید.' };
    }

    const qTokens = [...new Set(tokenize(qClean))];
    const qNorm = normSuperText(qClean);
    const wantsNumber = /چند|چقدر|سقف|حداکثر|حداقل|نرخ|درصد|کارمزد|سود|مدت|ضریب|مهلت|تنفس|مبلغ|حد/.test(qNorm);

    // وزن‌دهی BM25-مانند + مترادف‌ها
    const docFreq = {};
    analysis.clauses.forEach(cl => {
      new Set(cl.tokens).forEach(t => { docFreq[t] = (docFreq[t] || 0) + 1; });
    });
    const N = analysis.clauses.length;

    const tokenGroups = qTokens.map(t => [t].concat((SYN_MAP[t] || []).map(stemFa)));

    const scored = analysis.clauses.map(cl => {
      const tokSet = new Set(cl.tokens);
      let score = 0;
      let directHits = 0;

      tokenGroups.forEach(grp => {
        const primary = grp[0];
        const idf = Math.log(1 + (N - (docFreq[primary] || 0) + 0.5) / ((docFreq[primary] || 0) + 0.5));
        if (tokSet.has(primary)) {
          score += idf * 1.4;
          directHits++;
        } else if (grp.slice(1).some(syn => tokSet.has(syn))) {
          score += idf * 0.75;
        }
      });

      if (score <= 0) return { cl, score: 0 };

      const coverage = qTokens.length ? directHits / qTokens.length : 0;
      score *= (1 + coverage);
      if (wantsNumber && cl.numbers.length) score *= 1.35;
      if (cl.isMandatory || cl.isProhibition) score *= 1.1;

      return { cl, score, coverage };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return {
        verdict: 'not_found',
        shortAnswer: '',
        mainClause: null,
        supportingClauses: [],
        advice: 'در متن بخشنامه آپلودشده، عبارت مرتبطی با این پرسش یافت نشد. می‌توانید از ضوابط عمومی بانک استعلام بگیرید.'
      };
    }

    const top = scored[0];
    // استخراج پاسخ عددی کوتاه از بند اصلی
    let shortAnswer = '';
    if (wantsNumber && top.cl.numbers.length) {
      let bestNum = top.cl.numbers[0];
      if (/درصد|نرخ|سود|کارمزد/.test(qNorm)) {
        bestNum = top.cl.numbers.find(n => n.unit === '٪' || n.unit === 'درصد') || bestNum;
      } else if (/مدت|ماه|سال|تنفس|مهلت/.test(qNorm)) {
        bestNum = top.cl.numbers.find(n => n.unit === 'ماه' || n.unit === 'سال' || n.unit === 'روز') || bestNum;
      } else if (/سقف|مبلغ|میلیارد|میلیون|حد/.test(qNorm)) {
        bestNum = top.cl.numbers.find(n => n.bnVal !== null) || bestNum;
      } else if (/ضریب|برابر/.test(qNorm)) {
        bestNum = top.cl.numbers.find(n => n.unit === 'برابر') || bestNum;
      }
      if (bestNum) shortAnswer = toFaDigits(bestNum.raw);
    }

    const verdict = (top.score >= 2.2 || top.coverage >= 0.5) ? 'direct' : 'partial';
    return {
      verdict,
      shortAnswer,
      mainClause: top.cl,
      supportingClauses: scored.slice(1, 5).map(x => x.cl),
      advice: verdict === 'direct'
        ? `مستند به ${top.cl.label} در صفحه ${toFaDigits(top.cl.page)} بخشنامه`
        : 'تطبیق نسبی یافت شد؛ لطفاً بندهای پشتیبان و متن کامل صفحه را بررسی کنید.'
    };
  }

  /* ---------- Customer Case Compatibility Evaluator ---------- */
  function evaluateCaseAgainstCircular(analysis, caseIn) {
    const r = (analysis && analysis.extractedRules) || {};
    const c = caseIn || {};
    const ptype = c.ptype || 'legal';
    const amount = Math.max(0, Number(c.amount) || 0);
    const term = Math.max(0, Number(c.term) || 0);
    const avgAmt = Math.max(0, Number(c.avgAmt) || 0);
    const avgMonths = Math.max(0, Number(c.avgMonths) || 0);
    const rating = String(c.rating || '').toUpperCase().trim();
    const hasBounced = !!c.bouncedCheque;
    const hasOverdue = !!c.overdue;

    const checks = [];
    const recommendations = [];

    // ۱) نوع متقاضی
    const legalPage = (analysis.insights.rules[0] || analysis.clauses[0] || {}).page || 1;
    if (r.customerTypes && r.customerTypes.length === 1 && !r.customerTypes.includes(ptype)) {
      checks.push({
        title: 'نوع شخصیت متقاضی',
        status: 'bad',
        detail: `بخشنامه عمدتاً ناظر بر اشخاص ${r.customerTypes[0] === 'legal' ? 'حقوقی' : 'حقیقی'} است، اما متقاضی ${ptype === 'legal' ? 'حقوقی' : 'حقیقی'} ثبت شده است.`,
        page: legalPage
      });
      recommendations.push('کنترل شمول نوع شخصیت مشتری در بند هدف و موضوع بخشنامه پیش از تشکیل پرونده.');
    } else {
      checks.push({
        title: 'نوع شخصیت متقاضی',
        status: 'ok',
        detail: `متقاضی (${ptype === 'legal' ? 'حقوقی' : 'حقیقی'}) در دامنه مشتریان قابل بررسی این بخشنامه قرار دارد.`,
        page: 1
      });
    }

    // ۲) سقف مبلغ تسهیلات
    const limCl = analysis.insights.limits[0];
    if (r.maxAmountBn && amount > 0) {
      if (amount > r.maxAmountBn) {
        checks.push({
          title: 'سقف مبلغ تسهیلات بخشنامه',
          status: 'bad',
          detail: `مبلغ درخواستی (${fmtBn(amount)}) از سقف استخراج‌شده در بخشنامه (${fmtBn(r.maxAmountBn)}) بیشتر است.`,
          page: limCl ? limCl.page : 1
        });
        recommendations.push(`کاهش مبلغ درخواستی به حداکثر ${fmtBn(r.maxAmountBn)} یا تأمین مازاد از محل طرح مکمل (مانند اوراق گام/سرمایه در گردش).`);
      } else {
        checks.push({
          title: 'سقف مبلغ تسهیلات بخشنامه',
          status: 'ok',
          detail: `مبلغ درخواستی (${fmtBn(amount)}) درون سقف مجاز بخشنامه (${fmtBn(r.maxAmountBn)}) است.`,
          page: limCl ? limCl.page : 1
        });
      }
    } else if (amount > 0) {
      checks.push({
        title: 'سقف مبلغ درخواستی',
        status: 'info',
        detail: `مبلغ ${fmtBn(amount)} در چارچوب سقف‌های عمومی طرح‌های مرتبط و حدود اختیارات بررسی شود.`,
        page: limCl ? limCl.page : 1
      });
    }

    // ۳) اختیار شعبه / مرجع تصویب
    let predictedAuth = 'کمیته اعتباری منطقه / اداره امور اعتبارات (بر اساس جدول حدود اختیارات)';
    if (r.branchAuthBn && amount > 0) {
      if (amount <= r.branchAuthBn) {
        predictedAuth = `قابل تصویب در سطح شعبه (تا سقف ${fmtBn(r.branchAuthBn)})`;
        checks.push({
          title: 'مرجع تصویب و حدود اختیار',
          status: 'ok',
          detail: `با توجه به حد اختیار شعبه در بخشنامه (${fmtBn(r.branchAuthBn)})، پرونده در اختیار شعبه است.`,
          page: limCl ? limCl.page : 1
        });
      } else {
        predictedAuth = 'مرجع بالاتر از شعبه (منطقه / کمیته اعتباری / هیأت عامل)';
        checks.push({
          title: 'مرجع تصویب و حدود اختیار',
          status: 'warn',
          detail: `مبلغ از حد اختیار شعبه (${fmtBn(r.branchAuthBn)}) بیشتر است؛ نیازمند ارسال به رکن اعتباری بالاتر است.`,
          page: limCl ? limCl.page : 1
        });
      }
    }

    // ۴) رتبه اعتباری و خط قرمز چک برگشتی / معوقات
    const ruleCl = analysis.insights.rules[0];
    if (hasBounced || hasOverdue) {
      checks.push({
        title: 'استعلام سوابق (چک برگشتی / بدهی غیرجاری)',
        status: 'bad',
        detail: 'وجود چک برگشتی رفع‌سوء‌اثرنشده یا بدهی غیرجاری مانع قطعی پرداخت طبق مقررات اعتباری و مفاد بخشنامه است.',
        page: ruleCl ? ruleCl.page : 1
      });
      recommendations.push('الزام مشتری به تسویه یا تعیین تکلیف بدهی غیرجاری و رفع سوءاثر کامل چک برگشتی پیش از طرح در کمیته.');
    } else {
      checks.push({
        title: 'سلامت اعتباری و سوابق بانکی',
        status: 'ok',
        detail: 'فاقد چک برگشتی و بدهی غیرجاری اعلام شده است (منوط به اخذ استعلام به‌روز سمات/صیاد).',
        page: ruleCl ? ruleCl.page : 1
      });
    }

    if (r.allowedRatings && r.allowedRatings.length && rating) {
      const rank = g => ({ A1: 1, A2: 2, A3: 3, B1: 4, B2: 5, B3: 6, C1: 7, C2: 8, C3: 9, D1: 10, D2: 11, D3: 12, E1: 13, E2: 14, E3: 15 }[g] || 99);
      const worstAllowed = Math.max(...r.allowedRatings.map(rank));
      const custRank = rank(rating);
      if (custRank > worstAllowed) {
        checks.push({
          title: 'رتبه اعتباری متقاضی',
          status: 'bad',
          detail: `رتبه فعلی (${rating}) پایین‌تر از رتبه‌های مورد اشاره در بخشنامه (${r.allowedRatings.join('، ')}) است.`,
          page: ruleCl ? ruleCl.page : 1
        });
        recommendations.push('تقویت تضامین (وثیقه نوع اول یا ضامن با رتبه A/B) برای جبران ریسک رتبه اعتباری.');
      } else {
        checks.push({
          title: 'رتبه اعتباری متقاضی',
          status: 'ok',
          detail: `رتبه ${rating} با حد نصاب بخشنامه (${r.allowedRatings.join('، ')}) مطابقت دارد.`,
          page: ruleCl ? ruleCl.page : 1
        });
      }
    }

    // ۵) میانگین سپرده و مدت خواب
    const ratCl = analysis.insights.ratios[0];
    if (r.avgMultiplier && amount > 0) {
      const reqAvg = amount / r.avgMultiplier;
      if (avgAmt < reqAvg - 0.01) {
        checks.push({
          title: 'میانگین سپرده مورد نیاز',
          status: 'warn',
          detail: `با ضریب ${fmtFaNum(r.avgMultiplier, 1)} برابر، حداقل میانگین ${fmtBn(reqAvg)} نیاز است (کسری: ${fmtBn(reqAvg - avgAmt)}).`,
          page: ratCl ? ratCl.page : 1
        });
        recommendations.push(`تکمیل میانگین سپرده به ${fmtBn(reqAvg)} یا تعدیل مبلغ تسهیلات متناسب با معدل فعلی به ${fmtBn(avgAmt * r.avgMultiplier)}.`);
      } else {
        checks.push({
          title: 'میانگین سپرده مورد نیاز',
          status: 'ok',
          detail: `میانگین سپرده (${fmtBn(avgAmt)}) ظرفیت تا ${fmtBn(avgAmt * r.avgMultiplier)} را ایجاد می‌کند.`,
          page: ratCl ? ratCl.page : 1
        });
      }
    }
    if (r.avgSeasonMonths && avgMonths > 0 && avgMonths < r.avgSeasonMonths) {
      checks.push({
        title: 'حداقل دوره معدل‌گیری',
        status: 'warn',
        detail: `دوره فعلی (${toFaDigits(avgMonths)} ماه) کمتر از حداقل ${toFaDigits(r.avgSeasonMonths)} ماه قیدشده در بخشنامه است.`,
        page: ratCl ? ratCl.page : 1
      });
      recommendations.push(`صبر تا تکمیل دوره ${toFaDigits(r.avgSeasonMonths)} ماهه معدل‌گیری یا بررسی معافیت‌های بخشنامه.`);
    }

    // ۶) مدت بازپرداخت
    const termCl = analysis.insights.terms[0];
    if (r.maxMonths && term > 0) {
      if (term > r.maxMonths) {
        checks.push({
          title: 'مدت بازپرداخت',
          status: 'bad',
          detail: `مدت درخواستی (${toFaDigits(term)} ماه) از حداکثر مدت مجاز در بخشنامه (${toFaDigits(r.maxMonths)} ماه) بیشتر است.`,
          page: termCl ? termCl.page : 1
        });
        recommendations.push(`کاهش مدت بازپرداخت به حداکثر ${toFaDigits(r.maxMonths)} ماه.`);
      } else {
        checks.push({
          title: 'مدت بازپرداخت',
          status: 'ok',
          detail: `مدت ${toFaDigits(term)} ماه درون سقف ${toFaDigits(r.maxMonths)} ماهه بخشنامه است.`,
          page: termCl ? termCl.page : 1
        });
      }
    }

    // ۷) وثایق و مدارک
    const colCl = analysis.insights.collateralDocs[0];
    if (r.collateralHints && r.collateralHints.length) {
      checks.push({
        title: 'تضامین و مدارک مورد اشاره در بخشنامه',
        status: 'info',
        detail: `موارد کلیدی بخشنامه: ${r.collateralHints.join('، ')}`,
        page: colCl ? colCl.page : 1
      });
    }

    const badCnt = checks.filter(x => x.status === 'bad').length;
    const warnCnt = checks.filter(x => x.status === 'warn').length;
    const verdict = badCnt > 0 ? 'bad' : (warnCnt > 0 ? 'warn' : 'ok');
    const score = Math.max(15, Math.min(100, 100 - badCnt * 28 - warnCnt * 12));

    const custLabel = c.custName || 'متقاضی گرامی';
    const docRefTxt = `${analysis.meta.kindLabel} «${analysis.meta.title}»${analysis.meta.no ? ' شماره ' + toFaDigits(analysis.meta.no) : ''}`;

    const customerReplyText =
      `${custLabel}، با سلام و احترام؛\n` +
      `درخواست جنابعالی به مبلغ ${amount ? fmtBn(amount) : 'درخواستی'} بر اساس مفاد ${docRefTxt} بررسی شد:\n` +
      `• وضعیت کلی: ${verdict === 'ok' ? 'واجد شرایط اولیه و مطابق ضوابط بخشنامه' : verdict === 'warn' ? 'مشروط به تکمیل برخی موارد' : 'دارای مغایرت با شروط بخشنامه'}\n` +
      (r.ratePct ? `• نرخ سود/کارمزد اشاره‌شده در بخشنامه: ${fmtFaNum(r.ratePct, 1)}٪\n` : '') +
      (r.collateralHints.length ? `• تضامین قابل قبول: ${r.collateralHints.join('، ')}\n` : '') +
      (recommendations.length ? `\nپیشنهادهای اصلاحی جهت پیشبرد پرونده:\n${recommendations.map((x, i) => toFaDigits(i + 1) + ') ' + x).join('\n')}` : '\nجهت تشکیل پرونده و ارائه مستندات هویتی/مالی و استعلام‌های قانونی به شعبه مراجعه فرمایید.');

    const internalMemoText =
      `گزارش کارشناسی تطبیق پرونده با ${docRefTxt}\n` +
      `تاریخ تنظیم: ${analysis.meta.date ? toFaDigits(analysis.meta.date) : '—'} | نام متقاضی: ${c.custName || '—'} (${ptype === 'legal' ? 'حقوقی' : 'حقیقی'}) | مبلغ: ${amount ? fmtBn(amount) : '—'}\n` +
      `نتیجه ارزیابی: ${verdict === 'ok' ? 'منطبق' : verdict === 'warn' ? 'مشروط' : 'مغایر'} (امتیاز انطباق: ${toFaDigits(score)} از ۱۰۰)\n` +
      `مرجع تصویب پیش‌بینی‌شده: ${predictedAuth}\n\n` +
      `کنترل بندهای بخشنامه:\n` +
      checks.map(x => `- [${x.status === 'ok' ? 'تأیید' : x.status === 'bad' ? 'مغایرت' : x.status === 'warn' ? 'هشدار' : 'نکته'}] ${x.title}: ${x.detail} (ص ${toFaDigits(x.page)})`).join('\n') +
      (recommendations.length ? `\n\nراهکارهای پیشنهادی کارشناس:\n${recommendations.map((x, i) => toFaDigits(i + 1) + '. ' + x).join('\n')}` : '');

    return {
      verdict,
      score,
      predictedAuth,
      checks,
      recommendations,
      customerReplyText,
      internalMemoText
    };
  }

  /* ---------- Sample Circular for Instant Demo ---------- */
  const SAMPLE_CIRCULAR_TEXT =
    `بخشنامه شماره: ۱۴۰۵/۳۲۴/۸۱۰\n` +
    `تاریخ: ۱۴۰۵/۰۷/۱۸\n` +
    `موضوع: دستورالعمل اجرایی بسته تسهیلاتی حمایت از واحدهای تولیدی و دانش‌بنیان (طرح رشد پایدار)\n` +
    `از: مدیریت امور اعتبارات بانک شهر\n` +
    `به: کلیه شعب و مناطق بانک\n\n` +
    `----- صفحه 1 از 2 -----\n` +
    `بدینوسیله در راستای مصوبه هیأت عامل بانک شهر و با هدف حمایت از تأمین مالی بنگاه‌های تولیدی، صنعتی و شرکت‌های دانش‌بنیان، ضوابط اجرایی اعطای تسهیلات «طرح رشد پایدار» تا پایان سال ۱۴۰۵ به شرح زیر ابلاغ می‌گردد:\n` +
    `ماده ۱- سقف تسهیلات فردی برای اشخاص حقوقی تولیدی حداکثر ۲۰۰ میلیارد ریال و برای اشخاص حقیقی صاحب پروانه کسب تولیدی حداکثر ۴۰ میلیارد ریال تعیین می‌گردد.\n` +
    `ماده ۲- حد اختیار رئیس شعبه ممتاز و درجه یک در چارچوب این بخشنامه تا سقف ۳۰ میلیارد ریال است و مبالغ مازاد بر آن باید در کمیته اعتباری منطقه یا هیأت عامل مطرح و تصویب گردد.\n` +
    `ماده ۳- نرخ سود این تسهیلات معادل ۲۱ درصد سالانه و وجه التزام تأخیر تأدیه دین مطابق ضوابط بانک مرکزی محاسبه می‌شود.\n\n` +
    `----- صفحه 2 از 2 -----\n` +
    `ماده ۴- حداکثر مدت بازپرداخت ۳۶ ماه به صورت اقساط ماهانه مساوی بوده و حداکثر ۶ ماه دوره تنفس برای طرح‌های توسعه‌ای مجاز است.\n` +
    `ماده ۵- متقاضی موظف است حداقل ۲ ماه میانگین سپرده فعال نزد بانک شهر داشته باشد. سقف تسهیلات معادل ۳ برابر معدل حساب متقاضی محاسبه می‌شود.\n` +
    `تبصره ۱- حداقل رتبه اعتباری قابل پذیرش برای بهره‌مندی از این طرح B2 یا بالاتر (A1 تا B2) است. اعطای تسهیلات به مشتریان دارای چک برگشتی رفع‌سوءاثرنشده یا بدهی غیرجاری ممنوع است.\n` +
    `ماده ۶- وثایق قابل قبول شامل وثیقه ملکی با ضریب پوشش ۱۳۰ درصد، ضمانت‌نامه بانکی، یا مسدودی سپرده نقدی و در مبالغ تا ۲۰ میلیارد ریال سفته و چک صیادی با یک ضامن معتبر است.\n` +
    `ماده ۷- دریافت صورت مالی حسابرسی‌شده آخرین سال مالی، استعلام برخط سمات، گواهی مالیات بر ارزش افزوده و مجوز فعالیت معتبر پیش از پرداخت الزامی است. مفاد بخشنامه‌های پیشین که مغایر با این دستورالعمل باشد از تاریخ ابلاغ ملغی می‌گردد.`;

  const EXPORTS = {
    normSuperText,
    cleanForSearch,
    tokenize,
    normalizePagesInput,
    segmentClauses,
    extractQuantitativeRules,
    analyzeSuperCircular,
    answerSuperQuestion,
    evaluateCaseAgainstCircular,
    SAMPLE_CIRCULAR_TEXT
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EXPORTS;
  }

  /* =====================================================================
     Browser Runtime: Hybrid PDF+OCR Extractor + Super Advisor UI
     ===================================================================== */
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  let STATE = {
    tab: 'upload', // 'upload' | 'report' | 'advisor'
    insightCat: 'limits',
    activeId: null,
    analysis: null,
    chat: [],
    lastEval: null,
    checkedActions: {}
  };

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveToLibrary(analysis) {
    if (!analysis || !analysis.id) return;
    let list = loadLibrary().filter(x => x.id !== analysis.id);
    // فشرده‌سازی سبک برای نگهداری امن در localStorage (نگهداری بندها و متادیتا، محدودکردن متن خام خیلی حجیم)
    const compact = Object.assign({}, analysis, {
      fullText: String(analysis.fullText || '').slice(0, 60000),
      pages: (analysis.pages || []).slice(0, 40).map(p => ({ page: p.page, source: p.source, text: String(p.text || '').slice(0, 5000) }))
    });
    list.unshift(compact);
    list = list.slice(0, 8);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (e) {
      // اگر سهمیه حافظه پر شد، فقط ۵ مورد اخیر بدون صفحات خام ذخیره شود
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 4).map(x => Object.assign({}, x, { fullText: '', pages: [] }))));
      } catch (e2) {}
    }
  }

  function deleteFromLibrary(id) {
    const list = loadLibrary().filter(x => x.id !== id);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
    if (STATE.activeId === id) {
      STATE.activeId = list[0] ? list[0].id : null;
      STATE.analysis = list[0] || null;
      STATE.chat = [];
      STATE.lastEval = null;
    }
    renderSuperAdvisor();
  }

  function loadScriptOnce(src) {
    if (typeof circScript === 'function') return circScript(src);
    return new Promise((ok, no) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      const s = document.createElement('script');
      s.src = src; s.dataset.src = src;
      s.onload = ok;
      s.onerror = () => no(new Error('بارگذاری ' + src + ' ناموفق بود'));
      document.head.appendChild(s);
    });
  }

  /* ---------- Hybrid PDF + Offline Persian OCR ---------- */
  async function ocrCanvasPersian(canvas) {
    if (!window.TesseractCore) await loadScriptOnce('lib/ocr-core.js');
    if (!window.OCR_FAS) await loadScriptOnce('lib/ocr-fas.js');
    const M = await window.TesseractCore({});
    const bin = atob(window.OCR_FAS);
    const vec = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) vec[i] = bin.charCodeAt(i);
    try { M.FS.mkdir('/tessdata'); } catch (e) {}
    M.FS.writeFile('/tessdata/fas.traineddata', vec);

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // تقویت کنتراست برای کیفیت بهتر OCR متن فارسی
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g < 165 ? Math.max(0, g * 0.72) : Math.min(255, g * 1.12);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);

    const api = new M.TessBaseAPI();
    api.Init('/tessdata', 'fas');
    api.SetImage(imgData.data, canvas.width, canvas.height, 4, canvas.width * 4);
    const text = api.GetUTF8Text() || '';
    api.End();
    return typeof faFix === 'function' ? faFix(text) : text;
  }

  async function extractSuperPdf(u8, useOcr, onProgress) {
    if (!window.pdfjsLib) {
      await loadScriptOnce('lib/pdf.min.js');
      await loadScriptOnce('lib/pdf.worker.min.js');
    }
    const L = window.pdfjsLib;
    try { L.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; } catch (e) {}

    const doc = await L.getDocument({ data: u8, isEvalSupported: false, useSystemFonts: true }).promise;
    const pages = [];

    for (let pn = 1; pn <= doc.numPages; pn++) {
      if (onProgress) onProgress(pn, doc.numPages, 'خواندن لایه متن صفحه ' + fa(pn) + ' از ' + fa(doc.numPages));
      const pg = await doc.getPage(pn);
      const tc = await pg.getTextContent();
      const rows = [];
      tc.items.forEach(it => {
        if (!it.str) return;
        const y = it.transform[5], x = it.transform[4];
        let r = rows.find(r0 => Math.abs(r0.y - y) < Math.max(2.5, (it.height || 8) * 0.45));
        if (!r) { r = { y, it: [] }; rows.push(r); }
        r.it.push({ x, s: it.str, w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 8 });
      });
      rows.sort((a, b) => b.y - a.y);

      const lineTexts = rows.map(r => {
        r.it = r.it.filter(i => i.s.trim());
        if (!r.it.length) return '';
        const all = r.it.map(i => i.s).join('');
        const ar = (all.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const la = (all.match(/[A-Za-z]/g) || []).length;
        const rtl = ar >= la;
        r.it.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
        if (typeof circJoin === 'function') return circJoin(r.it, rtl);
        return r.it.map(i => i.s.trim()).join(' ');
      }).filter(Boolean);

      let txt = lineTexts.join('\n');
      if (typeof faFix === 'function') txt = faFix(txt);
      const meaningfulLen = txt.replace(/[\s\d\-.,/\\:()]/g, '').length;
      let source = 'text';

      if (meaningfulLen < 45 && useOcr) {
        if (onProgress) onProgress(pn, doc.numPages, 'صفحه ' + fa(pn) + ' اسکن‌شده است — اجرای OCR فارسی آفلاین…');
        try {
          const vp = pg.getViewport({ scale: 2.1 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          const ocrTxt = await ocrCanvasPersian(canvas);
          if (ocrTxt && ocrTxt.replace(/\s+/g, '').length > meaningfulLen) {
            txt = ocrTxt;
            source = 'ocr';
          }
        } catch (ocrErr) {
          console.warn('OCR fallback error on page ' + pn, ocrErr);
        }
      }

      pages.push({ page: pn, text: txt, source });
    }
    return pages;
  }

  /* ---------- UI Helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function setStatus(html, pct) {
    const el = document.getElementById('spStatus');
    if (el) el.innerHTML = html;
    const bar = document.getElementById('spProgBar');
    if (bar && pct != null) bar.style.width = Math.max(4, Math.min(100, pct)) + '%';
  }

  async function handleFileUpload(file) {
    if (!file) return;
    const progWrap = document.getElementById('spProgWrap');
    if (progWrap) progWrap.style.display = 'block';
    setStatus('در حال آماده‌سازی «' + esc(file.name) + '»…', 8);

    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const ext = (String(file.name).split('.').pop() || '').toLowerCase();
      const useOcr = !(document.getElementById('spUseOcr') && !document.getElementById('spUseOcr').checked);
      let pages = [];

      if (ext === 'pdf' || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
        pages = await extractSuperPdf(buf, useOcr, (pn, total, msg) => {
          setStatus(msg, Math.round((pn / total) * 85));
        });
      } else if (ext === 'docx' && typeof circDocx === 'function') {
        setStatus('استخراج متن فایل Word…', 50);
        const t = await circDocx(buf);
        pages = normalizePagesInput(t);
      } else {
        setStatus('خواندن فایل متنی…', 50);
        const t = new TextDecoder('utf-8').decode(buf);
        pages = normalizePagesInput(t);
      }

      const totalUseful = pages.map(p => p.text).join('').replace(/\s+/g, '').length;
      if (totalUseful < 30) {
        setStatus('<span style="color:var(--bad)">متن قابل خواندن از این فایل استخراج نشد. لطفاً گزینه OCR آفلاین را فعال بگذارید یا متن را دستی وارد کنید.</span>', 100);
        return;
      }

      setStatus('تحلیل عمیق ساختار، مواد، پارامترها و تطبیق با ضوابط بانک…', 94);
      const analysis = analyzeSuperCircular(pages);
      analysis.fileName = file.name;
      STATE.analysis = analysis;
      STATE.activeId = analysis.id;
      STATE.chat = [];
      STATE.lastEval = null;
      STATE.checkedActions = {};
      saveToLibrary(analysis);
      STATE.tab = 'report';
      toast('تحلیل فوق‌هوشمند بخشنامه کامل شد ✓');
      renderSuperAdvisor();
    } catch (err) {
      setStatus('<span style="color:var(--bad)">خطا در پردازش فایل: ' + esc(err && err.message || err) + '</span>', 100);
    }
  }

  function runManualTextAnalysis(txt) {
    const clean = String(txt || '').trim();
    if (clean.length < 30) {
      toast('لطفاً متن بخشنامه را کامل‌تر وارد کنید');
      return;
    }
    const analysis = analyzeSuperCircular(clean);
    analysis.fileName = 'متن واردشده';
    STATE.analysis = analysis;
    STATE.activeId = analysis.id;
    STATE.chat = [];
    STATE.lastEval = null;
    STATE.checkedActions = {};
    saveToLibrary(analysis);
    STATE.tab = 'report';
    toast('تحلیل فوق‌هوشمند متن انجام شد ✓');
    renderSuperAdvisor();
  }

  function openPageModal(pageNum) {
    const a = STATE.analysis;
    if (!a || !a.pages) return;
    const pg = a.pages.find(p => p.page === pageNum) || a.pages[0];
    if (!pg) return;
    const old = document.getElementById('spPageModal');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'spPageModal';
    ov.className = 'gr-ov';
    ov.innerHTML = `<div class="gr-pg">
      <header>
        <b class="grow">${esc(a.meta.title)} — صفحه ${fa(pg.page)} از ${fa(a.pageCount)} ${pg.source === 'ocr' ? '(بازخوانی OCR)' : ''}</b>
        <button class="btn ghost sm" onclick="document.getElementById('spPageModal').remove()">بستن</button>
      </header>
      <div class="gr-body">${esc(fa(pg.text))}</div>
    </div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }

  function renderUploadTab() {
    const lib = loadLibrary();
    return `
      <div class="sp-grid">
        <div class="card">
          <div class="ch"><span class="bar"></span>بارگذاری فایل PDF بخشنامه (متنی و اسکن‌شده)</div>
          <div class="sp-drop" id="spDropZone" onclick="document.getElementById('spFileInput').click()">
            <div class="sp-drop-ic">${ICON('pdf', 30)}</div>
            <b>فایل PDF بخشنامه را اینجا رها کنید یا برای انتخاب کلیک کنید</b>
            <small>پشتیبانی کامل از PDF متنی، PDF اسکن‌شده (با موتور OCR فارسی آفلاین)، فایل Word (.docx) و TXT</small>
            <input type="file" id="spFileInput" accept=".pdf,.docx,.txt,application/pdf" style="display:none">
          </div>
          <label class="sp-chk-row">
            <input type="checkbox" id="spUseOcr" checked>
            <span>فعال‌سازی خودکار <b>OCR فارسی آفلاین</b> برای صفحات اسکن‌شده (تصویری)</span>
          </label>
          <div id="spProgWrap" class="sp-prog-wrap" style="display:none">
            <div class="sp-prog"><i id="spProgBar" style="width:10%"></i></div>
            <div id="spStatus" class="sp-status"></div>
          </div>
          <div class="row" style="margin-top:10px">
            <button type="button" class="btn ghost sm" onclick="window.__spLoadSample()">${ICON('spark', 15)} آزمایش با نمونه بخشنامه واقعی</button>
            <button type="button" class="btn ghost sm" onclick="document.getElementById('spPasteBox').open = !document.getElementById('spPasteBox').open">${ICON('edit', 15)} جای‌گذاری متن دستی</button>
          </div>
          <details id="spPasteBox" class="cpaste" style="margin-top:10px">
            <summary>ورود مستقیم متن بخشنامه</summary>
            <textarea class="inp" id="spManualTxt" rows="7" style="margin-top:8px" placeholder="متن بخشنامه را اینجا قرار دهید…"></textarea>
            <button type="button" class="btn pri block" style="margin-top:8px" onclick="window.__spAnalyzeManual()">${ICON('spark', 16)} تحلیل با سوپر موتور هوشمند</button>
          </details>
        </div>

        <div class="card">
          <div class="ch"><span class="bar"></span>کتابخانه بخشنامه‌های تحلیل‌شده (${fa(lib.length)})</div>
          ${lib.length ? lib.map(item => `
            <div class="sp-lib-item ${STATE.activeId === item.id ? 'on' : ''}">
              <div class="grow" onclick="window.__spSelectLib('${item.id}')">
                <b>${esc(item.meta && item.meta.title || 'بخشنامه')}</b>
                <small>${item.meta && item.meta.no ? 'شماره ' + fa(item.meta.no) + ' • ' : ''}${fa(item.pageCount || 1)} صفحه • ${fa((item.clauses || []).length)} بند استخراج‌شده</small>
              </div>
              <button type="button" class="ib" title="حذف" onclick="window.__spDeleteLib('${item.id}')">${ICON('trash', 16)}</button>
            </div>
          `).join('') : '<div class="empty">هنوز بخشنامه‌ای با سوپر موتور تحلیل نشده است. اولین PDF را بارگذاری کنید یا دکمه «آزمایش با نمونه بخشنامه واقعی» را بزنید.</div>'}
          <div class="note info" style="margin-top:10px">
            <b>سوپر موتور دقیقاً چه کاری انجام می‌دهد؟</b>
            <small>۱) استخراج متن چندستونی/جدولی و OCR صفحات اسکن‌شده • ۲) تفکیک مواد، بندها و تبصره‌ها با شماره صفحه • ۳) استخراج ۶ دسته نکته تخصصی + چک‌لیست الزامات • ۴) تبدیل به سوپر مشاور هوشمند برای پرسش و پاسخ و ارزیابی پرونده مشتری.</small>
          </div>
        </div>
      </div>`;
  }

  function renderReportTab(a) {
    if (!a) return '<div class="empty">ابتدا یک فایل بخشنامه را تحلیل کنید.</div>';
    const r = a.extractedRules || {};
    const cats = [
      ['limits', 'سقف و اختیارات', a.insights.limits.length],
      ['rates', 'نرخ و کارمزد', a.insights.rates.length],
      ['terms', 'مدت و تنفس', a.insights.terms.length],
      ['ratios', 'میانگین و نسبت‌ها', a.insights.ratios.length],
      ['rules', 'شروط و خط قرمزها', a.insights.rules.length],
      ['collateralDocs', 'وثایق و مدارک', a.insights.collateralDocs.length]
    ];
    const activeList = a.insights[STATE.insightCat] || [];

    return `
      <div class="sp-dna card">
        <div class="sp-dna-top">
          <div class="grow">
            <div class="sp-badges-row">
              <span class="st ok">${esc(a.meta.kindLabel)}</span>
              ${a.meta.no ? `<span class="st info">شماره ${fa(a.meta.no)}</span>` : ''}
              ${a.meta.date ? `<span class="st info">ابلاغ ${fa(a.meta.date)}</span>` : ''}
              ${a.meta.expire ? `<span class="st warn">اعتبار تا ${fa(a.meta.expire)}</span>` : ''}
              ${a.ocrPages ? `<span class="st warn">OCR فارسی: ${fa(a.ocrPages)} صفحه</span>` : ''}
            </div>
            <h3>${esc(a.meta.title)}</h3>
            <small class="sp-sub-meta">مرجع ابلاغ: <b>${esc(a.meta.issuer)}</b> • مخاطبان: <b>${esc((a.meta.audience || []).join('، '))}</b></small>
          </div>
          <div class="sp-dna-acts">
            <button type="button" class="btn pri sm" onclick="window.__spSwitchTab('advisor')">${ICON('spark', 15)} ورود به سوپر مشاور</button>
            <button type="button" class="btn ghost sm" onclick="window.__spPushToReg()">${ICON('layers', 15)} اعمال در مقررات سامانه</button>
          </div>
        </div>
        <div class="sp-exec-brief"><b>خلاصه مدیریتی:</b> ${esc(fa(a.meta.summary))}</div>
        <div class="sp-kpis">
          <div><small>سقف استخراج‌شده</small><b>${r.maxAmountBn ? fmtBn(r.maxAmountBn) : '—'}</b></div>
          <div><small>اختیار شعبه</small><b>${r.branchAuthBn ? fmtBn(r.branchAuthBn) : '—'}</b></div>
          <div><small>نرخ سود/کارمزد</small><b>${r.ratePct != null ? fmtFaNum(r.ratePct, 1) + '٪' : '—'}</b></div>
          <div><small>حداکثر مدت</small><b>${r.maxMonths ? fa(r.maxMonths) + ' ماه' : '—'}</b></div>
          <div><small>ضریب معدل</small><b>${r.avgMultiplier ? fmtFaNum(r.avgMultiplier, 1) + ' برابر' : '—'}</b></div>
          <div><small>کل بندهای ساختاری</small><b>${fa((a.clauses || []).length)} بند (${fa(a.pageCount)} ص)</b></div>
        </div>
      </div>

      <div class="sp-two">
        <div class="card">
          <div class="ch"><span class="bar"></span>نکات تخصصی استخراج‌شده در ۶ محور</div>
          <div class="sp-cat-tabs">
            ${cats.map(([k, lbl, cnt]) => `<span class="chip ${STATE.insightCat === k ? 'on' : ''}" onclick="window.__spSetCat('${k}')">${lbl} (${fa(cnt)})</span>`).join('')}
          </div>
          <div class="sp-cl-list">
            ${activeList.length ? activeList.map(cl => `
              <div class="sp-cl-item">
                <div class="sp-cl-h">
                  <b>${esc(fa(cl.label))}</b>
                  <span class="sp-pg-btn" onclick="window.__spOpenPage(${cl.page})">صفحه ${fa(cl.page)} ‹</span>
                </div>
                <p>${esc(fa(cl.text))}</p>
                ${cl.numbers && cl.numbers.length ? `<div class="sp-num-pills">${cl.numbers.slice(0, 5).map(n => `<span>${fa(n.raw)}</span>`).join('')}</div>` : ''}
              </div>
            `).join('') : '<div class="empty">در این محور نکته مستقیمی در بخشنامه یافت نشد.</div>'}
          </div>
        </div>

        <div>
          <div class="card">
            <div class="ch"><span class="bar"></span>چک‌لیست الزامات و خطوط قرمز شعبه (${fa((a.actions || []).length)})</div>
            ${(a.actions || []).length ? a.actions.map(act => {
              const checked = !!STATE.checkedActions[act.id];
              return `<label class="sp-act-item ${act.severity} ${checked ? 'done' : ''}">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.__spToggleAct('${act.id}', this.checked)">
                <div class="grow">
                  <div class="sp-act-meta">
                    <span class="st ${act.severity === 'critical' ? 'bad' : act.severity === 'must' ? 'warn' : 'info'}">${act.severity === 'critical' ? 'خط قرمز / ممنوعیت' : act.severity === 'must' ? 'الزام قطعی' : 'کنترل پرونده'}</span>
                    <small>${esc(fa(act.label))} • ص ${fa(act.page)}</small>
                  </div>
                  <span>${esc(fa(act.text))}</span>
                </div>
              </label>`;
            }).join('') : '<p class="pp">الزام صریحی جدا نشده است.</p>'}
          </div>

          <div class="card">
            <div class="ch"><span class="bar"></span>اثر متقابل بر ضوابط و طرح‌های فعلی بانک</div>
            ${a.crossImpact && a.crossImpact.paramDeltas.length ? `
              <div class="fl" style="margin-top:0">تفاوت با پارامترهای جاری سامانه</div>
              ${a.crossImpact.paramDeltas.map(d => `<div class="note warn"><b>${d.label}: جاری ${d.currentVal} ← بخشنامه ${d.pdfVal}</b><small>${d.note}</small></div>`).join('')}
            ` : ''}
            ${a.crossImpact && a.crossImpact.docRefs.length ? `
              <div class="fl">بخشنامه‌های مرتبط / منسوخ‌شده در سامانه</div>
              ${a.crossImpact.docRefs.map(d => `<div class="sp-ref-row"><span class="st ${d.relation.includes('لغو') ? 'bad' : 'info'}">${d.relation}</span> <b>${esc(d.title)}</b> (${fa(d.no)}) <small>ص ${fa(d.page)}</small></div>`).join('')}
            ` : ''}
            ${a.crossImpact && a.crossImpact.affectedProducts.length ? `
              <div class="fl">طرح‌های اعتباری متأثر</div>
              <div class="tags" style="margin-top:4px">${a.crossImpact.affectedProducts.map(p => `<span class="tag" style="cursor:pointer" onclick="openProduct('${p.id}')">${esc(p.title)}</span>`).join('')}</div>
            ` : '<small style="color:var(--ink2)">تعارض یا ارجاع مستقیم دیگری با طرح‌های فعلی یافت نشد.</small>'}
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:10px">
        <button type="button" class="btn ghost" onclick="window.__spCopySummary()">${ICON('copy', 16)} کپی خلاصه مدیریتی و نکات</button>
        <button type="button" class="btn ghost" onclick="window.__spExportReportJson()">${ICON('download', 16)} خروجی JSON تحلیل</button>
        <button type="button" class="btn ghost" onclick="window.print()">${ICON('print', 16)} چاپ گزارش تحلیل</button>
      </div>`;
  }

  function renderAdvisorTab(a) {
    if (!a) return '<div class="empty">ابتدا یک بخشنامه را تحلیل کنید.</div>';
    const defCase = {
      custName: '',
      ptype: 'legal',
      amount: (a.extractedRules && a.extractedRules.maxAmountBn) ? Math.min(a.extractedRules.maxAmountBn, 50) : 40,
      rating: 'B2',
      avgAmt: 15,
      avgMonths: 3,
      term: (a.extractedRules && a.extractedRules.maxMonths) ? Math.min(a.extractedRules.maxMonths, 36) : 36,
      bouncedCheque: false,
      overdue: false
    };
    const ev = STATE.lastEval || evaluateCaseAgainstCircular(a, defCase);

    return `
      <div class="sp-two">
        <div class="card">
          <div class="ch"><span class="bar"></span>گفتگوی هوشمند با بخشنامه (پرسش‌وپاسخ مستند)</div>
          <div class="sp-sugs">
            ${(a.suggestedQuestions || []).map(q => `<button type="button" class="chip" onclick="window.__spAsk('${esc(q)}')">${esc(q)}</button>`).join('')}
          </div>
          <div class="sp-chat-box" id="spChatBox">
            ${STATE.chat.length ? STATE.chat.map(m => `
              <div class="sp-msg ${m.role}">
                ${m.role === 'user' ? `<b>پرسش شما:</b> ${esc(m.text)}` : `
                  ${m.ans.shortAnswer ? `<div class="sp-ans-big">${esc(m.ans.shortAnswer)}</div>` : ''}
                  ${m.ans.mainClause ? `
                    <div class="sp-ans-txt">${esc(fa(m.ans.mainClause.text))}</div>
                    <div class="sp-ans-cite">
                      <span>${esc(fa(m.ans.mainClause.label))} — صفحه ${fa(m.ans.mainClause.page)}</span>
                      <span class="sp-pg-btn" onclick="window.__spOpenPage(${m.ans.mainClause.page})">مشاهده صفحه ‹</span>
                    </div>
                  ` : `<div class="sp-ans-txt">${esc(m.ans.advice)}</div>`}
                  ${m.ans.supportingClauses && m.ans.supportingClauses.length ? `
                    <details class="sp-sup-det"><summary>بندهای پشتیبان در بخشنامه (${fa(m.ans.supportingClauses.length)})</summary>
                      ${m.ans.supportingClauses.map(sc => `<div class="sp-sup-it"><b>${esc(fa(sc.label))} (ص ${fa(sc.page)}):</b> ${esc(fa(sc.text))}</div>`).join('')}
                    </details>
                  ` : ''}
                  ${m.bankCross ? `<div class="sp-bank-cross"><b>مقایسه با کل ضوابط بانک:</b> ${esc(fa(m.bankCross))}</div>` : ''}
                `}
              </div>
            `).join('') : '<div class="empty" style="padding:18px 10px">هر سؤالی درباره سقف‌ها، نرخ سود، وثایق، شرایط متقاضی یا استثنائات این بخشنامه دارید بپرسید یا یکی از پرسش‌های پیشنهادی بالا را انتخاب کنید.</div>'}
          </div>
          <form class="sp-ask-row" onsubmit="event.preventDefault(); window.__spAsk(document.getElementById('spQInput').value)">
            <input class="inp" id="spQInput" placeholder="مثلاً: آیا مشتری با رتبه C1 مشمول این بخشنامه است؟">
            <button type="submit" class="btn pri">${ICON('spark', 16)} بپرس</button>
          </form>
        </div>

        <div class="card">
          <div class="ch"><span class="bar"></span>شبیه‌ساز تطبیق پرونده مشتری با این بخشنامه</div>
          <div class="row" style="margin-bottom:8px">
            <button type="button" class="btn ghost sm" onclick="window.__spPullCustomer()">${ICON('users', 14)} دریافت از فرم مشاوره / گزارش فعلی</button>
          </div>
          <div class="row">
            <div><div class="fl">نام متقاضی</div><input class="inp" id="sp_cust" placeholder="شرکت / شخص" value="" oninput="window.__spEvalCase()"></div>
            <div><div class="fl">نوع شخصیت</div><select class="inp" id="sp_ptype" onchange="window.__spEvalCase()"><option value="legal" selected>حقوقی</option><option value="real">حقیقی</option></select></div>
          </div>
          <div class="row">
            <div><div class="fl">مبلغ درخواستی (میلیارد ریال)</div><input class="inp" id="sp_amt" inputmode="decimal" value="${toEnDigits(defCase.amount)}" oninput="window.__spEvalCase()"></div>
            <div><div class="fl">رتبه اعتباری</div><select class="inp" id="sp_rat" onchange="window.__spEvalCase()">${['A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','E1'].map(g => `<option value="${g}" ${g === 'B2' ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          </div>
          <div class="row">
            <div><div class="fl">میانگین سپرده (میلیارد ریال)</div><input class="inp" id="sp_avg" inputmode="decimal" value="${toEnDigits(defCase.avgAmt)}" oninput="window.__spEvalCase()"></div>
            <div><div class="fl">مدت خواب (ماه) / بازپرداخت (ماه)</div>
              <div class="row" style="gap:6px"><input class="inp" id="sp_avgm" inputmode="numeric" value="3" title="ماه خواب" oninput="window.__spEvalCase()"><input class="inp" id="sp_term" inputmode="numeric" value="${toEnDigits(defCase.term)}" title="مدت بازپرداخت" oninput="window.__spEvalCase()"></div>
            </div>
          </div>
          <div class="sp-flags-row">
            <label><input type="checkbox" id="sp_chk" onchange="window.__spEvalCase()"> دارای چک برگشتی</label>
            <label><input type="checkbox" id="sp_ovd" onchange="window.__spEvalCase()"> دارای بدهی غیرجاری</label>
          </div>
          <div id="spEvalOut">${renderEvalResultHtml(ev)}</div>
        </div>
      </div>`;
  }

  function renderEvalResultHtml(ev) {
    if (!ev) return '';
    const vText = ev.verdict === 'ok' ? 'مشمول و منطبق با بخشنامه' : ev.verdict === 'warn' ? 'مشروط — نیازمند تکمیل/تعدیل' : 'مغایر با مفاد بخشنامه';
    const vCls = ev.verdict === 'ok' ? 'ok' : ev.verdict === 'warn' ? 'warn' : 'bad';
    return `
      <div class="sp-eval-head">
        <span class="st ${vCls}">${vText}</span>
        <b>امتیاز انطباق: ${fa(ev.score)}٪</b>
      </div>
      <div class="sp-auth-box"><small>مرجع تصویب پیش‌بینی‌شده:</small> <b>${esc(ev.predictedAuth)}</b></div>
      <div class="sp-checks">
        ${ev.checks.map(ch => `
          <div class="sp-chk-it ${ch.status}">
            <span class="dot"></span>
            <div class="grow"><b>${esc(ch.title)}</b><small>${esc(ch.detail)} (ص ${fa(ch.page)})</small></div>
          </div>
        `).join('')}
      </div>
      ${ev.recommendations.length ? `
        <div class="note info" style="margin-top:8px">
          <b>راهکارهای اصلاحی سوپر مشاور</b>
          <ol class="ol" style="margin:4px 16px 0 0;font-size:11.5px">${ev.recommendations.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        </div>
      ` : ''}
      <div class="row" style="margin-top:10px">
        <button type="button" class="btn pri sm" onclick="window.__spCopyReply()">${ICON('copy', 15)} کپی پیام مشاوره به مشتری</button>
        <button type="button" class="btn ghost sm" onclick="window.__spCopyMemo()">${ICON('doc', 15)} کپی گزارش کارشناسی داخلی</button>
      </div>`;
  }

  function renderSuperAdvisor() {
    const a = STATE.analysis;
    const tabs = [
      ['upload', '۱. آپلود و OCR هوشمند'],
      ['report', '۲. تحلیل جامع و نکات' + (a ? ' ✓' : '')],
      ['advisor', '۳. سوپر مشاور هوشمند' + (a ? ' ★' : '')]
    ];

    let body = '';
    if (STATE.tab === 'upload') body = renderUploadTab();
    else if (STATE.tab === 'report') body = renderReportTab(a);
    else body = renderAdvisorTab(a);

    const html = `
      <div class="card thead">
        <span class="pic" style="background:linear-gradient(135deg,#A50F1E,#5B3A8E)">${ICON('spark', 21)}</span>
        <div class="grow">
          <b>سوپر موتور تحلیلگر PDF بخشنامه و سوپر مشاور هوشمند</b>
          <small>تحلیل عمیق بخشنامه‌های متنی و اسکن‌شده (OCR فارسی آفلاین)، استخراج نکات و تبدیل به مشاور تعاملی پرونده</small>
        </div>
      </div>
      <div class="sp-tabs">
        ${tabs.map(([id, lbl]) => `<button type="button" class="sp-tab ${STATE.tab === id ? 'on' : ''}" ${id !== 'upload' && !a ? 'disabled' : ''} onclick="window.__spSwitchTab('${id}')">${lbl}</button>`).join('')}
      </div>
      <div id="spMainBody">${body}</div>`;

    $('#toolBody').innerHTML = html;
    show('tool', true, 'سوپر تحلیلگر PDF و مشاور هوشمند');

    // اتصال رویدادهای Drag & Drop و فایل
    const dz = document.getElementById('spDropZone');
    const fi = document.getElementById('spFileInput');
    if (fi) {
      fi.onchange = () => { if (fi.files && fi.files[0]) handleFileUpload(fi.files[0]); };
    }
    if (dz) {
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', e => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFileUpload(f);
      });
    }
    if (STATE.tab === 'advisor' && a && !STATE.lastEval) {
      window.__spEvalCase();
    }
  }

  /* ---------- Global UI Callbacks ---------- */
  window.__spSwitchTab = function (t) {
    if (t !== 'upload' && !STATE.analysis) { toast('ابتدا یک فایل بخشنامه را تحلیل کنید'); return; }
    STATE.tab = t;
    renderSuperAdvisor();
  };
  window.__spSetCat = function (c) { STATE.insightCat = c; renderSuperAdvisor(); };
  window.__spOpenPage = openPageModal;
  window.__spToggleAct = function (id, val) { STATE.checkedActions[id] = val; };
  window.__spLoadSample = function () {
    const a = analyzeSuperCircular(SAMPLE_CIRCULAR_TEXT);
    a.fileName = 'نمونه_بخشنامه_طرح_رشد_پایدار.pdf';
    STATE.analysis = a;
    STATE.activeId = a.id;
    STATE.chat = [];
    STATE.lastEval = null;
    STATE.checkedActions = {};
    saveToLibrary(a);
    STATE.tab = 'report';
    toast('نمونه بخشنامه با موفقیت تحلیل شد ✓');
    renderSuperAdvisor();
  };
  window.__spAnalyzeManual = function () {
    const el = document.getElementById('spManualTxt');
    runManualTextAnalysis(el ? el.value : '');
  };
  window.__spSelectLib = function (id) {
    const found = loadLibrary().find(x => x.id === id);
    if (!found) return;
    STATE.analysis = found;
    STATE.activeId = found.id;
    STATE.chat = [];
    STATE.lastEval = null;
    STATE.tab = 'report';
    renderSuperAdvisor();
  };
  window.__spDeleteLib = deleteFromLibrary;
  window.__spPushToReg = function () {
    if (!STATE.analysis || !STATE.analysis.fullText) return;
    if (typeof circImport === 'function' && typeof circRun === 'function') {
      regGuard(() => {
        circImport(STATE.analysis.meta.kind === 'notice' ? 'notice' : 'circ');
        const box = document.getElementById('circTxt');
        if (box) {
          box.value = STATE.analysis.fullText;
          circRun();
        }
      });
    }
  };
  window.__spAsk = function (q) {
    const qTxt = String(q || '').trim();
    if (!qTxt || !STATE.analysis) return;
    const ans = answerSuperQuestion(STATE.analysis, qTxt);
    let bankCross = '';
    if (typeof grAsk === 'function') {
      try {
        const g = grAsk(qTxt);
        if (g && (g.v === 'ok' || g.v === 'part') && g.main && g.main.c) {
          bankCross = `${g.short ? g.short + ' — ' : ''}«${g.main.c.title}» (${g.main.c.where})`;
        }
      } catch (e) {}
    }
    STATE.chat.push({ role: 'user', text: qTxt });
    STATE.chat.push({ role: 'bot', ans, bankCross });
    renderSuperAdvisor();
    const cb = document.getElementById('spChatBox');
    if (cb) cb.scrollTop = cb.scrollHeight;
  };
  window.__spEvalCase = function () {
    if (!STATE.analysis) return;
    const val = id => (document.getElementById(id) || {}).value || '';
    const chk = id => !!(document.getElementById(id) || {}).checked;
    const res = evaluateCaseAgainstCircular(STATE.analysis, {
      custName: val('sp_cust'),
      ptype: val('sp_ptype') || 'legal',
      amount: typeof pnum === 'function' ? pnum(val('sp_amt')) : parseFloat(toEnDigits(val('sp_amt'))) || 0,
      rating: val('sp_rat') || 'B2',
      avgAmt: typeof pnum === 'function' ? pnum(val('sp_avg')) : parseFloat(toEnDigits(val('sp_avg'))) || 0,
      avgMonths: typeof pnum === 'function' ? pnum(val('sp_avgm')) : parseFloat(toEnDigits(val('sp_avgm'))) || 0,
      term: typeof pnum === 'function' ? pnum(val('sp_term')) : parseFloat(toEnDigits(val('sp_term'))) || 0,
      bouncedCheque: chk('sp_chk'),
      overdue: chk('sp_ovd')
    });
    STATE.lastEval = res;
    const out = document.getElementById('spEvalOut');
    if (out) out.innerHTML = renderEvalResultHtml(res);
  };
  window.__spPullCustomer = function () {
    let p = null;
    if (typeof LAST !== 'undefined' && LAST && LAST.p) p = LAST.p;
    else if (typeof readForm === 'function') { try { p = readForm(); } catch (e) {} }
    if (!p) { toast('اطلاعاتی در فرم مشاوره یا گزارش فعلی یافت نشد'); return; }
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('sp_cust', p.cust || '');
    set('sp_ptype', p.ptype === 'real' ? 'real' : 'legal');
    set('sp_amt', p.amount || 0);
    set('sp_rat', p.rating || 'B2');
    set('sp_avg', p.avgAmt || 0);
    set('sp_term', p.prefTerm || 36);
    window.__spEvalCase();
    toast('مشخصات مشتری وارد شبیه‌ساز شد ✓');
  };
  window.__spCopyReply = function () {
    if (STATE.lastEval) nativeCopy(STATE.lastEval.customerReplyText);
  };
  window.__spCopyMemo = function () {
    if (STATE.lastEval) nativeCopy(STATE.lastEval.internalMemoText);
  };
  window.__spCopySummary = function () {
    const a = STATE.analysis;
    if (!a) return;
    const txt = `تحلیل فوق‌هوشمند ${a.meta.kindLabel}: ${a.meta.title}\n` +
      `شماره: ${a.meta.no || '—'} | تاریخ: ${a.meta.date || '—'} | مرجع: ${a.meta.issuer}\n\n` +
      `خلاصه مدیریتی:\n${a.meta.summary}\n\n` +
      `الزامات کلیدی:\n` + (a.actions || []).slice(0, 8).map((x, i) => `${toFaDigits(i + 1)}) [ص ${toFaDigits(x.page)}] ${x.text}`).join('\n');
    nativeCopy(txt);
  };
  window.__spExportReportJson = function () {
    const a = STATE.analysis;
    if (!a) return;
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'super-circular-analysis-' + (toEnDigits(a.meta.no || '').replace(/\W+/g, '-') || 'report') + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    toast('گزارش JSON دانلود شد ✓');
  };

  /* ---------- Registration & Hooks ---------- */
  function registerSuperAdvisor() {
    const saved = loadLibrary();
    if (saved.length && !STATE.analysis) {
      STATE.analysis = saved[0];
      STATE.activeId = saved[0].id;
    }

    if (typeof TOOLS !== 'undefined' && !TOOLS.some(t => t.id === 'super_pdf')) {
      TOOLS.unshift({
        id: 'super_pdf',
        t: 'سوپر موتور تحلیلگر PDF و مشاور هوشمند',
        d: 'تحلیل فوق‌حرفه‌ای PDF بخشنامه (متنی و اسکن‌شده OCR)، استخراج ۶ محور نکات، چک‌لیست الزامات و مشاور تعاملی پرونده',
        ic: 'spark',
        col: '#A50F1E'
      });
    }
    if (typeof SM_TOOLS !== 'undefined' && typeof SM_FN !== 'undefined') {
      SM_FN.superpdf = () => openTool('super_pdf');
      if (!SM_TOOLS[0].items.some(x => x[0] === 'superpdf')) {
        SM_TOOLS[0].items.unshift([
          'superpdf', 'pdf', '#A50F1E',
          'سوپر تحلیلگر PDF و مشاور هوشمند',
          'تحلیل فوق‌هوشمند بخشنامه‌های PDF (متنی و OCR)، پرسش و پاسخ مستند و تطبیق پرونده مشتری'
        ]);
      }
    }

    const prevOpenTool = window.openTool;
    if (typeof prevOpenTool === 'function') {
      window.openTool = function (id) {
        if (id === 'super_pdf') {
          TOOL = 'super_pdf';
          renderSuperAdvisor();
          return;
        }
        return prevOpenTool.apply(this, arguments);
      };
    }

    // افزودن دکمه مستقیم داخل صفحه ورود بخشنامه قدیمی (circImport)
    if (typeof window.circImport === 'function') {
      const prevCircImport = window.circImport;
      window.circImport = function () {
        prevCircImport.apply(this, arguments);
        const tb = document.getElementById('toolBody');
        if (tb && !document.getElementById('spBridgeBanner')) {
          const b = document.createElement('div');
          b.id = 'spBridgeBanner';
          b.className = 'sp-bridge';
          b.innerHTML = `<div class="grow"><b>نیاز به تحلیل عمیق، OCR صفحات اسکن‌شده و سوپر مشاور هوشمند دارید؟</b><small>استخراج بندبه‌بند نکات، پرسش و پاسخ مستند با شماره صفحه و ارزیابی پرونده مشتری روی همین PDF</small></div><button type="button" class="btn pri sm" onclick="openTool('super_pdf')">باز کردن سوپر موتور PDF ‹</button>`;
          tb.insertBefore(b, tb.children[1] || null);
        }
      };
    }

    // افزودن دکمه میان‌بر در سایدبار رایانه
    const nav = document.querySelector('.nav');
    if (nav && !document.getElementById('sbSuperPdfBtn')) {
      const growthBtn = nav.querySelector('button[data-go="growth"]');
      const b = document.createElement('button');
      b.id = 'sbSuperPdfBtn';
      b.className = 'pcx';
      b.innerHTML = (typeof ICON === 'function' ? ICON('spark', 19) : '') + '<span>سوپر تحلیلگر PDF</span>';
      b.onclick = () => { HIST.length = 0; CUR = 'tools'; openTool('super_pdf'); };
      if (growthBtn && growthBtn.parentNode === nav) {
        nav.insertBefore(b, growthBtn.nextSibling);
      } else {
        nav.appendChild(b);
      }
    }
  }

  window.openSuperPdfAdvisor = function () {
    if (typeof openTool === 'function') openTool('super_pdf');
    else renderSuperAdvisor();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerSuperAdvisor);
  } else {
    registerSuperAdvisor();
  }
})(typeof window !== 'undefined' ? window : globalThis);
