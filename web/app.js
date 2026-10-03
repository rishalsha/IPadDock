// Apple HomeKit Style iPad Dock Controller - Multi-Page Desk Station
// Pure ES5 / 100% Compatible with iOS 10 Safari (iPad Gen 4)

var mqttClient = null;
var isConnected = false;
var reconnectTimer = null;

// Page Navigation State
var currentPage = 0;
var totalPages = 5;
var pageTitles = ['Home', 'Battle Station HUD', 'Media Studio', 'Weather & Climate', 'Desk Focus Timer'];

// Media Studio State
var activeMediaTarget = 'work_laptop';

// Pomodoro Timer State
var timerTotalSeconds = 25 * 60;
var timerSecondsLeft = 25 * 60;
var timerRunning = false;
var timerInterval = null;
var timerSoundEnabled = true;
var timerMode = 'FOCUS SESSION';

// Weather State
var weatherData = null;
var weatherTimer = null;

// Standby Mode State
var isStandbyActive = false;

// -------------------------------------------------------------
// Settings Management
// -------------------------------------------------------------
function getSettings() {
  var host = localStorage.getItem('dock_mqtt_host');
  var port = localStorage.getItem('dock_mqtt_port');
  var path = localStorage.getItem('dock_mqtt_path');
  var user = localStorage.getItem('dock_mqtt_user');
  var pass = localStorage.getItem('dock_mqtt_pass');

  var currentPort = window.location.port ? parseInt(window.location.port, 10) : (window.location.protocol === 'https:' ? 443 : 80);
  var defaultMqttPort = currentPort === 8080 ? 9001 : currentPort;

  return {
    host: (host !== null && host !== '') ? host : (DOCK_CONFIG.mqttHost || window.location.hostname || 'localhost'),
    port: (port !== null && port !== '') ? parseInt(port, 10) : defaultMqttPort,
    path: (path !== null && path !== '') ? path : (DOCK_CONFIG.mqttPath || '/mqtt'),
    useSSL: window.location.protocol === 'https:' || DOCK_CONFIG.useSSL,
    username: (user !== null) ? user : DOCK_CONFIG.username,
    password: (pass !== null) ? pass : DOCK_CONFIG.password
  };
}

// -------------------------------------------------------------
// Live Clock & Date
// -------------------------------------------------------------
function updateClock() {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();

  var ampm = 'AM';
  if (!DOCK_CONFIG.clockFormat24h) {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
  } else {
    hours = hours < 10 ? '0' + hours : hours;
  }

  minutes = minutes < 10 ? '0' + minutes : minutes;

  var timeElem = document.getElementById('live-time');
  var ampmElem = document.getElementById('live-ampm');
  var dateElem = document.getElementById('live-date');

  if (timeElem) timeElem.innerHTML = hours + ':' + minutes;
  if (ampmElem) ampmElem.innerHTML = DOCK_CONFIG.clockFormat24h ? '' : ampm;

  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dateStr = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
  if (dateElem) dateElem.innerHTML = dateStr;

  // Standby Clock
  var sbTime = document.getElementById('standby-time');
  var sbDate = document.getElementById('standby-date');
  if (sbTime) sbTime.innerHTML = hours + ':' + minutes;
  if (sbDate) sbDate.innerHTML = dateStr;
}

// -------------------------------------------------------------
// Carousel & Swipe Navigation
// -------------------------------------------------------------
function goToPage(index) {
  if (index < 0) index = 0;
  if (index >= totalPages) index = totalPages - 1;
  currentPage = index;

  var track = document.getElementById('carousel-track');
  if (track) {
    var offsetPct = index * 20; // 5 pages = 20% each of 500% track
    track.style.webkitTransform = 'translate3d(-' + offsetPct + '%, 0, 0)';
    track.style.transform = 'translate3d(-' + offsetPct + '%, 0, 0)';
  }

  // Update tabs
  for (var i = 0; i < totalPages; i++) {
    var tab = document.getElementById('tab-' + i);
    if (tab) {
      if (i === index) {
        tab.className = tab.className.indexOf('active') === -1 ? tab.className + ' active' : tab.className;
      } else {
        tab.className = tab.className.replace(/\s*active/g, '');
      }
    }
  }

  // Update header title
  var titleEl = document.getElementById('current-page-title');
  if (titleEl && pageTitles[index]) {
    titleEl.innerHTML = pageTitles[index];
  }

  // Lazy fetch weather if switching to Weather page
  if (index === 3 && !weatherData) {
    fetchWeather();
  }
}

function initSwipeGestures() {
  var viewport = document.getElementById('carousel-viewport');
  if (!viewport) return;

  var startX = 0;
  var startY = 0;
  var endX = 0;
  var endY = 0;
  var isSwiping = false;

  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      endX = startX;
      endY = startY;
      isSwiping = true;
    }
  }, false);

  viewport.addEventListener('touchmove', function (e) {
    if (!isSwiping || e.touches.length !== 1) return;
    endX = e.touches[0].clientX;
    endY = e.touches[0].clientY;

    var diffX = endX - startX;
    var diffY = endY - startY;

    // If swiping horizontally, prevent vertical scroll bounce
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 12) {
      if (e.cancelable) e.preventDefault();
    }
  }, false);

  viewport.addEventListener('touchend', function () {
    if (!isSwiping) return;
    isSwiping = false;

    var diffX = endX - startX;
    var diffY = endY - startY;

    // Minimum swipe threshold
    if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      if (diffX < 0) {
        // Swiped left -> next page
        goToPage(currentPage + 1);
      } else {
        // Swiped right -> previous page
        goToPage(currentPage - 1);
      }
    }
  }, false);

  // Keyboard navigation for desktop testing
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    else if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
    else if (e.key >= '1' && e.key <= '5') goToPage(parseInt(e.key, 10) - 1);
  });
}

// -------------------------------------------------------------
// Standby / Night Mode
// -------------------------------------------------------------
function enterStandbyMode() {
  isStandbyActive = true;
  var overlay = document.getElementById('standby-overlay');
  if (overlay) {
    overlay.style.display = '-webkit-flex';
    overlay.style.display = 'flex';
    setTimeout(function () {
      overlay.className = 'standby-overlay active';
    }, 20);
  }
}

function exitStandbyMode() {
  isStandbyActive = false;
  var overlay = document.getElementById('standby-overlay');
  if (overlay) {
    overlay.className = 'standby-overlay';
    setTimeout(function () {
      overlay.style.display = 'none';
    }, 450);
  }
}

// -------------------------------------------------------------
// PAGE 1: RENDER DEVICES & ACCESSORIES
// -------------------------------------------------------------
function renderDevices() {
  var container = document.getElementById('devices-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    var dev = DOCK_CONFIG.devices[i];
    var isOn = dev.powerState === 'ON';

    var card = document.createElement('div');
    card.className = 'homekit-card';

    var html = '<div class="card-inner' + (isOn ? ' is-on' : '') + '" onclick="toggleDevice(\'' + dev.id + '\')">' +
      '<div class="card-top">' +
      '<div class="device-icon-wrap">' + dev.icon + '</div>' +
      '<div class="device-state-pill">' + (isOn ? 'On' : 'Off') + '</div>' +
      '</div>' +
      '<div class="card-bottom">' +
      '<div class="device-name">' + dev.name + '</div>' +
      '<div class="device-sub">' + (isOn ? 'Powered On' : 'Standby') + '</div>' +
      '</div>' +
      '</div>';

    card.innerHTML = html;
    container.appendChild(card);
  }

  updateActiveCounters();
}

function renderComputers() {
  var container = document.getElementById('computers-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    var card = document.createElement('div');
    card.id = 'comp-' + comp.id;
    card.className = 'workstation-card';

    var badgeClass = comp.state === 'online' ? 'online' : (comp.state === 'sleep' ? 'sleep' : 'offline');
    var badgeLabel = comp.state.toUpperCase();

    var html = '<div class="ws-inner">' +
      '<div class="ws-top">' +
      '<span class="ws-icon">' + comp.icon + '</span>' +
      '<span class="ws-status-badge ' + badgeClass + '" id="ws-badge-' + comp.id + '">' + badgeLabel + '</span>' +
      '</div>' +
      '<div>' +
      '<div class="ws-name">' + comp.name + '</div>' +
      '<div class="ws-sub">Wake-on-LAN Ready</div>' +
      '</div>' +
      '<div class="ws-action-bar">' +
      '<button class="ws-btn wake-btn" onclick="pcAction(\'' + comp.id + '\', \'wake\', this)">⚡ Wake</button>' +
      '<button class="ws-btn sleep-btn" onclick="pcAction(\'' + comp.id + '\', \'sleep\', this)">💤 Sleep</button>' +
      '<button class="ws-btn off-btn" onclick="pcAction(\'' + comp.id + '\', \'shutdown\', this)">⏻ Off</button>' +
      '</div>' +
      '</div>';

    card.innerHTML = html;
    container.appendChild(card);
  }
}

function updateActiveCounters() {
  var activeCount = 0;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].powerState === 'ON') activeCount++;
  }
  var sub = document.getElementById('relays-active-count');
  if (sub) sub.innerHTML = activeCount + ' of ' + DOCK_CONFIG.devices.length + ' On';
}

// -------------------------------------------------------------
// PAGE 2: BATTLE STATION HUD (TELEMETRY)
// -------------------------------------------------------------
function renderHud() {
  var container = document.getElementById('hud-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    var card = document.createElement('div');
    card.className = 'hud-card';
    card.id = 'hud-card-' + comp.id;

    var telem = comp.telemetry || { cpu_pct: 0, ram_pct: 0, ram_used_gb: 0, ram_total_gb: 0, temp_c: 0, uptime: '0m' };
    var isOnline = comp.state === 'online';
    var badgeClass = isOnline ? 'online' : (comp.state === 'sleep' ? 'sleep' : 'offline');

    var cpuWidth = isOnline ? Math.max(0, Math.min(100, telem.cpu_pct)) : 0;
    var ramWidth = isOnline ? Math.max(0, Math.min(100, telem.ram_pct)) : 0;
    var cpuWarning = cpuWidth >= 80 ? ' warning' : '';
    var ramWarning = ramWidth >= 85 ? ' warning' : '';

    var html = '<div class="hud-card-inner">' +
      '<div class="hud-header">' +
      '<div class="hud-title-wrap">' +
      '<span class="hud-icon">' + comp.icon + '</span>' +
      '<span class="hud-name">' + comp.name + '</span>' +
      '</div>' +
      '<span class="ws-status-badge ' + badgeClass + '" id="hud-badge-' + comp.id + '">' + comp.state.toUpperCase() + '</span>' +
      '</div>' +

      '<div class="hud-metrics-list">' +
      // CPU
      '<div class="hud-metric-item">' +
      '<div class="hud-metric-label-row">' +
      '<span>CPU Usage</span>' +
      '<span class="hud-metric-val" id="hud-cpu-val-' + comp.id + '">' + (isOnline ? telem.cpu_pct + '%' : '--') + '</span>' +
      '</div>' +
      '<div class="hud-bar-track">' +
      '<div class="hud-bar-fill' + cpuWarning + '" id="hud-cpu-bar-' + comp.id + '" style="width:' + cpuWidth + '%;"></div>' +
      '</div>' +
      '</div>' +

      // RAM
      '<div class="hud-metric-item">' +
      '<div class="hud-metric-label-row">' +
      '<span>Memory (RAM)</span>' +
      '<span class="hud-metric-val" id="hud-ram-val-' + comp.id + '">' + (isOnline ? telem.ram_used_gb + ' / ' + telem.ram_total_gb + ' GB (' + telem.ram_pct + '%)' : '--') + '</span>' +
      '</div>' +
      '<div class="hud-bar-track">' +
      '<div class="hud-bar-fill' + ramWarning + '" id="hud-ram-bar-' + comp.id + '" style="width:' + ramWidth + '%;"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      // Detail Pills
      '<div class="hud-badge-grid">' +
      '<div class="hud-badge-item">' +
      '<div class="hud-badge-title">🌡️ Core Temp</div>' +
      '<div class="hud-badge-val" id="hud-temp-val-' + comp.id + '">' + (isOnline && telem.temp_c > 0 ? telem.temp_c + '°C' : '--') + '</div>' +
      '</div>' +
      '<div class="hud-badge-item">' +
      '<div class="hud-badge-title">⏱️ Uptime</div>' +
      '<div class="hud-badge-val" id="hud-uptime-val-' + comp.id + '">' + (isOnline ? telem.uptime : '--') + '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    card.innerHTML = html;
    container.appendChild(card);
  }
}

function updateHudCard(compId, telem) {
  var comp = null;
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === compId) {
      comp = DOCK_CONFIG.computers[i];
      break;
    }
  }
  if (!comp) return;
  comp.telemetry = telem;

  var isOnline = comp.state === 'online';
  var cpuVal = document.getElementById('hud-cpu-val-' + compId);
  var cpuBar = document.getElementById('hud-cpu-bar-' + compId);
  var ramVal = document.getElementById('hud-ram-val-' + compId);
  var ramBar = document.getElementById('hud-ram-bar-' + compId);
  var tempVal = document.getElementById('hud-temp-val-' + compId);
  var uptimeVal = document.getElementById('hud-uptime-val-' + compId);

  if (cpuVal) cpuVal.innerHTML = isOnline ? telem.cpu_pct + '%' : '--';
  if (cpuBar) {
    var cpuWidth = isOnline ? Math.max(0, Math.min(100, telem.cpu_pct)) : 0;
    cpuBar.style.width = cpuWidth + '%';
    cpuBar.className = 'hud-bar-fill' + (cpuWidth >= 80 ? ' warning' : '');
  }

  if (ramVal) ramVal.innerHTML = isOnline ? telem.ram_used_gb + ' / ' + telem.ram_total_gb + ' GB (' + telem.ram_pct + '%)' : '--';
  if (ramBar) {
    var ramWidth = isOnline ? Math.max(0, Math.min(100, telem.ram_pct)) : 0;
    ramBar.style.width = ramWidth + '%';
    ramBar.className = 'hud-bar-fill' + (ramWidth >= 85 ? ' warning' : '');
  }

  if (tempVal) tempVal.innerHTML = isOnline && telem.temp_c > 0 ? telem.temp_c + '°C' : '--';
  if (uptimeVal) uptimeVal.innerHTML = isOnline ? telem.uptime : '--';
}

// -------------------------------------------------------------
// PAGE 3: MEDIA & AUDIO STUDIO
// -------------------------------------------------------------
function renderMediaTargets() {
  var container = document.getElementById('media-target-buttons');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    var btn = document.createElement('button');
    btn.className = 'media-tab-btn' + (comp.id === activeMediaTarget ? ' active' : '');
    btn.id = 'media-target-' + comp.id;
    btn.onclick = (function (id) {
      return function () { selectMediaTarget(id); };
    })(comp.id);
    btn.innerHTML = comp.icon + ' ' + comp.name;
    container.appendChild(btn);
  }
}

function selectMediaTarget(compId) {
  activeMediaTarget = compId;
  renderMediaTargets();

  // Find comp and update card with its media
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === compId) {
      if (DOCK_CONFIG.computers[i].media) {
        updateMediaCard(DOCK_CONFIG.computers[i].media);
      }
      break;
    }
  }
}

function updateMediaCard(media) {
  var titleEl = document.getElementById('media-title');
  var artistEl = document.getElementById('media-artist');
  var albumEl = document.getElementById('media-album');
  var badgeEl = document.getElementById('media-status-badge');
  var vinylEl = document.getElementById('media-vinyl');
  var eqEl = document.getElementById('equalizer-bars');
  var playIcon = document.getElementById('media-play-icon');
  var volRange = document.getElementById('volume-range');
  var volLabel = document.getElementById('volume-val-label');
  var muteBtn = document.getElementById('vol-mute-btn');

  var isPlaying = media.status === 'Playing';

  if (titleEl) titleEl.innerHTML = media.title ? media.title : (isPlaying ? 'Playing Audio' : 'No Media Playing');
  if (artistEl) artistEl.innerHTML = media.artist ? media.artist : (isPlaying ? 'Desktop Player' : 'Open Spotify, YouTube, or Music Player');
  if (albumEl) albumEl.innerHTML = media.album ? media.album : '';

  if (badgeEl) {
    badgeEl.className = 'media-status-badge' + (isPlaying ? ' playing' : '');
    badgeEl.innerHTML = media.status.toUpperCase();
  }

  if (vinylEl) {
    if (isPlaying) {
      if (vinylEl.className.indexOf('spinning') === -1) vinylEl.className = vinylEl.className + ' spinning';
    } else {
      vinylEl.className = vinylEl.className.replace(/\s*spinning/g, '');
    }
  }

  if (eqEl) {
    if (isPlaying) {
      if (eqEl.className.indexOf('active') === -1) eqEl.className = eqEl.className + ' active';
    } else {
      eqEl.className = eqEl.className.replace(/\s*active/g, '');
    }
  }

  var SVG_PLAY = '<svg viewBox="0 0 24 24" class="media-svg-icon play-svg"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" class="media-svg-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

  if (playIcon) {
    playIcon.innerHTML = isPlaying ? SVG_PAUSE : SVG_PLAY;
  }

  if (volRange && media.volume !== undefined) {
    volRange.value = media.volume;
  }
  if (volLabel && media.volume !== undefined) {
    volLabel.innerHTML = media.volume + '%';
  }
  if (muteBtn) {
    muteBtn.innerHTML = media.muted ? '🔊' : '🔇';
    muteBtn.style.background = media.muted ? 'rgba(255, 69, 58, 0.4)' : '';
  }
}

function sendMediaCmd(action) {
  var comp = null;
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === activeMediaTarget) {
      comp = DOCK_CONFIG.computers[i];
      break;
    }
  }
  if (!comp) return;

  publish('cmnd/' + comp.topic + '/media', action);
  console.log('Dispatched media command to ' + comp.name + ':', action);

  // Optimistic UI updates
  if (action === 'play_pause') {
    var playIcon = document.getElementById('media-play-icon');
    if (playIcon) {
      var SVG_PLAY = '<svg viewBox="0 0 24 24" class="media-svg-icon play-svg"><path d="M8 5v14l11-7z"/></svg>';
      var SVG_PAUSE = '<svg viewBox="0 0 24 24" class="media-svg-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
      playIcon.innerHTML = playIcon.innerHTML.indexOf('M6 19') !== -1 ? SVG_PLAY : SVG_PAUSE;
    }
  }
}

var volDebounceTimer = null;
function onVolumeSliderChange(val) {
  var volLabel = document.getElementById('volume-val-label');
  if (volLabel) volLabel.innerHTML = val + '%';

  clearTimeout(volDebounceTimer);
  volDebounceTimer = setTimeout(function () {
    sendMediaCmd('vol_set:' + val);
  }, 100);
}

// -------------------------------------------------------------
// PAGE 4: WEATHER & CLIMATE HUB
// -------------------------------------------------------------
var WMO_CODES = {
  0: { text: 'Clear Sky', icon: '☀️' },
  1: { text: 'Mainly Clear', icon: '🌤️' },
  2: { text: 'Partly Cloudy', icon: '⛅' },
  3: { text: 'Overcast', icon: '☁️' },
  45: { text: 'Fog', icon: '🌫️' },
  48: { text: 'Rime Fog', icon: '🌫️' },
  51: { text: 'Light Drizzle', icon: '🌦️' },
  53: { text: 'Moderate Drizzle', icon: '🌧️' },
  55: { text: 'Dense Drizzle', icon: '🌧️' },
  61: { text: 'Slight Rain', icon: '🌧️' },
  63: { text: 'Moderate Rain', icon: '🌧️' },
  65: { text: 'Heavy Rain', icon: '🌧️' },
  71: { text: 'Slight Snow', icon: '🌨️' },
  73: { text: 'Moderate Snow', icon: '🌨️' },
  75: { text: 'Heavy Snow', icon: '❄️' },
  80: { text: 'Light Rain Showers', icon: '🌦️' },
  81: { text: 'Moderate Rain Showers', icon: '🌧️' },
  82: { text: 'Violent Rain Showers', icon: '⛈️' },
  95: { text: 'Thunderstorm', icon: '⛈️' },
  96: { text: 'Thunderstorm with Hail', icon: '⛈️' },
  99: { text: 'Severe Thunderstorm', icon: '⛈️' }
};

function fetchWeather() {
  if (!DOCK_CONFIG.weather || !DOCK_CONFIG.weather.enabled) return;

  var lat = DOCK_CONFIG.weather.latitude || 12.0935;
  var lon = DOCK_CONFIG.weather.longitude || 75.2025;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m' +
    '&hourly=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&timezone=auto';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 8000;
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        weatherData = data;
        renderWeather(data);
      } catch (e) {
        console.error('Weather parse error:', e);
      }
    }
  };
  xhr.send();

  // Schedule recurring refresh
  clearTimeout(weatherTimer);
  var refreshMins = DOCK_CONFIG.weather.updateIntervalMinutes || 20;
  weatherTimer = setTimeout(fetchWeather, refreshMins * 60 * 1000);
}

function renderWeather(data) {
  if (!data || !data.current) return;
  var cur = data.current;
  var daily = data.daily || {};
  var wmo = WMO_CODES[cur.weather_code] || { text: 'Partly Cloudy', icon: '⛅' };

  var tempEl = document.getElementById('weather-temp');
  var iconEl = document.getElementById('weather-icon-giant');
  var condEl = document.getElementById('weather-condition');
  var feelsEl = document.getElementById('weather-feels');
  var hlEl = document.getElementById('weather-highlow');
  var humEl = document.getElementById('weather-humidity');
  var windEl = document.getElementById('weather-wind');
  var rainEl = document.getElementById('weather-rain');
  var pressEl = document.getElementById('weather-pressure');
  var locEl = document.getElementById('weather-location');

  if (tempEl) tempEl.innerHTML = Math.round(cur.temperature_2m);
  if (iconEl) iconEl.innerHTML = wmo.icon;
  if (condEl) condEl.innerHTML = wmo.text;
  if (feelsEl) feelsEl.innerHTML = 'Feels like ' + Math.round(cur.apparent_temperature) + '°C';
  if (hlEl && daily.temperature_2m_max && daily.temperature_2m_min) {
    hlEl.innerHTML = 'H: ' + Math.round(daily.temperature_2m_max[0]) + '° • L: ' + Math.round(daily.temperature_2m_min[0]) + '°';
  }
  if (humEl) humEl.innerHTML = cur.relative_humidity_2m + '%';
  if (windEl) windEl.innerHTML = Math.round(cur.wind_speed_10m) + ' km/h';
  if (rainEl) rainEl.innerHTML = (cur.precipitation || 0) + ' mm';
  if (pressEl) pressEl.innerHTML = Math.round(cur.surface_pressure) + ' hPa';
  if (locEl && DOCK_CONFIG.weather.city) {
    locEl.innerHTML = '📍 ' + DOCK_CONFIG.weather.city + (DOCK_CONFIG.weather.region ? ', ' + DOCK_CONFIG.weather.region : '');
  }

  // Render hourly forecast
  var hourlyBox = document.getElementById('hourly-forecast-row');
  if (hourlyBox && data.hourly && data.hourly.time) {
    hourlyBox.innerHTML = '';
    var nowHour = new Date().getHours();
    var count = 0;

    for (var i = 0; i < data.hourly.time.length && count < 12; i++) {
      var t = new Date(data.hourly.time[i]);
      if (t.getHours() >= nowHour || count > 0) {
        var hourCode = data.hourly.weather_code[i];
        var itemWmo = WMO_CODES[hourCode] || { icon: '⛅' };
        var hourStr = count === 0 ? 'Now' : (t.getHours() % 12 ? t.getHours() % 12 : 12) + ' ' + (t.getHours() >= 12 ? 'PM' : 'AM');

        var item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = '<div class="forecast-time">' + hourStr + '</div>' +
          '<div class="forecast-icon">' + itemWmo.icon + '</div>' +
          '<div class="forecast-temp">' + Math.round(data.hourly.temperature_2m[i]) + '°</div>';

        hourlyBox.appendChild(item);
        count++;
      }
    }
  }
}

// -------------------------------------------------------------
// PAGE 5: DESK POMODORO & FOCUS TIMER
// -------------------------------------------------------------
function setTimerPreset(mins, label, chipEl) {
  if (timerRunning) toggleTimer();
  timerTotalSeconds = mins * 60;
  timerSecondsLeft = timerTotalSeconds;
  timerMode = label;

  var modeEl = document.getElementById('timer-mode-label');
  if (modeEl) modeEl.innerHTML = label;

  // Update preset chip style
  var chips = document.querySelectorAll('.timer-preset-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].className = 'timer-preset-chip';
  }
  if (chipEl) chipEl.className = 'timer-preset-chip active';

  updateTimerDisplay();
}

function updateTimerDisplay() {
  var mins = Math.floor(timerSecondsLeft / 60);
  var secs = timerSecondsLeft % 60;
  mins = mins < 10 ? '0' + mins : mins;
  secs = secs < 10 ? '0' + secs : secs;

  var digitsEl = document.getElementById('timer-digits');
  if (digitsEl) digitsEl.innerHTML = mins + ':' + secs;

  // SVG Progress Ring (circumference = 2 * PI * 100 = 628.3)
  var ring = document.getElementById('timer-progress-ring');
  if (ring) {
    var fraction = timerTotalSeconds > 0 ? (timerSecondsLeft / timerTotalSeconds) : 0;
    var offset = 628.3 * (1.0 - fraction);
    ring.style.strokeDashoffset = offset;
  }
}

function toggleTimer() {
  var btn = document.getElementById('timer-toggle-btn');
  var hint = document.getElementById('timer-hint');

  if (timerRunning) {
    // Pause
    clearInterval(timerInterval);
    timerRunning = false;
    if (btn) btn.innerHTML = '▶ Resume';
    if (hint) hint.innerHTML = 'Session Paused';
  } else {
    // Start
    timerRunning = true;
    if (btn) btn.innerHTML = '⏸ Pause';
    if (hint) hint.innerHTML = 'Focusing... Stay in flow!';

    timerInterval = setInterval(function () {
      if (timerSecondsLeft > 0) {
        timerSecondsLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        timerRunning = false;
        if (btn) btn.innerHTML = '▶ Start';
        if (hint) hint.innerHTML = '🎉 Session Completed!';
        playTimerChime();
      }
    }, 1000);
  }
}

function resetTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
  }
  timerSecondsLeft = timerTotalSeconds;
  var btn = document.getElementById('timer-toggle-btn');
  var hint = document.getElementById('timer-hint');
  if (btn) btn.innerHTML = '▶ Start';
  if (hint) hint.innerHTML = 'Tap Start to begin';
  updateTimerDisplay();
}

function toggleTimerSound() {
  timerSoundEnabled = !timerSoundEnabled;
  var sndBtn = document.getElementById('timer-sound-btn');
  if (sndBtn) {
    sndBtn.innerHTML = timerSoundEnabled ? '🔔 Sound On' : '🔕 Muted';
  }
}

function playTimerChime() {
  if (!timerSoundEnabled) return;
  try {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var ctx = new AudioContext();

    var playTone = function (freq, start, duration) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    // Gentle 3-note chime
    playTone(523.25, 0.0, 0.4); // C5
    playTone(659.25, 0.25, 0.4); // E5
    playTone(783.99, 0.5, 0.8); // G5
  } catch (e) {
    console.warn('Audio chime unsupported:', e);
  }
}

// -------------------------------------------------------------
// USER ACTIONS & SCENES
// -------------------------------------------------------------
function toggleDevice(deviceId) {
  var dev = null;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].id === deviceId) {
      dev = DOCK_CONFIG.devices[i];
      break;
    }
  }
  if (!dev) return;

  var ch = dev.channel || 'POWER';
  dev.powerState = dev.powerState === 'ON' ? 'OFF' : 'ON';
  renderDevices();

  publish('cmnd/' + dev.topic + '/' + ch, 'TOGGLE');
}

function pcAction(compId, action, btnEl) {
  var comp = null;
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === compId) {
      comp = DOCK_CONFIG.computers[i];
      break;
    }
  }
  if (!comp) return;

  if (action === 'shutdown') {
    if (!confirm('Shut down ' + comp.name + '?')) {
      return;
    }
  }

  if (action === 'wake') {
    publish('cmnd/' + comp.topic + '/wake', comp.mac);
    var wolTopic = comp.wolDeviceTopic || 'room_light';
    publish('cmnd/' + wolTopic + '/WakeOnLan', comp.mac);
    setTimeout(function () {
      publish('cmnd/' + comp.topic + '/wake', comp.mac);
      publish('cmnd/' + wolTopic + '/WakeOnLan', comp.mac);
    }, 500);
    console.log('Published WoL request for ' + comp.name + ':', comp.mac);
  } else if (action === 'sleep') {
    publish('cmnd/' + comp.topic + '/power', 'sleep');
  } else if (action === 'shutdown') {
    publish('cmnd/' + comp.topic + '/power', 'shutdown');
  }
}

function triggerScene(sceneName, chipEl) {
  if (chipEl) {
    chipEl.className = chipEl.className + ' animating';
    setTimeout(function () {
      chipEl.className = chipEl.className.replace(/\s*animating/g, '');
    }, 450);
  }

  if (sceneName === 'wake_day') {
    pcAction('desktop_pc', 'wake');
    setTimeout(function () { pcAction('work_laptop', 'wake'); }, 250);

    for (var d_idx = 0; d_idx < DOCK_CONFIG.devices.length; d_idx++) {
      var dev_d = DOCK_CONFIG.devices[d_idx];
      var ch_d = dev_d.channel || 'POWER';
      if (dev_d.type === 'fan' || dev_d.id === 'room_fan' || ch_d === 'POWER1') {
        dev_d.powerState = 'ON';
        publish('cmnd/' + dev_d.topic + '/' + ch_d, 'ON');
      } else {
        dev_d.powerState = 'OFF';
        publish('cmnd/' + dev_d.topic + '/' + ch_d, 'OFF');
      }
    }
    renderDevices();

  } else if (sceneName === 'wake_night') {
    pcAction('desktop_pc', 'wake');
    setTimeout(function () { pcAction('work_laptop', 'wake'); }, 250);

    for (var n_idx = 0; n_idx < DOCK_CONFIG.devices.length; n_idx++) {
      var dev_n = DOCK_CONFIG.devices[n_idx];
      var ch_n = dev_n.channel || 'POWER';
      if (dev_n.type === 'fan' || dev_n.id === 'room_fan' || ch_n === 'POWER1') {
        dev_n.powerState = 'ON';
        publish('cmnd/' + dev_n.topic + '/' + ch_n, 'ON');
      } else if (dev_n.id === 'room_light' || ch_n === 'POWER2') {
        dev_n.powerState = 'ON';
        publish('cmnd/' + dev_n.topic + '/' + ch_n, 'ON');
      } else {
        dev_n.powerState = 'OFF';
        publish('cmnd/' + dev_n.topic + '/' + ch_n, 'OFF');
      }
    }
    renderDevices();

  } else if (sceneName === 'shutdown') {
    publish('cmnd/desktop_pc/power', 'shutdown');
    publish('cmnd/work_laptop/power', 'sleep');

    for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
      var d = DOCK_CONFIG.devices[i];
      d.powerState = 'OFF';
      var ch = d.channel || 'POWER';
      publish('cmnd/' + d.topic + '/' + ch, 'OFF');
    }
    renderDevices();

  } else if (sceneName === 'suspend') {
    publish('cmnd/desktop_pc/power', 'sleep');
    publish('cmnd/work_laptop/power', 'sleep');

    for (var j = 0; j < DOCK_CONFIG.devices.length; j++) {
      var d2 = DOCK_CONFIG.devices[j];
      d2.powerState = 'OFF';
      var ch2 = d2.channel || 'POWER';
      publish('cmnd/' + d2.topic + '/' + ch2, 'OFF');
    }
    renderDevices();

  } else if (sceneName === 'all_on') {
    for (var m = 0; m < DOCK_CONFIG.devices.length; m++) {
      var d4 = DOCK_CONFIG.devices[m];
      d4.powerState = 'ON';
      var ch4 = d4.channel || 'POWER';
      publish('cmnd/' + d4.topic + '/' + ch4, 'ON');
    }
    renderDevices();

  } else if (sceneName === 'all_off') {
    for (var n = 0; n < DOCK_CONFIG.devices.length; n++) {
      var d5 = DOCK_CONFIG.devices[n];
      d5.powerState = 'OFF';
      var ch5 = d5.channel || 'POWER';
      publish('cmnd/' + d5.topic + '/' + ch5, 'OFF');
    }
    renderDevices();
  }
}

// -------------------------------------------------------------
// MQTT Handlers (Paho MQTT)
// -------------------------------------------------------------
function setStatus(status, text) {
  var dot = document.getElementById('mqtt-dot');
  var label = document.getElementById('mqtt-label');
  if (dot) dot.className = 'status-indicator-dot ' + status;
  if (label) label.innerHTML = text;
}

function connectMqtt() {
  var cfg = getSettings();
  setStatus('connecting', 'Connecting...');

  var clientId = 'ipad_dock_' + Math.random().toString(16).substr(2, 8);

  try {
    mqttClient = new Paho.MQTT.Client(cfg.host, Number(cfg.port), cfg.path, clientId);
  } catch (err) {
    console.error('Paho client creation failed:', err);
    setStatus('error', 'Config Error');
    return;
  }

  mqttClient.onConnectionLost = function (responseObject) {
    isConnected = false;
    setStatus('disconnected', 'Disconnected');
    console.warn('MQTT Connection lost:', responseObject.errorMessage);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectMqtt, 4000);
  };

  mqttClient.onMessageArrived = function (message) {
    handleIncomingMessage(message.destinationName, message.payloadString);
  };

  var options = {
    timeout: 5,
    keepAliveInterval: 30,
    cleanSession: true,
    useSSL: cfg.useSSL,
    onSuccess: function () {
      isConnected = true;
      setStatus('connected', 'Live');
      console.log('Connected to MQTT broker at ' + cfg.host + ':' + cfg.port);
      subscribeAll();
    },
    onFailure: function (err) {
      isConnected = false;
      setStatus('disconnected', 'Failed');
      console.error('MQTT Connect failed:', err);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectMqtt, 5000);
    }
  };

  if (cfg.username) {
    options.userName = cfg.username;
    if (cfg.password) options.password = cfg.password;
  }

  mqttClient.connect(options);
}

function subscribeAll() {
  if (!isConnected || !mqttClient) return;

  mqttClient.subscribe('stat/+/POWER', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER1', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER2', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER3', { qos: 0 });
  mqttClient.subscribe('stat/+/RESULT', { qos: 0 });
  mqttClient.subscribe('tele/+/STATE', { qos: 0 });
  mqttClient.subscribe('cmnd/ipaddock/reload', { qos: 0 });

  // Telemetry & Media subscriptions
  mqttClient.subscribe('stat/+/telemetry', { qos: 0 });
  mqttClient.subscribe('stat/+/media', { qos: 0 });

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    mqttClient.subscribe('stat/' + comp.topic + '/status', { qos: 0 });
    publish('cmnd/' + comp.topic + '/ping', '1');
  }

  for (var j = 0; j < DOCK_CONFIG.devices.length; j++) {
    var dev = DOCK_CONFIG.devices[j];
    var ch = dev.channel || 'POWER';
    publish('cmnd/' + dev.topic + '/' + ch, '');
  }
}

function publish(topic, message) {
  if (!isConnected || !mqttClient) {
    console.warn('Cannot publish, MQTT disconnected');
    return;
  }
  var msg = new Paho.MQTT.Message(message);
  msg.destinationName = topic;
  msg.qos = 0;
  mqttClient.send(msg);
}

function handleIncomingMessage(topic, payload) {
  if (topic === 'cmnd/ipaddock/reload') {
    window.location.reload(true);
    return;
  }

  // Tasmota Devices
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    var dev = DOCK_CONFIG.devices[i];
    var ch = dev.channel || 'POWER';
    var powerTopic = 'stat/' + dev.topic + '/' + ch;
    var resultTopic = 'stat/' + dev.topic + '/RESULT';

    if (topic === powerTopic) {
      updateDevicePowerState(dev.id, payload);
    } else if (topic === resultTopic) {
      try {
        var json = JSON.parse(payload);
        if (json[ch] !== undefined) updateDevicePowerState(dev.id, json[ch]);
        if (!dev.channel && json.POWER !== undefined) updateDevicePowerState(dev.id, json.POWER);
      } catch (e) {}
    }
  }

  // Workstations
  for (var k = 0; k < DOCK_CONFIG.computers.length; k++) {
    var comp = DOCK_CONFIG.computers[k];

    // Status
    if (topic === 'stat/' + comp.topic + '/status') {
      updateComputerStatus(comp.id, payload.toLowerCase().trim());
    }

    // Telemetry
    if (topic === 'stat/' + comp.topic + '/telemetry') {
      try {
        var telem = JSON.parse(payload);
        updateHudCard(comp.id, telem);
      } catch (e2) {}
    }

    // Media
    if (topic === 'stat/' + comp.topic + '/media') {
      try {
        var media = JSON.parse(payload);
        comp.media = media;
        if (comp.id === activeMediaTarget) {
          updateMediaCard(media);
        }
      } catch (e3) {}
    }
  }
}

function updateDevicePowerState(deviceId, state) {
  var dev = null;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].id === deviceId) {
      dev = DOCK_CONFIG.devices[i];
      break;
    }
  }
  if (!dev) return;

  var newState = (state === 'ON' || state === '1') ? 'ON' : 'OFF';
  if (dev.powerState !== newState) {
    dev.powerState = newState;
    renderDevices();
  }
}

function updateComputerStatus(compId, status) {
  var comp = null;
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === compId) {
      comp = DOCK_CONFIG.computers[i];
      break;
    }
  }
  if (!comp) return;

  comp.state = status;
  var badge = document.getElementById('ws-badge-' + comp.id);
  var hudBadge = document.getElementById('hud-badge-' + comp.id);

  if (badge) {
    var badgeClass = status === 'online' ? 'online' : (status === 'sleep' ? 'sleep' : 'offline');
    badge.className = 'ws-status-badge ' + badgeClass;
    badge.innerHTML = status.toUpperCase();
  }
  if (hudBadge) {
    var hudClass = status === 'online' ? 'online' : (status === 'sleep' ? 'sleep' : 'offline');
    hudBadge.className = 'ws-status-badge ' + hudClass;
    hudBadge.innerHTML = status.toUpperCase();
  }
}

// -------------------------------------------------------------
// Auto-Refresh & Version Watchdog
// -------------------------------------------------------------
var currentDeploymentVersion = null;

function checkForUpdates() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'version.json?_t=' + new Date().getTime(), true);
  xhr.timeout = 5000;
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        if (currentDeploymentVersion === null) {
          currentDeploymentVersion = data.version;
        } else if (data.version && data.version !== currentDeploymentVersion) {
          console.log('New version detected (' + data.version + '). Reloading UI...');
          window.location.reload(true);
        }
      } catch (e) {}
    }
  };
  xhr.send();
}

function initWatchdogs() {
  if (DOCK_CONFIG.checkVersionIntervalSeconds > 0) {
    checkForUpdates();
    setInterval(checkForUpdates, DOCK_CONFIG.checkVersionIntervalSeconds * 1000);
  }

  if (DOCK_CONFIG.autoRefreshIntervalMinutes > 0) {
    var refreshMs = DOCK_CONFIG.autoRefreshIntervalMinutes * 60 * 1000;
    setTimeout(function () {
      window.location.reload(true);
    }, refreshMs);
  }

  // Wake recovery
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      if (!isConnected) connectMqtt();
      else subscribeAll();
      checkForUpdates();
    }
  });
}

// -------------------------------------------------------------
// Settings Modal
// -------------------------------------------------------------
function openSettings() {
  var cfg = getSettings();
  document.getElementById('cfg-host').value = cfg.host;
  document.getElementById('cfg-port').value = cfg.port;
  document.getElementById('cfg-path').value = cfg.path;
  document.getElementById('cfg-user').value = cfg.username || '';
  document.getElementById('cfg-pass').value = cfg.password || '';
  var storedReload = localStorage.getItem('dock_refresh_mins');
  document.getElementById('cfg-reload').value = storedReload !== null ? storedReload : 30;
  document.getElementById('settings-modal').className = 'modal-overlay open';
}

function closeSettings() {
  document.getElementById('settings-modal').className = 'modal-overlay';
}

function saveSettings() {
  var host = document.getElementById('cfg-host').value.trim();
  var port = document.getElementById('cfg-port').value.trim();
  var path = document.getElementById('cfg-path').value.trim();
  var user = document.getElementById('cfg-user').value.trim();
  var pass = document.getElementById('cfg-pass').value.trim();
  var reload = document.getElementById('cfg-reload').value.trim();

  localStorage.setItem('dock_mqtt_host', host);
  localStorage.setItem('dock_mqtt_port', port);
  localStorage.setItem('dock_mqtt_path', path);
  localStorage.setItem('dock_mqtt_user', user);
  localStorage.setItem('dock_mqtt_pass', pass);
  if (reload !== '') localStorage.setItem('dock_refresh_mins', reload);

  closeSettings();
  if (mqttClient && isConnected) {
    try { mqttClient.disconnect(); } catch (e) {}
  }
  connectMqtt();
}

function toggleFullscreen() {
  var isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (!isStandalone) {
    document.getElementById('fullscreen-modal').className = 'modal-overlay open';
  } else {
    var elem = document.documentElement;
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }
}

function closeFullscreenModal() {
  document.getElementById('fullscreen-modal').className = 'modal-overlay';
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
window.onload = function () {
  updateClock();
  setInterval(updateClock, 1000);

  // Initialize Page 1
  renderDevices();
  renderComputers();

  // Initialize Page 2 (HUD)
  renderHud();

  // Initialize Page 3 (Media)
  renderMediaTargets();

  // Initialize Page 5 (Timer)
  updateTimerDisplay();

  // Initialize Swipe Carousel
  initSwipeGestures();

  // Initialize Weather
  fetchWeather();

  // Initialize MQTT & Watchdogs
  connectMqtt();
  initWatchdogs();
};
