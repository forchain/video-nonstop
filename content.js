let isPluginEnabled = false;
let userPaused = true;  // 默认设置为 true，假设用户希望视频开始时是暂停的
let videoElement;
let isPlaying = false;
let initialLoad = true;  // 新增：用于标记是否是初次加载
let windowBlurred = false;  // 新增：用于标记窗口是否失焦
let ignorePauseEvent = false;
let lastBlurTime = 0;
const BLUR_PAUSE_THRESHOLD = 100; // 毫秒

// 使用消息传递来获取插件状态
chrome.runtime.sendMessage({action: "getPluginState"}, function(response) {
  if (response && response.isPluginEnabled !== undefined) {
    isPluginEnabled = response.isPluginEnabled;
    setupVideoControl();
  } else {
    console.error('无法获取插件状态');
    // 默认启用插件
    isPluginEnabled = true;
    setupVideoControl();
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "enablePlugin") {
    isPluginEnabled = true;
    setupVideoControl();
  } else if (request.action === "disablePlugin") {
    isPluginEnabled = false;
    restoreVideoPause();
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "togglePlugin") {
    isPluginEnabled = request.state;
    console.log("插件状态：", isPluginEnabled ? "启用" : "禁用");
    setupVideoControl();
  }
});

function setupVideoControl() {
  console.log('Setting up video control, isPluginEnabled:', isPluginEnabled);
  // 先移除所有事件监听器
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('blur', handleWindowBlur);
  window.removeEventListener('focus', handleWindowFocus);
  document.removeEventListener('keydown', handleKeyDown, true);

  if (isPluginEnabled) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('keydown', handleKeyDown, true);
    overrideVideoPause();
    overrideVideoPlay();
    addVideoEventListeners();
    if (initialLoad) {
      initialLoad = false;
      userPaused = true;  // 确保初次加载时视频是暂停的
    }
  } else {
    restoreVideoPause();
    restoreVideoPlay();
    removeVideoEventListeners();
  }
}

function addVideoEventListeners() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.addEventListener('pause', handleVideoPause);
    video.addEventListener('play', handleVideoPlay);
  });
}

function removeVideoEventListeners() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.removeEventListener('pause', handleVideoPause);
    video.removeEventListener('play', handleVideoPlay);
  });
}

function handleVideoPause(event) {
  const now = new Date().toISOString();
  console.log(`[${now}] Pause event triggered`);
  console.log('Event details:', event);
  console.log('Window blurred:', windowBlurred);
  console.log('Ignore pause event:', ignorePauseEvent);
  console.log('User paused:', userPaused);
  
  const timeSinceBlur = Date.now() - lastBlurTime;
  if (windowBlurred && timeSinceBlur < BLUR_PAUSE_THRESHOLD) {
    console.log(`[${now}] Ignoring pause event due to recent window blur`);
    ignorePauseEvent = true;
    setTimeout(() => {
      if (!userPaused) {
        playVideoSafely(event.target);
      }
    }, 50);
  } else if (!ignorePauseEvent) {
    userPaused = true;
    console.log(`[${now}] Video paused by user`);
  } else {
    console.log(`[${now}] Ignoring pause event`);
  }
  ignorePauseEvent = false;
}

function handleVideoPlay(event) {
  const now = new Date().toISOString();
  console.log(`[${now}] Play event triggered`);
  console.log('Event details:', event);
  userPaused = false;
  console.log(`[${now}] Video played by user`);
}

function handleVisibilityChange() {
  const now = new Date().toISOString();
  console.log(`[${now}] Visibility changed. Document hidden:`, document.hidden);
  if (isPluginEnabled && !document.hidden) {
    keepVideosPlaying();
  }
}

function handleWindowBlur() {
  const now = new Date().toISOString();
  console.log(`[${now}] Window blurred`);
  if (isPluginEnabled) {
    windowBlurred = true;
    lastBlurTime = Date.now();
    if (!userPaused) {
      keepVideosPlaying();
    }
  }
}

function handleWindowFocus() {
  const now = new Date().toISOString();
  console.log(`[${now}] Window focused`);
  if (isPluginEnabled) {
    windowBlurred = false;
    if (!userPaused) {
      keepVideosPlaying();
    }
  }
}

function isVideoOrChildOfVideo(element) {
  while (element) {
    if (element.tagName === 'VIDEO') {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

function handleKeyDown(event) {
  console.log("Key pressed:", event.code); // 调试信息

  if (isPluginEnabled && 
      document.activeElement.tagName !== 'INPUT' && 
      document.activeElement.tagName !== 'TEXTAREA' &&
      !event.ctrlKey && !event.altKey && !event.metaKey &&
      !isVideoOrChildOfVideo(document.activeElement)) {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      switch(event.code) {
        case 'Space':
          event.preventDefault();
          event.stopPropagation();
          videos.forEach(video => {
            if (video.paused) {
              userPaused = false;
              playVideoSafely(video);
            } else {
              userPaused = true;
              video._originalPause.call(video);
            }
          });
          break;
        case 'KeyZ':
        case 'KeyX':
          event.preventDefault();
          event.stopPropagation();
          const timeChange = event.code === 'KeyZ' ? -60 : 60;
          videos.forEach(video => {
            if (isFinite(video.duration) && isFinite(video.currentTime)) {
              const newTime = Math.max(0, Math.min(video.duration, video.currentTime + timeChange));
              console.log(event.code === 'KeyZ' ? "Rewinding to:" : "Fast-forwarding to:", newTime); // 调试信息
              video.currentTime = newTime;
            } else {
              console.log("Video duration or currentTime is not available");
            }
          });
          break;
      }
    }
  }
}

function playVideoSafely(video) {
  const now = new Date().toISOString();
  if (userPaused) {
    console.log(`[${now}] Not playing video because user paused`);
    return;
  }
  console.log(`[${now}] Attempting to play video safely`);
  setTimeout(() => {
    if (video.paused && !userPaused) {
      video.play().catch(e => {
        if (e.name !== 'AbortError') {
          console.error(`[${now}] 无法播放视频:`, e);
        }
      });
    }
  }, 50);
}

function keepVideosPlaying() {
  if (userPaused) return;  // 如果用户暂停了视频,不要自动播放
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video.paused && !video.ended && video.readyState > 2) {
      playVideoSafely(video);
    }
  });
}

function overrideVideoPause() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (!video._originalPause) {
      video._originalPause = video.pause;
      video.pause = function() {
        const now = new Date().toISOString();
        console.log(`[${now}] Pause method called`);
        console.log('Window blurred:', windowBlurred);
        console.log('User paused:', userPaused);
        
        const timeSinceBlur = Date.now() - lastBlurTime;
        if (windowBlurred && timeSinceBlur < BLUR_PAUSE_THRESHOLD) {
          ignorePauseEvent = true;
          console.log(`[${now}] Ignoring pause due to recent window blur`);
          return new Promise(resolve => {
            setTimeout(() => {
              if (!userPaused) {
                this.play().then(resolve).catch(resolve);
              } else {
                resolve();
              }
            }, 50);
          });
        } else {
          userPaused = true;
          console.log(`[${now}] Video paused by user action`);
          return this._originalPause.call(this);
        }
      };
    }
  });
}

function overrideVideoPlay() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (!video._originalPlay) {
      video._originalPlay = video.play;
      video.play = function() {
        const now = new Date().toISOString();
        userPaused = false;
        console.log(`[${now}] Video play method called`);
        return this._originalPlay.call(this);
      };
    }
  });
}

function restoreVideoPause() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video._originalPause) {
      video.pause = video._originalPause;
      delete video._originalPause;
    }
  });
}

function restoreVideoPlay() {
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    if (video._originalPlay) {
      video.play = video._originalPlay;
      delete video._originalPlay;
    }
  });
}

// 定期检查新添加的视频元素
setInterval(() => {
  if (isPluginEnabled) {
    overrideVideoPause();
    overrideVideoPlay();
    addVideoEventListeners();
    if (!userPaused && !windowBlurred) {
      keepVideosPlaying();
    }
  }
}, 1000);

window.addEventListener("load", setupVideoControl);

function togglePlayPause() {
  if (videoElement) {
    if (isPlaying) {
      videoElement.pause();
      setTimeout(() => {
        if (!videoElement.paused) {
          videoElement.pause();
        }
      }, 100);
    } else {
      videoElement.play();
    }
    isPlaying = !isPlaying;
  }
}

function handleKeyPress(e) {
  if (e.key === 'x' || e.key === 'z') {
    togglePlayPause();
  }
}

function initVideoControl() {
  videoElement = document.querySelector('video');
  if (videoElement) {
    document.addEventListener('keydown', handleKeyPress);
    videoElement.addEventListener('play', () => { isPlaying = true; });
    videoElement.addEventListener('pause', () => { isPlaying = false; });
  }
}

// 在 DOMContentLoaded 事件中初始化
document.addEventListener('DOMContentLoaded', initVideoControl);

// 清理函数
function cleanup() {
  document.removeEventListener('keydown', handleKeyPress);
  if (videoElement) {
    videoElement.removeEventListener('play', () => {});
    videoElement.removeEventListener('pause', () => {});
  }
}

// 在页面卸载时执行清理
window.addEventListener('unload', cleanup);