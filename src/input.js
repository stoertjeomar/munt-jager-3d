// Houdt bij welke toetsen op dit moment ingedrukt zijn (en hoe lang).
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Map(); // toets → hoe lang hij ingedrukt was (seconden)
    this.downSince = new Map();

    window.addEventListener('keydown', (e) => {
      // Voorkom dat spatie/pijltjes/Tab de pagina laten scrollen of wisselen
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) {
        this.pressedThisFrame.add(e.code);
        this.downSince.set(e.code, performance.now());
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const since = this.downSince.get(e.code);
      if (since !== undefined) this.releasedThisFrame.set(e.code, (performance.now() - since) / 1000);
      this.downSince.delete(e.code);
    });

    // Als het venster focus verliest: alle toetsen loslaten
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.downSince.clear();
    });
  }

  /** Is (een van) deze toets(en) ingedrukt? */
  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** Hoe lang is deze toets al ingedrukt (seconden)? 0 als hij niet ingedrukt is. */
  heldFor(code) {
    const since = this.downSince.get(code);
    return since === undefined ? 0 : (performance.now() - since) / 1000;
  }

  /** Is deze toets net (deze frame) ingedrukt? */
  wasPressed(code) {
    return this.pressedThisFrame.has(code);
  }

  /** Is deze toets net losgelaten? Geeft dan terug hoe lang hij ingedrukt was, anders null. */
  wasReleased(code) {
    return this.releasedThisFrame.has(code) ? this.releasedThisFrame.get(code) : null;
  }

  /** Aanroepen aan het einde van elke frame. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }
}
