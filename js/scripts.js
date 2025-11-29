// javascript
// File: `js/scripts.js`
// Lógica cliente: tasas periódicas, modo fijo / multi-segmentos, cálculo y UI helpers

function toNumber(v){ const n = Number(v); return isNaN(n)?0:n; }
function round(v,dec=2){ return Math.round(v * Math.pow(10,dec))/Math.pow(10,dec); }

// Convertir tasa anual ingresada a tasa por periodo según tipo y capitalización
function periodicRateFromInputs(ratePercent, tipo, capAnual){
    const r = toNumber(ratePercent)/100;
    const m = Number(capAnual) || 12;
    if(tipo === 'efectiva'){
        return Math.pow(1 + r, 1 / m) - 1;
    } else {
        return r / m;
    }
}

function cuotaFrances(principal, i, n){
    if(i === 0) return principal / n;
    return principal * i / (1 - Math.pow(1 + i, -n));
}

// Cuota cuando tasas varían por periodo: A = P / Σ_{t=1..n} 1 / Π_{k=1..t} (1+i_k)
function cuotaFrancesVariable(principal, ratesArray){
    const n = ratesArray.length;
    if(n === 0) return NaN;
    const allEqual = ratesArray.every((v,i,arr)=> Math.abs(v - arr[0]) < 1e-12);
    if(allEqual){
        return cuotaFrances(principal, ratesArray[0], n);
    }
    let denom = 0;
    let prod = 1;
    for(let t=0;t<n;t++){
        prod *= (1 + ratesArray[t]);
        denom += 1 / prod;
    }
    if(denom === 0) return NaN;
    return principal / denom;
}

// Parser para "schedule" de tasas: "8@4;9@4" o "8;9" o "9"
function buildPeriodRates(scheduleStr, tipo, capAnual, plazo){
    scheduleStr = String(scheduleStr || '').trim();
    const parts = scheduleStr.split(/[;,]/).map(s=>s.trim()).filter(Boolean);
    if(parts.length === 0){
        return Array(plazo).fill(NaN);
    }
    const hasAt = parts.some(p=>p.includes('@'));
    const result = [];
    if(hasAt){
        for(const p of parts){
            const m = p.match(/^([\d.,]+)\s*%?\s*(?:@\s*(\d+))?$/);
            if(!m) continue;
            const rate = parseFloat(m[1].replace(',', '.'));
            const count = m[2] ? parseInt(m[2],10) : 0;
            const i = periodicRateFromInputs(rate, tipo, capAnual);
            const c = count || 0;
            for(let k=0;k<c;k++) result.push(i);
        }
        if(result.length < plazo){
            const last = result.length ? result[result.length-1] : NaN;
            while(result.length < plazo) result.push(last);
        } else if(result.length > plazo){
            result.length = plazo;
        }
        return result;
    }
    if(parts.length > 1){
        const baseCount = Math.floor(plazo / parts.length);
        let used = 0;
        for(let iPart=0;iPart<parts.length;iPart++){
            const rate = parseFloat(parts[iPart].replace(',', '.')) || 0;
            const i = periodicRateFromInputs(rate, tipo, capAnual);
            const count = (iPart === parts.length-1) ? (plazo - used) : baseCount;
            for(let k=0;k<count;k++) { result.push(i); used++; }
        }
        return result;
    }
    const only = parseFloat(parts[0].replace(',', '.'));
    const ip = periodicRateFromInputs(only, tipo, capAnual);
    return Array(plazo).fill(ip);
}

function npv(cashflows, tasa_periodica){
    let s = 0;
    for(let t=0;t<cashflows.length;t++){
        s += cashflows[t] / Math.pow(1 + tasa_periodica, t);
    }
    return s;
}

function irr(cashflows, guess=0.1){
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
    let a = -0.9999999, b = 10;
    let fa = f(a), fb = f(b);
    if(!(fa*fb < 0)){
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

async function apiPostAuth(path, body){
    const headers = { 'Content-Type': 'application/json' };
    try{
        if(window && window.fmvauth && typeof window.fmvauth.getToken === 'function'){
            const t = window.fmvauth.getToken();
            if(t) headers['x-auth-token'] = t;
        }
    }catch(e){}
    const url = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE).replace(/\/$/, '') + path : path;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw data;
    return data;
}

/* -------------------------
  Nuevo: lectura de tasa según modo UI (fixed | multi)
--------------------------*/
function getTasaInputRawFromUI(){
    const modeEl = document.getElementById('input-tasa-mode');
    if(!modeEl || modeEl.value === 'fixed'){
        return String(document.getElementById('input-tasa').value || '').trim();
    }
    // modo multi: componer string "rate@count;rate2@count2;..."
    const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value) || 0));
    const container = document.getElementById('tasa-segments-container');
    if(!container) return String(document.getElementById('input-tasa').value || '').trim();
    const segEls = container.querySelectorAll('.tasa-seg');
    const segments = [];
    let totalCounts = 0;
    segEls.forEach(el=>{
        const rateEl = el.querySelector('.tasa-seg-rate');
        const cntEl = el.querySelector('.tasa-seg-count');
        const rate = rateEl ? String(rateEl.value||'').trim() : '';
        const cnt = cntEl ? Math.max(0, Math.floor(Number(cntEl.value))) : 0;
        if(rate !== ''){
            if(cnt > 0){
                segments.push(`${rate}@${cnt}`);
                totalCounts += cnt;
            } else {
                segments.push(`${rate}`);
            }
        }
    });
    // ajustar último segmento para que la suma de conteos sea igual al plazo (si el usuario incluyó conteos)
    if(totalCounts > 0 && totalCounts !== plazo){
        const last = segments.length -1;
        if(last >=0){
            const lastSeg = segments[last];
            const m = lastSeg.match(/^([\d.,]+)(?:@(\d+))?$/);
            const lastCount = m && m[2] ? parseInt(m[2],10) : 0;
            const diff = plazo - totalCounts;
            const newCount = Math.max((lastCount || 0) + diff, 1);
            segments[last] = `${m[1]}@${newCount}`;
        }
    }
    return segments.join(';') || String(document.getElementById('input-tasa').value || '').trim();
}

// Renderiza inputs para los segmentos
function renderTasaSegments(count){
    const container = document.getElementById('tasa-segments-container');
    if(!container) return;
    container.innerHTML = '';
    const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value) || 0));
    const base = Math.floor(plazo / count);
    let used = 0;
    for(let i=0;i<count;i++){
        const defaultCount = (i === count-1) ? (plazo - used) : base;
        used += defaultCount;
        const wrapper = document.createElement('div');
        wrapper.className = 'tasa-seg';
        wrapper.style.marginBottom = '6px';
        wrapper.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 100px; gap:8px; align-items:center;">
              <input class="tasa-seg-rate" type="number" step="0.0001" placeholder="Tasa % (ej. 8)" />
              <input class="tasa-seg-count" type="number" min="0" value="${defaultCount}" />
            </div>
        `;
        container.appendChild(wrapper);
    }
}

// Inicializa UI del modo de tasas y listeners
function initTasaModeUI(){
    const modeEl = document.getElementById('input-tasa-mode');
    const multiControls = document.getElementById('tasa-multiple-controls');
    const segCount = document.getElementById('input-tasa-segments-count');
    if(modeEl){
        modeEl.addEventListener('change', ()=>{
            if(modeEl.value === 'multi'){
                if(multiControls) multiControls.style.display = 'block';
            } else {
                if(multiControls) multiControls.style.display = 'none';
            }
            updateTasaMensualDisplay();
            updateCuotaFijaDisplay();
        });
    }
    if(segCount){
        segCount.addEventListener('change', ()=>{
            const c = Math.max(2, Math.min(4, parseInt(segCount.value,10) || 2));
            renderTasaSegments(c);
            updateTasaMensualDisplay();
            updateCuotaFijaDisplay();
        });
    }
    const plazoEl = document.getElementById('input-plazo');
    if(plazoEl){
        plazoEl.addEventListener('input', ()=>{
            if(modeEl && modeEl.value === 'multi' && segCount){
                renderTasaSegments(parseInt(segCount.value,10) || 2);
                updateTasaMensualDisplay();
                updateCuotaFijaDisplay();
            }
        });
    }
    const container = document.getElementById('tasa-segments-container');
    if(container){
        container.addEventListener('input', ()=>{
            updateTasaMensualDisplay();
            updateCuotaFijaDisplay();
        });
    }
    // estado inicial
    if(modeEl && modeEl.value === 'multi'){
        if(multiControls) multiControls.style.display = 'block';
    } else {
        if(multiControls) multiControls.style.display = 'none';
    }
    renderTasaSegments(parseInt(segCount ? segCount.value : 2,10) || 2);
}

/* -------------------------
  Cálculo principal (usa getTasaInputRawFromUI)
--------------------------*/
function calcular(){
    console.log('calcular: inicio');
    const moneda = document.getElementById('cfg-moneda').value;
    const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
    const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
    const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value)));
    const tasaAnualRaw = getTasaInputRawFromUI();
    const principal = toNumber(document.getElementById('input-principal').value);
    const bono = toNumber(document.getElementById('input-bono').value);
    const comisionFija = toNumber(document.getElementById('input-comision-fija') ? document.getElementById('input-comision-fija').value : 0);
    const comisionPct = toNumber(document.getElementById('input-comision-pct') ? document.getElementById('input-comision-pct').value : 0) / 100;
    const seguroPeriodico = toNumber(document.getElementById('input-seguro-periodico') ? document.getElementById('input-seguro-periodico').value : 0);
    const tipoGracia = document.getElementById('input-gracia').value;
    const mesesGracia = Math.max(0, Math.floor(Number(document.getElementById('input-meses-gracia').value)));
    const capitalizaGracia = document.getElementById('input-capitaliza-gracia').value === 'si';
    const tasaDescuento = toNumber(document.getElementById('input-tasa-descuento').value)/100;

    const ratesAll = buildPeriodRates(tasaAnualRaw, tipoTasa, capAnual, plazo);
    const i_first = ratesAll[0];
    const tea = isFinite(i_first) ? Math.pow(1 + i_first, 12) - 1 : NaN;

    const tbody = document.getElementById('tbody-amort');
    if(tbody) tbody.innerHTML = '';

    let saldo = principal;
    let periodo = 1;
    const rows = [];
    let currentIndex = 0;

    if(tipoGracia === 'total' && mesesGracia > 0 && capitalizaGracia){
        for(let m=0;m<mesesGracia && currentIndex < ratesAll.length;m++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * (ratesAll[currentIndex] || 0);
            const saldo_final = round(saldo_inicial + interes, 2);
            rows.push({
                periodo: periodo,
                pago: 0,
                interes: round(interes,2),
                amort: 0,
                cuota: null,
                saldo_inicial: saldo_inicial,
                saldo_final: saldo_final
            });
            periodo++;
            saldo = saldo_final;
            currentIndex++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const rates_resto = ratesAll.slice(currentIndex, currentIndex + n_restante);
        const cuota = cuotaFrancesVariable(saldo, rates_resto);
        for(let p=0;p<n_restante;p++){
            const i = rates_resto[p] || 0;
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes: round(interes,2), amort: round(amort,2), cuota: round(cuota,2), saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++; currentIndex++;
        }
    } else if(tipoGracia === 'total' && mesesGracia > 0 && !capitalizaGracia){
        for(let m=0;m<mesesGracia;m++){
            const saldo_inicial = saldo;
            rows.push({periodo: periodo, pago:0, interes:0, amort:0, cuota:null, saldo_inicial: saldo_inicial, saldo_final: saldo});
            periodo++; currentIndex++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const rates_resto = ratesAll.slice(currentIndex, currentIndex + n_restante);
        const cuota = cuotaFrancesVariable(saldo, rates_resto);
        for(let p=0;p<n_restante;p++){
            const i = rates_resto[p] || 0;
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes: round(interes,2), amort: round(amort,2), cuota: round(cuota,2), saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else if(tipoGracia === 'partial' && mesesGracia > 0){
        for(let m=0;m<mesesGracia && currentIndex < ratesAll.length;m++){
            const saldo_inicial = saldo;
            const interes = saldo_inicial * (ratesAll[currentIndex] || 0);
            const pago = interes;
            rows.push({periodo: periodo, pago: round(pago,2), interes: round(interes,2), amort:0, cuota:null, saldo_inicial: saldo_inicial, saldo_final: saldo});
            periodo++; currentIndex++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const rates_resto = ratesAll.slice(currentIndex, currentIndex + n_restante);
        const cuota = cuotaFrancesVariable(saldo, rates_resto);
        for(let p=0;p<n_restante;p++){
            const i = rates_resto[p] || 0;
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes: round(interes,2), amort: round(amort,2), cuota: round(cuota,2), saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++; currentIndex++;
        }
    } else {
        const rates_resto = ratesAll.slice(0, plazo);
        const cuota = cuotaFrancesVariable(saldo, rates_resto);
        for(let p=0;p<plazo;p++){
            const i = rates_resto[p] || 0;
            const saldo_inicial = saldo;
            const interes = saldo_inicial * i;
            const amort = cuota - interes;
            const pago = cuota;
            const saldo_final = Math.max(0, round(saldo_inicial - amort, 10));
            saldo = round(saldo_final, 10);
            rows.push({periodo: periodo, pago, interes: round(interes,2), amort: round(amort,2), cuota: round(cuota,2), saldo_inicial: saldo_inicial, saldo_final: Math.max(0, round(saldo,2))});
            periodo++;
        }
    }

    const cf = [];
    const monto_recibido = principal + bono;
    const comisionSobrePrincipal = comisionPct * principal;
    const cf0 = -(monto_recibido - comisionFija - comisionSobrePrincipal);
    cf.push(cf0);
    let acumuladoPagos = 0;
    rows.forEach(r=>{
        const pagoBase = round(toNumber(r.pago),2);
        const pagoConSeguro = (pagoBase > 0) ? round(pagoBase + seguroPeriodico,2) : pagoBase;
        cf.push(pagoConSeguro);
        acumuladoPagos += pagoConSeguro;
    });

    const tbodyHTML = rows.map(r=>`<tr>
      <td class="left">${r.periodo}</td>
      <td>${formatCurrency(r.saldo_inicial || 0, moneda)}</td>
      <td>${formatCurrency(r.interes || 0, moneda)}</td>
      <td>${formatCurrency(r.amort || 0, moneda)}</td>
      <td>${formatCurrency(r.cuota || 0, moneda)}</td>
      <td>${formatCurrency(r.saldo_final || 0, moneda)}</td>
    </tr>`).join('');
    if(document.getElementById('tbody-amort')) document.getElementById('tbody-amort').innerHTML = tbodyHTML;

    const cuotaProm = rows.filter(r=>r.pago>0).length? rows.filter(r=>r.pago>0).reduce((s,x)=>s+x.pago,0) / rows.filter(r=>r.pago>0).length : 0;
    let regs = null;
    try{
        if(window && window.fmvc && window.fmvc.calc && typeof window.fmvc.calc.computeRegulatory === 'function'){
            regs = window.fmvc.calc.computeRegulatory(cf, capAnual, tasaDescuento);
        }
    }catch(e){ regs = null; }

    const costoTotal = regs && typeof regs.costoTotal !== 'undefined' ? regs.costoTotal : round(acumuladoPagos - (monto_recibido - comisionFija - comisionSobrePrincipal),2);
    const van = regs && typeof regs.van !== 'undefined' && !isNaN(regs.van) ? regs.van : round(npv(cf, tasaDescuento/ (capAnual || 12) ),2);
    const tir_periodica = regs && typeof regs.tir_periodica !== 'undefined' ? regs.tir_periodica : irr(cf);
    const tir_anual = regs && typeof regs.tir_anual !== 'undefined' ? regs.tir_anual : (isNaN(tir_periodica)? NaN : Math.pow(1 + tir_periodica, (capAnual || 12)) - 1);
    const tcea = regs && typeof regs.tcea !== 'undefined' ? regs.tcea : (isNaN(tir_periodica) ? NaN : Math.pow(1 + tir_periodica, (capAnual || 12)) - 1);

    function setKPI(id, value){
        const el = document.getElementById(id);
        if(!el) return;
        el.innerText = value;
    }

    setKPI('k-cuota', isFinite(cuotaProm) ? formatCurrency(round(cuotaProm,2), moneda) : 'N/A');
    setKPI('k-costo', isFinite(costoTotal) ? formatCurrency(costoTotal, moneda) : 'N/A');
    setKPI('k-tea', isFinite(tea) ? (round(tea*100,4) + ' %') : 'N/A');
    setKPI('k-van', isFinite(van) ? formatCurrency(van, moneda) : 'N/A');
    setKPI('k-tir', isFinite(tir_anual) ? (round(tir_anual*100,4) + ' %') : 'N/A');
    setKPI('k-neto', isFinite(monto_recibido - comisionFija - comisionSobrePrincipal) ? formatCurrency(monto_recibido - comisionFija - comisionSobrePrincipal, moneda) : 'N/A');

    window.__lastCalc = {rows, cf, moneda, principal, bono, tasaAnualRaw, tipoTasa, capAnual};

    const btnExportEl = document.getElementById('btn-export');
    if(btnExportEl) btnExportEl.disabled = false;

    (async ()=>{
        try{
            const payload = {
                moneda, tipoTasa, capAnual, plazo, tasaAnualRaw, principal, bono, tipoGracia, mesesGracia, capitalizaGracia,
                cuota_sample: rows.find(r=>r.pago>0) ? rows.find(r=>r.pago>0).pago : null,
                tea: tea,
                van: van,
                tir_mensual: tir_periodica,
                tir_anual: tir_anual,
                timestamp: new Date().toISOString()
            };
            await apiPostAuth('/api/operations', { type: 'calculation', payload });
        }catch(e){}
    })();

    console.log('calcular: fin', {cuotaProm, costoTotal, van, tir_anual});
    try{ updateCuotaFijaDisplay(); }catch(e){}
}

/* -------------------------
 updateTasaMensualDisplay & updateCuotaFijaDisplay (usan getTasaInputRawFromUI)
--------------------------*/
function updateTasaMensualDisplay(){
    try{
        const tasaAnualRaw = getTasaInputRawFromUI();
        const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
        const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
        const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value)));
        const rates = buildPeriodRates(tasaAnualRaw, tipoTasa, capAnual, plazo);
        const i_periodo = rates[0];
        const el = document.getElementById('input-tasa-mensual');
        if(!el) return;
        if(!isFinite(i_periodo)) el.value = '-';
        else el.value = (i_periodo * 100).toFixed(6) + ' %';
        console.debug('updateTasaMensualDisplay:', {tasaAnualRaw, tipoTasa, capAnual, i_periodo});
    }catch(e){ console.warn('updateTasaMensualDisplay error', e); }
}

function updateCuotaFijaDisplay(){
    try{
        const principal = toNumber(document.getElementById('input-principal').value);
        const tasaAnualRaw = getTasaInputRawFromUI();
        const tipoTasa = document.getElementById('cfg-tipo-tasa').value;
        const capAnual = Number(document.getElementById('cfg-capitalizacion').value);
        const tipoGracia = document.getElementById('input-gracia') ? document.getElementById('input-gracia').value : 'none';
        const mesesGracia = Math.max(0, Math.floor(Number(document.getElementById('input-meses-gracia').value)));
        const capitalizaGracia = document.getElementById('input-capitaliza-gracia') ? (document.getElementById('input-capitaliza-gracia').value === 'si') : false;
        const plazo = Math.max(1, Math.floor(Number(document.getElementById('input-plazo').value) || 0));

        const ratesAll = buildPeriodRates(tasaAnualRaw, tipoTasa, capAnual, plazo);
        const i_first = ratesAll[0];
        const el = document.getElementById('input-cuota-fija');
        const elMensual = document.getElementById('input-cuota-fija-mensual');
        if(!el) return;

        let montoCapitalizado = principal;
        if(tipoGracia === 'total' && capitalizaGracia && mesesGracia > 0){
            let prod = 1;
            for(let k=0;k<mesesGracia && k<ratesAll.length;k++) prod *= (1 + (ratesAll[k] || 0));
            montoCapitalizado = principal * prod;
        }

        el.value = (isFinite(montoCapitalizado) ? formatCurrency(round(montoCapitalizado,2), document.getElementById('cfg-moneda').value) : '-');

        const n_restante = Math.max(1, plazo - mesesGracia);
        const rates_resto = ratesAll.slice(mesesGracia, mesesGracia + n_restante);
        const cuotaMensual = cuotaFrancesVariable(montoCapitalizado, rates_resto);

        if(elMensual){
            elMensual.value = (isFinite(cuotaMensual) ? formatCurrency(round(cuotaMensual,2), document.getElementById('cfg-moneda').value) : '-');
        }

        console.debug('updateCuotaFijaDisplay debug', {
            principal, tasaAnualRaw, tipoTasa, capAnual, ratesAll,
            tipoGracia, capitalizaGracia, mesesGracia, montoCapitalizado, plazo, n_restante, cuotaMensual
        });
    }catch(e){ console.warn('updateCuotaFijaDisplay error', e); if(document.getElementById('input-cuota-fija-mensual')) document.getElementById('input-cuota-fija-mensual').value='-'; }
}

/* -------------------------
 Tooltips, listeners y aseguramiento
--------------------------*/
(function addKpiTooltipStyles(){
    const css = `
    .kpi[data-tip]{ position:relative; cursor:help; }
    .kpi[data-tip]::after{ content: attr(data-tip); position:absolute; left:50%; transform:translateX(-50%); top: calc(100% + 8px); background: rgba(15,23,42,0.95); color:#fff; padding:10px; border-radius:8px; white-space:pre-wrap; font-size:12px; min-width:220px; max-width:360px; box-shadow:0 6px 18px rgba(0,0,0,0.12); display:none; z-index:999; text-align:left; }
    .kpi[data-tip]:hover::after{ display:block; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-created-by','kpi-tooltips');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
})();

(function setKpiTooltips(){
    const tips = {
        'k-cuota': `Cuota (método francés):\\nA = P * i / (1 - (1 + i)^(-n))`,
        'k-costo': `Costo total del crédito:\\nΣ Pagos - Monto neto recibido`,
        'k-tea': `TEA = (1 + i_periodo)^{12} - 1`,
        'k-van': `VAN = Σ CF_t / (1 + r)^t`,
        'k-tir': `TIR: r tal que Σ CF_t / (1+r)^t = 0`,
        'k-neto': `Monto neto recibido = principal + bono`
    };
    Object.keys(tips).forEach(id=>{
        const el = document.getElementById(id);
        if(!el) return;
        const parent = el.closest('.kpi') || el.parentElement;
        if(parent) { parent.setAttribute('data-tip', tips[id]); parent.setAttribute('aria-label', tips[id]); } else { el.setAttribute('title', tips[id]); }
    });
})();

(function addTableHeaderTooltips(){
    const css = `
    th[data-tip]{ position:relative; cursor:help; }
    th[data-tip]::after{ content: attr(data-tip); position:absolute; left:50%; transform:translateX(-50%); top: calc(100% + 8px); background: rgba(15,23,42,0.95); color:#fff; padding:8px; border-radius:8px; white-space:pre-wrap; font-size:12px; min-width:180px; max-width:360px; box-shadow:0 6px 18px rgba(0,0,0,0.12); display:none; z-index:999; text-align:left; }
    th[data-tip]:hover::after{ display:block; }
    `;
    const s = document.createElement('style');
    s.setAttribute('data-created-by','table-header-tooltips');
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);

    const tips = {
        'Saldo inicial': `Saldo inicial del periodo:\\nSaldo con el que arranca el periodo.`,
        'Interés': `Interés = Saldo_{anterior} * i_periodo.`,
        'Amortización': `Amort = Pago - Interés.`,
        'Cuota': `Cuota fija calculada por el método francés.`,
        'Saldo final': `Saldo después de aplicar la amortización.`
    };

    function applyTips(){
        const ths = document.querySelectorAll('#tabla-amort thead th');
        ths.forEach(th=>{
            const txt = (th.textContent || '').trim();
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

function ensureEssentialListeners(){
    try{
        const tasaInput = document.getElementById('input-tasa');
        if(tasaInput && !tasaInput.__listenerAttached){
            tasaInput.addEventListener('input', updateTasaMensualDisplay);
            tasaInput.addEventListener('input', updateCuotaFijaDisplay);
            tasaInput.__listenerAttached = true;
        }
        const tipoSelect = document.getElementById('cfg-tipo-tasa');
        if(tipoSelect && !tipoSelect.__listenerAttached){
            tipoSelect.addEventListener('change', function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); });
            tipoSelect.__listenerAttached = true;
        }
        const capSelect = document.getElementById('cfg-capitalizacion');
        if(capSelect && !capSelect.__listenerAttached){
            capSelect.addEventListener('change', function(){ updateTasaMensualDisplay(); updateCuotaFijaDisplay(); });
            capSelect.__listenerAttached = true;
        }
        const principal = document.getElementById('input-principal');
        if(principal && !principal.__listenerAttached){
            principal.addEventListener('input', updateCuotaFijaDisplay);
            principal.__listenerAttached = true;
        }
        const meses = document.getElementById('input-meses-gracia');
        if(meses && !meses.__listenerAttached){
            meses.addEventListener('input', updateCuotaFijaDisplay);
            meses.__listenerAttached = true;
        }
        const tipoGraciaEl = document.getElementById('input-gracia');
        if(tipoGraciaEl && !tipoGraciaEl.__listenerAttached){
            tipoGraciaEl.addEventListener('change', updateCuotaFijaDisplay);
            tipoGraciaEl.__listenerAttached = true;
        }
        const capGraciaEl = document.getElementById('input-capitaliza-gracia');
        if(capGraciaEl && !capGraciaEl.__listenerAttached){
            capGraciaEl.addEventListener('change', updateCuotaFijaDisplay);
            capGraciaEl.__listenerAttached = true;
        }
        const plazoEl = document.getElementById('input-plazo');
        if(plazoEl && !plazoEl.__listenerAttached){
            plazoEl.addEventListener('input', updateCuotaFijaDisplay);
            plazoEl.__listenerAttached = true;
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
        }
        const btnCalc = document.getElementById('btn-calcular');
        if(btnCalc && !btnCalc.__listenerAttached){
            btnCalc.addEventListener('click', calcular);
            btnCalc.__listenerAttached = true;
        }

        // inicializar UI de modo de tasas
        try{ initTasaModeUI(); }catch(e){ console.warn('initTasaModeUI failed', e); }

        updateTasaMensualDisplay();
        updateCuotaFijaDisplay();
    }catch(e){
        console.warn('ensureEssentialListeners failed', e);
    }
}

(function forceAttachHandlers(){
    try{
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
            };
        }

        // init UI de tasa
        try{ initTasaModeUI(); }catch(e){ console.warn('initTasaModeUI failed', e); }

        console.debug('forceAttachHandlers: done');
    }catch(e){
        console.warn('forceAttachHandlers failed', e);
    }
})();

// Exponer funciones para depuración si se necesita
window.calcular = calcular;
window.updateTasaMensualDisplay = updateTasaMensualDisplay;
window.updateCuotaFijaDisplay = updateCuotaFijaDisplay;
