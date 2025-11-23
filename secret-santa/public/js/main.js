let accessToken = localStorage.getItem('accessToken');
let currentUser = null;

// Show appropriate form on load
document.addEventListener('DOMContentLoaded', () => {
    if (accessToken) {
        try {
            const payload = parseJwt(accessToken);
            if (payload.isAdmin) {
                window.location.href = '/admin.html';
            } else {
                loadParticipantDashboard();
            }
        } catch (e) {
            logout();
        }
    } else {
        showParticipantLogin();
    }
});

function showAdminLogin() {
    document.getElementById('adminLoginForm').style.display = 'block';
    document.getElementById('participantLoginForm').style.display = 'none';
    document.getElementById('adminError').textContent = '';
}

function showParticipantLogin() {
    document.getElementById('adminLoginForm').style.display = 'none';
    document.getElementById('participantLoginForm').style.display = 'block';
    document.getElementById('participantError').textContent = '';
}

async function handleAdminLogin(event) {
    event.preventDefault();

    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const btn = event.target.querySelector('button');

    setLoading(btn, true);

    try {
        const response = await fetch('/api/auth/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        accessToken = data.accessToken;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        window.location.href = '/admin.html';
    } catch (error) {
        document.getElementById('adminError').textContent = error.message;
    } finally {
        setLoading(btn, false);
    }
}

async function handleParticipantLogin(event) {
    event.preventDefault();

    const email = document.getElementById('participantEmail').value;
    const password = document.getElementById('participantPassword').value;
    const btn = event.target.querySelector('button');

    setLoading(btn, true);

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        accessToken = data.accessToken;
        currentUser = data.user;

        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        loadParticipantDashboard();
    } catch (error) {
        document.getElementById('participantError').textContent = error.message;
    } finally {
        setLoading(btn, false);
    }
}

async function loadParticipantDashboard() {
    try {
        const statusResponse = await apiCall('/api/match/status');

        document.getElementById('participantLoginForm').style.display = 'none';
        document.getElementById('adminLoginForm').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

        const payload = parseJwt(accessToken);
        document.getElementById('userName').textContent = payload.email.split('@')[0];

        if (!statusResponse.allRegistered) {
            document.getElementById('statusMessage').textContent = '⏳ Waiting for all participants to register...';
        } else if (statusResponse.matchesGenerated || statusResponse.allRegistered) {
            document.getElementById('statusMessage').style.display = 'none';
            document.getElementById('matchReveal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        logout();
    }
}

async function revealMatch(event) {
    event.preventDefault();

    const password = document.getElementById('matchPassword').value;
    const btn = event.target.querySelector('button');

    setLoading(btn, true);

    try {
        const response = await apiCall(`/api/match/my-match?password=${encodeURIComponent(password)}`);

        document.getElementById('matchReveal').style.display = 'none';
        document.getElementById('matchDisplay').style.display = 'block';
        document.getElementById('recipientName').textContent = response.match.name;
        document.getElementById('recipientEmail').textContent = response.match.email;

        // Display rules
        const rules = response.rules;
        document.getElementById('rulesDisplay').innerHTML = `
      <ul>
        <li>💵 Spending Limit: $${rules.maxSpend} maximum</li>
        ${rules.bonusItem ? `<li>💿 Bonus: ${rules.bonusItem}</li>` : ''}
        ${rules.theme ? `<li>🎯 Theme: ${rules.theme}</li>` : ''}
      </ul>
    `;
    } catch (error) {
        document.getElementById('matchError').textContent = error.message;
    } finally {
        setLoading(btn, false);
    }
}

function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    location.reload();
}

async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return {};
    }
}

function setLoading(btn, isLoading) {
    if (isLoading) {
        btn.classList.add('loading');
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Loading...';
    } else {
        btn.classList.remove('loading');
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    }
}
