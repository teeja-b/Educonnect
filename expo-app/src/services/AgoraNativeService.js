import { ChannelProfileType, ClientRoleType, createAgoraRtcEngine } from 'react-native-agora';

let engine = null;

const AgoraNativeService = {
  init(appId) {
    engine = createAgoraRtcEngine();
    engine.initialize({
      appId,
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
    });
    engine.enableAudio();
    engine.enableVideo();
    return engine;
  },

  async join(appId, channel, token, uid = 0) {
    if (!engine) this.init(appId);
    engine.joinChannel(token, channel, uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });
  },

  async publishAudioOnly() {
    engine?.muteLocalVideoStream(true);
  },

  async muteAudio(mute) {
    engine?.muteLocalAudioStream(mute);
  },

  async muteVideo(mute) {
    engine?.muteLocalVideoStream(mute);
  },

  async leave() {
    engine?.leaveChannel();
  },

  on(event, callback) {
    engine?.addListener(event, callback);
  },

  off(event, callback) {
    engine?.removeListener(event, callback);
  },

  getEngine() {
    return engine;
  },
};

export default AgoraNativeService;