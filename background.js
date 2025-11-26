let queue = [];
let currentIndex = 0;
let isRunning = false;
let credentials = null;
let coffeeBreakCounter = 0;
let nextCoffeeBreakAt = getRandomInt(10, 15);
let shouldStop = false; 

const MEAN_DELAY = 15000; 
const STD_DEV = 5000;     
const MIN_DELAY = 2000;   

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_QUEUE') {
    if (isRunning) {
      sendResponse({ status: 'already_running' });
      return;
    }
    
    shouldStop = false;
    queue = message.userIds;
    credentials = message.credentials;
    currentIndex = 0;
    isRunning = true;
    coffeeBreakCounter = 0;
    nextCoffeeBreakAt = getRandomInt(10, 15);
    
    saveState(); 
    processQueue();
    sendResponse({ status: 'started' });

  } else if (message.type === 'STOP_QUEUE') {
    shouldStop = true;
    isRunning = false;
    saveState();
    sendResponse({ status: 'stopped' });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ 
      isRunning, 
      progress: { current: currentIndex, total: queue.length },
      lastLog: 'Status check...'
    });
  }
});

async function processQueue() {
  if (!isRunning || currentIndex >= queue.length || shouldStop) {
    isRunning = false;
    shouldStop = false;
    broadcastStatus(currentIndex >= queue.length ? 'Finished!' : 'Cancelled by user', false);
    
    await chrome.storage.local.remove('unformationState');
    
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const userId = queue[currentIndex];
  
  if (coffeeBreakCounter >= nextCoffeeBreakAt) {
    const breakDuration = getRandomInt(120000, 300000); 
    broadcastStatus(`Taking a coffee break for ${Math.round(breakDuration/1000)}s...`, true);
    
    await new Promise(r => setTimeout(r, breakDuration));
    
    coffeeBreakCounter = 0;
    nextCoffeeBreakAt = getRandomInt(10, 15);
  }

  try {
    broadcastStatus(`Unfollowing user ${currentIndex + 1}/${queue.length}...`, true);
    await unfollowUser(userId);
    
    currentIndex++;
    coffeeBreakCounter++;
    saveState(); 
    
  } catch (error) {
    console.error('Unfollow failed', error);
    
    if (error.message.includes('429')) {
        broadcastStatus(`Rate Limit detected! Pausing for 5 min...`, true);
        await new Promise(r => setTimeout(r, 300000)); 
        return processQueue(); 
    }

    if (error.message.includes('401')) {
        isRunning = false;
        broadcastStatus(`Session expired. Please login again.`, false);
        await chrome.storage.local.remove('unformationState');
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    broadcastStatus(`Error on ID ${userId} (skipping): ${error.message}`, true);
    currentIndex++; 
    saveState();
  }

  const delay = getHumanizedDelay();
  broadcastStatus(`Waiting ${Math.round(delay/1000)}s...`, true);
  
  setTimeout(processQueue, delay);
}

async function unfollowUser(userId) {
  const response = await fetch(`https://api-v2.soundcloud.com/me/followings/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `OAuth ${credentials.oauthToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
}

function getNormalRandom(mean, stdDev) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + (z * stdDev);
}

function getHumanizedDelay() {
  let delay = getNormalRandom(MEAN_DELAY, STD_DEV);
  
  if (delay < MIN_DELAY) delay = MIN_DELAY;
  
  const jitter = getRandomInt(100, 500) * (Math.random() < 0.5 ? -1 : 1);
  delay += jitter;
  
  return Math.floor(delay);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function saveState() {
  await chrome.storage.local.set({
    unformationState: {
      isRunning: isRunning, 
      queue: queue,
      currentIndex: currentIndex,
      total: queue.length,
      credentials: credentials,
      coffeeBreakCounter: coffeeBreakCounter,
      nextCoffeeBreakAt: nextCoffeeBreakAt,
      lastLog: `Processing item ${currentIndex + 1}...`
    }
  });
}

chrome.storage.local.get('unformationState', (result) => {
  if (result.unformationState) {
    const state = result.unformationState;
    if (state.isRunning) {
        queue = state.queue;
        currentIndex = state.currentIndex;
        credentials = state.credentials;
        coffeeBreakCounter = state.coffeeBreakCounter;
        nextCoffeeBreakAt = state.nextCoffeeBreakAt;
        isRunning = true;
        processQueue(); 
    }
  }
});

function broadcastStatus(message, isProgress) {
  if (isRunning) {
    const remaining = queue.length - currentIndex;
    chrome.action.setBadgeText({ text: remaining.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#6200ea' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }

  chrome.runtime.sendMessage({
    type: 'PROGRESS_UPDATE',
    payload: {
      current: currentIndex,
      total: queue.length,
      message: message,
      isRunning: isRunning
    }
  }).catch(() => {
  });
}
