import { state } from '../state.js';

// Tastiera (WASD / frecce) e joystick touch dinamico.
// Scrivono entrambi in state.input.forward / state.input.right (-1..1).

const JOYSTICK_RADIUS = 40;

const KEY_MAP = {
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};

const keys = { up: false, down: false, left: false, right: false };
let joystickTouchId = null;
let joystickOrigin = { x: 0, y: 0 };

const anyKeyDown = () => keys.up || keys.down || keys.left || keys.right;

export function initInput() {
  initKeyboard();
  initJoystick();
}

function initKeyboard() {
  const onKey = (pressed) => (e) => {
    const dir = KEY_MAP[e.key.toLowerCase()];
    if (!dir) return;
    keys[dir] = pressed;
    applyKeyboard();
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
}

function applyKeyboard() {
  const forward = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  const right = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  if (forward !== 0 || right !== 0) {
    state.input.forward = forward;
    state.input.right = right;
  } else if (joystickTouchId === null) {
    state.input.forward = 0;
    state.input.right = 0;
  }
}

function initJoystick() {
  const zone = document.getElementById('left-touch-zone');
  const base = document.getElementById('dynamic-joystick');
  const knob = document.getElementById('joystick-knob');

  zone.addEventListener('touchstart', (e) => {
    for (const touch of e.changedTouches) {
      if (joystickTouchId !== null) break;
      joystickTouchId = touch.identifier;
      joystickOrigin = { x: touch.clientX, y: touch.clientY };
      base.style.left = `${touch.clientX}px`;
      base.style.top = `${touch.clientY}px`;
      base.style.display = 'block';
    }
  });

  zone.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== joystickTouchId) continue;
      let dx = touch.clientX - joystickOrigin.x;
      let dy = touch.clientY - joystickOrigin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      state.input.right = dx / JOYSTICK_RADIUS;
      state.input.forward = -dy / JOYSTICK_RADIUS;
    }
  });

  const release = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== joystickTouchId) continue;
      joystickTouchId = null;
      if (!anyKeyDown()) {
        state.input.forward = 0;
        state.input.right = 0;
      }
      knob.style.transform = 'translate(-50%, -50%)';
      base.style.display = 'none';
    }
  };
  zone.addEventListener('touchend', release);
  zone.addEventListener('touchcancel', release);
}
