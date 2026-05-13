/* =====================================================
   DASHBOARD TRAEL — app.js
   Integração Supabase, Estado, Gráficos, Upload, Configurações
   ===================================================== */

// Configuração do Supabase
const SUPABASE_URL = 'https://nkfnavskpbljffihepfo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wm-PwAAMoMLGMF9WXpOOIA_exqCcxi1';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====================== AUTENTICAÇÃO E RBAC ======================
const USERS = {
  'admin.trael@trael.cto': { role: 'programador', pass: '183729', name: 'Programador (Admin)' },
  'gerencia@trael.com': { role: 'coordenador', pass: '123456', name: 'Coordenador (Gestão)' },
  'soma@trael.com': { role: 'alimentador', pass: '123456', name: 'Alimentador (Campo)' },
  'somavisual@trael.com': { role: 'visualizador', pass: '123456', name: 'Visualizador' }
};

let currentUser = null;

async function checkSession() {
  const sessionUser = localStorage.getItem('soma_session');
  if (sessionUser) {
    currentUser = JSON.parse(sessionUser);
    applyRBAC(currentUser.role);
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.remove('active');
    
    // Sync DB and set view
    try {
      await loadDataFromDB();
    } catch (e) {
      console.warn('Falha no sync inicial do DB:', e);
    }
  } else {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  // Attempt Supabase Auth first
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.user) {
      console.log('Autenticado via Supabase');
    }
  } catch(err) {
    console.warn('Auth Supabase offline, usando fallback local.');
  }

  // Fallback to local user mapping for prototype
  const user = USERS[email];
  if (user && user.pass === pass) {
    currentUser = { email, role: user.role, name: user.name };
    localStorage.setItem('soma_session', JSON.stringify(currentUser));
    if (errorEl) errorEl.textContent = '';
    applyRBAC(user.role);
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.remove('active');
    
    try {
      await loadDataFromDB();
    } catch(err) {}
  } else {
    if (errorEl) errorEl.textContent = 'Credenciais inválidas.';
  }
}

function handleLogout() {
  localStorage.removeItem('soma_session');
  sb.auth.signOut();
  location.reload();
}

function applyRBAC(role) {
  // Update Body classes for CSS logic
  document.body.className = document.body.className.replace(/role-\w+/g, '');
  document.body.classList.add(`role-${role}`);
  
  // Update Profile Panel
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  if (userNameEl && currentUser) userNameEl.textContent = currentUser.name.split(' ')[0];
  if (userRoleEl && currentUser) userRoleEl.textContent = currentUser.name;
}

// ====================== ESTADO ======================
const STATE = {
  config: {
    month: '',            // YYYY-MM
    metaTotal: 240,
    metaTPM: 80,
    metaTPD: 100,
    metaDistribMensal: 100, // Nova meta mensal para Distribuição
    metaTPS: 60,
    diasUteis: 20,
    diasTrabalhados: 10,
    progAcum: 120,
  },
  records: [],  // Each: { id, date, line, prog, real, desc, area, coreType, source }
  equipment: [],
  obs: [],
  charts: {
    distribQty: null,
    distribPct: null,
    forcaTPM: null,
    forcaTPS: null,
    gaugeForca: null
  },
  currentUploadArea: 'distrib'
};

// ====================== DADOS DE EXEMPLO (SEED) ======================
function seedSampleData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  STATE.config.month = `${year}-${month}`;

  // Generate 10 days of sample data
  const lines = ['TPM', 'TPD', 'TPS'];
  const progPerDay = [6, 4, 3, 5, 6, 4, 5, 6, 4, 5];
  const realPerDay = [5, 5, 3, 6, 7, 4, 4, 7, 5, 6];
  const tpmRatio = [0.35, 0.30, 0.40, 0.35, 0.40, 0.35, 0.30, 0.40, 0.35, 0.35];

  for (let d = 1; d <= 10; d++) {
    const date = `${year}-${month}-${String(d).padStart(2, '0')}`;
    const prog = progPerDay[d - 1] + Math.floor(Math.random() * 2);
    const real = realPerDay[d - 1] + Math.floor(Math.random() * 2);

    ['TPM', 'TPD', 'TPS'].forEach((line, li) => {
      const ratio = li === 0 ? tpmRatio[d-1] : li === 1 ? 0.40 : 0.25;
      STATE.records.push({
        id: Date.now() + Math.random(),
        date,
        line,
        prog: Math.round(prog * ratio) || 1,
        real: Math.round(real * ratio) || 1,
        desc: `Lote ${d}/${line}`,
        source: 'amostra',
      });
    });
  }
}

// ====================== PERSISTÊNCIA NO BANCO (SUPABASE) ======================

async function saveRecordsToDB(records) {
  try {
    // Para simplificar, deletamos registros do mês atual e reinserimos (ou fazemos upsert)
    // No entanto, o mais performático é sincronizar apenas novos/alterados.
    // Para este MVP, vamos inserir apenas o registro novo no ponto de criação.
    const { error } = await sb.from('production_records').upsert(records);
    if (error) throw error;
  } catch (err) {
    console.error('Erro ao salvar registros:', err);
  }
}

async function loadDataFromDB() {
  try {
    const currentMonth = STATE.config.month;
    const year = parseInt(currentMonth.split('-')[0]);
    const month = parseInt(currentMonth.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();

    // 1. Carregar Config/Metas do mês
    const { data: configData, error: configErr } = await sb
      .from('config_meta')
      .select('*')
      .eq('month', currentMonth)
      .maybeSingle();
    
    if (configData && !configErr) {
      STATE.config = {
        ...STATE.config,
        metaTotal: configData.meta_total,
        metaTPM: configData.meta_tpm,
        metaTPD: configData.meta_tpd,
        metaDistribMensal: configData.meta_distrib_mensal || 100,
        diasUteis: configData.dias_uteis,
        diasTrabalhados: configData.dias_trabalhados,
        progAcum: configData.prog_acumulado
      };
    }

    // 2. Carregar Registros do mês
    const { data: recordsData, error: recordsErr } = await sb
      .from('production_records')
      .select('*')
      .gte('date', `${currentMonth}-01`)
      .lte('date', `${currentMonth}-${lastDay}`);
    
    if (recordsData) {
      const rawRecords = recordsData.map(r => ({
        id: r.id,
        date: r.date,
        line: r.line,
        prog: r.prog,
        real: r.real,
        desc: r.description, // Mapeia description para desc
        area: r.area,        // Vital para filtragem
        coreType: r.core_type === 'JC-TRI' ? 'JC' : r.core_type, // Corrige legados JC-TRIF
        source: r.origin
      }));

      // Remove duplicatas exatas para que o Dashboard não some os mesmos valores várias vezes
      const uniqueMap = new Map();
      rawRecords.forEach(r => {
        // Chave única: data + linha + area + desc + prog + real
        const key = `${r.date}|${r.line}|${r.area}|${r.desc}|${r.prog}|${r.real}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, r);
        }
      });
      
      STATE.records = Array.from(uniqueMap.values());
    }

    // 3. Carregar Equipamentos
    const { data: equipData, error: equipErr } = await sb
      .from('equipment_status')
      .select('*');
    if (equipData) {
      STATE.equipment = equipData.map(e => ({
        id: e.id,
        name: e.name,
        status: e.status
      }));
    }

    showPage('distribuicao');
  } catch (err) {
    console.warn('Erro ao carregar do Supabase, usando localStorage/amostra', err);
    loadFromStorage();
  }
}

// Manter localStorage como redundância/cache
function saveToStorage() {
  localStorage.setItem('trael_config',    JSON.stringify(STATE.config));
  localStorage.setItem('trael_records',   JSON.stringify(STATE.records));
  localStorage.setItem('trael_equipment', JSON.stringify(STATE.equipment));
  localStorage.setItem('trael_obs',       JSON.stringify(STATE.obs));
}

function loadFromStorage() {
  try {
    const cfg = localStorage.getItem('trael_config');
    if (cfg) STATE.config = { ...STATE.config, ...JSON.parse(cfg) };
    const rec = localStorage.getItem('trael_records');
    if (rec) STATE.records = JSON.parse(rec);
    const eq = localStorage.getItem('trael_equipment');
    if (eq) STATE.equipment = JSON.parse(eq);
    const obs = localStorage.getItem('trael_obs');
    if (obs) STATE.obs = JSON.parse(obs);
  } catch (e) {
    console.warn('Storage load error', e);
  }
}

// ====================== NAVEGAÇÃO DE PÁGINAS ======================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById(`page-${page}`);
  const navBtn = document.querySelector(`[data-page="${page}"]`);
  
  if (targetPage) targetPage.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  try {
    if (page === 'distribuicao') renderDashboardDistrib();
    if (page === 'forca-seco')   renderDashboardForca();
    if (page === 'settings')     renderSettingsPage();
    if (page === 'upload')       { renderDataTable(); initializeManualEntries(); }
  } catch (err) {
    console.warn(`Erro ao renderizar página ${page}:`, err);
  }
}

function switchUploadTab(area) {
  STATE.currentUploadArea = area;
  document.querySelectorAll('.upload-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.upload-tab-content').forEach(c => c.classList.remove('active'));
  
  const targetId = area === 'distrib' ? 'tabBtnDistrib' : 'tabBtnForca';
  const contentId = area === 'distrib' ? 'uploadTabDistrib' : 'uploadTabForca';
  
  document.getElementById(targetId).classList.add('active');
  document.getElementById(contentId).classList.add('active');
}

// ====================== AUXILIARES DE DATA ======================
function getMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(m, 10) - 1]}/${y}`;
}

function todayStr() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
}

function todayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  setText('distribDate', dateStr);
  setText('forcaDate', dateStr);
  
  const mLabel = getMonthLabel(STATE.config.month) || `${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  setText('distribMonth', mLabel);
  setText('forcaMonth', mLabel);
  
  setText('footerTimeDistrib', `Última atualização: ${dateStr} ${timeStr}`);
  setText('footerTimeForca', `Última atualização: ${dateStr} ${timeStr}`);
}

// ====================== DETECÇÃO DE TIPO DE NÚCLEO ======================
function detectCoreType(desc) {
  if (!desc) return 'EMP';
  const d = desc.toUpperCase();
  if (d.includes('ENR') || d.includes('ENROLADINHO')) return 'ENR';
  if (d.includes('JC') || d.includes('JEANCOR') || d.includes('TRI')) return 'JC';
  if (d.includes('LAB') || d.includes('REPROV')) return 'LAB';
  return 'EMP'; // Padrão convencional
}

// ====================== MÉTRICAS CALCULADAS: DISTRIBUIÇÃO (BI) ======================
function computeDistribMetrics() {
  const cfg = STATE.config;
  const currentMonthPrefix = cfg.month;
  const monthRecords = STATE.records.filter(r => r.date && r.date.startsWith(currentMonthPrefix) && r.area === 'distrib');

  const daysInMonth = new Date(
    parseInt(currentMonthPrefix.split('-')[0]),
    parseInt(currentMonthPrefix.split('-')[1]),
    0
  ).getDate();

  const dailyByCore = {}; // { core: [val, val, val...] }
  const cores = ['ENR', 'JC', 'EMP', 'LAB'];
  cores.forEach(c => dailyByCore[c] = new Array(daysInMonth).fill(0));

  monthRecords.forEach(r => {
    const day = parseInt(r.date.split('-')[2]);
    const type = r.coreType || detectCoreType(r.desc);
    if (dailyByCore[type]) dailyByCore[type][day - 1] += (Number(r.real) || 0);
  });

  // Médias Diárias (Total / Dias Trabalhados)
  const dt = cfg.diasTrabalhados || 1;
  const totals = {};
  cores.forEach(c => totals[c] = dailyByCore[c].reduce((s,v) => s+v, 0));
  
  const medias = {
    ENR: totals.ENR / dt,
    JC:  totals.JC / dt,
    EMP: totals.EMP / dt,
    LAB: totals.LAB, // Total de reprovados no mês não é média
    Total: (totals.ENR + totals.JC + totals.EMP) / dt
  };

  // Tendência
  const totalReal = totals.ENR + totals.JC + totals.EMP;
  const tendencia = (totalReal / dt) * (cfg.diasUteis || dt);

  return { dailyByCore, totals, medias, totalReal, tendencia, daysInMonth };
}

// ====================== MÉTRICAS CALCULADAS: MÉDIA FORÇA / SECO ======================
function computeForcaMetrics() {
  const cfg = STATE.config;
  const monthPrefix = cfg.month;
  const monthRecords = STATE.records.filter(r => r.date && r.date.startsWith(monthPrefix) && r.area === 'forca');

  const daily = { TPM: [], TPS: [], TPD: [], Total: [] };
  const daysInMonth = 31; // Simplificado

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    const dayRecs = monthRecords.filter(r => r.date === dateKey);
    
    const tpm = dayRecs.filter(r => r.line === 'TPM').reduce((s,r) => s+(Number(r.real)||0), 0);
    const tps = dayRecs.filter(r => r.line === 'TPS').reduce((s,r) => s+(Number(r.real)||0), 0);
    const tpd = dayRecs.filter(r => r.line === 'TPD').reduce((s,r) => s+(Number(r.real)||0), 0);
    
    daily.TPM.push(tpm); daily.TPS.push(tps); daily.TPD.push(tpd);
    daily.Total.push(tpm + tps + tpd);
  }

  const totals = {
    TPM: daily.TPM.reduce((s,v)=>s+v, 0),
    TPS: daily.TPS.reduce((s,v)=>s+v, 0),
    TPD: daily.TPD.reduce((s,v)=>s+v, 0),
    Total: daily.Total.reduce((s,v)=>s+v, 0)
  };

  const pct = cfg.metaTotal > 0 ? (totals.Total / cfg.metaTotal) * 100 : 0;
  const dt = cfg.diasTrabalhados || 1;
  const tendencia = (totals.Total / dt) * (cfg.diasUteis || 1);

  return { daily, totals, pct, tendencia, daysInMonth };
}

// ====================== MOTOR DE RELATÓRIO PADRONIZADO (REGRA 4) ======================
function generateExecutiveReport(area, m) {
  const cfg = STATE.config;
  const isHealthy = m.tendencia >= cfg.metaTotal;
  const alertIcon = isHealthy ? '✅' : '🚨';
  const statusTab = isHealthy ? '✅' : '🚨';
  const tone = isHealthy ? 'Foco mantido' : 'ALERTA: CRITICAL GAP DETECTED';

  const summary = `Produção atual de ${m.totalReal || m.totals.Total} unidades. Projeção de fechamento em **${Math.round(m.tendencia)}** unidades (${((m.tendencia/cfg.metaTotal)*100).toFixed(1)}% da meta).`;

  let html = `
    <div class="report-exec-summary">${alertIcon} <strong>${tone}</strong>: ${summary}</div>
    <table class="report-table-mini">
      <thead>
        <tr><th>Indicador</th><th>Realizado</th><th>Meta Mensal</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Total Geral</td>
          <td><strong>${m.totalReal || m.totals.Total}</strong></td>
          <td>${cfg.metaTotal}</td>
          <td>${statusTab}</td>
        </tr>
      </tbody>
    </table>
    <div class="report-grid">
      <div>
        <strong>📈 Ganhos e Observações:</strong>
        <ul class="report-bullets">
          <li><em>${STATE.obs[0] || 'Produção segue conforme planejado.'}</em></li>
          <li><em>${STATE.obs[1] || 'Monitoramento de insumos ativo.'}</em></li>
        </ul>
      </div>
      <div>
        <strong>⚠️ Alertas e Sugestões:</strong>
        <ul class="report-bullets">
          <li>Desvio projetado: <strong>${Math.round(cfg.metaTotal - m.tendencia)} unidades</strong>.</li>
          <li>Sugestão: <em>${STATE.obs[2] || 'Aumentar produtividade no próximo turno.'}</em></li>
        </ul>
      </div>
    </div>
  `;
  return html;
}

// ====================== RENDERIZAR DASHBOARD: DISTRIBUIÇÃO (TPD) ======================
function renderDashboardDistrib() {
  const m = computeDistribMetrics();
  const cfg = STATE.config;

  // Header & KPIs
  setText('kpiEnrMedia', m.medias.ENR.toFixed(1));
  setText('kpiJcMedia',  m.medias.JC.toFixed(1));
  setText('kpiEmpMedia', m.medias.EMP.toFixed(1));
  setText('kpiTotalMedia', m.medias.Total.toFixed(1));
  setText('kpiDistribReject', m.totals.LAB);
  setText('kpiDistribMetaMensal', cfg.metaDistribMensal);

  // Charts
  renderDistribCharts(m);
  
  // BI Table
  renderBITable(m);
  
  // Report
  const reportEl = document.getElementById('reportDistrib');
  if (reportEl) reportEl.innerHTML = generateExecutiveReport('distrib', m);
}

// ====================== RENDERIZAR DASHBOARD: MÉDIA FORÇA / SECO ======================
function renderDashboardForca() {
  const m = computeForcaMetrics();
  const cfg = STATE.config;

  setText('forcaPct', Math.round(m.pct) + '%');

  renderForcaCharts(m);
  
  // Rule 3: Separated Indicators
  const grid = document.getElementById('forcaLinesGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="line-card">
         <div class="line-header"><div class="line-badge line-badge-tpm">TPM</div><span class="line-name">Média Força</span></div>
         <div class="line-kpis">
           <div class="line-kpi"><span class="lk-label">Prog.</span><span class="lk-val">${cfg.metaTPM}</span></div>
           <div class="line-kpi"><span class="lk-label">Real.</span><span class="lk-val lk-green">${m.totals.TPM}</span></div>
         </div>
      </div>
      <div class="line-card">
         <div class="line-header"><div class="line-badge line-badge-tps">TPS</div><span class="line-name">Seco</span></div>
         <div class="line-kpis">
           <div class="line-kpi"><span class="lk-label">Prog.</span><span class="lk-val">${cfg.metaTPS}</span></div>
           <div class="line-kpi"><span class="lk-label">Real.</span><span class="lk-val lk-green">${m.totals.TPS}</span></div>
         </div>
      </div>
    `;
  }

  const reportEl = document.getElementById('reportForcaSeco');
  if (reportEl) reportEl.innerHTML = generateExecutiveReport('forca', m);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ====================== TABELA DE GRADE BI ======================
function renderBITable(m) {
  const container = document.getElementById('distribTableContainer');
  if (!container) return;

  const days = m.daysInMonth;
  let html = `<table class="bi-table"><thead><tr><th class="bi-col-fixed">NÚCLEO</th>`;
  for(let d=1; d<=days; d++) html += `<th>${d}</th>`;
  html += `<th class="bi-avg-col">MÉDIA</th></tr></thead><tbody>`;

  const cores = [
    {id:'ENR', label:'ENR'},
    {id:'JC',  label:'JC-TRI'},
    {id:'EMP', label:'EMP'},
    {id:'LAB', label:'LAB'}
  ];

  cores.forEach(c => {
    html += `<tr><td class="bi-col-fixed">${c.label}</td>`;
    for(let d=0; d<days; d++) {
      const val = m.dailyByCore[c.id][d];
      html += `<td>${val || ''}</td>`;
    }
    const mediaVal = c.id === 'LAB' ? m.totals[c.id] : m.medias[c.id].toFixed(1);
    html += `<td class="bi-avg-col">${mediaVal}</td></tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function animateGauge(pct) {
  const path = document.getElementById('gaugePath');
  const pctEl = document.getElementById('gaugePct');
  const statusEl = document.getElementById('gaugeStatus');
  if (!path) return;

  const total = 157; // half-circle circumference aprox
  const offset = total - (total * pct / 100);

  path.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
  path.style.strokeDashoffset = offset;

  // Animate number
  let current = 0;
  const target = Math.round(pct);
  const step = target / 60;
  const ti = setInterval(() => {
    current = Math.min(current + step, target);
    if (pctEl) pctEl.textContent = Math.round(current) + '%';
    if (current >= target) clearInterval(ti);
  }, 16);

  // Status
  if (statusEl) {
    if (pct >= 80) {
      statusEl.textContent = '✅ No Prazo';
      statusEl.style.background = 'rgba(76,175,80,0.15)';
      statusEl.style.color = 'var(--success)';
    } else if (pct >= 50) {
      statusEl.textContent = '⚠️ Em Andamento';
      statusEl.style.background = 'rgba(255,167,38,0.15)';
      statusEl.style.color = 'var(--warning)';
    } else {
      statusEl.textContent = '🚨 Atenção Necessária';
      statusEl.style.background = 'rgba(239,83,80,0.15)';
      statusEl.style.color = 'var(--danger)';
    }
  }
}

function renderLines(byLine) {
  ['TPM', 'TPD', 'TPS'].forEach(line => {
    const lKey = line.toLowerCase();
    const data = byLine[line] || { prog: 0, real: 0 };
    const meta = STATE.config[`meta${line}`] || 1;
    const pct = Math.min((data.real / meta) * 100, 100);
    const varVal = data.real - data.prog;

    setText(`${lKey}Prog`, data.prog);
    setText(`${lKey}Real`, data.real);
    const varEl = document.getElementById(`${lKey}Var`);
    if (varEl) {
      varEl.textContent = (varVal >= 0 ? '+' : '') + varVal;
      varEl.style.color = varVal >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    const bar = document.getElementById(`${lKey}Bar`);
    if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 300);

    setText(`${lKey}Pct`, pct.toFixed(1) + '%');

    const statusEl = document.getElementById(`${lKey}Status`);
    if (statusEl) {
      if (data.real >= meta)   statusEl.textContent = '✅';
      else if (pct >= 50)      statusEl.textContent = '⚠️';
      else                     statusEl.textContent = '🚨';
    }
  });
}

// ====================== GRÁFICOS: DISTRIBUIÇÃO ======================
function renderDistribCharts(m) {
  const ctxQty = document.getElementById('chartDistribQty');
  const ctxPct = document.getElementById('chartDistribPct');
  if (!ctxQty || !ctxPct) return;

  const labels = Array.from({length: m.daysInMonth}, (_, i) => i + 1);

  if (STATE.charts.distribQty) STATE.charts.distribQty.destroy();
  if (STATE.charts.distribPct) STATE.charts.distribPct.destroy();

  // Qty Stacked Chart
  STATE.charts.distribQty = new Chart(ctxQty, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'ENR', data: m.dailyByCore.ENR, backgroundColor: '#9CCC65', stack: 'stack0' },
        { label: 'JC-TRI', data: m.dailyByCore.JC, backgroundColor: '#26C6DA', stack: 'stack0' },
        { label: 'EMP', data: m.dailyByCore.EMP, backgroundColor: '#2E7D32', stack: 'stack0' },
        { label: 'LAB', data: m.dailyByCore.LAB, backgroundColor: '#D32F2F', stack: 'stack0' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { position: 'top', labels: { color: '#8B949E', boxWidth: 12 } } }
    }
  });

  // Pct Attainment Chart (Draft)
  STATE.charts.distribPct = new Chart(ctxPct, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% Atingimento',
        data: labels.map((_, i) => {
          const total = m.dailyByCore.ENR[i] + m.dailyByCore.JC[i] + m.dailyByCore.EMP[i];
          const metaDiaria = STATE.config.metaTPD / (STATE.config.diasUteis || 1);
          return (total / metaDiaria) * 100;
        }),
        backgroundColor: 'rgba(76,175,80,0.4)',
        borderColor: 'var(--green-400)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 150, grid: { color: 'rgba(255,255,255,0.05)' } } },
      plugins: {
        annotation: { // If plugin available
          annotations: { line1: { type: 'line', yMin: 100, yMax: 100, borderColor: '#D32F2F', borderWidth: 2 } }
        }
      }
    }
  });
}

// ====================== GRÁFICOS: MÉDIA FORÇA / SECO ======================
function renderForcaCharts(m) {
  const ctxTPM = document.getElementById('chartTPM');
  const ctxTPS = document.getElementById('chartTPS');
  if (!ctxTPM || !ctxTPS) return;

  if (STATE.charts.forcaTPM) STATE.charts.forcaTPM.destroy();
  if (STATE.charts.forcaTPS) STATE.charts.forcaTPS.destroy();

  const labels = Array.from({length: 31}, (_, i) => i + 1);

  // TPM Chart
  STATE.charts.forcaTPM = new Chart(ctxTPM, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { 
          label: 'Realizado TPM', 
          data: m.daily.TPM, 
          borderColor: '#4CAF50', 
          backgroundColor: 'rgba(76,175,80,0.1)', 
          fill: true, 
          tension: 0.4 
        },
        { 
          label: 'Meta Diária', 
          data: new Array(31).fill(STATE.config.metaTPM / (STATE.config.diasUteis || 1)), 
          borderColor: 'rgba(255,255,255,0.2)', 
          borderDash: [5,5], 
          pointRadius: 0 
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } },
      plugins: { legend: { labels: { color: '#8B949E' } } }
    }
  });

  // TPS Chart
  STATE.charts.forcaTPS = new Chart(ctxTPS, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { 
          label: 'Realizado TPS', 
          data: m.daily.TPS, 
          borderColor: '#2196F3', 
          backgroundColor: 'rgba(33,150,243,0.1)', 
          fill: true, 
          tension: 0.4 
        },
        { 
          label: 'Meta Diária', 
          data: new Array(31).fill(STATE.config.metaTPS / (STATE.config.diasUteis || 1)), 
          borderColor: 'rgba(255,255,255,0.2)', 
          borderDash: [5,5], 
          pointRadius: 0 
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } },
      plugins: { legend: { labels: { color: '#8B949E' } } }
    }
  });
}

// ====================== OBSERVAÇÕES ======================
function renderObs() {
  ['obs1Text','obs2Text','obs3Text'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = STATE.obs[i] || '';
  });
}

function toggleEditObs() {
  const display = document.getElementById('obsDisplay');
  const edit    = document.getElementById('obsEdit');
  const showing = display.style.display !== 'none';
  display.style.display = showing ? 'none' : 'block';
  edit.style.display    = showing ? 'block' : 'none';

  if (showing) {
    document.getElementById('obs1Input').value = STATE.obs[0] || '';
    document.getElementById('obs2Input').value = STATE.obs[1] || '';
    document.getElementById('obs3Input').value = STATE.obs[2] || '';
  }
}

function saveObs() {
  STATE.obs[0] = document.getElementById('obs1Input').value;
  STATE.obs[1] = document.getElementById('obs2Input').value;
  STATE.obs[2] = document.getElementById('obs3Input').value;
  saveToStorage();
  toggleEditObs();
  renderObs();
}

// ====================== EQUIPAMENTOS ======================
function renderEquipment() {
  const list = document.getElementById('equipmentList');
  if (!list) return;
  list.innerHTML = '';
  STATE.equipment.forEach(eq => {
    const labels = { green: '🟢 Operacional', yellow: '🟡 Manutenção Preventiva', red: '🔴 Parado / Crítico' };
    const item = document.createElement('div');
    item.className = 'equip-item';
    item.innerHTML = `
      <div class="equip-status-dot ${eq.status}"></div>
      <span class="equip-name">${eq.name}</span>
      <span class="equip-status-label ${eq.status}">${labels[eq.status] || eq.status}</span>
    `;
    list.appendChild(item);
  });
}

function renderEquipmentSettings() {
  const container = document.getElementById('equipmentSettings');
  if (!container) return;
  container.innerHTML = '';
  STATE.equipment.forEach((eq, idx) => {
    const row = document.createElement('div');
    row.className = 'equip-setting-row';
    row.innerHTML = `
      <input type="text" class="form-input" value="${eq.name}" onchange="updateEquipName(${idx}, this.value)" />
      <select class="form-input" onchange="updateEquipStatus(${idx}, this.value)">
        <option value="green"  ${eq.status==='green'  ? 'selected':''}>🟢 Operacional</option>
        <option value="yellow" ${eq.status==='yellow' ? 'selected':''}>🟡 Manutenção</option>
        <option value="red"    ${eq.status==='red'    ? 'selected':''}>🔴 Parado</option>
      </select>
      <button class="btn-del-equip" onclick="removeEquipment(${idx})">✕ Remover</button>
    `;
    container.appendChild(row);
  });
}

async function updateEquipName(idx, val) { 
  STATE.equipment[idx].name = val; 
  await saveEquipToDB(STATE.equipment[idx]);
}

async function updateEquipStatus(idx, val) { 
  STATE.equipment[idx].status = val; 
  await saveEquipToDB(STATE.equipment[idx]);
}

async function saveEquipToDB(eq) {
  try {
    const { error } = await sb.from('equipment_status').upsert({
      name: eq.name,
      status: eq.status
    });
    if (error) throw error;
  } catch (err) {
    console.error('Erro ao salvar equipamento:', err);
  }
}

async function removeEquipment(idx) {
  const eq = STATE.equipment[idx];
  if (!confirm(`Remover "${eq.name}" do banco de dados?`)) return;
  try {
    const { error } = await sb.from('equipment_status').delete().eq('name', eq.name);
    if (error) throw error;
    STATE.equipment.splice(idx, 1);
    renderEquipmentSettings();
    renderEquipment();
  } catch (err) {
    alert('Erro ao remover equipamento: ' + err.message);
  }
}

async function addEquipment() {
  const newEq = { name: 'Novo Equipamento ' + Date.now(), status: 'green' };
  try {
    const { data, error } = await sb.from('equipment_status').insert(newEq).select();
    if (error) throw error;
    STATE.equipment.push({ id: data[0].id, name: data[0].name, status: data[0].status });
    renderEquipmentSettings();
    renderEquipment();
  } catch (err) {
    alert('Erro ao adicionar equipamento: ' + err.message);
  }
}

// ====================== PÁGINA DE CONFIGURAÇÕES ======================
function renderSettingsPage() {
  const cfg = STATE.config;
  setValue('configMonth',           cfg.month);
  setValue('configMetaTotal',       cfg.metaTotal);
  setValue('configMetaTPM',         cfg.metaTPM);
  setValue('configMetaDistribMensal', cfg.metaDistribMensal);
  setValue('configMetaTPS',         cfg.metaTPS);
  setValue('configDiasUteis',       cfg.diasUteis);
  setValue('configDiasTrabalhados', cfg.diasTrabalhados);
  setValue('configProgAcum',        cfg.progAcum);
  renderEquipmentSettings();
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

async function saveSettings() {
  STATE.config.month           = document.getElementById('configMonth').value;
  STATE.config.metaTotal       = parseInt(document.getElementById('configMetaTotal').value) || 0;
  STATE.config.metaTPM          = parseInt(document.getElementById('configMetaTPM').value)    || 0;
  STATE.config.metaDistribMensal = parseInt(document.getElementById('configMetaDistribMensal').value) || 0;
  STATE.config.metaTPS          = parseInt(document.getElementById('configMetaTPS').value)    || 0;
  STATE.config.diasUteis       = parseInt(document.getElementById('configDiasUteis').value) || 1;
  STATE.config.diasTrabalhados = parseInt(document.getElementById('configDiasTrabalhados').value) || 0;
  STATE.config.progAcum        = parseInt(document.getElementById('configProgAcum').value)  || 0;

  showStatus('settingsStatus', '⏳ Salvando configurações no banco...', 'info');

  try {
    const { error } = await sb.from('config_meta').upsert({
      month: STATE.config.month,
      meta_total: STATE.config.metaTotal,
      meta_tpm: STATE.config.metaTPM,
      meta_distrib_mensal: STATE.config.metaDistribMensal,
      meta_tps: STATE.config.metaTPS,
      dias_uteis: STATE.config.diasUteis,
      dias_trabalhados: STATE.config.diasTrabalhados,
      prog_acumulado: STATE.config.progAcum
    });
    if (error) throw error;
    saveToStorage();
    showStatus('settingsStatus', '✅ Configurações salvas no Supabase!', 'success');
    renderDashboard();
  } catch (err) {
    showStatus('settingsStatus', '🚨 Erro ao salvar no banco: ' + err.message, 'error');
  }
}

function resetSettings() {
  if (!confirm('Restaurar configurações padrão? (Os registros de produção não serão apagados)')) return;
  STATE.config = {
    month: STATE.config.month,
    metaTotal: 240, metaTPM: 80, metaTPD: 100, metaTPS: 60,
    diasUteis: 20, diasTrabalhados: 10, progAcum: 120,
  };
  saveToStorage();
  renderSettingsPage();
  showStatus('settingsStatus', '↺ Configurações restauradas para o padrão.', 'info');
}

// ====================== UPLOAD / ENTRADA MANUAL ======================
function initializeManualEntries() {
  const cDistrib = document.getElementById('manualEntriesDistrib');
  const cForca = document.getElementById('manualEntriesForca');
  if (cDistrib && !cDistrib.hasChildNodes()) addManualEntry('distrib');
  if (cForca && !cForca.hasChildNodes()) addManualEntry('forca');
}

function addManualEntry(area) {
  const containerId = area === 'distrib' ? 'manualEntriesDistrib' : 'manualEntriesForca';
  const container = document.getElementById(containerId);
  const idx = container.children.length;
  
  const div = document.createElement('div');
  div.className = 'manual-entry';
  div.dataset.entry = idx;
  div.innerHTML = `
    <div class="entry-header">
      <span class="entry-num">Registro #${idx + 1}</span>
      <button class="btn-remove-entry" onclick="this.parentElement.parentElement.remove()">✕</button>
    </div>
    <div class="entry-fields">
      <div class="form-group"><label>Data</label><input type="date" class="form-input entry-date" value="${todayDateStr()}" /></div>
      <div class="form-group"><label>Linha</label>
        <select class="form-input entry-line">
          <option value="TPD" ${area==='distrib'?'selected':''}>TPD – Distribuição</option>
          <option value="TPM" ${area==='forca'?'selected':''}>TPM – Média Força</option>
          <option value="TPS">TPS – Seco</option>
        </select>
      </div>
      <div class="form-group"><label>Prog.</label><input type="number" class="form-input entry-prog" placeholder="0" /></div>
      <div class="form-group"><label>Real.</label><input type="number" class="form-input entry-real" placeholder="0" /></div>
      <div class="form-group"><label>OS / Desc.</label><input type="text" class="form-input entry-desc" placeholder="OS..." /></div>
    </div>
  `;
  container.appendChild(div);
}

async function saveManualEntries(area) {
  const containerId = area === 'distrib' ? 'manualEntriesDistrib' : 'manualEntriesForca';
  const statusId = area === 'distrib' ? 'manualStatusDistrib' : 'manualStatusForca';
  const entries = document.querySelectorAll(`#${containerId} .manual-entry`);
  
  let newRecords = [];
  entries.forEach(entry => {
    const date = entry.querySelector('.entry-date').value;
    const line = entry.querySelector('.entry-line').value;
    const prog = parseInt(entry.querySelector('.entry-prog').value) || 0;
    const real = parseInt(entry.querySelector('.entry-real').value) || 0;
    const desc = entry.querySelector('.entry-desc').value || '';

    if (date && line) {
      newRecords.push({
        date, line, prog, real, 
        description: desc, 
        area: area,
        core_type: area === 'distrib' ? detectCoreType(desc) : null,
        origin: 'manual'
      });
    }
  });

  if (newRecords.length === 0) return;

  try {
    const { data, error } = await sb.from('production_records').insert(newRecords).select();
    if (error) throw error;
    
    // Sync local state
    data.forEach(r => {
      STATE.records.push({
        id: r.id, date: r.date, line: r.line, prog: r.prog, real: r.real, 
        desc: r.description, area: r.area, coreType: r.core_type, source: r.origin
      });
    });

    showStatus(statusId, `✅ ${data.length} registros salvos!`, 'success');
    document.getElementById(containerId).innerHTML = '';
    addManualEntry(area);
    renderDataTable();
  } catch (err) {
    showStatus(statusId, '🚨 Erro: ' + err.message, 'error');
  }
}

async function handleFileUpload(event, area) {
  const fileInput = event.target;
  const file = fileInput.files[0];
  const statusId = area === 'distrib' ? `uploadStatusDistrib` : `uploadStatusForca`;
  if (!file) return;

  showStatus(statusId, '⏳ Processando arquivo... Aguarde.', 'info', false);

  if (typeof XLSX === 'undefined') {
    showStatus(statusId, '🚨 Erro: Biblioteca XLSX não carregou. Verifique a internet.', 'error');
    fileInput.value = '';
    return;
  }

  const reader = new FileReader();
  
  reader.onerror = () => {
    showStatus(statusId, '🚨 Erro ao ler o arquivo selecionado.', 'error');
    fileInput.value = '';
  };

  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet);

      const newRecords = parseXLSXRows(rows, area);
      if (!newRecords || newRecords.length === 0) {
        showStatus(statusId, '⚠️ Nenhum dado de produção encontrado na planilha.', 'warning');
        fileInput.value = '';
        return;
      }

      showStatus(statusId, `⏳ Salvando ${newRecords.length} registros no banco de dados...`, 'info', false);

      // Substituição Inteligente
      const currentMonth = STATE.config.month;
      const targetArea = newRecords[0].area; 
      
      const year = parseInt(currentMonth.split('-')[0]);
      const month = parseInt(currentMonth.split('-')[1]);
      const lastDay = new Date(year, month, 0).getDate();

      const { error: delErr } = await sb.from('production_records')
        .delete()
        .eq('area', targetArea)
        .like('origin', 'excel%')
        .gte('date', `${currentMonth}-01`)
        .lte('date', `${currentMonth}-${lastDay}`);

      if (delErr) {
        console.warn('Aviso ao deletar registros antigos:', delErr);
      }

      // Dividir inserção em lotes se for muito grande
      const batchSize = 500;
      let insertedCount = 0;
      for (let i = 0; i < newRecords.length; i += batchSize) {
        const batch = newRecords.slice(i, i + batchSize);
        const { error: insErr } = await sb.from('production_records').insert(batch);
        if (insErr) throw insErr;
        insertedCount += batch.length;
      }

      // Recarrega tudo do banco
      await loadDataFromDB();

      showStatus(statusId, `✅ ${insertedCount} registros substituídos com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro na importação:', err);
      showStatus(statusId, '🚨 Erro na importação: ' + (err.message || 'Verifique o console.'), 'error');
    } finally {
      fileInput.value = ''; // Permite subir o mesmo arquivo novamente
    }
  };
  
  reader.readAsArrayBuffer(file);
}

function parseXLSXRows(rows, area) {
  if (!rows || rows.length === 0) return [];
  
  const firstRow = rows[0];
  // Chaves limpas (sem espaços extras)
  const colNames = Object.keys(firstRow).map(k => String(k).trim());
  
  // LOG DE DEBUG PARA O USUÁRIO (Facilita muito descobrir o erro)
  console.log("Colunas Detectadas:", colNames);

  const cleanRows = rows.filter(row => {
    const firstVal = String(Object.values(row)[0] || '').toUpperCase();
    return firstVal && !firstVal.includes('SOMA') && !firstVal.includes('MÉDIA') && !firstVal.includes('TOTAL');
  });

  // Detecção se é o consolidado (Boletim de Medição)
  const isConsolidated = area === 'distrib' && (
    colNames.some(k => k.includes('Enrolado') || k.includes('JC') || k.includes('Convencional') || k.includes('Executado'))
  );

  if (isConsolidated) {
    const currentYear = new Date().getFullYear();
    const currentMonth = STATE.config.month || todayDateStr().substring(0, 7);
    let lastSeenDate = null;
    
    const parsedData = cleanRows.flatMap((row, rowIndex) => {
      // Normalizar chaves da linha atual
      const cleanRow = {};
      Object.keys(row).forEach(k => cleanRow[String(k).trim()] = row[k]);

      // 1. Data
      const dateKey = Object.keys(cleanRow).find(k => k.toLowerCase() === 'data' || k.toLowerCase() === 'dia' || k === 'A' || k === '__EMPTY' || k === 'Data');
      
      let valDateRaw = cleanRow[dateKey];
      if (!valDateRaw && lastSeenDate) valDateRaw = lastSeenDate;
      else if (valDateRaw) lastSeenDate = valDateRaw;

      let date = `${currentMonth}-01`;
      
      if (valDateRaw) {
        const strDate = String(valDateRaw);
        if (!isNaN(valDateRaw) && parseInt(valDateRaw) < 32) {
          date = `${currentMonth}-${String(valDateRaw).padStart(2, '0')}`;
        } else if (strDate.includes('/')) {
          const parts = strDate.split('/');
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2] || currentYear;
          date = `${y}-${m}-${d}`;
        } else {
          date = parseDateBR(valDateRaw) || date;
        }
      }

      const records = [];
      const mappings = [
        { key: 'Enrolado', type: 'ENR' },
        { key: 'Convencional', type: 'EMP' },
        { key: 'JC-TRIF', type: 'JC' },
        { key: 'JC', type: 'JC' },
        { key: 'REP - LAB', type: 'LAB' }
      ];

      const processedTypes = new Set();
      mappings.forEach(m => {
        if (processedTypes.has(m.type)) return;

        // Tenta achar por NOME
        const colReal = Object.keys(cleanRow).find(k => {
          const key = k.toLowerCase();
          const target = m.key.toLowerCase();
          return (key.includes('realizado') || key.includes('executado')) && key.includes(target) && !key.includes('acum');
        });
        
        const colMeta = Object.keys(cleanRow).find(k => {
          const key = k.toLowerCase();
          const target = m.key.toLowerCase();
          return (key.includes('meta') || key.includes('prog')) && key.includes(target) && !key.includes('acum');
        });

        let real = parseInt(cleanRow[colReal]) || 0;
        let prog = parseInt(cleanRow[colMeta]) || 0;

        // Caso especial para REP - LAB
        if (m.key === 'REP - LAB') real = parseInt(cleanRow['REP - LAB']) || 0;

        if (real > 0 || prog > 0) {
          records.push({
            date, line: m.type, prog, real, area: 'distrib',
            description: `Boletim: ${m.key}`, core_type: m.type, origin: 'excel_consolidated'
          });
          processedTypes.add(m.type);
        }
      });

      return records;
    });

    if (parsedData.length === 0) {
      console.warn("Nenhum dado mapeado. Colunas encontradas:", colNames);
      alert("Atenção: A planilha foi reconhecida, mas os dados não puderam ser lidos. Certifique-se de que os cabeçalhos 'Executado' e 'Meta' estão na primeira linha.");
    }
    return parsedData;
  }

  let lastSeenDatePadrao = null;
  // Lógica padrão
  return cleanRows.map(row => {
    const cleanRow = {};
    Object.keys(row).forEach(k => cleanRow[String(k).trim()] = row[k]);

    let dateRaw = cleanRow['DATA LAB'] || cleanRow['Data'] || cleanRow['DATA'] || cleanRow['Dia'];
    if (!dateRaw && lastSeenDatePadrao) dateRaw = lastSeenDatePadrao;
    else if (dateRaw) lastSeenDatePadrao = dateRaw;
    const desc    = cleanRow['DESCRIÇÃO'] || cleanRow['Descrição'] || cleanRow['OS'] || '';
    const lineVal = cleanRow['Linha'] || cleanRow['LINHA'] || (area === 'distrib' ? 'TPD' : 'TPM');
    const qteVal  = cleanRow['QTDE'] || cleanRow['Qtde'] || cleanRow['Realizado'] || cleanRow['Real'] || cleanRow['Executado'] || 0;

    const cMonth = STATE.config.month || todayDateStr().substring(0, 7);
    let date = parseDateBR(dateRaw) || `${cMonth}-01`;
    if (dateRaw && !isNaN(dateRaw) && parseInt(dateRaw) < 32) {
      date = `${cMonth}-${String(dateRaw).padStart(2, '0')}`;
    }

    return {
      date, line: lineVal,
      prog: parseInt(cleanRow['Programado'] || cleanRow['Prog'] || cleanRow['Meta']) || 0,
      real: parseInt(qteVal) || 0,
      description: desc,
      area: !!(cleanRow['DATA LAB'] || cleanRow['QTDE']) ? 'forca' : area,
      core_type: area === 'distrib' ? detectCoreType(desc) : null,
      origin: 'excel'
    };
  }).filter(r => r.real > 0 || r.prog > 0);
}



function parseDateBR(val) {
  if (!val) return null;
  const s = String(val).trim();
  
  // Caso 1: Data completa YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Caso 2: Formato D/M ou D/M/Y (Ex: 2/2)
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length >= 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2] || new Date().getFullYear();
      return `${y}-${m}-${d}`;
    }
  }

  // Caso 3: Formato DD-MMM (Ex: 01-abr)
  if (s.includes('-')) {
    const parts = s.split('-');
    const day = parts[0].padStart(2, '0');
    const monthMap = { 'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12' };
    const month = monthMap[parts[1].toLowerCase().substring(0, 3)] || '01';
    return `${new Date().getFullYear()}-${month}-${day}`;
  }

  return null;
}

// ====================== TABELA DE DADOS ======================
function renderDataTable() {
  const tbody = document.getElementById('dataTableBody');
  if (!tbody) return;

  const filterLine = document.getElementById('filterLine')?.value || '';
  const currentMonth = STATE.config.month;
  
  let records = STATE.records.filter(r => r.date && r.date.startsWith(currentMonth));
  if (filterLine) records = records.filter(r => r.line === filterLine);
  
  records.sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Nenhum registro encontrado para o mês atual.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const areaLabel = r.area === 'distrib' ? '🏭 DIST' : '⚡ FORÇA';
    const coreLabel = r.coreType ? ` [${r.coreType}]` : '';
    const lineBadgeCls = r.line === 'TPM' ? 'line-badge-tpm' : r.line === 'TPD' ? 'line-badge-tpd' : 'line-badge-tps';
    
    return `<tr>
      <td>${r.date}</td>
      <td><span class="line-badge ${lineBadgeCls}">${r.line}${coreLabel}</span></td>
      <td>${r.prog}</td>
      <td><strong style="color:var(--success)">${r.real}</strong></td>
      <td>${r.desc || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${areaLabel} (${r.source})</td>
      <td><button class="btn-del-row" onclick="deleteRecord('${r.id}')">✕</button></td>
    </tr>`;
  }).join('');
}

function filterTable() { renderDataTable(); }

async function deleteRecord(id) {
  if (!confirm('Remover este registro permanentemente?')) return;
  try {
    const { error } = await sb.from('production_records').delete().eq('id', id);
    if (error) throw error;
    STATE.records = STATE.records.filter(r => String(r.id) !== String(id));
    renderDataTable();
    if (document.getElementById('page-distribuicao').classList.contains('active')) renderDashboardDistrib();
    else renderDashboardForca();
  } catch (err) {
    alert('Erro ao excluir: ' + err.message);
  }
}

function initDropZones() {
  ['Distrib', 'Forca'].forEach(areaSuffix => {
    const dz = document.getElementById(`dropZone${areaSuffix}`);
    const area = areaSuffix.toLowerCase();
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileUpload({ target: { files } }, area);
    });
  });
}

function exportReport(area) {
  alert(`Exportação de relatório PDF para ${area} será processada com os dados atuais.`);
}

function exportData() {
  const currentMonth = STATE.config.month;
  const records = STATE.records.filter(r => r.date && r.date.startsWith(currentMonth));
  const headers = ['Data', 'Area', 'Linha', 'Núcleo', 'Prog', 'Real', 'Desc'];
  const rows = records.map(r => [r.date, r.area, r.line, r.coreType||'', r.prog, r.real, r.desc]);
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trael_export_${currentMonth}.csv`;
  a.click();
}

function showStatus(id, msg, type, autoHide = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'block';
  el.className = `upload-status ${type}`;
  el.textContent = msg;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  if (el.hideTimeout) clearTimeout(el.hideTimeout);
  
  if (autoHide) {
    el.hideTimeout = setTimeout(() => { if(el) el.style.display = 'none'; }, 6000);
  }
}

// ====================== INICIALIZAÇÃO ======================
// --- GERENCIAMENTO DE TEMA ---
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('trael-theme', isLight ? 'light' : 'dark');
  updateThemeIcons(isLight);
}

function updateThemeIcons(isLight) {
  const icon = isLight ? '🌙' : '☀️';
  const ids = ['themeIconDistrib', 'themeIconForca'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = icon;
  });
}

function initTheme() {
  const saved = localStorage.getItem('trael-theme');
  const isLight = saved === 'light';
  if (isLight) {
    document.body.classList.add('light-theme');
  }
  updateThemeIcons(isLight);
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  
  // 1. GARANTIR MÊS NO INÍCIO (Evita RangeError/NaN)
  if (!STATE.config.month) {
    const now = new Date();
    STATE.config.month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  updateClock();
  setInterval(updateClock, 1000);

  // 2. Carregar do armazenamento local como fallback imediato
  loadFromStorage();
  
  // 3. Inicializar Drag and Drop
  initDropZones();

  // 4. Checar Sessão antes de carregar o Banco (Auth Check)
  checkSession();
});
