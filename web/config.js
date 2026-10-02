// iPad Dock Configuration
// Customized for your 3-channel Tasmota device:
// Relay 1 = Fan, Relay 2 = Light, Relay 3 = Bulb

var DOCK_CONFIG = {
  // MQTT Connection Settings
  // Leave host as '' to automatically connect via current webpage host
  mqttHost: '',
  mqttPort: 9001,
  mqttPath: '/mqtt',
  useSSL: false,
  username: '',
  password: '',

  // Design / Behavior
  clockFormat24h: false,
  showSeconds: true,

  // Auto-Refresh & Watchdog Settings
  autoRefreshEnabled: true,
  autoRefreshIntervalMinutes: 30, // Scheduled page reload to prevent iOS 10 memory leaks (0 to disable)
  autoSyncIntervalSeconds: 15,    // Automatic background state re-polling
  checkVersionIntervalSeconds: 15, // Check for code/dashboard updates from server

  // Tasmota Devices (Relay 1 = Fan, Relay 2 = Light, Relay 3 = Bulb)
  devices: [
    {
      id: 'room_fan',
      name: 'Fan',
      type: 'fan',
      icon: '💨',
      topic: 'room_light',
      channel: 'POWER1',
      powerState: 'OFF'
    },
    {
      id: 'room_light',
      name: 'Light',
      type: 'switch',
      icon: '💡',
      topic: 'room_light',
      channel: 'POWER2',
      powerState: 'OFF'
    },
    {
      id: 'room_bulb',
      name: 'Bulb',
      type: 'switch',
      icon: '🏮',
      topic: 'room_light',
      channel: 'POWER3',
      powerState: 'OFF'
    }
  ],

  // PC and Laptop Devices
  computers: [
    {
      id: 'desktop_pc',
      name: 'Desktop PC',
      type: 'pc',
      icon: '🖥️',
      topic: 'desktop_pc',
      mac: '04:7c:16:b7:5e:96',
      wolDeviceTopic: 'room_light', // Tasmota device that broadcasts WoL packet
      state: 'offline' // 'online', 'offline', 'sleep'
    },
    {
      id: 'work_laptop',
      name: 'Work Laptop',
      type: 'laptop',
      icon: '💻',
      topic: 'work_laptop',
      mac: '30:e3:a4:8e:ff:ee',
      wolDeviceTopic: 'room_light',
      state: 'offline'
    }
  ]
};
