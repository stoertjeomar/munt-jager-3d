// Houdt bij welke toetsen op dit moment ingedrukt zijn.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedThisFrame = new Set();

    window.addEventListener('keydown', (e) => {
      // Voorkom dat spatie/pijltjes de pagina laten scrollen
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressedThisFrame.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Als het venster focus verliest: alle toetsen loslaten
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Is (een van) deze toets(en) ingedrukt? */
  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** Is deze toets net (deze frame) ingedrukt? */
  wasPressed(code) {
    return this.pressedThisFrame.has(code);
  }

  /** Aanroepen aan het einde van elke frame. */
  endFrame() {
    this.pressedThisFrame.clear();
  }
}
