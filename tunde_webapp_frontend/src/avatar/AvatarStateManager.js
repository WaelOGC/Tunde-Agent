export const AVATAR_MODES = {
  MINI: "MINI",
  EXPANDED: "EXPANDED",
};

export const AVATAR_STATES = {
  IDLE: "IDLE",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  SPEAKING: "SPEAKING",
};

export const createAvatarState = () => {
  return {
    mode: AVATAR_MODES.MINI,
    state: AVATAR_STATES.IDLE,
    isVoiceActive: false,
  };
};
