// iPad Dock Configuration
// All settings can be customized here or adjusted live in the Settings modal

var DOCK_CONFIG = {
  // MQTT Connection Settings
  // Leave host as '' to automatically use the host serving this webpage
  mqttHost: '',
  mqttPort: 9001,
  mqttPath: '/mqtt',
  useSSL: false,
  username: '',
  password: '',

  // Design / Behavior
  clockFormat24h: false,
  showSeconds: true,

  // Tasmota Devices
  devices: [
    {
      id: 'room_light',
      name: 'Ceiling Light',
      type: 'switch', // switch, fan, dimmer
      icon: '💡',
      topic: 'room_light',
      powerState: 'OFF'
    },
    {
      id: 'desk_lamp',
      name: 'Desk Bulb',
      type: 'dimmer',
      icon: '🏮',
      topic: 'desk_bulb',
      powerState: 'OFF',
      brightness: 100
    },
    {
      id: 'ceiling_fan',
      name: 'Ceiling Fan',
      type: 'fan',
      icon: '💨',
      topic: 'ceiling_fan',
      powerState: 'OFF',
      speed: 1 // 1 to 4
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
      wolDeviceTopic: 'room_light', // Tasmota device that broadcasts the WoL packet
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
