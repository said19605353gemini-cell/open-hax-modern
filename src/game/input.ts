import { INPUT_DOWN, INPUT_KICK, INPUT_LEFT, INPUT_RIGHT, INPUT_UP } from '../types';

const PREVENT_SCROLL_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) {
    return false;
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export class InputController {
  private keys = new Set<string>();
  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown, false);
    window.addEventListener('keyup', this.onKeyUp, false);
    window.addEventListener('blur', this.onBlur, false);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown, false);
    window.removeEventListener('keyup', this.onKeyUp, false);
    window.removeEventListener('blur', this.onBlur, false);
    this.keys.clear();
  }

  clear(): void {
    this.keys.clear();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isEditable(document.activeElement) || isEditable(e.target)) {
      this.keys.clear();
      return;
    }
    if (PREVENT_SCROLL_CODES.has(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  getSingleInputBits(): number {
    let bits = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) bits |= INPUT_UP;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) bits |= INPUT_DOWN;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) bits |= INPUT_LEFT;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) bits |= INPUT_RIGHT;
    if (
      this.keys.has('KeyX') ||
      this.keys.has('Space') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight')
    ) {
      bits |= INPUT_KICK;
    }
    return bits;
  }

  getLocalP1WasdBits(): number {
    let bits = 0;
    if (this.keys.has('KeyW')) bits |= INPUT_UP;
    if (this.keys.has('KeyS')) bits |= INPUT_DOWN;
    if (this.keys.has('KeyA')) bits |= INPUT_LEFT;
    if (this.keys.has('KeyD')) bits |= INPUT_RIGHT;
    if (this.keys.has('Space') || this.keys.has('KeyV') || this.keys.has('KeyF')) {
      bits |= INPUT_KICK;
    }
    return bits;
  }

  getLocalP2ArrowBits(): number {
    let bits = 0;
    if (this.keys.has('ArrowUp')) bits |= INPUT_UP;
    if (this.keys.has('ArrowDown')) bits |= INPUT_DOWN;
    if (this.keys.has('ArrowLeft')) bits |= INPUT_LEFT;
    if (this.keys.has('ArrowRight')) bits |= INPUT_RIGHT;
    if (this.keys.has('KeyX') || this.keys.has('Enter') || this.keys.has('ShiftRight')) {
      bits |= INPUT_KICK;
    }
    return bits;
  }
}
