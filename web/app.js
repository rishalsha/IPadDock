// Apple HomeKit Style iPad Dock Controller
// Pure ES5 / 100% Compatible with iOS 10 Safari

var mqttClient = null;
var isConnected = false;
var reconnectTimer = null;

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
  if (dateElem) {
    dateElem.innerHTML = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
  }
}

// -------------------------------------------------------------
// HomeKit Dynamic Accessories & Status Counters
// -------------------------------------------------------------
function updateActiveCounters() {
  var activeCount = 0;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].powerState === 'ON') {
      activeCount++;
    }
  }

  var countElem = document.getElementById('relays-active-count');
  if (countElem) {
    countElem.innerHTML = activeCount + ' of ' + DOCK_CONFIG.devices.length + ' On';
  }
}

function renderDevices() {
  var container = document.getElementById('devices-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    var dev = DOCK_CONFIG.devices[i];
    var isFan = dev.type === 'fan';
    var isOn = dev.powerState === 'ON';

    var card = document.createElement('div');
    card.id = 'tile-' + dev.id;
    card.className = 'homekit-tile' + (isFan ? ' fan-tile' : '') + (isOn ? ' active' : '');
    card.setAttribute('onclick', 'toggleDevice(\'' + dev.id + '\')');

    var channelLabel = dev.channel || 'RELAY';
    channelLabel = channelLabel.replace('POWER', 'Relay ');

    var html = '<div class="tile-header">' +
      '<div class="tile-icon-circle">' + dev.icon + '</div>' +
      '<div class="tile-state-dot"></div>' +
      '</div>' +
      '<div class="tile-details">' +
      '<div class="tile-name">' + dev.name + '</div>' +
      '<div class="tile-channel">' + channelLabel + '</div>' +
      '<div class="tile-status" id="status-' + dev.id + '">' + dev.powerState + '</div>' +
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
    card.className = 'workstation-tile' + (comp.state === 'online' ? ' active' : '');

    var badgeClass = comp.state === 'online' ? 'online' : (comp.state === 'sleep' ? 'sleep' : 'offline');
    var badgeLabel = comp.state.toUpperCase();

    var html = '<div class="ws-top">' +
      '<div class="tile-icon-circle">' + comp.icon + '</div>' +
      '<div class="ws-badge ' + badgeClass + '" id="ws-badge-' + comp.id + '">' +
      '<span>●</span> <span>' + badgeLabel + '</span>' +
      '</div>' +
      '</div>' +
      '<div>' +
      '<div class="ws-name">' + comp.name + '</div>' +
      '<div class="ws-sub">Wake-on-LAN Ready</div>' +
      '</div>' +
      '<div class="ws-action-bar">' +
      '<button class="ws-btn wake-btn" onclick="pcAction(\'' + comp.id + '\', \'wake\', this)">⚡ Wake</button>' +
      '<button class="ws-btn sleep-btn" onclick="pcAction(\'' + comp.id + '\', \'sleep\', this)">💤 Sleep</button>' +
      '<button class="ws-btn off-btn" onclick="pcAction(\'' + comp.id + '\', \'shutdown\', this)">⏻ Off</button>' +
      '</div>';

    card.innerHTML = html;
    container.appendChild(card);
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
    setStatus('error', 'Disconnected');
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
      setStatus('error', 'Failed');
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
  mqttClient.subscribe('stat/+/POWER4', { qos: 0 });
  mqttClient.subscribe('stat/+/RESULT', { qos: 0 });
  mqttClient.subscribe('tele/+/STATE', { qos: 0 });

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    mqttClient.subscribe('stat/' + comp.topic + '/status', { qos: 0 });
    publish('cmnd/' + comp.topic + '/ping', '1');
  }

  // Request initial status for all relays
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

// -------------------------------------------------------------
// Message Routing & State
// -------------------------------------------------------------
function handleIncomingMessage(topic, payload) {
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

  for (var k = 0; k < DOCK_CONFIG.computers.length; k++) {
    var comp = DOCK_CONFIG.computers[k];
    if (topic === 'stat/' + comp.topic + '/status') {
      updateComputerStatus(comp.id, payload.toLowerCase().trim());
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
  var card = document.getElementById('comp-' + comp.id);
  var badge = document.getElementById('ws-badge-' + comp.id);

  if (card) {
    card.className = 'workstation-tile' + (status === 'online' ? ' active' : '');
  }
  if (badge) {
    var badgeClass = status === 'online' ? 'online' : (status === 'sleep' ? 'sleep' : 'offline');
    badge.className = 'ws-badge ' + badgeClass;
    badge.innerHTML = '<span>●</span> <span>' + status.toUpperCase() + '</span>';
  }
}

// -------------------------------------------------------------
// User Interaction
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
  // Optimistic toggle for instant feel
  dev.powerState = dev.powerState === 'ON' ? 'OFF' : 'ON';
  renderDevices();

  publish('cmnd/' + dev.topic + '/' + ch, 'TOGGLE');
}

function animateButtonPress(btnEl, action, compId) {
  if (!btnEl && compId) {
    var cls = action === 'shutdown' ? 'off' : action;
    var tile = document.getElementById('comp-' + compId);
    if (tile) btnEl = tile.querySelector('.' + cls + '-btn');
  }
  if (!btnEl) return;

  // Add animating class for spring bounce + glow
  btnEl.className = btnEl.className.replace(/\s*animating/g, '') + ' animating';

  // Pulse the workstation card
  var card = document.getElementById('comp-' + compId);
  if (card) {
    card.className = card.className.replace(/\s*dispatched/g, '') + ' dispatched';
    setTimeout(function () {
      if (card) card.className = card.className.replace(/\s*dispatched/g, '');
    }, 850);
  }

  // Temporary feedback text
  var origHtml = btnEl.innerHTML;
  if (action === 'wake') {
    btnEl.innerHTML = '⚡ Sent!';
  } else if (action === 'sleep') {
    btnEl.innerHTML = '💤 Sent!';
  } else if (action === 'shutdown') {
    btnEl.innerHTML = '⏻ Sent!';
  }

  setTimeout(function () {
    btnEl.className = btnEl.className.replace(/\s*animating/g, '');
    btnEl.innerHTML = origHtml;
  }, 950);
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

  animateButtonPress(btnEl, action, compId);

  if (action === 'wake') {
    var wolTopic = comp.wolDeviceTopic || 'room_light';
    publish('cmnd/' + wolTopic + '/WakeOnLan', comp.mac);
    console.log('Published WoL request to Tasmota:', comp.mac);
  } else if (action === 'sleep') {
    publish('cmnd/' + comp.topic + '/power', 'sleep');
  } else if (action === 'shutdown') {
    publish('cmnd/' + comp.topic + '/power', 'shutdown');
  }
}

function triggerScene(sceneName) {
  if (sceneName === 'all_off') {
    for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
      var d = DOCK_CONFIG.devices[i];
      d.powerState = 'OFF';
      var ch = d.channel || 'POWER';
      publish('cmnd/' + d.topic + '/' + ch, 'OFF');
    }
    renderDevices();
    for (var j = 0; j < DOCK_CONFIG.computers.length; j++) {
      publish('cmnd/' + DOCK_CONFIG.computers[j].topic + '/power', 'sleep');
    }
  } else if (sceneName === 'work_mode') {
    for (var k = 0; k < DOCK_CONFIG.devices.length; k++) {
      var d2 = DOCK_CONFIG.devices[k];
      d2.powerState = 'ON';
      var ch2 = d2.channel || 'POWER';
      publish('cmnd/' + d2.topic + '/' + ch2, 'ON');
    }
    renderDevices();
    pcAction('desktop_pc', 'wake');
  } else if (sceneName === 'relax_mode') {
    for (var m = 0; m < DOCK_CONFIG.devices.length; m++) {
      var d3 = DOCK_CONFIG.devices[m];
      var ch3 = d3.channel || 'POWER';
      if (d3.type === 'fan') {
        d3.powerState = 'ON';
        publish('cmnd/' + d3.topic + '/' + ch3, 'ON');
      } else {
        d3.powerState = 'OFF';
        publish('cmnd/' + d3.topic + '/' + ch3, 'OFF');
      }
    }
    renderDevices();
  }
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

  localStorage.setItem('dock_mqtt_host', host);
  localStorage.setItem('dock_mqtt_port', port);
  localStorage.setItem('dock_mqtt_path', path);
  localStorage.setItem('dock_mqtt_user', user);
  localStorage.setItem('dock_mqtt_pass', pass);

  closeSettings();

  if (mqttClient && isConnected) {
    try { mqttClient.disconnect(); } catch (e) {}
  }
  connectMqtt();
}

// -------------------------------------------------------------
// Fullscreen / Kiosk Handlers
// -------------------------------------------------------------
function toggleFullscreen() {
  var doc = window.document;
  var docEl = doc.documentElement;

  var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
  var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

  if (window.navigator.standalone) {
    alert('Already running in standalone fullscreen mode!');
    return;
  }

  if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
    if (requestFullScreen) {
      try {
        requestFullScreen.call(docEl);
      } catch (err) {
        openFullscreenModal();
      }
    } else {
      openFullscreenModal();
    }
  } else {
    if (cancelFullScreen) {
      cancelFullScreen.call(doc);
    }
  }
}

function openFullscreenModal() {
  var modal = document.getElementById('fullscreen-modal');
  if (modal) modal.className = 'modal-overlay open';
}

function closeFullscreenModal() {
  var modal = document.getElementById('fullscreen-modal');
  if (modal) modal.className = 'modal-overlay';
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
window.onload = function () {
  // Enable instant :active and touch responses on iOS Safari
  document.addEventListener('touchstart', function () {}, false);

  updateClock();
  setInterval(updateClock, 1000);

  renderDevices();
  renderComputers();

  connectMqtt();
};
