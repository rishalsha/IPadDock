// iPad Dock Configuration
// Customized for your 3-channel Tasmota device (Tube, Fan, Light)

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

  // Tasmota Devices (configured to match your 3 relays on 'room_light')
  devices: [
    {
      id: 'room_tube',
      name: 'Tube Light',
      type: 'switch',
      icon: '💡',
      topic: 'room_light',
      channel: 'POWER1',
      powerState: 'OFF'
    },
    {
      id: 'room_fan',
      name: 'Ceiling Fan',
      type: 'fan',
      icon: '💨',
      topic: 'room_light',
      channel: 'POWER2',
      powerState: 'OFF',
      speed: 1
    },
    {
      id: 'room_light',
      name: 'Main Light',
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
      mac: '00:11:22:33:44:55',
      wolDeviceTopic: 'room_light', // Tasmota device that broadcasts WoL packet
      state: 'offline' // 'online', 'offline', 'sleep'
    },
    {
      id: 'work_laptop',
      name: 'Work Laptop',
      type: 'laptop',
      icon: '💻',
      topic: 'work_laptop',
      mac: '66:77:88:99:AA:BB',
      wolDeviceTopic: 'room_light',
      state: 'offline'
    }
  ]
};
