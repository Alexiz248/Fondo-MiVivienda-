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
document.getElementById('btn-calcular').addEventListener('click', calcular);

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
            const interes = saldo * i_periodo;
            interes_acum += interes;
            rows.push({periodo: periodo, pago:0, interes:interes, amort:0, capital:saldo, saldo: saldo});
            periodo++;
        }
        saldo += interes_acum;
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const interes = saldo * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            saldo = round(saldo - amort, 10);
            rows.push({periodo: periodo, pago, interes, amort, capital: null, saldo: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else if(tipoGracia === 'total' && mesesGracia > 0 && !capitalizaGracia){
        for(let m=0;m<mesesGracia;m++){
            rows.push({periodo: periodo, pago:0, interes:0, amort:0, capital:saldo, saldo: saldo});
            periodo++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const interes = saldo * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            saldo = round(saldo - amort, 10);
            rows.push({periodo: periodo, pago, interes, amort, capital: null, saldo: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else if(tipoGracia === 'partial' && mesesGracia > 0){
        for(let m=0;m<mesesGracia;m++){
            const interes = saldo * i_periodo;
            const pago = interes;
            rows.push({periodo: periodo, pago: round(pago,2), interes: round(interes,2), amort:0, capital:saldo, saldo:saldo});
            periodo++;
        }
        const n_restante = Math.max(1, plazo - mesesGracia);
        const cuota = cuotaFrances(saldo, i_periodo, n_restante);
        for(let p=0;p<n_restante;p++){
            const interes = saldo * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            saldo = round(saldo - amort, 10);
            rows.push({periodo: periodo, pago, interes, amort, capital: null, saldo: Math.max(0, round(saldo,2))});
            periodo++;
        }
    } else {
        const cuota = cuotaFrances(saldo, i_periodo, plazo);
        for(let p=0;p<plazo;p++){
            const interes = saldo * i_periodo;
            const amort = cuota - interes;
            const pago = cuota;
            saldo = round(saldo - amort, 10);
            rows.push({periodo: periodo, pago, interes, amort, capital: null, saldo: Math.max(0, round(saldo,2))});
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
      <td>${formatCurrency(r.pago || 0, moneda)}</td>
      <td>${formatCurrency(r.interes || 0, moneda)}</td>
      <td>${formatCurrency(r.amort || 0, moneda)}</td>
      <td>${formatCurrency(r.capital || 0, moneda)}</td>
      <td>${formatCurrency(r.saldo || 0, moneda)}</td>
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
}

/* -------------------------
 Export CSV (amort table)
--------------------------*/
document.getElementById('btn-export').addEventListener('click', function(){
    const data = window.__lastCalc;
    if(!data){ alert('Primero calcula.'); return; }
    const rows = data.rows;
    const lines = [['Periodo','Pago','Interés','Amortización','Capital','Saldo']];

    rows.forEach(r=>{
        lines.push([r.periodo,r.pago,r.interes,r.amort,r.capital,r.saldo]);
    });
    const csv = lines.map(r=>r.map(c=>String(c).replace(/"/g,'""')).map(c=>`"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabla_amortizacion.csv';
    a.click();
    URL.revokeObjectURL(url);
});

/* -------------------------
  Guardar / cargar cliente e inmueble
--------------------------*/
document.getElementById('btn-guardar-cliente').addEventListener('click', ()=>{
    const c = {
        nombre: document.getElementById('cliente-nombre').value,
        doc: document.getElementById('cliente-doc').value,
        ingresos: document.getElementById('cliente-ingresos').value,
        obs: document.getElementById('cliente-obs').value
    };
    // try saving to backend; fallback to localStorage
    (async ()=>{
        try{
            await apiPostAuth('/api/clientes', c);
            alert('Cliente guardado en backend.');
        }catch(e){
            localStorage.setItem('demo_cliente', JSON.stringify(c));
            alert('Cliente guardado localmente (demo). Si quieres persistir en servidor, inicia sesión.');
        }
    })();
});

document.getElementById('btn-cargar-cliente').addEventListener('click', ()=>{
    const s = localStorage.getItem('demo_cliente');
    if(!s){
        // cargar demo por defecto
        document.getElementById('cliente-nombre').value = 'Juan Pérez';
        document.getElementById('cliente-doc').value = '12345678';
        document.getElementById('cliente-ingresos').value = 3500;
        document.getElementById('cliente-obs').value = 'Cliente interesado en departamento 3B, perfil familiar.';
        alert('Demo cargada en formularios.');
        return;
    }
    const c = JSON.parse(s);
    document.getElementById('cliente-nombre').value = c.nombre;
    document.getElementById('cliente-doc').value = c.doc;
    document.getElementById('cliente-ingresos').value = c.ingresos;
    document.getElementById('cliente-obs').value = c.obs;
    alert('Cliente cargado desde demo local.');
});

document.getElementById('btn-guardar-inmueble').addEventListener('click', ()=>{
    const i = {
        proyecto: document.getElementById('inmueble-proy').value,
        unidad: document.getElementById('inmueble-unidad').value,
        precio: document.getElementById('inmueble-precio').value,
        desc: document.getElementById('inmueble-desc').value
    };
    (async ()=>{
        try{
            await apiPostAuth('/api/inmuebles', i);
            alert('Unidad guardada en backend.');
        }catch(e){
            localStorage.setItem('demo_inmueble', JSON.stringify(i));
            alert('Unidad guardada localmente (demo). Inicia sesión para guardar en servidor.');
        }
    })();
});

document.getElementById('btn-cargar-inmueble').addEventListener('click', ()=>{
    const s = localStorage.getItem('demo_inmueble');
    if(!s){
        document.getElementById('inmueble-proy').value = 'Condominio Los Olivos';
        document.getElementById('inmueble-unidad').value = 'A-302';
        document.getElementById('inmueble-precio').value = 200000;
        document.getElementById('inmueble-desc').value = 'Departamento 3D, 2 dormitorios, 2 baños.';
        alert('Demo de unidad cargada.');
        return;
    }
    const i = JSON.parse(s);
    document.getElementById('inmueble-proy').value = i.proyecto;
    document.getElementById('inmueble-unidad').value = i.unidad;
    document.getElementById('inmueble-precio').value = i.precio;
    document.getElementById('inmueble-desc').value = i.desc;
    alert('Unidad cargada desde demo local.');
});

document.getElementById('btn-limpiar').addEventListener('click', ()=>{
    document.getElementById('tbody-amort').innerHTML = '';
    ['k-cuota','k-costo','k-tea','k-van','k-tir','k-neto'].forEach(id=>document.getElementById(id).innerText='-');
    window.__lastCalc = null;
    document.getElementById('btn-export').disabled = true;
});
// javascript
// Inserta este bloque al final de `js/scripts.js`

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
        'Pago': `Pago total del periodo:\nIncluye Interés + Amortización.`,
        'Interés': `Interés del periodo:\nInterés = Saldo_{anterior} * i_periodo\n(i_periodo = tasa periódica mensual en decimal).`,
        'Amortización': `Amortización del periodo:\nAmort = Pago - Interés\nReduce el saldo del préstamo.`,
        'Capital': `Columna 'Capital':\nSiempre 0 en este esquema (columna reservada para otros usos).`,
        'Saldo': `Saldo pendiente:\nSaldo_{t} = Saldo_{t-1} - Amortización_{t}\nMonto de principal que queda por pagar.`
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