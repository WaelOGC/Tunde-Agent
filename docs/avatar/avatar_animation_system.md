# 🎭 Avatar Animation System — Specification (V1)

## 1. Overview
Defines how the Avatar moves, reacts, and behaves in real-time.

Goal:
Create a calm, responsive, emotionally present digital entity.

---

## 2. State Model

The Avatar operates using a state-based system.

Main States:
- IDLE
- LISTENING
- THINKING
- SPEAKING
- REACT (optional)

State Priority:
SPEAKING > LISTENING > THINKING > IDLE

Transitions must be smooth and immediate when required.

---

## 3. Global Behavior Rules

- Motion must be subtle, never exaggerated
- Transitions must be smooth (no hard cuts)
- Avatar must never feel static
- Emotional presence is more important than motion complexity

---

## 4. Base Motion Layer (Always Active)

### Breathing
- Slow and subtle
- Cycle duration: 4–6 seconds
- Very low amplitude

### Blinking
- Interval: 2–5 seconds (randomized)
- Duration: 120–180 ms
- Occasional double blink

### Micro Head Movement
- Slight natural drift
- Range: very small (1–2 degrees)

---

## 5. State Definitions

### 5.1 IDLE

Purpose:
Default calm state

Behavior:
- Breathing active
- Blinking active
- Minimal head movement
- Neutral expression

---

### 5.2 LISTENING

Trigger:
User speaking

Behavior:
- Slight head tilt
- Focused eye contact
- Occasional micro nod
- Reduced blinking frequency

Feeling:
“I am listening”

---

### 5.3 THINKING

Trigger:
System processing response

Behavior:
- Slight eye movement (micro shifts)
- Reduced head movement
- Slight pause before response
- Subtle internal focus

---

### 5.4 SPEAKING

Trigger:
System starts voice output

Behavior:
- Lip sync aligned with speech
- Controlled head movement
- Stable eye contact
- Expression depends on tone

Tone Mapping:
- Calm → neutral expression
- Reassuring → soft smile
- Informative → focused look
- Positive → light smile

---

### 5.5 REACT (Optional)

Trigger:
Emotional context detected

Behavior:
- Softer expression
- Slight head tilt
- Slower motion
- Increased presence

Use only when meaningful

---

## 6. Transitions

Rules:
- No abrupt changes
- Smooth blending required
- Transition duration: 150–300 ms

Examples:
- LISTENING → THINKING: reduce head tilt
- THINKING → SPEAKING: refocus eyes forward

---

## 7. Voice Synchronization

Input:
- TTS audio
- Optional emotion tag

Mapping:
- Higher volume → slight visual intensity increase
- Pause → micro stillness
- Soft tone → relaxed expression
- Emphasis → slight head movement

---

## 8. Timing Constraints

- Response start: < 500 ms
- Lip sync delay: < 100 ms
- State switch: near-instant

---

## 9. Performance Guidelines

- Target 60 FPS
- Avoid heavy effects
- Keep calculations lightweight
- Optimize all animations

---

## 10. Implementation Notes

Recommended stack:
- React
- Three.js or React Three Fiber
- Web Audio API

Facial system:
- Morph targets (blendshapes)

---

## 11. Rules

DO NOT:
- Over-animate
- Use robotic timing
- Add excessive effects

ALWAYS:
- Maintain calm presence
- Keep movements minimal
- Preserve emotional consistency

---

## 12. Final Principle

The Avatar should not feel animated.
It should feel present.