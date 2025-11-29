// javascript
(function(){
    // util
    function toNumber(v){ const n = Number(v); return isNaN(n)?0:n; }
    function round(v,dec=2){ return Math.round(v * Math.pow(10,dec))/Math.pow(10,dec); }

    /**
     * periodicRateFromInputs(ratePercent, tipo, capAnual)
     * ratePercent: porcentaje anual (ej: 8.5)
     * tipo: 'efectiva'|'nominal'
     * capAnual: periodos por año (m)
     * devuelve tasa periódica decimal
     */
    function periodicRateFromInputs(ratePercent, tipo, capAnual){
        const r = toNumber(ratePercent)/100;
        const m = Number(capAnual) || 12;
        if(tipo === 'efectiva'){
            return Math.pow(1 + r, 1/m) - 1;
        } else {
            return r / m;
        }
    }

    /**
     * cuotaFrances(principal, i, n)
     * cuota vencida método francés. i decimal periódico. devuelve 0 si principal <=0.
     */
    function cuotaFrances(principal, i, n){
        principal = Number(principal) || 0;
        n = Number(n) || 0;
        if(n <= 0) return NaN;
        if(principal <= 0) return 0;
        if(!isFinite(i) || i === 0) return principal / n;
        const pow = Math.pow(1 + i, n);
        return principal * (i * pow) / (pow - 1);
    }

    /**
     * npv(cashflows, tasa_periodica)
     * cashflows: array [CF0, CF1, ...] tasa_periodica decimal por periodo
     */
    function npv(cashflows, tasa_periodica){
        let s = 0;
        for(let t=0;t<cashflows.length;t++){
            s += cashflows[t] / Math.pow(1 + tasa_periodica, t);
        }
        return s;
    }

    /**
     * irr(cashflows, guess)
     * devuelve tasa periódica (decimal). Newton con fallback a bisección.
     */
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
                if(dfx === 0 || !isFinite(dfx)) break;
                const nx = x - fx/dfx;
                if(!isFinite(nx)) break;
                if(Math.abs(nx - x) < 1e-12) return nx;
                x = nx;
            }
        }catch(e){}
        // bisección fallback
        let a = -0.9999999, b = 10;
        let fa = f(a), fb = f(b);
        if(!(fa*fb < 0)){
            for(let k=0;k<80;k++){
                b *= 2;
                fb = f(b);
                if(fa*fb < 0) break;
            }
        }
        if(!(fa*fb < 0)) return NaN;
        for(let i=0;i<200;i++){
            const m = (a+b)/2;
            const fm = f(m);
            if(Math.abs(fm) < 1e-12) return m;
            if(fa*fm < 0){ b = m; fb = fm; } else { a = m; fa = fm; }
        }
        return (a+b)/2;
    }

    /**
     * computeTCEA(cashflows, periodsPerYear)
     * anualiza la IRR periódica: (1+irr_period)^m - 1
     */
    function computeTCEA(cashflows, periodsPerYear){
        const m = Number(periodsPerYear) || 12;
        const r_periodica = irr(cashflows);
        if(!isFinite(r_periodica)) return NaN;
        return Math.pow(1 + r_periodica, m) - 1;
    }

    /**
     * computeRegulatory(cashflows, capAnual, tasaDescuentoAnnual)
     * cashflows: array donde CF_0 es negativo = -monto_neto_recibido
     * capAnual: periodos por año (m)
     * tasaDescuentoAnnual: opcional, puede ser 6 o 0.06; se convierte y se usa para VAN
     * retorno: { costoTotal, van, tir_periodica, tir_anual, tcea, montoNeto }
     */
    function computeRegulatory(cashflows, capAnual, tasaDescuentoAnnual){
        const m = Number(capAnual) || 12;
        const montoNeto = -Number(cashflows[0]) || 0; // suponer CF_0 = -montoNeto
        const pagos = cashflows.slice(1).reduce((s,x)=>s + Number(x), 0);
        const costoTotal = pagos - montoNeto;
        // VAN con conversión periódica de la tasa de descuento annual
        let van = NaN;
        if(typeof tasaDescuentoAnnual !== 'undefined'){
            const rAnnual = Number(tasaDescuentoAnnual);
            const rA = (rAnnual > 1) ? rAnnual/100 : rAnnual;
            const r_periodic = Math.pow(1 + rA, 1/m) - 1;
            van = npv(cashflows, r_periodic);
        }
        const tir_periodica = irr(cashflows);
        const tir_anual = isFinite(tir_periodica) ? Math.pow(1 + tir_periodica, m) - 1 : NaN;
        const tcea = computeTCEA(cashflows, m);
        return {
            costoTotal: Number(Number(costoTotal).toFixed(2)),
            van: isFinite(van) ? Number(van.toFixed(2)) : NaN,
            tir_periodica,
            tir_anual,
            tcea,
            montoNeto: Number(montoNeto)
        };
    }

    // API pública
    const api = {
        toNumber,
        round,
        periodicRateFromInputs,
        cuotaFrances,
        npv,
        irr,
        computeTCEA,
        computeRegulatory
    };

    // Exports: CommonJS y navegador global compatibles
    if(typeof module !== 'undefined' && module.exports) module.exports = api;
    if(typeof window !== 'undefined'){
        // mantener compatibilidad con nombres usados en otros scripts
        window.calcLib = Object.assign(window.calcLib || {}, api);
        window.fmvc = window.fmvc || {};
        window.fmvc.calc = api;
    }
})();
