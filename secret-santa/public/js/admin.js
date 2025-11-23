let accessToken = localStorage.getItem('accessToken');
let editingEventId = null;

if (!accessToken) {
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
    loadEvents();
});

async function loadEvents() {
    try {
        const response = await apiCall('/api/admin/events');
        displayEvents(response.events);
    } catch (error) {
        document.getElementById('eventsContainer').innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

function displayEvents(events) {
    const container = document.getElementById('eventsContainer');

    if (events.length === 0) {
        container.innerHTML = '<p class="empty-message">No events yet. Create your first Secret Santa event!</p>';
        return;
    }

    container.innerHTML = events.map(event => {
        const progress = event.total_participants > 0
            ? (event.registered_count / event.total_participants * 100).toFixed(0)
            : 0;

        const status = event.matches_generated ? '🎁 Matches Generated' :
            event.all_registered ? '✅ All Registered' :
                `⏳ ${event.registered_count}/${event.total_participants} Registered`;

        return `
      <div class="event-card">
        <div class="event-header">
          <div class="event-name">${event.name}</div>
          <div class="event-meta">
            <span class="meta-badge">$${event.max_spend} max</span>
            <span class="meta-badge">${event.total_participants} people</span>
          </div>
        </div>

        <div>
          <div class="progress-info">
            <span class="status-text">${status}</span>
            <span class="progress-text">${progress}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>

        <div class="event-dates">
          <div>📅 Match Reveal: ${new Date(event.match_deadline).toLocaleDateString()}</div>
          <div>🎁 Gift Exchange: ${new Date(event.gift_deadline).toLocaleDateString()}</div>
        </div>

        <div class="event-actions">
          <button onclick="viewEvent(${event.id})" class="btn-secondary btn-small">View Details</button>
          ${!event.matches_generated ? `
            <button onclick="editEvent(${event.id})" class="btn-secondary btn-small">Edit</button>
          ` : ''}
          <button onclick="deleteEvent(${event.id}, '${event.name}')" class="btn-danger btn-small">Delete</button>
        </div>
      </div>
    `;
    }).join('');
}

function openCreateModal() {
    editingEventId = null;
    document.getElementById('modalTitle').textContent = 'Create New Event';
    document.getElementById('eventForm').reset();
    document.getElementById('participantsList').innerHTML = '';
    addParticipant();
    addParticipant();
    document.getElementById('eventModal').classList.add('active');
}

function closeModal() {
    document.getElementById('eventModal').classList.remove('active');
}

function addParticipant() {
    const list = document.getElementById('participantsList');
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.innerHTML = `
    <input type="text" placeholder="Name" required class="participant-name">
    <input type="email" placeholder="Email" required class="participant-email">
    <button type="button" onclick="this.parentElement.remove()" class="btn-danger btn-icon">✕</button>
  `;
    list.appendChild(item);
}

async function saveEvent(e) {
    e.preventDefault();

    const participants = Array.from(document.querySelectorAll('.participant-item')).map(item => ({
        name: item.querySelector('.participant-name').value,
        email: item.querySelector('.participant-email').value
    }));

    if (participants.length < 2) {
        alert('At least 2 participants required');
        return;
    }

    const data = {
        name: document.getElementById('eventName').value,
        maxSpend: parseFloat(document.getElementById('maxSpend').value),
        bonusItem: document.getElementById('bonusItem').value || null,
        theme: document.getElementById('theme').value || null,
        matchDeadline: document.getElementById('matchDeadline').value,
        giftDeadline: document.getElementById('giftDeadline').value,
        participants,
        sendEmails: false
    };

    const btn = e.target.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
        if (editingEventId) {
            await apiCall(`/api/admin/events/${editingEventId}`, 'PUT', data);
        } else {
            await apiCall('/api/admin/events', 'POST', data);
        }

        closeModal();
        loadEvents();
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function viewEvent(id) {
    window.location.href = `/event.html?id=${id}`;
}

async function editEvent(id) {
    try {
        const response = await apiCall(`/api/admin/events/${id}`);
        editingEventId = id;

        document.getElementById('modalTitle').textContent = 'Edit Event';
        document.getElementById('eventName').value = response.event.name;
        document.getElementById('maxSpend').value = response.event.maxSpend;
        document.getElementById('bonusItem').value = response.event.bonusItem || '';
        document.getElementById('theme').value = response.event.theme || '';
        document.getElementById('matchDeadline').value = response.event.matchDeadline;
        document.getElementById('giftDeadline').value = response.event.giftDeadline;

        document.getElementById('participantsList').innerHTML = '';
        response.participants.forEach(p => {
            const list = document.getElementById('participantsList');
            const item = document.createElement('div');
            item.className = 'participant-item';
            item.innerHTML = `
        <input type="text" placeholder="Name" required class="participant-name" value="${p.name}" readonly>
        <input type="email" placeholder="Email" required class="participant-email" value="${p.email}" readonly>
        <span class="participant-status">${p.isRegistered ? '✓' : '○'}</span>
      `;
            list.appendChild(item);
        });

        document.getElementById('eventModal').classList.add('active');
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteEvent(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will delete all participants and matches.`)) {
        return;
    }

    try {
        await apiCall(`/api/admin/events/${id}`, 'DELETE');
        loadEvents();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/';
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
