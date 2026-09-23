import { Platform } from 'react-native';

let agoraService;

if (Platform.OS === 'web') {
  agoraService = require('./AgoraWebService').default;
} else {
  agoraService = require('./AgoraNativeService').default;
}

export default agoraService;