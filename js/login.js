// js/login.js
// Maneja la página de login y registro (login.html)
// Ahora usa postJson/saveAuth proporcionados por js/auth.js (cargado primero)

function showLogin(){
    const loginCard = document.getElementById('login-card');
    const regCard = document.getElementById('register-card');
    if(loginCard) loginCard.style.display = 'block';
    if(regCard) regCard.style.display = 'none';
    const errL = document.getElementById('page-login-error'); if(errL) errL.style.display='none';
    const errR = document.getElementById('page-reg-error'); if(errR) errR.style.display='none';
    const el = document.getElementById('page-login-dni') || document.getElementById('page-login-email'); if(el) el.focus();
}
function showRegister(){
    const loginCard = document.getElementById('login-card');
    const regCard = document.getElementById('register-card');
    if(loginCard) loginCard.style.display = 'none';
    if(regCard) regCard.style.display = 'block';
    const errL = document.getElementById('page-login-error'); if(errL) errL.style.display='none';
    const errR = document.getElementById('page-reg-error'); if(errR) errR.style.display='none';
    const el = document.getElementById('page-reg-first') || document.getElementById('page-reg-dni'); if(el) el.focus();
}

document.addEventListener('DOMContentLoaded', ()=>{
    const btnLogin = document.getElementById('page-btn-login');
    const btnRegister = document.getElementById('page-btn-register');
    const linkToRegister = document.getElementById('link-to-register');
    const linkToLogin = document.getElementById('link-to-login');

    if(linkToRegister) linkToRegister.onclick = (e)=>{ e.preventDefault(); showRegister(); };
    if(linkToLogin) linkToLogin.onclick = (e)=>{ e.preventDefault(); showLogin(); };

    // iniciar mostrando el login por defecto
    showLogin();

    if(btnRegister){ btnRegister.onclick = async ()=>{
        const first = document.getElementById('page-reg-first').value.trim();
        const last = document.getElementById('page-reg-last').value.trim();
        const dni = document.getElementById('page-reg-dni').value.trim();
        const email = document.getElementById('page-reg-email').value.trim();
        const password = document.getElementById('page-reg-password').value;
        const err = document.getElementById('page-reg-error'); if(err) err.style.display='none';
        try{
            const name = ((first||'') + ' ' + (last||'')).trim();
            await postJson('/api/register', { name, email, password, dni });
            // auto-login
            const loginRes = await postJson('/api/login', { email, password, dni });
            saveAuth({ user: loginRes.user, token: loginRes.token });
            window.location.href = 'index.html';
        }catch(e){ if(err){ err.textContent = (e && e.error) ? e.error : 'Error registro'; err.style.display='block'; } }
    } }

    if(btnLogin){ btnLogin.onclick = async ()=>{
        const email = document.getElementById('page-login-email').value.trim();
        const password = document.getElementById('page-login-password').value;
        const dni = document.getElementById('page-login-dni').value.trim();
        const err = document.getElementById('page-login-error'); if(err) err.style.display='none';
        try{
            const res = await postJson('/api/login', { email, password, dni });
            saveAuth({ user: res.user, token: res.token });
            window.location.href = 'index.html';
        }catch(e){ if(err){ err.textContent = (e && e.error) ? e.error : 'Credenciales inválidas'; err.style.display='block'; } }
    } }
});