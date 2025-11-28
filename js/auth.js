// Minimal frontend auth helper for demo backend
// Stores { user, token } in localStorage under key "fmv_auth".

// Build an absolute URL using window.API_BASE when available
function buildUrl(path){
    if(!path) return path;
    if(/^https?:\/\//i.test(path)) return path; // already absolute
    const base = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE).replace(/\/$/, '') : '';
    // ensure path starts with slash
    if(path[0] !== '/') path = '/' + path;
    return base + path;
}

async function apiPost(path, body){
    const url = buildUrl(path);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw data;
    return data;
}

// alias used by some pages
async function postJson(path, body){
    return apiPost(path, body);
}

// Authenticated POST (adds x-auth-token header)
async function apiPostAuth(path, body){
    const url = buildUrl(path);
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if(token) headers['x-auth-token'] = token;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw data;
    return data;
}

function saveAuth(obj){ localStorage.setItem('fmv_auth', JSON.stringify(obj)); }
function loadAuth(){ try { return JSON.parse(localStorage.getItem('fmv_auth')); } catch(e){ return null; } }
function clearAuth(){ localStorage.removeItem('fmv_auth'); }
function getAuthToken(){ const a = loadAuth(); return a && a.token ? a.token : null; }

async function doRegister(firstName, lastName, email, password, dni){
    const name = ((firstName||'') + ' ' + (lastName||'')).trim();
    // send name,email,password; backend stores name field
    await apiPost('/api/register', { name, email, password, dni });
    return await doLogin(email, password);
}

async function doLogin(email, password, dni){
    // backend currently expects email,password only; include dni when available
    const body = { email, password };
    if(dni) body.dni = dni;
    const res = await apiPost('/api/login', body);
    saveAuth({ user: res.user, token: res.token });
    return res;
}

function doLogout(){ clearAuth(); updateAuthUI(); try{ history.back(); return; }catch(e){} window.location.href = 'login.html'; }

function updateAuthUI(){
    const auth = loadAuth();
    const userDiv = document.getElementById('auth-user');
    const username = document.getElementById('auth-username');
    if(!userDiv || !username) return;
    if(auth && auth.user){
        userDiv.style.display = 'flex';
        username.textContent = auth.user.name || auth.user.email || 'Usuario';
    } else {
        userDiv.style.display = 'none';
        username.textContent = '';
    }
}

function initAuthUI(){
    const btnLogout = document.getElementById('btn-logout');
    if(btnLogout) btnLogout.onclick = ()=>{ doLogout(); };

    // expose token getter
    window.fmvauth = { getToken: getAuthToken, getUser: ()=>{ const a = loadAuth(); return a && a.user ? a.user : null; } };
    updateAuthUI();
}

// Inicializar al cargar
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
    initAuthUI();
}

// Export helpers to global if needed elsewhere
window.apiPost = apiPost;
window.postJson = postJson;
window.apiPostAuth = apiPostAuth;
window.saveAuth = saveAuth;
window.loadAuth = loadAuth;
window.clearAuth = clearAuth;
window.getAuthToken = getAuthToken;