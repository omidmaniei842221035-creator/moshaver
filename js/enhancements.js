/* =====================================================================
   سامانه مشاور اعتباری بانک شهر — ماژول توسعه و قابلیت‌های پیشرفته (نسخه ۳٫۹)
   • تم تاریک / روشن (Dark Mode) با حفظ چاپ استاندارد سفید
   • جستجوی سراسری سریع (Command Palette — Ctrl+K)
   • مقایسه هم‌زمان طرح‌های اعتباری (Product Comparator)
   • ارزیابی توان بازپرداخت و نسبت پوشش بدهی (DSCR)
   • جستجو، فیلتر، خروجی اکسل (CSV) در بایگانی و پشتیبان‌گیری یک‌جا
   • دکمه بازگشت سریع به بالا
   کاملاً آفلاین و بدون نیاز به Build (قابل اجرا با file:// و http://)
   ===================================================================== */
(function (root) {
  'use strict';

  const THEME_KEY = 'sca_theme';

  /* ---------- Pure Utility Functions (قابل تست خودکار) ---------- */
  function normSearchText(s) {
    let t = String(s == null ? '' : s).trim().toLowerCase();
    t = t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
         .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
         .replace(/ي/g, 'ی')
         .replace(/ك/g, 'ک')
         .replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
         .replace(/\s+/g, ' ');
    return t;
  }

  function calcDSCRMetrics(opts) {
    const annualCashflow = Math.max(0, Number(opts.annualCashflow) || 0);
    const existingMonthly = Math.max(0, Number(opts.existingMonthly) || 0);
    const loanAmount = Math.max(0, Number(opts.loanAmount) || 0);
    const rate = Math.max(0, Number(opts.rate) || 0);
    const months = Math.max(1, Math.round(Number(opts.months) || 12));
    const mode = opts.mode || 'm'; // 'm'=ماهانه, 'p3'=فصلی, 'bul'=یکجا

    const monthlyCashflow = annualCashflow / 12;
    const r = rate / 100;

    function calcInst(amt, annualRate) {
      if (amt <= 0) return { monthlyEq: 0, periodInst: 0, total: 0, cost: 0 };
      const ri = annualRate / 100;
      if (mode === 'bul') {
        const tot = amt * (1 + ri * months / 12);
        return { monthlyEq: tot / months, periodInst: tot, total: tot, cost: tot - amt };
      }
      const step = mode === 'p3' ? 3 : (mode === 'p6' ? 6 : 1);
      const N = Math.max(1, Math.round(months / step));
      const rp = ri * step / 12;
      const q = rp > 0 ? (amt * rp / (1 - Math.pow(1 + rp, -N))) : (amt / N);
      const total = q * N;
      return { monthlyEq: total / months, periodInst: q, total, cost: total - amt };
    }

    const base = calcInst(loanAmount, rate);
    const stressed = calcInst(loanAmount, rate + 3);
    const totalMonthlyDebt = existingMonthly + base.monthlyEq;
    const totalAnnualDebt = totalMonthlyDebt * 12;
    const stressedAnnualDebt = (existingMonthly + stressed.monthlyEq) * 12;

    const dscr = totalAnnualDebt > 0 ? annualCashflow / totalAnnualDebt : (annualCashflow > 0 ? 99 : 0);
    const dscrStressed = stressedAnnualDebt > 0 ? annualCashflow / stressedAnnualDebt : (annualCashflow > 0 ? 99 : 0);

    // حداکثر قسط ماهانه قابل تحمل در آستانه مطلوب DSCR = 1.25
    const targetDscr = 1.25;
    const maxNewMonthly = Math.max(0, (monthlyCashflow / targetDscr) - existingMonthly);
    let maxSustainableLoan = 0;
    if (maxNewMonthly > 0) {
      if (mode === 'bul') {
        const factor = 1 + r * months / 12;
        maxSustainableLoan = (maxNewMonthly * months) / factor;
      } else {
        const step = mode === 'p3' ? 3 : (mode === 'p6' ? 6 : 1);
        const N = Math.max(1, Math.round(months / step));
        const rp = r * step / 12;
        const maxPeriodQ = maxNewMonthly * step;
        maxSustainableLoan = rp > 0 ? (maxPeriodQ * (1 - Math.pow(1 + rp, -N)) / rp) : (maxPeriodQ * N);
      }
    }

    let status = 'ok';
    let label = 'مطلوب — پوشش بدهی کافی';
    if (totalAnnualDebt <= 0 && annualCashflow <= 0) {
      status = 'warn';
      label = 'اطلاعات جریان نقدی وارد نشده است';
    } else if (dscr < 1.0) {
      status = 'bad';
      label = 'پرریسک — جریان نقدی کفاف اقساط را نمی‌دهد';
    } else if (dscr < 1.25) {
      status = 'warn';
      label = 'لب‌مرزی — حاشیه اطمینان پایین (توصیه به افزایش مدت یا تعدیل مبلغ)';
    }

    return {
      annualCashflow,
      monthlyCashflow,
      existingMonthly,
      newMonthlyEq: base.monthlyEq,
      newPeriodInst: base.periodInst,
      newTotalPayback: base.total,
      newTotalProfit: base.cost,
      totalMonthlyDebt,
      totalAnnualDebt,
      dscr,
      dscrStressed,
      maxNewMonthly,
      maxSustainableLoan,
      status,
      label
    };
  }

  function csvEscapeCell(val) {
    const s = String(val == null ? '' : val).replace(/\r?\n/g, ' ');
    if (/[",;\t]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function casesToCSV(cases, helpers) {
    const h = helpers || {};
    const fmtDate = h.fmtDate || (d => String(d || ''));
    const fmtNum = h.fmtNum || (v => String(v == null ? '' : v));
    const sectorMap = h.sectorMap || {};
    const personaMap = h.personaMap || {};
    const headers = ['شماره گزارش', 'تاریخ', 'نام متقاضی', 'نوع مشتری', 'مبلغ (میلیارد ریال)', 'طرح پیشنهادی اول', 'رتبه اعتباری', 'وثیقه', 'تعداد هشدارها'];
    const rows = [headers.map(csvEscapeCell).join(',')];
    (cases || []).forEach(c => {
      const p = c.p || {};
      const ctype = p.ptype === 'legal' ? ('حقوقی - ' + (sectorMap[p.sector] || p.sector || '')) : ('حقیقی - ' + (personaMap[p.persona] || p.persona || ''));
      const collTxt = p.coll ? ('نوع ' + p.coll) : '—';
      const line = [
        c.no || '',
        fmtDate(c.date),
        c.cust || c.title || 'بدون نام',
        ctype,
        c.amount != null ? fmtNum(c.amount) : '0',
        c.top || '',
        p.rating || '—',
        collTxt,
        Array.isArray(c.rf) ? c.rf.length : ''
      ];
      rows.push(line.map(csvEscapeCell).join(','));
    });
    return '\uFEFF' + rows.join('\r\n');
  }

  function validateBackupBundle(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      data = JSON.parse(raw.trim());
    }
    if (!data || typeof data !== 'object' || data.app !== 'shahr-credit-advisor' || data.type !== 'full-backup' || !data.keys || typeof data.keys !== 'object') {
      return { ok: false, error: 'فایل پشتیبان معتبر نیست یا مربوط به این سامانه نمی‌باشد.' };
    }
    const validKeys = {};
    Object.keys(data.keys).forEach(k => {
      if (k.startsWith('sca_')) validKeys[k] = data.keys[k];
    });
    if (!Object.keys(validKeys).length) {
      return { ok: false, error: 'هیچ داده قابل بازیابی در فایل پشتیبان یافت نشد.' };
    }
    return { ok: true, data, keys: validKeys, count: Object.keys(validKeys).length };
  }

  const EXPORTS = { normSearchText, calcDSCRMetrics, csvEscapeCell, casesToCSV, validateBackupBundle };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EXPORTS;
  }

  /* ---------- Browser Integration ---------- */
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  function addIcons() {
    if (typeof IC === 'undefined') return;
    Object.assign(IC, {
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
      moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
      up: '<path d="m18 15-6-6-6 6"/>',
      compare: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'
    });
  }

  /* ---------- Theme Management (Dark / Light) ---------- */
  function getTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return 'light';
  }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    const btn = document.getElementById('abThemeBtn');
    if (btn && typeof ICON === 'function') {
      btn.innerHTML = ICON(t === 'dark' ? 'sun' : 'moon', 18);
      btn.title = t === 'dark' ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک';
      btn.setAttribute('aria-label', btn.title);
    }
    const sel = document.getElementById('pf_theme');
    if (sel) sel.value = t;
  }

  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (typeof toast === 'function') {
      toast(next === 'dark' ? 'حالت تاریک فعال شد' : 'حالت روشن فعال شد');
    }
  }

  /* ---------- AppBar & Scroll-to-Top ---------- */
  function setupAppBarAndScroll() {
    const bar = document.querySelector('.appbar');
    if (bar && !document.getElementById('abSearchBtn')) {
      const avatar = bar.querySelector('.avatar');
      const wrap = document.createElement('div');
      wrap.className = 'appbar-actions';

      const searchBtn = document.createElement('button');
      searchBtn.id = 'abSearchBtn';
      searchBtn.type = 'button';
      searchBtn.className = 'ab-tool';
      searchBtn.title = 'جستجوی سراسری سریع (Ctrl+K)';
      searchBtn.innerHTML = (typeof ICON === 'function' ? ICON('search', 16) : '') + '<span class="lbl">جستجو</span><kbd>Ctrl+K</kbd>';
      searchBtn.onclick = openCmdPalette;

      const themeBtn = document.createElement('button');
      themeBtn.id = 'abThemeBtn';
      themeBtn.type = 'button';
      themeBtn.className = 'ab-tool icon-only';
      themeBtn.onclick = toggleTheme;

      wrap.append(searchBtn, themeBtn);
      if (avatar) bar.insertBefore(wrap, avatar);
      else bar.appendChild(wrap);
    }
    applyTheme(getTheme());

    const screen = document.getElementById('screen');
    if (screen && !document.getElementById('scrollTopBtn')) {
      const topBtn = document.createElement('button');
      topBtn.id = 'scrollTopBtn';
      topBtn.type = 'button';
      topBtn.className = 'scroll-top';
      topBtn.title = 'بازگشت به بالای صفحه';
      topBtn.setAttribute('aria-label', 'بازگشت به بالای صفحه');
      topBtn.innerHTML = typeof ICON === 'function' ? ICON('up', 19) : '↑';
      topBtn.onclick = () => screen.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.appendChild(topBtn);
      screen.addEventListener('scroll', () => {
        topBtn.classList.toggle('on', screen.scrollTop > 320);
      }, { passive: true });
    }
  }

  /* ---------- Global Command Palette (Ctrl+K) ---------- */
  let cmdResults = [];
  let cmdSelIdx = 0;

  function ensureCmdPalette() {
    if (document.getElementById('cmdPalette')) return;
    const div = document.createElement('div');
    div.id = 'cmdPalette';
    div.className = 'cmd-backdrop';
    div.innerHTML = `
      <div class="cmd-box" role="dialog" aria-modal="true" aria-label="جستجوی سراسری سامانه">
        <div class="cmd-head">
          ${typeof ICON === 'function' ? ICON('search', 19) : ''}
          <input id="cmdInput" type="text" placeholder="جستجو در طرح‌ها، محاسبه‌گرها، بخشنامه‌ها، پرونده‌ها و مشتریان..." autocomplete="off">
          <kbd>Esc</kbd>
        </div>
        <div class="cmd-list" id="cmdList"></div>
        <div class="cmd-foot">
          <span>↑↓ حرکت • Enter باز کردن</span>
          <span>میان‌بر: Ctrl+K</span>
        </div>
      </div>`;
    div.addEventListener('click', e => {
      if (e.target === div) closeCmdPalette();
    });
    document.body.appendChild(div);
    const inp = document.getElementById('cmdInput');
    inp.addEventListener('input', () => { cmdSelIdx = 0; renderCmdList(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeCmdPalette(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cmdResults.length) { cmdSelIdx = (cmdSelIdx + 1) % cmdResults.length; renderCmdList(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmdResults.length) { cmdSelIdx = (cmdSelIdx - 1 + cmdResults.length) % cmdResults.length; renderCmdList(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cmdResults[cmdSelIdx]) execCmdItem(cmdSelIdx);
      }
    });
  }

  function buildCmdIndex(query) {
    const q = normSearchText(query);
    const match = txt => !q || normSearchText(txt).includes(q);
    const items = [];

    if (typeof TOOLS !== 'undefined') {
      TOOLS.forEach(t => {
        if (match(t.t + ' ' + t.d)) {
          items.push({ grp: 'محاسبه‌گرها و ابزارها', t: t.t, s: t.d, ic: t.ic || 'calc', col: t.col || '#1F5F8B', badge: 'ابزار', run: () => openTool(t.id) });
        }
      });
    }
    if (typeof SM_TOOLS !== 'undefined') {
      SM_TOOLS.forEach(g => {
        g.items.forEach(x => {
          if (match(x[3] + ' ' + x[4])) {
            items.push({ grp: 'ابزارهای هوشمند', t: x[3], s: x[4], ic: x[1] || 'spark', col: x[2] || '#A50F1E', badge: 'هوشمند', run: () => { HIST.length = 0; CUR = 'tools'; openTool('sm_' + x[0]); } });
          }
        });
      });
    }
    if (typeof P !== 'undefined') {
      P.forEach(p => {
        if (match(p.t + ' ' + p.s + ' ' + (p.src || ''))) {
          items.push({ grp: 'طرح‌ها و محصولات', t: p.t, s: p.s, ic: p.ic || 'layers', col: p.col || '#A50F1E', badge: p.expired ? 'منقضی' : 'طرح', run: () => openProduct(p.id) });
        }
      });
    }
    if (typeof DOCS2 !== 'undefined') {
      DOCS2.forEach(d => {
        if (match(d.title + ' ' + (d.no || '') + ' ' + (d.summary || ''))) {
          items.push({ grp: 'بخشنامه‌ها و اطلاعیه‌ها', t: d.title, s: (d.no ? 'شماره ' + fa(d.no) + ' — ' : '') + (d.summary || ''), ic: 'doc', col: '#1B2232', badge: d.kind === 'notice' ? 'اطلاعیه' : 'بخشنامه', run: () => openDoc(d.id) });
        }
      });
    }
    if (typeof store !== 'undefined') {
      const cases = store.get('sca_cases', []);
      cases.forEach(c => {
        if (match((c.cust || '') + ' ' + (c.title || '') + ' ' + (c.no || '') + ' ' + (c.top || ''))) {
          items.push({ grp: 'گزارش‌های بایگانی‌شده', t: (c.cust || c.title || 'گزارش') + ' (شماره ' + fa(c.no) + ')', s: (c.amount ? bn(c.amount) + ' — ' : '') + (c.top || ''), ic: 'folder', col: '#374151', badge: 'بایگانی', run: () => loadCase(c.id) });
        }
      });
    }
    if (typeof cmList === 'function') {
      cmList().forEach(c => {
        if (match((c.name || '') + ' ' + (c.nid || ''))) {
          items.push({ grp: 'حافظه تحلیل مشتریان', t: c.name, s: 'شناسه/کد: ' + fa(c.nid), ic: 'users', col: '#0E8C8C', badge: 'مشتری', run: () => { if (typeof cmOpen === 'function') cmOpen(c.nid); } });
        }
      });
    }

    return q ? items.slice(0, 35) : items.slice(0, 18);
  }

  function renderCmdList() {
    const listEl = document.getElementById('cmdList');
    const inp = document.getElementById('cmdInput');
    if (!listEl || !inp) return;
    cmdResults = buildCmdIndex(inp.value);
    if (!cmdResults.length) {
      listEl.innerHTML = '<div class="cmd-empty">نتیجه‌ای یافت نشد؛ عبارت دیگری را امتحان کنید.</div>';
      return;
    }
    if (cmdSelIdx >= cmdResults.length) cmdSelIdx = 0;
    let html = '';
    let lastGrp = '';
    cmdResults.forEach((it, idx) => {
      if (it.grp !== lastGrp) {
        lastGrp = it.grp;
        html += `<div class="cmd-grp">${lastGrp}</div>`;
      }
      html += `<div class="cmd-item ${idx === cmdSelIdx ? 'sel' : ''}" data-idx="${idx}">
        <span class="cmd-ic" style="background:${it.col}">${typeof ICON === 'function' ? ICON(it.ic, 16) : ''}</span>
        <div class="grow"><b>${it.t}</b><small>${it.s || ''}</small></div>
        <span class="cmd-badge">${it.badge}</span>
      </div>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.cmd-item').forEach(el => {
      el.onclick = () => execCmdItem(+el.dataset.idx);
    });
    const active = listEl.querySelector('.cmd-item.sel');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function execCmdItem(idx) {
    const item = cmdResults[idx];
    closeCmdPalette();
    if (item && typeof item.run === 'function') item.run();
  }

  function openCmdPalette() {
    ensureCmdPalette();
    const bd = document.getElementById('cmdPalette');
    const inp = document.getElementById('cmdInput');
    bd.classList.add('open');
    inp.value = '';
    cmdSelIdx = 0;
    renderCmdList();
    setTimeout(() => inp.focus(), 20);
  }

  function closeCmdPalette() {
    const bd = document.getElementById('cmdPalette');
    if (bd) bd.classList.remove('open');
  }

  document.addEventListener('keydown', e => {
    const bd = document.getElementById('cmdPalette');
    if (e.key === 'Escape' && bd && bd.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      closeCmdPalette();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
      e.preventDefault();
      if (bd && bd.classList.contains('open')) closeCmdPalette();
      else openCmdPalette();
    }
  }, true);

  /* ---------- Tool 1: Product Side-by-Side Comparator ---------- */
  let CMP_IDS = ['wc', 'faalan', 'hamdeli'];

  function openProdCompare(preset) {
    if (Array.isArray(preset) && preset.length >= 2) CMP_IDS = preset.slice(0, 4);
    const activePlans = P.filter(x => !x.expired);
    if (!CMP_IDS.length && activePlans.length >= 2) {
      CMP_IDS = activePlans.slice(0, 3).map(x => x.id);
    }
    const optsHtml = selId => `<option value="">— انتخاب نشود —</option>` + P.map(p => `<option value="${p.id}" ${p.id === selId ? 'selected' : ''}>${p.t}${p.expired ? ' (منقضی)' : ''}</option>`).join('');

    const html = `
      <div class="card thead">
        <span class="pic" style="background:#0E7490">${ICON('compare', 21)}</span>
        <div class="grow">
          <b>مقایسه هم‌زمان طرح‌ها و محصولات اعتباری</b>
          <small>مقایسه ۲ تا ۴ طرح بانکی در کنار هم از نظر شرایط، وثایق، مرجع تصویب و مدارک</small>
        </div>
      </div>
      <div class="cmp-pickers">
        ${[0, 1, 2, 3].map(i => `
          <div class="cmp-slot">
            <label>طرح ${fa(i + 1)}${i < 2 ? ' (الزامی)' : ' (اختیاری)'}</label>
            <select class="inp" id="cmp_p${i}" onchange="window.__renderProdCompareTable()">
              ${optsHtml(CMP_IDS[i] || '')}
            </select>
          </div>
        `).join('')}
      </div>
      <div id="cmpOut"></div>`;
    $('#toolBody').innerHTML = html;
    show('tool', true, 'مقایسه هم‌زمان طرح‌ها');
    renderProdCompareTable();
  }

  function renderProdCompareTable() {
    const ids = [0, 1, 2, 3].map(i => ($('#cmp_p' + i) || {}).value).filter(Boolean);
    const uniq = [...new Set(ids)];
    CMP_IDS = uniq;
    const plans = uniq.map(id => P.find(p => p.id === id)).filter(Boolean);
    const out = $('#cmpOut');
    if (!out) return;
    if (plans.length < 2) {
      out.innerHTML = '<div class="empty">لطفاً حداقل ۲ طرح مختلف را برای مقایسه انتخاب کنید.</div>';
      return;
    }
    const catLabel = c => (typeof CATS !== 'undefined' && (CATS.find(x => x[0] === c) || ['', ''])[1]) || c;
    const rows = [
      ['وضعیت طرح', p => p.expired ? `<span class="st bad">منقضی</span><br><small>${p.expWhy || ''}</small>` : '<span class="st ok">فعال و قابل پیشنهاد</span>'],
      ['معرفی کوتاه', p => p.s || '—'],
      ['دسته‌بندی', p => `<div class="tags">${(p.cats || []).map(c => `<span class="tag">${catLabel(c)}</span>`).join('')}</div>`],
      ['مستند / بخشنامه', p => p.src || '—'],
      ['شرایط و ضوابط کلیدی', p => `<ol class="cmp-ul">${(p.cond || []).map(c => `<li>${c}</li>`).join('')}</ol>`],
      ['وثایق و تضامین', p => `<ul class="cmp-ul">${(p.coll || []).map(c => `<li>${c}</li>`).join('')}</ul>`],
      ['مرجع تصویب', p => p.auth || '—'],
      ['مدارک مورد نیاز', p => `<ul class="cmp-ul">${(p.docs || []).map(d => `<li>${d}</li>`).join('')}</ul>`],
      ['عملیات', p => `<button class="btn ghost sm" onclick="openProduct('${p.id}')">شناسنامه کامل ‹</button>`]
    ];

    out.innerHTML = `
      <div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead>
            <tr>
              <th>شاخص مقایسه</th>
              ${plans.map(p => `<th><div style="display:flex;align-items:center;gap:7px"><span class="pic" style="width:28px;height:28px;border-radius:8px;background:${p.col}">${ICON(p.ic, 15)}</span><span>${p.t}</span></div></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(([label, fn]) => `<tr><td>${label}</td>${plans.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost" onclick="window.__copyProdCompare()">${ICON('copy', 16)} کپی خلاصه مقایسه</button>
        <button class="btn ghost" onclick="window.print()">${ICON('print', 16)} چاپ مقایسه</button>
      </div>`;
  }

  window.__renderProdCompareTable = renderProdCompareTable;
  window.__copyProdCompare = function () {
    const plans = CMP_IDS.map(id => P.find(p => p.id === id)).filter(Boolean);
    if (plans.length < 2) return;
    const txt = 'مقایسه طرح‌های اعتباری بانک شهر:\n\n' + plans.map((p, i) =>
      `${fa(i + 1)}) ${p.t} (${p.src || '—'})\n• ${p.s}\n• مرجع تصویب: ${p.auth}\n• وثایق: ${(p.coll || []).join(' | ')}`
    ).join('\n\n');
    nativeCopy(txt);
  };

  /* ---------- Tool 2: DSCR & Repayment Capacity Calculator ---------- */
  function dscrFormHtml() {
    return `
      <div class="fl">جریان نقدی یا سود عملیاتی سالانه قابل اتکا</div>
      <div class="inwrap"><input class="inp" id="ds_cf" inputmode="decimal" value="۱۲۰" oninput="calcTool()"><span class="unit">میلیارد ریال</span></div>
      <div class="fl">اقساط ماهانه فعلی در سایر بانک‌ها / تعهدات جاری</div>
      <div class="inwrap"><input class="inp" id="ds_ex" inputmode="decimal" value="۳" oninput="calcTool()"><span class="unit">میلیارد ریال</span></div>
      <div class="fl">مبلغ تسهیلات جدید درخواستی</div>
      <div class="inwrap"><input class="inp" id="ds_amt" inputmode="decimal" value="۸۰" oninput="calcTool()"><span class="unit">میلیارد ریال</span></div>
      <div class="row">
        <div>
          <div class="fl">نرخ سود سالانه</div>
          <div class="inwrap"><input class="inp" id="ds_rate" inputmode="decimal" value="${fa(typeof pv === 'function' ? pv('maxRate') : 23)}" oninput="calcTool()"><span class="unit">درصد</span></div>
        </div>
        <div>
          <div class="fl">مدت بازپرداخت</div>
          <div class="inwrap"><input class="inp" id="ds_mon" inputmode="numeric" value="۳۶" oninput="calcTool()"><span class="unit">ماه</span></div>
        </div>
      </div>
      <div class="fl">روش بازپرداخت</div>
      <select class="inp" id="ds_mode" onchange="calcTool()">
        <option value="m">اقساط ماهانه مساوی</option>
        <option value="p3">اقساط فصلی (سه‌ماهه)</option>
        <option value="p6">اقساط شش‌ماهه</option>
        <option value="bul">یکجا در سررسید</option>
      </select>`;
  }

  function renderDSCRResult() {
    const cf = pnum(($('#ds_cf') || {}).value) || 0;
    const ex = pnum(($('#ds_ex') || {}).value) || 0;
    const amt = pnum(($('#ds_amt') || {}).value) || 0;
    const rate = pnum(($('#ds_rate') || {}).value);
    const mon = pnum(($('#ds_mon') || {}).value) || 36;
    const mode = ($('#ds_mode') || {}).value || 'm';

    if (!cf && !amt) {
      return '<div class="res empty-r"><small>مقادیر جریان نقدی و مبلغ تسهیلات را وارد کنید.</small></div>';
    }

    const m = calcDSCRMetrics({
      annualCashflow: cf,
      existingMonthly: ex,
      loanAmount: amt,
      rate: rate != null ? rate : 23,
      months: mon,
      mode
    });

    const dscrDisplay = m.dscr >= 99 ? '∞' : num(m.dscr, 2);
    const stressDisplay = m.dscrStressed >= 99 ? '∞' : num(m.dscrStressed, 2);
    const pctBar = Math.min(100, Math.max(4, (Math.min(m.dscr, 2.5) / 2.5) * 100));
    const barCol = m.status === 'ok' ? '#1E8A5A' : m.status === 'warn' ? '#D97706' : '#DC2626';

    const maxV = Math.max(m.monthlyCashflow, m.totalMonthlyDebt, 1);
    const wCash = Math.round((m.monthlyCashflow / maxV) * 100);
    const wEx = Math.round((m.existingMonthly / maxV) * 100);
    const wNew = Math.round((m.newMonthlyEq / maxV) * 100);

    return `
      <div class="res">
        <small>نسبت پوشش بدهی (DSCR)</small>
        <div class="big">${dscrDisplay} <span class="dscr-pill ${m.status}">${m.label}</span></div>
        <small>تست استرس (+۳٪ افزایش نرخ سود): <b>${stressDisplay}</b> | آستانه مطلوب بانکی: <b>۱٫۲۵</b></small>
        <div class="dscr-meter"><i style="width:${pctBar}%;background:${barCol}"></i></div>
        <div class="mini">
          <div><span>معادل قسط ماهانه تسهیلات جدید</span><b>${bn(m.newMonthlyEq)}</b></div>
          <div><span>کل اقساط ماهانه (فعلی + جدید)</span><b>${bn(m.totalMonthlyDebt)}</b></div>
          <div><span>جریان نقدی ماهانه قابل اتکا</span><b>${bn(m.monthlyCashflow)}</b></div>
          <div><span>حداکثر تسهیلات متناسب (با DSCR=۱٫۲۵)</span><b>${bn(m.maxSustainableLoan)}</b></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><span class="bar"></span>مقایسه جریان نقد ماهانه با تعهدات</div>
        <div class="hbars">
          <div>
            <div class="hb-h"><span class="hb-dot" style="background:#1E8A5A"></span><b>توان نقدی ماهانه مشتری</b><em>${bn(m.monthlyCashflow)}</em></div>
            <div class="hb-track"><i class="hb-val" style="width:${wCash}%;background:#1E8A5A"></i></div>
          </div>
          <div>
            <div class="hb-h"><span class="hb-dot" style="background:#C9A24B"></span><b>اقساط جاری فعلی</b><em>${bn(m.existingMonthly)}</em></div>
            <div class="hb-track"><i class="hb-val" style="width:${wEx}%;background:#C9A24B"></i></div>
          </div>
          <div>
            <div class="hb-h"><span class="hb-dot" style="background:#A50F1E"></span><b>معادل قسط ماهانه تسهیلات جدید</b><em>${bn(m.newMonthlyEq)}</em></div>
            <div class="hb-track"><i class="hb-val" style="width:${wNew}%;background:#A50F1E"></i></div>
          </div>
        </div>
        <div class="fine" style="margin-top:10px">
          جمع بازپرداخت تسهیلات جدید: <b>${bn(m.newTotalPayback)}</b> (سود کل: <b>${bn(m.newTotalProfit)}</b>).
          ${m.dscr < 1.25 && m.maxSustainableLoan > 0 ? `برای رسیدن به DSCR مطلوب ۱٫۲۵ با همین دوره و نرخ، سقف پیشنهادی <b>${bn(m.maxSustainableLoan)}</b> است.` : ''}
        </div>
      </div>`;
  }

  /* ---------- Register New Tools & Hook openTool / calcTool ---------- */
  function registerNewTools() {
    if (typeof TOOLS === 'undefined') return;
    if (!TOOLS.some(t => t.id === 'prod_compare')) {
      TOOLS.splice(2, 0, {
        id: 'prod_compare',
        t: 'مقایسه هم‌زمان طرح‌های اعتباری',
        d: 'مقایسه ۲ تا ۴ طرح بانکی کنار هم (شرایط، سقف‌ها، وثایق، مرجع تصویب و مدارک)',
        ic: 'compare',
        col: '#0E7490'
      });
    }
    if (!TOOLS.some(t => t.id === 'dscr')) {
      TOOLS.push({
        id: 'dscr',
        t: 'ارزیابی توان بازپرداخت (DSCR)',
        d: 'محاسبه نسبت پوشش بدهی، تست استرس نرخ سود و سقف واقعی تسهیلات قابل تحمل',
        ic: 'chart',
        col: '#1E8A5A'
      });
    }

    const origOpenTool = window.openTool;
    window.openTool = function (id) {
      if (id === 'prod_compare') { TOOL = 'prod_compare'; openProdCompare(); return; }
      if (id === 'dscr') {
        TOOL = 'dscr';
        const t = TOOLS.find(x => x.id === 'dscr');
        $('#toolBody').innerHTML = `<div class="card thead"><span class="pic" style="background:${t.col}">${ICON(t.ic, 21)}</span><div class="grow"><b>${t.t}</b><small>${t.d}</small></div></div><div id="toolOut"></div><div class="card">${dscrFormHtml()}</div>`;
        show('tool', true, t.t);
        calcTool();
        return;
      }
      return origOpenTool.apply(this, arguments);
    };

    const origCalcTool = window.calcTool;
    window.calcTool = function () {
      if (TOOL === 'dscr') {
        const out = $('#toolOut');
        if (out) out.innerHTML = renderDSCRResult();
        return;
      }
      return origCalcTool.apply(this, arguments);
    };
  }

  /* ---------- Enhance Catalog with Compare Button ---------- */
  function hookCatalog() {
    if (typeof window.renderCatalog !== 'function') return;
    const origRenderCatalog = window.renderCatalog;
    window.renderCatalog = function () {
      origRenderCatalog.apply(this, arguments);
      const sec = document.getElementById('v-catalog');
      if (sec && !document.getElementById('catCmpBtn')) {
        const sh = sec.querySelector('.sh');
        if (sh) {
          const btn = document.createElement('button');
          btn.id = 'catCmpBtn';
          btn.type = 'button';
          btn.className = 'btn ghost sm';
          btn.innerHTML = (typeof ICON === 'function' ? ICON('compare', 15) : '') + ' مقایسه طرح‌ها';
          btn.onclick = () => openTool('prod_compare');
          sh.appendChild(btn);
        }
      }
    };
  }

  /* ---------- Enhance Cases Archive (Search, Filter, CSV Export, Full Backup) ---------- */
  let CASE_Q = '';
  let CASE_F = 'all';

  function ensureCasesToolbar() {
    const view = document.getElementById('v-cases');
    if (!view || document.getElementById('casesBar')) return;
    const bar = document.createElement('div');
    bar.id = 'casesBar';
    bar.className = 'cases-bar';
    bar.innerHTML = `
      <div class="cases-bar-row">
        <div class="search">
          ${typeof ICON === 'function' ? ICON('search', 18) : ''}
          <input id="caseSearchInp" placeholder="جستجو در نام متقاضی، شماره گزارش یا طرح پیشنهادی..." oninput="window.__onCaseFilter()">
        </div>
        <div class="cases-actions">
          <button type="button" class="btn ghost" onclick="window.__exportCasesCSV()">${typeof ICON === 'function' ? ICON('download', 15) : ''} خروجی اکسل (CSV)</button>
          <button type="button" class="btn ghost" onclick="window.__exportFullBackup()">${typeof ICON === 'function' ? ICON('save', 15) : ''} پشتیبان کامل</button>
        </div>
      </div>
      <div class="cases-bar-row" style="justify-content:space-between">
        <div class="chips" id="caseFilterChips">
          <span class="chip on" data-f="all">همه</span>
          <span class="chip" data-f="legal">اشخاص حقوقی</span>
          <span class="chip" data-f="real">اشخاص حقیقی</span>
          <span class="chip" data-f="big">مبالغ ۵۰ میلیارد به بالا</span>
        </div>
        <span id="caseCountMeta" style="font-size:11.5px;color:var(--ink3)"></span>
      </div>`;
    const listEl = document.getElementById('casesList');
    view.insertBefore(bar, listEl);
    bar.querySelectorAll('#caseFilterChips .chip').forEach(ch => {
      ch.onclick = () => {
        CASE_F = ch.dataset.f;
        bar.querySelectorAll('#caseFilterChips .chip').forEach(x => x.classList.toggle('on', x === ch));
        renderCases();
      };
    });
  }

  window.__onCaseFilter = function () {
    CASE_Q = ($('#caseSearchInp') || {}).value || '';
    renderCases();
  };

  window.__exportCasesCSV = function () {
    const cases = store.get('sca_cases', []);
    if (!cases.length) { toast('گزارشی برای خروجی در بایگانی نیست'); return; }
    const csv = casesToCSV(cases, {
      fmtDate: d => shamsi(new Date(d)),
      fmtNum: v => String(v),
      sectorMap: typeof sectorTxt !== 'undefined' ? sectorTxt : {},
      personaMap: typeof personaTxt !== 'undefined' ? personaTxt : {}
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shahr-cases-' + toEn(todayS()).replace(/\D/g, '') + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('فایل CSV بایگانی دانلود شد ✓');
  };

  function hookCases() {
    if (typeof window.renderCases !== 'function') return;
    window.renderCases = function () {
      ensureCasesToolbar();
      const allCases = store.get('sca_cases', []);
      const q = normSearchText(CASE_Q);
      const filtered = allCases.filter(c => {
        const p = c.p || {};
        if (CASE_F === 'legal' && p.ptype !== 'legal') return false;
        if (CASE_F === 'real' && p.ptype !== 'real') return false;
        if (CASE_F === 'big' && (+c.amount || 0) < 50) return false;
        if (!q) return true;
        return normSearchText((c.cust || '') + ' ' + (c.title || '') + ' ' + (c.no || '') + ' ' + (c.top || '')).includes(q);
      });

      const meta = document.getElementById('caseCountMeta');
      if (meta) meta.textContent = `نمایش ${fa(filtered.length)} از ${fa(allCases.length)} گزارش`;

      if (!allCases.length) {
        $('#casesList').innerHTML = `<div class="empty">${ICON('save', 34, 1.4)}<b>بایگانی خالی است</b><small>پس از تهیه گزارش، از نوار پایین گزینه «بایگانی» را انتخاب کنید.</small></div>`;
        return;
      }
      if (!filtered.length) {
        $('#casesList').innerHTML = '<div class="empty">گزارشی مطابق جستجو یا فیلتر انتخابی یافت نشد.</div>';
        return;
      }
      $('#casesList').innerHTML = filtered.map(c => `
        <div class="prow">
          <span class="pic" style="background:#374151">${ICON('doc', 20)}</span>
          <div class="grow" onclick="loadCase(${c.id})">
            <b>${c.cust || c.title}</b>
            <small>شماره ${fa(c.no)}، ${shamsi(new Date(c.date))}، ${c.amount ? bn(c.amount) : '—'}</small>
            <small class="g">پیشنهاد: ${c.top || '—'}</small>
          </div>
          <button class="ib" onclick="delCase(${c.id})" aria-label="حذف">${ICON('trash', 17)}</button>
        </div>`).join('');
    };
  }

  /* ---------- Full System Backup / Restore in Profile ---------- */
  function collectAllScaKeys() {
    const keys = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sca_')) {
          keys[k] = localStorage.getItem(k);
        }
      }
    } catch (e) {}
    return keys;
  }

  window.__exportFullBackup = function () {
    const keys = collectAllScaKeys();
    const payload = {
      app: 'shahr-credit-advisor',
      type: 'full-backup',
      version: '3.9',
      exportedAt: new Date().toISOString(),
      keys
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shahr-full-backup-' + toEn(todayS()).replace(/\D/g, '') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('پشتیبان کامل سامانه دانلود شد ✓');
  };

  window.__importFullBackup = function (replaceMode) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const res = validateBackupBundle(txt);
        if (!res.ok) { toast(res.error); return; }
        if (replaceMode) {
          if (!confirm(`آیا همه داده‌های فعلی جایگزین و ${fa(res.count)} کلید از فایل پشتیبان بازیابی شود؟`)) return;
          Object.keys(collectAllScaKeys()).forEach(k => localStorage.removeItem(k));
        }
        Object.entries(res.keys).forEach(([k, v]) => {
          localStorage.setItem(k, v);
        });
        toast('بازیابی کامل انجام شد؛ صفحه بازخوانی می‌شود…');
        setTimeout(() => location.reload(), 650);
      } catch (err) {
        toast('خطا در خواندن فایل پشتیبان');
      }
    };
    inp.click();
  };

  function hookProfile() {
    if (typeof window.renderProfile !== 'function') return;
    const origRenderProfile = window.renderProfile;
    window.renderProfile = function () {
      origRenderProfile.apply(this, arguments);
      const vp = document.getElementById('v-profile');
      if (!vp) return;
      let box = document.getElementById('profileEnhBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'profileEnhBox';
        vp.insertBefore(box, vp.lastElementChild);
      }
      const keys = collectAllScaKeys();
      const totalKB = Math.round(Object.values(keys).reduce((a, s) => a + (s ? s.length * 2 : 0), 0) / 1024);
      const casesCnt = (store.get('sca_cases', []) || []).length;
      const cmCnt = typeof cmList === 'function' ? cmList().length : 0;
      const curTheme = getTheme();

      box.innerHTML = `
        <div class="card">
          <div class="ch"><span class="bar"></span>ظاهر سامانه (حالت روشن / تاریک)</div>
          <div class="fl">پوسته نمایش</div>
          <select class="inp" id="pf_theme" onchange="window.__setThemeFromProfile(this.value)">
            <option value="light" ${curTheme === 'light' ? 'selected' : ''}>حالت روشن (استاندارد روز)</option>
            <option value="dark" ${curTheme === 'dark' ? 'selected' : ''}>حالت تاریک (راحتی چشم در محیط کم‌نور)</option>
          </select>
          <small class="hint">چاپ و خروجی PDF گزارش‌ها در هر دو حالت با پس‌زمینه سفید استاندارد انجام می‌شود.</small>
        </div>
        <div class="card">
          <div class="ch"><span class="bar"></span>پشتیبان‌گیری و انتقال یک‌جای داده‌ها</div>
          <p class="pp" style="font-size:12px;color:var(--ink2)">انتقال هم‌زمان پروفایل، گزارش‌های بایگانی، مقررات شخصی‌سازی‌شده، یادآورها و حافظه تحلیل مشتریان بین مرورگرها یا اجرای file:// و localhost:</p>
          <div class="bkp-stats">
            <div class="bkp-stat"><b>${fa(casesCnt)}</b><small>گزارش بایگانی</small></div>
            <div class="bkp-stat"><b>${fa(cmCnt)}</b><small>پرونده مشتری</small></div>
            <div class="bkp-stat"><b>${fa(Object.keys(keys).length)}</b><small>بخش ذخیره</small></div>
            <div class="bkp-stat"><b>${fa(totalKB)} KB</b><small>حجم حافظه</small></div>
          </div>
          <div class="row" style="margin-top:8px">
            <button type="button" class="btn pri" onclick="window.__exportFullBackup()">${ICON('download', 16)} دریافت پشتیبان کامل</button>
            <button type="button" class="btn ghost" onclick="window.__importFullBackup(true)">${ICON('upload', 16)} بازیابی از فایل</button>
          </div>
        </div>`;
    };
  }

  window.__setThemeFromProfile = function (val) {
    applyTheme(val);
    toast(val === 'dark' ? 'حالت تاریک فعال شد' : 'حالت روشن فعال شد');
  };

  /* ---------- Sidebar Update for New Tools ---------- */
  function enhanceSidebar() {
    const nav = document.querySelector('.nav');
    if (!nav || document.getElementById('sbSearchBtn')) return;
    const growthBtn = nav.querySelector('button[data-go="growth"]');
    if (growthBtn && growthBtn.parentNode === nav) {
      const mkBtn = (id, ic, label, fn) => {
        const b = document.createElement('button');
        b.id = id;
        b.className = 'pcx';
        b.innerHTML = (typeof ICON === 'function' ? ICON(ic, 19) : '') + '<span>' + label + '</span>';
        b.onclick = fn;
        return b;
      };
      const cmpBtn = mkBtn('sbCmpBtn', 'compare', 'مقایسه طرح‌ها', () => { HIST.length = 0; CUR = 'tools'; openTool('prod_compare'); });
      const dscrBtn = mkBtn('sbDscrBtn', 'chart', 'توان بازپرداخت (DSCR)', () => { HIST.length = 0; CUR = 'tools'; openTool('dscr'); });
      nav.insertBefore(cmpBtn, growthBtn.nextSibling);
      nav.insertBefore(dscrBtn, cmpBtn.nextSibling);

      const foot = nav.querySelector('.sb-foot');
      if (foot) {
        const ver = document.getElementById('sbVer');
        if (ver) ver.textContent = 'نسخه ۳٫۹ (ارتقاشده)';
      }
    }
  }

  /* ---------- Bootstrap ---------- */
  function boot() {
    addIcons();
    registerNewTools();
    hookCatalog();
    hookCases();
    hookProfile();
    setupAppBarAndScroll();
    enhanceSidebar();
    // بروزرسانی شمارنده نسخه در صفحه نخست / اسپلش
    const splashVer = document.querySelector('.splash .ver');
    if (splashVer) {
      splashVer.innerHTML = 'بانک شهر، مبتنی بر ضوابط و مقررات اعتباری ۱۴۰۵<br>نسخه ۳٫۹ (ارتقاشده)';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
