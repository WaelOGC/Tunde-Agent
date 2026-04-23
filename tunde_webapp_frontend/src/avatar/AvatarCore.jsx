import React, { useState, useCallback } from "react";
import {
  AVATAR_MODES,
  AVATAR_STATES,
  createAvatarState,
} from "./AvatarStateManager";

import AvatarMini from "./AvatarMini";
import AvatarExpanded from "./AvatarExpanded";

export default function AvatarCore() {
  const [avatar, setAvatar] = useState(createAvatarState());

  const setMode = useCallback((mode) => {
    setAvatar((prev) => ({ ...prev, mode }));
  }, []);

  const setState = useCallback((state) => {
    setAvatar((prev) => ({ ...prev, state }));
  }, []);

  const startListening = () => {
    setMode(AVATAR_MODES.EXPANDED);
    setState(AVATAR_STATES.LISTENING);
    setAvatar((prev) => ({ ...prev, isVoiceActive: true }));
  };

  const startThinking = () => {
    setState(AVATAR_STATES.THINKING);
  };

  const startSpeaking = () => {
    setMode(AVATAR_MODES.EXPANDED);
    setState(AVATAR_STATES.SPEAKING);
  };

  const stopVoice = () => {
    setAvatar((prev) => ({
      ...prev,
      isVoiceActive: false,
      state: AVATAR_STATES.IDLE,
      mode: AVATAR_MODES.MINI,
    }));
  };

  return (
    <>
      {/* Mini Avatar */}
      {avatar.mode === AVATAR_MODES.MINI && (
        <AvatarMini state={avatar.state} />
      )}

      {/* Expanded Avatar */}
      {avatar.mode === AVATAR_MODES.EXPANDED && (
        <AvatarExpanded
          state={avatar.state}
          onClose={stopVoice}
        />
      )}
    </>
  );
}