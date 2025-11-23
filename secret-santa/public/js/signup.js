// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    document.getElementById('error').textContent = 'Invalid signup link. Please check your email.';
    document.querySelector('form').style.display = 'none';
} else {
    loadEventDetails();
}

async function loadEventDetails() {
    try {
        const response = await fetch(`/api/auth/signup-info?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load event details');
        }

        document.getElementById('eventName').textContent = data.eventName;

        const detailsList = document.getElementById('eventDetailsList');
        detailsList.innerHTML = `
      <li>💵 Spending Limit: $${data.maxSpend} maximum</li>
      ${data.bonusItem ? `<li>💿 Bonus: ${data.bonusItem}</li>` : ''}
      ${data.theme ? `<li>🎯 Theme: ${data.theme}</li>` : ''}
      <li>📅 Match Reveal: ${new Date(data.matchDeadline).toLocaleDateString()}</li>
      <li>🎁 Gift Exchange: ${new Date(data.giftDeadline).toLocaleDateString()}</li>
    `;
    } catch (error) {
        document.getElementById('error').textContent = error.message;
        document.querySelector('.info-box').style.display = 'none';
    }
}

async function handleSignup(event) {
    event.preventDefault();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        document.getElementById('error').textContent = 'Passwords do not match';
        return;
    }

    if (password.length < 8) {
        document.getElementById('error').textContent = 'Password must be at least 8 characters';
        return;
    }

    const btn = event.target.querySelector('button');
    setLoading(btn, true);

    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        // Show success message
        document.getElementById('signupForm').style.display = 'none';
        document.getElementById('success').style.display = 'block';
    } catch (error) {
        document.getElementById('error').textContent = error.message;
    } finally {
        setLoading(btn, false);
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
