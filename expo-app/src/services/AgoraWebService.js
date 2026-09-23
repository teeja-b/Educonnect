import AgoraRTC from 'agora-rtc-sdk-ng';

let client = null;
let localAudioTrack = null;
let localVideoTrack = null;

const AgoraWebService = {

  // ─── Initialize the client ───────────────────────────────────────────────
  init(appId) {
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    AgoraRTC.setLogLevel(4); // 0=DEBUG ... 4=NONE
    return client;
  },

  // ─── Join a channel ───────────────────────────────────────────────────────
  async join(appId, channel, token, uid = null) {
    if (!client) this.init(appId);
    const userId = await client.join(appId, channel, token, uid);
    return userId;
  },

  // ─── Publish audio + video ────────────────────────────────────────────────
  async publishVideoAndAudio() {
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    await client.publish([localAudioTrack, localVideoTrack]);
    return { localAudioTrack, localVideoTrack };
  },

  // ─── Publish audio only (voice call) ─────────────────────────────────────
  async publishAudioOnly() {
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);
    return { localAudioTrack };
  },

  // ─── Play remote user's video into a DOM element ──────────────────────────
  playRemoteVideo(user, elementId) {
    if (user.videoTrack) {
      user.videoTrack.play(elementId); // elementId = div id in your HTML
    }
  },

  // ─── Mute / unmute local audio ────────────────────────────────────────────
  async muteAudio(mute) {
    if (localAudioTrack) await localAudioTrack.setEnabled(!mute);
  },

  // ─── Mute / unmute local video ────────────────────────────────────────────
  async muteVideo(mute) {
    if (localVideoTrack) await localVideoTrack.setEnabled(!mute);
  },

  // ─── Leave channel & clean up ─────────────────────────────────────────────
  async leave() {
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
    localAudioTrack = null;
    localVideoTrack = null;
    if (client) await client.leave();
  },

  // ─── Subscribe to remote user events ─────────────────────────────────────
  on(event, callback) {
    if (client) client.on(event, callback);
  },

  off(event, callback) {
    if (client) client.off(event, callback);
  },

  getClient() {
    return client;
  },
};

export default AgoraWebService;