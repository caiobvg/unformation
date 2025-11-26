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

  let currentCredentials = null;

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
    monitorView.style.display = 'block';
  }

  function showScanner() {
    menuView.style.display = 'none';
    monitorView.style.display = 'none';
    scScannerView.style.display = ''; 
  }

  function showMenu() {
    scScannerView.style.display = 'none';
    monitorView.style.display = 'none';
    menuView.style.display = 'block';
  }

  function updateMonitorUI(current, total, log) {
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
    
    monitorBar.style.width = `${percent}%`;
    
    monitorPercent.textContent = `${percent}%`;
    
    monitorCount.textContent = `${current} / ${total}`;

    if(log) monitorLog.textContent = log;
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

  restoreState();
});
