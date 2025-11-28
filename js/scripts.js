function toNumber(v){ const n = Number(v); return isNaN(n)?0:n; }
function round(v,dec=2){ return Math.round(v * Math.pow(10,dec))/Math.pow(10,dec); }

function periodicRateFromInputs(ratePercent, tipo, capAnual){
    // tasa anual en porcentaje (e.g., 8.5). Devuelve tasa periódica mensual (12 periodos/año) en decimal.
    const r = toNumber(ratePercent)/100;
    if(tipo === 'efectiva'){
        return Math.pow(1 + r, 1/12) - 1;
    } else {
        // nominal anual convertible m veces -> periodic = nominal / m
        const m = Number(capAnual) || 12;
        return r / m;
    }
}

function cuotaFrances(principal, i, n){
    // cuota vencida: A = P * i / (1 - (1+i)^-n)
    if(i === 0) return principal / n;
    return principal * i / (1 - Math.pow(1 + i, -n));
}

function npv(cashflows, tasa_periodica){ // tasa_periodica en decimal por periodo
    let s = 0;
    for(let t=0;t<cashflows.length;t++){
        s += cashflows[t] / Math.pow(1 + tasa_periodica, t);
    }
    return s;
}

function irr(cashflows, guess=0.1){
    // Usa Newton con limitaciones; si falla, bisección entre -0.999 y 10
    const maxIter = 200;
    let x = guess;
    function f(r){
        let s=0;
        for(let t=0;t<cashflows.length;t++) s += cashflows[t] / Math.pow(1+r,t);
        return s;
    }
    function fprime(r){
        let s=0;
        for(let t=1;t<cashflows.length;t++){
            // derivada de cashflows[t] / (1+r)^t = -t * cashflows[t] / (1+r)^(t+1)
            s += -t * cashflows[t] / Math.pow(1 + r, t + 1);
        }
        return s;
    }
    try{
        for(let i=0;i<maxIter;i++){
            const fx = f(x);
            const dfx = fprime(x);
            const nx = x - fx/dfx;
            if(!isFinite(nx)) break;
            if(Math.abs(nx - x) < 1e-9) return x;
            x = nx;
        }
    }catch(e){}
    // bisección
    let a = -0.9999999, b = 10;
    let fa = f(a), fb = f(b);
    if(!(fa*fb < 0)){
        // intenta encontrar bracketing
        for(let k=0;k<50;k++){
            b *= 2;
            fb = f(b);
            if(fa*fb < 0) break;
        }
    }
    if(!(fa*fb < 0)) return NaN;
    for(let i=0;i<200;i++){
        const m = (a+b)/2;
        const fm = f(m);
        if(Math.abs(fm) < 1e-9) return m;
        if(fa*fm < 0){ b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a+b)/2;
}

function formatCurrency(v, moneda){
    const opts = {minimumFractionDigits:2, maximumFractionDigits:2};
    if(moneda === 'USD') return new Intl.NumberFormat('en-US', opts).format(v);
    return new Intl.NumberFormat('es-PE', opts).format(v);
}

// helper seguro para adjuntar listeners cuando el elemento puede no existir
function attach(id, evt, handler){
    const el = document.getElementById(id);
    if(!el){ console.debug('attach: element not found', id); return; }
    el.addEventListener(evt, handler);
}

// Small helper to POST with X-Auth-Token header when available (frontend uses js/auth.js)
async function apiPostAuth(path, body){
    const headers = { 'Content-Type': 'application/json' };
    try{
        if(window && window.fmvauth && typeof window.fmvauth.getToken === 'function'){
            const t = window.fmvauth.getToken();
            if(t) headers['X-Auth-Token'] = t;
        }
    }catch(e){}
    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw data;
    return data;
}

/* -------------------------
  Lógica principal: cálculo
--------------------------*/
// document.getElementById('btn-calcular').addEventListener('click', calcular);

// Listener de 'btn-calcular' se añade de forma segura en ensureEssentialListeners/forceAttachHandlers

// Versión mejorada de calcular() con logs, comprobaciones y setKPI seguro
function calcular(){
    console.log('calcular: inicio');
    // leer inputs
    const moneda = document.getElementById('cfg-moneda').value;
    const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
    const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
    const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value)));
    const tasaAnual = toNumber(document.getElementById('input-tasa').value);
    const principal = toNumber(document.getElementById('input-principal').value);
    const bono = toNumber(document.getElementById('input-bono').value);
    const tipoGracia = document.getElementById('input-gracia').value;
    const mesesGracia = Math.max(0, Math.floor(Number(document.getElementById('input-meses-gracia').value)));
    const capitalizaGracia = document.getElementById('input-capitaliza-gracia').value === 'si';
    const tasaDescuento = toNumber(document.getElementById('input-tasa-descuento').value)/100;

    // periodic rate (mensual) en decimal
    const i_periodo = periodicRateFromInputs(tasaAnual, tipoTasa, capAnual);
    const tea = Math.pow(1 + i_periodo, 12) - 1;

    const monto_recibido = principal + bono;
    const cashflows = [];
    cashflows.push(-principal);

    const tbody = document.getElementById('tbody-amort');
    tbody.innerHTML = '';

    let saldo = principal;
    let periodo = 1;
    const rows = [];

    if(tipoGracia === 'total' && mesesGracia > 0 && capitalizaGracia){
        let interes_acum = 0;
        for(let m=0;m<mesesGracia;m++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            interes_acum += interes;
            // en gracia total sin pagos
            rows.push({periodo: periodo, pago:0, interes:interes, amort:0, cuota:null, saldo_inicial: saldo_inicial, saldo_final: saldo});
            periodo++;
        }
        saldo += interes_acum;
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes, amort, cuota, saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else if(tipoGracia === 'total' && mesesGracia > 0 && !capitalizaGracia){
        for(let m=0;m<mesesGracia;m++){
            const saldo_inicial = saldo;
            rows.push({periodo: periodo, pago:0, interes:0, amort:0, cuota:null, saldo_inicial: saldo_inicial, saldo_final: saldo});
            periodo++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes, amort, cuota, saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else if(tipoGracia === 'partial' && mesesGracia > 0){
        for(let m=0;m<mesesGracia;m++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            const pago = interes;
            // en gracia parcial se paga solo interés
            rows.push({periodo: periodo, pago: round(pago,2), interes: round(interes,2), amort:0, cuota:null, saldo_inicial: saldo_inicial, saldo_final: saldo});
            periodo++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes, amort, cuota, saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else {
        const cuota = cuotaFrances(saldo, i_periodo, plazo);
        for(let p=0;p<plazo;p++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes, amort, cuota, saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    }

    // construir cashflows y tabla
    const cf = [];
    cf.push(-principal);
    let acumuladoPagos = 0;
    rows.forEach(r=>{
        cf.push(round(toNumber(r.pago), 2));
        acumuladoPagos += toNumber(r.pago);
    });

    const tbodyHTML = rows.map(r=>`<tr>
      <td class="left">${r.periodo}</td>
      <td>${formatCurrency(r.saldo_inicial || 0, moneda)}</td>
      <td>${formatCurrency(r.interes || 0, moneda)}</td>
      <td>${formatCurrency(r.amort || 0, moneda)}</td>
      <td>${formatCurrency(r.cuota || 0, moneda)}</td>
      <td>${formatCurrency(r.saldo_final || 0, moneda)}</td>
    </tr>`).join('');
    document.getElementById('tbody-amort').innerHTML = tbodyHTML;

    // indicadores calculados
    const cuotaProm = rows.filter(r=>r.pago>0).length? rows.filter(r=>r.pago>0).reduce((s,x)=>s+x.pago,0) / rows.filter(r=>r.pago>0).length : 0;
    const costoTotal = round(acumuladoPagos - principal,2);
    const van = round(npv(cf, tasaDescuento/12),2);
    const tir_mensual = irr(cf);
    const tir_anual = isNaN(tir_mensual)? NaN : Math.pow(1 + tir_mensual, 12) - 1;

    // actualización segura de KPIs
    function setKPI(id, value){
        const el = document.getElementById(id);
        if(!el) {
            console.warn('KPI element not found:', id);
            return;
        }
        el.innerText = value;
    }

    // formato y comprobaciones
    setKPI('k-cuota', isFinite(cuotaProm) ? formatCurrency(round(cuotaProm,2), moneda) : 'N/A');
    setKPI('k-costo', isFinite(costoTotal) ? formatCurrency(costoTotal, moneda) : 'N/A');
    setKPI('k-tea', isFinite(tea) ? (round(tea*100,4) + ' %') : 'N/A');
    setKPI('k-van', isFinite(van) ? formatCurrency(van, moneda) : 'N/A');
    setKPI('k-tir', isFinite(tir_anual) ? (round(tir_anual*100,4) + ' %') : 'N/A');
    setKPI('k-neto', isFinite(principal) ? formatCurrency(principal, moneda) : 'N/A');

    // guardar cf para export
    window.__lastCalc = {rows, cf, moneda, principal, tasaAnual, tipoTasa, capAnual};

    document.getElementById('btn-export').disabled = false;

    // log operation (no bloqueante)
    (async ()=>{
        try{
            const payload = {
                moneda, tipoTasa, capAnual, plazo, tasaAnual, principal, bono, tipoGracia, mesesGracia, capitalizaGracia,
                cuota_sample: rows.find(r=>r.pago>0) ? rows.find(r=>r.pago>0).pago : null,
                tea: tea,
                van: van,
                tir_mensual: tir_mensual,
                tir_anual: tir_anual,
                timestamp: new Date().toISOString()
            };
            await apiPostAuth('/api/operations', { type: 'calculation', payload });
        }catch(e){
            // ignore
        }
    })();

    console.log('calcular: fin', {cuotaProm, costoTotal, van, tir_anual});

    // asegurar que el recuadro del dashboard esté sincronizado
    try{ updateCuotaFijaDisplay(); }catch(e){}
}

/* -------------------------
 Export CSV (amort table)
--------------------------*/
// Handler de export CSV se registra de forma segura en el bloque de attach/ensureEssentialListeners

/* -------------------------
  Guardar / cargar cliente e inmueble
--------------------------*/
// Guardar cliente: manejador registrado en attach/ensureEssentialListeners

// Cargar cliente: manejador registrado en attach/ensureEssentialListeners

// Guardar inmueble: manejador registrado en attach/ensureEssentialListeners

// Cargar inmueble: manejador registrado en attach/ensureEssentialListeners

/* -------------------------
 Limpiar resultados y formularios
--------------------------*/
// Listener eliminado aquí: se añade de forma controlada en ensureEssentialListeners()

// Mostrar tasa efectiva mensual derivada de los inputs de tasa
function updateTasaMensualDisplay(){
    try{
        const tasaAnual = toNumber(document.getElementById('input-tasa').value);
        const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
        const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
        const i_periodo = periodicRateFromInputs(tasaAnual, tipoTasa, capAnual);
        const el = document.getElementById('input-tasa-mensual');
        if(!el){ setDebugStatus('input-tasa-mensual', 'not found'); return; }
        // mostrar como porcentaje con 4 decimales
        if(!isFinite(i_periodo)) el.value = '-';
        else el.value = (i_periodo * 100).toFixed(4) + ' %';
        console.debug('updateTasaMensualDisplay:', {tasaAnual, tipoTasa, capAnual, i_periodo});
        setDebugStatus('tasaAnual', tasaAnual);
        setDebugStatus('i_periodo', (isFinite(i_periodo) ? (i_periodo*100).toFixed(6) + '%' : 'NaN'));
        setDebugStatus('input-tasa-handler', 'fired');
    }catch(e){
        // fallback silencioso
        console.warn('updateTasaMensualDisplay error', e);
        setDebugStatus('updateTasaMensualDisplay', 'error');
    }
}

// Calcula y muestra la cuota fija mensual según capitalizado en gracia
function updateCuotaFijaDisplay(){
    try{
        const principal = toNumber(document.getElementById('input-principal').value);
        const tasaAnual = toNumber(document.getElementById('input-tasa').value);
        const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
        const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
        const tipoGracia = document.getElementById('input-gracia') ? document.getElementById('input-gracia').value : 'none';
        const mesesGracia = Math.max(0, Math.floor(Number(document.getElementById('input-meses-gracia').value)));
        const capitalizaGracia = document.getElementById('input-capitaliza-gracia') ? (document.getElementById('input-capitaliza-gracia').value === 'si') : false;
        const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value) || 0));

        const i_periodo = periodicRateFromInputs(tasaAnual, tipoTasa, capAnual);
        const tea_from_i = Math.pow(1 + i_periodo, 12) - 1;
        const el = document.getElementById('input-cuota-fija');
        const elMensual = document.getElementById('input-cuota-fija-mensual');
        if(!el) return;

        // Determinar monto capitalizado: si hay gracia total y se capitaliza, aplicar capitalización; en otros casos queda igual
        let montoCapitalizado = principal;
        if(tipoGracia === 'total' && capitalizaGracia && mesesGracia > 0 && isFinite(i_periodo)){
            montoCapitalizado = principal * Math.pow(1 + i_periodo, mesesGracia);
        }

        // Mostrar monto capitalizado
        el.value = (isFinite(montoCapitalizado) ? formatCurrency(round(montoCapitalizado,2), document.getElementById('cfg-moneda').value) : '-');

        // Ahora calcular la cuota fija mensual con método francés sobre el montoCapitalizado
        const n_restante = Math.max(1, plazo - mesesGracia);
        let cuotaMensual = NaN;
        let pow = NaN;
        if(isFinite(i_periodo) && montoCapitalizado > 0 && n_restante > 0){
            if(i_periodo === 0){
                cuotaMensual = montoCapitalizado / n_restante;
            } else {
                // Forma equivalente: A = P * (i*(1+i)^n) / ((1+i)^n - 1)
                pow = Math.pow(1 + i_periodo, n_restante);
                cuotaMensual = montoCapitalizado * (i_periodo * pow) / (pow - 1);
            }
        }

        if(elMensual){
            elMensual.value = (isFinite(cuotaMensual) ? formatCurrency(round(cuotaMensual,2), document.getElementById('cfg-moneda').value) : '-');
        }

        // Diagnostic logs for user debugging
        console.debug('updateCuotaFijaDisplay debug', {
            principal, tasaAnual, tipoTasa, capAnual, i_periodo, tea_from_i,
            tipoGracia, capitalizaGracia, mesesGracia, montoCapitalizado, plazo, n_restante, pow, cuotaMensual
        });

        // recuadro eliminado: no actualizar elementos de resumen aquí

    }catch(e){ console.warn('updateCuotaFijaDisplay error', e); if(document.getElementById('input-cuota-fija-mensual')) document.getElementById('input-cuota-fija-mensual').value='-'; }
}

// Debug panel helper (disabled): reemplazado por no-op para quitar FMDebug
function ensureDebugPanel(){ return null; }
function setDebugStatus(key, value){ /* debug panel desactivado */ }

// NOTE: El binding directo de btn-limpiar fue eliminado para evitar duplicados;
// el listener se añade de forma controlada en ensureEssentialListeners().

// listeners: cuando cambie la tasa anual, el tipo (efectiva/nominal) o capitalización
const tasaInput = document.getElementById('input-tasa');
if(tasaInput) tasaInput.addEventListener('input', updateTasaMensualDisplay);
const tipoSelect = document.getElementById('cfg-tipo-tasa');
if(tipoSelect) tipoSelect.addEventListener('change', updateTasaMensualDisplay);
const capSelect = document.getElementById('cfg-capitalizacion');
if(capSelect) capSelect.addEventListener('change', updateTasaMensualDisplay);

// inicializar display al cargar
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', updateTasaMensualDisplay);
} else {
    updateTasaMensualDisplay();
}

// 1) Añadir CSS para tooltips (auto-inyectado)
(function addKpiTooltipStyles(){
    const css = `
    .kpi[data-tip]{ position:relative; cursor:help; }
    .kpi[data-tip]::after{
        content: attr(data-tip);
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        top: calc(100% + 8px);
        background: rgba(15,23,42,0.95);
        color:#fff;
        padding:10px;
        border-radius:8px;
        white-space:pre-wrap;
        font-size:12px;
        min-width:220px;
        max-width:360px;
        box-shadow:0 6px 18px rgba(0,0,0,0.12);
        display:none;
        z-index:999;
        text-align:left;
    }
    .kpi[data-tip]:hover::after{ display:block; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-created-by','kpi-tooltips');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
})();

// 2) Mapear KPI -> texto explicativo (ecuaciones)
(function setKpiTooltips(){
    const tips = {
        'k-cuota': `Cuota (método francés):\nA = P * i / (1 - (1 + i)^(-n))\nP: principal, i: tasa periódica (mensual, decimal), n: número de periodos`,
        'k-costo': `Costo total del crédito:\nCosto = Σ_{t=1..T} Pago_t - Monto_neto_recibido\n(es decir, suma de todos los pagos menos lo recibido inicialmente)`,
        'k-tea': `Tasa Efectiva Anual (TEA):\nTEA = (1 + i_periodo)^{12} - 1\ni_periodo: tasa periódica mensual (decimal) usada en la cuota`,
        'k-van': `VAN (Valor Actual Neto):\nVAN = Σ_{t=0..T} CF_t / (1 + r)^t\nCF_0 = -Monto_neto_recibido, r = tasa descuento periódica (mensual)`,
        'k-tir': `TIR (IRR):\nTIR es r tal que Σ_{t=0..T} CF_t / (1 + r)^t = 0\n(Cálculo numérico: Newton + bisección; muestra TIR anual = (1+tir_mensual)^{12}-1)`,
        'k-neto': `Monto neto recibido:\nMonto_neto_recibido = principal + bono\n(este valor se usa como CF_0 en VAN/TIR)`
    };

    Object.keys(tips).forEach(id=>{
        const el = document.getElementById(id);
        if(!el) return;
        const parent = el.closest('.kpi') || el.parentElement;
        if(parent) {
            parent.setAttribute('data-tip', tips[id]);
            parent.setAttribute('aria-label', tips[id]);
        } else {
            el.setAttribute('title', tips[id]); // fallback
        }
    });
})();

// javascript
// Insertar al final de `js/scripts.js`

(function addTableHeaderTooltips(){
    const css = `
    th[data-tip]{ position:relative; cursor:help; }
    th[data-tip]::after{
        content: attr(data-tip);
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        top: calc(100% + 8px);
        background: rgba(15,23,42,0.95);
        color:#fff;
        padding:8px;
        border-radius:8px;
        white-space:pre-wrap;
        font-size:12px;
        min-width:180px;
        max-width:360px;
        box-shadow:0 6px 18px rgba(0,0,0,0.12);
        display:none;
        z-index:999;
        text-align:left;
    }
    th[data-tip]:hover::after{ display:block; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-created-by','table-header-tooltips');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);

    const tips = {
        'Saldo inicial': `Saldo inicial del periodo:\nSaldo con el que arranca el periodo (principal pendiente antes de amortización).`,
        'Interés': `Interés del periodo:\nInterés = Saldo_{anterior} * i_periodo\n(i_periodo = tasa periódica mensual en decimal).`,
        'Amortización': `Amortización del periodo:\nAmort = Pago - Interés\nReduce el saldo del préstamo.`,
        'Cuota': `Columna 'Cuota':\nCuota fija calculada por el método francés (A). En periodos de gracia mostrará 0 o el pago efectivo si aplica.`,
        'Saldo final': `Saldo final del periodo:\nSaldo después de aplicar la amortización del periodo.`
     };

    function applyTips(){
        const ths = document.querySelectorAll('#tabla-amort thead th');
        ths.forEach(th=>{
            const txt = (th.textContent || '').trim();
            // Si el encabezado contiene la palabra clave, asignar tip
            Object.keys(tips).forEach(key=>{
                if(txt.toLowerCase().includes(key.toLowerCase())){
                    th.setAttribute('data-tip', tips[key]);
                    th.setAttribute('aria-label', tips[key]);
                }
            });
        });
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', applyTips);
    } else {
        applyTips();
    }
})();

// Safety: asegurar listeners esenciales al cargar el DOM (previene casos donde el script corrió antes que el DOM)
function ensureEssentialListeners(){
    try{
        const tasaInput = document.getElementById('input-tasa');
        if(tasaInput && !tasaInput.__listenerAttached){
            tasaInput.addEventListener('input', updateTasaMensualDisplay);
            tasaInput.addEventListener('input', updateCuotaFijaDisplay);
            tasaInput.__listenerAttached = true;
            console.debug('listener attached: input-tasa');
        }
        const tipoSelect = document.getElementById('cfg-tipo-tasa');
        if(tipoSelect && !tipoSelect.__listenerAttached){
            tipoSelect.addEventListener('change', function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); });
            tipoSelect.__listenerAttached = true;
            console.debug('listener attached: cfg-tipo-tasa');
        }
        const capSelect = document.getElementById('cfg-capitalizacion');
        if(capSelect && !capSelect.__listenerAttached){
            capSelect.addEventListener('change', function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); });
            capSelect.__listenerAttached = true;
            console.debug('listener attached: cfg-capitalizacion');
        }
        const principal = document.getElementById('input-principal');
        if(principal && !principal.__listenerAttached){
            principal.addEventListener('input', updateCuotaFijaDisplay);
            principal.__listenerAttached = true;
            console.debug('listener attached: input-principal');
        }
        const meses = document.getElementById('input-meses-gracia');
        if(meses && !meses.__listenerAttached){
            meses.addEventListener('input', updateCuotaFijaDisplay);
            meses.__listenerAttached = true;
            console.debug('listener attached: input-meses-gracia');
        }
        const tipoGraciaEl = document.getElementById('input-gracia');
        if(tipoGraciaEl && !tipoGraciaEl.__listenerAttached){
            tipoGraciaEl.addEventListener('change', updateCuotaFijaDisplay);
            tipoGraciaEl.__listenerAttached = true;
            console.debug('listener attached: input-gracia');
        }
        const capGraciaEl = document.getElementById('input-capitaliza-gracia');
        if(capGraciaEl && !capGraciaEl.__listenerAttached){
            capGraciaEl.addEventListener('change', updateCuotaFijaDisplay);
            capGraciaEl.__listenerAttached = true;
            console.debug('listener attached: input-capitaliza-gracia');
        }
        const plazoEl = document.getElementById('input-plazo');
        if(plazoEl && !plazoEl.__listenerAttached){
            plazoEl.addEventListener('input', updateCuotaFijaDisplay);
            plazoEl.__listenerAttached = true;
            console.debug('listener attached: input-plazo');
        }
        const btnLimpiar = document.getElementById('btn-limpiar');
        if(btnLimpiar && !btnLimpiar.__listenerAttached){
            btnLimpiar.addEventListener('click', ()=>{
                const tbody = document.getElementById('tbody-amort'); if(tbody) tbody.innerHTML = '';
                ['k-cuota','k-costo','k-tea','k-van','k-tir','k-neto'].forEach(id=>{ const el = document.getElementById(id); if(el) el.innerText = '-'; });
                window.__lastCalc = null;
                const btnExport = document.getElementById('btn-export'); if(btnExport) btnExport.disabled = true;
            });
            btnLimpiar.__listenerAttached = true;
            console.debug('listener attached: btn-limpiar');
        }
        // Asegurar que 'Calcular' está vinculado
        const btnCalc = document.getElementById('btn-calcular');
        if(btnCalc && !btnCalc.__listenerAttached){
            btnCalc.addEventListener('click', calcular);
            btnCalc.__listenerAttached = true;
            console.debug('listener attached: btn-calcular');
        }

        // Inicializar visualización
        updateTasaMensualDisplay();
        updateCuotaFijaDisplay();
    }catch(e){
        // silencioso
        console.warn('ensureEssentialListeners failed', e);
    }
}

// Diagnóstico y fuerza de attach (idempotente)
(function forceAttachHandlers(){
    try{
        const ids = ['input-tasa','input-tasa-mensual','cfg-tipo-tasa','cfg-capitalizacion','btn-calcular','btn-limpiar','btn-export','input-principal','input-meses-gracia','input-gracia','input-capitaliza-gracia','input-plazo'];
        ids.forEach(id=>{
            const el = document.getElementById(id);
            console.debug('startup check', id, !!el, el ? el.tagName : null);
            setDebugStatus(id + '-exists', !!el);
        });

        const tasa = document.getElementById('input-tasa');
        if(tasa){
            tasa.oninput = function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); };
        }
        const tipo = document.getElementById('cfg-tipo-tasa');
        if(tipo){ tipo.onchange = function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); }; }
        const cap = document.getElementById('cfg-capitalizacion');
        if(cap){ cap.onchange = function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); }; }

        const principal = document.getElementById('input-principal');
        if(principal){ principal.oninput = updateCuotaFijaDisplay; }
        const meses = document.getElementById('input-meses-gracia');
        if(meses){ meses.oninput = updateCuotaFijaDisplay; }
        const graciaSel = document.getElementById('input-gracia');
        if(graciaSel){ graciaSel.onchange = updateCuotaFijaDisplay; }
        const capGraciaSel = document.getElementById('input-capitaliza-gracia');
        if(capGraciaSel){ capGraciaSel.onchange = updateCuotaFijaDisplay; }
        const plazoEl = document.getElementById('input-plazo');
        if(plazoEl){ plazoEl.oninput = updateCuotaFijaDisplay; }

        const btnCalc = document.getElementById('btn-calcular');
        if(btnCalc){ btnCalc.onclick = calcular; }

        const btnLimpiar = document.getElementById('btn-limpiar');
        if(btnLimpiar){
            btnLimpiar.onclick = function(){
                const tbody = document.getElementById('tbody-amort'); if(tbody) tbody.innerHTML = '';
                ['k-cuota','k-costo','k-tea','k-van','k-tir','k-neto'].forEach(id=>{ const el = document.getElementById(id); if(el) el.innerText = '-'; });
                window.__lastCalc = null;
                const btnExport = document.getElementById('btn-export'); if(btnExport) btnExport.disabled = true;
                console.debug('btn-limpiar onclick triggered');
                setDebugStatus('btn-limpiar-onclick', 'triggered');
            };
        }

        console.debug('forceAttachHandlers: done');
    }catch(e){
        console.warn('forceAttachHandlers failed', e);
    }
})();
