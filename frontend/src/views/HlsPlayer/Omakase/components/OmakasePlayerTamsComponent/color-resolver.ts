export class ColorResolver {
  private _index = 0;

  constructor(private _colors: string[]) {}

  get color() {
    if (this._index === this._colors.length) {
      this._index = 0;
    }

    const chosenColor = this._colors[this._index];
    this._index++;

    return chosenColor;
  }
}
