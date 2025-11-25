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

async function doRegister(name, email, password){
    await apiPost('/api/register', { name, email, password });
    return await doLogin(email, password);
}

async function doLogin(email, password){
    const res = await apiPost('/api/login', { email, password });
    saveAuth({ user: res.user, token: res.token });
    return res;
}

function doLogout(){ clearAuth(); updateAuthUI(); }

function updateAuthUI(){
    const auth = loadAuth();
    const guest = document.getElementById('auth-guest');
    const userDiv = document.getElementById('auth-user');
    const username = document.getElementById('auth-username');
    if(!guest || !userDiv || !username) return;
    if(auth && auth.user){
        guest.style.display = 'none';
        userDiv.style.display = 'flex';
        username.textContent = auth.user.name || auth.user.email || 'Usuario';
    } else {
        guest.style.display = 'flex';
        userDiv.style.display = 'none';
        username.textContent = '';
    }
}

function initAuthUI(){
    const openLogin = document.getElementById('btn-open-login');
    const closeLogin = document.getElementById('btn-close-login');
    const openReg = document.getElementById('btn-open-register');
    const closeReg = document.getElementById('btn-close-register');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const btnLogout = document.getElementById('btn-logout');

    if(openLogin) openLogin.onclick = ()=>{ const el = document.getElementById('login-form'); if(el) el.style.display='block'; };
    if(closeLogin) closeLogin.onclick = ()=>{ const el = document.getElementById('login-form'); if(el) el.style.display='none'; };
    if(openReg) openReg.onclick = ()=>{ const el = document.getElementById('register-form'); if(el) el.style.display='block'; };
    if(closeReg) closeReg.onclick = ()=>{ const el = document.getElementById('register-form'); if(el) el.style.display='none'; };
    if(btnLogout) btnLogout.onclick = ()=>{ doLogout(); };

    if(btnRegister) btnRegister.onclick = async ()=>{
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const err = document.getElementById('reg-error'); if(err) err.style.display='none';
        try{
            await doRegister(name, email, password);
            const frm = document.getElementById('register-form'); if(frm) frm.style.display='none';
            updateAuthUI();
        }catch(e){ if(err) { err.textContent = (e && e.error) ? e.error : 'Error registro'; err.style.display='block'; } }
    };

    if(btnLogin) btnLogin.onclick = async ()=>{
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const err = document.getElementById('login-error'); if(err) err.style.display='none';
        try{
            await doLogin(email, password);
            const frm = document.getElementById('login-form'); if(frm) frm.style.display='none';
            updateAuthUI();
        }catch(e){ if(err){ err.textContent = (e && e.error) ? e.error : 'Credenciales inválidas'; err.style.display='block'; } }
    };

    // expose token getter
    window.fmvauth = { getToken: getAuthToken, getUser: ()=>{ const a = loadAuth(); return a && a.user ? a.user : null; } };
    updateAuthUI();
}

document.addEventListener('DOMContentLoaded', ()=>{
    // create simple modals in case index.html doesn't include them
    if(!document.getElementById('login-form')){
        const div = document.createElement('div');
        div.id = 'login-form'; div.style.display='none'; div.style.position='fixed'; div.style.right='20px'; div.style.top='60px'; div.style.width='320px'; div.style.zIndex='999';
        div.innerHTML = `<div class="card"><strong>Login</strong><label style="margin-top:8px;">Email</label><input id="login-email" type="email"/><label style="margin-top:8px;">Password</label><input id="login-password" type="password"/><div style="display:flex; gap:8px; margin-top:10px;"><button id="btn-login">Entrar</button><button id="btn-close-login" style="background:#94a3b8;">Cerrar</button></div><div id="login-error" class="small danger" style="margin-top:8px; display:none;"></div></div>`;
        document.body.appendChild(div);
    }
    if(!document.getElementById('register-form')){
        const div = document.createElement('div');
        div.id = 'register-form'; div.style.display='none'; div.style.position='fixed'; div.style.right='20px'; div.style.top='60px'; div.style.width='320px'; div.style.zIndex='999';
        div.innerHTML = `<div class="card"><strong>Registro</strong><label style="margin-top:8px;">Nombre</label><input id="reg-name" type="text"/><label style="margin-top:8px;">Email</label><input id="reg-email" type="email"/><label style="margin-top:8px;">Password</label><input id="reg-password" type="password"/><div style="display:flex; gap:8px; margin-top:10px;"><button id="btn-register">Crear cuenta</button><button id="btn-close-register" style="background:#94a3b8;">Cerrar</button></div><div id="reg-error" class="small danger" style="margin-top:8px; display:none;"></div></div>`;
        document.body.appendChild(div);
    }

    initAuthUI();
});
