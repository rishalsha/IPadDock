// iPad Dock Application Logic
// Strictly ES5 / iOS 10 Safari Compatible

var mqttClient = null;
var isConnected = false;
var reconnectTimer = null;

// Load persisted settings or fallback to config.js defaults
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
// UI Clock & Date Updater
// -------------------------------------------------------------
function updateClock() {
  var now = new Date();
  var hours = now.getHours();
  var minutes = now.getMinutes();
  var seconds = now.getSeconds();

  var ampm = '';
  if (!DOCK_CONFIG.clockFormat24h) {
    ampm = hours >= 12 ? ' PM' : ' AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
  } else {
    hours = hours < 10 ? '0' + hours : hours;
  }

  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;

  var timeStr = hours + ':' + minutes;
  if (DOCK_CONFIG.showSeconds) {
    timeStr += ':' + seconds;
  }
  timeStr += ampm;

  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var dateStr = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();

  var timeElem = document.getElementById('live-time');
  var dateElem = document.getElementById('live-date');
  if (timeElem) timeElem.innerHTML = timeStr;
  if (dateElem) dateElem.innerHTML = dateStr;
}

// -------------------------------------------------------------
// Dynamic Card Rendering
// -------------------------------------------------------------
function renderDevices() {
  var container = document.getElementById('devices-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    var dev = DOCK_CONFIG.devices[i];
    var card = document.createElement('div');
    card.id = 'card-' + dev.id;
    card.className = 'device-card' + (dev.powerState === 'ON' ? ' active' : '');

    var topHtml = '<div class="card-top">' +
      '<div class="device-icon">' + dev.icon + '</div>' +
      '<button class="power-toggle-btn" onclick="toggleDevice(\'' + dev.id + '\')">⏻</button>' +
      '</div>';

    var extraHtml = '';
    if (dev.type === 'fan') {
      extraHtml = '<div class="card-extra-controls">' +
        '<div class="fan-speeds">' +
        '<button class="fan-speed-btn' + (dev.speed === 1 ? ' active' : '') + '" onclick="setFanSpeed(\'' + dev.id + '\', 1)">1</button>' +
        '<button class="fan-speed-btn' + (dev.speed === 2 ? ' active' : '') + '" onclick="setFanSpeed(\'' + dev.id + '\', 2)">2</button>' +
        '<button class="fan-speed-btn' + (dev.speed === 3 ? ' active' : '') + '" onclick="setFanSpeed(\'' + dev.id + '\', 3)">3</button>' +
        '<button class="fan-speed-btn' + (dev.speed === 4 ? ' active' : '') + '" onclick="setFanSpeed(\'' + dev.id + '\', 4)">4</button>' +
        '</div></div>';
    }

    var bottomHtml = '<div class="card-bottom">' +
      '<div class="device-name">' + dev.name + '</div>' +
      '<div class="device-status" id="status-' + dev.id + '">' + dev.powerState + '</div>' +
      extraHtml +
      '</div>';

    card.innerHTML = topHtml + bottomHtml;
    container.appendChild(card);
  }
}

function renderComputers() {
  var container = document.getElementById('computers-grid');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    var card = document.createElement('div');
    card.id = 'comp-' + comp.id;
    card.className = 'device-card computer-card' + (comp.state === 'online' ? ' active' : '');

    var badgeClass = comp.state === 'online' ? 'online' : (comp.state === 'sleep' ? 'sleep' : 'offline');
    var badgeLabel = comp.state.toUpperCase();

    var html = '<div class="card-top">' +
      '<div class="device-icon">' + comp.icon + '</div>' +
      '<span class="pc-status-badge ' + badgeClass + '" id="comp-badge-' + comp.id + '">' + badgeLabel + '</span>' +
      '</div>' +
      '<div class="card-bottom">' +
      '<div class="device-name">' + comp.name + '</div>' +
      '<div class="pc-actions">' +
      '<button class="pc-action-btn wake-btn" onclick="pcAction(\'' + comp.id + '\', \'wake\')">⚡ Wake</button>' +
      '<button class="pc-action-btn" onclick="pcAction(\'' + comp.id + '\', \'sleep\')">💤 Sleep</button>' +
      '<button class="pc-action-btn poweroff-btn" onclick="pcAction(\'' + comp.id + '\', \'shutdown\')">⏻ Off</button>' +
      '</div>' +
      '</div>';

    card.innerHTML = html;
    container.appendChild(card);
  }
}

// -------------------------------------------------------------
// MQTT Connection & Handlers (Paho MQTT)
// -------------------------------------------------------------
function setStatus(status, text) {
  var dot = document.getElementById('mqtt-dot');
  var label = document.getElementById('mqtt-label');
  if (!dot || !label) return;

  dot.className = 'status-dot ' + status;
  label.innerHTML = text;
}

function connectMqtt() {
  var cfg = getSettings();
  setStatus('connecting', 'Connecting...');

  // Generate random client ID
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
    // Auto-reconnect after 4 seconds
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

  // Subscribe to all Tasmota telemetry and status topics
  mqttClient.subscribe('stat/+/POWER', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER1', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER2', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER3', { qos: 0 });
  mqttClient.subscribe('stat/+/POWER4', { qos: 0 });
  mqttClient.subscribe('stat/+/RESULT', { qos: 0 });
  mqttClient.subscribe('tele/+/STATE', { qos: 0 });

  // Subscribe to computer status topics
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    var comp = DOCK_CONFIG.computers[i];
    mqttClient.subscribe('stat/' + comp.topic + '/status', { qos: 0 });
    publish('cmnd/' + comp.topic + '/ping', '1');
  }

  // Query initial state for all Tasmota devices
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
// Message Routing & State Updates
// -------------------------------------------------------------
function handleIncomingMessage(topic, payload) {
  // Check Tasmota device states
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
        if (dev.type === 'fan' && json.Fanspeed !== undefined) updateFanSpeedState(dev.id, json.Fanspeed);
      } catch (e) {}
    }
  }

  // Check Computer status
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

  dev.powerState = (state === 'ON' || state === '1') ? 'ON' : 'OFF';

  var card = document.getElementById('card-' + dev.id);
  var statusElem = document.getElementById('status-' + dev.id);

  if (card) {
    if (dev.powerState === 'ON') {
      card.className = 'device-card active';
    } else {
      card.className = 'device-card';
    }
  }
  if (statusElem) statusElem.innerHTML = dev.powerState;
}

function updateFanSpeedState(deviceId, speed) {
  var dev = null;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].id === deviceId) {
      dev = DOCK_CONFIG.devices[i];
      break;
    }
  }
  if (!dev) return;
  dev.speed = Number(speed);
  renderDevices();
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

  comp.state = status; // 'online', 'offline', 'sleep'
  var card = document.getElementById('comp-' + comp.id);
  var badge = document.getElementById('comp-badge-' + comp.id);

  if (card) {
    card.className = 'device-card computer-card' + (status === 'online' ? ' active' : '');
  }
  if (badge) {
    var badgeClass = status === 'online' ? 'online' : (status === 'sleep' ? 'sleep' : 'offline');
    badge.className = 'pc-status-badge ' + badgeClass;
    badge.innerHTML = status.toUpperCase();
  }
}

// -------------------------------------------------------------
// User Interaction Handlers
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
  publish('cmnd/' + dev.topic + '/' + ch, 'TOGGLE');
}

function setFanSpeed(deviceId, speed) {
  var dev = null;
  for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
    if (DOCK_CONFIG.devices[i].id === deviceId) {
      dev = DOCK_CONFIG.devices[i];
      break;
    }
  }
  if (!dev) return;
  var ch = dev.channel || 'POWER';
  publish('cmnd/' + dev.topic + '/' + ch, speed > 0 ? 'ON' : 'OFF');
}

function pcAction(compId, action) {
  var comp = null;
  for (var i = 0; i < DOCK_CONFIG.computers.length; i++) {
    if (DOCK_CONFIG.computers[i].id === compId) {
      comp = DOCK_CONFIG.computers[i];
      break;
    }
  }
  if (!comp) return;

  if (action === 'wake') {
    // Send WakeOnLan command via Tasmota device on the local network
    var wolTopic = comp.wolDeviceTopic || 'room_light';
    publish('cmnd/' + wolTopic + '/WakeOnLan', comp.mac);
    console.log('Published WoL request to Tasmota:', comp.mac);
  } else if (action === 'sleep') {
    publish('cmnd/' + comp.topic + '/power', 'sleep');
  } else if (action === 'shutdown') {
    if (confirm('Are you sure you want to shut down ' + comp.name + '?')) {
      publish('cmnd/' + comp.topic + '/power', 'shutdown');
    }
  }
}

function triggerScene(sceneName) {
  if (sceneName === 'all_off') {
    // Turn off all devices
    for (var i = 0; i < DOCK_CONFIG.devices.length; i++) {
      var d = DOCK_CONFIG.devices[i];
      var ch = d.channel || 'POWER';
      publish('cmnd/' + d.topic + '/' + ch, 'OFF');
    }
    // Put computers to sleep
    for (var j = 0; j < DOCK_CONFIG.computers.length; j++) {
      publish('cmnd/' + DOCK_CONFIG.computers[j].topic + '/power', 'sleep');
    }
  } else if (sceneName === 'work_mode') {
    for (var k = 0; k < DOCK_CONFIG.devices.length; k++) {
      var d2 = DOCK_CONFIG.devices[k];
      var ch2 = d2.channel || 'POWER';
      publish('cmnd/' + d2.topic + '/' + ch2, 'ON');
    }
    pcAction('desktop_pc', 'wake');
  } else if (sceneName === 'relax_mode') {
    // Turn off room lights, leave fan on
    for (var m = 0; m < DOCK_CONFIG.devices.length; m++) {
      var d3 = DOCK_CONFIG.devices[m];
      var ch3 = d3.channel || 'POWER';
      if (d3.type === 'fan') {
        publish('cmnd/' + d3.topic + '/' + ch3, 'ON');
      } else {
        publish('cmnd/' + d3.topic + '/' + ch3, 'OFF');
      }
    }
  }
}

// -------------------------------------------------------------
// Settings Modal Handlers
// -------------------------------------------------------------
function openSettings() {
  var cfg = getSettings();
  document.getElementById('cfg-host').value = cfg.host;
  document.getElementById('cfg-port').value = cfg.port;
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
  var user = document.getElementById('cfg-user').value.trim();
  var pass = document.getElementById('cfg-pass').value.trim();

  localStorage.setItem('dock_mqtt_host', host);
  localStorage.setItem('dock_mqtt_port', port);
  localStorage.setItem('dock_mqtt_user', user);
  localStorage.setItem('dock_mqtt_pass', pass);

  closeSettings();

  if (mqttClient && isConnected) {
    try { mqttClient.disconnect(); } catch (e) {}
  }
  connectMqtt();
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
window.onload = function () {
  updateClock();
  setInterval(updateClock, 1000);

  renderDevices();
  renderComputers();

  var btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.onclick = openSettings;
  }

  connectMqtt();
};
