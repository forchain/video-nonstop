document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  const currentDomainElement = document.getElementById('currentDomain');
  const toggleBtn = document.getElementById('toggleBtn');
  const addToWhitelistBtn = document.getElementById('addToWhitelistBtn');
  const whitelistItemsElement = document.getElementById('whitelistItems');
  const newDomainInput = document.getElementById('newDomain');
  const addDomainBtn = document.getElementById('addDomainBtn');

  function updateStatus(isEnabled) {
    statusElement.textContent = isEnabled ? '启用' : '禁用';
    statusElement.style.color = isEnabled ? 'green' : 'red';
  }

  function updateWhitelist(whitelist) {
    const whitelistItems = document.getElementById('whitelistItems');
    whitelistItems.innerHTML = '';
    whitelist.forEach(domain => {
      const item = document.createElement('div');
      item.textContent = domain;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '删除';
      removeBtn.onclick = () => removeDomain(domain);
      item.appendChild(removeBtn);
      whitelistItems.appendChild(item);
    });
  }

  function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        resolve(tabs[0]);
      });
    });
  }

  async function updateCurrentDomain() {
    const tab = await getCurrentTab();
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentDomainElement.textContent = url.hostname;
    } else {
      currentDomainElement.textContent = "无法获取当前域名";
    }
  }

  function addDomain(domain) {
    chrome.storage.local.get('whitelist', function(data) {
      const whitelist = data.whitelist || [];
      if (!whitelist.includes(domain)) {
        whitelist.push(domain);
        chrome.storage.local.set({whitelist: whitelist}, function() {
          updateWhitelist(whitelist);
        });
      }
    });
  }

  function removeDomain(domain) {
    chrome.storage.local.get('whitelist', function(data) {
      const whitelist = data.whitelist || [];
      const index = whitelist.indexOf(domain);
      if (index > -1) {
        whitelist.splice(index, 1);
        chrome.storage.local.set({whitelist: whitelist}, function() {
          updateWhitelist(whitelist);
        });
      }
    });
  }

  // 初始化
  updateCurrentDomain();
  chrome.storage.local.get(['isPluginEnabled', 'whitelist'], function(data) {
    updateStatus(data.isPluginEnabled);
    updateWhitelist(data.whitelist || []);
  });

  // 事件监听器
  toggleBtn.addEventListener('click', function() {
    chrome.storage.local.get('isPluginEnabled', function(data) {
      const newState = !data.isPluginEnabled;
      chrome.storage.local.set({isPluginEnabled: newState}, function() {
        updateStatus(newState);
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {action: newState ? "enablePlugin" : "disablePlugin"});
        });
      });
    });
  });

  addToWhitelistBtn.addEventListener('click', async function() {
    const tab = await getCurrentTab();
    if (tab && tab.url) {
      const url = new URL(tab.url);
      addDomain(url.hostname);
    }
  });

  addDomainBtn.addEventListener('click', function() {
    const domain = newDomainInput.value.trim();
    if (domain) {
      addDomain(domain);
      newDomainInput.value = '';
    }
  });
});