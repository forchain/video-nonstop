let defaultWhitelist = [];

fetch(chrome.runtime.getURL('config.json'))
  .then(response => response.json())
  .then(config => {
    defaultWhitelist = config.defaultWhitelist;
    initializePlugin();
  })
  .catch(error => {
    console.error('Error loading config:', error);
    initializePlugin();
  });

function initializePlugin() {
  chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.local.get(['whitelist'], function(result) {
      if (!result.whitelist) {
        chrome.storage.local.set({
          isPluginEnabled: true,
          whitelist: defaultWhitelist
        });
      }
    });
  });
}

chrome.action.onClicked.addListener(function(tab) {
  chrome.storage.local.get(['isPluginEnabled', 'whitelist'], function(data) {
    const newState = !data.isPluginEnabled;
    chrome.storage.local.set({isPluginEnabled: newState}, function() {
      chrome.tabs.sendMessage(tab.id, {action: "togglePlugin", state: newState});
    });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.storage.local.get(['isPluginEnabled', 'whitelist'], function(data) {
      if (data.isPluginEnabled && isUrlInWhitelist(tab.url, data.whitelist)) {
        chrome.tabs.sendMessage(tabId, {action: "enablePlugin"});
      } else {
        chrome.tabs.sendMessage(tabId, {action: "disablePlugin"});
      }
    });
  }
});

function isUrlInWhitelist(url, whitelist) {
  const hostname = new URL(url).hostname;
  return whitelist.some(domain => hostname.endsWith(domain));
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getPluginState") {
    chrome.storage.local.get('isPluginEnabled', function(data) {
      sendResponse({isPluginEnabled: data.isPluginEnabled !== false});
    });
    return true;  // 保持消息通道开放以进行异步响应
  }
});