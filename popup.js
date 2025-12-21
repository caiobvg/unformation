document.addEventListener('DOMContentLoaded', async () => {

  const themeCheckbox = document.getElementById('checkbox-theme');

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeCheckbox.checked = true;
  } else if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    themeCheckbox.checked = false;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark-theme');
    themeCheckbox.checked = true;
  }

  themeCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  });

  const menuView = document.getElementById('menu-view');
  const scScannerView = document.getElementById('sc-scanner-view');
  const igScannerView = document.getElementById('ig-scanner-view');
  const monitorView = document.getElementById('monitor-view');

  const monitorBar = document.getElementById('monitor-bar');
  const monitorPercent = document.getElementById('monitor-percent');
  const monitorCount = document.getElementById('monitor-count');
  const monitorLog = document.getElementById('monitor-log');
  const btnCancelBg = document.getElementById('btn-cancel-bg');

  const btnSoundCloud = document.getElementById('btn-soundcloud');
  const btnBack = document.getElementById('btn-back');
  const btnScan = document.getElementById('btn-scan');
  const checkboxSelectAll = document.getElementById('select-all');
  const btnUnfollowSelected = document.getElementById('btn-unfollow-selected');
  const bulkActionsDiv = document.getElementById('bulk-actions');

  const btnInstagram = document.getElementById('btn-instagram');
  const btnBackIg = document.getElementById('btn-back-ig');
  const btnScanIg = document.getElementById('btn-scan-ig');
  const igCheckboxSelectAll = document.getElementById('ig-select-all');
  const btnUnfollowSelectedIg = document.getElementById('btn-unfollow-selected-ig');
  const igBulkActionsDiv = document.getElementById('ig-bulk-actions');

  let currentCredentials = null;
  let currentIgCredentials = null;
  let currentPlatform = null;

  async function restoreState() {
    const storage = await chrome.storage.local.get(['unformationState', 'scanResults', 'currentCredentials']);

    if (storage.unformationState && storage.unformationState.isRunning) {
      const state = storage.unformationState;

      if (state.credentials) currentCredentials = state.credentials;

      showMonitorView();
      updateMonitorUI(state.currentIndex, state.total, state.lastLog);
      return;
    }
    showMenu();
  }

  function showMonitorView() {
    menuView.style.display = 'none';
    scScannerView.style.display = 'none';
    igScannerView.style.display = 'none';
    monitorView.style.display = 'block';
  }

  function showScanner() {
    menuView.style.display = 'none';
    monitorView.style.display = 'none';
    igScannerView.style.display = 'none';
    scScannerView.style.display = '';
  }

  function showInstagramScanner() {
    menuView.style.display = 'none';
    monitorView.style.display = 'none';
    scScannerView.style.display = 'none';
    igScannerView.style.display = '';
  }

  function showMenu() {
    scScannerView.style.display = 'none';
    igScannerView.style.display = 'none';
    monitorView.style.display = 'none';
    menuView.style.display = 'block';
  }

  function updateMonitorUI(current, total, log) {
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;

    monitorBar.style.width = `${percent}%`;

    monitorPercent.textContent = `${percent}%`;

    monitorCount.textContent = `${current} / ${total}`;

    if (log) monitorLog.textContent = log;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROGRESS_UPDATE') {
      const { current, total, message: logMsg, isRunning } = message.payload;

      if (monitorView.style.display === 'none' && isRunning) {
        showMonitorView();
      }

      updateMonitorUI(current, total, logMsg);

      if (!isRunning) {
        btnCancelBg.textContent = "Back to Menu";
        btnCancelBg.classList.remove('danger-btn');
        btnCancelBg.classList.add('primary-btn');
        btnCancelBg.style.backgroundColor = '#6200ea';
        monitorLog.textContent = "Process finished!";
      }
    }
  });

  btnCancelBg.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_QUEUE' }, () => {
      chrome.storage.local.remove(['unformationState', 'scanResults']);
      location.reload();
    });
  });

  btnSoundCloud.addEventListener('click', showScanner);
  btnBack.addEventListener('click', showMenu);

  btnInstagram.addEventListener('click', showInstagramScanner);
  btnBackIg.addEventListener('click', showMenu);

  btnScan.addEventListener('click', async () => {
    const statusText = document.getElementById('status-text');
    const resultsList = document.getElementById('results-list');

    statusText.textContent = 'Initializing...';
    resultsList.innerHTML = '';
    bulkActionsDiv.style.display = 'none';
    checkboxSelectAll.checked = false;
    btnScan.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url.includes('soundcloud.com')) throw new Error('Please open SoundCloud.');

      currentCredentials = await getSoundCloudCredentials(tab.id);
      if (!currentCredentials.userId) throw new Error('User ID not found.');

      chrome.storage.local.set({ currentCredentials });

      statusText.textContent = 'Fetching followings...';
      const followings = await fetchAllUsers(currentCredentials, 'followings', statusText);

      statusText.textContent = 'Fetching followers...';
      const followers = await fetchAllUsers(currentCredentials, 'followers', statusText);

      statusText.textContent = 'Comparing...';
      const followerIds = new Set(followers.map(u => u.id));
      const nonFollowers = followings.filter(following => !followerIds.has(following.id));

      statusText.textContent = `Done! Found ${nonFollowers.length}.`;
      renderResults(nonFollowers);

      chrome.storage.local.set({ scanResults: nonFollowers });

      if (nonFollowers.length > 0) bulkActionsDiv.style.display = 'block';

    } catch (error) {
      console.error(error);
      statusText.textContent = `Error: ${error.message}`;
    } finally {
      btnScan.disabled = false;
    }
  });

  checkboxSelectAll.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  btnUnfollowSelected.addEventListener('click', async () => {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const statusText = document.getElementById('status-text');
    const userIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.userId);

    statusText.textContent = 'Queueing tasks...';
    btnUnfollowSelected.disabled = true;

    chrome.runtime.sendMessage({
      type: 'START_QUEUE',
      userIds: userIds,
      credentials: currentCredentials
    }, (response) => {
      if (response && response.status === 'started') {
        showMonitorView();
        updateMonitorUI(0, userIds.length, "Starting background process...");
      } else if (response && response.status === 'already_running') {
        statusText.textContent = 'Process already running.';
      }
    });
  });

  async function getSoundCloudCredentials(tabId) {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        try {
          const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
          };
          return { oauthToken: getCookie('oauth_token'), userId: null };
        } catch (e) { return null; }
      }
    });

    const data = result[0].result;
    if (!data || !data.oauthToken) throw new Error('Login required.');

    if (!data.userId) {
      const meResponse = await fetch('https://api-v2.soundcloud.com/me', {
        headers: { 'Authorization': `OAuth ${data.oauthToken}` }
      });
      if (!meResponse.ok) throw new Error('Failed to fetch profile.');
      const meData = await meResponse.json();
      data.userId = meData.id;
    }
    return data;
  }

  async function fetchAllUsers(credentials, type, statusElement) {
    let collection = [];
    let nextHref = `https://api-v2.soundcloud.com/users/${credentials.userId}/${type}?limit=200`;

    while (nextHref) {
      const response = await fetch(nextHref, {
        headers: { 'Authorization': `OAuth ${credentials.oauthToken}` }
      });
      if (!response.ok) throw new Error(`Failed to fetch ${type}`);

      const data = await response.json();
      collection = collection.concat(data.collection);
      nextHref = data.next_href;

      statusElement.textContent = `Fetching ${type}... (${collection.length})`;
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    return collection;
  }

  async function unfollowUser(userId, token) {
    const response = await fetch(`https://api-v2.soundcloud.com/me/followings/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `OAuth ${token}` }
    });
    if (!response.ok) throw new Error('Unfollow failed');
  }

  function renderResults(users) {
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    users.forEach(user => {
      const li = document.createElement('li');
      li.className = 'user-item';
      li.innerHTML = `
        <div class="user-info">
          <input type="checkbox" class="user-checkbox" data-user-id="${user.id}">
          <img src="${user.avatar_url}" alt="${user.username}" class="user-avatar">
          <div class="user-details">
            <a href="${user.permalink_url}" target="_blank" class="user-name">${user.username}</a>
            <span class="user-location">${user.city || 'Unknown'}</span>
          </div>
        </div>
        <button class="unfollow-btn" data-user-id="${user.id}">Unfollow</button>
      `;

      const btn = li.querySelector('.unfollow-btn');
      btn.addEventListener('click', async () => {
        if (!currentCredentials) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await unfollowUser(user.id, currentCredentials.oauthToken);
          btn.textContent = 'Unfollowed';
          li.style.opacity = '0.5';
          li.querySelector('.user-checkbox').checked = false;
        } catch (err) {
          console.error(err);
          btn.textContent = 'Error';
          btn.disabled = false;
        }
      });
      list.appendChild(li);
    });
  }

  btnScanIg.addEventListener('click', async () => {
    const statusText = document.getElementById('ig-status-text');
    const resultsList = document.getElementById('ig-results-list');

    statusText.textContent = 'Initializing...';
    resultsList.innerHTML = '';
    igBulkActionsDiv.style.display = 'none';
    igCheckboxSelectAll.checked = false;
    btnScanIg.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url.includes('instagram.com')) throw new Error('Please open Instagram.');

      currentIgCredentials = await getInstagramCredentials(tab.id);
      if (!currentIgCredentials.userId) throw new Error('User ID not found. Please login.');

      chrome.storage.local.set({ currentIgCredentials });

      statusText.textContent = 'Fetching following...';
      const following = await fetchInstagramUsers(currentIgCredentials, 'following', statusText);

      statusText.textContent = 'Fetching followers...';
      const followers = await fetchInstagramUsers(currentIgCredentials, 'followers', statusText);

      statusText.textContent = 'Comparing...';
      const followerIds = new Set(followers.map(u => u.id));
      const nonFollowers = following.filter(f => !followerIds.has(f.id));

      statusText.textContent = `Done! Found ${nonFollowers.length}.`;
      renderInstagramResults(nonFollowers);

      chrome.storage.local.set({ igScanResults: nonFollowers });

      if (nonFollowers.length > 0) igBulkActionsDiv.style.display = 'block';

    } catch (error) {
      console.error(error);
      statusText.textContent = `Error: ${error.message}`;
    } finally {
      btnScanIg.disabled = false;
    }
  });

  igCheckboxSelectAll.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('#ig-results-list .user-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  btnUnfollowSelectedIg.addEventListener('click', async () => {
    const selectedCheckboxes = document.querySelectorAll('#ig-results-list .user-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const statusText = document.getElementById('ig-status-text');
    const userIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.userId);

    statusText.textContent = 'Queueing tasks...';
    btnUnfollowSelectedIg.disabled = true;
    currentPlatform = 'instagram';

    chrome.runtime.sendMessage({
      type: 'START_QUEUE',
      platform: 'instagram',
      userIds: userIds,
      credentials: currentIgCredentials
    }, (response) => {
      if (response && response.status === 'started') {
        showMonitorView();
        updateMonitorUI(0, userIds.length, "Starting background process...");
      } else if (response && response.status === 'already_running') {
        statusText.textContent = 'Process already running.';
      }
    });
  });

  async function getInstagramCredentials(tabId) {
    const getCookie = async (name) => {
      const cookie = await chrome.cookies.get({
        url: 'https://www.instagram.com',
        name: name
      });
      return cookie ? cookie.value : null;
    };

    const [sessionId, csrfToken, userId] = await Promise.all([
      getCookie('sessionid'),
      getCookie('csrftoken'),
      getCookie('ds_user_id')
    ]);

    if (!sessionId) {
      throw new Error('Login required. Please login to Instagram and try again.');
    }

    return {
      sessionId,
      csrfToken,
      userId
    };
  }

  async function fetchInstagramUsers(credentials, type, statusElement) {
    let collection = [];
    let hasNext = true;
    let endCursor = null;

    const queryHash = type === 'followers'
      ? 'c76146de99bb02f6415203be841dd25a'
      : 'd04b0a864b4b54837c0d870b0e77e076';

    const edgeName = type === 'followers' ? 'edge_followed_by' : 'edge_follow';

    while (hasNext) {
      const variables = {
        id: credentials.userId,
        first: 50,
        ...(endCursor && { after: endCursor })
      };

      const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

      const response = await fetch(url, {
        headers: {
          'X-CSRFToken': credentials.csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 429) {
          statusElement.textContent = 'Rate limited. Wait a minute...';
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        throw new Error(`Failed to fetch ${type}: ${response.status}`);
      }

      const data = await response.json();
      const edge = data.data?.user?.[edgeName];

      if (!edge) {
        throw new Error(`Could not parse ${type} data. Try refreshing Instagram.`);
      }

      const users = edge.edges.map(e => ({
        id: e.node.id,
        username: e.node.username,
        full_name: e.node.full_name,
        avatar_url: e.node.profile_pic_url,
        permalink_url: `https://www.instagram.com/${e.node.username}/`
      }));

      collection = collection.concat(users);
      hasNext = edge.page_info.has_next_page;
      endCursor = edge.page_info.end_cursor;

      statusElement.textContent = `Fetching ${type}... (${collection.length})`;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    return collection;
  }

  async function unfollowInstagramUser(userId, credentials) {
    const response = await fetch(`https://www.instagram.com/web/friendships/${userId}/unfollow/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': credentials.csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Unfollow failed');
  }

  function renderInstagramResults(users) {
    const list = document.getElementById('ig-results-list');
    list.innerHTML = '';

    users.forEach(user => {
      const li = document.createElement('li');
      li.className = 'user-item';

      const fallbackSvg = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2245%22 fill=%22%23E1306C%22/><text x=%2250%22 y=%2265%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${user.username.charAt(0).toUpperCase()}</text></svg>`;

      li.innerHTML = `
        <div class="user-info">
          <input type="checkbox" class="user-checkbox" data-user-id="${user.id}">
          <img src="${fallbackSvg}" alt="${user.username}" class="user-avatar" data-src="${user.avatar_url}">
          <div class="user-details">
            <a href="${user.permalink_url}" target="_blank" class="user-name">${user.username}</a>
            <span class="user-location">${user.full_name || ''}</span>
          </div>
        </div>
        <button class="unfollow-btn" data-user-id="${user.id}">Unfollow</button>
      `;

      const img = li.querySelector('.user-avatar');
      if (user.avatar_url) {
        chrome.runtime.sendMessage(
          { type: 'FETCH_IMAGE', url: user.avatar_url },
          (response) => {
            if (response && response.success && response.dataUrl) {
              img.src = response.dataUrl;
            }
          }
        );
      }

      const btn = li.querySelector('.unfollow-btn');
      btn.addEventListener('click', async () => {
        if (!currentIgCredentials) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await unfollowInstagramUser(user.id, currentIgCredentials);
          btn.textContent = 'Unfollowed';
          li.style.opacity = '0.5';
          li.querySelector('.user-checkbox').checked = false;
        } catch (err) {
          console.error(err);
          btn.textContent = 'Error';
          btn.disabled = false;
        }
      });
      list.appendChild(li);
    });
  }

  restoreState();
});
