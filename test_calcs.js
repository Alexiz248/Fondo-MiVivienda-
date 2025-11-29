function toNumber(v){ const n = Number(v); return isNaN(n)?0:n; }
function periodicRateFromInputs(ratePercent, tipo, capAnual){
    const r = toNumber(ratePercent)/100;
    const m = Number(capAnual) || 12;
    if(tipo === 'efectiva'){
        return Math.pow(1 + r, 1/m) - 1;
    } else {
        return r / m;
    }
}
function cuotaFrances(principal, i, n){
    if(i === 0) return principal / n;
    return principal * i / (1 - Math.pow(1 + i, -n));
}

// Example from slides
const precio = 1800000;
const cuotaInicialPct = 0.20;
const principal = precio * (1 - cuotaInicialPct); // 1,440,000
const TEA = 9; // percent
const freq = 2; // semestral
const periodoAnios = 4; // years
const totalPeriods = periodoAnios * freq; // 8

const i = periodicRateFromInputs(TEA, 'efectiva', freq);
const cuota = cuotaFrances(principal, i, totalPeriods);
console.log('principal', principal);
console.log('TEP (periodic rate)', i);
console.log('totalPeriods', totalPeriods);
console.log('cuota (per period)', cuota);
console.log('cuota (formatted)', cuota.toFixed(2));

// Also compute amortization rows to compare first rows
let saldo = principal;
for(let p=1;p<=totalPeriods;p++){
  const interes = saldo * i;
  const amort = cuota - interes;
  const saldo_final = Math.max(0, Math.round((saldo - amort) * 100)/100);
  console.log(p, 'saldo_inicial', saldo.toFixed(2), 'interes', interes.toFixed(2), 'amort', amort.toFixed(2), 'cuota', cuota.toFixed(2), 'saldo_final', saldo_final.toFixed(2));
  saldo = saldo_final;
}

