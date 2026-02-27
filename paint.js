/**
 * PaintLayer — HyperCard PWA
 * Provides a per-card HTML5 canvas paint surface with:
 * pencil, spray, fill (flood), eraser, line, rect, ellipse tools,
 * a color picker, adjustable brush size, and 7 texture modes.
 */
export class PaintLayer {
    constructor(app) {
        this.app = app;
        this.color = '#000000';
        this.bgColor = '#ffffff';
        this.size = 6;
        this.texture = 'solid'; // solid | checker | hlines | vlines | dots | stripes | crosshatch
        this._tool = null;
        this._canvas = null;
        this._ctx = null;
        this._painting = false;
        this._lastPos = null;
        this._startPos = null;
        this._previewSnap = null; // ImageData before shape preview
        this._sprayTimer = null;
        this._bound = { down: this._onDown.bind(this), move: this._onMove.bind(this), up: this._onUp.bind(this) };
    }

    /** Activate a paint tool by name. */
    activate(toolName) {
        this._tool = toolName;
        this._ensureCanvas();
        this._enableEvents();
        if (this._canvas) this._canvas.style.cursor = this._cursor();
    }

    /** Deactivate all paint tools (switch back to browse/edit). */
    deactivate() {
        this._disableEvents();
        this._save();
        this._tool = null;
        if (this._canvas) this._canvas.style.pointerEvents = 'none';
    }

    /** Load (or clear) the paint layer for the current card. */
    loadCard() {
        this._ensureCanvas();
        if (!this._canvas) return;
        const { width, height } = this.app.state.stack.cardSize;
        this._ctx.clearRect(0, 0, width, height);
        const paintLayer = this.app.state.currentCard?.paintLayer;
        if (paintLayer) {
            const img = new Image();
            img.onload = () => this._ctx.drawImage(img, 0, 0);
            img.src = paintLayer;
        }
    }

    clearCard() {
        if (!this._ctx) return;
        const { width, height } = this.app.state.stack.cardSize;
        this._ctx.clearRect(0, 0, width, height);
        this._save();
    }

    // ── Canvas lifecycle ─────────────────────────────────────────────────────────
    _ensureCanvas() {
        const host = document.getElementById('card-canvas');
        if (!host || !this.app.state.stack) return;
        const { width, height } = this.app.state.stack.cardSize;

        let canvas = document.getElementById('paint-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'paint-canvas';
            Object.assign(canvas.style, {
                position: 'absolute', left: '0', top: '0', zIndex: '5', pointerEvents: 'none',
            });
            host.insertBefore(canvas, host.firstChild);
        }
        // Always sync size (card size may have changed)
        if (canvas.width !== width || canvas.height !== height) {
            // Preserve existing pixels
            const snap = canvas.width > 0 ? canvas.toDataURL() : null;
            canvas.width = width; canvas.height = height;
            canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
            if (snap) { const img = new Image(); img.onload = () => this._ctx?.drawImage(img, 0, 0); img.src = snap; }
        }
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
    }

    _enableEvents() {
        if (!this._canvas) return;
        this._canvas.style.pointerEvents = 'all';
        this._canvas.addEventListener('mousedown', this._bound.down);
        this._canvas.addEventListener('mousemove', this._bound.move);
        this._canvas.addEventListener('mouseup', this._bound.up);
        this._canvas.addEventListener('mouseleave', this._bound.up);
    }

    _disableEvents() {
        if (!this._canvas) return;
        this._canvas.removeEventListener('mousedown', this._bound.down);
        this._canvas.removeEventListener('mousemove', this._bound.move);
        this._canvas.removeEventListener('mouseup', this._bound.up);
        this._canvas.removeEventListener('mouseleave', this._bound.up);
    }

    _pos(e) {
        const r = this._canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _cursor() {
        return {
            pencil: 'crosshair', spray: 'crosshair', fill: 'cell', eraser: 'cell',
            line: 'crosshair', rect: 'crosshair', ellipse: 'crosshair'
        }[this._tool] || 'crosshair';
    }

    // ── Event handlers ───────────────────────────────────────────────────────────
    _onDown(e) {
        e.stopPropagation();
        this._painting = true;
        const pos = this._pos(e);
        this._lastPos = pos; this._startPos = pos;

        if (this._tool === 'fill') {
            this._floodFill(pos.x, pos.y);
            this._painting = false;
            this._save();
            return;
        }
        if (this._tool === 'pencil' || this._tool === 'eraser') {
            this._applyStyle();
            this._ctx.beginPath(); this._ctx.moveTo(pos.x, pos.y);
            this._drawDot(pos.x, pos.y);
        }
        if (this._tool === 'spray') {
            this._sprayAt(pos);
            this._sprayTimer = setInterval(() => this._sprayAt(this._lastPos || pos), 40);
        }
        if (['line', 'rect', 'ellipse'].includes(this._tool)) {
            this._previewSnap = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
        }
    }

    _onMove(e) {
        if (!this._painting) return;
        const pos = this._pos(e);
        if (this._tool === 'pencil' || this._tool === 'eraser') {
            this._drawSegment(this._lastPos, pos);
        }
        if (this._tool === 'spray') { this._lastPos = pos; }
        if (this._tool === 'line') this._previewLine(pos);
        if (this._tool === 'rect') this._previewRect(pos);
        if (this._tool === 'ellipse') this._previewEllipse(pos);
        this._lastPos = pos;
    }

    _onUp(e) {
        if (!this._painting) return;
        this._painting = false;
        clearInterval(this._sprayTimer); this._sprayTimer = null;
        if (this._previewSnap) {
            const pos = this._pos(e);
            if (this._tool === 'line') this._commitLine(pos);
            if (this._tool === 'rect') this._commitRect(pos);
            if (this._tool === 'ellipse') this._commitEllipse(pos);
            this._previewSnap = null;
        }
        this._save();
    }

    // ── Drawing primitives ───────────────────────────────────────────────────────
    _applyStyle(erase = false) {
        const ctx = this._ctx;
        if (erase) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            const pat = this._makePattern();
            ctx.strokeStyle = ctx.fillStyle = pat || this.color;
        }
        ctx.lineWidth = this.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }

    _drawDot(x, y) {
        const erase = this._tool === 'eraser';
        this._applyStyle(erase);
        this._ctx.beginPath();
        this._ctx.arc(x, y, Math.max(1, this.size / 2), 0, Math.PI * 2);
        this._ctx.fill();
    }

    _drawSegment(from, to) {
        const erase = this._tool === 'eraser';
        this._applyStyle(erase);
        this._ctx.beginPath();
        this._ctx.moveTo(from.x, from.y);
        this._ctx.lineTo(to.x, to.y);
        this._ctx.stroke();
    }

    _sprayAt(pos) {
        this._applyStyle(false);
        const density = 25, radius = this.size * 4;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            this._ctx.beginPath();
            this._ctx.arc(pos.x + Math.cos(angle) * r, pos.y + Math.sin(angle) * r, 0.9, 0, Math.PI * 2);
            this._ctx.fill();
        }
    }

    _previewLine(to) {
        this._ctx.putImageData(this._previewSnap, 0, 0);
        this._applyStyle(false);
        this._ctx.beginPath();
        this._ctx.moveTo(this._startPos.x, this._startPos.y);
        this._ctx.lineTo(to.x, to.y);
        this._ctx.stroke();
    }
    _commitLine(to) { this._previewLine(to); }

    _previewRect(to) {
        this._ctx.putImageData(this._previewSnap, 0, 0);
        this._applyStyle(false);
        const { x: x1, y: y1 } = this._startPos;
        const x = Math.min(x1, to.x), y = Math.min(y1, to.y);
        const w = Math.abs(to.x - x1), h = Math.abs(to.y - y1);
        this._ctx.strokeRect(x, y, w, h);
    }
    _commitRect(to) { this._previewRect(to); }

    _previewEllipse(to) {
        this._ctx.putImageData(this._previewSnap, 0, 0);
        this._applyStyle(false);
        const rx = Math.abs(to.x - this._startPos.x) / 2 || 1;
        const ry = Math.abs(to.y - this._startPos.y) / 2 || 1;
        const cx = (this._startPos.x + to.x) / 2, cy = (this._startPos.y + to.y) / 2;
        this._ctx.beginPath(); this._ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); this._ctx.stroke();
    }
    _commitEllipse(to) { this._previewEllipse(to); }

    // ── Flood fill ───────────────────────────────────────────────────────────────
    _floodFill(fx, fy) {
        const { width: w, height: h } = this._canvas;
        const imageData = this._ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const px = Math.max(0, Math.min(w - 1, Math.floor(fx)));
        const py = Math.max(0, Math.min(h - 1, Math.floor(fy)));
        const si = (py * w + px) * 4;
        const sr = data[si], sg = data[si + 1], sb = data[si + 2], sa = data[si + 3];

        const fill = this._hexToRGB(this.color);
        if (fill.r === sr && fill.g === sg && fill.b === sb && sa === 255) return;

        const tol = 18;
        const matches = (i) =>
            Math.abs(data[i] - sr) <= tol &&
            Math.abs(data[i + 1] - sg) <= tol &&
            Math.abs(data[i + 2] - sb) <= tol &&
            (sa < 8 ? data[i + 3] < 8 : Math.abs(data[i + 3] - sa) <= tol);

        const visited = new Uint8Array(w * h);
        const queue = [px + py * w];
        visited[queue[0]] = 1;

        while (queue.length) {
            const p = queue.pop();
            const x = p % w, y = Math.floor(p / w);
            const i = p * 4;
            // Apply texture at this pixel
            if (this.texture === 'solid' || this._texAt(x, y)) {
                data[i] = fill.r; data[i + 1] = fill.g; data[i + 2] = fill.b; data[i + 3] = 255;
            }
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const np = ny * w + nx;
                if (!visited[np] && matches(np * 4)) { visited[np] = 1; queue.push(np); }
            }
        }
        this._ctx.putImageData(imageData, 0, 0);
    }

    // ── Texture pattern ──────────────────────────────────────────────────────────
    _texAt(x, y) {
        switch (this.texture) {
            case 'checker': return (Math.floor(x / 5) + Math.floor(y / 5)) % 2 === 0;
            case 'hlines': return y % 5 < 2;
            case 'vlines': return x % 5 < 2;
            case 'dots': return x % 7 === 0 && y % 7 === 0;
            case 'stripes': return (x + y) % 5 < 2;
            case 'crosshatch': return x % 7 === 0 || y % 7 === 0;
            default: return true;
        }
    }

    _makePattern() {
        if (this.texture === 'solid') return null;
        const sz = 8;
        const pc = document.createElement('canvas'); pc.width = sz; pc.height = sz;
        const px = pc.getContext('2d');
        px.fillStyle = this.bgColor;
        px.fillRect(0, 0, sz, sz);
        px.fillStyle = this.color;
        for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++)
            if (this._texAt(x, y)) px.fillRect(x, y, 1, 1);
        return this._ctx.createPattern(pc, 'repeat');
    }

    // ── Swatch Preview ────────────────────────────────────────────────────────
    getPreviewURL() {
        const sz = 16;
        const pc = document.createElement('canvas'); pc.width = sz; pc.height = sz;
        const px = pc.getContext('2d');
        if (this.texture === 'solid') {
            px.fillStyle = this.color;
            px.fillRect(0, 0, sz, sz);
        } else {
            px.fillStyle = this.bgColor;
            px.fillRect(0, 0, sz, sz);
            px.fillStyle = this.color;
            for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++)
                if (this._texAt(x, y)) px.fillRect(x, y, 1, 1);
        }
        return pc.toDataURL();
    }

    // ── Serialise ────────────────────────────────────────────────────────────────
    _save() {
        const card = this.app.state.currentCard;
        if (!card || !this._canvas) return;
        const d = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height).data;
        card.paintLayer = d.some(v => v !== 0) ? this._canvas.toDataURL() : null;
        this.app.scheduleAutoSave();
    }

    _hexToRGB(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
        };
    }
}
