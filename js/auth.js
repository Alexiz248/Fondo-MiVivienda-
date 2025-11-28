// Minimal frontend auth helper for demo backend
// Stores { user, token } in localStorage under key "fmv_auth".

async function apiPost(path, body){
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
