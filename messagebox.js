/**
 * Message Box — HyperCard PWA
 * A floating input window for evaluating HyperCode/JS commands and expressions.
 */
export class MessageBox {
    constructor(app) {
        this.app = app;
        this._el = null;
        this._visible = false;
    }

    init() {
        const el = document.getElementById('message-box');
        this._el = el;
        el.innerHTML = `
      <div class="windoid-title" id="msgbox-drag">
        <span class="windoid-close" style="float:left;width:11px;height:11px;border:1px solid #000;margin:1px 0 0 0px;cursor:pointer;background:#fff;" title="Close"></span>
        Message
      </div>
      <div class="msgbox-inner">
        <input id="msgbox-input" type="text" class="msgbox-input" placeholder="Type command…" autocomplete="off" spellcheck="false">
        <div id="msgbox-output" class="msgbox-output"></div>
      </div>`;

        const input = el.querySelector('#msgbox-input');
        input.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            await this._run(text);
        });

        this.app.ui._makeDraggable(el, el.querySelector('#msgbox-drag'));
        el.querySelector('.windoid-close').addEventListener('click', () => this.hide());
        // Hidden by default
        el.style.display = 'none';
    }

    toggle() {
        if (this._el.style.display === 'none') this.show();
        else this.hide();
    }

    show() {
        this._visible = true;
        this._el.style.display = 'block';
        this._el.querySelector('#msgbox-input').focus();
        this.app.ui._updateMenuLabels();
    }

    hide() {
        this._visible = false;
        this._el.style.display = 'none';
        this.app.ui._updateMenuLabels();
    }

    async _run(text) {
        const output = this._el.querySelector('#msgbox-output');
        output.textContent = '…';
        try {
            // If it looks like an expression, evaluate it; otherwise execute as command(s)
            const isExpr = /^(the\s|it$|\d|"[^"]*"|'[^']*')/.test(text) || /[+\-*/&]/.test(text);
            let result;
            if (isExpr) {
                result = await this.app.engine.eval(text);
            } else {
                await this.app.engine.exec(text);
                result = this.app.state.it || '(done)';
            }
            output.textContent = String(result);
            output.style.color = '#000';
        } catch (e) {
            output.textContent = '⚠ ' + e.message;
            output.style.color = '#cc0000';
        }
    }
}
